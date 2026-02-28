/**
 * Report API 路由 - v4.0 修复版
 * 文件位置: backend/routes/report.js
 * 
 * 📦 v4.0 重大修复：
 * - 添加：用户认证和权限验证
 * - 修复：ID生成问题（添加唯一ID，避免冲突）
 * - 添加：过滤已掌握词汇功能
 * - 改进：详细的调试日志
 * - 修复：数据结构统一
 * 
 * 修复的问题：
 * 1. ✅ 所有单词key都是undefined导致全部消失
 * 2. ✅ 没有用户认证，任何人可查看报告
 * 3. ✅ 未调用filterReportData过滤已掌握词汇
 * 4. ✅ matched_items和unmatched_items的ID可能重复
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { getProcessingLogService } = require('../services/processingLogService');
const { authMiddleware } = require('./auth');
const { filterReportData } = require('../services/user-mastered-service');
const taskQueue = require('../services/taskQueue');

const processingLogService = getProcessingLogService();

/**
 * 获取任务报告
 * GET /api/tasks/:id/report
 * 
 * v4.0 新增：
 * - 用户认证
 * - 权限验证
 * - 过滤已掌握词汇
 */
router.get('/tasks/:id/report', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const username = req.user.username;
    
    console.log('\n' + '='.repeat(80));
    console.log('[Report] 📊 获取任务报告请求');
    console.log('='.repeat(80));
    console.log(`[Report] 👤 用户: ${username} (ID: ${userId})`);
    console.log(`[Report] 📋 任务ID: ${id}`);
    console.log(`[Report] 🕐 时间: ${new Date().toLocaleString()}`);

    // ============================================
    // 步骤1: 验证任务存在性
    // ============================================
    const task = processingLogService.getTask(id);
    
    if (!task) {
      console.log(`[Report] ❌ 任务不存在: ${id}`);
      console.log('='.repeat(80) + '\n');
      return res.json({
        success: true,
        words: [],
        phrases: [],
        patterns: [],
        grammar: []
      });
    }
    
    console.log(`[Report] ✅ 任务存在`);
    console.log(`[Report]    - 文件名: ${task.file_name}`);
    console.log(`[Report]    - 状态: ${task.status}`);
    console.log(`[Report]    - 任务所属用户: ${task.user_id || '未知'}`);

    // ============================================
    // 步骤2: 验证任务归属权限
    // ============================================
    if (task.user_id !== userId) {
      console.log(`[Report] 🚫 权限拒绝: 任务不属于当前用户`);
      console.log(`[Report]    - 任务所属: ${task.user_id}`);
      console.log(`[Report]    - 当前用户: ${userId}`);
      console.log('='.repeat(80) + '\n');
      return res.status(403).json({
        success: false,
        error: '无权访问此任务'
      });
    }
    
    console.log(`[Report] ✅ 权限验证通过`);

    // ============================================
    // 步骤3: 获取匹配项和未匹配项
    // ============================================
    const matchedItems = processingLogService.getMatchedItems(id);
    const unmatchedItems = processingLogService.getUnmatchedItems(id);

    console.log(`[Report] 📊 数据获取成功:`);
    console.log(`[Report]    - matched_items: ${matchedItems.length}`);
    console.log(`[Report]    - unmatched_items: ${unmatchedItems.length}`);

    // 调试：查看数据结构
    if (matchedItems.length > 0) {
      console.log(`[Report] 🔍 matched_items 示例 (前3条):`);
      matchedItems.slice(0, 3).forEach((item, index) => {
        console.log(`[Report]    [${index}] ID=${item.id}, type=${item.item_type}, score=${item.match_score}`);
      });
    }

    if (unmatchedItems.length > 0) {
      console.log(`[Report] 🔍 unmatched_items 示例 (前3条):`);
      unmatchedItems.slice(0, 3).forEach((item, index) => {
        console.log(`[Report]    [${index}] ID=${item.id}, type=${item.item_type}`);
      });
    }

    // ============================================
    // 步骤4: 数据清洗辅助函数
    // ============================================
    
    // 清洗音标：去除混入的词性信息，只保留纯音标
    const cleanPhonetic = (phonetic) => {
      if (!phonetic || typeof phonetic !== 'string') return '';
      let cleaned = phonetic.trim();
      
      // 情况1: 音标中混入了词性标记，如 /'kompaund/ (n./adj.), /kəm'paund/ (v.)/
      // 只提取第一个 /.../ 之间的内容
      const phoneticMatches = cleaned.match(/\/[^\/]+\//g);
      if (phoneticMatches && phoneticMatches.length > 0) {
        // 过滤掉看起来像词性的内容 (如 只包含 n. v. adj. 等)
        const validPhonetics = phoneticMatches.filter(p => {
          const inner = p.replace(/\//g, '').trim();
          // 如果内容全是词性标记（n. v. adj. adv. 等），则不是有效音标
          return !/^[nvadjmodliru.\s\/,()]+$/i.test(inner) && inner.length > 1;
        });
        if (validPhonetics.length > 0) {
          return validPhonetics[0]; // 只返回第一个有效音标
        }
      }
      
      // 情况2: 没有 /.../ 格式，直接返回清理后的内容
      // 去除常见的词性标记
      cleaned = cleaned.replace(/\s*\([^)]*\)\s*/g, '').trim();
      return cleaned;
    };
    
    // 清洗单词：去除混入的音标、词性、含义
    const cleanWord = (word) => {
      if (!word || typeof word !== 'string') return '';
      let cleaned = word.trim();
      // 如果单词中包含 / 或中文字符，可能是数据混乱
      // 提取第一个空格或 / 之前的英文单词部分
      const wordMatch = cleaned.match(/^([a-zA-Z][a-zA-Z\s-]*)/);
      if (wordMatch) {
        return wordMatch[1].trim();
      }
      return cleaned;
    };
    
    // 从音标中提取混入的词性信息
    const extractPosFromPhonetic = (phonetic, existingPos) => {
      if (existingPos && existingPos.trim()) return existingPos;
      if (!phonetic || typeof phonetic !== 'string') return '';
      
      // 匹配括号中的词性信息，如 (n./adj.) 或 (v.)
      const posMatch = phonetic.match(/\(([^)]*(?:n\.|v\.|adj\.|adv\.|prep\.|conj\.|pron\.|modal)[^)]*)\)/i);
      if (posMatch) {
        return posMatch[1].trim();
      }
      return '';
    };

    // ============================================
    // 步骤5: 字段映射函数（统一数据格式）
    // ============================================
    const normalizeItem = (data, itemType, sourceId, source) => {
      const normalized = {
        type: itemType,
        // ✅ v4.0 修复：添加唯一ID（带前缀避免冲突）
        id: `${source}-${sourceId}`,
        recordId: sourceId,  // 原始记录ID
        source: source       // 'matched' 或 'unmatched'
      };

      // 根据类型映射字段
      if (itemType === 'word') {
        const rawWord = data.word || data.content || '';
        const rawPhonetic = data.phonetic || '';
        const rawPos = data.pos || data.wordClass || '';
        
        // ✅ v4.1 数据清洗：修复音标混入词性、单词混入其他信息
        const extractedPos = extractPosFromPhonetic(rawPhonetic, rawPos);
        
        normalized.content = cleanWord(rawWord);
        normalized.word = cleanWord(rawWord);
        normalized.phonetic = cleanPhonetic(rawPhonetic);
        normalized.pos = extractedPos || rawPos;
        normalized.meaning = data.meaning || data.translation || '';
        normalized.example = data.example || '';
      } else if (itemType === 'phrase') {
        normalized.content = data.phrase || data.content || '';
        normalized.phrase = data.phrase || data.content || '';  // 兼容字段
        normalized.meaning = data.meaning || data.translation || '';
        normalized.example = data.example || '';
      } else if (itemType === 'pattern') {
        normalized.content = data.pattern || data.content || '';
        normalized.pattern = data.pattern || data.content || '';  // 兼容字段
        normalized.meaning = data.meaning || data.translation || '';
        normalized.example = data.example || '';
      } else if (itemType === 'grammar') {
        // 语法数据 - 保留完整字段
        normalized.id = `${source}-${sourceId}`;  // 使用相同格式的ID
        normalized.title = data.title || '';
        normalized.content = data.title || '';  // 添加content字段用于统一处理
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

    // ============================================
    // 步骤5: 解析matched_items
    // ============================================
    console.log(`[Report] 🔄 开始解析 matched_items...`);
    const parsedMatchedItems = matchedItems.map(item => {
      try {
        const matchedData = typeof item.matched_data === 'string' 
          ? JSON.parse(item.matched_data) 
          : item.matched_data;
        
        // ✅ v4.0 修复：传递原始ID和来源标识
        return normalizeItem(matchedData, item.item_type, item.id, 'matched');
      } catch (e) {
        console.error(`[Report] ❌ 解析 matched_data 失败:`, e.message);
        return null;
      }
    }).filter(item => item !== null);

    console.log(`[Report] ✅ matched_items 解析完成: ${parsedMatchedItems.length} 条`);

    // ============================================
    // 步骤6: 解析unmatched_items
    // ============================================
    console.log(`[Report] 🔄 开始解析 unmatched_items...`);
    const parsedUnmatchedItems = unmatchedItems.map(item => {
      try {
        const aiGenerated = typeof item.ai_generated === 'string'
          ? JSON.parse(item.ai_generated)
          : item.ai_generated;
        
        // ✅ v4.0 修复：传递原始ID和来源标识
        return normalizeItem(aiGenerated, item.item_type, item.id, 'unmatched');
      } catch (e) {
        console.error(`[Report] ❌ 解析 ai_generated 失败:`, e.message);
        return null;
      }
    }).filter(item => item !== null);

    console.log(`[Report] ✅ unmatched_items 解析完成: ${parsedUnmatchedItems.length} 条`);

    // ============================================
    // 步骤7: 合并所有项目（AI生成优先）
    // ============================================
    const allItems = [...parsedUnmatchedItems, ...parsedMatchedItems];
    console.log(`[Report] 📦 合并后总数: ${allItems.length}`);

    // ============================================
    // 步骤8: 去重逻辑
    // ============================================
    console.log('[Report] ─────────────────────────────────────');
    console.log('[Report] 🔄 开始去重处理');
    console.log('[Report] ─────────────────────────────────────');

    const deduplicateItems = (items, keyField) => {
      if (!Array.isArray(items) || items.length === 0) {
        return [];
      }
      
      const seen = new Map();
      const duplicates = [];
      const skippedEmpty = [];
      
      const result = items.filter(item => {
        if (!item || !item[keyField]) {
          if (item) skippedEmpty.push(item);
          return false;
        }
        
        let key;
        try {
          key = String(item[keyField]).toLowerCase().trim();
        } catch (e) {
          console.log(`[Report] ⚠️  无法处理字段值:`, item[keyField]);
          return false;
        }
        
        if (!key) {
          skippedEmpty.push(item);
          return false;
        }
        
        if (seen.has(key)) {
          duplicates.push({ key, value: item[keyField] });
          return false;
        }
        
        seen.set(key, true);
        return true;
      });
      
      if (duplicates.length > 0) {
        console.log(`[Report] 🗑️  去重: 移除 ${duplicates.length} 个重复项`);
      }
      if (skippedEmpty.length > 0) {
        console.log(`[Report] ⚠️  跳过 ${skippedEmpty.length} 个空值项`);
      }
      
      return result;
    };

    // 按类型分组
    const itemsByType = {
      word: [],
      phrase: [],
      pattern: [],
      grammar: [],
      unknown: []
    };

    allItems.forEach(item => {
      const type = item.type;
      if (itemsByType[type]) {
        itemsByType[type].push(item);
      } else {
        console.log(`[Report] ⚠️  未知类型: ${type}`);
        itemsByType.unknown.push(item);
      }
    });

    console.log(`[Report] 📊 分类统计:`);
    console.log(`[Report]    - words: ${itemsByType.word.length}`);
    console.log(`[Report]    - phrases: ${itemsByType.phrase.length}`);
    console.log(`[Report]    - patterns: ${itemsByType.pattern.length}`);
    console.log(`[Report]    - grammar: ${itemsByType.grammar.length}`);
    if (itemsByType.unknown.length > 0) {
      console.log(`[Report]    - unknown: ${itemsByType.unknown.length}`);
    }

    // 去重
    console.log(`[Report] 🔄 开始去重...`);
    itemsByType.word = deduplicateItems(itemsByType.word, 'content');
    itemsByType.phrase = deduplicateItems(itemsByType.phrase, 'content');
    itemsByType.pattern = deduplicateItems(itemsByType.pattern, 'content');
    itemsByType.grammar = deduplicateItems(itemsByType.grammar, 'title');

    console.log(`[Report] ✅ 去重完成:`);
    console.log(`[Report]    - words: ${itemsByType.word.length}`);
    console.log(`[Report]    - phrases: ${itemsByType.phrase.length}`);
    console.log(`[Report]    - patterns: ${itemsByType.pattern.length}`);
    console.log(`[Report]    - grammar: ${itemsByType.grammar.length}`);

    // ============================================
    // 步骤9: 调用filterReportData过滤已掌握词汇
    // ============================================
    console.log('[Report] ─────────────────────────────────────');
    console.log('[Report] 🔄 开始过滤已掌握词汇');
    console.log('[Report] ─────────────────────────────────────');
    console.log(`[Report] 👤 用户ID: ${userId}`);

    // ✅ v4.0 新增：构造正确的数据结构
    const reportDataForFilter = {
      vocabulary: {
        words: itemsByType.word,
        phrases: itemsByType.phrase,
        patterns: itemsByType.pattern
      },
      grammar: itemsByType.grammar
    };

    console.log(`[Report] 📊 过滤前数据统计:`);
    console.log(`[Report]    - words: ${reportDataForFilter.vocabulary.words.length}`);
    console.log(`[Report]    - phrases: ${reportDataForFilter.vocabulary.phrases.length}`);
    console.log(`[Report]    - patterns: ${reportDataForFilter.vocabulary.patterns.length}`);
    console.log(`[Report]    - grammar: ${reportDataForFilter.grammar.length}`);

    // ✅ v4.0 新增：调用过滤函数
    const filteredData = filterReportData(reportDataForFilter, userId);

    console.log(`[Report] ✅ 过滤完成:`);
    console.log(`[Report]    - words: ${reportDataForFilter.vocabulary.words.length} → ${filteredData.vocabulary.words.length}`);
    console.log(`[Report]    - phrases: ${reportDataForFilter.vocabulary.phrases.length} → ${filteredData.vocabulary.phrases.length}`);
    console.log(`[Report]    - patterns: ${reportDataForFilter.vocabulary.patterns.length} → ${filteredData.vocabulary.patterns.length}`);
    console.log(`[Report]    - grammar: ${reportDataForFilter.grammar.length} → ${filteredData.grammar.length}`);

    // ============================================
    // 步骤10: 返回数据
    // ============================================
    const words = filteredData.vocabulary.words;
    const phrases = filteredData.vocabulary.phrases;
    const patterns = filteredData.vocabulary.patterns;
    const grammar = filteredData.grammar;

    // 调试：查看返回的数据示例
    if (words.length > 0) {
      console.log(`[Report] 📝 返回的单词示例 (前3条):`);
      words.slice(0, 3).forEach((item, index) => {
        console.log(`[Report]    [${index}] id=${item.id}, content=${item.content}, type=${item.type}`);
      });
    }

    console.log('[Report] ─────────────────────────────────────');
    console.log(`[Report] ✅ 返回最终数据统计:`);
    console.log(`[Report]    - words: ${words.length}`);
    console.log(`[Report]    - phrases: ${phrases.length}`);
    console.log(`[Report]    - patterns: ${patterns.length}`);
    console.log(`[Report]    - grammar: ${grammar.length}`);
    console.log('='.repeat(80));
    console.log('[Report] ✅ 获取任务报告完成');
    console.log('='.repeat(80) + '\n');

    res.json({
      success: true,
      words,
      phrases,
      patterns,
      grammar,
      // 调试信息
      _debug: {
        userId,
        taskId: id,
        beforeFilter: {
          words: reportDataForFilter.vocabulary.words.length,
          phrases: reportDataForFilter.vocabulary.phrases.length,
          patterns: reportDataForFilter.vocabulary.patterns.length,
          grammar: reportDataForFilter.grammar.length
        },
        afterFilter: {
          words: words.length,
          phrases: phrases.length,
          patterns: patterns.length,
          grammar: grammar.length
        },
        filtered: {
          words: reportDataForFilter.vocabulary.words.length - words.length,
          phrases: reportDataForFilter.vocabulary.phrases.length - phrases.length,
          patterns: reportDataForFilter.vocabulary.patterns.length - patterns.length,
          grammar: reportDataForFilter.grammar.length - grammar.length
        }
      }
    });

  } catch (error) {
    console.error('[Report] ❌ 错误:', error);
    console.error('[Report] 堆栈:', error.stack);
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
router.get('/report/:id', async (req, res) => {
  try {
    const reportPath = path.join(__dirname, '../../reports', req.params.id);
    
    if (!fs.existsSync(reportPath)) {
      return res.status(404).json({
        success: false,
        error: '报告不存在'
      });
    }

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

/**
 * GET /api/processing-stats
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
 * GET /api/exact-matches
 * 获取精准匹配列表
 */
router.get('/exact-matches', (req, res) => {
  try {
    const { db } = require('../services/database');
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 50;
    const offset = (page - 1) * pageSize;
    
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
 * GET /api/fuzzy-matches
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

module.exports = router;