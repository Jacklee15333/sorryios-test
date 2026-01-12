/**
 * database.js - SQLite 数据库模块
 * 
 * 表结构：
 * - users: 用户表
 * - tasks: 任务记录表
 * - files: 文件记录表
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
    // 用户表
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            email TEXT,
            role TEXT DEFAULT 'user',
            status TEXT DEFAULT 'active',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_login DATETIME,
            total_tasks INTEGER DEFAULT 0,
            total_files INTEGER DEFAULT 0
        )
    `);

    // 任务表
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
            error_message TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            started_at DATETIME,
            completed_at DATETIME,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    // 文件记录表
    db.exec(`
        CREATE TABLE IF NOT EXISTS files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            task_id TEXT,
            original_name TEXT,
            stored_name TEXT,
            file_path TEXT,
            file_size INTEGER,
            file_type TEXT,
            mime_type TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (task_id) REFERENCES tasks(id)
        )
    `);

    // 系统日志表
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
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
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
            SELECT id, username, email, role, status, created_at, last_login, total_tasks, total_files
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
            INSERT INTO users (username, password, email, role, status)
            VALUES (@username, @password, @email, @role, @status)
        `);
        const result = stmt.run({
            username: data.username,
            password: data.password || '123456',
            email: data.email || '',
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

    // 增加任务计数
    incrementTaskCount(id) {
        return db.prepare('UPDATE users SET total_tasks = total_tasks + 1 WHERE id = ?').run(id);
    },

    // 增加文件计数
    incrementFileCount(id) {
        return db.prepare('UPDATE users SET total_files = total_files + 1 WHERE id = ?').run(id);
    },

    // 验证登录
    authenticate(username, password) {
        const user = db.prepare('SELECT * FROM users WHERE username = ? AND password = ?').get(username, password);
        if (user) {
            this.updateLoginTime(user.id);
        }
        return user;
    },

    // 获取统计数据
    getStats() {
        const total = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
        const active = db.prepare("SELECT COUNT(*) as count FROM users WHERE status = 'active'").get().count;
        const admins = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get().count;
        return { total, active, admins };
    }
};

// ============================================
// 任务操作
// ============================================

const TaskDB = {
    // 获取所有任务
    getAll(limit = 100) {
        return db.prepare(`
            SELECT t.*, u.username 
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
            SELECT t.*, u.username 
            FROM tasks t 
            LEFT JOIN users u ON t.user_id = u.id 
            ORDER BY t.created_at DESC 
            LIMIT ?
        `).all(limit);
    }
};

// ============================================
// 文件操作
// ============================================

const FileDB = {
    // 创建文件记录
    create(data) {
        const stmt = db.prepare(`
            INSERT INTO files (user_id, task_id, original_name, stored_name, file_path, file_size, file_type, mime_type)
            VALUES (@user_id, @task_id, @original_name, @stored_name, @file_path, @file_size, @file_type, @mime_type)
        `);
        const result = stmt.run({
            user_id: data.user_id || null,
            task_id: data.task_id || null,
            original_name: data.original_name,
            stored_name: data.stored_name,
            file_path: data.file_path,
            file_size: data.file_size || 0,
            file_type: data.file_type || 'unknown',
            mime_type: data.mime_type || 'application/octet-stream'
        });
        return result.lastInsertRowid;
    },

    // 获取所有文件
    getAll(limit = 100) {
        return db.prepare(`
            SELECT f.*, u.username 
            FROM files f 
            LEFT JOIN users u ON f.user_id = u.id 
            ORDER BY f.created_at DESC 
            LIMIT ?
        `).all(limit);
    },

    // 根据用户获取文件
    getByUserId(userId, limit = 50) {
        return db.prepare('SELECT * FROM files WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
            .all(userId, limit);
    },

    // 获取统计
    getStats() {
        const total = db.prepare('SELECT COUNT(*) as count FROM files').get().count;
        const totalSize = db.prepare('SELECT SUM(file_size) as size FROM files').get().size || 0;
        
        const byType = db.prepare(`
            SELECT file_type, COUNT(*) as count 
            FROM files 
            GROUP BY file_type
        `).all();

        return { total, totalSize, byType };
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
        files: FileDB.getStats(),
        recentTasks: TaskDB.getRecent(5),
        recentLogs: LogDB.getRecent(10)
    };
}

// 初始化数据库
initDatabase();

module.exports = {
    db,
    UserDB,
    TaskDB,
    FileDB,
    LogDB,
    getDashboardStats,
    initDatabase
};