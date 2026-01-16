/**
 * 词库管理 API - 更新版 v2.0
 * 
 * 新增功能：
 * 1. GET /all - 获取全部数据（按时间排序）
 * 2. POST /:table/:id/confirm - 取消标新
 * 3. 新增数据自动标记 is_new = 1
 * 
 * 使用方法：
 * 替换 D:\sorryios-test\backend\routes\vocabulary-api.js
 */

const express = require('express');
const router = express.Router();
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'vocabulary.db');
const db = new Database(dbPath);

// 确保 is_new 字段存在
try {
    const columns = db.prepare("PRAGMA table_info(words)").all();
    const hasIsNew = columns.some(col => col.name === 'is_new');
    if (!hasIsNew) {
        console.log('[Vocabulary] 添加 is_new 字段...');
        db.exec(`ALTER TABLE words ADD COLUMN is_new INTEGER DEFAULT 0`);
        db.exec(`ALTER TABLE phrases ADD COLUMN is_new INTEGER DEFAULT 0`);
        db.exec(`ALTER TABLE patterns ADD COLUMN is_new INTEGER DEFAULT 0`);
    }
} catch (e) {
    console.log('[Vocabulary] is_new 字段检查:', e.message);
}

// 统计
router.get('/stats', (req, res) => {
    try {
        const words = db.prepare('SELECT COUNT(*) as c FROM words').get().c;
        const phrases = db.prepare('SELECT COUNT(*) as c FROM phrases').get().c;
        const patterns = db.prepare('SELECT COUNT(*) as c FROM patterns').get().c;
        const newCount = db.prepare('SELECT COUNT(*) as c FROM words WHERE is_new=1').get().c +
                         db.prepare('SELECT COUNT(*) as c FROM phrases WHERE is_new=1').get().c +
                         db.prepare('SELECT COUNT(*) as c FROM patterns WHERE is_new=1').get().c;
        res.json({ 
            success: true, 
            data: { 
                words, 
                phrases, 
                patterns, 
                total: words + phrases + patterns,
                newCount 
            } 
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * 获取全部数据（单词+短语+句型混合，按创建时间倒序）
 * GET /api/vocabulary/all
 */
router.get('/all', (req, res) => {
    try {
        const search = req.query.search || '';
        const limit = parseInt(req.query.limit) || 200;
        
        let words = [], phrases = [], patterns = [];
        
        if (search) {
            const searchPattern = `%${search}%`;
            words = db.prepare(`
                SELECT id, word, meaning, phonetic, pos, example, category, enabled, 
                       COALESCE(is_new, 0) as is_new, created_at, 'word' as type
                FROM words 
                WHERE word LIKE ? OR meaning LIKE ?
                ORDER BY created_at DESC
            `).all(searchPattern, searchPattern);
            
            phrases = db.prepare(`
                SELECT id, phrase, meaning, example, category, enabled, 
                       COALESCE(is_new, 0) as is_new, created_at, 'phrase' as type
                FROM phrases 
                WHERE phrase LIKE ? OR meaning LIKE ?
                ORDER BY created_at DESC
            `).all(searchPattern, searchPattern);
            
            patterns = db.prepare(`
                SELECT id, pattern, meaning, example, category, enabled, 
                       COALESCE(is_new, 0) as is_new, created_at, 'pattern' as type
                FROM patterns 
                WHERE pattern LIKE ? OR meaning LIKE ?
                ORDER BY created_at DESC
            `).all(searchPattern, searchPattern);
        } else {
            words = db.prepare(`
                SELECT id, word, meaning, phonetic, pos, example, category, enabled, 
                       COALESCE(is_new, 0) as is_new, created_at, 'word' as type
                FROM words 
                ORDER BY created_at DESC
                LIMIT ?
            `).all(limit);
            
            phrases = db.prepare(`
                SELECT id, phrase, meaning, example, category, enabled, 
                       COALESCE(is_new, 0) as is_new, created_at, 'phrase' as type
                FROM phrases 
                ORDER BY created_at DESC
                LIMIT ?
            `).all(limit);
            
            patterns = db.prepare(`
                SELECT id, pattern, meaning, example, category, enabled, 
                       COALESCE(is_new, 0) as is_new, created_at, 'pattern' as type
                FROM patterns 
                ORDER BY created_at DESC
                LIMIT ?
            `).all(limit);
        }
        
        // 合并并按时间排序（新的在前）
        const all = [...words, ...phrases, ...patterns].sort((a, b) => {
            // 先按 is_new 排序（新的在前）
            if (a.is_new !== b.is_new) return b.is_new - a.is_new;
            // 再按时间排序
            return new Date(b.created_at) - new Date(a.created_at);
        });
        
        const result = all.slice(0, limit);
        
        res.json({ success: true, data: result, total: result.length });
    } catch (e) {
        console.error('[Vocabulary] 获取全部数据失败:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * 取消标新
 * POST /api/vocabulary/:table/:id/confirm
 */
router.post('/:table/:id/confirm', (req, res) => {
    try {
        const { table, id } = req.params;
        
        if (!['words', 'phrases', 'patterns'].includes(table)) {
            return res.status(400).json({ success: false, error: '无效的表名' });
        }
        
        const stmt = db.prepare(`UPDATE ${table} SET is_new = 0 WHERE id = ?`);
        const result = stmt.run(id);
        
        if (result.changes > 0) {
            res.json({ success: true, message: '已取消标新' });
        } else {
            res.status(404).json({ success: false, error: '记录不存在' });
        }
    } catch (e) {
        console.error('[Vocabulary] 取消标新失败:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ========== 单词 CRUD ==========
router.get('/words', (req, res) => {
    try {
        const search = req.query.search || '';
        const all = req.query.all === 'true';
        const limit = parseInt(req.query.limit) || 100;
        
        let words;
        if (search) {
            words = db.prepare(`
                SELECT *, COALESCE(is_new, 0) as is_new FROM words 
                WHERE word LIKE ? OR meaning LIKE ? 
                ORDER BY is_new DESC, created_at DESC
                LIMIT ?
            `).all(`%${search}%`, `%${search}%`, limit);
        } else if (all) {
            words = db.prepare(`
                SELECT *, COALESCE(is_new, 0) as is_new FROM words 
                ORDER BY is_new DESC, created_at DESC
            `).all();
        } else {
            words = db.prepare(`
                SELECT *, COALESCE(is_new, 0) as is_new FROM words 
                ORDER BY is_new DESC, created_at DESC
                LIMIT ?
            `).all(limit);
        }
        res.json({ success: true, data: words });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.get('/words/:id', (req, res) => {
    try {
        const word = db.prepare('SELECT *, COALESCE(is_new, 0) as is_new FROM words WHERE id = ?').get(req.params.id);
        if (word) {
            res.json({ success: true, data: word });
        } else {
            res.status(404).json({ success: false, error: '未找到' });
        }
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.post('/words', (req, res) => {
    try {
        const { word, meaning, phonetic, pos, example, category } = req.body;
        if (!word || !meaning) {
            return res.status(400).json({ success: false, error: '单词和含义必填' });
        }
        const stmt = db.prepare(`
            INSERT INTO words (word, meaning, phonetic, pos, example, category, enabled, is_new, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, 1, datetime('now', 'localtime'))
        `);
        const result = stmt.run(word, meaning, phonetic || '', pos || '', example || '', category || '其他');
        res.json({ success: true, id: result.lastInsertRowid });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.put('/words/:id', (req, res) => {
    try {
        const { word, meaning, phonetic, pos, example, category } = req.body;
        const stmt = db.prepare(`
            UPDATE words SET word=?, meaning=?, phonetic=?, pos=?, example=?, category=?
            WHERE id=?
        `);
        stmt.run(word, meaning, phonetic || '', pos || '', example || '', category || '其他', req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.delete('/words/:id', (req, res) => {
    try {
        db.prepare('DELETE FROM words WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.patch('/words/:id/toggle', (req, res) => {
    try {
        db.prepare('UPDATE words SET enabled = NOT enabled WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ========== 短语 CRUD ==========
router.get('/phrases', (req, res) => {
    try {
        const search = req.query.search || '';
        const all = req.query.all === 'true';
        const limit = parseInt(req.query.limit) || 100;
        
        let phrases;
        if (search) {
            phrases = db.prepare(`
                SELECT *, COALESCE(is_new, 0) as is_new FROM phrases 
                WHERE phrase LIKE ? OR meaning LIKE ? 
                ORDER BY is_new DESC, created_at DESC
                LIMIT ?
            `).all(`%${search}%`, `%${search}%`, limit);
        } else if (all) {
            phrases = db.prepare(`
                SELECT *, COALESCE(is_new, 0) as is_new FROM phrases 
                ORDER BY is_new DESC, created_at DESC
            `).all();
        } else {
            phrases = db.prepare(`
                SELECT *, COALESCE(is_new, 0) as is_new FROM phrases 
                ORDER BY is_new DESC, created_at DESC
                LIMIT ?
            `).all(limit);
        }
        res.json({ success: true, data: phrases });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.get('/phrases/:id', (req, res) => {
    try {
        const phrase = db.prepare('SELECT *, COALESCE(is_new, 0) as is_new FROM phrases WHERE id = ?').get(req.params.id);
        if (phrase) {
            res.json({ success: true, data: phrase });
        } else {
            res.status(404).json({ success: false, error: '未找到' });
        }
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.post('/phrases', (req, res) => {
    try {
        const { phrase, meaning, example, category } = req.body;
        if (!phrase || !meaning) {
            return res.status(400).json({ success: false, error: '短语和含义必填' });
        }
        const stmt = db.prepare(`
            INSERT INTO phrases (phrase, meaning, example, category, enabled, is_new, created_at)
            VALUES (?, ?, ?, ?, 1, 1, datetime('now', 'localtime'))
        `);
        const result = stmt.run(phrase, meaning, example || '', category || '其他');
        res.json({ success: true, id: result.lastInsertRowid });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.put('/phrases/:id', (req, res) => {
    try {
        const { phrase, meaning, example, category } = req.body;
        const stmt = db.prepare(`
            UPDATE phrases SET phrase=?, meaning=?, example=?, category=?
            WHERE id=?
        `);
        stmt.run(phrase, meaning, example || '', category || '其他', req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.delete('/phrases/:id', (req, res) => {
    try {
        db.prepare('DELETE FROM phrases WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.patch('/phrases/:id/toggle', (req, res) => {
    try {
        db.prepare('UPDATE phrases SET enabled = NOT enabled WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ========== 句型 CRUD ==========
router.get('/patterns', (req, res) => {
    try {
        const search = req.query.search || '';
        const all = req.query.all === 'true';
        const limit = parseInt(req.query.limit) || 100;
        
        let patterns;
        if (search) {
            patterns = db.prepare(`
                SELECT *, COALESCE(is_new, 0) as is_new FROM patterns 
                WHERE pattern LIKE ? OR meaning LIKE ? 
                ORDER BY is_new DESC, created_at DESC
                LIMIT ?
            `).all(`%${search}%`, `%${search}%`, limit);
        } else if (all) {
            patterns = db.prepare(`
                SELECT *, COALESCE(is_new, 0) as is_new FROM patterns 
                ORDER BY is_new DESC, created_at DESC
            `).all();
        } else {
            patterns = db.prepare(`
                SELECT *, COALESCE(is_new, 0) as is_new FROM patterns 
                ORDER BY is_new DESC, created_at DESC
                LIMIT ?
            `).all(limit);
        }
        res.json({ success: true, data: patterns });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.get('/patterns/:id', (req, res) => {
    try {
        const pattern = db.prepare('SELECT *, COALESCE(is_new, 0) as is_new FROM patterns WHERE id = ?').get(req.params.id);
        if (pattern) {
            res.json({ success: true, data: pattern });
        } else {
            res.status(404).json({ success: false, error: '未找到' });
        }
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.post('/patterns', (req, res) => {
    try {
        const { pattern, meaning, example, category } = req.body;
        if (!pattern || !meaning) {
            return res.status(400).json({ success: false, error: '句型和含义必填' });
        }
        const stmt = db.prepare(`
            INSERT INTO patterns (pattern, meaning, example, category, enabled, is_new, created_at)
            VALUES (?, ?, ?, ?, 1, 1, datetime('now', 'localtime'))
        `);
        const result = stmt.run(pattern, meaning, example || '', category || '其他');
        res.json({ success: true, id: result.lastInsertRowid });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.put('/patterns/:id', (req, res) => {
    try {
        const { pattern, meaning, example, category } = req.body;
        const stmt = db.prepare(`
            UPDATE patterns SET pattern=?, meaning=?, example=?, category=?
            WHERE id=?
        `);
        stmt.run(pattern, meaning, example || '', category || '其他', req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.delete('/patterns/:id', (req, res) => {
    try {
        db.prepare('DELETE FROM patterns WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.patch('/patterns/:id/toggle', (req, res) => {
    try {
        db.prepare('UPDATE patterns SET enabled = NOT enabled WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 批量导入
router.post('/import', (req, res) => {
    try {
        const { data } = req.body;
        if (!data || !Array.isArray(data)) {
            return res.status(400).json({ success: false, error: '无效的数据格式' });
        }
        
        let imported = { words: 0, phrases: 0, patterns: 0 };
        
        const insertWord = db.prepare(`
            INSERT OR IGNORE INTO words (word, meaning, phonetic, pos, example, category, enabled, is_new, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, 1, datetime('now', 'localtime'))
        `);
        const insertPhrase = db.prepare(`
            INSERT OR IGNORE INTO phrases (phrase, meaning, example, category, enabled, is_new, created_at)
            VALUES (?, ?, ?, ?, 1, 1, datetime('now', 'localtime'))
        `);
        const insertPattern = db.prepare(`
            INSERT OR IGNORE INTO patterns (pattern, meaning, example, category, enabled, is_new, created_at)
            VALUES (?, ?, ?, ?, 1, 1, datetime('now', 'localtime'))
        `);
        
        for (const item of data) {
            if (item.word) {
                insertWord.run(item.word, item.meaning || '', item.phonetic || '', item.pos || '', item.example || '', item.category || '其他');
                imported.words++;
            } else if (item.phrase) {
                insertPhrase.run(item.phrase, item.meaning || '', item.example || '', item.category || '其他');
                imported.phrases++;
            } else if (item.pattern) {
                insertPattern.run(item.pattern, item.meaning || '', item.example || '', item.category || '其他');
                imported.patterns++;
            }
        }
        
        res.json({ success: true, imported });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 导出
router.get('/export', (req, res) => {
    try {
        const words = db.prepare('SELECT * FROM words').all();
        const phrases = db.prepare('SELECT * FROM phrases').all();
        const patterns = db.prepare('SELECT * FROM patterns').all();
        res.json({ success: true, data: { words, phrases, patterns } });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
