/**
 * 处理日志 API 路由 v5.4.2
 * 文件位置: backend/routes/processing-log-api.js
 * 
 * 📦 v5.4.2 修复：
 * - 新增：GET /exact-matches - 获取所有精准匹配记录(100%)
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
// v5.4.2 新增：精准匹配列表接口
// ============================================

/**
 * GET /api/processing-log/exact-matches
 * 获取所有精准匹配记录（match_score = 1.0）
 * v5.4.2 新增
 */
router.get('/exact-matches', (req, res) => {
    try {
        const { limit = 100, offset = 0 } = req.query;
        
        // 查询所有100%匹配的记录
        const stmt = logService.db.prepare(`
            SELECT 
                m.id,
                m.task_id,
                m.item_type,
                m.original_text,
                m.matched_text,
                m.match_score,
                m.source_db,
                m.source_table,
                m.source_id,
                m.matched_data,
                m.status,
                m.created_at,
                t.title as file_name,
                u.username
            FROM matched_items m
            LEFT JOIN tasks t ON m.task_id = t.id
            LEFT JOIN users u ON t.user_id = u.id
            WHERE m.match_score >= 1.0
            ORDER BY m.created_at DESC
            LIMIT ? OFFSET ?
        `);
        
        const items = stmt.all(parseInt(limit), parseInt(offset));
        
        // 获取总数
        const countStmt = logService.db.prepare(`
            SELECT COUNT(*) as total FROM matched_items WHERE match_score >= 1.0
        `);
        const { total } = countStmt.get();
        
        // 解析 matched_data
        const parsedItems = items.map(item => ({
            ...item,
            matched_data: item.matched_data ? JSON.parse(item.matched_data) : {}
        }));

        res.json({
            success: true,
            items: parsedItems,
            total,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
    } catch (error) {
        console.error('[ProcessingLog API] 获取精准匹配列表失败:', error);
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
                console.warn('[ProcessingLog API] matched_data 不是有效的 JSON:', matchedItem.matched_data);
            }
        }
        
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
 * 排除误匹配（添加到排除规则）
 * v5.4 新增
 * v5.4.1 简化: 改为使用 action='exclude' + target_text=''
 */
router.post('/matches/:id/exclude', (req, res) => {
    try {
        const { id } = req.params;
        const { reviewedBy } = req.body;

        // 获取匹配记录
        const matchedItem = logService.db.prepare('SELECT * FROM matched_items WHERE id = ?').get(parseInt(id));
        
        if (!matchedItem) {
            return res.status(404).json({ success: false, error: '匹配记录不存在' });
        }

        // v5.4.1: 使用 action='exclude' + target_text='' 的新逻辑
        const ruleResult = matchingDictService.addRule({
            original_text: matchedItem.original_text,
            original_type: matchedItem.item_type || 'phrase',
            action: 'exclude',  // v5.4.1: 明确标记为排除
            target_text: '',    // v5.4.1: 排除规则的 target_text 为空
            notes: `排除误匹配: ${matchedItem.original_text}`,
            created_by: reviewedBy || 'admin'
        });
        
        if (!ruleResult.success) {
            return res.status(400).json({ success: false, error: '添加排除规则失败' });
        }
        
        // 标记原匹配记录为已拒绝
        logService.rejectMatch(parseInt(id), reviewedBy, '已添加到排除规则');
        
        console.log(`[ProcessingLog API] v5.4.1 已排除: "${matchedItem.original_text}"`);
        
        res.json({ 
            success: true, 
            message: '已添加到排除规则',
            ruleId: ruleResult.id
        });
        
    } catch (error) {
        console.error('[ProcessingLog API] 排除匹配失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/processing-log/confirm-all-pending
 * 批量确认所有待审核匹配
 * v5.3: 批量保存到替换库
 */
router.post('/confirm-all-pending', (req, res) => {
    try {
        const { reviewedBy } = req.body;
        
        // v5.3: 先获取所有待审核的匹配记录
        const pendingMatches = logService.getAllPendingMatches(1000);
        
        // 批量确认
        const result = logService.db.prepare(`
            UPDATE matched_items 
            SET status = 'confirmed', 
                reviewed_by = ?,
                reviewed_at = CURRENT_TIMESTAMP
            WHERE status = 'pending'
        `).run(reviewedBy || 'admin');
        
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
        
        console.log(`[ProcessingLog API] v5.3 批量确认: ${result.changes} 条记录, 保存替换规则: ${savedCount} 条`);
        
        res.json({
            success: true,
            message: `已确认 ${result.changes} 条记录，保存 ${savedCount} 条替换规则`,
            count: result.changes,
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