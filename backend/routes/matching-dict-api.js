/**
 * 匹配词典 API 路由 v1.1
 * 文件位置: backend/routes/matching-dict-api.js
 * 
 * 📦 v1.0 功能说明：
 * - 提供匹配词典的增删改查接口
 * - 用于管理人工确认的匹配规则
 * 
 * 📦 v1.1 新增：
 * - POST /api/matching-dict/rules/:id/transfer - 转移到替换库
 */

const express = require('express');
const router = express.Router();
const { getMatchingDictService } = require('../services/matchingDictService');
const { getReplaceService } = require('../services/replaceService');

// 获取服务实例
const dictService = getMatchingDictService();
const replaceService = getReplaceService();

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
        console.error('[MatchingDict API] 获取统计失败:', error);
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
        const { action, type, search, limit = 100, offset = 0 } = req.query;
        
        const rules = dictService.getAllRules({
            action,
            type,
            search,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        const total = dictService.getCount({ action, type });

        res.json({
            success: true,
            data: rules,
            total,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
    } catch (error) {
        console.error('[MatchingDict API] 获取规则列表失败:', error);
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
        console.error('[MatchingDict API] 获取规则失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 添加规则接口
// ============================================

/**
 * POST /api/matching-dict/rules
 * 添加规则（确认匹配或排除）
 */
router.post('/rules', (req, res) => {
    try {
        const {
            original_text,
            original_type,
            action,
            target_db,
            target_table,
            target_id,
            target_text,
            notes,
            created_by = 'admin'
        } = req.body;

        // 验证必填字段
        if (!original_text || !original_type || !action) {
            return res.status(400).json({
                success: false,
                error: '请提供 original_text、original_type 和 action'
            });
        }

        const result = dictService.addRule({
            original_text,
            original_type,
            action,
            target_db,
            target_table,
            target_id,
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
        console.error('[MatchingDict API] 添加规则失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/matching-dict/confirm-match
 * 快捷接口：确认匹配（从待审核页面调用）
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

        if (!original_text || !original_type) {
            return res.status(400).json({
                success: false,
                error: '请提供 original_text 和 original_type'
            });
        }

        const result = dictService.addRule({
            original_text,
            original_type,
            action: 'match',
            target_db,
            target_table,
            target_id,
            target_text,
            created_by
        });

        if (result.success) {
            res.json({ success: true, message: '匹配已确认并记录', id: result.id });
        } else {
            res.status(400).json({ success: false, error: result.error });
        }
    } catch (error) {
        console.error('[MatchingDict API] 确认匹配失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/matching-dict/exclude
 * 快捷接口：排除（从待审核页面调用）
 */
router.post('/exclude', (req, res) => {
    try {
        const {
            original_text,
            original_type,
            notes,
            created_by = 'admin'
        } = req.body;

        if (!original_text || !original_type) {
            return res.status(400).json({
                success: false,
                error: '请提供 original_text 和 original_type'
            });
        }

        const result = dictService.addRule({
            original_text,
            original_type,
            action: 'exclude',
            notes: notes || `不是${original_type}`,
            created_by
        });

        if (result.success) {
            res.json({ success: true, message: '已添加到排除名单', id: result.id });
        } else {
            res.status(400).json({ success: false, error: result.error });
        }
    } catch (error) {
        console.error('[MatchingDict API] 添加排除失败:', error);
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
        console.error('[MatchingDict API] 更新规则失败:', error);
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
        console.error('[MatchingDict API] 删除规则失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 查询接口（供 matchingService 调用）
// ============================================

/**
 * GET /api/matching-dict/find
 * 查找匹配规则
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
        console.error('[MatchingDict API] 查找规则失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// v1.1 新增：转移功能（匹配词典 → 替换库）
// ============================================

/**
 * POST /api/matching-dict/rules/:id/transfer
 * 将匹配规则转移到其他库
 * 
 * Body:
 * {
 *   target: "replace" | "exclude",  // 目标库
 *   replaceText: "替换后的文本",     // target=replace时必填
 *   deleteSource: true              // 是否删除源数据（默认true）
 * }
 */
router.post('/rules/:id/transfer', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { target = 'replace', replaceText, deleteSource = true } = req.body;
        
        // 获取源规则
        const rule = dictService.getById(id);
        if (!rule) {
            return res.status(404).json({ success: false, error: '规则不存在' });
        }
        
        let result;
        
        if (target === 'replace') {
            // 转移到替换库
            if (!replaceText) {
                return res.status(400).json({ success: false, error: '请提供替换后的文本' });
            }
            
            const addResult = replaceService.addRule({
                original_text: rule.original_text,
                original_type: rule.original_type,
                replace_text: replaceText,
                notes: `从匹配词典转移 (原ID: ${id}, 原动作: ${rule.action})`,
                created_by: 'admin'
            });
            
            if (!addResult || !addResult.success) {
                return res.status(400).json({ 
                    success: false, 
                    error: addResult?.error || '转移失败' 
                });
            }
            
            // 删除源数据
            if (deleteSource) {
                dictService.deleteRule(id);
            }
            
            console.log(`[MatchingDict API] 转移成功: 匹配规则#${id} "${rule.original_text}" → 替换库#${addResult.id}`);
            
            result = {
                sourceId: id,
                sourceText: rule.original_text,
                sourceType: 'matching',
                targetType: 'replace',
                targetId: addResult.id,
                replaceText: replaceText,
                deleted: deleteSource
            };
            
        } else if (target === 'exclude') {
            // 转移到排除库（更改action为exclude）
            if (rule.action === 'exclude') {
                return res.status(400).json({ success: false, error: '该规则已经是排除状态' });
            }
            
            // 更新为排除状态
            dictService.updateRule(id, { action: 'exclude' });
            
            console.log(`[MatchingDict API] 转移成功: 匹配规则#${id} "${rule.original_text}" → 排除库`);
            
            result = {
                sourceId: id,
                sourceText: rule.original_text,
                sourceType: 'matching',
                targetType: 'exclude',
                deleted: false
            };
            
        } else {
            return res.status(400).json({ success: false, error: '无效的目标库' });
        }
        
        res.json({
            success: true,
            message: '转移成功',
            data: result
        });
        
    } catch (error) {
        console.error('[MatchingDict API] 转移失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
