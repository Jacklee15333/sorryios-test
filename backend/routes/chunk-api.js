/**
 * 分块管理 API 路由
 * 
 * 功能：
 * 1. 获取/更新分块配置
 * 2. 预览分块结果
 * 3. 执行分块并保存
 * 4. 获取已保存的分块文件列表
 * 
 * @author Sorryios AI Team
 * @version 1.0.0
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { SmartTextSplitter, splitAndSaveToFiles } = require('../services/smart-text-splitter');

// 配置文件路径
const CONFIG_PATH = path.join(__dirname, '../config/chunk_config.json');
const CHUNKS_DIR = path.join(__dirname, '../data/chunks');

// 确保目录存在
if (!fs.existsSync(CHUNKS_DIR)) {
  fs.mkdirSync(CHUNKS_DIR, { recursive: true });
}

// 加载配置
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch (err) {
    console.error('[ChunkAPI] 加载配置失败:', err.message);
  }
  
  // 返回默认配置
  return {
    chunk_settings: {
      default_chunk_size: 6000,
      min_chunk_size: 2000,
      max_chunk_size: 10000,
      overlap_size: 200,
    },
    output_settings: {
      save_chunks: true,
      chunks_dir: CHUNKS_DIR,
    },
  };
}

// 保存配置
function saveConfig(config) {
  const configDir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * GET /api/chunk/config
 * 获取当前分块配置
 */
router.get('/config', (req, res) => {
  try {
    const config = loadConfig();
    res.json({
      success: true,
      data: config,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * PUT /api/chunk/config
 * 更新分块配置
 * 
 * Body: {
 *   chunk_size: 6000,
 *   min_chunk_size: 2000,
 *   max_chunk_size: 10000,
 *   save_chunks: true
 * }
 */
router.put('/config', (req, res) => {
  try {
    const config = loadConfig();
    const { chunk_size, min_chunk_size, max_chunk_size, save_chunks } = req.body;

    // 验证参数
    if (chunk_size !== undefined) {
      if (chunk_size < 1000 || chunk_size > 20000) {
        return res.status(400).json({
          success: false,
          error: '分块大小必须在 1000-20000 之间',
        });
      }
      config.chunk_settings.default_chunk_size = chunk_size;
    }

    if (min_chunk_size !== undefined) {
      config.chunk_settings.min_chunk_size = min_chunk_size;
    }

    if (max_chunk_size !== undefined) {
      config.chunk_settings.max_chunk_size = max_chunk_size;
    }

    if (save_chunks !== undefined) {
      config.output_settings.save_chunks = save_chunks;
    }

    saveConfig(config);

    res.json({
      success: true,
      message: '配置已更新',
      data: config,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * POST /api/chunk/preview
 * 预览分块结果（不实际切分）
 * 
 * Body: {
 *   text: "文本内容",
 *   chunk_size: 6000  // 可选，覆盖默认配置
 * }
 */
router.post('/preview', (req, res) => {
  try {
    const { text, chunk_size } = req.body;

    if (!text) {
      return res.status(400).json({
        success: false,
        error: '请提供文本内容',
      });
    }

    const config = loadConfig();
    const chunkSize = chunk_size || config.chunk_settings.default_chunk_size;

    const splitter = new SmartTextSplitter({
      chunkSize,
      minChunkSize: config.chunk_settings.min_chunk_size,
      searchRange: 500,
    });

    const preview = splitter.preview(text);

    res.json({
      success: true,
      data: {
        totalLength: preview.totalLength,
        chunkSize: preview.chunkSize,
        estimatedChunks: preview.estimatedChunks,
        splitPoints: preview.splitPoints,
        avgChunkSize: Math.round(preview.totalLength / preview.estimatedChunks),
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * POST /api/chunk/split
 * 执行分块并保存文件
 * 
 * Body: {
 *   text: "文本内容",
 *   filename: "original_filename.txt",
 *   chunk_size: 6000,  // 可选
 *   save_chunks: true  // 可选
 * }
 */
router.post('/split', (req, res) => {
  try {
    const { text, filename, chunk_size, save_chunks } = req.body;

    if (!text) {
      return res.status(400).json({
        success: false,
        error: '请提供文本内容',
      });
    }

    const config = loadConfig();
    const chunkSize = chunk_size || config.chunk_settings.default_chunk_size;
    const shouldSave = save_chunks !== undefined ? save_chunks : config.output_settings.save_chunks;

    const splitter = new SmartTextSplitter({
      chunkSize,
      minChunkSize: config.chunk_settings.min_chunk_size,
      searchRange: 500,
      saveChunks: shouldSave,
      chunksDir: CHUNKS_DIR,
    });

    const result = splitter.splitAndSave(text, filename || 'text');

    res.json({
      success: true,
      data: {
        totalChunks: result.chunks.length,
        chunks: result.chunks.map(c => ({
          index: c.index,
          charCount: c.charCount,
          preview: c.content.slice(0, 100) + '...',
        })),
        savedFiles: result.savedFiles,
        metadata: result.metadata,
        stats: splitter.getStats(),
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * GET /api/chunk/files
 * 获取已保存的分块文件列表
 */
router.get('/files', (req, res) => {
  try {
    if (!fs.existsSync(CHUNKS_DIR)) {
      return res.json({
        success: true,
        data: { files: [], total: 0 },
      });
    }

    const files = fs.readdirSync(CHUNKS_DIR)
      .filter(f => f.endsWith('.txt') || f.endsWith('.json'))
      .map(filename => {
        const filepath = path.join(CHUNKS_DIR, filename);
        const stats = fs.statSync(filepath);
        return {
          filename,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime,
          isMetadata: filename.includes('metadata'),
        };
      })
      .sort((a, b) => b.modified - a.modified);

    // 按原始文件分组
    const grouped = {};
    for (const file of files) {
      // 提取原始文件名（去掉时间戳和chunk后缀）
      const match = file.filename.match(/^(.+?)_\d{4}-\d{2}-\d{2}/);
      const originalName = match ? match[1] : 'unknown';
      
      if (!grouped[originalName]) {
        grouped[originalName] = {
          originalName,
          files: [],
          metadata: null,
        };
      }
      
      if (file.isMetadata) {
        grouped[originalName].metadata = file;
      } else {
        grouped[originalName].files.push(file);
      }
    }

    res.json({
      success: true,
      data: {
        files,
        grouped: Object.values(grouped),
        total: files.length,
        chunksDir: CHUNKS_DIR,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * GET /api/chunk/files/:filename
 * 获取指定分块文件内容
 */
router.get('/files/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const filepath = path.join(CHUNKS_DIR, filename);

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({
        success: false,
        error: '文件不存在',
      });
    }

    const content = fs.readFileSync(filepath, 'utf-8');
    const stats = fs.statSync(filepath);

    // 如果是JSON文件，解析后返回
    if (filename.endsWith('.json')) {
      res.json({
        success: true,
        data: {
          filename,
          size: stats.size,
          content: JSON.parse(content),
          isJson: true,
        },
      });
    } else {
      res.json({
        success: true,
        data: {
          filename,
          size: stats.size,
          charCount: content.length,
          content,
          isJson: false,
        },
      });
    }
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * DELETE /api/chunk/files/:filename
 * 删除指定分块文件
 */
router.delete('/files/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const filepath = path.join(CHUNKS_DIR, filename);

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({
        success: false,
        error: '文件不存在',
      });
    }

    fs.unlinkSync(filepath);

    res.json({
      success: true,
      message: `文件 ${filename} 已删除`,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * DELETE /api/chunk/files
 * 清空所有分块文件
 */
router.delete('/files', (req, res) => {
  try {
    if (!fs.existsSync(CHUNKS_DIR)) {
      return res.json({
        success: true,
        message: '目录已为空',
        deleted: 0,
      });
    }

    const files = fs.readdirSync(CHUNKS_DIR);
    let deleted = 0;

    for (const file of files) {
      fs.unlinkSync(path.join(CHUNKS_DIR, file));
      deleted++;
    }

    res.json({
      success: true,
      message: `已删除 ${deleted} 个文件`,
      deleted,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

module.exports = router;
