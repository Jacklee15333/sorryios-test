/**
 * 排除库 API 路由 v1.0
 * 文件位置: backend/routes/exclude-api.js
 * 
 * 提供排除库的增删改查接口
 */

const express = require('express');
const router = express.Router();
const { getExcludeService } = require('../services/excludeService');

// 获取服务实例
const excludeService = getExcludeService();

// ============================================
// 统计接口
// ============================================

/**
 * GET /api/exclude/stats
 * 获取统计信息
 */
router.get('/stats', (req, res) => {
    try {
        const stats = excludeService.getStats();
        res.json({ success: true, data: stats });
    } catch (error) {
        console.error('[Exclude API] 获取统计失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// CRUD 接口
// ============================================

/**
 * GET /api/exclude/items
 * 获取排除项列表
 */
router.get('/items', (req, res) => {
    try {
        const { type, search, limit = 200, offset = 0 } = req.query;
        const items = excludeService.getAll({
            type,
            search,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        res.json({
            success: true,
            data: items,
            total: items.length
        });
    } catch (error) {
        console.error('[Exclude API] 获取列表失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/exclude/items/:id
 * 获取单个排除项
 */
router.get('/items/:id', (req, res) => {
    try {
        const { id } = req.params;
        const item = excludeService.getById(parseInt(id));

        if (!item) {
            return res.status(404).json({ success: false, error: '记录不存在' });
        }

        res.json({ success: true, data: item });
    } catch (error) {
        console.error('[Exclude API] 获取详情失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/exclude/items
 * 添加排除项
 */
router.post('/items', (req, res) => {
    try {
        const { original_text, original_type, reason, created_by } = req.body;

        if (!original_text || !original_type) {
            return res.status(400).json({ 
                success: false, 
                error: '原始文本和类型不能为空' 
            });
        }

        const result = excludeService.add({
            original_text,
            original_type,
            reason,
            created_by
        });

        if (result.success) {
            res.json({
                success: true,
                id: result.id,
                message: `已添加到排除库：${original_text}`
            });
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        console.error('[Exclude API] 添加失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/exclude/items/:id
 * 更新排除项
 */
router.put('/items/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { original_text, original_type, reason } = req.body;

        if (!original_text || !original_type) {
            return res.status(400).json({ 
                success: false, 
                error: '原始文本和类型不能为空' 
            });
        }

        const result = excludeService.update(parseInt(id), {
            original_text,
            original_type,
            reason
        });

        if (result.success) {
            res.json({ success: true, message: '更新成功' });
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        console.error('[Exclude API] 更新失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/exclude/items/:id
 * 删除排除项
 */
router.delete('/items/:id', (req, res) => {
    try {
        const { id } = req.params;
        const result = excludeService.delete(parseInt(id));

        if (result.success) {
            res.json({ success: true, message: '删除成功' });
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        console.error('[Exclude API] 删除失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 标新功能接口
// ============================================

/**
 * POST /api/exclude/items/:id/clear-new
 * 取消单个标新
 */
router.post('/items/:id/clear-new', (req, res) => {
    try {
        const { id } = req.params;
        const result = excludeService.clearNew(parseInt(id));

        if (result.success) {
            res.json({ success: true, message: '已取消标新' });
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        console.error('[Exclude API] 取消标新失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/exclude/clear-all-new
 * 批量取消所有标新
 */
router.post('/clear-all-new', (req, res) => {
    try {
        const result = excludeService.clearAllNew();

        if (result.success) {
            res.json({ 
                success: true, 
                message: `已取消 ${result.count} 个标新`,
                count: result.count
            });
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        console.error('[Exclude API] 批量取消标新失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 查询接口（用于匹配流程）
// ============================================

/**
 * GET /api/exclude/check
 * 检查是否被排除
 */
router.get('/check', (req, res) => {
    try {
        const { text, type } = req.query;

        if (!text || !type) {
            return res.status(400).json({ 
                success: false, 
                error: '请提供 text 和 type 参数' 
            });
        }

        const isExcluded = excludeService.isExcluded(text, type);
        res.json({ success: true, excluded: isExcluded });
    } catch (error) {
        console.error('[Exclude API] 检查失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 数据迁移接口
// ============================================

/**
 * POST /api/exclude/migrate
 * 从 matching.db 迁移数据
 */
router.post('/migrate', (req, res) => {
    try {
        const result = excludeService.migrateFromMatchingDb();

        if (result.success) {
            res.json({
                success: true,
                message: `迁移完成：迁移 ${result.migrated} 条，删除 ${result.deleted} 条`,
                migrated: result.migrated,
                deleted: result.deleted
            });
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        console.error('[Exclude API] 迁移失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
