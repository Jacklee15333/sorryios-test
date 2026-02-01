/**
 * 替换库服务 v3.1
 * 文件位置: backend/services/matchingDictService.js
 * 
 * 📦 v3.1 更新：
 * - 新增：findRuleFuzzy() 双向模糊匹配方法
 * - 优化：同时匹配 original_text 和 target_text
 * - 优化：精确匹配优先 + 类型过滤 + 提前终止
 * - 配置：阈值 80%，高置信度 90%
 * 
 * 📦 v3.0 更新：
 * - 合并：排除库功能合并进来（不再使用 exclude.db）
 * - 逻辑：target_text 为空 = 跳过（排除）
 * - 逻辑：target_text 有值 = 替换
 * - action 支持 'replace', 'match', 'exclude'
 * 
 * 📦 功能说明：
 * - 管理替换规则（matching.db）
 * - 存储识别错误的替换规则
 * - 存储排除规则（target_text 为空）
 * - 在匹配阶段自动处理
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

    // v3.1: 尝试添加 is_new 列（如果不存在）
    try {
        db.exec(`ALTER TABLE matching_rules ADD COLUMN is_new INTEGER DEFAULT 0`);
    } catch (e) {
        // 列已存在，忽略
    }

    // 创建索引
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_matching_original ON matching_rules(original_text, original_type);
        CREATE INDEX IF NOT EXISTS idx_matching_action ON matching_rules(action);
    `);

    console.log('[MatchingDictService] v3.0 替换库初始化完成: matching.db（已合并排除库）');
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
            
            // v3.0: 统计替换和排除数量
            const replaceCount = rules.filter(r => r.target_text).length;
            const excludeCount = rules.filter(r => !r.target_text).length;
            console.log(`[MatchingDictService] 缓存已刷新，共 ${rules.length} 条规则（替换: ${replaceCount}, 排除: ${excludeCount}）`);
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
     * v3.0: 返回结果包含 isExclude 标识
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
        
        if (rule) {
            // v3.0: 增加使用次数
            this.incrementUseCount(rule.id);
            
            // v3.0: 添加 isExclude 标识（target_text 为空 = 排除）
            rule.isExclude = !rule.target_text || rule.target_text.trim() === '';
        }
        
        return rule || null;
    }

    /**
     * v3.0 新增：检查是否被排除
     * @param {string} text - 原始文本
     * @param {string} type - 类型
     * @returns {boolean} 是否被排除
     */
    isExcluded(text, type) {
        const rule = this.findRule(text, type);
        return rule && rule.isExclude;
    }

    /**
     * v4.5.1 新增：模糊匹配替换规则（双向匹配）
     * 同时匹配 original_text 和 target_text，返回最接近的规则
     * 
     * @param {string} text - 输入文本
     * @param {string} type - 类型 (word/phrase/pattern/grammar)
     * @param {function} calculateSimilarity - 相似度计算函数
     * @returns {Object|null} { rule, score, matchedVia: 'original'|'target' }
     */
    findRuleFuzzy(text, type, calculateSimilarity) {
        // 配置
        const CONFIG = {
            MIN_THRESHOLD: 0.80,      // 最低阈值 80%
            HIGH_THRESHOLD: 0.90,     // 高置信度 90%
            EARLY_STOP: 0.98          // 提前终止 98%
        };
        
        // Step 1: 精确匹配优先（最快，覆盖90%情况）
        const exactMatch = this.findRule(text, type);
        if (exactMatch) {
            console.log(`[替换库] 精确匹配: "${text}" → "${exactMatch.target_text || '[排除]'}"`);
            return {
                rule: exactMatch,
                score: 1.0,
                matchedVia: 'exact'
            };
        }
        
        // Step 2: 按类型过滤候选规则（性能优化）
        this.checkCache();
        const normalizedType = type.toLowerCase().trim();
        const candidates = this.cache.rules.filter(r => 
            r.original_type.toLowerCase().trim() === normalizedType
        );
        
        if (candidates.length === 0) {
            return null;  // 没有候选规则
        }
        
        console.log(`[替换库] 模糊匹配: "${text}" (候选规则: ${candidates.length}条)`);
        
        // Step 3: 双向模糊匹配
        let bestScore = 0;
        let bestMatch = null;
        let bestSource = '';
        
        for (const rule of candidates) {
            // 计算 vs original_text（用户输入的原文）
            const scoreOriginal = calculateSimilarity(text, rule.original_text);
            if (scoreOriginal > bestScore) {
                bestScore = scoreOriginal;
                bestMatch = rule;
                bestSource = 'original';
            }
            
            // 计算 vs target_text（匹配到的目标文本）
            // 只有当 target_text 不为空时才计算（排除规则跳过）
            if (rule.target_text && rule.target_text.trim()) {
                const scoreTarget = calculateSimilarity(text, rule.target_text);
                if (scoreTarget > bestScore) {
                    bestScore = scoreTarget;
                    bestMatch = rule;
                    bestSource = 'target';
                }
            }
            
            // Step 4: 提前终止优化（98%以上已经很完美）
            if (bestScore >= CONFIG.EARLY_STOP) {
                console.log(`[替换库] 提前终止: ${(bestScore * 100).toFixed(0)}% ≥ ${CONFIG.EARLY_STOP * 100}%`);
                break;
            }
        }
        
        // Step 5: 阈值判断
        if (bestScore >= CONFIG.MIN_THRESHOLD) {
            // 增加使用次数
            this.incrementUseCount(bestMatch.id);
            
            // 添加 isExclude 标识
            bestMatch.isExclude = !bestMatch.target_text || bestMatch.target_text.trim() === '';
            
            const confidence = bestScore >= CONFIG.HIGH_THRESHOLD ? '高' : '中';
            console.log(`[替换库] 模糊匹配成功: "${text}" → "${bestMatch.target_text || '[排除]'}" (${(bestScore * 100).toFixed(0)}%, 置信度:${confidence}, 匹配方式:${bestSource === 'original' ? '原文' : '目标'})`);
            
            return {
                rule: bestMatch,
                score: bestScore,
                matchedVia: bestSource,  // 'original' 或 'target'
                confidence: confidence
            };
        }
        
        // 没有找到满足阈值的规则
        console.log(`[替换库] 未找到匹配: "${text}" (最高分: ${(bestScore * 100).toFixed(0)}% < ${CONFIG.MIN_THRESHOLD * 100}%)`);
        return null;
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
     * v3.0: action 支持 'replace', 'match', 'exclude'
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

            // v3.0: action 支持 replace, match, exclude
            if (!['replace', 'match', 'exclude'].includes(action)) {
                return { success: false, error: '无效的 action，只能是 replace, match 或 exclude' };
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
                    target_text || '',  // v3.0: 排除时 target_text 为空
                    notes,
                    created_by,
                    existing.id
                );
                this.refreshCache();
                console.log(`[MatchingDictService] 更新规则: "${original_text}" → "${target_text || '(排除)'}"`);
                return { success: true, id: existing.id, updated: true };
            }

            // 插入新规则
            const stmt = db.prepare(`
                INSERT INTO matching_rules (
                    original_text, original_type, action,
                    target_db, target_table, target_id, target_text,
                    notes, created_by, is_new
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            `);

            const result = stmt.run(
                original_text.trim(),
                original_type.toLowerCase().trim(),
                action,
                target_db,
                target_table,
                target_id,
                target_text || '',  // v3.0: 排除时 target_text 为空
                notes,
                created_by
            );

            this.refreshCache();
            console.log(`[MatchingDictService] 添加规则: "${original_text}" → "${target_text || '(排除)'}"`);
            return { success: true, id: result.lastInsertRowid };
        } catch (e) {
            console.error('[MatchingDictService] 添加规则失败:', e.message);
            return { success: false, error: e.message };
        }
    }

    /**
     * v3.0 新增：添加排除规则（快捷方法）
     * @param {Object} data - { original_text, original_type, notes, created_by }
     * @returns {Object} { success, id?, error? }
     */
    addExcludeRule(data) {
        return this.addRule({
            ...data,
            action: 'exclude',
            target_text: ''  // 排除规则的 target_text 为空
        });
    }

    /**
     * v3.1 新增：确认规则（取消NEW标记）
     * @param {number} id - 规则ID
     * @returns {Object} { success, error? }
     */
    confirm(id) {
        try {
            const result = db.prepare('UPDATE matching_rules SET is_new = 0 WHERE id = ?').run(id);
            this.refreshCache();
            return { success: result.changes > 0 };
        } catch (e) {
            console.error('[MatchingDictService] 确认规则失败:', e.message);
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
     * v3.0: 支持 action 筛选（包括 exclude）
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

        const rules = db.prepare(sql).all(...params);
        
        // v3.0: 为每条规则添加 isExclude 标识
        return rules.map(r => ({
            ...r,
            isExclude: !r.target_text || r.target_text.trim() === ''
        }));
    }

    /**
     * 获取规则总数
     * v3.0: 支持分别统计替换和排除
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
     * v3.0: 新增排除规则统计
     */
    getStats() {
        const total = db.prepare('SELECT COUNT(*) as count FROM matching_rules').get().count;
        
        // v3.0: 按 target_text 是否为空统计
        const excludeCount = db.prepare("SELECT COUNT(*) as count FROM matching_rules WHERE target_text IS NULL OR target_text = ''").get().count;
        const replaceCount = total - excludeCount;
        
        const totalUseCount = db.prepare('SELECT SUM(use_count) as sum FROM matching_rules').get().sum || 0;
        
        const byType = db.prepare(`
            SELECT original_type, COUNT(*) as count 
            FROM matching_rules 
            GROUP BY original_type
        `).all();

        // v3.0: 最常使用的规则（替换和排除）
        const topUsed = db.prepare(`
            SELECT original_text, target_text, use_count 
            FROM matching_rules 
            ORDER BY use_count DESC 
            LIMIT 5
        `).all();

        return {
            total,
            replace: replaceCount,
            exclude: excludeCount,  // v3.0 新增
            totalUseCount,
            byType,
            topUsed
        };
    }

    /**
     * 通过ID获取规则
     */
    getById(id) {
        const rule = db.prepare('SELECT * FROM matching_rules WHERE id = ?').get(id);
        if (rule) {
            rule.isExclude = !rule.target_text || rule.target_text.trim() === '';
        }
        return rule;
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