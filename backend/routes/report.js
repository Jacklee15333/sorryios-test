/**
 * Report API 路由 - 调试版本 v3
 * 提供报告相关的API接口
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { getProcessingLogService } = require('../services/processingLogService');

const processingLogService = getProcessingLogService();

/**
 * 获取任务报告
 * GET /api/tasks/:id/report
 */
router.get('/tasks/:id/report', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`[Report] 获取任务数据: ${id}`);

    // 使用正确的方法获取数据
    const task = processingLogService.getTask(id);
    
    if (!task) {
      console.log(`[Report] ❌ 未找到任务: ${id}`);
      return res.json({
        success: true,
        words: [],
        phrases: [],
        patterns: [],
        grammar: []
      });
    }

    // 获取匹配项和未匹配项
    const matchedItems = processingLogService.getMatchedItems(id);
    const unmatchedItems = processingLogService.getUnmatchedItems(id);

    console.log(`[Report] 📊 数据获取成功:`);
    console.log(`  - matched_items: ${matchedItems.length}`);
    console.log(`  - unmatched_items: ${unmatchedItems.length}`);

    // 解析和展示数据结构
    if (matchedItems.length > 0) {
      console.log(`[Report] 📝 matched_items 示例 (前3条):`);
      matchedItems.slice(0, 3).forEach((item, index) => {
        const matchedDataStr = typeof item.matched_data === 'string' 
          ? item.matched_data 
          : JSON.stringify(item.matched_data || {});
        console.log(`  [${index}]`, {
          keys: Object.keys(item),
          item_type: item.item_type,
          match_type: item.match_type,
          original_text: item.original_text?.substring(0, 50),
          matched_data_type: typeof item.matched_data,
          matched_data_preview: matchedDataStr.substring(0, 100)
        });
      });
    }

    if (unmatchedItems.length > 0) {
      console.log(`[Report] 📝 unmatched_items 示例 (前3条):`);
      unmatchedItems.slice(0, 3).forEach((item, index) => {
        const aiGeneratedStr = typeof item.ai_generated === 'string'
          ? item.ai_generated
          : JSON.stringify(item.ai_generated || {});
        console.log(`  [${index}]`, {
          keys: Object.keys(item),
          item_type: item.item_type,
          original_text: item.original_text?.substring(0, 50),
          ai_generated_type: typeof item.ai_generated,
          ai_generated_preview: aiGeneratedStr.substring(0, 100)
        });
      });
    }

    // 专门打印原始语法数据（用于调试）
    const grammarMatched = matchedItems.filter(i => i.item_type === 'grammar');
    const grammarUnmatched = unmatchedItems.filter(i => i.item_type === 'grammar');
    if (grammarMatched.length > 0 || grammarUnmatched.length > 0) {
      console.log(`[Report] 📚 原始语法数据统计: matched=${grammarMatched.length}, unmatched=${grammarUnmatched.length}`);
      
      if (grammarMatched.length > 0) {
        console.log(`[Report] 📚 matched语法示例 (第1条原始数据):`);
        const first = grammarMatched[0];
        const data = typeof first.matched_data === 'string' 
          ? JSON.parse(first.matched_data) 
          : first.matched_data;
        console.log('    原始字段:', Object.keys(data));
        console.log('    数据内容:', data);
      }
      
      if (grammarUnmatched.length > 0) {
        console.log(`[Report] 📚 unmatched语法示例 (第1条原始数据):`);
        const first = grammarUnmatched[0];
        const data = typeof first.ai_generated === 'string'
          ? JSON.parse(first.ai_generated)
          : first.ai_generated;
        console.log('    原始字段:', Object.keys(data));
        console.log('    数据内容:', data);
      }
    }

    // 字段映射函数：统一不同来源的数据格式
    const normalizeItem = (data, itemType) => {
      // 基础字段
      const normalized = {
        type: itemType
      };

      // 根据类型映射字段
      if (itemType === 'word') {
        normalized.content = data.word || data.content || '';
        normalized.phonetic = data.phonetic || '';
        normalized.pos = data.pos || data.wordClass || '';
        normalized.meaning = data.meaning || data.translation || '';
        normalized.example = data.example || '';
      } else if (itemType === 'phrase') {
        normalized.content = data.phrase || data.content || '';
        normalized.meaning = data.meaning || data.translation || '';
        normalized.example = data.example || '';
      } else if (itemType === 'pattern') {
        normalized.content = data.pattern || data.content || '';
        normalized.meaning = data.meaning || data.translation || '';
        normalized.example = data.example || '';
      } else if (itemType === 'grammar') {
        // 语法数据 - 返回完整字段（与 grammar 表结构一致）
        // 保留所有原始字段，确保 ReportViewer 可以正确渲染
        normalized.id = data.id;
        normalized.title = data.title || '';
        normalized.keywords = Array.isArray(data.keywords) ? data.keywords : [];
        normalized.definition = data.definition || '';
        normalized.structure = data.structure || '';
        normalized.usage = Array.isArray(data.usage) ? data.usage : [];
        normalized.mistakes = Array.isArray(data.mistakes) ? data.mistakes : [];
        normalized.examples = Array.isArray(data.examples) ? data.examples : [];
        normalized.category = data.category || '';
        normalized.difficulty = data.difficulty || '';
        normalized.sub_topics = Array.isArray(data.sub_topics) ? data.sub_topics : [];
        normalized.enabled = data.enabled;
        normalized.is_new = data.is_new;
      }

      return normalized;
    };

    // 解析 matched_items 的 matched_data (JSON字符串)
    const parsedMatchedItems = matchedItems.map(item => {
      try {
        const matchedData = typeof item.matched_data === 'string' 
          ? JSON.parse(item.matched_data) 
          : item.matched_data;
        
        // 使用字段映射
        return normalizeItem(matchedData, item.item_type);
      } catch (e) {
        console.error(`[Report] ❌ 解析 matched_data 失败:`, e.message);
        return null;
      }
    }).filter(item => item !== null);

    // 解析 unmatched_items 的 ai_generated (JSON字符串)
    const parsedUnmatchedItems = unmatchedItems.map(item => {
      try {
        const aiGenerated = typeof item.ai_generated === 'string'
          ? JSON.parse(item.ai_generated)
          : item.ai_generated;
        
        // 使用字段映射
        return normalizeItem(aiGenerated, item.item_type);
      } catch (e) {
        console.error(`[Report] ❌ 解析 ai_generated 失败:`, e.message);
        return null;
      }
    }).filter(item => item !== null);

    // 合并所有项目 (优先使用 unmatched，因为是AI生成的新内容)
    const allItems = [...parsedUnmatchedItems, ...parsedMatchedItems];

    console.log(`[Report] 📦 解析后总数: ${allItems.length}`);

    // 输出几个示例看看映射后的结构
    if (allItems.length > 0) {
      console.log(`[Report] 📋 映射后的数据示例 (前3条):`);
      allItems.slice(0, 3).forEach((item, index) => {
        console.log(`  [${index}]`, {
          type: item.type,
          content: item.content?.substring(0, 30),
          phonetic: item.phonetic,
          pos: item.pos,
          meaning: item.meaning?.substring(0, 30),
          example: item.example?.substring(0, 30)
        });
      });
    }

    // 专门打印语法数据示例（用于调试）
    const grammarItems = allItems.filter(item => item.type === 'grammar');
    if (grammarItems.length > 0) {
      console.log(`[Report] 📚 语法数据示例 (前3条):`);
      grammarItems.slice(0, 3).forEach((item, index) => {
        console.log(`  [${index}]`, {
          type: item.type,
          content: item.content?.substring(0, 50),
          meaning: item.meaning?.substring(0, 50),
          example: item.example?.substring(0, 50),
          usage: Array.isArray(item.usage) ? item.usage.join('; ').substring(0, 50) : item.usage
        });
      });
    } else {
      console.log(`[Report] ⚠️ 警告: 映射后没有找到语法数据！`);
      console.log(`[Report] 🔍 原始数据中的语法项数量: ${matchedItems.filter(i => i.item_type === 'grammar').length + unmatchedItems.filter(i => i.item_type === 'grammar').length}`);
    }

    // 统计类型分布
    const typeDistribution = {};
    allItems.forEach(item => {
      const type = item.type || 'unknown';
      typeDistribution[type] = (typeDistribution[type] || 0) + 1;
    });

    console.log(`[Report] 📊 类型分布统计:`, typeDistribution);

    // 按类型分类
    const words = allItems.filter(item => {
      const type = item.type;
      return type === 'word' || type === 'words' || type === 'vocabulary';
    });

    const phrases = allItems.filter(item => {
      const type = item.type;
      return type === 'phrase' || type === 'phrases' || type === 'idiom';
    });

    const patterns = allItems.filter(item => {
      const type = item.type;
      return type === 'pattern' || type === 'patterns' || type === 'sentence';
    });

    const grammar = allItems.filter(item => {
      const type = item.type;
      return type === 'grammar' || type === 'grammars' || type === 'grammarPoint';
    });

    console.log(`[Report] ✅ 返回数据统计:`);
    console.log(`  - words: ${words.length}`);
    console.log(`  - phrases: ${phrases.length}`);
    console.log(`  - patterns: ${patterns.length}`);
    console.log(`  - grammar: ${grammar.length}`);

    res.json({
      success: true,
      words,
      phrases,
      patterns,
      grammar,
      // 调试信息
      _debug: {
        totalItems: allItems.length,
        typeDistribution,
        matchedCount: matchedItems.length,
        unmatchedCount: unmatchedItems.length,
        parsedMatchedCount: parsedMatchedItems.length,
        parsedUnmatchedCount: parsedUnmatchedItems.length
      }
    });

  } catch (error) {
    console.error('[Report] 错误:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取报告信息（保留原有接口）
 * GET /api/report/:id
 */

/**
 * GET /processing-stats
 * 获取待处理数据统计
 */
router.get('/processing-stats', (req, res) => {
    try {
        const { db } = require('../services/database');
        const exactMatch = db.prepare(`SELECT COUNT(*) as count FROM matched_items WHERE status = 'auto_confirmed'`).get().count;
        const fuzzyMatch = db.prepare(`SELECT COUNT(*) as count FROM matched_items WHERE status = 'pending'`).get().count;
        const unmatched = db.prepare(`SELECT COUNT(*) as count FROM unmatched_items WHERE status IN ('pending', 'edited')`).get().count;
        res.json({success: true, exactMatch, fuzzyMatch, unmatched, total: exactMatch + fuzzyMatch + unmatched});
        console.log(`[API] 统计: 精准=${exactMatch}, 模糊=${fuzzyMatch}, AI=${unmatched}`);
    } catch (error) {
        console.error('[API] 获取统计失败:', error);
        res.status(500).json({success: false, error: '获取统计失败', exactMatch: 0, fuzzyMatch: 0, unmatched: 0});
    }
});

/**
 * GET /exact-matches
 * 获取精准匹配列表
 */
router.get('/exact-matches', (req, res) => {
    try {
        const { db } = require('../services/database');
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 50;
        const offset = (page - 1) * pageSize;
        
        // 简单查询
        const items = db.prepare(`
            SELECT * FROM matched_items 
            WHERE status = 'auto_confirmed' 
            ORDER BY created_at DESC 
            LIMIT ? OFFSET ?
        `).all(pageSize, offset);
        
        const total = db.prepare(`
            SELECT COUNT(*) as total FROM matched_items 
            WHERE status = 'auto_confirmed'
        `).get().total;
        
        const processedItems = items.map(item => ({
            ...item,
            matched_data: JSON.parse(item.matched_data || '{}')
        }));
        
        res.json({
            success: true,
            items: processedItems,
            pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
        });
        
        console.log(`[API] 返回 ${items.length} 条精准匹配记录`);
    } catch (error) {
        console.error('[API] 获取精准匹配列表失败:', error);
        res.status(500).json({ success: false, error: '获取列表失败' });
    }
});

/**
 * GET /fuzzy-matches
 * 获取模糊匹配列表
 */
router.get('/fuzzy-matches', (req, res) => {
    try {
        const { db } = require('../services/database');
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 50;
        const search = req.query.search || '';
        const itemType = req.query.itemType || '';
        const offset = (page - 1) * pageSize;
        let whereConditions = ["status = 'pending'"];
        let params = [];
        if (search) { whereConditions.push("(m.original_text LIKE ? OR m.matched_text LIKE ?)"); params.push(`%${search}%`, `%${search}%`); }
        if (itemType) { whereConditions.push("m.item_type = ?"); params.push(itemType); }
        const whereClause = whereConditions.join(' AND ');
        const { total } = db.prepare(`SELECT COUNT(*) as total FROM matched_items WHERE ${whereClause}`).get(...params);
        const items = db.prepare(`SELECT m.*, t.title as task_title FROM matched_items m LEFT JOIN tasks t ON m.task_id = t.id WHERE ${whereClause} ORDER BY m.match_score ASC, m.created_at DESC LIMIT ? OFFSET ?`).all(...params, pageSize, offset);
        const processedItems = items.map(item => ({ ...item, matched_data: JSON.parse(item.matched_data || '{}') }));
        res.json({ success: true, items: processedItems, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
    } catch (error) {
        console.error('[API] 获取模糊匹配列表失败:', error);
        res.status(500).json({ success: false, error: '获取列表失败' });
    }
});

router.get('/:id', async (req, res) => {
  try {
    const reportPath = path.join(__dirname, '../../reports', req.params.id);
    
    // 检查报告是否存在
    if (!fs.existsSync(reportPath)) {
      return res.status(404).json({
        success: false,
        error: '报告不存在'
      });
    }

    // 读取报告文件信息
    const files = fs.readdirSync(reportPath);
    const report = {
      taskId: req.params.id,
      title: `报告_${req.params.id}`,
      files: {
        html: files.find(f => f.endsWith('.html')),
        markdown: files.find(f => f.endsWith('.md')),
        json: files.find(f => f.endsWith('.json'))
      }
    };

    res.json({
      success: true,
      report
    });
  } catch (error) {
    console.error('[Report] 错误:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});




module.exports = router;





