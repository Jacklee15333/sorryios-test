/**
 * 处理日志数据库服务
 * 使用独立的 SQLite 数据库存储处理记录
 * 
 * 数据库：processing_logs.db
 * 表：
 *   - processing_tasks: 处理任务记录
 *   - matched_items: 匹配记录（精确+模糊）
 *   - unmatched_items: 未匹配记录
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class ProcessingLogService {
    constructor(dbPath = null) {
        this.dbPath = dbPath || path.join(__dirname, '../data/processing_logs.db');
        this.db = null;
        this.init();
    }

    /**
     * 初始化数据库
     */
    init() {
        const dir = path.dirname(this.dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        this.db = new Database(this.dbPath);
        this.createTables();
        console.log('[ProcessingLogService] 日志数据库已初始化:', this.dbPath);
    }

    /**
     * 创建表结构
     */
    createTables() {
        // 处理任务记录表
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS processing_tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id TEXT UNIQUE,
                user_id INTEGER,
                username TEXT,
                file_name TEXT,
                
                total_items INTEGER DEFAULT 0,
                exact_match_count INTEGER DEFAULT 0,
                fuzzy_match_count INTEGER DEFAULT 0,
                unmatched_count INTEGER DEFAULT 0,
                
                status TEXT DEFAULT 'processing',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 匹配记录表（精确匹配 + 模糊匹配）
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS matched_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id TEXT,
                
                item_type TEXT,
                original_text TEXT,
                
                matched_text TEXT,
                match_score REAL,
                source_db TEXT,
                source_table TEXT,
                source_id INTEGER,
                matched_data TEXT,
                
                status TEXT DEFAULT 'pending',
                reviewed_at DATETIME,
                reviewed_by TEXT,
                notes TEXT,
                
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                
                FOREIGN KEY (task_id) REFERENCES processing_tasks(task_id)
            )
        `);

        // 未匹配记录表
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS unmatched_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id TEXT,
                
                item_type TEXT,
                original_text TEXT,
                
                ai_generated TEXT,
                
                status TEXT DEFAULT 'pending',
                edited_content TEXT,
                imported_to TEXT,
                imported_id INTEGER,
                
                reviewed_at DATETIME,
                reviewed_by TEXT,
                notes TEXT,
                
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                
                FOREIGN KEY (task_id) REFERENCES processing_tasks(task_id)
            )
        `);

        // 创建索引
        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_tasks_task_id ON processing_tasks(task_id);
            CREATE INDEX IF NOT EXISTS idx_tasks_status ON processing_tasks(status);
            CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON processing_tasks(user_id);
            CREATE INDEX IF NOT EXISTS idx_matched_task_id ON matched_items(task_id);
            CREATE INDEX IF NOT EXISTS idx_matched_status ON matched_items(status);
            CREATE INDEX IF NOT EXISTS idx_unmatched_task_id ON unmatched_items(task_id);
            CREATE INDEX IF NOT EXISTS idx_unmatched_status ON unmatched_items(status);
        `);

        console.log('[ProcessingLogService] 数据库表已创建');
    }

    // ============================================
    // 任务操作
    // ============================================

    /**
     * 创建处理任务
     */
    createTask(taskData) {
        const stmt = this.db.prepare(`
            INSERT INTO processing_tasks (task_id, user_id, username, file_name, status)
            VALUES (?, ?, ?, ?, 'processing')
        `);

        try {
            const result = stmt.run(
                taskData.task_id,
                taskData.user_id || null,
                taskData.username || '匿名用户',
                taskData.file_name || ''
            );
            return { success: true, id: result.lastInsertRowid };
        } catch (error) {
            if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                return { success: false, error: '任务ID已存在' };
            }
            throw error;
        }
    }

    /**
     * 更新任务统计
     */
    updateTaskStats(taskId, stats) {
        const stmt = this.db.prepare(`
            UPDATE processing_tasks SET
                total_items = ?,
                exact_match_count = ?,
                fuzzy_match_count = ?,
                unmatched_count = ?,
                status = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE task_id = ?
        `);

        const result = stmt.run(
            stats.total || 0,
            stats.exactMatch || 0,
            stats.fuzzyMatch || 0,
            stats.unmatched || 0,
            stats.status || 'completed',
            taskId
        );
        return { success: result.changes > 0 };
    }

    /**
     * 获取任务详情
     */
    getTask(taskId) {
        const stmt = this.db.prepare('SELECT * FROM processing_tasks WHERE task_id = ?');
        return stmt.get(taskId);
    }

    /**
     * 获取任务列表
     */
    getTasks(options = {}) {
        const { status, userId, limit = 50, offset = 0 } = options;
        
        let sql = 'SELECT * FROM processing_tasks WHERE 1=1';
        const params = [];

        if (status) {
            sql += ' AND status = ?';
            params.push(status);
        }
        if (userId) {
            sql += ' AND user_id = ?';
            params.push(userId);
        }

        sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const stmt = this.db.prepare(sql);
        return stmt.all(...params);
    }

    /**
     * 获取任务统计
     */
    getTasksSummary() {
        const total = this.db.prepare('SELECT COUNT(*) as count FROM processing_tasks').get().count;
        const pending = this.db.prepare(`
            SELECT COUNT(*) as count FROM processing_tasks 
            WHERE task_id IN (
                SELECT DISTINCT task_id FROM matched_items WHERE status = 'pending'
                UNION
                SELECT DISTINCT task_id FROM unmatched_items WHERE status = 'pending'
            )
        `).get().count;
        const todayTasks = this.db.prepare(`
            SELECT COUNT(*) as count FROM processing_tasks 
            WHERE date(created_at) = date('now')
        `).get().count;

        return { total, pending, todayTasks };
    }

    // ============================================
    // 匹配记录操作
    // ============================================

    /**
     * 添加匹配记录
     */
    addMatchedItem(item) {
        const stmt = this.db.prepare(`
            INSERT INTO matched_items (
                task_id, item_type, original_text, matched_text, match_score,
                source_db, source_table, source_id, matched_data, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        // 100% 匹配自动确认，85-99% 待审核
        const status = item.match_score >= 1.0 ? 'auto_confirmed' : 'pending';

        const result = stmt.run(
            item.task_id,
            item.item_type,
            item.original_text,
            item.matched_text,
            item.match_score,
            item.source_db,
            item.source_table,
            item.source_id,
            JSON.stringify(item.matched_data || {}),
            status
        );
        return { success: true, id: result.lastInsertRowid };
    }

    /**
     * 批量添加匹配记录
     */
    addMatchedItems(items) {
        const insert = this.db.prepare(`
            INSERT INTO matched_items (
                task_id, item_type, original_text, matched_text, match_score,
                source_db, source_table, source_id, matched_data, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const insertMany = this.db.transaction((items) => {
            for (const item of items) {
                const status = item.match_score >= 1.0 ? 'auto_confirmed' : 'pending';
                insert.run(
                    item.task_id,
                    item.item_type,
                    item.original_text,
                    item.matched_text,
                    item.match_score,
                    item.source_db,
                    item.source_table,
                    item.source_id,
                    JSON.stringify(item.matched_data || {}),
                    status
                );
            }
        });

        insertMany(items);
        return { success: true, count: items.length };
    }

    /**
     * 获取任务的匹配记录
     */
    getMatchedItems(taskId, status = null) {
        let sql = 'SELECT * FROM matched_items WHERE task_id = ?';
        const params = [taskId];

        if (status) {
            sql += ' AND status = ?';
            params.push(status);
        }
        sql += ' ORDER BY id';

        const stmt = this.db.prepare(sql);
        const rows = stmt.all(...params);
        return rows.map(row => ({
            ...row,
            matched_data: JSON.parse(row.matched_data || '{}')
        }));
    }

    /**
     * 确认匹配正确
     */
    confirmMatch(id, reviewedBy = null) {
        const stmt = this.db.prepare(`
            UPDATE matched_items SET
                status = 'confirmed',
                reviewed_at = CURRENT_TIMESTAMP,
                reviewed_by = ?
            WHERE id = ?
        `);
        const result = stmt.run(reviewedBy, id);
        return { success: result.changes > 0 };
    }

    /**
     * 标记匹配错误
     */
    rejectMatch(id, reviewedBy = null, notes = null) {
        const stmt = this.db.prepare(`
            UPDATE matched_items SET
                status = 'rejected',
                reviewed_at = CURRENT_TIMESTAMP,
                reviewed_by = ?,
                notes = ?
            WHERE id = ?
        `);
        const result = stmt.run(reviewedBy, notes, id);
        return { success: result.changes > 0 };
    }

    /**
     * 批量确认匹配
     */
    confirmMatchesByTask(taskId, reviewedBy = null) {
        const stmt = this.db.prepare(`
            UPDATE matched_items SET
                status = 'confirmed',
                reviewed_at = CURRENT_TIMESTAMP,
                reviewed_by = ?
            WHERE task_id = ? AND status = 'pending'
        `);
        const result = stmt.run(reviewedBy, taskId);
        return { success: true, count: result.changes };
    }

    // ============================================
    // 未匹配记录操作
    // ============================================

    /**
     * 添加未匹配记录
     */
    addUnmatchedItem(item) {
        const stmt = this.db.prepare(`
            INSERT INTO unmatched_items (
                task_id, item_type, original_text, ai_generated, status
            ) VALUES (?, ?, ?, ?, 'pending')
        `);

        const result = stmt.run(
            item.task_id,
            item.item_type,
            item.original_text,
            JSON.stringify(item.ai_generated || {})
        );
        return { success: true, id: result.lastInsertRowid };
    }

    /**
     * 批量添加未匹配记录
     */
    addUnmatchedItems(items) {
        const insert = this.db.prepare(`
            INSERT INTO unmatched_items (
                task_id, item_type, original_text, ai_generated, status
            ) VALUES (?, ?, ?, ?, 'pending')
        `);

        const insertMany = this.db.transaction((items) => {
            for (const item of items) {
                insert.run(
                    item.task_id,
                    item.item_type,
                    item.original_text,
                    JSON.stringify(item.ai_generated || {})
                );
            }
        });

        insertMany(items);
        return { success: true, count: items.length };
    }

    /**
     * 获取任务的未匹配记录
     */
    getUnmatchedItems(taskId, status = null) {
        let sql = 'SELECT * FROM unmatched_items WHERE task_id = ?';
        const params = [taskId];

        if (status) {
            sql += ' AND status = ?';
            params.push(status);
        }
        sql += ' ORDER BY id';

        const stmt = this.db.prepare(sql);
        const rows = stmt.all(...params);
        return rows.map(row => ({
            ...row,
            ai_generated: JSON.parse(row.ai_generated || '{}'),
            edited_content: row.edited_content ? JSON.parse(row.edited_content) : null
        }));
    }

    /**
     * 更新未匹配记录（编辑）
     */
    updateUnmatchedItem(id, editedContent) {
        const stmt = this.db.prepare(`
            UPDATE unmatched_items SET
                edited_content = ?,
                status = 'edited',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `);
        const result = stmt.run(JSON.stringify(editedContent), id);
        return { success: result.changes > 0 };
    }

    /**
     * 标记为已入库
     */
    markAsImported(id, importedTo, importedId, reviewedBy = null) {
        const stmt = this.db.prepare(`
            UPDATE unmatched_items SET
                status = 'imported',
                imported_to = ?,
                imported_id = ?,
                reviewed_at = CURRENT_TIMESTAMP,
                reviewed_by = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `);
        const result = stmt.run(importedTo, importedId, reviewedBy, id);
        return { success: result.changes > 0 };
    }

    /**
     * 标记为忽略
     */
    ignoreUnmatchedItem(id, reviewedBy = null, notes = null) {
        const stmt = this.db.prepare(`
            UPDATE unmatched_items SET
                status = 'ignored',
                reviewed_at = CURRENT_TIMESTAMP,
                reviewed_by = ?,
                notes = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `);
        const result = stmt.run(reviewedBy, notes, id);
        return { success: result.changes > 0 };
    }

    /**
     * 获取单个未匹配记录
     */
    getUnmatchedItemById(id) {
        const stmt = this.db.prepare('SELECT * FROM unmatched_items WHERE id = ?');
        const row = stmt.get(id);
        if (!row) return null;
        return {
            ...row,
            ai_generated: JSON.parse(row.ai_generated || '{}'),
            edited_content: row.edited_content ? JSON.parse(row.edited_content) : null
        };
    }

    // ============================================
    // 统计查询
    // ============================================

    /**
     * 获取待审核统计
     */
    getPendingStats() {
        const pendingMatches = this.db.prepare(`
            SELECT COUNT(*) as count FROM matched_items WHERE status = 'pending'
        `).get().count;

        const pendingUnmatched = this.db.prepare(`
            SELECT COUNT(*) as count FROM unmatched_items WHERE status = 'pending'
        `).get().count;

        const editedUnmatched = this.db.prepare(`
            SELECT COUNT(*) as count FROM unmatched_items WHERE status = 'edited'
        `).get().count;

        return {
            pendingMatches,
            pendingUnmatched,
            editedUnmatched,
            total: pendingMatches + pendingUnmatched + editedUnmatched
        };
    }

    /**
     * 获取今日统计
     */
    getTodayStats() {
        const tasks = this.db.prepare(`
            SELECT COUNT(*) as count FROM processing_tasks 
            WHERE date(created_at) = date('now')
        `).get().count;

        const imported = this.db.prepare(`
            SELECT COUNT(*) as count FROM unmatched_items 
            WHERE status = 'imported' AND date(reviewed_at) = date('now')
        `).get().count;

        return { tasks, imported };
    }

    /**
     * 获取所有待审核的模糊匹配
     */
    getAllPendingMatches(limit = 100) {
        const stmt = this.db.prepare(`
            SELECT m.*, t.username, t.file_name
            FROM matched_items m
            JOIN processing_tasks t ON m.task_id = t.task_id
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
        const stmt = this.db.prepare(`
            SELECT u.*, t.username, t.file_name
            FROM unmatched_items u
            JOIN processing_tasks t ON u.task_id = t.task_id
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

    /**
     * 关闭数据库连接
     */
    close() {
        if (this.db) {
            this.db.close();
            console.log('[ProcessingLogService] 数据库连接已关闭');
        }
    }
}

// 单例模式
let instance = null;

function getProcessingLogService(dbPath = null) {
    if (!instance) {
        instance = new ProcessingLogService(dbPath);
    }
    return instance;
}

module.exports = {
    ProcessingLogService,
    getProcessingLogService
};
