/**
 * 任务状态路由
 * GET /api/task/:id - 获取单个任务
 * GET /api/task - 获取任务列表
 * DELETE /api/task/:id - 取消/删除任务
 */

const express = require('express');
const taskQueue = require('../services/taskQueue');

const router = express.Router();

/**
 * GET /api/task
 * 获取任务列表
 */
router.get('/', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    
    const result = taskQueue.getAllTasks(page, limit);
    
    res.json({
        success: true,
        ...result
    });
});

/**
 * GET /api/task/:id
 * 获取单个任务详情
 */
router.get('/:id', (req, res) => {
    const { id } = req.params;
    const task = taskQueue.getTask(id);
    
    if (!task) {
        return res.status(404).json({
            error: '任务不存在',
            message: `找不到任务: ${id}`
        });
    }
    
    res.json({
        success: true,
        task: task
    });
});

/**
 * POST /api/task/:id/cancel
 * 取消任务
 */
router.post('/:id/cancel', (req, res) => {
    const { id } = req.params;
    const task = taskQueue.getTask(id);
    
    if (!task) {
        return res.status(404).json({
            error: '任务不存在',
            message: `找不到任务: ${id}`
        });
    }
    
    if (!['pending', 'processing'].includes(task.status)) {
        return res.status(400).json({
            error: '无法取消',
            message: `任务状态为 ${task.status}，无法取消`
        });
    }
    
    const success = taskQueue.cancelTask(id);
    
    if (success) {
        res.json({
            success: true,
            message: '任务已取消',
            task: taskQueue.getTask(id)
        });
    } else {
        res.status(400).json({
            error: '取消失败',
            message: '无法取消该任务'
        });
    }
});

/**
 * DELETE /api/task/:id
 * 删除任务记录
 */
router.delete('/:id', (req, res) => {
    const { id } = req.params;
    const task = taskQueue.getTask(id);
    
    if (!task) {
        return res.status(404).json({
            error: '任务不存在',
            message: `找不到任务: ${id}`
        });
    }
    
    if (!['completed', 'failed', 'cancelled'].includes(task.status)) {
        return res.status(400).json({
            error: '无法删除',
            message: `任务状态为 ${task.status}，请先取消任务`
        });
    }
    
    const success = taskQueue.deleteTask(id);
    
    if (success) {
        res.json({
            success: true,
            message: '任务已删除'
        });
    } else {
        res.status(400).json({
            error: '删除失败',
            message: '无法删除该任务'
        });
    }
});

module.exports = router;
