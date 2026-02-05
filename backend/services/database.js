/**
 * database.js - SQLite 数据库模块 v5.0
 * 
 * 📦 重构版本：合并了 user_mastered.db 和 processing_logs.db
 * 
 * 表结构：
 * - users: 用户表（删除了冗余的 total_tasks/total_files）
 * - tasks: 任务记录表（新增匹配统计字段）
 * - logs: 系统日志表
 * - user_mastered_words: 用户已掌握词汇（从 user_mastered.db 合并）
 * - matched_items: 匹配记录（从 processing_logs.db 合并）
 * - unmatched_items: 未匹配记录（从 processing_logs.db 合并）
 * 
 * 已删除：
 * - files 表（1对1场景不需要，tasks 表已存文件信息）
 * - processing_tasks 表（与 tasks 重复）
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// 确保数据目录存在
const DATA_DIR = path.join(__dirname, '../data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'sorryios.db');
const db = new Database(DB_PATH);

// 启用外键约束
db.pragma('foreign_keys = ON');

/**
 * 初始化数据库表
 */
function initDatabase() {
    // ============================================
    // 用户表（v5.0 删除了 total_tasks/total_files 冗余字段）
    // ============================================
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            email TEXT,
            nickname TEXT,
            role TEXT DEFAULT 'user',
            status TEXT DEFAULT 'active',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_login DATETIME
        )
    `);

    // 检查 users 表字段，自动添加缺失的字段
    try {
        const tableInfo = db.prepare("PRAGMA table_info(users)").all();
        const columns = tableInfo.map(col => col.name);
        
        // 如果存在旧字段，保持兼容
        if (columns.includes('total_tasks') || columns.includes('total_files')) {
            console.log('[Database] 检测到旧版本 users 表，保持兼容...');
        }
        
        // 如果缺少 nickname 字段，自动添加
        if (!columns.includes('nickname')) {
            db.exec(`ALTER TABLE users ADD COLUMN nickname TEXT`);
            console.log('[Database] 添加字段: users.nickname');
        }
    } catch (e) {
        console.log('[Database] 检查 users 字段时出错:', e.message);
    }

    // ============================================
    // 任务表（v5.0 新增匹配统计字段）
    // ============================================
    db.exec(`
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            user_id INTEGER,
            title TEXT,
            status TEXT DEFAULT 'pending',
            progress INTEGER DEFAULT 0,
            file_name TEXT,
            file_size INTEGER,
            file_type TEXT,
            segments_total INTEGER DEFAULT 0,
            segments_processed INTEGER DEFAULT 0,
            output_html TEXT,
            output_md TEXT,
            output_json TEXT,
            
            -- v5.0 新增：匹配统计字段（从 processing_tasks 合并）
            total_items INTEGER DEFAULT 0,
            exact_match_count INTEGER DEFAULT 0,
            fuzzy_match_count INTEGER DEFAULT 0,
            unmatched_count INTEGER DEFAULT 0,
            
            error_message TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            started_at DATETIME,
            completed_at DATETIME,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        )
    `);

    // 检查 tasks 表是否有新字段，如果没有则添加
    try {
        const tableInfo = db.prepare("PRAGMA table_info(tasks)").all();
        const columns = tableInfo.map(col => col.name);
        
        if (!columns.includes('total_items')) {
            db.exec(`ALTER TABLE tasks ADD COLUMN total_items INTEGER DEFAULT 0`);
            console.log('[Database] 添加字段: tasks.total_items');
        }
        if (!columns.includes('exact_match_count')) {
            db.exec(`ALTER TABLE tasks ADD COLUMN exact_match_count INTEGER DEFAULT 0`);
            console.log('[Database] 添加字段: tasks.exact_match_count');
        }
        if (!columns.includes('fuzzy_match_count')) {
            db.exec(`ALTER TABLE tasks ADD COLUMN fuzzy_match_count INTEGER DEFAULT 0`);
            console.log('[Database] 添加字段: tasks.fuzzy_match_count');
        }
        if (!columns.includes('unmatched_count')) {
            db.exec(`ALTER TABLE tasks ADD COLUMN unmatched_count INTEGER DEFAULT 0`);
            console.log('[Database] 添加字段: tasks.unmatched_count');
        }
    } catch (e) {
        console.log('[Database] 检查 tasks 字段时出错:', e.message);
    }

    // ============================================
    // 系统日志表
    // ============================================
    db.exec(`
        CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            level TEXT DEFAULT 'info',
            action TEXT,
            user_id INTEGER,
            task_id TEXT,
            message TEXT,
            details TEXT,
            ip_address TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
        )
    `);

    // ============================================
    // v5.0 新增：用户已掌握词汇表（从 user_mastered.db 合并）
    // ============================================
    db.exec(`
        CREATE TABLE IF NOT EXISTS user_mastered_words (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            word TEXT NOT NULL,
            word_type TEXT DEFAULT 'word',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, word, word_type),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    // ============================================
    // v5.0 新增：匹配记录表（从 processing_logs.db 合并）
    // ============================================
    db.exec(`
        CREATE TABLE IF NOT EXISTS matched_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id TEXT NOT NULL,
            item_type TEXT,
            original_text TEXT,
            matched_text TEXT,
            match_score REAL,
            source_db TEXT,
            source_table TEXT,
            source_id INTEGER,
            matched_data TEXT,
            status TEXT DEFAULT 'pending',
            reviewed_at DATETIME,
            reviewed_by TEXT,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        )
    `);

    // ============================================
    // v5.0 新增：未匹配记录表（从 processing_logs.db 合并）
    // ============================================
    db.exec(`
        CREATE TABLE IF NOT EXISTS unmatched_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id TEXT NOT NULL,
            item_type TEXT,
            original_text TEXT,
            ai_generated TEXT,
            status TEXT DEFAULT 'pending',
            edited_content TEXT,
            imported_to TEXT,
            imported_id INTEGER,
            reviewed_at DATETIME,
            reviewed_by TEXT,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        )
    `);

    // ============================================
    // 创建索引
    // ============================================
    db.exec(`
        -- users 索引
        CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
        CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
        
        -- tasks 索引
        CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
        CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
        
        -- logs 索引
        CREATE INDEX IF NOT EXISTS idx_logs_user_id ON logs(user_id);
        CREATE INDEX IF NOT EXISTS idx_logs_task_id ON logs(task_id);
        CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at);
        
        -- user_mastered_words 索引
        CREATE INDEX IF NOT EXISTS idx_user_mastered_user_id ON user_mastered_words(user_id);
        CREATE INDEX IF NOT EXISTS idx_user_mastered_word ON user_mastered_words(word);
        
        -- matched_items 索引
        CREATE INDEX IF NOT EXISTS idx_matched_task_id ON matched_items(task_id);
        CREATE INDEX IF NOT EXISTS idx_matched_status ON matched_items(status);
        
        -- unmatched_items 索引
        CREATE INDEX IF NOT EXISTS idx_unmatched_task_id ON unmatched_items(task_id);
        CREATE INDEX IF NOT EXISTS idx_unmatched_status ON unmatched_items(status);
    `);

    // 创建默认管理员账号（如果不存在）
    const admin = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');
    if (!admin) {
        db.prepare(`
            INSERT INTO users (username, password, email, role) 
            VALUES (?, ?, ?, ?)
        `).run('admin', 'admin123', 'admin@sorryios.ai', 'admin');
        console.log('✅ Created default admin account: admin / admin123');
    }

    console.log('✅ Database initialized:', DB_PATH);
}

// ============================================
// 用户操作
// ============================================

const UserDB = {
    // 获取所有用户
    getAll() {
        return db.prepare(`
            SELECT id, username, email, nickname, role, status, created_at, last_login
            FROM users ORDER BY created_at DESC
        `).all();
    },

    // 根据ID获取用户
    getById(id) {
        return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    },

    // 根据用户名获取用户
    getByUsername(username) {
        return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    },

    // 创建用户
    create(data) {
        const stmt = db.prepare(`
            INSERT INTO users (username, password, email, nickname, role, status)
            VALUES (@username, @password, @email, @nickname, @role, @status)
        `);
        const result = stmt.run({
            username: data.username,
            password: data.password || '123456',
            email: data.email || '',
            nickname: data.nickname || '',
            role: data.role || 'user',
            status: data.status || 'active'
        });
        return result.lastInsertRowid;
    },

    // 更新用户
    update(id, data) {
        const fields = [];
        const values = {};
        
        if (data.email !== undefined) { fields.push('email = @email'); values.email = data.email; }
        if (data.nickname !== undefined) { fields.push('nickname = @nickname'); values.nickname = data.nickname; }
        if (data.role !== undefined) { fields.push('role = @role'); values.role = data.role; }
        if (data.status !== undefined) { fields.push('status = @status'); values.status = data.status; }
        if (data.password !== undefined) { fields.push('password = @password'); values.password = data.password; }
        
        if (fields.length === 0) return false;
        
        values.id = id;
        const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = @id`;
        return db.prepare(sql).run(values).changes > 0;
    },

    // 删除用户
    delete(id) {
        return db.prepare("DELETE FROM users WHERE id = ? AND role != 'admin'").run(id).changes > 0;
    },

    // 更新登录时间
    updateLoginTime(id) {
        return db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(id);
    },

    // 验证登录
    authenticate(username, password) {
        const user = db.prepare('SELECT * FROM users WHERE username = ? AND password = ?').get(username, password);
        if (user) {
            this.updateLoginTime(user.id);
        }
        return user;
    },

    // 获取统计数据（v5.0 改用 COUNT 查询）
    getStats() {
        const total = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
        const active = db.prepare("SELECT COUNT(*) as count FROM users WHERE status = 'active'").get().count;
        const admins = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get().count;
        return { total, active, admins };
    },

    // v5.0 新增：获取用户的任务数
    getTaskCount(userId) {
        return db.prepare('SELECT COUNT(*) as count FROM tasks WHERE user_id = ?').get(userId).count;
    },

    // v5.0 新增：获取用户的已掌握词汇数
    getMasteredCount(userId) {
        return db.prepare('SELECT COUNT(*) as count FROM user_mastered_words WHERE user_id = ?').get(userId).count;
    }
};

// ============================================
// 任务操作
// ============================================

const TaskDB = {
    // 获取所有任务
    getAll(limit = 100) {
        return db.prepare(`
            SELECT t.*, u.username, u.nickname
            FROM tasks t 
            LEFT JOIN users u ON t.user_id = u.id 
            ORDER BY t.created_at DESC 
            LIMIT ?
        `).all(limit);
    },

    // 根据用户ID获取任务
    getByUserId(userId, limit = 50) {
        return db.prepare(`
            SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
        `).all(userId, limit);
    },

    // 根据ID获取任务
    getById(id) {
        return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    },

    // 创建任务
    create(data) {
        const stmt = db.prepare(`
            INSERT INTO tasks (id, user_id, title, status, file_name, file_size, file_type)
            VALUES (@id, @user_id, @title, @status, @file_name, @file_size, @file_type)
        `);
        stmt.run({
            id: data.id,
            user_id: data.user_id || null,
            title: data.title || 'Untitled',
            status: data.status || 'pending',
            file_name: data.file_name || '',
            file_size: data.file_size || 0,
            file_type: data.file_type || 'txt'
        });
        return data.id;
    },

    // 更新任务状态
    updateStatus(id, status, progress = null) {
        if (progress !== null) {
            return db.prepare('UPDATE tasks SET status = ?, progress = ? WHERE id = ?').run(status, progress, id);
        }
        return db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run(status, id);
    },

    // 更新任务进度
    updateProgress(id, progress, segmentsProcessed = null) {
        if (segmentsProcessed !== null) {
            return db.prepare('UPDATE tasks SET progress = ?, segments_processed = ? WHERE id = ?')
                .run(progress, segmentsProcessed, id);
        }
        return db.prepare('UPDATE tasks SET progress = ? WHERE id = ?').run(progress, id);
    },

    // 任务开始
    markStarted(id, segmentsTotal) {
        return db.prepare(`
            UPDATE tasks SET status = 'processing', started_at = CURRENT_TIMESTAMP, segments_total = ?
            WHERE id = ?
        `).run(segmentsTotal, id);
    },

    // 任务完成
    markCompleted(id, outputs) {
        return db.prepare(`
            UPDATE tasks SET 
                status = 'completed', 
                progress = 100,
                completed_at = CURRENT_TIMESTAMP,
                output_html = ?,
                output_md = ?,
                output_json = ?
            WHERE id = ?
        `).run(outputs.html || '', outputs.md || '', outputs.json || '', id);
    },

    // 任务失败
    markFailed(id, errorMessage) {
        return db.prepare(`
            UPDATE tasks SET status = 'failed', error_message = ?, completed_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(errorMessage, id);
    },

    // v5.0 新增：更新匹配统计
    updateMatchStats(id, stats) {
        return db.prepare(`
            UPDATE tasks SET 
                total_items = ?,
                exact_match_count = ?,
                fuzzy_match_count = ?,
                unmatched_count = ?
            WHERE id = ?
        `).run(
            stats.total || 0,
            stats.exactMatch || 0,
            stats.fuzzyMatch || 0,
            stats.unmatched || 0,
            id
        );
    },

    // 删除任务
    delete(id) {
        return db.prepare('DELETE FROM tasks WHERE id = ?').run(id).changes > 0;
    },

    // 获取统计数据
    getStats() {
        const total = db.prepare('SELECT COUNT(*) as count FROM tasks').get().count;
        const completed = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE status = 'completed'").get().count;
        const failed = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE status = 'failed'").get().count;
        const processing = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE status = 'processing'").get().count;
        const pending = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE status = 'pending'").get().count;
        
        // 今日任务
        const today = db.prepare(`
            SELECT COUNT(*) as count FROM tasks 
            WHERE date(created_at) = date('now')
        `).get().count;
        
        // 本周任务
        const thisWeek = db.prepare(`
            SELECT COUNT(*) as count FROM tasks 
            WHERE created_at >= date('now', '-7 days')
        `).get().count;

        return { total, completed, failed, processing, pending, today, thisWeek };
    },

    // 获取最近任务
    getRecent(limit = 10) {
        return db.prepare(`
            SELECT t.*, u.username, u.nickname
            FROM tasks t 
            LEFT JOIN users u ON t.user_id = u.id 
            ORDER BY t.created_at DESC 
            LIMIT ?
        `).all(limit);
    }
};

// ============================================
// v5.0 新增：用户已掌握词汇操作
// ============================================

const UserMasteredDB = {
    /**
     * 添加已掌握词汇
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
     * 批量添加
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
     * 获取所有已掌握词汇
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
     * 按类型获取
     */
    getByType(userId, wordType) {
        return db.prepare(`
            SELECT word, word_type, created_at 
            FROM user_mastered_words 
            WHERE user_id = ? AND word_type = ?
            ORDER BY created_at DESC
        `).all(userId, wordType);
    },

    /**
     * 检查是否已掌握
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
     * 获取已掌握词汇集合（用于快速过滤）
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
     * 统计
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
     * 清空
     */
    clear(userId) {
        return db.prepare(`
            DELETE FROM user_mastered_words WHERE user_id = ?
        `).run(userId).changes;
    }
};

// ============================================
// v5.0 新增：匹配记录操作
// ============================================

const MatchedItemDB = {
    /**
     * 添加匹配记录
     */
    add(item) {
        const stmt = db.prepare(`
            INSERT INTO matched_items (
                task_id, item_type, original_text, matched_text, match_score,
                source_db, source_table, source_id, matched_data, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        // 100% 匹配自动确认
        const status = item.match_score >= 1.0 ? 'auto_confirmed' : 'pending';

        const result = stmt.run(
            item.task_id,
            item.item_type,
            item.original_text,
            item.matched_text,
            item.match_score,
            item.source_db,
            item.source_table,
            item.source_id,
            JSON.stringify(item.matched_data || {}),
            status
        );
        return { success: true, id: result.lastInsertRowid };
    },

    /**
     * 批量添加
     */
    addBatch(items) {
        const insert = db.prepare(`
            INSERT INTO matched_items (
                task_id, item_type, original_text, matched_text, match_score,
                source_db, source_table, source_id, matched_data, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const insertMany = db.transaction((items) => {
            for (const item of items) {
                const status = item.match_score >= 1.0 ? 'auto_confirmed' : 'pending';
                insert.run(
                    item.task_id,
                    item.item_type,
                    item.original_text,
                    item.matched_text,
                    item.match_score,
                    item.source_db,
                    item.source_table,
                    item.source_id,
                    JSON.stringify(item.matched_data || {}),
                    status
                );
            }
        });

        insertMany(items);
        return { success: true, count: items.length };
    },

    /**
     * 获取任务的匹配记录
     */
    getByTaskId(taskId, status = null) {
        let sql = 'SELECT * FROM matched_items WHERE task_id = ?';
        const params = [taskId];

        if (status) {
            sql += ' AND status = ?';
            params.push(status);
        }
        sql += ' ORDER BY id';

        const rows = db.prepare(sql).all(...params);
        return rows.map(row => ({
            ...row,
            matched_data: JSON.parse(row.matched_data || '{}')
        }));
    },

    /**
     * 确认匹配
     */
    confirm(id, reviewedBy = null) {
        return db.prepare(`
            UPDATE matched_items SET
                status = 'confirmed',
                reviewed_at = CURRENT_TIMESTAMP,
                reviewed_by = ?
            WHERE id = ?
        `).run(reviewedBy, id).changes > 0;
    },

    /**
     * 拒绝匹配
     */
    reject(id, reviewedBy = null, notes = null) {
        return db.prepare(`
            UPDATE matched_items SET
                status = 'rejected',
                reviewed_at = CURRENT_TIMESTAMP,
                reviewed_by = ?,
                notes = ?
            WHERE id = ?
        `).run(reviewedBy, notes, id).changes > 0;
    },

    /**
     * 批量确认
     */
    confirmByTaskId(taskId, reviewedBy = null) {
        const result = db.prepare(`
            UPDATE matched_items SET
                status = 'confirmed',
                reviewed_at = CURRENT_TIMESTAMP,
                reviewed_by = ?
            WHERE task_id = ? AND status = 'pending'
        `).run(reviewedBy, taskId);
        return { success: true, count: result.changes };
    }
};

// ============================================
// v5.0 新增：未匹配记录操作
// ============================================

const UnmatchedItemDB = {
    /**
     * 添加未匹配记录
     */
    add(item) {
        const stmt = db.prepare(`
            INSERT INTO unmatched_items (
                task_id, item_type, original_text, ai_generated, status
            ) VALUES (?, ?, ?, ?, 'pending')
        `);

        const result = stmt.run(
            item.task_id,
            item.item_type,
            item.original_text,
            JSON.stringify(item.ai_generated || {})
        );
        return { success: true, id: result.lastInsertRowid };
    },

    /**
     * 批量添加
     */
    addBatch(items) {
        const insert = db.prepare(`
            INSERT INTO unmatched_items (
                task_id, item_type, original_text, ai_generated, status
            ) VALUES (?, ?, ?, ?, 'pending')
        `);

        const insertMany = db.transaction((items) => {
            for (const item of items) {
                insert.run(
                    item.task_id,
                    item.item_type,
                    item.original_text,
                    JSON.stringify(item.ai_generated || {})
                );
            }
        });

        insertMany(items);
        return { success: true, count: items.length };
    },

    /**
     * 获取任务的未匹配记录
     */
    getByTaskId(taskId, status = null) {
        let sql = 'SELECT * FROM unmatched_items WHERE task_id = ?';
        const params = [taskId];

        if (status) {
            sql += ' AND status = ?';
            params.push(status);
        }
        sql += ' ORDER BY id';

        const rows = db.prepare(sql).all(...params);
        return rows.map(row => ({
            ...row,
            ai_generated: JSON.parse(row.ai_generated || '{}'),
            edited_content: row.edited_content ? JSON.parse(row.edited_content) : null
        }));
    },

    /**
     * 获取单条记录
     */
    getById(id) {
        const row = db.prepare('SELECT * FROM unmatched_items WHERE id = ?').get(id);
        if (!row) return null;
        return {
            ...row,
            ai_generated: JSON.parse(row.ai_generated || '{}'),
            edited_content: row.edited_content ? JSON.parse(row.edited_content) : null
        };
    },

    /**
     * 更新（编辑）
     */
    update(id, editedContent) {
        return db.prepare(`
            UPDATE unmatched_items SET
                edited_content = ?,
                status = 'edited',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(JSON.stringify(editedContent), id).changes > 0;
    },

    /**
     * 标记为已导入
     */
    markImported(id, importedTo, importedId, reviewedBy = null) {
        return db.prepare(`
            UPDATE unmatched_items SET
                status = 'imported',
                imported_to = ?,
                imported_id = ?,
                reviewed_at = CURRENT_TIMESTAMP,
                reviewed_by = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(importedTo, importedId, reviewedBy, id).changes > 0;
    },

    /**
     * 标记为忽略
     */
    ignore(id, reviewedBy = null, notes = null) {
        return db.prepare(`
            UPDATE unmatched_items SET
                status = 'ignored',
                reviewed_at = CURRENT_TIMESTAMP,
                reviewed_by = ?,
                notes = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(reviewedBy, notes, id).changes > 0;
    }
};

// ============================================
// 日志操作
// ============================================

const LogDB = {
    // 添加日志
    add(data) {
        const stmt = db.prepare(`
            INSERT INTO logs (level, action, user_id, task_id, message, details, ip_address)
            VALUES (@level, @action, @user_id, @task_id, @message, @details, @ip_address)
        `);
        return stmt.run({
            level: data.level || 'info',
            action: data.action || '',
            user_id: data.user_id || null,
            task_id: data.task_id || null,
            message: data.message || '',
            details: data.details ? JSON.stringify(data.details) : null,
            ip_address: data.ip_address || ''
        });
    },

    // 获取最近日志
    getRecent(limit = 50) {
        return db.prepare(`
            SELECT l.*, u.username 
            FROM logs l 
            LEFT JOIN users u ON l.user_id = u.id 
            ORDER BY l.created_at DESC 
            LIMIT ?
        `).all(limit);
    }
};

// ============================================
// Dashboard 统计
// ============================================

function getDashboardStats() {
    return {
        users: UserDB.getStats(),
        tasks: TaskDB.getStats(),
        recentTasks: TaskDB.getRecent(5),
        recentLogs: LogDB.getRecent(10)
    };
}

// ============================================
// v5.0 新增：处理日志统计（兼容旧 API）
// ============================================

function getProcessingStats() {
    const pendingMatches = db.prepare(`
        SELECT COUNT(*) as count FROM matched_items WHERE status = 'pending'
    `).get().count;

    const pendingUnmatched = db.prepare(`
        SELECT COUNT(*) as count FROM unmatched_items WHERE status = 'pending'
    `).get().count;

    const editedUnmatched = db.prepare(`
        SELECT COUNT(*) as count FROM unmatched_items WHERE status = 'edited'
    `).get().count;

    const todayTasks = db.prepare(`
        SELECT COUNT(*) as count FROM tasks 
        WHERE date(created_at) = date('now')
    `).get().count;

    return {
        pendingMatches,
        pendingUnmatched,
        editedUnmatched,
        total: pendingMatches + pendingUnmatched + editedUnmatched,
        todayTasks
    };
}

// 初始化数据库
initDatabase();

module.exports = {
    db,
    UserDB,
    TaskDB,
    LogDB,
    UserMasteredDB,      // v5.0 新增
    MatchedItemDB,       // v5.0 新增
    UnmatchedItemDB,     // v5.0 新增
    getDashboardStats,
    getProcessingStats,  // v5.0 新增
    initDatabase
};