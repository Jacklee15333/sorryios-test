/**
 * 处理日志 API 路由 v5.4.1
 * 文件位置: backend/routes/processing-log-api.js
 * 
 * 📦 v5.4.1 修复：
 * - 简化：排除逻辑改为 action='replace' + target_text=''
 * - 统一：排除和替换都在替换库中，target_text空=跳过
 * 
 * 📦 v5.4 更新：
 * - 新增：GET /matches/:id - 获取单条匹配记录
 * - 新增：POST /matches/:id/exclude - 排除误匹配
 * 
 * 📦 v5.3 更新：
 * - 修复：确认匹配后自动保存到替换库，下次直接100%匹配
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
const { getMatchingDictService } = require('../services/matchingDictService');

// 获取服务实例
const logService = getProcessingLogService();
const vocabularyService = getVocabularyService();
const grammarService = getGrammarService();
const matchingDictService = getMatchingDictService();

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
 * v5.3: 确认后自动保存到替换库
 */
router.post('/matches/:id/confirm', (req, res) => {
    try {
        const { id } = req.params;
        const { reviewedBy } = req.body;

        // v5.3: 先获取匹配记录详情
        const matchedItem = logService.db.prepare('SELECT * FROM matched_items WHERE id = ?').get(parseInt(id));
        
        if (!matchedItem) {
            return res.status(404).json({ success: false, error: '匹配记录不存在' });
        }

        // 确认匹配状态
        const result = logService.confirmMatch(parseInt(id), reviewedBy);
        
        if (result.success) {
            // v5.3: 同时保存到替换库，这样下次就100%匹配了
            if (matchedItem.original_text && matchedItem.matched_text) {
                const ruleResult = matchingDictService.addRule({
                    original_text: matchedItem.original_text,
                    original_type: matchedItem.item_type || 'phrase',
                    action: 'replace',
                    target_text: matchedItem.matched_text,
                    target_db: matchedItem.matched_db,
                    target_table: matchedItem.matched_table,
                    target_id: matchedItem.matched_id,
                    notes: `确认匹配: ${matchedItem.original_text} → ${matchedItem.matched_text}`,
                    created_by: reviewedBy || 'admin'
                });
                
                if (ruleResult.success) {
                    console.log(`[ProcessingLog API] v5.3 已保存替换规则: "${matchedItem.original_text}" → "${matchedItem.matched_text}"`);
                }
            }
            
            res.json({ success: true, message: '已确认，替换规则已保存' });
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
 * GET /api/processing-log/matches/:id
 * 获取单条匹配记录（用于编辑功能）
 * v5.4 新增
 */
router.get('/matches/:id', (req, res) => {
    try {
        const { id } = req.params;
        
        // 简单查询（避免JOIN导致的表结构问题）
        const matchedItem = logService.db.prepare(`
            SELECT * FROM matched_items WHERE id = ?
        `).get(parseInt(id));
        
        if (!matchedItem) {
            return res.status(404).json({ 
                success: false, 
                error: '匹配记录不存在' 
            });
        }
        
        // 解析 matched_data（如果是JSON字符串）
        if (matchedItem.matched_data && typeof matchedItem.matched_data === 'string') {
            try {
                matchedItem.matched_data = JSON.parse(matchedItem.matched_data);
            } catch (e) {
                console.error('[ProcessingLog API] 解析matched_data失败:', e);
            }
        }
        
        // 兼容字段名
        matchedItem.source_db = matchedItem.matched_db;
        matchedItem.source_table = matchedItem.matched_table;
        matchedItem.source_id = matchedItem.matched_id;
        
        res.json({
            success: true,
            data: matchedItem
        });
    } catch (error) {
        console.error('[ProcessingLog API] 获取匹配记录失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/processing-log/matches/:id/exclude
 * 排除误匹配（加入排除库）
 * v5.4 新增
 */
router.post('/matches/:id/exclude', (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        
        // 1. 获取匹配记录
        const matchedItem = logService.db.prepare('SELECT * FROM matched_items WHERE id = ?').get(parseInt(id));
        
        if (!matchedItem) {
            return res.status(404).json({ 
                success: false, 
                error: '匹配记录不存在' 
            });
        }
        
        // 2. 添加到排除库（使用 matchingDictService）
        // 排除规则：只排除当前这一对匹配（original_text → matched_text）
        const excludeResult = matchingDictService.addRule({
            original_text: matchedItem.original_text,
            original_type: matchedItem.item_type || 'phrase',
            action: 'exclude',
            target_text: matchedItem.matched_text,  // 记录匹配到的目标，精确排除
            notes: reason || `用户手动排除：${matchedItem.original_text} → ${matchedItem.matched_text}`,
            created_by: 'admin'
        });
        
        if (!excludeResult.success) {
            return res.status(400).json({ 
                success: false, 
                error: excludeResult.error || '添加排除规则失败' 
            });
        }
        
        // 3. 更新匹配记录状态为 'excluded'
        logService.db.prepare(`
            UPDATE matched_items 
            SET status = 'excluded',
                reviewed_at = CURRENT_TIMESTAMP,
                reviewed_by = 'admin'
            WHERE id = ?
        `).run(parseInt(id));
        
        console.log(`[ProcessingLog API] 已排除匹配: "${matchedItem.original_text}" → "${matchedItem.matched_text}"`);
        
        res.json({
            success: true,
            message: '已加入排除库',
            rule_id: excludeResult.id
        });
        
    } catch (error) {
        console.error('[ProcessingLog API] 排除匹配失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/processing-log/matches/:id
 * v4.5.0 新增：获取单条匹配记录（用于编辑功能）
 */
router.get('/matches/:id', (req, res) => {
    try {
        const { id } = req.params;
        
        // 从 matched_items 表获取记录
        const matchedItem = logService.db.prepare(`
            SELECT * FROM matched_items WHERE id = ?
        `).get(parseInt(id));
        
        if (!matchedItem) {
            return res.status(404).json({ success: false, error: '匹配记录不存在' });
        }
        
        // 解析 matched_data（如果是JSON字符串）
        if (matchedItem.matched_data && typeof matchedItem.matched_data === 'string') {
            try {
                matchedItem.matched_data = JSON.parse(matchedItem.matched_data);
            } catch (e) {
                console.error('[ProcessingLog API] 解析 matched_data 失败:', e);
            }
        }
        
        res.json({
            success: true,
            data: {
                id: matchedItem.id,
                task_id: matchedItem.task_id,
                original_text: matchedItem.original_text,
                matched_text: matchedItem.matched_text,
                matched_data: matchedItem.matched_data,
                match_score: matchedItem.match_score,
                item_type: matchedItem.item_type,
                source_db: matchedItem.matched_db || 'vocabulary',
                source_table: matchedItem.matched_table || '',
                source_id: matchedItem.matched_id || 0,
                status: matchedItem.status,
                created_at: matchedItem.created_at
            }
        });
    } catch (error) {
        console.error('[ProcessingLog API] 获取匹配记录失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/processing-log/matches/:id/exclude
 * v4.5.0 新增：排除误匹配（加入替换库，target_text为空）
 */
router.post('/matches/:id/exclude', (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        
        // 1. 获取匹配记录
        const matchedItem = logService.db.prepare(`
            SELECT * FROM matched_items WHERE id = ?
        `).get(parseInt(id));
        
        if (!matchedItem) {
            return res.status(404).json({ success: false, error: '匹配记录不存在' });
        }
        
        // 2. 添加到替换库（target_text 为空 = 排除）
        // v4.5.1: 简化排除逻辑 - 排除就是替换成空值
        const excludeResult = matchingDictService.addRule({
            original_text: matchedItem.original_text,
            original_type: matchedItem.item_type || 'phrase',
            action: 'replace',      // 统一用 replace
            target_text: '',        // 空字符串 = 跳过不处理
            notes: reason || '用户手动排除（误匹配）',
            created_by: 'admin'
        });
        
        if (!excludeResult.success) {
            return res.status(400).json({ 
                success: false, 
                error: excludeResult.error || '加入替换库失败' 
            });
        }
        
        // 3. 更新匹配记录状态为 'excluded'
        logService.db.prepare(`
            UPDATE matched_items 
            SET status = 'excluded', reviewed_at = datetime('now')
            WHERE id = ?
        `).run(parseInt(id));
        
        console.log(`[ProcessingLog API] v4.5.1 已排除: "${matchedItem.original_text}" (替换为空值)`);
        
        res.json({ 
            success: true, 
            message: '已加入替换库（排除）',
            rule: {
                original_text: matchedItem.original_text,
                action: 'replace',
                target_text: ''  // 空值 = 跳过
            }
        });
    } catch (error) {
        console.error('[ProcessingLog API] 排除匹配失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/processing-log/matches/confirm-all
 * 批量确认任务的所有待审核匹配
 * v5.3: 批量确认后也保存到替换库
 */
router.post('/matches/confirm-all', (req, res) => {
    try {
        const { taskId, reviewedBy } = req.body;
        if (!taskId) {
            return res.status(400).json({ success: false, error: '请提供任务ID' });
        }

        // v5.3: 先获取所有待确认的匹配记录
        const pendingMatches = logService.db.prepare(`
            SELECT * FROM matched_items 
            WHERE task_id = ? AND status = 'pending'
        `).all(taskId);

        // 执行批量确认
        const result = logService.confirmMatchesByTask(taskId, reviewedBy);
        
        // v5.3: 批量保存到替换库
        let savedCount = 0;
        for (const item of pendingMatches) {
            if (item.original_text && item.matched_text) {
                const ruleResult = matchingDictService.addRule({
                    original_text: item.original_text,
                    original_type: item.item_type || 'phrase',
                    action: 'replace',
                    target_text: item.matched_text,
                    target_db: item.matched_db,
                    target_table: item.matched_table,
                    target_id: item.matched_id,
                    notes: `批量确认: ${item.original_text} → ${item.matched_text}`,
                    created_by: reviewedBy || 'admin'
                });
                if (ruleResult.success) savedCount++;
            }
        }
        
        console.log(`[ProcessingLog API] v5.3 批量确认: ${result.count} 条记录, 保存替换规则: ${savedCount} 条`);
        
        res.json({
            success: true,
            message: `已确认 ${result.count} 条记录，保存 ${savedCount} 条替换规则`,
            count: result.count,
            savedRules: savedCount
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