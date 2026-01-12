/**
 * admin.js - 管理员 API 路由
 * 
 * 提供 Dashboard 数据、用户管理、任务管理等功能
 */

const express = require('express');
const router = express.Router();
const { UserDB, TaskDB, FileDB, LogDB, getDashboardStats } = require('../services/database');

// ============================================
// 简单的管理员认证中间件
// ============================================

function adminAuth(req, res, next) {
    // 从 header 或 query 获取认证信息
    const authHeader = req.headers.authorization;
    const queryToken = req.query.token;
    
    // 简单认证：检查 Basic Auth 或 token
    // 生产环境应该用 JWT 或 session
    if (authHeader) {
        const base64Credentials = authHeader.split(' ')[1];
        const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
        const [username, password] = credentials.split(':');
        
        const user = UserDB.authenticate(username, password);
        if (user && user.role === 'admin') {
            req.admin = user;
            return next();
        }
    }
    
    // 开发模式：允许无认证访问（生产环境请移除）
    if (process.env.NODE_ENV !== 'production') {
        req.admin = { id: 1, username: 'admin', role: 'admin' };
        return next();
    }
    
    res.status(401).json({ error: 'Unauthorized' });
}

// ============================================
// Dashboard 数据
// ============================================

/**
 * GET /api/admin/dashboard
 * 获取 Dashboard 统计数据
 */
router.get('/dashboard', adminAuth, (req, res) => {
    try {
        const stats = getDashboardStats();
        res.json({
            success: true,
            data: stats,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ error: 'Failed to get dashboard data' });
    }
});

// ============================================
// 用户管理
// ============================================

/**
 * GET /api/admin/users
 * 获取所有用户
 */
router.get('/users', adminAuth, (req, res) => {
    try {
        const users = UserDB.getAll();
        res.json({ success: true, data: users });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get users' });
    }
});

/**
 * GET /api/admin/users/:id
 * 获取单个用户
 */
router.get('/users/:id', adminAuth, (req, res) => {
    try {
        const user = UserDB.getById(req.params.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        // 不返回密码
        delete user.password;
        res.json({ success: true, data: user });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get user' });
    }
});

/**
 * POST /api/admin/users
 * 创建新用户
 */
router.post('/users', adminAuth, (req, res) => {
    try {
        const { username, password, email, role } = req.body;
        
        if (!username) {
            return res.status(400).json({ error: 'Username is required' });
        }
        
        // 检查用户名是否已存在
        const existing = UserDB.getByUsername(username);
        if (existing) {
            return res.status(400).json({ error: 'Username already exists' });
        }
        
        const userId = UserDB.create({
            username,
            password: password || '123456',
            email,
            role: role || 'user'
        });
        
        LogDB.add({
            action: 'user_created',
            user_id: req.admin.id,
            message: `Created user: ${username}`,
            details: { new_user_id: userId }
        });
        
        res.json({ success: true, data: { id: userId } });
    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

/**
 * PUT /api/admin/users/:id
 * 更新用户
 */
router.put('/users/:id', adminAuth, (req, res) => {
    try {
        const { email, role, status, password } = req.body;
        const updated = UserDB.update(req.params.id, { email, role, status, password });
        
        if (updated) {
            LogDB.add({
                action: 'user_updated',
                user_id: req.admin.id,
                message: `Updated user ID: ${req.params.id}`
            });
        }
        
        res.json({ success: updated });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update user' });
    }
});

/**
 * DELETE /api/admin/users/:id
 * 删除用户
 */
router.delete('/users/:id', adminAuth, (req, res) => {
    try {
        const deleted = UserDB.delete(req.params.id);
        
        if (deleted) {
            LogDB.add({
                action: 'user_deleted',
                user_id: req.admin.id,
                message: `Deleted user ID: ${req.params.id}`
            });
        }
        
        res.json({ success: deleted });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// ============================================
// 任务管理
// ============================================

/**
 * GET /api/admin/tasks
 * 获取所有任务
 */
router.get('/tasks', adminAuth, (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const tasks = TaskDB.getAll(limit);
        res.json({ success: true, data: tasks });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get tasks' });
    }
});

/**
 * GET /api/admin/tasks/:id
 * 获取单个任务详情
 */
router.get('/tasks/:id', adminAuth, (req, res) => {
    try {
        const task = TaskDB.getById(req.params.id);
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }
        res.json({ success: true, data: task });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get task' });
    }
});

/**
 * DELETE /api/admin/tasks/:id
 * 删除任务
 */
router.delete('/tasks/:id', adminAuth, (req, res) => {
    try {
        const deleted = TaskDB.delete(req.params.id);
        
        if (deleted) {
            LogDB.add({
                action: 'task_deleted',
                user_id: req.admin.id,
                task_id: req.params.id,
                message: `Deleted task: ${req.params.id}`
            });
        }
        
        res.json({ success: deleted });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete task' });
    }
});

// ============================================
// 文件管理
// ============================================

/**
 * GET /api/admin/files
 * 获取所有文件记录
 */
router.get('/files', adminAuth, (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const files = FileDB.getAll(limit);
        res.json({ success: true, data: files });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get files' });
    }
});

// ============================================
// 日志查看
// ============================================

/**
 * GET /api/admin/logs
 * 获取系统日志
 */
router.get('/logs', adminAuth, (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const logs = LogDB.getRecent(limit);
        res.json({ success: true, data: logs });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get logs' });
    }
});

// ============================================
// 管理员登录
// ============================================

/**
 * POST /api/admin/login
 * 管理员登录
 */
router.post('/login', (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }
        
        const user = UserDB.authenticate(username, password);
        
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        if (user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        LogDB.add({
            action: 'admin_login',
            user_id: user.id,
            message: `Admin login: ${username}`,
            ip_address: req.ip
        });
        
        // 返回用户信息（不含密码）
        delete user.password;
        res.json({ 
            success: true, 
            data: user,
            // 简单 token（生产环境应该用 JWT）
            token: Buffer.from(`${username}:${password}`).toString('base64')
        });
    } catch (error) {
        res.status(500).json({ error: 'Login failed' });
    }
});

module.exports = router;
