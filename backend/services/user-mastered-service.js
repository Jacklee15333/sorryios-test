/**
 * 用户已掌握词汇服务
 * 文件位置: backend/services/user-mastered-service.js
 * 
 * 功能：
 * - 记录用户已掌握的词汇
 * - 生成报告时自动过滤已掌握词汇
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// 确保数据目录存在
const DATA_DIR = path.join(__dirname, '../data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'user_mastered.db');
const db = new Database(DB_PATH);

/**
 * 初始化数据库表
 */
function initDatabase() {
    // 用户已掌握词汇表
    db.exec(`
        CREATE TABLE IF NOT EXISTS user_mastered_words (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            word TEXT NOT NULL,
            word_type TEXT DEFAULT 'word',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, word, word_type)
        )
    `);

    // 创建索引
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_user_mastered_user_id ON user_mastered_words(user_id);
        CREATE INDEX IF NOT EXISTS idx_user_mastered_word ON user_mastered_words(word);
    `);

    console.log('[UserMasteredService] 数据库表已创建');
}

// 初始化
initDatabase();

/**
 * 用户已掌握词汇操作
 */
const UserMasteredDB = {
    /**
     * 添加已掌握词汇
     * @param {number} userId - 用户ID
     * @param {string} word - 词汇
     * @param {string} wordType - 类型: word/phrase/pattern/grammar
     */
    add(userId, word, wordType = 'word') {
        try {
            const stmt = db.prepare(`
                INSERT OR IGNORE INTO user_mastered_words (user_id, word, word_type)
                VALUES (?, ?, ?)
            `);
            const result = stmt.run(userId, word.toLowerCase().trim(), wordType);
            return result.changes > 0;
        } catch (e) {
            console.error('[UserMasteredDB] 添加失败:', e.message);
            return false;
        }
    },

    /**
     * 批量添加已掌握词汇
     */
    addBatch(userId, words) {
        const stmt = db.prepare(`
            INSERT OR IGNORE INTO user_mastered_words (user_id, word, word_type)
            VALUES (?, ?, ?)
        `);
        
        const insertMany = db.transaction((items) => {
            let count = 0;
            for (const item of items) {
                const result = stmt.run(
                    userId, 
                    (item.word || item).toLowerCase().trim(), 
                    item.type || 'word'
                );
                if (result.changes > 0) count++;
            }
            return count;
        });

        return insertMany(words);
    },

    /**
     * 移除已掌握词汇
     */
    remove(userId, word, wordType = null) {
        if (wordType) {
            return db.prepare(`
                DELETE FROM user_mastered_words 
                WHERE user_id = ? AND word = ? AND word_type = ?
            `).run(userId, word.toLowerCase().trim(), wordType).changes > 0;
        }
        return db.prepare(`
            DELETE FROM user_mastered_words 
            WHERE user_id = ? AND word = ?
        `).run(userId, word.toLowerCase().trim()).changes > 0;
    },

    /**
     * 获取用户所有已掌握词汇
     */
    getAll(userId) {
        return db.prepare(`
            SELECT word, word_type, created_at 
            FROM user_mastered_words 
            WHERE user_id = ? 
            ORDER BY created_at DESC
        `).all(userId);
    },

    /**
     * 获取用户已掌握词汇（按类型）
     */
    getByType(userId, wordType) {
        return db.prepare(`
            SELECT word, created_at 
            FROM user_mastered_words 
            WHERE user_id = ? AND word_type = ?
            ORDER BY created_at DESC
        `).all(userId, wordType);
    },

    /**
     * 检查词汇是否已掌握
     */
    isMastered(userId, word, wordType = null) {
        if (wordType) {
            return db.prepare(`
                SELECT 1 FROM user_mastered_words 
                WHERE user_id = ? AND word = ? AND word_type = ?
            `).get(userId, word.toLowerCase().trim(), wordType) !== undefined;
        }
        return db.prepare(`
            SELECT 1 FROM user_mastered_words 
            WHERE user_id = ? AND word = ?
        `).get(userId, word.toLowerCase().trim()) !== undefined;
    },

    /**
     * 获取用户已掌握词汇集合（用于快速过滤）
     */
    getMasteredSet(userId) {
        const rows = db.prepare(`
            SELECT word, word_type FROM user_mastered_words WHERE user_id = ?
        `).all(userId);
        
        const set = {
            words: new Set(),
            phrases: new Set(),
            patterns: new Set(),
            grammar: new Set(),
            all: new Set()
        };

        for (const row of rows) {
            const key = row.word.toLowerCase().trim();
            set.all.add(key);
            
            switch (row.word_type) {
                case 'word': set.words.add(key); break;
                case 'phrase': set.phrases.add(key); break;
                case 'pattern': set.patterns.add(key); break;
                case 'grammar': set.grammar.add(key); break;
            }
        }

        return set;
    },

    /**
     * 统计用户已掌握词汇数量
     */
    getStats(userId) {
        const total = db.prepare(`
            SELECT COUNT(*) as count FROM user_mastered_words WHERE user_id = ?
        `).get(userId).count;

        const byType = db.prepare(`
            SELECT word_type, COUNT(*) as count 
            FROM user_mastered_words 
            WHERE user_id = ? 
            GROUP BY word_type
        `).all(userId);

        const stats = { total, words: 0, phrases: 0, patterns: 0, grammar: 0 };
        for (const row of byType) {
            stats[row.word_type + 's'] = row.count;
        }

        return stats;
    },

    /**
     * 清空用户已掌握词汇
     */
    clear(userId) {
        return db.prepare(`
            DELETE FROM user_mastered_words WHERE user_id = ?
        `).run(userId).changes;
    }
};

/**
 * 过滤报告数据（移除已掌握的词汇）
 */
function filterReportData(reportData, userId) {
    if (!userId) return reportData;

    const mastered = UserMasteredDB.getMasteredSet(userId);
    
    // 过滤词汇
    if (reportData.vocabulary) {
        if (reportData.vocabulary.words) {
            reportData.vocabulary.words = reportData.vocabulary.words.filter(item => {
                const key = (item.word || '').toLowerCase().trim();
                return !mastered.words.has(key) && !mastered.all.has(key);
            });
        }
        if (reportData.vocabulary.phrases) {
            reportData.vocabulary.phrases = reportData.vocabulary.phrases.filter(item => {
                const key = (item.phrase || '').toLowerCase().trim();
                return !mastered.phrases.has(key) && !mastered.all.has(key);
            });
        }
        if (reportData.vocabulary.patterns) {
            reportData.vocabulary.patterns = reportData.vocabulary.patterns.filter(item => {
                const key = (item.pattern || '').toLowerCase().trim();
                return !mastered.patterns.has(key) && !mastered.all.has(key);
            });
        }
    }

    // 过滤语法
    if (reportData.grammar) {
        reportData.grammar = reportData.grammar.filter(item => {
            const key = (item.title || '').toLowerCase().trim();
            return !mastered.grammar.has(key) && !mastered.all.has(key);
        });
    }

    return reportData;
}

module.exports = {
    db,
    UserMasteredDB,
    filterReportData,
    initDatabase
};
