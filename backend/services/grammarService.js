/**
 * 语法数据库服务
 * 使用 SQLite 存储语法知识库
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class GrammarService {
    constructor(dbPath = null) {
        this.dbPath = dbPath || path.join(__dirname, '../data/grammar.db');
        this.db = null;
        this.init();
    }

    /**
     * 初始化数据库
     */
    init() {
        // 确保目录存在
        const dir = path.dirname(this.dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        this.db = new Database(this.dbPath);
        this.createTables();
        
        // 自动检测并导入初始数据
        this.autoImportIfEmpty();
        
        console.log('[GrammarService] 语法数据库已初始化:', this.dbPath);
    }

    /**
     * 自动导入：如果数据库为空，则从 JSON 文件导入
     */
    autoImportIfEmpty() {
        const count = this.db.prepare('SELECT COUNT(*) as count FROM grammar').get().count;
        
        if (count === 0) {
            console.log('[GrammarService] 检测到数据库为空，尝试自动导入...');
            
            // 查找 JSON 文件的可能位置
            const possiblePaths = [
                path.join(__dirname, '../data/grammar_database.json'),
                path.join(__dirname, '../../data/grammar_database.json'),
                path.join(__dirname, '../grammar_database.json'),
                path.join(process.cwd(), 'data/grammar_database.json'),
                path.join(process.cwd(), 'grammar_database.json')
            ];
            
            let jsonPath = null;
            for (const p of possiblePaths) {
                if (fs.existsSync(p)) {
                    jsonPath = p;
                    break;
                }
            }
            
            if (jsonPath) {
                try {
                    const result = this.importFromJson(jsonPath);
                    console.log(`[GrammarService] ✅ 自动导入完成！成功: ${result.imported}, 跳过: ${result.skipped}`);
                } catch (error) {
                    console.error('[GrammarService] ❌ 自动导入失败:', error.message);
                }
            } else {
                console.log('[GrammarService] ⚠️ 未找到 grammar_database.json，跳过自动导入');
                console.log('[GrammarService] 提示：请将 grammar_database.json 放到 backend/data/ 目录');
            }
        } else {
            console.log(`[GrammarService] 数据库已有 ${count} 条语法记录`);
        }
    }

    /**
     * 创建表结构
     */
    createTables() {
        // 语法主表
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS grammar (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL UNIQUE,
                keywords TEXT NOT NULL,
                definition TEXT NOT NULL,
                structure TEXT,
                usage TEXT,
                mistakes TEXT,
                examples TEXT,
                category TEXT DEFAULT '其他',
                difficulty INTEGER DEFAULT 2,
                enabled INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 创建索引
        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_grammar_title ON grammar(title);
            CREATE INDEX IF NOT EXISTS idx_grammar_category ON grammar(category);
            CREATE INDEX IF NOT EXISTS idx_grammar_enabled ON grammar(enabled);
        `);

        console.log('[GrammarService] 数据库表已创建');
    }

    /**
     * 添加语法点
     */
    add(grammar) {
        const stmt = this.db.prepare(`
            INSERT INTO grammar (title, keywords, definition, structure, usage, mistakes, examples, category, difficulty, enabled)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        try {
            const result = stmt.run(
                grammar.title,
                JSON.stringify(grammar.keywords || []),
                grammar.definition,
                grammar.structure || '',
                JSON.stringify(grammar.usage || []),
                JSON.stringify(grammar.mistakes || []),
                JSON.stringify(grammar.examples || []),
                grammar.category || '其他',
                grammar.difficulty || 2,
                grammar.enabled !== false ? 1 : 0
            );
            return { success: true, id: result.lastInsertRowid };
        } catch (error) {
            if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                return { success: false, error: '语法点标题已存在' };
            }
            throw error;
        }
    }

    /**
     * 更新语法点
     */
    update(id, grammar) {
        const stmt = this.db.prepare(`
            UPDATE grammar SET
                title = ?,
                keywords = ?,
                definition = ?,
                structure = ?,
                usage = ?,
                mistakes = ?,
                examples = ?,
                category = ?,
                difficulty = ?,
                enabled = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `);

        try {
            const result = stmt.run(
                grammar.title,
                JSON.stringify(grammar.keywords || []),
                grammar.definition,
                grammar.structure || '',
                JSON.stringify(grammar.usage || []),
                JSON.stringify(grammar.mistakes || []),
                JSON.stringify(grammar.examples || []),
                grammar.category || '其他',
                grammar.difficulty || 2,
                grammar.enabled !== false ? 1 : 0,
                id
            );
            return { success: result.changes > 0 };
        } catch (error) {
            if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                return { success: false, error: '语法点标题已存在' };
            }
            throw error;
        }
    }

    /**
     * 删除语法点
     */
    delete(id) {
        const stmt = this.db.prepare('DELETE FROM grammar WHERE id = ?');
        const result = stmt.run(id);
        return { success: result.changes > 0 };
    }

    /**
     * 获取单个语法点
     */
    getById(id) {
        const stmt = this.db.prepare('SELECT * FROM grammar WHERE id = ?');
        const row = stmt.get(id);
        return row ? this.parseRow(row) : null;
    }

    /**
     * 根据标题获取
     */
    getByTitle(title) {
        const stmt = this.db.prepare('SELECT * FROM grammar WHERE title = ?');
        const row = stmt.get(title);
        return row ? this.parseRow(row) : null;
    }

    /**
     * 获取所有语法点
     */
    getAll(includeDisabled = false) {
        let sql = 'SELECT * FROM grammar';
        if (!includeDisabled) {
            sql += ' WHERE enabled = 1';
        }
        sql += ' ORDER BY category, title';
        
        const stmt = this.db.prepare(sql);
        const rows = stmt.all();
        return rows.map(row => this.parseRow(row));
    }

    /**
     * 按分类获取
     */
    getByCategory(category) {
        const stmt = this.db.prepare('SELECT * FROM grammar WHERE category = ? AND enabled = 1 ORDER BY title');
        const rows = stmt.all(category);
        return rows.map(row => this.parseRow(row));
    }

    /**
     * 获取所有分类
     */
    getCategories() {
        const stmt = this.db.prepare('SELECT DISTINCT category FROM grammar ORDER BY category');
        return stmt.all().map(row => row.category);
    }

    /**
     * 根据关键词搜索
     */
    searchByKeyword(keyword) {
        const stmt = this.db.prepare(`
            SELECT * FROM grammar 
            WHERE enabled = 1 AND (
                title LIKE ? OR 
                keywords LIKE ? OR
                definition LIKE ?
            )
            ORDER BY title
        `);
        const pattern = `%${keyword}%`;
        const rows = stmt.all(pattern, pattern, pattern);
        return rows.map(row => this.parseRow(row));
    }

    /**
     * 根据关键词匹配语法点（用于自动检测）
     */
    matchByKeywords(text) {
        const allGrammar = this.getAll();
        const matched = [];

        for (const grammar of allGrammar) {
            for (const keyword of grammar.keywords) {
                if (text.includes(keyword)) {
                    matched.push({
                        grammar,
                        matchedKeyword: keyword
                    });
                    break; // 一个语法点只匹配一次
                }
            }
        }

        return matched;
    }

    /**
     * 解析数据库行
     */
    parseRow(row) {
        return {
            id: row.id,
            title: row.title,
            keywords: JSON.parse(row.keywords || '[]'),
            definition: row.definition,
            structure: row.structure,
            usage: JSON.parse(row.usage || '[]'),
            mistakes: JSON.parse(row.mistakes || '[]'),
            examples: JSON.parse(row.examples || '[]'),
            category: row.category,
            difficulty: row.difficulty,
            enabled: row.enabled === 1,
            created_at: row.created_at,
            updated_at: row.updated_at
        };
    }

    /**
     * 从 JSON 文件导入数据
     */
    importFromJson(jsonPath) {
        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        const grammarData = data.grammar || data;
        
        let imported = 0;
        let skipped = 0;

        // 确定分类映射
        const categoryMap = {
            '一般现在时': '时态',
            '一般过去时': '时态',
            '一般将来时': '时态',
            '现在进行时': '时态',
            '过去进行时': '时态',
            '现在完成时': '时态',
            '过去完成时': '时态',
            '被动语态': '语态',
            '不定式': '非谓语动词',
            '动名词': '非谓语动词',
            '现在分词': '非谓语动词',
            '过去分词': '非谓语动词',
            '宾语从句': '从句',
            '定语从句': '从句',
            '状语从句': '从句',
            '比较级': '比较等级',
            '最高级': '比较等级',
            '感叹句': '句式',
            '祈使句': '句式',
            '一般疑问句': '句式',
            '特殊疑问句': '句式',
            'There be句型': '句式',
            '反义疑问句': '句式',
            'so/neither倒装': '句式',
            '情态动词': '词法',
            '主谓一致': '词法',
            '冠词用法': '词法',
            '名词所有格': '词法',
            '代词': '词法',
            '介词': '词法',
            'it用法': '词法'
        };

        for (const [title, grammar] of Object.entries(grammarData)) {
            // 跳过元数据
            if (title === '_meta') continue;

            const category = categoryMap[grammar.title] || 
                             (grammar.title.includes('辨析') ? '词汇辨析' : '其他');

            const result = this.add({
                ...grammar,
                category
            });

            if (result.success) {
                imported++;
            } else {
                skipped++;
                console.log(`[GrammarService] 跳过: ${grammar.title} - ${result.error}`);
            }
        }

        console.log(`[GrammarService] 导入完成: 成功 ${imported}, 跳过 ${skipped}`);
        return { imported, skipped };
    }

    /**
     * 导出到 JSON
     */
    exportToJson() {
        const all = this.getAll(true);
        const result = {
            _meta: {
                version: '1.0',
                exported_at: new Date().toISOString(),
                total_items: all.length
            },
            grammar: {}
        };

        for (const item of all) {
            result.grammar[item.title] = {
                title: item.title,
                keywords: item.keywords,
                definition: item.definition,
                structure: item.structure,
                usage: item.usage,
                mistakes: item.mistakes,
                examples: item.examples
            };
        }

        return result;
    }

    /**
     * 获取统计信息
     */
    getStats() {
        const total = this.db.prepare('SELECT COUNT(*) as count FROM grammar').get().count;
        const enabled = this.db.prepare('SELECT COUNT(*) as count FROM grammar WHERE enabled = 1').get().count;
        const categories = this.db.prepare('SELECT category, COUNT(*) as count FROM grammar GROUP BY category ORDER BY count DESC').all();
        
        return {
            total,
            enabled,
            disabled: total - enabled,
            categories
        };
    }

    /**
     * 关闭数据库连接
     */
    close() {
        if (this.db) {
            this.db.close();
            console.log('[GrammarService] 数据库连接已关闭');
        }
    }
}

// 单例模式
let instance = null;

function getGrammarService(dbPath = null) {
    if (!instance) {
        instance = new GrammarService(dbPath);
    }
    return instance;
}

module.exports = {
    GrammarService,
    getGrammarService
};