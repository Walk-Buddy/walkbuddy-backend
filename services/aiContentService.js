const pool = require('../config/db');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const axios = require('axios');
const odiiService = require('./odiiService');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

async function generateTTS(text) {
  const response = await axios.post(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${process.env.GOOGLE_TTS_API_KEY}`,
    {
      input: { text },
      voice: { languageCode: 'ko-KR', name: 'ko-KR-Neural2-A' },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: 0.98,
        pitch: 0.0,
      },
    }
  );
  return Buffer.from(response.data.audioContent, 'base64');
}

async function uploadToS3(audioBuffer, spotId, contentType) {
  const key = `tts/${spotId}/${contentType}.mp3`;
  await s3.send(new PutObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: key,
    Body: audioBuffer,
    ContentType: 'audio/mpeg',
  }));
  return `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
}

function extractBarrierFreeTip(barrierFreeInfo) {
  if (!barrierFreeInfo) return null;
  try {
    const details = typeof barrierFreeInfo === 'string' ? JSON.parse(barrierFreeInfo) : barrierFreeInfo;
    const tips = [];
    if (details?.physical?.entrance) tips.push(`출입구: ${details.physical.entrance}`);
    if (details?.physical?.elevator) tips.push(`엘리베이터: ${details.physical.elevator}`);
    if (details?.visual?.brailleBlock) tips.push(`점자블록: ${details.visual.brailleBlock}`);
    if (tips.length === 0) return null;
    return tips.slice(0, 2).join(', ');
  } catch (_) {
    return null;
  }
}

async function getAiContentsByTypes(spotId, contentTypes = ['place', 'history', 'tour']) {
  const { rows: spotRows } = await pool.query(
    `SELECT name, address, ST_X(location::geometry) AS x, ST_Y(location::geometry) AS y,
            content_place, content_history, content_tour, barrier_free_info
     FROM spots WHERE spot_id = $1 AND status = 'active'`,
    [spotId]
  );
  if (!spotRows.length) {
    const err = new Error('스팟을 찾을 수 없습니다.');
    err.status = 404; throw err;
  }
  const spot = spotRows[0];

  const typeMap = {
    place:   { label: '장소 안내',  source: spot.content_place   },
    history: { label: '역사 해설',  source: spot.content_history },
    tour:    { label: '관광 안내',  source: spot.content_tour    },
  };

  const selectedContentTypes = [...new Set(contentTypes.map((type) => String(type).trim()))];
  for (const contentType of selectedContentTypes) {
    if (!typeMap[contentType]) {
      const err = new Error('content_type은 place, history, tour 중 하나여야 합니다.');
      err.status = 400; throw err;
    }
  }

  const contents = [];
  let odiiGuideSearched = false;
  let odiiGuideResult = null;

  for (const contentType of selectedContentTypes) {
    const { label, source } = typeMap[contentType];

    // 1단계: DB 캐시 확인
    const { rows: cached } = await pool.query(
      `SELECT content_type, script, audio_url
       FROM spot_ai_contents WHERE spot_id = $1 AND content_type = $2`,
      [spotId, contentType]
    );

    if (cached.length && cached[0].audio_url) {
      contents.push(cached[0]);
      continue;
    }

    // 2단계: 한국관광공사 Odii 오디오 가이드 검색 (tour 테마에만 1순위 적용)
    if (contentType === 'tour') {
      if (!odiiGuideSearched) {
        odiiGuideSearched = true;
        odiiGuideResult = await odiiService.findBestOdiiGuide({
          name: spot.name,
          x: spot.x,
          y: spot.y,
        });
      }

      // Odii 가이드가 존재하면 해당 전문 성우 음성 및 대본을 DB에 캐싱하고 사용
      if (odiiGuideResult && odiiGuideResult.audio_url) {
        const scriptText = odiiGuideResult.script || `${spot.name} ${label}`;
        const { rows: [saved] } = await pool.query(
          `INSERT INTO spot_ai_contents (spot_id, content_type, script, audio_url)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (spot_id, content_type) DO UPDATE
             SET script = EXCLUDED.script, audio_url = EXCLUDED.audio_url, updated_at = NOW()
           RETURNING content_type, script, audio_url`,
          [spotId, contentType, scriptText, odiiGuideResult.audio_url]
        );
        contents.push(saved);
        continue;
      }
    }

    // 3단계: Odii 데이터가 없거나 place/history인 경우 스마트 크로스 참조 폴백 + Gemini AI + Neural2 TTS + S3
    let primarySource = source;
    let isCrossReferenced = false;

    if (!primarySource) {
      const fallbackSources = [];
      if (spot.content_tour && contentType !== 'tour') {
        fallbackSources.push(`[관광/스토리 정보]\n${spot.content_tour}`);
      }
      if (spot.content_history && contentType !== 'history') {
        fallbackSources.push(`[역사 정보]\n${spot.content_history}`);
      }
      if (spot.content_place && contentType !== 'place') {
        fallbackSources.push(`[장소 정보]\n${spot.content_place}`);
      }

      if (fallbackSources.length > 0) {
        primarySource = fallbackSources.join('\n\n');
        isCrossReferenced = true;
      }
    }

    const barrierFreeTip = extractBarrierFreeTip(spot.barrier_free_info);
    const sourceText = primarySource
      ? `참고 정보:\n${primarySource}`
      : `이 장소에 대한 추가 정보는 없습니다. 장소명과 주소를 바탕으로 작성해주세요.`;

    const prompt = `
당신은 도보 산책 앱 '길봄'의 전문 AI 오디오 도슨트입니다.
제공된 정보를 바탕으로 산책자가 현장에서 들을 수 있는 친근하고 생생한 ${label}(${contentType}) 음성 해설 대본을 작성해주세요.

[장소 정보]
- 장소명: ${spot.name}
- 주소: ${spot.address || ''}

${sourceText}
${barrierFreeTip ? `\n[보행 환경 편의 정보]\n${barrierFreeTip}` : ''}

[작성 가이드라인]
1. 분량: 천천히 읽었을 때 약 45초~60초 (공백 포함 180~220자 내외).
2. 어조: 다정하고 부드러운 구어체 ("지금 걷고 계신", "주변을 둘러보시면").
3. 테마 집중:
${contentType === 'history' ? '   - 역사적 사건, 명소의 유래, 건립 배경 스토리에 집중하세요.' : ''}
${contentType === 'place'   ? '   - 현재 공간의 산책 분위기, 걷기 좋은 포인트, 시설 환경에 집중하세요.' : ''}
${contentType === 'tour'    ? '   - 주변 관광 연계 포인트, 볼거리와 즐길거리에 집중하세요.' : ''}
${isCrossReferenced ? '   - 제공된 참고 정보를 바탕으로 위 테마 관점에 맞추어 자연스럽게 재구성하세요.' : ''}
${barrierFreeTip ? '4. 해설 끝부분에 보행 환경 편의 정보(경사로, 턱 유무 등)를 자연스럽게 한 문장 덧붙여주세요.' : ''}
5. 문장은 완전한 마침표로 맺어주세요.
    `.trim();

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(prompt);
    const script = result.response.text().trim();

    // Google Neural2 TTS로 mp3 생성
    const audioBuffer = await generateTTS(script);

    // S3 업로드
    const audioUrl = await uploadToS3(audioBuffer, spotId, contentType);

    // DB 저장
    const { rows: [saved] } = await pool.query(
      `INSERT INTO spot_ai_contents (spot_id, content_type, script, audio_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (spot_id, content_type) DO UPDATE
         SET script = EXCLUDED.script, audio_url = EXCLUDED.audio_url, updated_at = NOW()
       RETURNING content_type, script, audio_url`,
      [spotId, contentType, script, audioUrl]
    );

    contents.push(saved);
  }

  return { spot_id: spotId, contents };
}

/**
 * 코스 내 경유지 스팟들의 음성 안내를 백그라운드에서 사전 생성 (0초 딜레이 Warm-up)
 */
async function prewarmCourseAudio(courseId) {
  const { rows: waypoints } = await pool.query(
    `SELECT DISTINCT spot_id FROM course_waypoints WHERE course_id = $1 AND spot_id IS NOT NULL`,
    [courseId]
  );

  if (!waypoints.length) {
    return { course_id: courseId, total_spots: 0, processed_spots: 0 };
  }

  const results = await Promise.allSettled(
    waypoints.map(w => getAiContentsByTypes(w.spot_id, ['place', 'history', 'tour']))
  );

  const processedCount = results.filter(r => r.status === 'fulfilled').length;
  return {
    course_id: courseId,
    total_spots: waypoints.length,
    processed_spots: processedCount,
  };
}

exports.getAiContents = async (spotId) => getAiContentsByTypes(spotId);
exports.getAiContentsByTypes = getAiContentsByTypes;
exports.prewarmCourseAudio = prewarmCourseAudio;

