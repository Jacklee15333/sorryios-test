/**
 * 语法库 API 路由 v2.1
 * 提供语法知识库的增删改查接口
 * 
 * 📦 v2.0 更新：
 * - 新增 POST /api/grammar/:id/sub-topic 追加子话题
 * - 新增 PUT /api/grammar/:id/sub-topic/:index 更新子话题
 * - 新增 DELETE /api/grammar/:id/sub-topic/:index 删除子话题
 * - 新增 PUT /api/grammar/:id/sub-topics/order 调整子话题排序
 * 
 * 📦 v2.1 更新：
 * - 新增 POST /api/grammar/:id/transfer 转移到词库（单词/短语/句型）
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { getGrammarService } = require('../services/grammarService');
const { getVocabularyService } = require('../services/vocabularyService');

// 获取语法服务实例
const grammarService = getGrammarService();
const vocabularyService = getVocabularyService();

/**
 * GET /api/grammar
 * 获取所有语法点
 */
router.get('/', (req, res) => {
    try {
        const includeDisabled = req.query.all === 'true';
        const grammar = grammarService.getAll(includeDisabled);
        res.json({
            success: true,
            data: grammar,
            total: grammar.length
        });
    } catch (error) {
        console.error('[Grammar API] 获取语法列表失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/grammar/stats
 * 获取统计信息
 */
router.get('/stats', (req, res) => {
    try {
        const stats = grammarService.getStats();
        res.json({ success: true, data: stats });
    } catch (error) {
        console.error('[Grammar API] 获取统计失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/grammar/categories
 * 获取所有分类
 */
router.get('/categories', (req, res) => {
    try {
        const categories = grammarService.getCategories();
        res.json({ success: true, data: categories });
    } catch (error) {
        console.error('[Grammar API] 获取分类失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/grammar/search
 * 搜索语法点
 */
router.get('/search', (req, res) => {
    try {
        const { keyword } = req.query;
        if (!keyword) {
            return res.status(400).json({ success: false, error: '请提供搜索关键词' });
        }
        const results = grammarService.searchByKeyword(keyword);
        res.json({
            success: true,
            data: results,
            total: results.length
        });
    } catch (error) {
        console.error('[Grammar API] 搜索失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/grammar/match
 * 匹配文本中的语法点（用于自动检测）
 */
router.post('/match', (req, res) => {
    try {
        const { text } = req.body;
        if (!text) {
            return res.status(400).json({ success: false, error: '请提供要匹配的文本' });
        }
        const matches = grammarService.matchByKeywords(text);
        res.json({
            success: true,
            data: matches,
            total: matches.length
        });
    } catch (error) {
        console.error('[Grammar API] 匹配失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/grammar/export
 * 导出为 JSON
 */
router.get('/export', (req, res) => {
    try {
        const data = grammarService.exportToJson();
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename=grammar_database.json');
        res.json(data);
    } catch (error) {
        console.error('[Grammar API] 导出失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/grammar/import
 * 从 JSON 导入
 */
router.post('/import', (req, res) => {
    try {
        const { data } = req.body;
        if (!data) {
            return res.status(400).json({ success: false, error: '请提供要导入的数据' });
        }
        
        // 创建临时文件
        const tempPath = path.join(__dirname, '../data/temp_import.json');
        fs.writeFileSync(tempPath, JSON.stringify(data));
        
        const result = grammarService.importFromJson(tempPath);
        
        // 删除临时文件
        fs.unlinkSync(tempPath);
        
        res.json({
            success: true,
            message: `导入完成: 成功 ${result.imported}, 跳过 ${result.skipped}`,
            ...result
        });
    } catch (error) {
        console.error('[Grammar API] 导入失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/grammar/:id
 * 获取单个语法点
 */
router.get('/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const grammar = grammarService.getById(id);
        if (!grammar) {
            return res.status(404).json({ success: false, error: '语法点不存在' });
        }
        res.json({ success: true, data: grammar });
    } catch (error) {
        console.error('[Grammar API] 获取语法点失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/grammar
 * 添加新语法点
 */
router.post('/', (req, res) => {
    try {
        const grammar = req.body;
        
        // 验证必填字段
        if (!grammar.title) {
            return res.status(400).json({ success: false, error: '标题不能为空' });
        }
        if (!grammar.definition) {
            return res.status(400).json({ success: false, error: '定义不能为空' });
        }
        if (!grammar.keywords || grammar.keywords.length === 0) {
            return res.status(400).json({ success: false, error: '至少需要一个关键词' });
        }
        
        const result = grammarService.add(grammar);
        if (result.success) {
            res.json({ success: true, id: result.id, message: '添加成功' });
        } else {
            res.status(400).json({ success: false, error: result.error });
        }
    } catch (error) {
        console.error('[Grammar API] 添加语法点失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/grammar/:id
 * 更新语法点
 */
router.put('/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const grammar = req.body;
        
        // 验证必填字段
        if (!grammar.title) {
            return res.status(400).json({ success: false, error: '标题不能为空' });
        }
        if (!grammar.definition) {
            return res.status(400).json({ success: false, error: '定义不能为空' });
        }
        
        const result = grammarService.update(id, grammar);
        if (result.success) {
            res.json({ success: true, message: '更新成功' });
        } else {
            res.status(400).json({ success: false, error: result.error || '更新失败' });
        }
    } catch (error) {
        console.error('[Grammar API] 更新语法点失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/grammar/:id
 * 删除语法点
 */
router.delete('/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const result = grammarService.delete(id);
        if (result.success) {
            res.json({ success: true, message: '删除成功' });
        } else {
            res.status(404).json({ success: false, error: '语法点不存在' });
        }
    } catch (error) {
        console.error('[Grammar API] 删除语法点失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PATCH /api/grammar/:id/toggle
 * 切换启用/禁用状态
 */
router.patch('/:id/toggle', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const grammar = grammarService.getById(id);
        if (!grammar) {
            return res.status(404).json({ success: false, error: '语法点不存在' });
        }
        
        grammar.enabled = !grammar.enabled;
        const result = grammarService.update(id, grammar);
        
        res.json({
            success: true,
            enabled: grammar.enabled,
            message: grammar.enabled ? '已启用' : '已禁用'
        });
    } catch (error) {
        console.error('[Grammar API] 切换状态失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/grammar/:id/confirm
 * v2.1 新增：确认语法点（取消"新"标记）
 */
router.post('/:id/confirm', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const result = grammarService.confirm(id);
        
        if (result.success) {
            res.json({ success: true, message: '已确认' });
        } else {
            res.status(404).json({ success: false, error: '语法点不存在' });
        }
    } catch (error) {
        console.error('[Grammar API] 确认语法点失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// v2.0 新增：子话题相关接口
// ============================================

/**
 * POST /api/grammar/:id/sub-topic
 * 追加子话题到语法点
 * 
 * Body:
 * {
 *   title: "主语缺失问题",      // 必填：子话题标题
 *   source_type: "unmatched",  // 可选：来源类型
 *   source_id: 123,            // 可选：来源ID
 *   definition: "...",         // 可选：定义
 *   structure: "...",          // 可选：结构
 *   usage: ["...", "..."],     // 可选：用法数组
 *   examples: ["...", "..."],  // 可选：例句数组
 *   mistakes: ["...", "..."]   // 可选：易错点数组
 * }
 */
router.post('/:id/sub-topic', (req, res) => {
    try {
        const grammarId = parseInt(req.params.id);
        const subTopic = req.body;
        
        // 验证必填字段
        if (!subTopic.title) {
            return res.status(400).json({ success: false, error: '子话题标题不能为空' });
        }
        
        const result = grammarService.addSubTopic(grammarId, subTopic);
        
        if (result.success) {
            res.json({
                success: true,
                message: '子话题添加成功',
                subTopicIndex: result.subTopicIndex,
                totalSubTopics: result.totalSubTopics
            });
        } else {
            res.status(400).json({ success: false, error: result.error });
        }
    } catch (error) {
        console.error('[Grammar API] 添加子话题失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/grammar/:id/sub-topic/:index
 * 更新指定子话题
 * 
 * Body: 要更新的字段（title, definition, structure, usage, examples, mistakes）
 */
router.put('/:id/sub-topic/:index', (req, res) => {
    try {
        const grammarId = parseInt(req.params.id);
        const subTopicIndex = parseInt(req.params.index);
        const updates = req.body;
        
        const result = grammarService.updateSubTopic(grammarId, subTopicIndex, updates);
        
        if (result.success) {
            res.json({ success: true, message: '子话题更新成功' });
        } else {
            res.status(400).json({ success: false, error: result.error });
        }
    } catch (error) {
        console.error('[Grammar API] 更新子话题失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/grammar/:id/sub-topic/:index
 * 删除指定子话题
 */
router.delete('/:id/sub-topic/:index', (req, res) => {
    try {
        const grammarId = parseInt(req.params.id);
        const subTopicIndex = parseInt(req.params.index);
        
        const result = grammarService.removeSubTopic(grammarId, subTopicIndex);
        
        if (result.success) {
            res.json({
                success: true,
                message: '子话题删除成功',
                removed: result.removed
            });
        } else {
            res.status(400).json({ success: false, error: result.error });
        }
    } catch (error) {
        console.error('[Grammar API] 删除子话题失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/grammar/:id/sub-topics/order
 * 调整子话题排序
 * 
 * Body:
 * {
 *   order: [2, 0, 1, 3]  // 新的排序（原索引数组）
 * }
 */
router.put('/:id/sub-topics/order', (req, res) => {
    try {
        const grammarId = parseInt(req.params.id);
        const { order } = req.body;
        
        if (!Array.isArray(order)) {
            return res.status(400).json({ success: false, error: '请提供排序数组' });
        }
        
        const result = grammarService.updateSubTopicsOrder(grammarId, order);
        
        if (result.success) {
            res.json({ success: true, message: '排序更新成功' });
        } else {
            res.status(400).json({ success: false, error: result.error });
        }
    } catch (error) {
        console.error('[Grammar API] 更新排序失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// v2.1 新增：转移功能（语法 → 词库）
// ============================================

/**
 * POST /api/grammar/:id/transfer
 * 将语法点转移到词库（单词/短语/句型）
 * 
 * Body:
 * {
 *   targetType: "word" | "phrase" | "pattern",  // 目标类型
 *   deleteSource: true                          // 是否删除源数据（默认true）
 * }
 */
router.post('/:id/transfer', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { targetType, deleteSource = true } = req.body;
        
        // 验证目标类型
        if (!['word', 'phrase', 'pattern'].includes(targetType)) {
            return res.status(400).json({ 
                success: false, 
                error: '无效的目标类型，只能是 word/phrase/pattern' 
            });
        }
        
        // 获取源语法点
        const grammar = grammarService.getById(id);
        if (!grammar) {
            return res.status(404).json({ success: false, error: '语法点不存在' });
        }
        
        let addResult = null;
        let targetId = 0;
        
        // 根据目标类型转移
        if (targetType === 'word') {
            addResult = vocabularyService.addWord({
                word: grammar.title,
                meaning: grammar.definition || '',
                example: (grammar.examples && grammar.examples[0]) || '',
                category: grammar.category || '其他'
            });
        } else if (targetType === 'phrase') {
            addResult = vocabularyService.addPhrase({
                phrase: grammar.title,
                meaning: grammar.definition || '',
                example: (grammar.examples && grammar.examples[0]) || '',
                category: grammar.category || '其他'
            });
        } else if (targetType === 'pattern') {
            addResult = vocabularyService.addPattern({
                pattern: grammar.title,
                meaning: grammar.definition || '',
                example: (grammar.examples && grammar.examples[0]) || '',
                category: grammar.category || '其他'
            });
        }
        
        if (!addResult || !addResult.success) {
            return res.status(400).json({ 
                success: false, 
                error: addResult?.error || '转移失败，目标可能已存在' 
            });
        }
        
        targetId = addResult.id;
        
        // 如果需要删除源数据
        if (deleteSource) {
            grammarService.delete(id);
        }
        
        console.log(`[Grammar API] 转移成功: 语法#${id} "${grammar.title}" → ${targetType}#${targetId}`);
        
        res.json({
            success: true,
            message: '转移成功',
            data: {
                sourceId: id,
                sourceTitle: grammar.title,
                targetType,
                targetId,
                deleted: deleteSource
            }
        });
        
    } catch (error) {
        console.error('[Grammar API] 转移失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
