/**
 * 替换库服务 v2.0
 * 文件位置: backend/services/matchingDictService.js
 * 
 * 📦 v2.0 更新：
 * - 改名：匹配词典 → 替换库
 * - 合并：原 replace.db 功能合并进来
 * - 删除：exclude 功能（已移到 exclude.db）
 * - action 支持 'replace'（替换后重新匹配）
 * 
 * 📦 功能说明：
 * - 管理替换规则（matching.db）
 * - 存储识别错误的替换规则
 * - 在匹配阶段自动将错误文本替换为正确文本
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
            action TEXT NOT NULL DEFAULT 'replace',
            target_db TEXT,
            target_table TEXT,
            target_id INTEGER,
            target_text TEXT,
            notes TEXT,
            use_count INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_by TEXT DEFAULT 'admin'
        )
    `);

    // v2.0: 尝试添加 use_count 列（如果不存在）
    try {
        db.exec(`ALTER TABLE matching_rules ADD COLUMN use_count INTEGER DEFAULT 0`);
    } catch (e) {
        // 列已存在，忽略
    }

    // 创建索引
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_matching_original ON matching_rules(original_text, original_type);
        CREATE INDEX IF NOT EXISTS idx_matching_action ON matching_rules(action);
    `);

    console.log('[MatchingDictService] v2.0 替换库初始化完成: matching.db');
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
            console.log(`[MatchingDictService] 缓存已刷新，共 ${rules.length} 条替换规则`);
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
     * 查询替换规则
     * @param {string} text - 原始文本
     * @param {string} type - 类型 (word/phrase/pattern/grammar)
     * @returns {Object|null} 替换规则或 null
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
        
        // v2.0: 如果找到，增加使用次数
        if (rule) {
            this.incrementUseCount(rule.id);
        }
        
        return rule || null;
    }

    /**
     * v2.0: 增加使用次数
     */
    incrementUseCount(id) {
        try {
            db.prepare('UPDATE matching_rules SET use_count = use_count + 1 WHERE id = ?').run(id);
        } catch (e) {
            // 忽略错误，不影响主流程
        }
    }

    /**
     * 添加替换规则
     * @param {Object} data - 规则数据
     * @returns {Object} { success, id?, error? }
     */
    addRule(data) {
        try {
            const {
                original_text,
                original_type,
                action = 'replace',
                target_db = null,
                target_table = null,
                target_id = null,
                target_text = null,
                notes = null,
                created_by = 'admin'
            } = data;

            // 验证必填字段
            if (!original_text || !original_type) {
                return { success: false, error: '缺少必填字段' };
            }

            // v2.0: action 支持 replace 和 match
            if (!['replace', 'match'].includes(action)) {
                return { success: false, error: '无效的 action，只能是 replace 或 match' };
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
            sql += ' AND (original_text LIKE ? OR target_text LIKE ? OR notes LIKE ?)';
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
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
        const replaceCount = db.prepare('SELECT COUNT(*) as count FROM matching_rules WHERE action = ?').get('replace').count;
        const matchCount = db.prepare('SELECT COUNT(*) as count FROM matching_rules WHERE action = ?').get('match').count;
        const totalUseCount = db.prepare('SELECT SUM(use_count) as sum FROM matching_rules').get().sum || 0;
        
        const byType = db.prepare(`
            SELECT original_type, COUNT(*) as count 
            FROM matching_rules 
            GROUP BY original_type
        `).all();

        // v2.0: 最常使用的替换规则
        const topUsed = db.prepare(`
            SELECT original_text, target_text, use_count 
            FROM matching_rules 
            WHERE action = 'replace'
            ORDER BY use_count DESC 
            LIMIT 5
        `).all();

        return {
            total,
            replace: replaceCount,
            match: matchCount,
            totalUseCount,
            byType,
            topUsed
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
