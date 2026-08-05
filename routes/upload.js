const express = require('express');
const multer = require('multer');
const multerS3 = require('multer-s3');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const s3 = require('../config/s3');

const router = express.Router();
const BUCKET_NAME = process.env.S3_BUCKET_NAME;

const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: BUCKET_NAME,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: function (req, file, cb) {
      const filename = `${Date.now()}-${file.originalname}`;
      cb(null, filename);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB 제한
});

// 업로드
router.post('/', upload.single('file'), (req, res) => {
  res.json({
    success: true,
    message: '업로드 성공',
    key: req.file.key
  });
});

// 조회용 임시 URL 발급 (버킷이 private이라서 필요)
router.get('/:key', async (req, res) => {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: req.params.key
    });
    const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
    res.json({ success: true, url });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
