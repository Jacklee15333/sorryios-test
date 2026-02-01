/**
 * 词库数据库服务 - 修复版 v1.1
 * 
 * 📦 v1.1 修复内容：
 * - 修复：addWord/addPhrase/addPattern 添加 is_new 字段
 * - 改进：唯一约束错误提示更清晰
 * - 改进：添加详细的错误日志
 * 
 * 使用方法：
 * 将此文件复制到 backend/services/vocabularyService.js
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class VocabularyService {
    constructor(dbPath = null) {
        this.dbPath = dbPath || path.join(__dirname, '../data/vocabulary.db');
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
        
        // 显示统计
        const stats = this.getStats();
        console.log(`[VocabularyService] 词库已初始化: 单词${stats.words}个, 短语${stats.phrases}个, 句型${stats.patterns}个`);
    }

    /**
     * 创建表结构
     */
    createTables() {
        // 单词表
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS words (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                word TEXT NOT NULL UNIQUE,
                phonetic TEXT,
                pos TEXT,
                meaning TEXT NOT NULL,
                example TEXT,
                irregular_forms TEXT,
                category TEXT DEFAULT '其他',
                difficulty INTEGER DEFAULT 2,
                enabled INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 短语表
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS phrases (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                phrase TEXT NOT NULL UNIQUE,
                meaning TEXT NOT NULL,
                example TEXT,
                category TEXT DEFAULT '其他',
                difficulty INTEGER DEFAULT 2,
                enabled INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 句型表
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS patterns (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pattern TEXT NOT NULL UNIQUE,
                meaning TEXT NOT NULL,
                example TEXT,
                category TEXT DEFAULT '其他',
                difficulty INTEGER DEFAULT 2,
                enabled INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 创建索引
        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_words_word ON words(word);
            CREATE INDEX IF NOT EXISTS idx_words_category ON words(category);
            CREATE INDEX IF NOT EXISTS idx_phrases_phrase ON phrases(phrase);
            CREATE INDEX IF NOT EXISTS idx_phrases_category ON phrases(category);
            CREATE INDEX IF NOT EXISTS idx_patterns_pattern ON patterns(pattern);
            CREATE INDEX IF NOT EXISTS idx_patterns_category ON patterns(category);
        `);

        // v1.1: 确保 is_new 字段存在
        this._ensureIsNewColumn();

        console.log('[VocabularyService] 数据库表已创建');
    }

    /**
     * v1.1 新增：确保 is_new 字段存在
     */
    _ensureIsNewColumn() {
        const tables = ['words', 'phrases', 'patterns'];
        
        for (const table of tables) {
            try {
                const columns = this.db.prepare(`PRAGMA table_info(${table})`).all();
                const hasIsNew = columns.some(col => col.name === 'is_new');
                
                if (!hasIsNew) {
                    console.log(`[VocabularyService] 为 ${table} 表添加 is_new 字段...`);
                    this.db.exec(`ALTER TABLE ${table} ADD COLUMN is_new INTEGER DEFAULT 0`);
                    console.log(`[VocabularyService] ${table}.is_new 字段添加成功`);
                }
            } catch (e) {
                console.warn(`[VocabularyService] 检查 ${table}.is_new 字段失败:`, e.message);
            }
        }
    }

    // ============================================
    // 单词操作
    // ============================================

    /**
     * 添加单词
     * v1.1 修复：添加 is_new 字段
     */
    addWord(word) {
        const stmt = this.db.prepare(`
            INSERT INTO words (word, phonetic, pos, meaning, example, irregular_forms, category, difficulty, enabled, is_new)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        try {
            const result = stmt.run(
                word.word,
                word.phonetic || '',
                word.pos || '',
                word.meaning,
                word.example || '',
                JSON.stringify(word.irregular_forms || {}),
                word.category || '其他',
                word.difficulty || 2,
                word.enabled !== false ? 1 : 0,
                1  // is_new = 1，标记为新添加
            );
            
            console.log(`[VocabularyService] 添加单词成功: "${word.word}" (ID: ${result.lastInsertRowid})`);
            return { success: true, id: result.lastInsertRowid };
        } catch (error) {
            console.error(`[VocabularyService] 添加单词失败: "${word.word}"`, {
                error: error.message,
                code: error.code
            });
            
            if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                return { success: false, error: `单词 "${word.word}" 已存在` };
            }
            throw error;
        }
    }

    /**
     * 更新单词
     * v1.1 改进：添加详细错误日志
     */
    updateWord(id, word) {
        const stmt = this.db.prepare(`
            UPDATE words SET
                word = ?, phonetic = ?, pos = ?, meaning = ?, example = ?,
                irregular_forms = ?, category = ?, difficulty = ?, enabled = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `);

        try {
            const result = stmt.run(
                word.word,
                word.phonetic || '',
                word.pos || '',
                word.meaning,
                word.example || '',
                JSON.stringify(word.irregular_forms || {}),
                word.category || '其他',
                word.difficulty || 2,
                word.enabled !== false ? 1 : 0,
                id
            );
            
            if (result.changes > 0) {
                console.log(`[VocabularyService] 更新单词成功: ID ${id}`);
                return { success: true };
            } else {
                console.warn(`[VocabularyService] 更新单词失败: ID ${id} 不存在`);
                return { success: false, error: '单词不存在' };
            }
        } catch (error) {
            console.error(`[VocabularyService] 更新单词失败: ID ${id}`, {
                error: error.message,
                code: error.code,
                word: word.word
            });
            
            if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                return { success: false, error: `单词 "${word.word}" 已被其他记录使用` };
            }
            throw error;
        }
    }

    deleteWord(id) {
        const stmt = this.db.prepare('DELETE FROM words WHERE id = ?');
        const result = stmt.run(id);
        
        if (result.changes > 0) {
            console.log(`[VocabularyService] 删除单词成功: ID ${id}`);
        }
        return { success: result.changes > 0 };
    }

    getWordById(id) {
        const stmt = this.db.prepare('SELECT * FROM words WHERE id = ?');
        const row = stmt.get(id);
        return row ? this.parseWordRow(row) : null;
    }

    getAllWords(includeDisabled = false) {
        let sql = 'SELECT * FROM words';
        if (!includeDisabled) {
            sql += ' WHERE enabled = 1';
        }
        sql += ' ORDER BY id';
        
        const stmt = this.db.prepare(sql);
        const rows = stmt.all();
        return rows.map(row => this.parseWordRow(row));
    }

    searchWords(keyword) {
        const stmt = this.db.prepare(`
            SELECT * FROM words 
            WHERE enabled = 1 AND (word LIKE ? OR meaning LIKE ?)
            ORDER BY id
        `);
        const pattern = `%${keyword}%`;
        const rows = stmt.all(pattern, pattern);
        return rows.map(row => this.parseWordRow(row));
    }

    getWordCategories() {
        const stmt = this.db.prepare('SELECT DISTINCT category FROM words ORDER BY category');
        return stmt.all().map(row => row.category);
    }

    parseWordRow(row) {
        return {
            id: row.id,
            word: row.word,
            phonetic: row.phonetic,
            pos: row.pos,
            meaning: row.meaning,
            example: row.example,
            irregular_forms: JSON.parse(row.irregular_forms || '{}'),
            category: row.category,
            difficulty: row.difficulty,
            enabled: row.enabled === 1,
            created_at: row.created_at,
            updated_at: row.updated_at,
            is_new: row.is_new === 1  // v1.1: 添加 is_new 字段
        };
    }

    // ============================================
    // 短语操作
    // ============================================

    /**
     * 添加短语
     * v1.1 修复：添加 is_new 字段
     */
    addPhrase(phrase) {
        const stmt = this.db.prepare(`
            INSERT INTO phrases (phrase, meaning, example, category, difficulty, enabled, is_new)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        try {
            const result = stmt.run(
                phrase.phrase,
                phrase.meaning,
                phrase.example || '',
                phrase.category || '其他',
                phrase.difficulty || 2,
                phrase.enabled !== false ? 1 : 0,
                1  // is_new = 1，标记为新添加
            );
            
            console.log(`[VocabularyService] 添加短语成功: "${phrase.phrase}" (ID: ${result.lastInsertRowid})`);
            return { success: true, id: result.lastInsertRowid };
        } catch (error) {
            console.error(`[VocabularyService] 添加短语失败: "${phrase.phrase}"`, {
                error: error.message,
                code: error.code
            });
            
            if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                return { success: false, error: `短语 "${phrase.phrase}" 已存在` };
            }
            throw error;
        }
    }

    /**
     * 更新短语
     * v1.1 改进：添加详细错误日志
     */
    updatePhrase(id, phrase) {
        const stmt = this.db.prepare(`
            UPDATE phrases SET
                phrase = ?, meaning = ?, example = ?, category = ?, 
                difficulty = ?, enabled = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `);

        try {
            const result = stmt.run(
                phrase.phrase,
                phrase.meaning,
                phrase.example || '',
                phrase.category || '其他',
                phrase.difficulty || 2,
                phrase.enabled !== false ? 1 : 0,
                id
            );
            
            if (result.changes > 0) {
                console.log(`[VocabularyService] 更新短语成功: ID ${id}`);
                return { success: true };
            } else {
                console.warn(`[VocabularyService] 更新短语失败: ID ${id} 不存在`);
                return { success: false, error: '短语不存在' };
            }
        } catch (error) {
            console.error(`[VocabularyService] 更新短语失败: ID ${id}`, {
                error: error.message,
                code: error.code,
                phrase: phrase.phrase
            });
            
            if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                return { success: false, error: `短语 "${phrase.phrase}" 已被其他记录使用` };
            }
            throw error;
        }
    }

    deletePhrase(id) {
        const stmt = this.db.prepare('DELETE FROM phrases WHERE id = ?');
        const result = stmt.run(id);
        
        if (result.changes > 0) {
            console.log(`[VocabularyService] 删除短语成功: ID ${id}`);
        }
        return { success: result.changes > 0 };
    }

    getPhraseById(id) {
        const stmt = this.db.prepare('SELECT * FROM phrases WHERE id = ?');
        const row = stmt.get(id);
        return row ? this.parsePhraseRow(row) : null;
    }

    getAllPhrases(includeDisabled = false) {
        let sql = 'SELECT * FROM phrases';
        if (!includeDisabled) {
            sql += ' WHERE enabled = 1';
        }
        sql += ' ORDER BY id';
        
        const stmt = this.db.prepare(sql);
        const rows = stmt.all();
        return rows.map(row => this.parsePhraseRow(row));
    }

    searchPhrases(keyword) {
        const stmt = this.db.prepare(`
            SELECT * FROM phrases 
            WHERE enabled = 1 AND (phrase LIKE ? OR meaning LIKE ?)
            ORDER BY id
        `);
        const pattern = `%${keyword}%`;
        const rows = stmt.all(pattern, pattern);
        return rows.map(row => this.parsePhraseRow(row));
    }

    getPhraseCategories() {
        const stmt = this.db.prepare('SELECT DISTINCT category FROM phrases ORDER BY category');
        return stmt.all().map(row => row.category);
    }

    parsePhraseRow(row) {
        return {
            id: row.id,
            phrase: row.phrase,
            meaning: row.meaning,
            example: row.example,
            category: row.category,
            difficulty: row.difficulty,
            enabled: row.enabled === 1,
            created_at: row.created_at,
            updated_at: row.updated_at,
            is_new: row.is_new === 1  // v1.1: 添加 is_new 字段
        };
    }

    // ============================================
    // 句型操作
    // ============================================

    /**
     * 添加句型
     * v1.1 修复：添加 is_new 字段
     */
    addPattern(pattern) {
        const stmt = this.db.prepare(`
            INSERT INTO patterns (pattern, meaning, example, category, difficulty, enabled, is_new)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        try {
            const result = stmt.run(
                pattern.pattern,
                pattern.meaning,
                pattern.example || '',
                pattern.category || '其他',
                pattern.difficulty || 2,
                pattern.enabled !== false ? 1 : 0,
                1  // is_new = 1，标记为新添加
            );
            
            console.log(`[VocabularyService] 添加句型成功: "${pattern.pattern}" (ID: ${result.lastInsertRowid})`);
            return { success: true, id: result.lastInsertRowid };
        } catch (error) {
            console.error(`[VocabularyService] 添加句型失败: "${pattern.pattern}"`, {
                error: error.message,
                code: error.code
            });
            
            if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                return { success: false, error: `句型 "${pattern.pattern}" 已存在` };
            }
            throw error;
        }
    }

    /**
     * 更新句型
     * v1.1 改进：添加详细错误日志
     */
    updatePattern(id, pattern) {
        const stmt = this.db.prepare(`
            UPDATE patterns SET
                pattern = ?, meaning = ?, example = ?, category = ?, 
                difficulty = ?, enabled = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `);

        try {
            const result = stmt.run(
                pattern.pattern,
                pattern.meaning,
                pattern.example || '',
                pattern.category || '其他',
                pattern.difficulty || 2,
                pattern.enabled !== false ? 1 : 0,
                id
            );
            
            if (result.changes > 0) {
                console.log(`[VocabularyService] 更新句型成功: ID ${id}`);
                return { success: true };
            } else {
                console.warn(`[VocabularyService] 更新句型失败: ID ${id} 不存在`);
                return { success: false, error: '句型不存在' };
            }
        } catch (error) {
            console.error(`[VocabularyService] 更新句型失败: ID ${id}`, {
                error: error.message,
                code: error.code,
                pattern: pattern.pattern
            });
            
            if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                return { success: false, error: `句型 "${pattern.pattern}" 已被其他记录使用` };
            }
            throw error;
        }
    }

    deletePattern(id) {
        const stmt = this.db.prepare('DELETE FROM patterns WHERE id = ?');
        const result = stmt.run(id);
        
        if (result.changes > 0) {
            console.log(`[VocabularyService] 删除句型成功: ID ${id}`);
        }
        return { success: result.changes > 0 };
    }

    getPatternById(id) {
        const stmt = this.db.prepare('SELECT * FROM patterns WHERE id = ?');
        const row = stmt.get(id);
        return row ? this.parsePatternRow(row) : null;
    }

    getAllPatterns(includeDisabled = false) {
        let sql = 'SELECT * FROM patterns';
        if (!includeDisabled) {
            sql += ' WHERE enabled = 1';
        }
        sql += ' ORDER BY id';
        
        const stmt = this.db.prepare(sql);
        const rows = stmt.all();
        return rows.map(row => this.parsePatternRow(row));
    }

    searchPatterns(keyword) {
        const stmt = this.db.prepare(`
            SELECT * FROM patterns 
            WHERE enabled = 1 AND (pattern LIKE ? OR meaning LIKE ?)
            ORDER BY id
        `);
        const pattern = `%${keyword}%`;
        const rows = stmt.all(pattern, pattern);
        return rows.map(row => this.parsePatternRow(row));
    }

    getPatternCategories() {
        const stmt = this.db.prepare('SELECT DISTINCT category FROM patterns ORDER BY category');
        return stmt.all().map(row => row.category);
    }

    parsePatternRow(row) {
        return {
            id: row.id,
            pattern: row.pattern,
            meaning: row.meaning,
            example: row.example,
            category: row.category,
            difficulty: row.difficulty,
            enabled: row.enabled === 1,
            created_at: row.created_at,
            updated_at: row.updated_at,
            is_new: row.is_new === 1  // v1.1: 添加 is_new 字段
        };
    }

    // ============================================
    // 统计
    // ============================================

    getStats() {
        const words = this.db.prepare('SELECT COUNT(*) as count FROM words').get().count;
        const phrases = this.db.prepare('SELECT COUNT(*) as count FROM phrases').get().count;
        const patterns = this.db.prepare('SELECT COUNT(*) as count FROM patterns').get().count;
        
        return {
            words,
            phrases,
            patterns,
            total: words + phrases + patterns
        };
    }

    /**
     * 关闭数据库连接
     */
    close() {
        if (this.db) {
            this.db.close();
            console.log('[VocabularyService] 数据库连接已关闭');
        }
    }
}

// 单例模式
let instance = null;

function getVocabularyService(dbPath = null) {
    if (!instance) {
        instance = new VocabularyService(dbPath);
    }
    return instance;
}

module.exports = {
    VocabularyService,
    getVocabularyService
};