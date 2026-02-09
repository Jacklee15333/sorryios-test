/**
 * wrong-question-api.js - 错题 CRUD + 统计 API v1.0
 * 
 * 挂载路径: /api/wrong-questions
 * 
 * 路由：
 *   GET    /api/wrong-questions          错题列表（支持筛选）
 *   GET    /api/wrong-questions/stats    错题统计
 *   GET    /api/wrong-questions/:id      单条错题详情
 *   PUT    /api/wrong-questions/:id      编辑错题
 *   DELETE /api/wrong-questions/:id      删除错题
 *   POST   /api/wrong-questions/:id/master    标记已掌握
 *   POST   /api/wrong-questions/:id/unmaster  取消已掌握
 * 
 * @version 1.0
 * @date 2026-02-09
 */

const express = require('express');
const { authMiddleware } = require('./auth');
const { WrongQuestionDB } = require('../services/wrongQuestionService');

const router = express.Router();

// ============================================
// GET /api/wrong-questions - 错题列表（支持筛选）
// ============================================

router.get('/', authMiddleware, (req, res) => {
    const userId = req.user.id;

    console.log(`[WrongQuestionAPI] 🔍 查询错题列表, userId: ${userId}`);
    console.log(`[WrongQuestionAPI] 📦 查询参数:`, JSON.stringify(req.query));

    try {
        const filters = {
            examId: req.query.examId || null,
            section: req.query.section || null,
            questionType: req.query.questionType || null,
            mastered: req.query.mastered !== undefined ? req.query.mastered : null,
            limit: req.query.limit ? parseInt(req.query.limit) : null,
            offset: req.query.offset ? parseInt(req.query.offset) : null
        };

        const questions = WrongQuestionDB.getList(userId, filters);

        console.log(`[WrongQuestionAPI] ✅ 返回 ${questions.length} 条错题`);

        res.json({
            success: true,
            questions: questions,
            total: questions.length
        });
    } catch (error) {
        console.error('[WrongQuestionAPI] ❌ 查询失败:', error.message);
        console.error('[WrongQuestionAPI] ❌ 堆栈:', error.stack);
        res.status(500).json({ error: '查询失败', message: error.message });
    }
});

// ============================================
// GET /api/wrong-questions/stats - 错题统计
// ============================================

router.get('/stats', authMiddleware, (req, res) => {
    const userId = req.user.id;

    console.log(`[WrongQuestionAPI] 📊 查询错题统计, userId: ${userId}`);

    try {
        const stats = WrongQuestionDB.getStats(userId);

        console.log(`[WrongQuestionAPI] ✅ 统计结果: 总${stats.total} 已掌握${stats.mastered} 本周${stats.thisWeek}`);

        res.json({
            success: true,
            stats: stats
        });
    } catch (error) {
        console.error('[WrongQuestionAPI] ❌ 统计查询失败:', error.message);
        console.error('[WrongQuestionAPI] ❌ 堆栈:', error.stack);
        res.status(500).json({ error: '查询失败', message: error.message });
    }
});

// ============================================
// GET /api/wrong-questions/:id - 单条错题详情
// ============================================

router.get('/:id', authMiddleware, (req, res) => {
    const id = parseInt(req.params.id);
    const userId = req.user.id;

    console.log(`[WrongQuestionAPI] 🔍 查询错题详情, id: ${id}`);

    try {
        const question = WrongQuestionDB.getById(id);

        if (!question) {
            console.log(`[WrongQuestionAPI] ⚠️ 错题不存在, id: ${id}`);
            return res.status(404).json({ error: '错题不存在' });
        }

        if (question.user_id !== userId) {
            console.log(`[WrongQuestionAPI] ⚠️ 无权查看, id: ${id}`);
            return res.status(403).json({ error: '无权查看此错题' });
        }

        res.json({
            success: true,
            question: question
        });
    } catch (error) {
        console.error('[WrongQuestionAPI] ❌ 查询失败:', error.message);
        res.status(500).json({ error: '查询失败', message: error.message });
    }
});

// ============================================
// PUT /api/wrong-questions/:id - 编辑错题
// ============================================

router.put('/:id', authMiddleware, (req, res) => {
    const id = parseInt(req.params.id);
    const userId = req.user.id;

    console.log(`[WrongQuestionAPI] ✏️ 编辑错题, id: ${id}`);
    console.log(`[WrongQuestionAPI] 📦 更新数据:`, JSON.stringify(req.body));

    try {
        const success = WrongQuestionDB.update(id, userId, req.body);

        if (success) {
            const updated = WrongQuestionDB.getById(id);
            console.log(`[WrongQuestionAPI] ✅ 编辑成功`);
            res.json({ success: true, question: updated });
        } else {
            console.log(`[WrongQuestionAPI] ⚠️ 编辑失败（不存在或无权）`);
            res.status(404).json({ error: '错题不存在或无权编辑' });
        }
    } catch (error) {
        console.error('[WrongQuestionAPI] ❌ 编辑失败:', error.message);
        res.status(500).json({ error: '编辑失败', message: error.message });
    }
});

// ============================================
// DELETE /api/wrong-questions/:id - 删除错题
// ============================================

router.delete('/:id', authMiddleware, (req, res) => {
    const id = parseInt(req.params.id);
    const userId = req.user.id;

    console.log(`[WrongQuestionAPI] 🗑️ 删除错题, id: ${id}`);

    try {
        const success = WrongQuestionDB.delete(id, userId);

        if (success) {
            console.log(`[WrongQuestionAPI] ✅ 删除成功`);
            res.json({ success: true, message: '错题已删除' });
        } else {
            console.log(`[WrongQuestionAPI] ⚠️ 删除失败（不存在或无权）`);
            res.status(404).json({ error: '错题不存在或无权删除' });
        }
    } catch (error) {
        console.error('[WrongQuestionAPI] ❌ 删除失败:', error.message);
        res.status(500).json({ error: '删除失败', message: error.message });
    }
});

// ============================================
// POST /api/wrong-questions/:id/master - 标记已掌握
// ============================================

router.post('/:id/master', authMiddleware, (req, res) => {
    const id = parseInt(req.params.id);
    const userId = req.user.id;

    console.log(`[WrongQuestionAPI] ✅ 标记已掌握, id: ${id}`);

    try {
        const success = WrongQuestionDB.markMastered(id, userId);

        if (success) {
            console.log(`[WrongQuestionAPI] ✅ 标记成功`);
            res.json({ success: true, message: '已标记为掌握' });
        } else {
            console.log(`[WrongQuestionAPI] ⚠️ 标记失败`);
            res.status(404).json({ error: '错题不存在或无权操作' });
        }
    } catch (error) {
        console.error('[WrongQuestionAPI] ❌ 标记失败:', error.message);
        res.status(500).json({ error: '操作失败', message: error.message });
    }
});

// ============================================
// POST /api/wrong-questions/:id/unmaster - 取消已掌握
// ============================================

router.post('/:id/unmaster', authMiddleware, (req, res) => {
    const id = parseInt(req.params.id);
    const userId = req.user.id;

    console.log(`[WrongQuestionAPI] ↩️ 取消已掌握, id: ${id}`);

    try {
        const success = WrongQuestionDB.unmarkMastered(id, userId);

        if (success) {
            console.log(`[WrongQuestionAPI] ✅ 取消成功`);
            res.json({ success: true, message: '已取消掌握标记' });
        } else {
            console.log(`[WrongQuestionAPI] ⚠️ 取消失败`);
            res.status(404).json({ error: '错题不存在或无权操作' });
        }
    } catch (error) {
        console.error('[WrongQuestionAPI] ❌ 取消失败:', error.message);
        res.status(500).json({ error: '操作失败', message: error.message });
    }
});

module.exports = router;
