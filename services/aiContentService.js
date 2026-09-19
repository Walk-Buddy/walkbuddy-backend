const pool = require('../config/db');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const s3 = require('../config/s3'); // 기본 자격증명 체인(EC2 IAM Role 등) 사용 — .env에 평문 키 저장 안 함
const axios = require('axios');
const odiiService = require('./odiiService');

const S3_BUCKET = process.env.S3_BUCKET_NAME;
// 예: https://<bucket>.s3.<region>.amazonaws.com/tts/<spotId>/place.mp3
const S3_URL_PATTERN = new RegExp(
  `^https?://${S3_BUCKET}\\.s3[.-][^/]+\\.amazonaws\\.com/(.+)$`
);

/** 재생 불가능한(더미/빈값) URL 판정 — 프론트 SpotAudioManager 와 동일 기준 */
function isValidAudioUrl(url) {
  return Boolean(url) && !String(url).includes('example.com');
}

/**
 * TTS 음성 URL을 앱에서 재생 가능한 형태로 변환한다.
 * - 자체 S3 버킷(private)에 올린 mp3는 "직접 URL"로 접근 시 403(AccessDenied) → 재생 안 됨.
 *   → 응답 직전에 1시간짜리 presigned URL로 변환한다. (기존 GET /api/upload/{key} 와 동일 정책)
 * - Odii(ktcdn.co.kr) 등 외부 공개 URL과 example.com 더미는 그대로 반환한다.
 */
async function toPlayableAudioUrl(rawUrl) {
  if (!rawUrl) return rawUrl;
  const url = String(rawUrl);
  if (url.includes('example.com')) return url; // 더미는 그대로

  const match = url.match(S3_URL_PATTERN);
  if (!match) return url; // 자체 S3가 아니면(Odii 등 공개 URL) 손대지 않음

  const key = match[1];
  try {
    const command = new GetObjectCommand({ Bucket: S3_BUCKET, Key: key });
    return await getSignedUrl(s3, command, { expiresIn: 3600 });
  } catch (err) {
    console.warn('[toPlayableAudioUrl] presigned URL 발급 실패:', err.message);
    return url; // 실패 시 원본 반환 (프론트 폴백)
  }
}

/** 콘텐츠 배열의 audio_url을 일괄 재생 가능한 URL로 변환 */
function signContents(contents) {
  return Promise.all(
    contents.map(async (c) =>
      c && c.audio_url ? { ...c, audio_url: await toPlayableAudioUrl(c.audio_url) } : c
    )
  );
}

/**
 * 다중 Gemini API 키 목록 파싱
 * - GEMINI_API_KEY (단일 또는 콤마로 여러 개 지원)
 * - GEMINI_API_KEY_2 (예비 키)
 * - GEMINI_API_KEYS (콤마 구분 다중 키 목록)
 */
function getGeminiApiKeys() {
  const rawKeys = [];
  if (process.env.GEMINI_API_KEY) {
    rawKeys.push(...process.env.GEMINI_API_KEY.split(','));
  }
  if (process.env.GEMINI_API_KEY_2) {
    rawKeys.push(process.env.GEMINI_API_KEY_2);
  }
  if (process.env.GEMINI_API_KEYS) {
    rawKeys.push(...process.env.GEMINI_API_KEYS.split(','));
  }

  const cleanKeys = rawKeys
    .map((k) => k && k.trim())
    .filter((k) => Boolean(k) && !k.startsWith('//') && !k.startsWith('#'));

  return [...new Set(cleanKeys)];
}

/**
 * 다중 키를 활용한 Gemini 대본 생성
 * 429(Rate Limit / Quota Exceeded) 또는 호출 실패 시 예비 키로 즉시 자동 전환
 */
async function generateContentWithFallback(prompt, modelName = 'gemini-2.5-flash') {
  const keys = getGeminiApiKeys();
  if (keys.length === 0) {
    throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.');
  }

  let lastError = null;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const keyLabel = `Gemini 키 #${i + 1}(...${key.slice(-4)})`;
    try {
      const client = new GoogleGenerativeAI(key);
      const model = client.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      return result.response.text().trim();
    } catch (err) {
      lastError = err;
      const isQuotaOrRateLimit =
        err.status === 429 ||
        err.message?.includes('429') ||
        err.message?.includes('RESOURCE_EXHAUSTED') ||
        err.message?.includes('quota') ||
        err.message?.includes('rate limit');

      if (i < keys.length - 1) {
        if (isQuotaOrRateLimit) {
          console.warn(`⚠️ [Gemini] ${keyLabel} 할당량 초과(429). 예비 키 #${i + 2}로 자동 전환하여 재시도합니다.`);
        } else {
          console.warn(`⚠️ [Gemini] ${keyLabel} 호출 실패 (${err.message}). 예비 키 #${i + 2}로 재시도합니다.`);
        }
        continue;
      }
    }
  }

  throw lastError;
}

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

            // 캐시 판정: audio_url이 "실제 재생 가능한" 경우에만 재사용한다.
    //   → example.com 더미나 빈 값은 캐시로 오인하지 않고 실제 TTS를 다시 생성한다.
    if (cached.length && isValidAudioUrl(cached[0].audio_url)) {
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

    const script = await generateContentWithFallback(prompt, 'gemini-2.5-flash');

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

  // 응답 직전: 자체 S3(private) mp3 → presigned URL 로 변환해 앱이 바로 재생할 수 있게 한다.
  const playableContents = await signContents(contents);
  return { spot_id: spotId, contents: playableContents };
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

