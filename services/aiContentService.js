const pool = require('../config/db');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const s3 = require('../config/s3'); // 기본 자격증명 체인(EC2 IAM Role 등) 사용 — .env에 평문 키 저장 안 함
const axios = require('axios');
const odiiService = require('./odiiService');
const tourApiService = require('./tourApiService');

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
 * 다중 SWU AI (MindLogic Gateway) API 키 목록 파싱
 * - SWU_AI_API_KEY (단일 또는 콤마로 여러 개 지원)
 * - SWU_AI_API_KEY_2 (예비 키)
 * - SWU_AI_API_KEYS (콤마 구분 다중 키 목록)
 */
function getSwuAiKeys() {
  const rawKeys = [];
  if (process.env.SWU_AI_API_KEY) {
    rawKeys.push(...process.env.SWU_AI_API_KEY.split(','));
  }
  if (process.env.SWU_AI_API_KEY_2) {
    rawKeys.push(process.env.SWU_AI_API_KEY_2);
  }
  if (process.env.SWU_AI_API_KEYS) {
    rawKeys.push(...process.env.SWU_AI_API_KEYS.split(','));
  }

  const cleanKeys = rawKeys
    .map((k) => k && k.trim())
    .filter((k) => Boolean(k) && !k.startsWith('//') && !k.startsWith('#'));

  return [...new Set(cleanKeys)];
}

/**
 * SWU MindLogic Gateway (OpenAI Chat Completions 규격) 호출
 */
async function callMindlogicGateway(apiKey, prompt, modelName) {
  const model = modelName || process.env.SWU_AI_MODEL || 'gemini-3.7-flash';
  const res = await axios.post(
    'https://factchat-cloud.mindlogic.ai/v1/gateway/chat/completions/',
    {
      model,
      messages: [{ role: 'user', content: prompt }],
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    }
  );

  const text = res.data?.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error('SWU MindLogic 게이트웨이 응답 본문에 텍스트가 없습니다.');
  }
  return text.trim();
}

/**
 * 다중 키 및 다중 제공자(Google Gemini -> SWU MindLogic Gateway)를 활용한 대본 생성
 * 429(Rate Limit / Quota Exceeded) 또는 호출 실패 시 예비 키로 즉시 자동 전환
 */
async function generateContentWithFallback(prompt, modelName = 'gemini-2.5-flash') {
  const geminiKeys = getGeminiApiKeys();
  const swuKeys = getSwuAiKeys();

  if (geminiKeys.length === 0 && swuKeys.length === 0) {
    throw new Error('GEMINI_API_KEY 또는 SWU_AI_API_KEY가 설정되지 않았습니다.');
  }

  const preferSwu = process.env.PREFER_SWU_AI === 'true' || process.env.SWU_AI_FIRST === 'true';
  let lastError = null;

  // 헬퍼: Google Gemini 시도
  const tryGemini = async () => {
    for (let i = 0; i < geminiKeys.length; i++) {
      const key = geminiKeys[i];
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

        if (i < geminiKeys.length - 1) {
          if (isQuotaOrRateLimit) {
            console.warn(`⚠️ [Gemini] ${keyLabel} 할당량 초과(429). 예비 키 #${i + 2}로 자동 전환합니다.`);
          } else {
            console.warn(`⚠️ [Gemini] ${keyLabel} 호출 실패 (${err.message}). 예비 키 #${i + 2}로 재시도합니다.`);
          }
        } else {
          console.warn(`⚠️ [Gemini] 모든 직결 Gemini 키 소진/실패 (${err.message}).`);
        }
      }
    }
    return null;
  };

  // 헬퍼: SWU MindLogic Gateway 시도
  const trySwu = async () => {
    for (let j = 0; j < swuKeys.length; j++) {
      const key = swuKeys[j];
      const keyLabel = `SWU AI 키 #${j + 1}(...${key.slice(-4)})`;
      try {
        const text = await callMindlogicGateway(key, prompt);
        return text;
      } catch (err) {
        lastError = err;
        const errMsg = err.response?.data?.error?.message || err.message;
        if (j < swuKeys.length - 1) {
          console.warn(`⚠️ [SWU AI] ${keyLabel} 호출 실패 (${errMsg}). 예비 SWU AI 키 #${j + 2}로 자동 전환합니다.`);
        } else {
          console.warn(`⚠️ [SWU AI] 모든 SWU AI 키 실패 (${errMsg}).`);
        }
      }
    }
    return null;
  };

  if (preferSwu) {
    const swuResult = await trySwu();
    if (swuResult) return swuResult;
    console.warn('⚠️ [AI Fallback] SWU AI 키 소진으로 Google Gemini 키로 대체 시도합니다.');
    const geminiResult = await tryGemini();
    if (geminiResult) return geminiResult;
  } else {
    const geminiResult = await tryGemini();
    if (geminiResult) return geminiResult;
    if (swuKeys.length > 0) {
      console.warn('⚠️ [AI Fallback] Gemini 키 소진으로 학교 SWU AI 게이트웨이로 대체 시도합니다.');
      const swuResult = await trySwu();
      if (swuResult) return swuResult;
    }
  }

  throw lastError || new Error('모든 AI 생성 키(Gemini / SWU AI) 호출에 실패했습니다.');
}

/**
 * TTS 낭독용 텍스트 정제.
 * TTS 엔진은 '*', '#', '·' 같은 기호를 "별표", "샵", "가운데점" 처럼 그대로 읽어버린다.
 * 마크다운/목록/특수문자·이모지를 제거해 자연스러운 문장만 읽도록 만든다.
 * (대본 DB 저장은 원문을 유지하고, 오직 합성 단계에서만 정제한다.)
 */
function sanitizeForTTS(text) {
  if (!text) return '';
  let t = String(text);

      // 1) 마크다운 강조/제목 기호(*, #, `, ~, ^, _, |, <, >) 제거.
      //    1-a) 기호가 공백으로 감싸인 경우("* 경교장 *")는 공백까지 흡수 → "경교장" (조사 결합)
      t = t.replace(/[ \t]+[*#`~^_|<>]+[ \t]+/g, '');
      //    1-b) 단어에 밀착된 기호("**정말**", "최고*의*")는 기호만 제거 → "정말", "최고의"
      t = t.replace(/[*#`~^_|<>]+/g, '');

  // 2) 줄머리 불릿/기호 제거 ("- 항목", "• 항목", "1. 항목" 등)
  t = t.replace(/^[ \t]*[-•▪◦‣※·]+[ \t]*/gm, '');

    // 3) 본문 중 남은 장식 기호(★☆ 등) 제거 — 1번과 동일 전략
    //    3-a) 공백으로 감싸인 경우는 공백까지 흡수
    t = t.replace(/[ \t]+[★☆]+[ \t]+/g, ' ');
    //    3-b) 단어에 밀착된 경우는 기호만 제거
    t = t.replace(/[★☆]+/g, '');
    // 본문 한가운데의 불릿/가운데점(단어 사이 구분용)은 공백으로
    t = t.replace(/[•▪◦‣※·]+/g, ' ');

  // 4) 이모지 및 픽토그램 제거
  t = t.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]\u{FE0F}?/gu, ' ');

  // 5) 대괄호/중괄호/슬래시 등 낭독이 어색한 기호는 공백화
  t = t.replace(/[\[\]{}]/g, ' ');
  t = t.replace(/[\\/]+/g, ' ');
  //   쉼표/마침표/물음표/느낌표/콜론/줄임표는 자연스러운 끊어읽기용으로 유지

    // 6) 연속 공백/개행 정리
    t = t.replace(/[ \t]+/g, ' ');                      // 연속 공백 → 1칸
    t = t.replace(/\n{2,}/g, '\n');                     // 빈 줄 정리
    t = t.replace(/\s+([,.?!:])/g, '$1');               // 문장부호 앞 공백 제거
    t = t.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')'); // 괄호 안쪽 공백 정리
    t = t.replace(/^[ \t]+/gm, '').replace(/[ \t]+$/gm, ''); // 줄 앞뒤 공백 제거

    return t.trim();
}

async function generateTTS(text) {
  const spoken = sanitizeForTTS(text);
  const response = await axios.post(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${process.env.GOOGLE_TTS_API_KEY}`,
    {
      input: { text: spoken },
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

async function getAiContentsByTypes(rawSpotId, contentTypes = ['place', 'history', 'tour']) {
  if (!rawSpotId) {
    const err = new Error('spot_id는 필수입니다.');
    err.status = 400; throw err;
  }

  let spotId = String(rawSpotId).trim();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(spotId);

  let spot = null;
  if (isUuid) {
    const { rows: spotRows } = await pool.query(
      `SELECT spot_id, name, address, ST_X(location::geometry) AS x, ST_Y(location::geometry) AS y,
              content_place, content_history, content_tour, barrier_free_info
       FROM spots WHERE spot_id = $1 AND status = 'active'`,
      [spotId]
    );
    if (spotRows.length) {
      spot = spotRows[0];
    }
  }

  // DB에 없는 경우 또는 숫자 TourAPI contentId인 경우: TourAPI 조회 및 spots 등록 시도
  if (!spot) {
    const isNumeric = /^\d+$/.test(spotId);
    if (isNumeric) {
      try {
        const tourDetail = await tourApiService.getSpotDetail(spotId);
        if (tourDetail) {
          // 동일 이름으로 이미 등록된 스팟이 있는지 확인
          const { rows: existingRows } = await pool.query(
            `SELECT spot_id, name, address, ST_X(location::geometry) AS x, ST_Y(location::geometry) AS y,
                    content_place, content_history, content_tour, barrier_free_info
             FROM spots WHERE name = $1 AND status = 'active' LIMIT 1`,
            [tourDetail.title]
          );

          if (existingRows.length) {
            spot = existingRows[0];
            spotId = spot.spot_id;
          } else {
            // spots 테이블에 신규 등록하여 spot_id 확보
            const posX = tourDetail.x || 126.9780;
            const posY = tourDetail.y || 37.5665;
            const overviewText = tourDetail.overview || null;
            const { rows: newSpotRows } = await pool.query(
              `INSERT INTO spots (name, address, location, source, content_place, content_tour, categories)
               VALUES ($1, $2, ST_SetSRID(ST_Point($3, $4), 4326)::geography, 'tour', $5, $5, ARRAY['관광·명소'])
               RETURNING spot_id, name, address, ST_X(location::geometry) AS x, ST_Y(location::geometry) AS y,
                         content_place, content_history, content_tour, barrier_free_info`,
              [tourDetail.title, tourDetail.address, posX, posY, overviewText]
            );
            if (newSpotRows.length) {
              spot = newSpotRows[0];
              spotId = spot.spot_id;
            }
          }
        }
      } catch (err) {
        console.warn(`[getAiContentsByTypes] TourAPI 연동 실패 (${spotId}):`, err.message);
      }
    }
  }

  if (!spot) {
    const err = new Error('스팟을 찾을 수 없습니다.');
    err.status = 404; throw err;
  }

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
6. 특수문자·이모지·마크다운 기호(*, #, -, •, ·, ※, [ ], ★ 등)를 절대 쓰지 마세요. 오직 순수 한글 문장과 마침표/쉼표/물음표/느낌표만 사용하세요. (음성으로 읽히므로 기호를 읽어버립니다)
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

// ── 개요 요약 메모리 캐시 ──────────────────────────────────────────
const overviewSummaryCache = new Map();
const MAX_CACHE_SIZE = 500;

function getOverviewCacheKey(spotId, text) {
  if (spotId) return `spot:${spotId}`;
  return `text:${text.slice(0, 80)}_${text.length}`;
}

/**
 * 관광지 개요 텍스트를 Gemini를 활용해 5~6줄로 친절하게 요약/정리
 */
async function summarizeOverview(text, spotName = '', spotId = null) {
  if (!text || !text.trim()) {
    return '';
  }

  const cleanText = text.replace(/<[^>]*>?/gm, '').trim();
  const cacheKey = getOverviewCacheKey(spotId, cleanText);

  if (overviewSummaryCache.has(cacheKey)) {
    return overviewSummaryCache.get(cacheKey);
  }

  // 문장이 이미 5줄 미만으로 아주 짧으면 그대로 반환
  const lines = cleanText.split('\n').map(l => l.trim()).filter(Boolean);
  if (cleanText.length <= 160 && lines.length <= 3) {
    overviewSummaryCache.set(cacheKey, cleanText);
    return cleanText;
  }

  const prompt = `당신은 친절한 여행 전문 도슨트이자 인공지능 가이드입니다.
아래는 관광지 '${spotName || '이 장소'}'에 대한 원본 소개 개요입니다.

[원본 개요]
${cleanText}

[지침]
1. 원본의 핵심 매력, 역사/문화적 가치, 방문 팁을 관광객이 읽기 쉽고 친절한 문체로 5~6줄(5~6문장) 분량으로 요약·정리해 주세요.
2. 각 줄은 하나의 완결된 문장으로 작성하고, 줄바꿈으로 구분해 총 5~6줄로 구성해 주세요.
3. 불릿 기호(-, *, 1. 등), 마크다운 강조(**), 제목, '요약:', 'AI 요약:' 같은 부가 수식어 없이 순수 요약 본문 5~6줄만 즉시 출력해 주세요.
4. 부드럽고 친절한 어조(~합니다, ~해요 등)로 작성해 주세요.`;

  try {
    const summary = await generateContentWithFallback(prompt, 'gemini-2.5-flash');
    if (summary && summary.trim().length > 0) {
      const formatted = summary.trim();
      if (overviewSummaryCache.size >= MAX_CACHE_SIZE) {
        const firstKey = overviewSummaryCache.keys().next().value;
        overviewSummaryCache.delete(firstKey);
      }
      overviewSummaryCache.set(cacheKey, formatted);
      return formatted;
    }
  } catch (err) {
    console.warn(`⚠️ [Gemini] 개요 요약 실패 (${err.message}). 기본 텍스트 폴백 적용`);
  }

  // 폴백: 문장 단위로 분할하여 앞 5~6문장 추출
  const sentences = cleanText
    .split(/(?<=[.?!])\s+/)
    .map(s => s.trim())
    .filter(Boolean);

  const fallback = (sentences.length > 0 ? sentences.slice(0, 5).join('\n') : cleanText.slice(0, 250));
  return fallback;
}

exports.getAiContents = async (spotId) => getAiContentsByTypes(spotId);
exports.getAiContentsByTypes = getAiContentsByTypes;
exports.prewarmCourseAudio = prewarmCourseAudio;
exports.summarizeOverview = summarizeOverview;

