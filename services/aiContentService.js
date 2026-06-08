const pool = require('../config/db');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const axios = require('axios');

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
      voice: { languageCode: 'ko-KR', name: 'ko-KR-Standard-A' },
      audioConfig: { audioEncoding: 'MP3' },
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

exports.getAiContents = async (spotId) => {
  const { rows: spotRows } = await pool.query(
    `SELECT name, content_place, content_history, content_tour
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

  const contents = [];

  for (const [contentType, { label, source }] of Object.entries(typeMap)) {
    if (!source) continue;

    // 캐시 확인
    const { rows: cached } = await pool.query(
      `SELECT content_type, script, audio_url
       FROM spot_ai_contents WHERE spot_id = $1 AND content_type = $2`,
      [spotId, contentType]
    );

    if (cached.length && cached[0].audio_url) {
      contents.push(cached[0]);
      continue;
    }

    // Gemini로 스크립트 생성
    const prompt = `
당신은 도보 산책 앱의 AI 음성 가이드입니다.
아래 정보를 바탕으로 산책 중 들을 수 있는 자연스러운 ${label} 멘트를 작성해주세요.

장소명: ${spot.name}
원본 정보: ${source}

조건:
- 말하는 속도 기준 60초 이내 (200자 내외)
- 친근하고 자연스러운 구어체
- "지금 걷고 계신" 또는 "바로 앞에" 같은 현장감 있는 표현 포함
- 마침표로 문장 마무리
    `.trim();

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(prompt);
    const script = result.response.text().trim();

    // Google TTS로 mp3 생성
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
};
