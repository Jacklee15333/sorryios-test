/**
 * 处理日志服务 v5.4
 * 文件位置: backend/services/processingLogService.js
 * 
 * 📦 v5.4 更新：
 * - 新增：markAsReplaced() 标记为已替换状态
 * - 支持 'replaced' 状态
 * 
 * 📦 v5.3 更新：
 * - 新增：updateUnmatchedAiContent() 更新未匹配项的AI生成内容
 * 
 * 📦 v5.0 更新：
 * - 改为使用主数据库 sorryios.db
 * - 删除 processing_tasks 表（与 tasks 重复）
 * - 匹配统计字段合并到 tasks 表
 * 
 * 📦 v5.0.1 修复：
 * - getTasks 返回数据添加 task_id 字段（兼容前端）
 * 
 * 📦 v5.0.2 修复：
 * - updateTaskStats 参数名转换（兼容 aiProcessor）
 * 
 * 📦 v5.1 更新：
 * - 新增：clearAllData() 清空所有匹配数据
 * 
 * 📦 v5.2 修复：
 * - 修复：clearAllData() 现在也删除 tasks 表的记录
 * 
 * 表结构（在 sorryios.db 中）：
 *   - matched_items: 匹配记录（精确+模糊）
 *   - unmatched_items: 未匹配记录
 */

const { 
    db, 
    TaskDB, 
    MatchedItemDB, 
    UnmatchedItemDB,
    getProcessingStats 
} = require('./database');

class ProcessingLogService {
    constructor() {
        // v5.0: 使用主数据库
        this.db = db;
        console.log('[ProcessingLogService] v5.4: 使用主数据库 sorryios.db');
    }

    // ============================================
    // 任务操作（v5.0: 改用 TaskDB）
    // ============================================

    /**
     * 创建处理任务
     * v5.0: 不再创建 processing_tasks 记录，直接使用 tasks 表
     */
    createTask(taskData) {
        // tasks 表的记录已在 taskQueue.js 中创建
        // 这里只需要确保任务存在
        const task = TaskDB.getById(taskData.task_id);
        if (task) {
            return { success: true, id: task.id };
        }
        return { success: false, error: '任务不存在' };
    }

    /**
     * 更新任务统计
     * v5.0: 更新 tasks 表的统计字段
     * v5.0.2 修复: 转换参数名以匹配 TaskDB.updateMatchStats
     * 
     * aiProcessor 传入: { total_items, exact_match_count, fuzzy_match_count, unmatched_count }
     * TaskDB 期望: { total, exactMatch, fuzzyMatch, unmatched }
     */
    updateTaskStats(taskId, stats) {
        try {
            // v5.0.2: 转换参数名
            const convertedStats = {
                total: stats.total_items || stats.total || 0,
                exactMatch: stats.exact_match_count || stats.exactMatch || 0,
                fuzzyMatch: stats.fuzzy_match_count || stats.fuzzyMatch || 0,
                unmatched: stats.unmatched_count || stats.unmatched || 0
            };
            
            console.log(`[ProcessingLogService] 更新任务统计 ${taskId}:`, convertedStats);
            TaskDB.updateMatchStats(taskId, convertedStats);
            return { success: true };
        } catch (e) {
            console.error('[ProcessingLogService] 更新统计失败:', e.message);
            return { success: false, error: e.message };
        }
    }

    /**
     * 获取任务详情
     * v5.0: 从 tasks 表获取
     */
    getTask(taskId) {
        const task = TaskDB.getById(taskId);
        if (!task) return null;
        
        // 返回兼容旧格式的数据
        return {
            id: task.id,
            task_id: task.id,
            user_id: task.user_id,
            username: task.username,
            file_name: task.file_name,
            total_items: task.total_items || 0,
            exact_match_count: task.exact_match_count || 0,
            fuzzy_match_count: task.fuzzy_match_count || 0,
            unmatched_count: task.unmatched_count || 0,
            status: task.status,
            created_at: task.created_at,
            updated_at: task.completed_at || task.started_at || task.created_at
        };
    }

    /**
     * 获取任务列表
     * v5.0: 从 tasks 表获取
     * v5.0.1 修复: 添加 task_id 字段
     */
    getTasks(options = {}) {
        const { status, userId, limit = 50 } = options;
        
        let tasks;
        if (userId) {
            tasks = TaskDB.getByUserId(userId, limit);
        } else {
            tasks = TaskDB.getAll(limit);
        }
        
        // 如果指定了状态，过滤
        if (status) {
            tasks = tasks.filter(t => t.status === status);
        }
        
        // v5.0.1 修复: 添加 task_id 字段（兼容前端）
        return tasks.map(task => ({
            ...task,
            task_id: task.id  // 添加 task_id 作为 id 的别名
        }));
    }

    /**
     * 获取任务统计
     */
    getTasksSummary() {
        return getProcessingStats();
    }

    // ============================================
    // 匹配记录操作（v5.0: 使用 MatchedItemDB）
    // ============================================

    /**
     * 添加匹配记录
     */
    addMatchedItem(item) {
        return MatchedItemDB.add(item);
    }

    /**
     * 批量添加匹配记录
     */
    addMatchedItems(items) {
        return MatchedItemDB.addBatch(items);
    }

    /**
     * 获取任务的匹配记录
     */
    getMatchedItems(taskId, status = null) {
        return MatchedItemDB.getByTaskId(taskId, status);
    }

    /**
     * 确认匹配
     */
    confirmMatch(id, reviewedBy = null) {
        return { success: MatchedItemDB.confirm(id, reviewedBy) };
    }

    /**
     * 标记匹配错误
     */
    rejectMatch(id, reviewedBy = null, notes = null) {
        return { success: MatchedItemDB.reject(id, reviewedBy, notes) };
    }

    /**
     * 批量确认匹配
     */
    confirmMatchesByTask(taskId, reviewedBy = null) {
        return MatchedItemDB.confirmByTaskId(taskId, reviewedBy);
    }

    // ============================================
    // 未匹配记录操作（v5.0: 使用 UnmatchedItemDB）
    // ============================================

    /**
     * 添加未匹配记录
     */
    addUnmatchedItem(item) {
        return UnmatchedItemDB.add(item);
    }

    /**
     * 批量添加未匹配记录
     */
    addUnmatchedItems(items) {
        return UnmatchedItemDB.addBatch(items);
    }

    /**
     * 获取任务的未匹配记录
     */
    getUnmatchedItems(taskId, status = null) {
        return UnmatchedItemDB.getByTaskId(taskId, status);
    }

    /**
     * 更新未匹配记录（编辑）
     */
    updateUnmatchedItem(id, editedContent) {
        return { success: UnmatchedItemDB.update(id, editedContent) };
    }

    /**
     * 标记为已入库
     */
    markAsImported(id, importedTo, importedId, reviewedBy = null) {
        return { success: UnmatchedItemDB.markImported(id, importedTo, importedId, reviewedBy) };
    }

    /**
     * 标记为忽略
     */
    ignoreUnmatchedItem(id, reviewedBy = null, notes = null) {
        return { success: UnmatchedItemDB.ignore(id, reviewedBy, notes) };
    }

    /**
     * v5.4 新增：标记为已替换
     * @param {number} id - 记录ID
     * @param {string} replaceText - 替换后的文本
     * @param {string} importedTo - 入库到哪个表
     * @param {number} importedId - 入库的ID
     * @param {string} reviewedBy - 审核人
     * @returns {Object} { success }
     */
    markAsReplaced(id, replaceText, importedTo, importedId, reviewedBy = null) {
        try {
            const stmt = db.prepare(`
                UPDATE unmatched_items 
                SET status = 'replaced',
                    notes = ?,
                    imported_to = ?,
                    imported_id = ?,
                    reviewed_by = ?,
                    reviewed_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `);
            const notes = `替换为: ${replaceText}`;
            stmt.run(notes, importedTo, importedId, reviewedBy, id);
            return { success: true };
        } catch (e) {
            console.error('[ProcessingLogService] 标记为已替换失败:', e.message);
            return { success: false, error: e.message };
        }
    }

    /**
     * 获取单个未匹配记录
     */
    getUnmatchedItemById(id) {
        return UnmatchedItemDB.getById(id);
    }

    /**
     * v5.3: 更新未匹配记录的AI生成内容
     * @param {string} taskId - 任务ID
     * @param {string} originalText - 原始文本
     * @param {string} itemType - 类型 (word/phrase/pattern/grammar)
     * @param {Object} aiContent - AI生成的内容
     * @returns {Object} { success, updated }
     */
    updateUnmatchedAiContent(taskId, originalText, itemType, aiContent) {
        try {
            // 先查找记录
            const stmt = db.prepare(`
                SELECT id FROM unmatched_items 
                WHERE task_id = ? AND original_text = ? AND item_type = ?
                LIMIT 1
            `);
            const row = stmt.get(taskId, originalText, itemType);
            
            if (!row) {
                // 如果找不到精确匹配，尝试模糊匹配（忽略大小写）
                const stmtFuzzy = db.prepare(`
                    SELECT id FROM unmatched_items 
                    WHERE task_id = ? AND LOWER(original_text) = LOWER(?) AND item_type = ?
                    LIMIT 1
                `);
                const rowFuzzy = stmtFuzzy.get(taskId, originalText, itemType);
                
                if (!rowFuzzy) {
                    console.warn(`[ProcessingLogService] 未找到记录: ${originalText} (${itemType})`);
                    return { success: false, error: '记录不存在' };
                }
                
                // 更新找到的记录
                const updateStmt = db.prepare(`
                    UPDATE unmatched_items 
                    SET ai_generated = ?
                    WHERE id = ?
                `);
                updateStmt.run(JSON.stringify(aiContent), rowFuzzy.id);
                return { success: true, updated: true };
            }
            
            // 更新AI生成内容
            const updateStmt = db.prepare(`
                UPDATE unmatched_items 
                SET ai_generated = ?
                WHERE id = ?
            `);
            updateStmt.run(JSON.stringify(aiContent), row.id);
            
            return { success: true, updated: true };
        } catch (e) {
            console.error('[ProcessingLogService] 更新AI内容失败:', e.message);
            return { success: false, error: e.message };
        }
    }

    // ============================================
    // 统计查询
    // ============================================

    /**
     * 获取待审核统计
     */
    getPendingStats() {
        return getProcessingStats();
    }

    /**
     * 获取今日统计
     */
    getTodayStats() {
        const tasks = db.prepare(`
            SELECT COUNT(*) as count FROM tasks 
            WHERE date(created_at) = date('now', 'localtime')
        `).get().count;

        const imported = db.prepare(`
            SELECT COUNT(*) as count FROM unmatched_items 
            WHERE status = 'imported' AND date(reviewed_at) = date('now', 'localtime')
        `).get().count;

        // v5.4: 今日替换数
        const replaced = db.prepare(`
            SELECT COUNT(*) as count FROM unmatched_items 
            WHERE status = 'replaced' AND date(reviewed_at) = date('now', 'localtime')
        `).get().count;

        return { tasks, imported, replaced };
    }

    /**
     * 获取所有待审核的模糊匹配
     */
    getAllPendingMatches(limit = 100) {
        const stmt = db.prepare(`
            SELECT m.*, t.title as file_name, u.username
            FROM matched_items m
            LEFT JOIN tasks t ON m.task_id = t.id
            LEFT JOIN users u ON t.user_id = u.id
            WHERE m.status = 'pending'
            ORDER BY m.created_at DESC
            LIMIT ?
        `);
        const rows = stmt.all(limit);
        return rows.map(row => ({
            ...row,
            matched_data: JSON.parse(row.matched_data || '{}')
        }));
    }

    /**
     * 获取所有待完善的未匹配项
     */
    getAllPendingUnmatched(limit = 100) {
        const stmt = db.prepare(`
            SELECT u.*, t.title as file_name, us.username
            FROM unmatched_items u
            LEFT JOIN tasks t ON u.task_id = t.id
            LEFT JOIN users us ON t.user_id = us.id
            WHERE u.status IN ('pending', 'edited')
            ORDER BY u.created_at DESC
            LIMIT ?
        `);
        const rows = stmt.all(limit);
        return rows.map(row => ({
            ...row,
            ai_generated: JSON.parse(row.ai_generated || '{}'),
            edited_content: row.edited_content ? JSON.parse(row.edited_content) : null
        }));
    }

    // ============================================
    // v5.2 修复：清空数据（同时删除 tasks 记录）
    // ============================================

    /**
     * 清空所有匹配记录、未匹配记录和任务记录
     * v5.2 修复: 现在也删除 tasks 表的记录
     * @returns {Object} { matched, unmatched, tasks }
     */
    clearAllData() {
        try {
            // 获取删除前的数量
            const matchedCount = db.prepare('SELECT COUNT(*) as count FROM matched_items').get().count;
            const unmatchedCount = db.prepare('SELECT COUNT(*) as count FROM unmatched_items').get().count;
            const tasksCount = db.prepare('SELECT COUNT(*) as count FROM tasks').get().count;
            
            // 执行删除（顺序很重要，先删子表再删主表）
            db.prepare('DELETE FROM matched_items').run();
            db.prepare('DELETE FROM unmatched_items').run();
            
            // v5.2 新增：同时删除 tasks 表的记录
            db.prepare('DELETE FROM tasks').run();
            
            console.log(`[ProcessingLogService] 已清空数据: matched=${matchedCount}, unmatched=${unmatchedCount}, tasks=${tasksCount}`);
            
            return {
                matched: matchedCount,
                unmatched: unmatchedCount,
                tasks: tasksCount
            };
        } catch (e) {
            console.error('[ProcessingLogService] 清空数据失败:', e.message);
            throw e;
        }
    }

    /**
     * 关闭数据库连接
     * v5.0: 不需要关闭，因为使用主数据库
     */
    close() {
        console.log('[ProcessingLogService] v5.0: 使用主数据库，由主模块管理连接');
    }
}

// 单例模式
let instance = null;

function getProcessingLogService() {
    if (!instance) {
        instance = new ProcessingLogService();
    }
    return instance;
}

module.exports = {
    ProcessingLogService,
    getProcessingLogService
};
