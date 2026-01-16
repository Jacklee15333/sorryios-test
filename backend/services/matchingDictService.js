/**
 * 匹配词典服务 v1.0
 * 文件位置: backend/services/matchingDictService.js
 * 
 * 📦 功能说明：
 * - 管理匹配词典（matching.db）
 * - 存储人工确认的匹配规则
 * - 支持 match（确认匹配）和 exclude（排除）两种动作
 * 
 * 📦 数据库位置：backend/data/matching.db
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// 确保数据目录存在
const DATA_DIR = path.join(__dirname, '../data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'matching.db');
const db = new Database(DB_PATH);

/**
 * 初始化数据库表
 */
function initDatabase() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS matching_rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            original_text TEXT NOT NULL,
            original_type TEXT NOT NULL,
            action TEXT NOT NULL,
            target_db TEXT,
            target_table TEXT,
            target_id INTEGER,
            target_text TEXT,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_by TEXT DEFAULT 'admin'
        )
    `);

    // 创建索引
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_matching_original ON matching_rules(original_text, original_type);
        CREATE INDEX IF NOT EXISTS idx_matching_action ON matching_rules(action);
    `);

    console.log('[MatchingDictService] v1.0 数据库初始化完成: matching.db');
}

// 初始化
initDatabase();

/**
 * 匹配词典服务类
 */
class MatchingDictService {
    constructor() {
        this.db = db;
        
        // 缓存，提高查询性能
        this.cache = {
            rules: null,
            lastUpdate: null
        };
        
        this.refreshCache();
    }

    /**
     * 刷新缓存
     */
    refreshCache() {
        try {
            const rules = db.prepare('SELECT * FROM matching_rules').all();
            this.cache.rules = rules;
            this.cache.lastUpdate = Date.now();
            console.log(`[MatchingDictService] 缓存已刷新，共 ${rules.length} 条规则`);
        } catch (e) {
            console.error('[MatchingDictService] 刷新缓存失败:', e.message);
            this.cache.rules = [];
        }
    }

    /**
     * 检查缓存是否需要刷新（5分钟）
     */
    checkCache() {
        if (!this.cache.lastUpdate || Date.now() - this.cache.lastUpdate > 5 * 60 * 1000) {
            this.refreshCache();
        }
    }

    /**
     * 查询匹配规则
     * @param {string} text - 原始文本
     * @param {string} type - 类型 (word/phrase/pattern/grammar)
     * @returns {Object|null} 匹配规则或 null
     */
    findRule(text, type) {
        this.checkCache();
        
        const normalizedText = text.toLowerCase().trim();
        const normalizedType = type.toLowerCase().trim();
        
        // 在缓存中查找
        const rule = this.cache.rules.find(r => 
            r.original_text.toLowerCase().trim() === normalizedText &&
            r.original_type.toLowerCase().trim() === normalizedType
        );
        
        return rule || null;
    }

    /**
     * 添加匹配规则
     * @param {Object} data - 规则数据
     * @returns {Object} { success, id?, error? }
     */
    addRule(data) {
        try {
            const {
                original_text,
                original_type,
                action,
                target_db = null,
                target_table = null,
                target_id = null,
                target_text = null,
                notes = null,
                created_by = 'admin'
            } = data;

            // 验证必填字段
            if (!original_text || !original_type || !action) {
                return { success: false, error: '缺少必填字段' };
            }

            // 验证 action
            if (!['match', 'exclude'].includes(action)) {
                return { success: false, error: '无效的 action，只能是 match 或 exclude' };
            }

            // 检查是否已存在
            const existing = this.findRule(original_text, original_type);
            if (existing) {
                // 更新现有规则
                const stmt = db.prepare(`
                    UPDATE matching_rules SET
                        action = ?,
                        target_db = ?,
                        target_table = ?,
                        target_id = ?,
                        target_text = ?,
                        notes = ?,
                        created_at = CURRENT_TIMESTAMP,
                        created_by = ?
                    WHERE id = ?
                `);
                stmt.run(
                    action,
                    target_db,
                    target_table,
                    target_id,
                    target_text,
                    notes,
                    created_by,
                    existing.id
                );
                this.refreshCache();
                return { success: true, id: existing.id, updated: true };
            }

            // 插入新规则
            const stmt = db.prepare(`
                INSERT INTO matching_rules (
                    original_text, original_type, action,
                    target_db, target_table, target_id, target_text,
                    notes, created_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            const result = stmt.run(
                original_text.trim(),
                original_type.toLowerCase().trim(),
                action,
                target_db,
                target_table,
                target_id,
                target_text,
                notes,
                created_by
            );

            this.refreshCache();
            return { success: true, id: result.lastInsertRowid };
        } catch (e) {
            console.error('[MatchingDictService] 添加规则失败:', e.message);
            return { success: false, error: e.message };
        }
    }

    /**
     * 删除规则
     * @param {number} id - 规则ID
     * @returns {Object} { success, error? }
     */
    deleteRule(id) {
        try {
            const result = db.prepare('DELETE FROM matching_rules WHERE id = ?').run(id);
            this.refreshCache();
            return { success: result.changes > 0 };
        } catch (e) {
            console.error('[MatchingDictService] 删除规则失败:', e.message);
            return { success: false, error: e.message };
        }
    }

    /**
     * 更新规则
     * @param {number} id - 规则ID
     * @param {Object} data - 更新数据
     * @returns {Object} { success, error? }
     */
    updateRule(id, data) {
        try {
            const existing = db.prepare('SELECT * FROM matching_rules WHERE id = ?').get(id);
            if (!existing) {
                return { success: false, error: '规则不存在' };
            }

            const updates = [];
            const values = [];

            if (data.action !== undefined) {
                updates.push('action = ?');
                values.push(data.action);
            }
            if (data.target_db !== undefined) {
                updates.push('target_db = ?');
                values.push(data.target_db);
            }
            if (data.target_table !== undefined) {
                updates.push('target_table = ?');
                values.push(data.target_table);
            }
            if (data.target_id !== undefined) {
                updates.push('target_id = ?');
                values.push(data.target_id);
            }
            if (data.target_text !== undefined) {
                updates.push('target_text = ?');
                values.push(data.target_text);
            }
            if (data.notes !== undefined) {
                updates.push('notes = ?');
                values.push(data.notes);
            }

            if (updates.length === 0) {
                return { success: false, error: '没有要更新的字段' };
            }

            values.push(id);
            const sql = `UPDATE matching_rules SET ${updates.join(', ')} WHERE id = ?`;
            db.prepare(sql).run(...values);

            this.refreshCache();
            return { success: true };
        } catch (e) {
            console.error('[MatchingDictService] 更新规则失败:', e.message);
            return { success: false, error: e.message };
        }
    }

    /**
     * 获取所有规则
     * @param {Object} options - 查询选项
     * @returns {Array} 规则列表
     */
    getAllRules(options = {}) {
        const { action, type, search, limit = 100, offset = 0 } = options;

        let sql = 'SELECT * FROM matching_rules WHERE 1=1';
        const params = [];

        if (action) {
            sql += ' AND action = ?';
            params.push(action);
        }
        if (type) {
            sql += ' AND original_type = ?';
            params.push(type);
        }
        if (search) {
            sql += ' AND (original_text LIKE ? OR target_text LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }

        sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        return db.prepare(sql).all(...params);
    }

    /**
     * 获取规则总数
     */
    getCount(options = {}) {
        const { action, type } = options;

        let sql = 'SELECT COUNT(*) as count FROM matching_rules WHERE 1=1';
        const params = [];

        if (action) {
            sql += ' AND action = ?';
            params.push(action);
        }
        if (type) {
            sql += ' AND original_type = ?';
            params.push(type);
        }

        return db.prepare(sql).get(...params).count;
    }

    /**
     * 获取统计信息
     */
    getStats() {
        const total = db.prepare('SELECT COUNT(*) as count FROM matching_rules').get().count;
        const matchCount = db.prepare('SELECT COUNT(*) as count FROM matching_rules WHERE action = ?').get('match').count;
        const excludeCount = db.prepare('SELECT COUNT(*) as count FROM matching_rules WHERE action = ?').get('exclude').count;
        
        const byType = db.prepare(`
            SELECT original_type, COUNT(*) as count 
            FROM matching_rules 
            GROUP BY original_type
        `).all();

        return {
            total,
            match: matchCount,
            exclude: excludeCount,
            byType
        };
    }

    /**
     * 通过ID获取规则
     */
    getById(id) {
        return db.prepare('SELECT * FROM matching_rules WHERE id = ?').get(id);
    }

    /**
     * 关闭数据库连接
     */
    close() {
        db.close();
    }
}

// 单例模式
let instance = null;

function getMatchingDictService() {
    if (!instance) {
        instance = new MatchingDictService();
    }
    return instance;
}

module.exports = {
    MatchingDictService,
    getMatchingDictService
};
