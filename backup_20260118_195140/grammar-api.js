/**
 * 语法库 API 路由
 * 提供语法知识库的增删改查接口
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { getGrammarService } = require('../services/grammarService');

// 获取语法服务实例
const grammarService = getGrammarService();

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

module.exports = router;
