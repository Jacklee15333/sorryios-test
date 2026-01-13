/**
 * 认证路由 - 处理用户登录、注册、信息获取
 * 文件位置: backend/routes/auth.js
 */

const express = require('express');
const router = express.Router();
const userService = require('../services/userService');

/**
 * 认证中间件 - 验证 token
 */
async function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: '未登录' });
    }

    const token = authHeader.substring(7);
    
    try {
        const user = await userService.getUserFromToken(token);

        if (!user) {
            return res.status(401).json({ error: 'Token 无效或已过期' });
        }

        req.user = user;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Token 验证失败' });
    }
}

/**
 * POST /api/auth/register - 用户注册
 */
router.post('/register', async (req, res) => {
    try {
        const { username, password, nickname } = req.body;

        // 验证输入
        if (!username || username.length < 3 || username.length > 20) {
            return res.status(400).json({ error: '用户名长度需要 3-20 个字符' });
        }

        if (!password || password.length < 6) {
            return res.status(400).json({ error: '密码至少需要 6 个字符' });
        }

        // 用户名只允许字母、数字、下划线
        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            return res.status(400).json({ error: '用户名只能包含字母、数字和下划线' });
        }

        const result = await userService.register(username, password, nickname);

        console.log(`[Auth] 新用户注册: ${username}`);

        res.json({
            success: true,
            user: result.user,
            token: result.token
        });
    } catch (error) {
        console.error('[Auth] 注册失败:', error.message);
        res.status(400).json({ error: error.message });
    }
});

/**
 * POST /api/auth/login - 用户登录
 */
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: '请输入用户名和密码' });
        }

        const result = await userService.login(username, password);

        console.log(`[Auth] 用户登录: ${username}`);

        res.json({
            success: true,
            user: result.user,
            token: result.token
        });
    } catch (error) {
        console.error('[Auth] 登录失败:', error.message);
        res.status(401).json({ error: error.message });
    }
});

/**
 * GET /api/user/profile - 获取当前用户信息（需要登录）
 */
router.get('/user/profile', authMiddleware, async (req, res) => {
    res.json({
        success: true,
        user: req.user
    });
});

/**
 * GET /api/user/stats - 获取用户学习统计（需要登录）
 */
router.get('/user/stats', authMiddleware, async (req, res) => {
    try {
        const stats = await userService.getUserStats(req.user.id);
        res.json(stats);
    } catch (error) {
        console.error('[Auth] 获取统计失败:', error.message);
        res.status(500).json({ error: '获取统计数据失败' });
    }
});

module.exports = {
    router,
    authMiddleware
};