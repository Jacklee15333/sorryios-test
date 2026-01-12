/**
 * 报告路由
 * GET /api/report/:id - 获取报告信息
 * GET /api/report/:id/download - 下载报告文件
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const taskQueue = require('../services/taskQueue');

const router = express.Router();

const OUTPUTS_DIR = path.join(__dirname, '../outputs');

/**
 * GET /api/report/:id
 * 获取报告信息（包含预览URL）
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
    
    if (task.status !== 'completed') {
        return res.status(400).json({
            error: '报告未就绪',
            message: `任务状态: ${task.status}`,
            task: {
                id: task.id,
                status: task.status,
                progress: task.progress
            }
        });
    }
    
    if (!task.result) {
        return res.status(404).json({
            error: '报告不存在',
            message: '任务已完成但未找到报告数据'
        });
    }
    
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    
    res.json({
        success: true,
        report: {
            taskId: id,
            outputDir: task.result.outputDir,
            stats: task.result.stats,
            files: {
                html: {
                    name: 'report.html',
                    preview: `${baseUrl}/outputs/${task.result.files.html}`,
                    download: `${baseUrl}/api/report/${id}/download?format=html`
                },
                markdown: {
                    name: 'report.md',
                    preview: `${baseUrl}/outputs/${task.result.files.markdown}`,
                    download: `${baseUrl}/api/report/${id}/download?format=md`
                },
                json: {
                    name: 'result.json',
                    preview: `${baseUrl}/outputs/${task.result.files.json}`,
                    download: `${baseUrl}/api/report/${id}/download?format=json`
                }
            }
        },
        createdAt: task.createdAt,
        completedAt: task.completedAt
    });
});

/**
 * GET /api/report/:id/download
 * 下载报告文件
 * Query params: format = html | md | json
 */
router.get('/:id/download', (req, res) => {
    const { id } = req.params;
    const format = req.query.format || 'html';
    
    const task = taskQueue.getTask(id);
    
    if (!task) {
        return res.status(404).json({
            error: '任务不存在'
        });
    }
    
    if (task.status !== 'completed' || !task.result) {
        return res.status(400).json({
            error: '报告未就绪'
        });
    }
    
    // 确定文件路径和类型
    let filePath, contentType, fileName;
    
    switch (format.toLowerCase()) {
        case 'html':
            filePath = path.join(OUTPUTS_DIR, task.result.files.html);
            contentType = 'text/html; charset=utf-8';
            fileName = 'report.html';
            break;
        case 'md':
        case 'markdown':
            filePath = path.join(OUTPUTS_DIR, task.result.files.markdown);
            contentType = 'text/markdown; charset=utf-8';
            fileName = 'report.md';
            break;
        case 'json':
            filePath = path.join(OUTPUTS_DIR, task.result.files.json);
            contentType = 'application/json; charset=utf-8';
            fileName = 'result.json';
            break;
        default:
            return res.status(400).json({
                error: '不支持的格式',
                message: `支持的格式: html, md, json`
            });
    }
    
    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({
            error: '文件不存在',
            message: `找不到文件: ${fileName}`
        });
    }
    
    // 获取原始文件名作为下载名
    const originalName = task.file.originalName.replace(/\.[^/.]+$/, '');
    const downloadName = `${originalName}_${fileName}`;
    
    // 设置响应头
    res.setHeader('Content-Type', contentType);
    
    // 🔧 修复中文文件名乱码
    // ASCII fallback: 用任务ID确保有意义的文件名
    const asciiName = `report_${id.slice(0, 8)}_${fileName}`;
    // UTF-8 编码: 额外转义可能导致问题的字符
    const encodedName = encodeURIComponent(downloadName)
        .replace(/['()]/g, escape)
        .replace(/\*/g, '%2A');
    
    res.setHeader('Content-Disposition', 
        `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`);
    // 发送文件
    res.sendFile(filePath);
});

/**
 * GET /api/report/:id/content
 * 直接获取报告内容（用于前端预览）
 */
router.get('/:id/content', (req, res) => {
    const { id } = req.params;
    const format = req.query.format || 'html';
    
    const task = taskQueue.getTask(id);
    
    if (!task || task.status !== 'completed' || !task.result) {
        return res.status(404).json({
            error: '报告不存在或未就绪'
        });
    }
    
    let filePath;
    
    switch (format.toLowerCase()) {
        case 'html':
            filePath = path.join(OUTPUTS_DIR, task.result.files.html);
            break;
        case 'md':
            filePath = path.join(OUTPUTS_DIR, task.result.files.markdown);
            break;
        case 'json':
            filePath = path.join(OUTPUTS_DIR, task.result.files.json);
            break;
        default:
            return res.status(400).json({ error: '不支持的格式' });
    }
    
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