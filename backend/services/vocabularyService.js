/**
 * 词库数据库服务
 * 使用 SQLite 存储单词、短语、句型
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

        console.log('[VocabularyService] 数据库表已创建');
    }

    // ============================================
    // 单词操作
    // ============================================

    addWord(word) {
        const stmt = this.db.prepare(`
            INSERT INTO words (word, phonetic, pos, meaning, example, irregular_forms, category, difficulty, enabled)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                word.enabled !== false ? 1 : 0
            );
            return { success: true, id: result.lastInsertRowid };
        } catch (error) {
            if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                return { success: false, error: '单词已存在' };
            }
            throw error;
        }
    }

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
            return { success: result.changes > 0 };
        } catch (error) {
            if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                return { success: false, error: '单词已存在' };
            }
            throw error;
        }
    }

    deleteWord(id) {
        const stmt = this.db.prepare('DELETE FROM words WHERE id = ?');
        const result = stmt.run(id);
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
            updated_at: row.updated_at
        };
    }

    // ============================================
    // 短语操作
    // ============================================

    addPhrase(phrase) {
        const stmt = this.db.prepare(`
            INSERT INTO phrases (phrase, meaning, example, category, difficulty, enabled)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        try {
            const result = stmt.run(
                phrase.phrase,
                phrase.meaning,
                phrase.example || '',
                phrase.category || '其他',
                phrase.difficulty || 2,
                phrase.enabled !== false ? 1 : 0
            );
            return { success: true, id: result.lastInsertRowid };
        } catch (error) {
            if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                return { success: false, error: '短语已存在' };
            }
            throw error;
        }
    }

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
            return { success: result.changes > 0 };
        } catch (error) {
            if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                return { success: false, error: '短语已存在' };
            }
            throw error;
        }
    }

    deletePhrase(id) {
        const stmt = this.db.prepare('DELETE FROM phrases WHERE id = ?');
        const result = stmt.run(id);
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
            updated_at: row.updated_at
        };
    }

    // ============================================
    // 句型操作
    // ============================================

    addPattern(pattern) {
        const stmt = this.db.prepare(`
            INSERT INTO patterns (pattern, meaning, example, category, difficulty, enabled)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        try {
            const result = stmt.run(
                pattern.pattern,
                pattern.meaning,
                pattern.example || '',
                pattern.category || '其他',
                pattern.difficulty || 2,
                pattern.enabled !== false ? 1 : 0
            );
            return { success: true, id: result.lastInsertRowid };
        } catch (error) {
            if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                return { success: false, error: '句型已存在' };
            }
            throw error;
        }
    }

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
            return { success: result.changes > 0 };
        } catch (error) {
            if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                return { success: false, error: '句型已存在' };
            }
            throw error;
        }
    }

    deletePattern(id) {
        const stmt = this.db.prepare('DELETE FROM patterns WHERE id = ?');
        const result = stmt.run(id);
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
            updated_at: row.updated_at
        };
    }

    // ============================================
    // 通用操作
    // ============================================

    /**
     * 获取统计信息
     */
    getStats() {
        const words = this.db.prepare('SELECT COUNT(*) as count FROM words').get().count;
        const wordsEnabled = this.db.prepare('SELECT COUNT(*) as count FROM words WHERE enabled = 1').get().count;
        const phrases = this.db.prepare('SELECT COUNT(*) as count FROM phrases').get().count;
        const phrasesEnabled = this.db.prepare('SELECT COUNT(*) as count FROM phrases WHERE enabled = 1').get().count;
        const patterns = this.db.prepare('SELECT COUNT(*) as count FROM patterns').get().count;
        const patternsEnabled = this.db.prepare('SELECT COUNT(*) as count FROM patterns WHERE enabled = 1').get().count;
        
        return {
            words,
            wordsEnabled,
            wordsDisabled: words - wordsEnabled,
            phrases,
            phrasesEnabled,
            phrasesDisabled: phrases - phrasesEnabled,
            patterns,
            patternsEnabled,
            patternsDisabled: patterns - patternsEnabled,
            total: words + phrases + patterns
        };
    }

    /**
     * 切换启用状态
     */
    toggleWord(id) {
        const word = this.getWordById(id);
        if (!word) return { success: false, error: '单词不存在' };
        word.enabled = !word.enabled;
        return this.updateWord(id, word);
    }

    togglePhrase(id) {
        const phrase = this.getPhraseById(id);
        if (!phrase) return { success: false, error: '短语不存在' };
        phrase.enabled = !phrase.enabled;
        return this.updatePhrase(id, phrase);
    }

    togglePattern(id) {
        const pattern = this.getPatternById(id);
        if (!pattern) return { success: false, error: '句型不存在' };
        pattern.enabled = !pattern.enabled;
        return this.updatePattern(id, pattern);
    }

    /**
     * 导出为 JSON
     */
    exportToJson() {
        return {
            _meta: {
                version: '1.0',
                exported_at: new Date().toISOString(),
                stats: this.getStats()
            },
            words: this.getAllWords(true),
            phrases: this.getAllPhrases(true),
            patterns: this.getAllPatterns(true)
        };
    }

    /**
     * 从 JSON 导入
     */
    importFromJson(data) {
        let imported = { words: 0, phrases: 0, patterns: 0 };
        let skipped = { words: 0, phrases: 0, patterns: 0 };

        // 导入单词
        if (data.words && Array.isArray(data.words)) {
            for (const word of data.words) {
                const result = this.addWord(word);
                if (result.success) imported.words++;
                else skipped.words++;
            }
        }

        // 导入短语
        if (data.phrases && Array.isArray(data.phrases)) {
            for (const phrase of data.phrases) {
                const result = this.addPhrase(phrase);
                if (result.success) imported.phrases++;
                else skipped.phrases++;
            }
        }

        // 导入句型
        if (data.patterns && Array.isArray(data.patterns)) {
            for (const pattern of data.patterns) {
                const result = this.addPattern(pattern);
                if (result.success) imported.patterns++;
                else skipped.patterns++;
            }
        }

        console.log(`[VocabularyService] 导入完成: 单词${imported.words}/${imported.words + skipped.words}, 短语${imported.phrases}/${imported.phrases + skipped.phrases}, 句型${imported.patterns}/${imported.patterns + skipped.patterns}`);
        return { imported, skipped };
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