/**
 * 词库管理 API - 更新版 v2.1
 * 
 * 📦 v2.0 功能：
 * 1. GET /all - 获取全部数据（按时间排序）
 * 2. POST /:table/:id/confirm - 取消标新
 * 3. 新增数据自动标记 is_new = 1
 * 
 * 📦 v2.1 新增：
 * - POST /words/:id/transfer - 单词转移到语法库
 * - POST /phrases/:id/transfer - 短语转移到语法库
 * - POST /patterns/:id/transfer - 句型转移到语法库
 * 
 * 使用方法：
 * 替换 backend/routes/vocabulary-api.js
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
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * 获取全部数据（单词+短语+句型混合，按创建时间倒序）
 * GET /api/vocabulary/all
 * 支持多词模糊搜索：用空格分隔的词都会匹配
 */
router.get('/all', (req, res) => {
    try {
        const search = req.query.search || '';
        const limit = parseInt(req.query.limit) || 200;
        
        let words = [], phrases = [], patterns = [];
        
        if (search) {
            // 分割搜索词，支持多词搜索
            const searchTerms = search.trim().split(/\s+/).filter(t => t.length > 0);
            
            if (searchTerms.length === 1) {
                // 单词搜索：简单模糊匹配
                const searchPattern = `%${searchTerms[0]}%`;
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
                // 多词搜索：任一词匹配即可（OR逻辑，更宽松）
                const conditions = searchTerms.map(() => `(word LIKE ? OR meaning LIKE ?)`).join(' OR ');
                const conditionsPh = searchTerms.map(() => `(phrase LIKE ? OR meaning LIKE ?)`).join(' OR ');
                const conditionsPt = searchTerms.map(() => `(pattern LIKE ? OR meaning LIKE ?)`).join(' OR ');
                
                const buildParams = () => {
                    const params = [];
                    searchTerms.forEach(term => {
                        params.push(`%${term}%`, `%${term}%`);
                    });
                    return params;
                };
                
                words = db.prepare(`
                    SELECT id, word, meaning, phonetic, pos, example, category, enabled, 
                           COALESCE(is_new, 0) as is_new, created_at, 'word' as type
                    FROM words 
                    WHERE ${conditions}
                    ORDER BY created_at DESC
                `).all(...buildParams());
                
                phrases = db.prepare(`
                    SELECT id, phrase, meaning, example, category, enabled, 
                           COALESCE(is_new, 0) as is_new, created_at, 'phrase' as type
                    FROM phrases 
                    WHERE ${conditionsPh}
                    ORDER BY created_at DESC
                `).all(...buildParams());
                
                patterns = db.prepare(`
                    SELECT id, pattern, meaning, example, category, enabled, 
                           COALESCE(is_new, 0) as is_new, created_at, 'pattern' as type
                    FROM patterns 
                    WHERE ${conditionsPt}
                    ORDER BY created_at DESC
                `).all(...buildParams());
            }
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

/**
 * v2.1 新增：单词转移到语法库
 * POST /api/vocabulary/words/:id/transfer
 */
router.post('/words/:id/transfer', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { deleteSource = true } = req.body;
        
        // 获取源数据
        const word = db.prepare('SELECT * FROM words WHERE id = ?').get(id);
        if (!word) {
            return res.status(404).json({ success: false, error: '单词不存在' });
        }
        
        // 转移到语法库
        const addResult = grammarService.add({
            title: word.word,
            keywords: [word.word],
            definition: word.meaning || '',
            structure: '',
            usage: [],
            examples: word.example ? [word.example] : [],
            mistakes: [],
            category: word.category || '其他'
        });
        
        if (!addResult || !addResult.success) {
            return res.status(400).json({ 
                success: false, 
                error: addResult?.error || '转移失败，目标可能已存在' 
            });
        }
        
        // 删除源数据
        if (deleteSource) {
            db.prepare('DELETE FROM words WHERE id = ?').run(id);
        }
        
        console.log(`[Vocabulary API] 转移成功: 单词#${id} "${word.word}" → 语法#${addResult.id}`);
        
        res.json({
            success: true,
            message: '转移成功',
            data: {
                sourceId: id,
                sourceTitle: word.word,
                sourceType: 'word',
                targetType: 'grammar',
                targetId: addResult.id,
                deleted: deleteSource
            }
        });
    } catch (e) {
        console.error('[Vocabulary API] 单词转移失败:', e);
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
        const id = req.params.id;
        console.log('[Vocabulary] 更新短语请求:', id, { phrase, meaning, category });
        
        // 检查是否有其他记录使用相同的短语
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

/**
 * v2.1 新增：短语转移到语法库
 * POST /api/vocabulary/phrases/:id/transfer
 */
router.post('/phrases/:id/transfer', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { deleteSource = true } = req.body;
        
        // 获取源数据
        const phrase = db.prepare('SELECT * FROM phrases WHERE id = ?').get(id);
        if (!phrase) {
            return res.status(404).json({ success: false, error: '短语不存在' });
        }
        
        // 转移到语法库
        const addResult = grammarService.add({
            title: phrase.phrase,
            keywords: [phrase.phrase],
            definition: phrase.meaning || '',
            structure: '',
            usage: [],
            examples: phrase.example ? [phrase.example] : [],
            mistakes: [],
            category: phrase.category || '其他'
        });
        
        if (!addResult || !addResult.success) {
            return res.status(400).json({ 
                success: false, 
                error: addResult?.error || '转移失败，目标可能已存在' 
            });
        }
        
        // 删除源数据
        if (deleteSource) {
            db.prepare('DELETE FROM phrases WHERE id = ?').run(id);
        }
        
        console.log(`[Vocabulary API] 转移成功: 短语#${id} "${phrase.phrase}" → 语法#${addResult.id}`);
        
        res.json({
            success: true,
            message: '转移成功',
            data: {
                sourceId: id,
                sourceTitle: phrase.phrase,
                sourceType: 'phrase',
                targetType: 'grammar',
                targetId: addResult.id,
                deleted: deleteSource
            }
        });
    } catch (e) {
        console.error('[Vocabulary API] 短语转移失败:', e);
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
        const id = req.params.id;
        console.log('[Vocabulary] 更新句型请求:', id, { pattern, meaning, category });
        
        // 检查是否有其他记录使用相同的句型
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

/**
 * v2.1 新增：句型转移到语法库
 * POST /api/vocabulary/patterns/:id/transfer
 */
router.post('/patterns/:id/transfer', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { deleteSource = true } = req.body;
        
        // 获取源数据
        const pattern = db.prepare('SELECT * FROM patterns WHERE id = ?').get(id);
        if (!pattern) {
            return res.status(404).json({ success: false, error: '句型不存在' });
        }
        
        // 转移到语法库
        const addResult = grammarService.add({
            title: pattern.pattern,
            keywords: [pattern.pattern],
            definition: pattern.meaning || '',
            structure: '',
            usage: [],
            examples: pattern.example ? [pattern.example] : [],
            mistakes: [],
            category: pattern.category || '其他'
        });
        
        if (!addResult || !addResult.success) {
            return res.status(400).json({ 
                success: false, 
                error: addResult?.error || '转移失败，目标可能已存在' 
            });
        }
        
        // 删除源数据
        if (deleteSource) {
            db.prepare('DELETE FROM patterns WHERE id = ?').run(id);
        }
        
        console.log(`[Vocabulary API] 转移成功: 句型#${id} "${pattern.pattern}" → 语法#${addResult.id}`);
        
        res.json({
            success: true,
            message: '转移成功',
            data: {
                sourceId: id,
                sourceTitle: pattern.pattern,
                sourceType: 'pattern',
                targetType: 'grammar',
                targetId: addResult.id,
                deleted: deleteSource
            }
        });
    } catch (e) {
        console.error('[Vocabulary API] 句型转移失败:', e);
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
