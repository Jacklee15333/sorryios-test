/**
 * AI 自动处理 API 路由 v2.1
 * 
 * 功能：
 * 1. 接收文本/文件，全自动处理
 * 2. 提示词自动填充，用户无需手动输入
 * 3. 获取处理进度和结果
 * 
 * 【v2.1 更新】修复依赖引用，使用 aiProcessor
 * 
 * @author Sorryios AI Team
 * @version 2.1.0
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// 导入处理器模块
const { 
  JsonExtractor, 
  ResultMerger,
  CONFIG
} = require('../services/aiProcessor');

// 文件上传配置
const upload = multer({
  dest: path.join(__dirname, '../uploads/temp'),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// 存储任务状态
const taskStore = new Map();

// ============================================
// 模板管理（简化版）
// ============================================

const TEMPLATES = {
  classroom: {
    name: '英语课堂分析',
    description: '分析英语课堂录音，提取词汇和语法',
    prompt: CONFIG.systemPrompt
  }
};

/**
 * 获取可用模板
 */
function getTemplates() {
  return Object.entries(TEMPLATES).map(([key, value]) => ({
    id: key,
    name: value.name,
    description: value.description
  }));
}

/**
 * 构建提示词
 */
function buildPrompt(text, templateName = 'classroom') {
  const template = TEMPLATES[templateName] || TEMPLATES.classroom;
  return `${template.prompt}\n${text}\n---`;
}

// ============================================
// API 接口
// ============================================

/**
 * GET /api/ai/templates
 * 获取可用的提示词模板列表
 */
router.get('/templates', (req, res) => {
  try {
    const templates = getTemplates();
    res.json({
      success: true,
      data: templates
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * POST /api/ai/process
 * 提交文本进行自动AI处理
 * 
 * Body: {
 *   text: "文本内容",
 *   template: "classroom",    // 可选，默认 classroom
 *   chunk_size: 6000,         // 可选
 *   user_id: "user123"        // 可选
 * }
 * 
 * 注意：此API仅用于独立测试，主要处理流程请使用文件上传接口
 */
router.post('/process', async (req, res) => {
  try {
    const { text, template, chunk_size, user_id, task_name } = req.body;

    if (!text) {
      return res.status(400).json({
        success: false,
        error: '请提供文本内容'
      });
    }

    // 生成任务ID
    const taskId = `ai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // 初始化任务状态
    taskStore.set(taskId, {
      taskId,
      taskName: task_name || taskId,
      status: 'pending',
      progress: 0,
      step: 0,
      message: '任务已创建，请使用主上传接口处理',
      createdAt: new Date().toISOString(),
      textLength: text.length,
      template: template || 'classroom',
      chunkSize: chunk_size || 6000,
      userId: user_id,
      result: null,
      error: null,
      note: '此API仅用于测试，完整处理请使用 /api/upload 接口'
    });

    // 返回任务ID和提示
    res.json({
      success: true,
      data: {
        taskId,
        message: '任务已记录。完整的AI处理请通过主页面上传文件',
        status: 'pending',
        template: template || 'classroom',
        hint: '推荐使用 /api/upload 接口上传文件进行完整处理'
      }
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * POST /api/ai/process-file
 * 上传文件并自动处理
 * 
 * 注意：此接口仅保存文件信息，实际处理请使用主上传流程
 */
router.post('/process-file', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: '请上传文件'
      });
    }

    const { template, chunk_size, user_id } = req.body;
    const filePath = req.file.path;
    const originalName = req.file.originalname;

    // 读取文件内容
    let text = '';
    const ext = path.extname(originalName).toLowerCase();

    if (ext === '.txt') {
      text = fs.readFileSync(filePath, 'utf-8');
    } else if (ext === '.json') {
      const json = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      text = json.text || json.content || JSON.stringify(json);
    } else {
      fs.unlinkSync(filePath);
      return res.status(400).json({
        success: false,
        error: `暂不支持 ${ext} 文件类型，请使用 .txt 文件`
      });
    }

    // 清理临时文件
    fs.unlinkSync(filePath);

    if (!text.trim()) {
      return res.status(400).json({
        success: false,
        error: '文件内容为空'
      });
    }

    // 生成任务ID
    const taskId = `ai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // 初始化任务状态
    taskStore.set(taskId, {
      taskId,
      taskName: originalName,
      status: 'pending',
      progress: 0,
      step: 0,
      message: '文件已接收，请使用主上传接口处理',
      createdAt: new Date().toISOString(),
      textLength: text.length,
      originalFile: originalName,
      template: template || 'classroom',
      chunkSize: parseInt(chunk_size) || 6000,
      userId: user_id,
      result: null,
      error: null
    });

    // 返回
    res.json({
      success: true,
      data: {
        taskId,
        message: '文件已接收。完整处理请使用主页面上传',
        status: 'pending',
        originalFile: originalName,
        textLength: text.length,
        hint: '推荐使用前端页面上传文件进行完整AI处理'
      }
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * GET /api/ai/status/:taskId
 * 获取任务状态
 */
router.get('/status/:taskId', (req, res) => {
  try {
    const { taskId } = req.params;
    const task = taskStore.get(taskId);

    if (!task) {
      return res.status(404).json({
        success: false,
        error: '任务不存在'
      });
    }

    res.json({
      success: true,
      data: {
        taskId: task.taskId,
        taskName: task.taskName,
        status: task.status,
        progress: task.progress,
        step: task.step,
        message: task.message,
        currentChunk: task.currentChunk,
        totalChunks: task.totalChunks,
        textLength: task.textLength,
        template: task.template,
        createdAt: task.createdAt,
        completedAt: task.completedAt,
        error: task.error
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * GET /api/ai/result/:taskId
 * 获取处理结果
 */
router.get('/result/:taskId', (req, res) => {
  try {
    const { taskId } = req.params;
    
    // 先从内存获取
    const task = taskStore.get(taskId);
    if (task && task.result) {
      return res.json({
        success: true,
        data: task.result
      });
    }

    // 从文件获取
    const resultsDir = path.join(__dirname, '../data/results');
    const resultPath = path.join(resultsDir, `${taskId}_final.json`);
    
    if (fs.existsSync(resultPath)) {
      const result = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
      return res.json({
        success: true,
        data: result
      });
    }

    res.status(404).json({
      success: false,
      error: '结果不存在，请使用主上传接口处理文件'
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * GET /api/ai/tasks
 * 获取所有任务列表
 */
router.get('/tasks', (req, res) => {
  try {
    const tasks = Array.from(taskStore.values())
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map(task => ({
        taskId: task.taskId,
        taskName: task.taskName,
        status: task.status,
        progress: task.progress,
        textLength: task.textLength,
        template: task.template,
        originalFile: task.originalFile,
        createdAt: task.createdAt,
        completedAt: task.completedAt
      }));

    res.json({
      success: true,
      data: {
        tasks,
        total: tasks.length
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * DELETE /api/ai/tasks/:taskId
 * 删除任务
 */
router.delete('/tasks/:taskId', (req, res) => {
  try {
    const { taskId } = req.params;
    
    taskStore.delete(taskId);
    
    // 删除结果文件
    const resultsDir = path.join(__dirname, '../data/results');
    const files = [
      `${taskId}_final.json`,
    ];

    files.forEach(file => {
      const filePath = path.join(resultsDir, file);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });

    res.json({
      success: true,
      message: '任务已删除'
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * POST /api/ai/parse-json
 * 手动解析JSON（用于调试）
 */
router.post('/parse-json', (req, res) => {
  try {
    const { response } = req.body;

    if (!response) {
      return res.status(400).json({
        success: false,
        error: '请提供AI响应文本'
      });
    }

    const parsed = JsonExtractor.extract(response);
    
    if (!parsed) {
      return res.status(400).json({
        success: false,
        error: 'JSON解析失败'
      });
    }

    res.json({
      success: true,
      data: parsed
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * POST /api/ai/merge
 * 手动合并多个结果
 */
router.post('/merge', (req, res) => {
  try {
    const { results } = req.body;

    if (!results || !Array.isArray(results)) {
      return res.status(400).json({
        success: false,
        error: '请提供结果数组'
      });
    }

    const merged = ResultMerger.merge(results);

    res.json({
      success: true,
      data: merged
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * POST /api/ai/preview-prompt
 * 预览生成的提示词（调试用）
 */
router.post('/preview-prompt', (req, res) => {
  try {
    const { text, template } = req.body;

    if (!text) {
      return res.status(400).json({
        success: false,
        error: '请提供文本'
      });
    }

    const fullPrompt = buildPrompt(text, template || 'classroom');

    res.json({
      success: true,
      data: {
        template: template || 'classroom',
        promptLength: fullPrompt.length,
        prompt: fullPrompt
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

module.exports = router;