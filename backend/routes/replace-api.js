/**
 * 替换规则 API 路由 v1.1
 * 文件位置: backend/routes/replace-api.js
 * 
 * 📦 v1.0 功能说明：
 * - 提供替换规则的增删改查接口
 * - 用于管理识别错误的替换规则
 * 
 * 📦 v1.1 新增：
 * - POST /api/replace/rules/:id/transfer - 转移到匹配词典
 */

const express = require('express');
const router = express.Router();
const { getReplaceService } = require('../services/replaceService');
const { getVocabularyService } = require('../services/vocabularyService');
const { getGrammarService } = require('../services/grammarService');
const { getMatchingService } = require('../services/matchingService');
const { getMatchingDictService } = require('../services/matchingDictService');

// 获取服务实例
const replaceService = getReplaceService();
const vocabularyService = getVocabularyService();
const grammarService = getGrammarService();
const matchingDictService = getMatchingDictService();

// ============================================
// 统计接口
// ============================================

/**
 * GET /api/replace/stats
 * 获取统计信息
 */
router.get('/stats', (req, res) => {
    try {
        const stats = replaceService.getStats();
        res.json({ success: true, data: stats });
    } catch (error) {
        console.error('[Replace API] 获取统计失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 规则列表接口
// ============================================

/**
 * GET /api/replace/rules
 * 获取规则列表
 */
router.get('/rules', (req, res) => {
    try {
        const { type, search, limit = 100, offset = 0 } = req.query;
        
        const rules = replaceService.getAllRules({
            type,
            search,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        const total = replaceService.getCount({ type });

        res.json({
            success: true,
            data: rules,
            total,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
    } catch (error) {
        console.error('[Replace API] 获取规则列表失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/replace/rules/:id
 * 获取单个规则
 */
router.get('/rules/:id', (req, res) => {
    try {
        const { id } = req.params;
        const rule = replaceService.getById(parseInt(id));
        
        if (!rule) {
            return res.status(404).json({ success: false, error: '规则不存在' });
        }
        
        res.json({ success: true, data: rule });
    } catch (error) {
        console.error('[Replace API] 获取规则失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 添加规则接口
// ============================================

/**
 * POST /api/replace/rules
 * 添加替换规则
 */
router.post('/rules', (req, res) => {
    try {
        const {
            original_text,
            original_type,
            replace_text,
            notes,
            created_by = 'admin'
        } = req.body;

        // 验证必填字段
        if (!original_text || !original_type || !replace_text) {
            return res.status(400).json({
                success: false,
                error: '请提供 original_text、original_type 和 replace_text'
            });
        }

        const result = replaceService.addRule({
            original_text,
            original_type,
            replace_text,
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
        console.error('[Replace API] 添加规则失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/replace/execute
 * 执行替换并入库（从处理日志页面调用）
 * 
 * 流程：
 * 1. 用替换后的文本去匹配词库
 * 2. 匹配到 → 入库
 * 3. 保存替换规则
 * 4. 返回结果
 */
router.post('/execute', (req, res) => {
    try {
        const {
            original_text,
            original_type,
            replace_text,
            created_by = 'admin'
        } = req.body;

        // 验证必填字段
        if (!original_text || !original_type || !replace_text) {
            return res.status(400).json({
                success: false,
                error: '请提供 original_text、original_type 和 replace_text'
            });
        }

        // 1. 用替换后的文本去匹配词库
        const matchingService = getMatchingService();
        let matchResult = null;
        let importResult = null;
        let importedTo = '';
        let importedId = 0;

        if (original_type === 'word') {
            matchResult = matchingService.matchWord(replace_text);
        } else if (original_type === 'phrase') {
            matchResult = matchingService.matchPhrase(replace_text);
        } else if (original_type === 'pattern') {
            matchResult = matchingService.matchPattern(replace_text);
        } else if (original_type === 'grammar') {
            matchResult = matchingService.matchGrammar(replace_text);
        }

        // 2. 根据匹配结果入库
        if (matchResult && matchResult.matched && matchResult.score >= 0.85) {
            // 已有匹配，直接使用现有词条
            importedTo = matchResult.source_table;
            importedId = matchResult.source_id;
            
            console.log(`[Replace API] 匹配成功: "${replace_text}" → ${importedTo}#${importedId} (${matchResult.score})`);
        } else {
            // 没有匹配到，需要新建词条
            if (original_type === 'word') {
                importResult = vocabularyService.addWord({
                    word: replace_text,
                    meaning: '',
                    category: '其他'
                });
                importedTo = 'words';
            } else if (original_type === 'phrase') {
                importResult = vocabularyService.addPhrase({
                    phrase: replace_text,
                    meaning: '',
                    category: '其他'
                });
                importedTo = 'phrases';
            } else if (original_type === 'pattern') {
                importResult = vocabularyService.addPattern({
                    pattern: replace_text,
                    meaning: '',
                    category: '其他'
                });
                importedTo = 'patterns';
            } else if (original_type === 'grammar') {
                importResult = grammarService.add({
                    title: replace_text,
                    keywords: [replace_text],
                    definition: '',
                    category: '其他'
                });
                importedTo = 'grammar';
            }

            if (importResult && importResult.success) {
                importedId = importResult.id;
                console.log(`[Replace API] 新建词条: "${replace_text}" → ${importedTo}#${importedId}`);
            } else {
                // 如果入库失败，可能是已存在
                console.log(`[Replace API] 词条可能已存在: "${replace_text}"`);
            }
        }

        // 3. 保存替换规则
        const ruleResult = replaceService.addRule({
            original_text,
            original_type,
            replace_text,
            notes: `替换后${matchResult?.matched ? '匹配到' : '新建'}词条: ${importedTo}#${importedId}`,
            created_by
        });

        if (!ruleResult.success) {
            return res.status(400).json({
                success: false,
                error: '保存替换规则失败: ' + ruleResult.error
            });
        }

        // 4. 返回结果
        res.json({
            success: true,
            message: '替换成功',
            data: {
                ruleId: ruleResult.id,
                ruleUpdated: ruleResult.updated,
                matched: matchResult?.matched || false,
                matchScore: matchResult?.score || 0,
                importedTo,
                importedId,
                matchedText: matchResult?.matched_text || replace_text
            }
        });

    } catch (error) {
        console.error('[Replace API] 执行替换失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/replace/search-vocab
 * 用替换后的文本搜索词库（预览匹配结果）
 */
router.post('/search-vocab', (req, res) => {
    try {
        const { text, type } = req.body;

        if (!text || !type) {
            return res.status(400).json({
                success: false,
                error: '请提供 text 和 type'
            });
        }

        const matchingService = getMatchingService();
        let matchResult = null;

        if (type === 'word') {
            matchResult = matchingService.matchWord(text);
        } else if (type === 'phrase') {
            matchResult = matchingService.matchPhrase(text);
        } else if (type === 'pattern') {
            matchResult = matchingService.matchPattern(text);
        } else if (type === 'grammar') {
            matchResult = matchingService.matchGrammar(text);
        }

        res.json({
            success: true,
            data: {
                matched: matchResult?.matched || false,
                score: matchResult?.score || 0,
                matchedText: matchResult?.matched_text || null,
                sourceTable: matchResult?.source_table || null,
                sourceId: matchResult?.source_id || null
            }
        });

    } catch (error) {
        console.error('[Replace API] 搜索词库失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 更新和删除接口
// ============================================

/**
 * PUT /api/replace/rules/:id
 * 更新规则
 */
router.put('/rules/:id', (req, res) => {
    try {
        const { id } = req.params;
        const result = replaceService.updateRule(parseInt(id), req.body);

        if (result.success) {
            res.json({ success: true, message: '规则已更新' });
        } else {
            res.status(400).json({ success: false, error: result.error });
        }
    } catch (error) {
        console.error('[Replace API] 更新规则失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/replace/rules/:id
 * 删除规则
 */
router.delete('/rules/:id', (req, res) => {
    try {
        const { id } = req.params;
        const result = replaceService.deleteRule(parseInt(id));

        if (result.success) {
            res.json({ success: true, message: '规则已删除' });
        } else {
            res.status(400).json({ success: false, error: result.error || '删除失败' });
        }
    } catch (error) {
        console.error('[Replace API] 删除规则失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 查询接口（供 matchingService 调用）
// ============================================

/**
 * GET /api/replace/find
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

        const rule = replaceService.findRule(text, type);

        res.json({
            success: true,
            found: !!rule,
            data: rule
        });
    } catch (error) {
        console.error('[Replace API] 查找规则失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// v1.1 新增：转移功能（替换库 → 匹配词典）
// ============================================

/**
 * POST /api/replace/rules/:id/transfer
 * 将替换规则转移到匹配词典
 * 
 * Body:
 * {
 *   action: "match" | "exclude",  // 匹配动作（默认match）
 *   targetText: "目标文本",        // 可选：匹配的目标文本
 *   deleteSource: true            // 是否删除源数据（默认true）
 * }
 */
router.post('/rules/:id/transfer', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { action = 'match', targetText, deleteSource = true } = req.body;
        
        // 获取源规则
        const rule = replaceService.getById(id);
        if (!rule) {
            return res.status(404).json({ success: false, error: '规则不存在' });
        }
        
        // 验证动作
        if (!['match', 'exclude'].includes(action)) {
            return res.status(400).json({ success: false, error: '无效的动作，只能是 match 或 exclude' });
        }
        
        // 添加到匹配词典
        const addResult = matchingDictService.addRule({
            original_text: rule.original_text,
            original_type: rule.original_type,
            action: action,
            target_text: targetText || rule.replace_text,
            notes: `从替换库转移 (原ID: ${id}, 原替换文本: ${rule.replace_text})`,
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
            replaceService.deleteRule(id);
        }
        
        console.log(`[Replace API] 转移成功: 替换规则#${id} "${rule.original_text}" → 匹配词典#${addResult.id}`);
        
        res.json({
            success: true,
            message: '转移成功',
            data: {
                sourceId: id,
                sourceText: rule.original_text,
                sourceType: 'replace',
                targetType: 'matching',
                targetId: addResult.id,
                action: action,
                deleted: deleteSource
            }
        });
        
    } catch (error) {
        console.error('[Replace API] 转移失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
