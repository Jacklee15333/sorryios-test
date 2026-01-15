/**
 * 报告路由
 * GET /api/report/:id - 获取报告信息
 * GET /api/report/:id/download - 下载报告文件
 * 
 * v2.3: 返回用户信息和正确的报告标题
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const taskQueue = require('../services/taskQueue');
const { TaskDB, db } = require('../services/database');

const router = express.Router();

const OUTPUTS_DIR = path.join(__dirname, '../outputs');

/**
 * 根据 taskId 查找输出目录
 * 目录格式: task_{taskId前8位}_{timestamp}
 */
function findOutputDir(taskId) {
    const prefix = `task_${taskId.substring(0, 8)}`;
    
    try {
        const dirs = fs.readdirSync(OUTPUTS_DIR);
        const matchedDir = dirs.find(d => d.startsWith(prefix));
        
        if (matchedDir) {
            return matchedDir;
        }
    } catch (e) {
        console.error('[Report] 查找输出目录失败:', e.message);
    }
    
    return null;
}

/**
 * 获取用户信息
 */
function getUserInfo(userId) {
    if (!userId) return null;
    
    try {
        const user = db.prepare(`
            SELECT id, username, nickname FROM users WHERE id = ?
        `).get(userId);
        
        return user || null;
    } catch (e) {
        console.error('[Report] 获取用户信息失败:', e.message);
        return null;
    }
}

/**
 * 构建报告信息
 */
function buildReportInfo(taskId, outputDirName, baseUrl, taskInfo = {}) {
    const outputDir = path.join(OUTPUTS_DIR, outputDirName);
    
    // 检查文件是否存在
    const htmlPath = path.join(outputDir, 'report.html');
    const mdPath = path.join(outputDir, 'report.md');
    const jsonPath = path.join(outputDir, 'report.json');
    
    // 读取 JSON 获取统计信息
    let stats = { totalSegments: 0, successCount: 0, failCount: 0 };
    if (fs.existsSync(jsonPath)) {
        try {
            const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
            stats = {
                totalCharacters: jsonData.metadata?.totalCharacters || 0,
                totalSegments: jsonData.metadata?.totalSegments || 1,
                successCount: jsonData.metadata?.successCount || 1,
                failCount: jsonData.metadata?.failCount || 0
            };
        } catch (e) {
            console.error('[Report] 解析 JSON 失败:', e.message);
        }
    }
    
    return {
        taskId,
        outputDir: outputDirName,
        // 🆕 添加报告标题（用户输入的标题）
        title: taskInfo.title || taskInfo.customTitle || '课堂笔记',
        stats,
        files: {
            html: {
                name: 'report.html',
                exists: fs.existsSync(htmlPath),
                preview: `${baseUrl}/outputs/${outputDirName}/report.html`,
                download: `${baseUrl}/api/report/${taskId}/download?format=html`
            },
            markdown: {
                name: 'report.md',
                exists: fs.existsSync(mdPath),
                preview: `${baseUrl}/outputs/${outputDirName}/report.md`,
                download: `${baseUrl}/api/report/${taskId}/download?format=md`
            },
            json: {
                name: 'report.json',
                exists: fs.existsSync(jsonPath),
                preview: `${baseUrl}/outputs/${outputDirName}/report.json`,
                download: `${baseUrl}/api/report/${taskId}/download?format=json`
            }
        }
    };
}

/**
 * GET /api/report/:id
 * 获取报告信息（包含预览URL）
 */
router.get('/report/:id', (req, res) => {
    const { id } = req.params;
    
    // 1. 先尝试从内存获取
    let task = taskQueue.getTask(id);
    let userId = null;
    let customTitle = null;
    
    // 2. 如果内存没有，从数据库获取
    if (!task) {
        try {
            const dbTask = TaskDB.getById(id);
            if (dbTask) {
                task = {
                    id: dbTask.id,
                    status: dbTask.status,
                    progress: dbTask.progress || 0,
                    createdAt: dbTask.created_at,
                    completedAt: dbTask.completed_at,
                    file: { originalName: dbTask.file_name }
                };
                userId = dbTask.user_id;
                customTitle = dbTask.custom_title || dbTask.title;
            }
        } catch (e) {
            console.error('[Report] 从数据库获取任务失败:', e.message);
        }
    } else {
        // 从内存任务获取用户ID和标题
        userId = task.userId;
        customTitle = task.customTitle || task.title;
    }
    
    if (!task) {
        return res.status(404).json({
            success: false,
            error: '任务不存在',
            message: `找不到任务: ${id}`
        });
    }
    
    if (task.status !== 'completed') {
        return res.status(400).json({
            success: false,
            error: '报告未就绪',
            message: `任务状态: ${task.status}`,
            task: {
                id: task.id,
                status: task.status,
                progress: task.progress
            }
        });
    }
    
    // 3. 查找输出目录
    const outputDirName = findOutputDir(id);
    
    if (!outputDirName) {
        return res.status(404).json({
            success: false,
            error: '报告不存在',
            message: '任务已完成但未找到报告文件'
        });
    }
    
    // 4. 获取用户信息
    const user = getUserInfo(userId);
    
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const report = buildReportInfo(id, outputDirName, baseUrl, {
        title: customTitle,
        customTitle: customTitle
    });
    
    res.json({
        success: true,
        report,
        // 🆕 返回用户信息
        user: user ? {
            id: user.id,
            username: user.username,
            nickname: user.nickname
        } : null,
        createdAt: task.createdAt,
        completedAt: task.completedAt
    });
});

/**
 * GET /api/report/:id/download
 * 下载报告文件
 * Query params: format = html | md | json
 */
router.get('/report/:id/download', (req, res) => {
    const { id } = req.params;
    const format = req.query.format || 'html';
    
    // 查找输出目录
    const outputDirName = findOutputDir(id);
    
    if (!outputDirName) {
        return res.status(404).json({
            error: '报告不存在'
        });
    }
    
    // 🆕 获取任务标题用于下载文件名
    let downloadName = '课堂笔记';
    try {
        const dbTask = TaskDB.getById(id);
        if (dbTask && (dbTask.custom_title || dbTask.title)) {
            downloadName = dbTask.custom_title || dbTask.title;
        }
    } catch (e) {
        console.error('[Report] 获取任务标题失败:', e.message);
    }
    
    // 清理文件名中的特殊字符
    const safeFileName = downloadName.replace(/[\\/:*?"<>|]/g, '_');
    
    // 确定文件路径和类型
    let fileName, contentType, ext;
    
    switch (format.toLowerCase()) {
        case 'html':
            fileName = 'report.html';
            contentType = 'text/html; charset=utf-8';
            ext = '.html';
            break;
        case 'md':
        case 'markdown':
            fileName = 'report.md';
            contentType = 'text/markdown; charset=utf-8';
            ext = '.md';
            break;
        case 'json':
            fileName = 'report.json';
            contentType = 'application/json; charset=utf-8';
            ext = '.json';
            break;
        default:
            return res.status(400).json({
                error: '不支持的格式',
                message: `支持的格式: html, md, json`
            });
    }
    
    const filePath = path.join(OUTPUTS_DIR, outputDirName, fileName);
    
    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({
            error: '文件不存在',
            message: `找不到文件: ${fileName}`
        });
    }
    
    // 设置响应头
    res.setHeader('Content-Type', contentType);
    
    // 🆕 使用用户输入的标题作为下载文件名
    // 使用 RFC 5987 编码支持中文文件名
    const encodedFileName = encodeURIComponent(`${safeFileName}${ext}`);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFileName}`);
    
    // 发送文件
    res.sendFile(filePath);
});

/**
 * GET /api/report/:id/content
 * 直接获取报告内容（用于前端预览）
 */
router.get('/report/:id/content', (req, res) => {
    const { id } = req.params;
    const format = req.query.format || 'html';
    
    // 查找输出目录
    const outputDirName = findOutputDir(id);
    
    if (!outputDirName) {
        return res.status(404).json({
            error: '报告不存在'
        });
    }
    
    let fileName;
    
    switch (format.toLowerCase()) {
        case 'html':
            fileName = 'report.html';
            break;
        case 'md':
            fileName = 'report.md';
            break;
        case 'json':
            fileName = 'report.json';
            break;
        default:
            return res.status(400).json({ error: '不支持的格式' });
    }
    
    const filePath = path.join(OUTPUTS_DIR, outputDirName, fileName);
    
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: '文件不存在' });
    }
    
    const content = fs.readFileSync(filePath, 'utf-8');
    
    if (format === 'json') {
        res.json(JSON.parse(content));
    } else {
        res.type(format === 'html' ? 'text/html' : 'text/plain').send(content);
    }
});

module.exports = router;