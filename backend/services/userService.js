/**
 * 用户服务 - 处理用户登录注册
 * 文件位置: backend/services/userService.js
 * 
 * 复用现有的 database.js 模块
 */

const crypto = require('crypto');
const { UserDB, TaskDB, db } = require('./database');

/**
 * 生成 JWT-like token
 */
function generateToken(userId) {
    const payload = {
        userId,
        exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7天过期
        random: crypto.randomBytes(16).toString('hex')
    };
    const base64 = Buffer.from(JSON.stringify(payload)).toString('base64');
    const signature = crypto.createHmac('sha256', 'sorryios-secret-key-2026')
        .update(base64)
        .digest('hex');
    return `${base64}.${signature}`;
}

/**
 * 验证 token
 */
function verifyToken(token) {
    try {
        const [base64, signature] = token.split('.');
        const expectedSig = crypto.createHmac('sha256', 'sorryios-secret-key-2026')
            .update(base64)
            .digest('hex');
        
        if (signature !== expectedSig) {
            return null;
        }

        const payload = JSON.parse(Buffer.from(base64, 'base64').toString());
        
        if (payload.exp < Date.now()) {
            return null; // token 过期
        }

        return payload;
    } catch (e) {
        return null;
    }
}

/**
 * 初始化（兼容接口，实际上 database.js 已经初始化了）
 */
async function initDatabase() {
    // database.js 在 require 时已经初始化了
    console.log('[UserService] 用户服务已就绪');
    return Promise.resolve();
}

/**
 * 用户注册
 */
async function register(username, password, nickname) {
    // 检查用户名是否已存在
    const existing = UserDB.getByUsername(username);
    if (existing) {
        throw new Error('用户名已存在');
    }

    // 创建新用户
    const userId = UserDB.create({
        username: username,
        password: password,  // 使用现有的密码存储方式
        email: '',
        role: 'user',
        status: 'active'
    });

    const user = UserDB.getById(userId);
    const token = generateToken(user.id);

    return {
        user: {
            id: user.id,
            username: user.username,
            nickname: nickname || user.username,
            createdAt: user.created_at
        },
        token
    };
}

/**
 * 用户登录
 */
async function login(username, password) {
    // 使用现有的认证方法
    const user = UserDB.authenticate(username, password);
    
    if (!user) {
        throw new Error('用户名或密码错误');
    }

    const token = generateToken(user.id);

    return {
        user: {
            id: user.id,
            username: user.username,
            nickname: user.username,  // 现有表没有 nickname 字段，用 username
            createdAt: user.created_at,
            role: user.role
        },
        token
    };
}

/**
 * 根据 token 获取用户
 */
async function getUserFromToken(token) {
    const payload = verifyToken(token);
    if (!payload) {
        return null;
    }

    const user = UserDB.getById(payload.userId);
    if (!user) {
        return null;
    }

    return {
        id: user.id,
        username: user.username,
        nickname: user.username,
        createdAt: user.created_at,
        role: user.role
    };
}

/**
 * 获取用户学习统计数据
 */
async function getUserStats(userId) {
    // 使用现有的 TaskDB 获取用户任务
    const userTasks = TaskDB.getByUserId(userId, 100);
    
    const totalTasks = userTasks.length;
    const completedTasks = userTasks.filter(t => t.status === 'completed').length;
    
    // 计算活跃天数
    const uniqueDays = new Set(
        userTasks.map(t => t.created_at ? t.created_at.split(' ')[0] : null).filter(Boolean)
    );
    const activeDays = uniqueDays.size;

    // 最近10个任务
    const recentTasks = userTasks.slice(0, 10).map(t => ({
        id: t.id,
        title: t.title || t.file_name || '未命名任务',
        status: t.status,
        createdAt: t.created_at,
        fileName: t.file_name
    }));

    // 学习词汇总数估算
    const totalWords = completedTasks * 50;

    return {
        totalTasks,
        completedTasks,
        activeDays,
        totalWords,
        recentTasks
    };
}

/**
 * 将任务关联到用户
 */
async function associateTaskWithUser(taskId, userId) {
    db.prepare('UPDATE tasks SET user_id = ? WHERE id = ?').run(userId, taskId);
}

/**
 * 获取所有用户（管理员用）
 */
async function getAllUsers() {
    return UserDB.getAll();
}

module.exports = {
    initDatabase,
    register,
    login,
    getUserFromToken,
    getUserStats,
    associateTaskWithUser,
    verifyToken,
    getAllUsers,
    generateToken
};