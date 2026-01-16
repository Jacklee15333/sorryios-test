/**
 * 替换规则服务 v1.0
 * 文件位置: backend/services/replaceService.js
 * 
 * 📦 功能说明：
 * - 管理替换规则库（replace.db）
 * - 存储识别错误的替换规则
 * - 在匹配阶段自动将错误文本替换为正确文本
 * 
 * 📦 数据库位置：backend/data/replace.db
 * 
 * 📦 使用场景：
 * - AI识别出 "be important for sth."（错误）
 * - 用户指定替换为 "be important to"（正确）
 * - 下次遇到同样错误，自动替换后再匹配
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// 确保数据目录存在
const DATA_DIR = path.join(__dirname, '../data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'replace.db');
const db = new Database(DB_PATH);

/**
 * 初始化数据库表
 */
function initDatabase() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS replace_rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            original_text TEXT NOT NULL,
            original_type TEXT NOT NULL,
            replace_text TEXT NOT NULL,
            notes TEXT,
            use_count INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_by TEXT DEFAULT 'admin'
        )
    `);

    // 创建索引
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_replace_original ON replace_rules(original_text, original_type);
        CREATE INDEX IF NOT EXISTS idx_replace_type ON replace_rules(original_type);
    `);

    console.log('[ReplaceService] v1.0 数据库初始化完成: replace.db');
}

// 初始化
initDatabase();

/**
 * 替换规则服务类
 */
class ReplaceService {
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
            const rules = db.prepare('SELECT * FROM replace_rules').all();
            this.cache.rules = rules;
            this.cache.lastUpdate = Date.now();
            console.log(`[ReplaceService] 缓存已刷新，共 ${rules.length} 条替换规则`);
        } catch (e) {
            console.error('[ReplaceService] 刷新缓存失败:', e.message);
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
     * 查找替换规则
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
        
        // 如果找到，增加使用次数
        if (rule) {
            this.incrementUseCount(rule.id);
        }
        
        return rule || null;
    }

    /**
     * 增加使用次数
     */
    incrementUseCount(id) {
        try {
            db.prepare('UPDATE replace_rules SET use_count = use_count + 1 WHERE id = ?').run(id);
        } catch (e) {
            // 忽略错误，不影响主流程
        }
    }

    /**
     * 添加替换规则
     * @param {Object} data - 规则数据
     * @returns {Object} { success, id?, error?, updated? }
     */
    addRule(data) {
        try {
            const {
                original_text,
                original_type,
                replace_text,
                notes = null,
                created_by = 'admin'
            } = data;

            // 验证必填字段
            if (!original_text || !original_type || !replace_text) {
                return { success: false, error: '请提供 original_text、original_type 和 replace_text' };
            }

            // 验证类型
            if (!['word', 'phrase', 'pattern', 'grammar'].includes(original_type.toLowerCase())) {
                return { success: false, error: '无效的类型，只能是 word/phrase/pattern/grammar' };
            }

            // 检查是否已存在
            const existing = db.prepare(`
                SELECT id FROM replace_rules 
                WHERE LOWER(original_text) = LOWER(?) AND LOWER(original_type) = LOWER(?)
            `).get(original_text.trim(), original_type.trim());

            if (existing) {
                // 更新现有规则
                const stmt = db.prepare(`
                    UPDATE replace_rules SET
                        replace_text = ?,
                        notes = ?,
                        created_at = CURRENT_TIMESTAMP,
                        created_by = ?
                    WHERE id = ?
                `);
                stmt.run(replace_text.trim(), notes, created_by, existing.id);
                this.refreshCache();
                return { success: true, id: existing.id, updated: true };
            }

            // 插入新规则
            const stmt = db.prepare(`
                INSERT INTO replace_rules (
                    original_text, original_type, replace_text, notes, created_by
                ) VALUES (?, ?, ?, ?, ?)
            `);

            const result = stmt.run(
                original_text.trim(),
                original_type.toLowerCase().trim(),
                replace_text.trim(),
                notes,
                created_by
            );

            this.refreshCache();
            return { success: true, id: result.lastInsertRowid };
        } catch (e) {
            console.error('[ReplaceService] 添加规则失败:', e.message);
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
            const result = db.prepare('DELETE FROM replace_rules WHERE id = ?').run(id);
            this.refreshCache();
            return { success: result.changes > 0 };
        } catch (e) {
            console.error('[ReplaceService] 删除规则失败:', e.message);
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
            const existing = db.prepare('SELECT * FROM replace_rules WHERE id = ?').get(id);
            if (!existing) {
                return { success: false, error: '规则不存在' };
            }

            const updates = [];
            const values = [];

            if (data.original_text !== undefined) {
                updates.push('original_text = ?');
                values.push(data.original_text.trim());
            }
            if (data.original_type !== undefined) {
                updates.push('original_type = ?');
                values.push(data.original_type.toLowerCase().trim());
            }
            if (data.replace_text !== undefined) {
                updates.push('replace_text = ?');
                values.push(data.replace_text.trim());
            }
            if (data.notes !== undefined) {
                updates.push('notes = ?');
                values.push(data.notes);
            }

            if (updates.length === 0) {
                return { success: false, error: '没有要更新的字段' };
            }

            values.push(id);
            const sql = `UPDATE replace_rules SET ${updates.join(', ')} WHERE id = ?`;
            db.prepare(sql).run(...values);

            this.refreshCache();
            return { success: true };
        } catch (e) {
            console.error('[ReplaceService] 更新规则失败:', e.message);
            return { success: false, error: e.message };
        }
    }

    /**
     * 获取所有规则
     * @param {Object} options - 查询选项
     * @returns {Array} 规则列表
     */
    getAllRules(options = {}) {
        const { type, search, limit = 100, offset = 0 } = options;

        let sql = 'SELECT * FROM replace_rules WHERE 1=1';
        const params = [];

        if (type) {
            sql += ' AND original_type = ?';
            params.push(type.toLowerCase());
        }
        if (search) {
            sql += ' AND (original_text LIKE ? OR replace_text LIKE ?)';
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
        const { type } = options;

        let sql = 'SELECT COUNT(*) as count FROM replace_rules WHERE 1=1';
        const params = [];

        if (type) {
            sql += ' AND original_type = ?';
            params.push(type.toLowerCase());
        }

        return db.prepare(sql).get(...params).count;
    }

    /**
     * 获取统计信息
     */
    getStats() {
        const total = db.prepare('SELECT COUNT(*) as count FROM replace_rules').get().count;
        const totalUseCount = db.prepare('SELECT SUM(use_count) as sum FROM replace_rules').get().sum || 0;
        
        const byType = db.prepare(`
            SELECT original_type, COUNT(*) as count 
            FROM replace_rules 
            GROUP BY original_type
        `).all();

        // 最常使用的替换规则
        const topUsed = db.prepare(`
            SELECT original_text, replace_text, use_count 
            FROM replace_rules 
            ORDER BY use_count DESC 
            LIMIT 5
        `).all();

        return {
            total,
            totalUseCount,
            byType,
            topUsed
        };
    }

    /**
     * 通过ID获取规则
     */
    getById(id) {
        return db.prepare('SELECT * FROM replace_rules WHERE id = ?').get(id);
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

function getReplaceService() {
    if (!instance) {
        instance = new ReplaceService();
    }
    return instance;
}

module.exports = {
    ReplaceService,
    getReplaceService
};
