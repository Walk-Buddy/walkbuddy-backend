const express = require('express');
const router = express.Router();
const TagRepository = require('../repositories/tagRepository');

// ─────────────────────────────────────────────────────────────────────
//  Tag Routes
//  Base: /api/tags
// ─────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/tags:
 *   get:
 *     summary: 태그 목록 조회
 *     description: 코스 등록 시 선택 가능한 승인된 태그 목록을 반환합니다.
 *     tags: [Tags]
 *     responses:
 *       200:
 *         description: 태그 목록 반환
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       tag_id:
 *                         type: string
 *                         format: uuid
 *                       tag_name:
 *                         type: string
 *                         example: 강변
 *                       category:
 *                         type: string
 *                         example: 환경
 *                         nullable: true
 */
router.get('/', async (req, res) => {
  try {
    const tags = await TagRepository.findAll();
    res.json({ success: true, data: tags });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
