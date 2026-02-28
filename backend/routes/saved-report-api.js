/**
 * 已保存报告 API
 * 文件位置: backend/routes/saved-report-api.js
 * 
 * v5.1 新增：用户可以保存修改后的学习报告
 */

const express = require('express');
const router = express.Router();
const { SavedReportDB } = require('../services/database');
const { verifyToken } = require('../services/userService');

/**
 * 认证中间件
 */
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: '未登录' });
    }

    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    
    if (!payload) {
        return res.status(401).json({ success: false, message: 'Token无效或已过期' });
    }

    req.userId = payload.userId;
    next();
}

// 所有路由需要认证
router.use(authMiddleware);

/**
 * 保存/更新报告
 * POST /api/saved-report/save
 * Body: { taskId, title, hiddenItems, wordCount, phraseCount, grammarCount, notes }
 */
router.post('/save', (req, res) => {
    try {
        const { taskId, title, hiddenItems, wordCount, phraseCount, grammarCount, notes } = req.body;
        
        if (!taskId) {
            return res.status(400).json({ success: false, message: '缺少任务ID' });
        }

        console.log(`[SavedReport] 💾 保存报告: user=${req.userId}, task=${taskId}, hidden=${(hiddenItems || []).length}项`);

        const result = SavedReportDB.save(req.userId, taskId, {
            title: title || '',
            hiddenItems: hiddenItems || [],
            wordCount: wordCount || 0,
            phraseCount: phraseCount || 0,
            grammarCount: grammarCount || 0,
            notes: notes || ''
        });

        console.log(`[SavedReport] ✅ 保存成功: id=${result.id}, ${result.updated ? '更新' : '新建'}`);

        res.json({
            success: true,
            id: result.id,
            updated: result.updated,
            message: result.updated ? '报告已更新' : '报告已保存'
        });
    } catch (error) {
        console.error('[SavedReport] ❌ 保存失败:', error.message);
        res.status(500).json({ success: false, message: '保存失败: ' + error.message });
    }
});

/**
 * 获取已保存报告列表
 * GET /api/saved-report/list
 */
router.get('/list', (req, res) => {
    try {
        const reports = SavedReportDB.list(req.userId);
        
        // 解析 hidden_items JSON
        const parsed = reports.map(r => ({
            ...r,
            hiddenItems: JSON.parse(r.hidden_items || '[]'),
            hidden_items: undefined
        }));

        res.json({ success: true, reports: parsed });
    } catch (error) {
        console.error('[SavedReport] ❌ 获取列表失败:', error.message);
        res.status(500).json({ success: false, message: '获取列表失败' });
    }
});

/**
 * 根据任务ID获取已保存报告
 * GET /api/saved-report/by-task/:taskId
 */
router.get('/by-task/:taskId', (req, res) => {
    try {
        const report = SavedReportDB.getByTaskId(req.params.taskId, req.userId);
        
        if (!report) {
            return res.json({ success: true, report: null });
        }

        res.json({
            success: true,
            report: {
                ...report,
                hiddenItems: JSON.parse(report.hidden_items || '[]'),
                hidden_items: undefined
            }
        });
    } catch (error) {
        console.error('[SavedReport] ❌ 获取报告失败:', error.message);
        res.status(500).json({ success: false, message: '获取报告失败' });
    }
});

/**
 * 获取单个已保存报告
 * GET /api/saved-report/:id
 */
router.get('/:id', (req, res) => {
    try {
        const report = SavedReportDB.get(req.params.id, req.userId);
        
        if (!report) {
            return res.status(404).json({ success: false, message: '报告不存在' });
        }

        res.json({
            success: true,
            report: {
                ...report,
                hiddenItems: JSON.parse(report.hidden_items || '[]'),
                hidden_items: undefined
            }
        });
    } catch (error) {
        console.error('[SavedReport] ❌ 获取报告失败:', error.message);
        res.status(500).json({ success: false, message: '获取报告失败' });
    }
});

/**
 * 删除已保存报告
 * DELETE /api/saved-report/:id
 */
router.delete('/:id', (req, res) => {
    try {
        const result = SavedReportDB.delete(req.params.id, req.userId);
        
        if (result.changes === 0) {
            return res.status(404).json({ success: false, message: '报告不存在' });
        }

        console.log(`[SavedReport] 🗑️ 删除报告: id=${req.params.id}`);
        res.json({ success: true, message: '已删除' });
    } catch (error) {
        console.error('[SavedReport] ❌ 删除失败:', error.message);
        res.status(500).json({ success: false, message: '删除失败' });
    }
});

module.exports = router;
