/**
 * 排除库服务 v1.0
 * 文件位置: backend/services/excludeService.js
 * 
 * 管理排除项，被排除的项在匹配流程第0步直接跳过
 * 
 * 数据库: exclude.db
 * 表: excluded_items
 */

const Database = require('better-sqlite3');
const path = require('path');

// 数据库路径
const DB_PATH = path.join(__dirname, '../data/exclude.db');

class ExcludeService {
    constructor() {
        this.db = new Database(DB_PATH);
        this.initDatabase();
        console.log('[ExcludeService] v1.0: 排除库服务已启动');
    }

    /**
     * 初始化数据库表
     */
    initDatabase() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS excluded_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                original_text TEXT NOT NULL,
                original_type TEXT NOT NULL,
                reason TEXT,
                is_new INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                created_by TEXT
            )
        `);

        // 创建索引
        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_excluded_text_type 
            ON excluded_items(original_text, original_type)
        `);

        console.log('[ExcludeService] 数据库表初始化完成');
    }

    // ============================================
    // 核心查询方法（用于匹配流程第0步）
    // ============================================

    /**
     * 检查是否被排除
     * @param {string} text - 原始文本
     * @param {string} type - 类型 (word/phrase/pattern/grammar)
     * @returns {boolean} 是否被排除
     */
    isExcluded(text, type) {
        const stmt = this.db.prepare(`
            SELECT id FROM excluded_items 
            WHERE original_text = ? AND original_type = ?
            LIMIT 1
        `);
        const row = stmt.get(text, type);
        return !!row;
    }

    /**
     * 批量检查排除（用于过滤列表）
     * @param {Array} items - [{text, type}, ...]
     * @returns {Set} 被排除的文本集合
     */
    getExcludedSet(items) {
        const excludedSet = new Set();
        
        for (const item of items) {
            if (this.isExcluded(item.text, item.type)) {
                excludedSet.add(`${item.type}:${item.text}`);
            }
        }
        
        return excludedSet;
    }

    /**
     * 根据类型获取所有排除项（用于批量过滤）
     * @param {string} type - 类型
     * @returns {Set} 排除文本集合
     */
    getExcludedTextsByType(type) {
        const stmt = this.db.prepare(`
            SELECT original_text FROM excluded_items WHERE original_type = ?
        `);
        const rows = stmt.all(type);
        return new Set(rows.map(r => r.original_text.toLowerCase()));
    }

    // ============================================
    // CRUD 操作
    // ============================================

    /**
     * 添加排除项
     */
    add(item) {
        try {
            // 检查是否已存在
            const existing = this.db.prepare(`
                SELECT id FROM excluded_items 
                WHERE original_text = ? AND original_type = ?
            `).get(item.original_text, item.original_type);

            if (existing) {
                return { success: false, error: '该项已在排除库中' };
            }

            const stmt = this.db.prepare(`
                INSERT INTO excluded_items (original_text, original_type, reason, is_new, created_by)
                VALUES (?, ?, ?, 1, ?)
            `);
            const result = stmt.run(
                item.original_text,
                item.original_type,
                item.reason || '',
                item.created_by || 'system'
            );

            console.log(`[ExcludeService] 添加排除项: ${item.original_text} (${item.original_type})`);
            return { success: true, id: result.lastInsertRowid };
        } catch (e) {
            console.error('[ExcludeService] 添加失败:', e.message);
            return { success: false, error: e.message };
        }
    }

    /**
     * 获取所有排除项
     */
    getAll(options = {}) {
        const { type, search, limit = 200, offset = 0 } = options;
        
        let sql = 'SELECT * FROM excluded_items WHERE 1=1';
        const params = [];

        if (type) {
            sql += ' AND original_type = ?';
            params.push(type);
        }

        if (search) {
            sql += ' AND original_text LIKE ?';
            params.push(`%${search}%`);
        }

        sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const stmt = this.db.prepare(sql);
        return stmt.all(...params);
    }

    /**
     * 获取单个排除项
     */
    getById(id) {
        const stmt = this.db.prepare('SELECT * FROM excluded_items WHERE id = ?');
        return stmt.get(id);
    }

    /**
     * 更新排除项
     */
    update(id, data) {
        try {
            const stmt = this.db.prepare(`
                UPDATE excluded_items 
                SET original_text = ?, original_type = ?, reason = ?
                WHERE id = ?
            `);
            stmt.run(data.original_text, data.original_type, data.reason || '', id);
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    /**
     * 删除排除项
     */
    delete(id) {
        try {
            const item = this.getById(id);
            if (!item) {
                return { success: false, error: '记录不存在' };
            }

            const stmt = this.db.prepare('DELETE FROM excluded_items WHERE id = ?');
            stmt.run(id);
            
            console.log(`[ExcludeService] 删除排除项: ${item.original_text}`);
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    // ============================================
    // 标新功能
    // ============================================

    /**
     * 取消标新
     */
    clearNew(id) {
        try {
            const stmt = this.db.prepare('UPDATE excluded_items SET is_new = 0 WHERE id = ?');
            stmt.run(id);
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    /**
     * 批量取消标新
     */
    clearAllNew() {
        try {
            const stmt = this.db.prepare('UPDATE excluded_items SET is_new = 0 WHERE is_new = 1');
            const result = stmt.run();
            return { success: true, count: result.changes };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    /**
     * 获取新增数量
     */
    getNewCount() {
        const stmt = this.db.prepare('SELECT COUNT(*) as count FROM excluded_items WHERE is_new = 1');
        return stmt.get().count;
    }

    // ============================================
    // 统计
    // ============================================

    /**
     * 获取统计信息
     */
    getStats() {
        const total = this.db.prepare('SELECT COUNT(*) as count FROM excluded_items').get().count;
        const newCount = this.getNewCount();
        
        const byType = this.db.prepare(`
            SELECT original_type, COUNT(*) as count 
            FROM excluded_items 
            GROUP BY original_type
        `).all();

        const typeStats = {};
        byType.forEach(row => {
            typeStats[row.original_type] = row.count;
        });

        return {
            total,
            newCount,
            byType: typeStats
        };
    }

    // ============================================
    // 数据迁移（从 matching.db 迁移）
    // ============================================

    /**
     * 从 matching.db 迁移 exclude 数据
     */
    migrateFromMatchingDb() {
        try {
            const matchingDbPath = path.join(__dirname, '../data/matching.db');
            const matchingDb = new Database(matchingDbPath);

            // 检查 matching_rules 表是否存在
            const tableExists = matchingDb.prepare(`
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name='matching_rules'
            `).get();

            if (!tableExists) {
                console.log('[ExcludeService] matching_rules 表不存在，跳过迁移');
                matchingDb.close();
                return { success: true, migrated: 0, deleted: 0 };
            }

            // 获取所有 exclude 记录
            const excludeItems = matchingDb.prepare(`
                SELECT * FROM matching_rules WHERE action = 'exclude'
            `).all();

            if (excludeItems.length === 0) {
                console.log('[ExcludeService] 没有需要迁移的 exclude 数据');
                matchingDb.close();
                return { success: true, migrated: 0, deleted: 0 };
            }

            // 迁移到 exclude.db
            let migrated = 0;
            for (const item of excludeItems) {
                const result = this.add({
                    original_text: item.original_text,
                    original_type: item.original_type,
                    reason: item.notes || '从匹配词典迁移',
                    created_by: item.created_by || 'migration'
                });
                if (result.success) {
                    migrated++;
                }
            }

            // 删除 matching.db 中的 exclude 记录
            const deleteResult = matchingDb.prepare(`
                DELETE FROM matching_rules WHERE action = 'exclude'
            `).run();

            matchingDb.close();

            console.log(`[ExcludeService] 迁移完成: 迁移 ${migrated} 条，删除 ${deleteResult.changes} 条`);
            return { 
                success: true, 
                migrated, 
                deleted: deleteResult.changes 
            };
        } catch (e) {
            console.error('[ExcludeService] 迁移失败:', e.message);
            return { success: false, error: e.message };
        }
    }

    /**
     * 关闭数据库连接
     */
    close() {
        this.db.close();
        console.log('[ExcludeService] 数据库连接已关闭');
    }
}

// 单例模式
let instance = null;

function getExcludeService() {
    if (!instance) {
        instance = new ExcludeService();
    }
    return instance;
}

module.exports = {
    ExcludeService,
    getExcludeService
};
