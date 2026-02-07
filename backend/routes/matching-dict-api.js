/**
 * 替换库 API 路由 v3.0
 * 文件位置: backend/routes/matching-dict-api.js
 * 
 * 📦 v3.0 更新：
 * - 合并：排除库功能（不再使用 exclude-api.js）
 * - 新增：/api/matching-dict/exclude 接口（添加排除规则）
 * - 逻辑：target_text 为空 = 排除
 * 
 * 📦 v2.0 更新：
 * - 改名：匹配词典 → 替换库
 * - 删除：replaceService 引用（已合并）
 * - 删除：转移功能（不再需要）
 * - 简化：只保留替换规则的增删改查
 */

const express = require('express');
const router = express.Router();
const { getMatchingDictService } = require('../services/matchingDictService');

// 获取服务实例
const dictService = getMatchingDictService();

// ============================================
// 统计接口
// ============================================

/**
 * GET /api/matching-dict/stats
 * 获取统计信息
 */
router.get('/stats', (req, res) => {
    try {
        const stats = dictService.getStats();
        res.json({ success: true, data: stats });
    } catch (error) {
        console.error('[替换库 API] 获取统计失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 规则列表接口
// ============================================

/**
 * GET /api/matching-dict/rules
 * 获取规则列表
 */
router.get('/rules', (req, res) => {
    try {
        const { type, search, keyword, limit = 100, offset = 0 } = req.query;
        const all = req.query.all === 'true';  // [修复] 新增 all 参数支持
        
        // [修复] 兼容前端传 keyword 或 search
        const searchTerm = search || keyword || '';
        
        const actualLimit = all ? 999999 : parseInt(limit);  // [修复] all=true时不限制数量
        
        console.log(`[替换库 API] GET /rules 请求参数: type="${type || ''}", search="${searchTerm}", all=${all}, limit=${actualLimit}, offset=${offset}`);
        
        const rules = dictService.getAllRules({
            type,
            search: searchTerm,
            limit: actualLimit,
            offset: all ? 0 : parseInt(offset)
        });

        const total = dictService.getCount({ type });
        
        console.log(`[替换库 API] /rules 返回: ${rules.length}条 / 总数${total}`);

        res.json({
            success: true,
            data: rules,
            total,
            limit: actualLimit,
            offset: all ? 0 : parseInt(offset)
        });
    } catch (error) {
        console.error('[替换库 API] 获取规则列表失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/matching-dict/rules/:id
 * 获取单个规则
 */
router.get('/rules/:id', (req, res) => {
    try {
        const { id } = req.params;
        const rule = dictService.getById(parseInt(id));
        
        if (!rule) {
            return res.status(404).json({ success: false, error: '规则不存在' });
        }
        
        res.json({ success: true, data: rule });
    } catch (error) {
        console.error('[替换库 API] 获取规则失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 添加规则接口
// ============================================

/**
 * POST /api/matching-dict/rules
 * 添加替换规则
 */
router.post('/rules', (req, res) => {
    try {
        const {
            original_text,
            original_type,
            action = 'replace',
            target_text,
            notes,
            created_by = 'admin'
        } = req.body;

        // 验证必填字段
        if (!original_text || !original_type) {
            return res.status(400).json({
                success: false,
                error: '请提供 original_text 和 original_type'
            });
        }

        const result = dictService.addRule({
            original_text,
            original_type,
            action,
            target_text,
            notes,
            created_by
        });

        if (result.success) {
            res.json({
                success: true,
                message: result.updated ? '规则已更新' : '规则已添加',
                id: result.id,
                updated: result.updated
            });
        } else {
            res.status(400).json({ success: false, error: result.error });
        }
    } catch (error) {
        console.error('[替换库 API] 添加规则失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 更新和删除接口
// ============================================

/**
 * PUT /api/matching-dict/rules/:id
 * 更新规则
 */
router.put('/rules/:id', (req, res) => {
    try {
        const { id } = req.params;
        const result = dictService.updateRule(parseInt(id), req.body);

        if (result.success) {
            res.json({ success: true, message: '规则已更新' });
        } else {
            res.status(400).json({ success: false, error: result.error });
        }
    } catch (error) {
        console.error('[替换库 API] 更新规则失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/matching-dict/rules/:id
 * 删除规则
 */
router.delete('/rules/:id', (req, res) => {
    try {
        const { id } = req.params;
        const result = dictService.deleteRule(parseInt(id));

        if (result.success) {
            res.json({ success: true, message: '规则已删除' });
        } else {
            res.status(400).json({ success: false, error: result.error || '删除失败' });
        }
    } catch (error) {
        console.error('[替换库 API] 删除规则失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/matching-dict/rules/:id/confirm
 * v3.1 新增：确认规则（取消NEW标记）
 */
router.post('/rules/:id/confirm', (req, res) => {
    try {
        const { id } = req.params;
        const result = dictService.confirm(parseInt(id));

        if (result.success) {
            res.json({ success: true, message: '已确认' });
        } else {
            res.status(404).json({ success: false, error: '规则不存在' });
        }
    } catch (error) {
        console.error('[替换库 API] 确认规则失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 确认匹配接口（前端编辑弹窗使用）
// ============================================

/**
 * POST /api/matching-dict/confirm-match
 * 确认匹配并保存替换规则
 * 前端"替换"按钮调用此接口
 */
router.post('/confirm-match', (req, res) => {
    try {
        const {
            original_text,
            original_type,
            target_db,
            target_table,
            target_id,
            target_text,
            created_by = 'admin'
        } = req.body;

        // 验证必填字段
        if (!original_text || !original_type || !target_text) {
            return res.status(400).json({
                success: false,
                error: '请提供 original_text、original_type 和 target_text'
            });
        }

        // 添加替换规则
        const result = dictService.addRule({
            original_text,
            original_type,
            action: 'replace',
            target_text,
            target_db,
            target_table,
            target_id,
            notes: `匹配到: ${target_text}`,
            created_by
        });

        if (result.success) {
            console.log(`[替换库 API] 确认匹配: "${original_text}" → "${target_text}"`);
            res.json({
                success: true,
                message: '替换规则已保存',
                id: result.id,
                updated: result.updated
            });
        } else {
            res.status(400).json({ success: false, error: result.error });
        }
    } catch (error) {
        console.error('[替换库 API] 确认匹配失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 查询接口（供 matchingService 调用）
// ============================================

/**
 * GET /api/matching-dict/find
 * 查找替换规则
 */
router.get('/find', (req, res) => {
    try {
        const { text, type } = req.query;

        if (!text || !type) {
            return res.status(400).json({
                success: false,
                error: '请提供 text 和 type'
            });
        }

        const rule = dictService.findRule(text, type);

        res.json({
            success: true,
            found: !!rule,
            data: rule
        });
    } catch (error) {
        console.error('[替换库 API] 查找规则失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// v3.0 新增：排除规则接口
// ============================================

/**
 * POST /api/matching-dict/exclude
 * 添加排除规则（target_text 为空）
 * 前端"排除"按钮调用此接口
 */
router.post('/exclude', (req, res) => {
    try {
        const {
            original_text,
            original_type,
            notes,
            created_by = 'admin'
        } = req.body;

        // 验证必填字段
        if (!original_text || !original_type) {
            return res.status(400).json({
                success: false,
                error: '请提供 original_text 和 original_type'
            });
        }

        // 添加排除规则（target_text 为空）
        const result = dictService.addRule({
            original_text,
            original_type,
            action: 'exclude',
            target_text: '',  // 排除规则的 target_text 为空
            notes: notes || '已标记为排除',
            created_by
        });

        if (result.success) {
            console.log(`[替换库 API] 添加排除: "${original_text}" (${original_type})`);
            res.json({
                success: true,
                message: '已添加到排除规则',
                id: result.id,
                updated: result.updated
            });
        } else {
            res.status(400).json({ success: false, error: result.error });
        }
    } catch (error) {
        console.error('[替换库 API] 添加排除失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/matching-dict/check-exclude
 * 检查是否被排除
 */
router.get('/check-exclude', (req, res) => {
    try {
        const { text, type } = req.query;

        if (!text || !type) {
            return res.status(400).json({
                success: false,
                error: '请提供 text 和 type'
            });
        }

        const isExcluded = dictService.isExcluded(text, type);

        res.json({
            success: true,
            excluded: isExcluded
        });
    } catch (error) {
        console.error('[替换库 API] 检查排除失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;