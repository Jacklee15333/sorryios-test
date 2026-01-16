/**
 * 处理日志 API 路由 v5.2
 * 文件位置: backend/routes/processing-log-api.js
 * 
 * 📦 v5.1 更新：
 * - 新增：清空所有数据接口 POST /clear-all
 * 
 * 📦 v5.2 修复：
 * - 清空数据现在也删除 tasks 记录
 * 
 * 提供处理日志的查询、审核、入库等接口
 */

const express = require('express');
const router = express.Router();
const { getProcessingLogService } = require('../services/processingLogService');
const { getVocabularyService } = require('../services/vocabularyService');
const { getGrammarService } = require('../services/grammarService');

// 获取服务实例
const logService = getProcessingLogService();
const vocabularyService = getVocabularyService();
const grammarService = getGrammarService();

// ============================================
// 统计接口
// ============================================

/**
 * GET /api/processing-log/stats
 * 获取总体统计
 */
router.get('/stats', (req, res) => {
    try {
        const tasksSummary = logService.getTasksSummary();
        const pendingStats = logService.getPendingStats();
        const todayStats = logService.getTodayStats();

        res.json({
            success: true,
            data: {
                tasks: tasksSummary,
                pending: pendingStats,
                today: todayStats
            }
        });
    } catch (error) {
        console.error('[ProcessingLog API] 获取统计失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 任务接口
// ============================================

/**
 * GET /api/processing-log/tasks
 * 获取任务列表
 */
router.get('/tasks', (req, res) => {
    try {
        const { status, userId, limit = 50, offset = 0 } = req.query;
        const tasks = logService.getTasks({
            status,
            userId: userId ? parseInt(userId) : null,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        res.json({
            success: true,
            data: tasks,
            total: tasks.length
        });
    } catch (error) {
        console.error('[ProcessingLog API] 获取任务列表失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/processing-log/tasks/:taskId
 * 获取任务详情（包含匹配记录和未匹配记录）
 */
router.get('/tasks/:taskId', (req, res) => {
    try {
        const { taskId } = req.params;
        const task = logService.getTask(taskId);

        if (!task) {
            return res.status(404).json({ success: false, error: '任务不存在' });
        }

        const matchedItems = logService.getMatchedItems(taskId);
        const unmatchedItems = logService.getUnmatchedItems(taskId);

        // 分类匹配项
        const exactMatches = matchedItems.filter(m => m.match_score >= 1.0);
        const fuzzyMatches = matchedItems.filter(m => m.match_score < 1.0);

        res.json({
            success: true,
            data: {
                task,
                exactMatches,
                fuzzyMatches,
                unmatchedItems,
                summary: {
                    total: matchedItems.length + unmatchedItems.length,
                    exactMatch: exactMatches.length,
                    fuzzyMatch: fuzzyMatches.length,
                    unmatched: unmatchedItems.length,
                    pendingReview: fuzzyMatches.filter(m => m.status === 'pending').length,
                    pendingImport: unmatchedItems.filter(m => m.status === 'pending' || m.status === 'edited').length
                }
            }
        });
    } catch (error) {
        console.error('[ProcessingLog API] 获取任务详情失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 匹配记录接口
// ============================================

/**
 * GET /api/processing-log/pending-matches
 * 获取所有待审核的模糊匹配
 */
router.get('/pending-matches', (req, res) => {
    try {
        const { limit = 100 } = req.query;
        const items = logService.getAllPendingMatches(parseInt(limit));

        res.json({
            success: true,
            data: items,
            total: items.length
        });
    } catch (error) {
        console.error('[ProcessingLog API] 获取待审核匹配失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/processing-log/matches/:id/confirm
 * 确认匹配正确
 */
router.post('/matches/:id/confirm', (req, res) => {
    try {
        const { id } = req.params;
        const { reviewedBy } = req.body;

        const result = logService.confirmMatch(parseInt(id), reviewedBy);
        if (result.success) {
            res.json({ success: true, message: '已确认' });
        } else {
            res.status(400).json({ success: false, error: '确认失败' });
        }
    } catch (error) {
        console.error('[ProcessingLog API] 确认匹配失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/processing-log/matches/:id/reject
 * 标记匹配错误
 */
router.post('/matches/:id/reject', (req, res) => {
    try {
        const { id } = req.params;
        const { reviewedBy, notes } = req.body;

        const result = logService.rejectMatch(parseInt(id), reviewedBy, notes);
        if (result.success) {
            res.json({ success: true, message: '已标记为错误' });
        } else {
            res.status(400).json({ success: false, error: '操作失败' });
        }
    } catch (error) {
        console.error('[ProcessingLog API] 标记匹配错误失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/processing-log/matches/confirm-all
 * 批量确认任务的所有待审核匹配
 */
router.post('/matches/confirm-all', (req, res) => {
    try {
        const { taskId, reviewedBy } = req.body;
        if (!taskId) {
            return res.status(400).json({ success: false, error: '请提供任务ID' });
        }

        const result = logService.confirmMatchesByTask(taskId, reviewedBy);
        res.json({
            success: true,
            message: `已确认 ${result.count} 条记录`,
            count: result.count
        });
    } catch (error) {
        console.error('[ProcessingLog API] 批量确认失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 未匹配记录接口
// ============================================

/**
 * GET /api/processing-log/pending-unmatched
 * 获取所有待完善的未匹配项
 */
router.get('/pending-unmatched', (req, res) => {
    try {
        const { limit = 100 } = req.query;
        const items = logService.getAllPendingUnmatched(parseInt(limit));

        res.json({
            success: true,
            data: items,
            total: items.length
        });
    } catch (error) {
        console.error('[ProcessingLog API] 获取待完善项失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/processing-log/unmatched/:id
 * 获取单个未匹配记录详情
 */
router.get('/unmatched/:id', (req, res) => {
    try {
        const { id } = req.params;
        const item = logService.getUnmatchedItemById(parseInt(id));

        if (!item) {
            return res.status(404).json({ success: false, error: '记录不存在' });
        }

        res.json({ success: true, data: item });
    } catch (error) {
        console.error('[ProcessingLog API] 获取未匹配记录失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/processing-log/unmatched/:id
 * 编辑未匹配记录
 */
router.put('/unmatched/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { editedContent } = req.body;

        if (!editedContent) {
            return res.status(400).json({ success: false, error: '请提供编辑内容' });
        }

        const result = logService.updateUnmatchedItem(parseInt(id), editedContent);
        if (result.success) {
            res.json({ success: true, message: '保存成功' });
        } else {
            res.status(400).json({ success: false, error: '保存失败' });
        }
    } catch (error) {
        console.error('[ProcessingLog API] 编辑未匹配记录失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/processing-log/unmatched/:id/import
 * 完善入库
 */
router.post('/unmatched/:id/import', (req, res) => {
    try {
        const { id } = req.params;
        const { targetType, reviewedBy } = req.body;

        // 获取记录
        const item = logService.getUnmatchedItemById(parseInt(id));
        if (!item) {
            return res.status(404).json({ success: false, error: '记录不存在' });
        }

        // 使用编辑后的内容，如果没有则用 AI 生成的
        const content = item.edited_content || item.ai_generated;
        if (!content || Object.keys(content).length === 0) {
            return res.status(400).json({ success: false, error: '没有可入库的内容' });
        }

        // 确定目标类型
        const type = targetType || item.item_type;
        let importResult = null;
        let importedTo = '';
        let importedId = 0;

        // 根据类型入库
        if (type === 'word') {
            importResult = vocabularyService.addWord({
                word: item.original_text,
                phonetic: content.phonetic || '',
                pos: content.pos || '',
                meaning: content.meaning || '',
                example: content.example || '',
                category: content.category || '其他'
            });
            importedTo = 'words';
        } else if (type === 'phrase') {
            importResult = vocabularyService.addPhrase({
                phrase: item.original_text,
                meaning: content.meaning || '',
                example: content.example || '',
                category: content.category || '其他'
            });
            importedTo = 'phrases';
        } else if (type === 'pattern') {
            importResult = vocabularyService.addPattern({
                pattern: item.original_text,
                meaning: content.meaning || '',
                example: content.example || '',
                category: content.category || '其他'
            });
            importedTo = 'patterns';
        } else if (type === 'grammar') {
            importResult = grammarService.add({
                title: item.original_text,
                keywords: content.keywords || [item.original_text],
                definition: content.definition || '',
                structure: content.structure || '',
                usage: content.usage || [],
                examples: content.examples || [],
                mistakes: content.mistakes || [],
                category: content.category || '其他'
            });
            importedTo = 'grammar';
        } else {
            return res.status(400).json({ success: false, error: '不支持的类型: ' + type });
        }

        if (!importResult || !importResult.success) {
            return res.status(400).json({
                success: false,
                error: importResult?.error || '入库失败'
            });
        }

        importedId = importResult.id;

        // 更新日志记录状态
        logService.markAsImported(parseInt(id), importedTo, importedId, reviewedBy);

        res.json({
            success: true,
            message: '入库成功',
            importedTo,
            importedId
        });
    } catch (error) {
        console.error('[ProcessingLog API] 入库失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/processing-log/unmatched/:id/ignore
 * 忽略未匹配记录
 */
router.post('/unmatched/:id/ignore', (req, res) => {
    try {
        const { id } = req.params;
        const { reviewedBy, notes } = req.body;

        const result = logService.ignoreUnmatchedItem(parseInt(id), reviewedBy, notes);
        if (result.success) {
            res.json({ success: true, message: '已忽略' });
        } else {
            res.status(400).json({ success: false, error: '操作失败' });
        }
    } catch (error) {
        console.error('[ProcessingLog API] 忽略记录失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// v5.2 修复：清空数据接口
// ============================================

/**
 * POST /api/processing-log/clear-all
 * 清空所有匹配记录、未匹配记录和任务记录
 * 需要在 body 中传入 { confirm: "确认清除" } 才能执行
 */
router.post('/clear-all', (req, res) => {
    try {
        const { confirm } = req.body;
        
        // 安全检查：必须输入确认文字
        if (confirm !== '确认清除') {
            return res.status(400).json({ 
                success: false, 
                error: '请输入正确的确认文字' 
            });
        }
        
        // 执行清空
        const result = logService.clearAllData();
        
        console.log(`[ProcessingLog API] 数据已清空: 任务 ${result.tasks} 条, 匹配记录 ${result.matched} 条, 未匹配记录 ${result.unmatched} 条`);
        
        res.json({
            success: true,
            message: '清空成功',
            deleted: result
        });
    } catch (error) {
        console.error('[ProcessingLog API] 清空数据失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;