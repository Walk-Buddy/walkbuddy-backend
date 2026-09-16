const nodemailer = require('nodemailer');

// ──────────────────────────────────────────────────────────────────────
// 트랜스포터 생성
// Gmail OAuth2 대신 App Password 방식 사용 (배포 환경 단순화)
// Gmail 외 SMTP (SendGrid, Naver 등) 사용 시 host/port 교체
//
// .env 필요 키:
//   MAIL_USER=발신자@gmail.com
//   MAIL_PASS=Gmail앱비밀번호  (Google 계정 → 2단계인증 → 앱 비밀번호)
//   MAIL_FROM=WalkBuddy <발신자@gmail.com>   (선택, 없으면 MAIL_USER)
// ──────────────────────────────────────────────────────────────────────
const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS,
    },
  });
};

// ──────────────────────────────────────────────────────────────────────
// 이메일 인증코드 발송
// ──────────────────────────────────────────────────────────────────────
exports.sendVerificationEmail = async (to, code) => {
  const transporter = createTransporter();
  const from = process.env.MAIL_FROM || `WalkBuddy <${process.env.MAIL_USER}>`;

  await transporter.sendMail({
    from,
    to,
    subject: '[WalkBuddy] 이메일 인증코드',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; border: 1px solid #e5e7eb; border-radius: 8px;">
        <h2 style="color: #111827; margin-bottom: 8px;">WalkBuddy 이메일 인증</h2>
        <p style="color: #6b7280; margin-bottom: 24px;">아래 인증코드를 입력해주세요. <strong>3분</strong> 내에 입력해야 합니다.</p>
        <div style="background: #f3f4f6; border-radius: 8px; padding: 24px; text-align: center;">
          <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #111827;">${code}</span>
        </div>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">
          본인이 요청하지 않은 경우 이 이메일을 무시하세요.
        </p>
      </div>
    `,
  });

};
exports.sendEmail = async ({ to, subject, text, html }) => {
  const transporter = createTransporter();
  const from = process.env.MAIL_FROM || `WalkBuddy <${process.env.MAIL_USER}>`;
  await transporter.sendMail({ from, to, subject, text, html });
};
