require('dotenv').config();
const authService = require('./services/authService');

authService.sendVerifyCode(process.env.MAIL_USER)
  .then(() => console.log('✅ 메일 발송 성공'))
  .catch((err) => console.error('❌ 실패:', err.message));