/**
 * 词库管理 API - 修复版 v2.3
 * 
 * 📦 v2.3 修复内容：
 * - 修复：POST /phrases 和 /patterns 添加 is_new=1
 * - 新增：PUT /phrases/:id 和 /patterns/:id 添加唯一约束检查
 * - 改进：错误日志更详细
 * 
 * 使用方法：
 * 将此文件复制到 backend/routes/vocabulary-api.js
 */

const express = require('express');
const router = express.Router();
const Database = require('better-sqlite3');
const path = require('path');
const { getGrammarService } = require('../services/grammarService');

const dbPath = path.join(__dirname, '..', 'data', 'vocabulary.db');
const db = new Database(dbPath);

// 获取语法服务（用于转移功能）
const grammarService = getGrammarService();

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
        console.error('[Vocabulary API] 获取统计失败:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * v2.2 新增：精确检查是否存在
 * GET /api/vocabulary/check-exists?text=xxx&type=word|phrase|pattern
 */
router.get('/check-exists', (req, res) => {
    try {
        const { text, type } = req.query;
        
        if (!text) {
            return res.status(400).json({ success: false, error: '请提供 text 参数' });
        }
        
        let exists = false;
        let item = null;
        
        if (!type || type === 'word') {
            const word = db.prepare('SELECT * FROM words WHERE LOWER(word) = LOWER(?)').get(text);
            if (word) {
                exists = true;
                item = { ...word, type: 'word', table: 'words' };
            }
        }
        
        if (!exists && (!type || type === 'phrase')) {
            const phrase = db.prepare('SELECT * FROM phrases WHERE LOWER(phrase) = LOWER(?)').get(text);
            if (phrase) {
                exists = true;
                item = { ...phrase, type: 'phrase', table: 'phrases' };
            }
        }
        
        if (!exists && (!type || type === 'pattern')) {
            const pattern = db.prepare('SELECT * FROM patterns WHERE LOWER(pattern) = LOWER(?)').get(text);
            if (pattern) {
                exists = true;
                item = { ...pattern, type: 'pattern', table: 'patterns' };
            }
        }
        
        res.json({ 
            success: true, 
            exists, 
            data: item 
        });
    } catch (e) {
        console.error('[Vocabulary] 检查是否存在失败:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ============================================
// 单词 CRUD
// ============================================

router.get('/words', (req, res) => {
    try {
        const search = req.query.search || '';
        const all = req.query.all === 'true';
        const limit = parseInt(req.query.limit) || 100;
        
        let words;
        if (search) {
            const searchPattern = `%${search}%`;
            words = db.prepare(`
                SELECT id, word, meaning, phonetic, pos, example, category, enabled, 
                       COALESCE(is_new, 0) as is_new, created_at
                FROM words 
                WHERE word LIKE ? OR meaning LIKE ?
                ORDER BY created_at DESC
                LIMIT ?
            `).all(searchPattern, searchPattern, limit);
        } else if (all) {
            words = db.prepare(`
                SELECT id, word, meaning, phonetic, pos, example, category, enabled, 
                       COALESCE(is_new, 0) as is_new, created_at
                FROM words 
                ORDER BY created_at DESC
            `).all();
        } else {
            words = db.prepare(`
                SELECT id, word, meaning, phonetic, pos, example, category, enabled, 
                       COALESCE(is_new, 0) as is_new, created_at
                FROM words 
                WHERE enabled = 1 
                ORDER BY created_at DESC
                LIMIT ?
            `).all(limit);
        }
        
        res.json({ success: true, data: words });
    } catch (e) {
        console.error('[Vocabulary API] 获取单词列表失败:', e);
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
        console.error('[Vocabulary API] 获取单词失败:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /words
 * v2.3 修复：统一设置 is_new=1
 */
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
        
        console.log(`[Vocabulary API] 添加单词成功: "${word}" (ID: ${result.lastInsertRowid})`);
        res.json({ success: true, id: result.lastInsertRowid });
    } catch (e) {
        console.error('[Vocabulary API] 添加单词失败:', {
            error: e.message,
            code: e.code,
            word: req.body.word
        });
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * PUT /words/:id
 * 原有的唯一约束检查保持不变
 */
router.put('/words/:id', (req, res) => {
    try {
        const { word, meaning, phonetic, pos, example, category } = req.body;
        const id = req.params.id;
        console.log('[Vocabulary] 更新单词请求:', id, { word, meaning, phonetic, pos, category });
        
        // 检查是否有其他记录使用相同的单词名
        const existing = db.prepare('SELECT id FROM words WHERE word = ? AND id != ?').get(word, id);
        if (existing) {
            console.log('[Vocabulary] 单词已存在:', word, '被记录', existing.id, '使用');
            return res.status(400).json({ 
                success: false, 
                error: `单词 "${word}" 已存在（ID: ${existing.id}）` 
            });
        }
        
        const stmt = db.prepare(`
            UPDATE words SET word=?, meaning=?, phonetic=?, pos=?, example=?, category=?
            WHERE id=?
        `);
        const result = stmt.run(word, meaning, phonetic || '', pos || '', example || '', category || '其他', id);
        console.log('[Vocabulary] 更新单词成功:', result);
        res.json({ success: true });
    } catch (e) {
        console.error('[Vocabulary] 更新单词失败:', e.message, e.stack);
        res.status(500).json({ success: false, error: e.message });
    }
});

router.delete('/words/:id', (req, res) => {
    try {
        db.prepare('DELETE FROM words WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (e) {
        console.error('[Vocabulary API] 删除单词失败:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

router.patch('/words/:id/toggle', (req, res) => {
    try {
        db.prepare('UPDATE words SET enabled = NOT enabled WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (e) {
        console.error('[Vocabulary API] 切换单词状态失败:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /words/:id/confirm
 * 取消NEW标记
 */
router.post('/words/:id/confirm', (req, res) => {
    try {
        db.prepare('UPDATE words SET is_new = 0 WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (e) {
        console.error('[Vocabulary API] 确认单词失败:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ============================================
// 短语 CRUD
// ============================================

router.get('/phrases', (req, res) => {
    try {
        const search = req.query.search || '';
        const all = req.query.all === 'true';
        const limit = parseInt(req.query.limit) || 100;
        
        let phrases;
        if (search) {
            const searchPattern = `%${search}%`;
            phrases = db.prepare(`
                SELECT id, phrase, meaning, example, category, enabled, 
                       COALESCE(is_new, 0) as is_new, created_at
                FROM phrases 
                WHERE phrase LIKE ? OR meaning LIKE ?
                ORDER BY created_at DESC
                LIMIT ?
            `).all(searchPattern, searchPattern, limit);
        } else if (all) {
            phrases = db.prepare(`
                SELECT id, phrase, meaning, example, category, enabled, 
                       COALESCE(is_new, 0) as is_new, created_at
                FROM phrases 
                ORDER BY created_at DESC
            `).all();
        } else {
            phrases = db.prepare(`
                SELECT id, phrase, meaning, example, category, enabled, 
                       COALESCE(is_new, 0) as is_new, created_at
                FROM phrases 
                WHERE enabled = 1 
                ORDER BY created_at DESC
                LIMIT ?
            `).all(limit);
        }
        
        res.json({ success: true, data: phrases });
    } catch (e) {
        console.error('[Vocabulary API] 获取短语列表失败:', e);
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
        console.error('[Vocabulary API] 获取短语失败:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /phrases
 * v2.3 修复：添加 is_new=1
 */
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
        
        console.log(`[Vocabulary API] 添加短语成功: "${phrase}" (ID: ${result.lastInsertRowid})`);
        res.json({ success: true, id: result.lastInsertRowid });
    } catch (e) {
        console.error('[Vocabulary API] 添加短语失败:', {
            error: e.message,
            code: e.code,
            phrase: req.body.phrase
        });
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * PUT /phrases/:id
 * v2.3 新增：唯一约束检查
 */
router.put('/phrases/:id', (req, res) => {
    try {
        const { phrase, meaning, example, category } = req.body;
        const id = req.params.id;
        console.log('[Vocabulary] 更新短语请求:', id, { phrase, meaning, category });
        
        // v2.3 新增：检查是否有其他记录使用相同的短语
        const existing = db.prepare('SELECT id FROM phrases WHERE phrase = ? AND id != ?').get(phrase, id);
        if (existing) {
            console.log('[Vocabulary] 短语已存在:', phrase, '被记录', existing.id, '使用');
            return res.status(400).json({ 
                success: false, 
                error: `短语 "${phrase}" 已存在（ID: ${existing.id}）` 
            });
        }
        
        const stmt = db.prepare(`
            UPDATE phrases SET phrase=?, meaning=?, example=?, category=?
            WHERE id=?
        `);
        const result = stmt.run(phrase, meaning, example || '', category || '其他', id);
        console.log('[Vocabulary] 更新短语成功:', result);
        res.json({ success: true });
    } catch (e) {
        console.error('[Vocabulary] 更新短语失败:', e.message, e.stack);
        res.status(500).json({ success: false, error: e.message });
    }
});

router.delete('/phrases/:id', (req, res) => {
    try {
        db.prepare('DELETE FROM phrases WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (e) {
        console.error('[Vocabulary API] 删除短语失败:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

router.patch('/phrases/:id/toggle', (req, res) => {
    try {
        db.prepare('UPDATE phrases SET enabled = NOT enabled WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (e) {
        console.error('[Vocabulary API] 切换短语状态失败:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /phrases/:id/confirm
 * 取消NEW标记
 */
router.post('/phrases/:id/confirm', (req, res) => {
    try {
        db.prepare('UPDATE phrases SET is_new = 0 WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (e) {
        console.error('[Vocabulary API] 确认短语失败:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ============================================
// 句型 CRUD
// ============================================

router.get('/patterns', (req, res) => {
    try {
        const search = req.query.search || '';
        const all = req.query.all === 'true';
        const limit = parseInt(req.query.limit) || 100;
        
        let patterns;
        if (search) {
            const searchPattern = `%${search}%`;
            patterns = db.prepare(`
                SELECT id, pattern, meaning, example, category, enabled, 
                       COALESCE(is_new, 0) as is_new, created_at
                FROM patterns 
                WHERE pattern LIKE ? OR meaning LIKE ?
                ORDER BY created_at DESC
                LIMIT ?
            `).all(searchPattern, searchPattern, limit);
        } else if (all) {
            patterns = db.prepare(`
                SELECT id, pattern, meaning, example, category, enabled, 
                       COALESCE(is_new, 0) as is_new, created_at
                FROM patterns 
                ORDER BY created_at DESC
            `).all();
        } else {
            patterns = db.prepare(`
                SELECT id, pattern, meaning, example, category, enabled, 
                       COALESCE(is_new, 0) as is_new, created_at
                FROM patterns 
                WHERE enabled = 1 
                ORDER BY created_at DESC
                LIMIT ?
            `).all(limit);
        }
        
        res.json({ success: true, data: patterns });
    } catch (e) {
        console.error('[Vocabulary API] 获取句型列表失败:', e);
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
        console.error('[Vocabulary API] 获取句型失败:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /patterns
 * v2.3 修复：添加 is_new=1
 */
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
        
        console.log(`[Vocabulary API] 添加句型成功: "${pattern}" (ID: ${result.lastInsertRowid})`);
        res.json({ success: true, id: result.lastInsertRowid });
    } catch (e) {
        console.error('[Vocabulary API] 添加句型失败:', {
            error: e.message,
            code: e.code,
            pattern: req.body.pattern
        });
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * PUT /patterns/:id
 * v2.3 新增：唯一约束检查
 */
router.put('/patterns/:id', (req, res) => {
    try {
        const { pattern, meaning, example, category } = req.body;
        const id = req.params.id;
        console.log('[Vocabulary] 更新句型请求:', id, { pattern, meaning, category });
        
        // v2.3 新增：检查是否有其他记录使用相同的句型
        const existing = db.prepare('SELECT id FROM patterns WHERE pattern = ? AND id != ?').get(pattern, id);
        if (existing) {
            console.log('[Vocabulary] 句型已存在:', pattern, '被记录', existing.id, '使用');
            return res.status(400).json({ 
                success: false, 
                error: `句型 "${pattern}" 已存在（ID: ${existing.id}）` 
            });
        }
        
        const stmt = db.prepare(`
            UPDATE patterns SET pattern=?, meaning=?, example=?, category=?
            WHERE id=?
        `);
        const result = stmt.run(pattern, meaning, example || '', category || '其他', id);
        console.log('[Vocabulary] 更新句型成功:', result);
        res.json({ success: true });
    } catch (e) {
        console.error('[Vocabulary] 更新句型失败:', e.message, e.stack);
        res.status(500).json({ success: false, error: e.message });
    }
});

router.delete('/patterns/:id', (req, res) => {
    try {
        db.prepare('DELETE FROM patterns WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (e) {
        console.error('[Vocabulary API] 删除句型失败:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

router.patch('/patterns/:id/toggle', (req, res) => {
    try {
        db.prepare('UPDATE patterns SET enabled = NOT enabled WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (e) {
        console.error('[Vocabulary API] 切换句型状态失败:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /patterns/:id/confirm
 * 取消NEW标记
 */
router.post('/patterns/:id/confirm', (req, res) => {
    try {
        db.prepare('UPDATE patterns SET is_new = 0 WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (e) {
        console.error('[Vocabulary API] 确认句型失败:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ============================================
// 获取全部数据（混合）
// ============================================

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
            `).all(Math.floor(limit * 0.5));
            
            phrases = db.prepare(`
                SELECT id, phrase, meaning, example, category, enabled, 
                       COALESCE(is_new, 0) as is_new, created_at, 'phrase' as type
                FROM phrases 
                ORDER BY created_at DESC
                LIMIT ?
            `).all(Math.floor(limit * 0.3));
            
            patterns = db.prepare(`
                SELECT id, pattern, meaning, example, category, enabled, 
                       COALESCE(is_new, 0) as is_new, created_at, 'pattern' as type
                FROM patterns 
                ORDER BY created_at DESC
                LIMIT ?
            `).all(Math.floor(limit * 0.2));
        }
        
        const allItems = [...words, ...phrases, ...patterns].sort((a, b) => {
            return new Date(b.created_at) - new Date(a.created_at);
        });
        
        res.json({ success: true, data: allItems });
    } catch (e) {
        console.error('[Vocabulary API] 获取全部数据失败:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;