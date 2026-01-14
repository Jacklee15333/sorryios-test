/**
 * 用户已掌握词汇 API
 * 文件位置: backend/routes/user-mastered-api.js
 */

const express = require('express');
const router = express.Router();
const { UserMasteredDB } = require('../services/user-mastered-service');
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
 * 添加已掌握词汇
 * POST /api/user-mastered/add
 * Body: { word: string, wordType: 'word'|'phrase'|'pattern'|'grammar' }
 */
router.post('/add', (req, res) => {
    try {
        const { word, wordType = 'word' } = req.body;
        
        if (!word) {
            return res.status(400).json({ success: false, message: '缺少词汇' });
        }

        const result = UserMasteredDB.add(req.userId, word, wordType);
        
        res.json({ 
            success: true, 
            message: result ? '已添加到掌握列表' : '该词汇已在掌握列表中',
            added: result
        });
    } catch (e) {
        console.error('[UserMasteredAPI] 添加失败:', e);
        res.status(500).json({ success: false, message: e.message });
    }
});

/**
 * 批量添加已掌握词汇
 * POST /api/user-mastered/add-batch
 * Body: { words: [{ word: string, type: string }] }
 */
router.post('/add-batch', (req, res) => {
    try {
        const { words } = req.body;
        
        if (!words || !Array.isArray(words)) {
            return res.status(400).json({ success: false, message: '缺少词汇列表' });
        }

        const count = UserMasteredDB.addBatch(req.userId, words);
        
        res.json({ 
            success: true, 
            message: `已添加 ${count} 个词汇到掌握列表`,
            addedCount: count
        });
    } catch (e) {
        console.error('[UserMasteredAPI] 批量添加失败:', e);
        res.status(500).json({ success: false, message: e.message });
    }
});

/**
 * 移除已掌握词汇
 * POST /api/user-mastered/remove
 * Body: { word: string, wordType?: string }
 */
router.post('/remove', (req, res) => {
    try {
        const { word, wordType } = req.body;
        
        if (!word) {
            return res.status(400).json({ success: false, message: '缺少词汇' });
        }

        const result = UserMasteredDB.remove(req.userId, word, wordType);
        
        res.json({ 
            success: true, 
            message: result ? '已从掌握列表移除' : '该词汇不在掌握列表中',
            removed: result
        });
    } catch (e) {
        console.error('[UserMasteredAPI] 移除失败:', e);
        res.status(500).json({ success: false, message: e.message });
    }
});

/**
 * 获取所有已掌握词汇
 * GET /api/user-mastered/list
 * Query: { type?: string }
 */
router.get('/list', (req, res) => {
    try {
        const { type } = req.query;
        
        let words;
        if (type) {
            words = UserMasteredDB.getByType(req.userId, type);
        } else {
            words = UserMasteredDB.getAll(req.userId);
        }
        
        res.json({ 
            success: true, 
            words,
            count: words.length
        });
    } catch (e) {
        console.error('[UserMasteredAPI] 获取列表失败:', e);
        res.status(500).json({ success: false, message: e.message });
    }
});

/**
 * 获取统计数据
 * GET /api/user-mastered/stats
 */
router.get('/stats', (req, res) => {
    try {
        const stats = UserMasteredDB.getStats(req.userId);
        res.json({ success: true, stats });
    } catch (e) {
        console.error('[UserMasteredAPI] 获取统计失败:', e);
        res.status(500).json({ success: false, message: e.message });
    }
});

/**
 * 检查词汇是否已掌握
 * GET /api/user-mastered/check
 * Query: { word: string, type?: string }
 */
router.get('/check', (req, res) => {
    try {
        const { word, type } = req.query;
        
        if (!word) {
            return res.status(400).json({ success: false, message: '缺少词汇' });
        }

        const isMastered = UserMasteredDB.isMastered(req.userId, word, type);
        
        res.json({ success: true, isMastered });
    } catch (e) {
        console.error('[UserMasteredAPI] 检查失败:', e);
        res.status(500).json({ success: false, message: e.message });
    }
});

/**
 * 清空所有已掌握词汇
 * POST /api/user-mastered/clear
 */
router.post('/clear', (req, res) => {
    try {
        const count = UserMasteredDB.clear(req.userId);
        res.json({ 
            success: true, 
            message: `已清空 ${count} 个词汇`,
            clearedCount: count
        });
    } catch (e) {
        console.error('[UserMasteredAPI] 清空失败:', e);
        res.status(500).json({ success: false, message: e.message });
    }
});

module.exports = router;
