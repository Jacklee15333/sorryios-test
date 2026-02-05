/**
 * 任务状态路由 v2.0 - 修复版
 * 
 * 【v2.0 重大修复】
 * - 添加：所有接口强制用户认证
 * - 添加：任务归属权限验证
 * - 修复：用户只能查看/操作自己的任务
 * - 改进：详细的调试日志
 * 
 * 之前的问题：
 * - ❌ 没有认证，任何人都能访问
 * - ❌ 没有权限验证，可以操作他人任务
 * - ❌ 返回所有任务，泄露用户隐私
 * 
 * 修复后：
 * - ✅ 所有接口需要登录
 * - ✅ 只能查看自己的任务
 * - ✅ 只能操作自己的任务
 */

const express = require('express');
const taskQueue = require('../services/taskQueue');
const { authMiddleware } = require('./auth');  // ⭐ 导入认证中间件

const router = express.Router();

/**
 * 验证任务归属权限
 * @param {Object} task - 任务对象
 * @param {Number} userId - 当前用户ID
 * @returns {Boolean} - 是否有权限
 */
function checkTaskOwnership(task, userId) {
    // 检查任务是否属于当前用户
    const isOwner = task.userId === userId;
    
    console.log('[Task] 🔐 权限验证:');
    console.log(`[Task]    - 任务ID: ${task.id.substring(0, 8)}...`);
    console.log(`[Task]    - 任务所属用户: ${task.userId || '未知'}`);
    console.log(`[Task]    - 当前用户: ${userId}`);
    console.log(`[Task]    - 验证结果: ${isOwner ? '✅ 通过' : '❌ 拒绝'}`);
    
    return isOwner;
}

/**
 * GET /api/task
 * 获取当前用户的任务列表
 * 
 * ⭐ v2.0 修复：添加认证，只返回当前用户的任务
 */
router.get('/task', authMiddleware, (req, res) => {
    console.log('\n' + '='.repeat(60));
    console.log('[Task] 📋 获取任务列表请求');
    console.log('='.repeat(60));
    
    const userId = req.user.id;
    const username = req.user.username;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    
    console.log(`[Task] 👤 用户: ${username} (ID: ${userId})`);
    console.log(`[Task] 📄 分页: 第 ${page} 页, 每页 ${limit} 条`);
    
    try {
        // ⭐ v2.0 关键修复：只查询当前用户的任务
        console.log(`[Task] 🔍 查询用户 ${userId} 的任务...`);
        const result = taskQueue.getTasksByUserId(userId, page, limit);
        
        console.log(`[Task] ✅ 查询成功:`);
        console.log(`[Task]    - 总任务数: ${result.total}`);
        console.log(`[Task]    - 当前页任务数: ${result.tasks.length}`);
        console.log(`[Task]    - 总页数: ${result.totalPages}`);
        
        if (result.tasks.length > 0) {
            console.log(`[Task] 📝 任务列表:`);
            result.tasks.forEach((task, index) => {
                console.log(`[Task]    ${index + 1}. ${task.id.substring(0, 8)}... - ${task.customTitle || task.file.originalName} (${task.status})`);
            });
        } else {
            console.log(`[Task] ℹ️  用户暂无任务`);
        }
        
        console.log('='.repeat(60));
        console.log('[Task] ✅ 获取任务列表完成');
        console.log('='.repeat(60) + '\n');
        
        res.json({
            success: true,
            ...result
        });
        
    } catch (error) {
        console.log('='.repeat(60));
        console.log('[Task] ❌ 获取任务列表失败');
        console.log('='.repeat(60));
        console.error('[Task] 错误:', error.message);
        console.error('[Task] 堆栈:', error.stack);
        console.log('='.repeat(60) + '\n');
        
        res.status(500).json({
            error: '获取任务列表失败',
            message: error.message
        });
    }
});

/**
 * GET /api/task/:id
 * 获取单个任务详情
 * 
 * ⭐ v2.0 修复：添加认证和权限验证
 */
router.get('/task/:id', authMiddleware, (req, res) => {
    console.log('\n' + '='.repeat(60));
    console.log('[Task] 🔍 获取任务详情请求');
    console.log('='.repeat(60));
    
    const { id } = req.params;
    const userId = req.user.id;
    const username = req.user.username;
    
    console.log(`[Task] 👤 用户: ${username} (ID: ${userId})`);
    console.log(`[Task] 🆔 任务ID: ${id}`);
    
    try {
        // 步骤1: 查询任务
        console.log(`[Task] 🔍 查询任务...`);
        const task = taskQueue.getTask(id);
        
        if (!task) {
            console.log(`[Task] ❌ 任务不存在: ${id}`);
            console.log('='.repeat(60) + '\n');
            return res.status(404).json({
                error: '任务不存在',
                message: `找不到任务: ${id}`
            });
        }
        
        console.log(`[Task] ✅ 任务存在: ${task.customTitle || task.file.originalName}`);
        
        // ⭐ 步骤2: 验证任务归属
        if (!checkTaskOwnership(task, userId)) {
            console.log(`[Task] 🚫 权限拒绝: 任务 ${id} 不属于用户 ${userId}`);
            console.log('='.repeat(60) + '\n');
            return res.status(403).json({
                error: '无权访问此任务',
                message: '您只能查看自己的任务'
            });
        }
        
        console.log(`[Task] ✅ 权限验证通过`);
        console.log(`[Task] 📊 任务详情:`);
        console.log(`[Task]    - 标题: ${task.customTitle || task.file.originalName}`);
        console.log(`[Task]    - 状态: ${task.status}`);
        console.log(`[Task]    - 进度: ${task.progress}%`);
        console.log(`[Task]    - 创建时间: ${task.createdAt}`);
        
        console.log('='.repeat(60));
        console.log('[Task] ✅ 获取任务详情完成');
        console.log('='.repeat(60) + '\n');
        
        res.json({
            success: true,
            task: task
        });
        
    } catch (error) {
        console.log('='.repeat(60));
        console.log('[Task] ❌ 获取任务详情失败');
        console.log('='.repeat(60));
        console.error('[Task] 错误:', error.message);
        console.error('[Task] 堆栈:', error.stack);
        console.log('='.repeat(60) + '\n');
        
        res.status(500).json({
            error: '获取任务详情失败',
            message: error.message
        });
    }
});

/**
 * POST /api/task/:id/cancel
 * 取消任务
 * 
 * ⭐ v2.0 修复：添加认证和权限验证
 */
router.post('/task/:id/cancel', authMiddleware, (req, res) => {
    console.log('\n' + '='.repeat(60));
    console.log('[Task] 🛑 取消任务请求');
    console.log('='.repeat(60));
    
    const { id } = req.params;
    const userId = req.user.id;
    const username = req.user.username;
    
    console.log(`[Task] 👤 用户: ${username} (ID: ${userId})`);
    console.log(`[Task] 🆔 任务ID: ${id}`);
    
    try {
        // 步骤1: 查询任务
        const task = taskQueue.getTask(id);
        
        if (!task) {
            console.log(`[Task] ❌ 任务不存在: ${id}`);
            console.log('='.repeat(60) + '\n');
            return res.status(404).json({
                error: '任务不存在',
                message: `找不到任务: ${id}`
            });
        }
        
        // ⭐ 步骤2: 验证任务归属
        if (!checkTaskOwnership(task, userId)) {
            console.log(`[Task] 🚫 权限拒绝: 无法取消他人的任务`);
            console.log('='.repeat(60) + '\n');
            return res.status(403).json({
                error: '无权取消此任务',
                message: '您只能取消自己的任务'
            });
        }
        
        // 步骤3: 检查任务状态
        console.log(`[Task] 📊 当前任务状态: ${task.status}`);
        
        if (!['pending', 'processing'].includes(task.status)) {
            console.log(`[Task] ❌ 无法取消: 任务状态为 ${task.status}`);
            console.log('='.repeat(60) + '\n');
            return res.status(400).json({
                error: '无法取消',
                message: `任务状态为 ${task.status}，无法取消`
            });
        }
        
        // 步骤4: 取消任务
        console.log(`[Task] 🛑 执行取消操作...`);
        const success = taskQueue.cancelTask(id);
        
        if (success) {
            console.log(`[Task] ✅ 任务已取消: ${id}`);
            console.log('='.repeat(60));
            console.log('[Task] ✅ 取消任务完成');
            console.log('='.repeat(60) + '\n');
            
            res.json({
                success: true,
                message: '任务已取消',
                task: taskQueue.getTask(id)
            });
        } else {
            console.log(`[Task] ❌ 取消失败: ${id}`);
            console.log('='.repeat(60) + '\n');
            
            res.status(400).json({
                error: '取消失败',
                message: '无法取消该任务'
            });
        }
        
    } catch (error) {
        console.log('='.repeat(60));
        console.log('[Task] ❌ 取消任务失败');
        console.log('='.repeat(60));
        console.error('[Task] 错误:', error.message);
        console.error('[Task] 堆栈:', error.stack);
        console.log('='.repeat(60) + '\n');
        
        res.status(500).json({
            error: '取消任务失败',
            message: error.message
        });
    }
});

/**
 * DELETE /api/task/:id
 * 删除任务记录
 * 
 * ⭐ v2.0 修复：添加认证和权限验证
 */
router.delete('/task/:id', authMiddleware, (req, res) => {
    console.log('\n' + '='.repeat(60));
    console.log('[Task] 🗑️  删除任务请求');
    console.log('='.repeat(60));
    
    const { id } = req.params;
    const userId = req.user.id;
    const username = req.user.username;
    
    console.log(`[Task] 👤 用户: ${username} (ID: ${userId})`);
    console.log(`[Task] 🆔 任务ID: ${id}`);
    
    try {
        // 步骤1: 查询任务
        const task = taskQueue.getTask(id);
        
        if (!task) {
            console.log(`[Task] ❌ 任务不存在: ${id}`);
            console.log('='.repeat(60) + '\n');
            return res.status(404).json({
                error: '任务不存在',
                message: `找不到任务: ${id}`
            });
        }
        
        console.log(`[Task] ✅ 任务存在: ${task.customTitle || task.file.originalName}`);
        
        // ⭐ 步骤2: 验证任务归属
        if (!checkTaskOwnership(task, userId)) {
            console.log(`[Task] 🚫 权限拒绝: 无法删除他人的任务`);
            console.log('='.repeat(60) + '\n');
            return res.status(403).json({
                error: '无权删除此任务',
                message: '您只能删除自己的任务'
            });
        }
        
        // 步骤3: 检查任务状态
        console.log(`[Task] 📊 当前任务状态: ${task.status}`);
        
        if (!['completed', 'failed', 'cancelled'].includes(task.status)) {
            console.log(`[Task] ❌ 无法删除: 任务正在进行中`);
            console.log('='.repeat(60) + '\n');
            return res.status(400).json({
                error: '无法删除',
                message: `任务状态为 ${task.status}，请先取消任务`
            });
        }
        
        // 步骤4: 删除任务
        console.log(`[Task] 🗑️  执行删除操作...`);
        const success = taskQueue.deleteTask(id);
        
        if (success) {
            console.log(`[Task] ✅ 任务已删除: ${id}`);
            console.log('='.repeat(60));
            console.log('[Task] ✅ 删除任务完成');
            console.log('='.repeat(60) + '\n');
            
            res.json({
                success: true,
                message: '任务已删除'
            });
        } else {
            console.log(`[Task] ❌ 删除失败: ${id}`);
            console.log('='.repeat(60) + '\n');
            
            res.status(400).json({
                error: '删除失败',
                message: '无法删除该任务'
            });
        }
        
    } catch (error) {
        console.log('='.repeat(60));
        console.log('[Task] ❌ 删除任务失败');
        console.log('='.repeat(60));
        console.error('[Task] 错误:', error.message);
        console.error('[Task] 堆栈:', error.stack);
        console.log('='.repeat(60) + '\n');
        
        res.status(500).json({
            error: '删除任务失败',
            message: error.message
        });
    }
});

module.exports = router;