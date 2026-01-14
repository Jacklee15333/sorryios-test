/**
 * 词库 API 路由
 * 提供单词、短语、句型的增删改查接口
 */

const express = require('express');
const router = express.Router();
const { getVocabularyService } = require('../services/vocabularyService');

// 获取词库服务实例
const vocabularyService = getVocabularyService();

// ============================================
// 统计和通用接口
// ============================================

router.get('/stats', (req, res) => {
    try {
        const stats = vocabularyService.getStats();
        res.json({ success: true, data: stats });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/export', (req, res) => {
    try {
        const data = vocabularyService.exportToJson();
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename=vocabulary_database.json');
        res.json(data);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/import', (req, res) => {
    try {
        const { data } = req.body;
        if (!data) {
            return res.status(400).json({ success: false, error: '请提供要导入的数据' });
        }
        const result = vocabularyService.importFromJson(data);
        res.json({ success: true, message: '导入完成', ...result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 单词接口
// ============================================

router.get('/words', (req, res) => {
    try {
        const includeDisabled = req.query.all === 'true';
        const words = vocabularyService.getAllWords(includeDisabled);
        res.json({ success: true, data: words, total: words.length });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/words/categories', (req, res) => {
    try {
        const categories = vocabularyService.getWordCategories();
        res.json({ success: true, data: categories });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/words/search', (req, res) => {
    try {
        const { keyword } = req.query;
        if (!keyword) return res.status(400).json({ success: false, error: '请提供搜索关键词' });
        const results = vocabularyService.searchWords(keyword);
        res.json({ success: true, data: results, total: results.length });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/words/:id', (req, res) => {
    try {
        const word = vocabularyService.getWordById(parseInt(req.params.id));
        if (!word) return res.status(404).json({ success: false, error: '单词不存在' });
        res.json({ success: true, data: word });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/words', (req, res) => {
    try {
        const word = req.body;
        if (!word.word) return res.status(400).json({ success: false, error: '单词不能为空' });
        if (!word.meaning) return res.status(400).json({ success: false, error: '含义不能为空' });
        const result = vocabularyService.addWord(word);
        if (result.success) res.json({ success: true, id: result.id, message: '添加成功' });
        else res.status(400).json({ success: false, error: result.error });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.put('/words/:id', (req, res) => {
    try {
        const word = req.body;
        if (!word.word || !word.meaning) return res.status(400).json({ success: false, error: '单词和含义不能为空' });
        const result = vocabularyService.updateWord(parseInt(req.params.id), word);
        if (result.success) res.json({ success: true, message: '更新成功' });
        else res.status(400).json({ success: false, error: result.error || '更新失败' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/words/:id', (req, res) => {
    try {
        const result = vocabularyService.deleteWord(parseInt(req.params.id));
        if (result.success) res.json({ success: true, message: '删除成功' });
        else res.status(404).json({ success: false, error: '单词不存在' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.patch('/words/:id/toggle', (req, res) => {
    try {
        const result = vocabularyService.toggleWord(parseInt(req.params.id));
        if (result.success) res.json({ success: true, message: '状态已切换' });
        else res.status(404).json({ success: false, error: result.error });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 短语接口
// ============================================

router.get('/phrases', (req, res) => {
    try {
        const includeDisabled = req.query.all === 'true';
        const phrases = vocabularyService.getAllPhrases(includeDisabled);
        res.json({ success: true, data: phrases, total: phrases.length });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/phrases/categories', (req, res) => {
    try {
        const categories = vocabularyService.getPhraseCategories();
        res.json({ success: true, data: categories });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/phrases/search', (req, res) => {
    try {
        const { keyword } = req.query;
        if (!keyword) return res.status(400).json({ success: false, error: '请提供搜索关键词' });
        const results = vocabularyService.searchPhrases(keyword);
        res.json({ success: true, data: results, total: results.length });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/phrases/:id', (req, res) => {
    try {
        const phrase = vocabularyService.getPhraseById(parseInt(req.params.id));
        if (!phrase) return res.status(404).json({ success: false, error: '短语不存在' });
        res.json({ success: true, data: phrase });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/phrases', (req, res) => {
    try {
        const phrase = req.body;
        if (!phrase.phrase) return res.status(400).json({ success: false, error: '短语不能为空' });
        if (!phrase.meaning) return res.status(400).json({ success: false, error: '含义不能为空' });
        const result = vocabularyService.addPhrase(phrase);
        if (result.success) res.json({ success: true, id: result.id, message: '添加成功' });
        else res.status(400).json({ success: false, error: result.error });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.put('/phrases/:id', (req, res) => {
    try {
        const phrase = req.body;
        if (!phrase.phrase || !phrase.meaning) return res.status(400).json({ success: false, error: '短语和含义不能为空' });
        const result = vocabularyService.updatePhrase(parseInt(req.params.id), phrase);
        if (result.success) res.json({ success: true, message: '更新成功' });
        else res.status(400).json({ success: false, error: result.error || '更新失败' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/phrases/:id', (req, res) => {
    try {
        const result = vocabularyService.deletePhrase(parseInt(req.params.id));
        if (result.success) res.json({ success: true, message: '删除成功' });
        else res.status(404).json({ success: false, error: '短语不存在' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.patch('/phrases/:id/toggle', (req, res) => {
    try {
        const result = vocabularyService.togglePhrase(parseInt(req.params.id));
        if (result.success) res.json({ success: true, message: '状态已切换' });
        else res.status(404).json({ success: false, error: result.error });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 句型接口
// ============================================

router.get('/patterns', (req, res) => {
    try {
        const includeDisabled = req.query.all === 'true';
        const patterns = vocabularyService.getAllPatterns(includeDisabled);
        res.json({ success: true, data: patterns, total: patterns.length });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/patterns/categories', (req, res) => {
    try {
        const categories = vocabularyService.getPatternCategories();
        res.json({ success: true, data: categories });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/patterns/search', (req, res) => {
    try {
        const { keyword } = req.query;
        if (!keyword) return res.status(400).json({ success: false, error: '请提供搜索关键词' });
        const results = vocabularyService.searchPatterns(keyword);
        res.json({ success: true, data: results, total: results.length });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/patterns/:id', (req, res) => {
    try {
        const pattern = vocabularyService.getPatternById(parseInt(req.params.id));
        if (!pattern) return res.status(404).json({ success: false, error: '句型不存在' });
        res.json({ success: true, data: pattern });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/patterns', (req, res) => {
    try {
        const pattern = req.body;
        if (!pattern.pattern) return res.status(400).json({ success: false, error: '句型不能为空' });
        if (!pattern.meaning) return res.status(400).json({ success: false, error: '含义不能为空' });
        const result = vocabularyService.addPattern(pattern);
        if (result.success) res.json({ success: true, id: result.id, message: '添加成功' });
        else res.status(400).json({ success: false, error: result.error });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.put('/patterns/:id', (req, res) => {
    try {
        const pattern = req.body;
        if (!pattern.pattern || !pattern.meaning) return res.status(400).json({ success: false, error: '句型和含义不能为空' });
        const result = vocabularyService.updatePattern(parseInt(req.params.id), pattern);
        if (result.success) res.json({ success: true, message: '更新成功' });
        else res.status(400).json({ success: false, error: result.error || '更新失败' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/patterns/:id', (req, res) => {
    try {
        const result = vocabularyService.deletePattern(parseInt(req.params.id));
        if (result.success) res.json({ success: true, message: '删除成功' });
        else res.status(404).json({ success: false, error: '句型不存在' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.patch('/patterns/:id/toggle', (req, res) => {
    try {
        const result = vocabularyService.togglePattern(parseInt(req.params.id));
        if (result.success) res.json({ success: true, message: '状态已切换' });
        else res.status(404).json({ success: false, error: result.error });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
