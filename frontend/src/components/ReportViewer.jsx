/**
 * ReportViewer v4.2 - 修复"已学会"功能
 * 
 * v4.2 更新内容（2026-02-04）：
 * ✅ 修复ID生成问题 - 使用稳定的key生成逻辑
 * ✅ 修复类型判断错误 - 直接使用type字段（已经是英文）
 * ✅ 添加重新加载功能 - 点击"已学会"后从后端获取过滤后的数据
 * ✅ 添加详细日志 - 便于问题排查
 * ✅ 添加用户认证检查 - 需要token才能操作
 * 
 * v4.1 更新内容：
 * - 优化 PDF 导出逻辑
 * - 添加详细错误提示
 * - 改进 html2canvas 配置
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Table, Button, message, Spin, Empty, Typography, Space, Card, Modal, Checkbox, Input } from 'antd';
import { CheckOutlined, CloseOutlined, ReloadOutlined, DownloadOutlined, FilePdfOutlined, FileWordOutlined, FileTextOutlined, SettingOutlined } from '@ant-design/icons';
import axios from 'axios';
import { Document, Packer, Paragraph, Table as DocxTable, TableCell, TableRow, TextRun, HeadingLevel, AlignmentType, WidthType } from 'docx';
import { saveAs } from 'file-saver';

const { Title, Text, Paragraph: AntParagraph } = Typography;

const ReportViewer = ({ taskId }) => {
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [exportType, setExportType] = useState('pdf');
  const [exportOptions, setExportOptions] = useState({
    includeVocabulary: true,
    includeGrammar: true,
    fileName: '学习报告'
  });
  const [data, setData] = useState({
    words: [],
    phrases: [],
    patterns: [],
    grammar: []
  });
  const [taskInfo, setTaskInfo] = useState(null); // 新增：存储任务信息
  const [hiddenItems, setHiddenItems] = useState(new Set()); // 🔧 新增：隐藏的词汇ID集合
  
  const reportContentRef = useRef(null);

  // 🔧 音标格式化函数
  const formatPhonetic = (phonetic) => {
    if (!phonetic) return '';
    const trimmed = phonetic.trim();
    if (trimmed.startsWith('/') && trimmed.endsWith('/')) {
      return trimmed;
    }
    if (trimmed.startsWith('/') || trimmed.endsWith('/')) {
      return trimmed.startsWith('/') ? trimmed + '/' : '/' + trimmed;
    }
    return `/${trimmed}/`;
  };

  // 加载数据
  useEffect(() => {
    if (taskId) {
      loadData();
    }
  }, [taskId]);

  // 页面加载后自动诊断
  useEffect(() => {
    if (!loading && data.words) {
      setTimeout(() => {
        console.log('========== 🔍 自动诊断报告 ==========');
        console.log('⏰ 时间:', new Date().toLocaleString());
        
        const words = getWordsData();
        const phrases = getPhrasesData();
        console.log('📊 数据加载完成:');
        console.log('  - 单词:', words.length);
        console.log('  - 短语和句型:', phrases.length);
        console.log('  - 总语法:', data.grammar?.length || 0);
        
        const table = document.querySelector('.ant-table');
        if (table) {
          const headers = table.querySelectorAll('thead th');
          const rows = table.querySelectorAll('tbody tr');
          console.log('📋 表格渲染完成:');
          console.log('  - 列数:', headers.length, '(应该是5列)');
          console.log('  - 行数:', rows.length);
          console.log('  - 表格宽度:', table.offsetWidth + 'px');
          
          if (headers.length === 5) {
            console.log('✅ 表格列数正常');
          } else {
            console.warn('⚠️ 表格列数异常！预期5列，实际', headers.length, '列');
          }
        } else {
          console.warn('⚠️ 表格未找到！可能渲染失败');
        }
        
        const plugins = document.querySelectorAll('iframe, [class*="extension"], [class*="plugin"]');
        if (plugins.length > 0) {
          console.warn('🔌 检测到', plugins.length, '个浏览器插件元素');
          console.warn('⚠️ 建议使用无痕模式（Ctrl+Shift+N）以避免插件干扰');
        } else {
          console.log('✅ 未检测到插件干扰');
        }
        
        console.log('========================================');
        console.log('💡 提示：点击工具栏的"诊断"按钮可再次查看诊断信息');
      }, 1000);
    }
  }, [loading, data]);

  const loadData = async () => {
    try {
      console.log('\n' + '='.repeat(60));
      console.log('[ReportViewer] 🔄 开始加载报告数据');
      console.log('='.repeat(60));
      console.log(`[ReportViewer] 任务ID: ${taskId}`);
      
      setLoading(true);
      
      // 加载报告数据
      const token = localStorage.getItem('token');
      const response = await axios.get(`/api/tasks/${taskId}/report`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      
      console.log('[ReportViewer] ✅ 数据加载成功');
      console.log('[ReportViewer] 数据统计:');
      console.log(`[ReportViewer]    - words: ${response.data.words?.length || 0}`);
      console.log(`[ReportViewer]    - phrases: ${response.data.phrases?.length || 0}`);
      console.log(`[ReportViewer]    - patterns: ${response.data.patterns?.length || 0}`);
      console.log(`[ReportViewer]    - grammar: ${response.data.grammar?.length || 0}`);
      
      // 调试：查看第一个单词的结构
      if (response.data.words && response.data.words.length > 0) {
        console.log('[ReportViewer] 第一个单词的数据结构:', response.data.words[0]);
        console.log('[ReportViewer] 字段列表:', Object.keys(response.data.words[0]));
      }
      
      setData(response.data);
      
      // 加载任务信息（获取标题）
      try {
        const taskResponse = await axios.get(`/api/task/${taskId}`);
        setTaskInfo(taskResponse.data.task || taskResponse.data);
        // 更新默认文件名为任务标题
        if (taskResponse.data?.title || taskResponse.data?.customTitle) {
          setExportOptions(prev => ({
            ...prev,
            fileName: taskResponse.data.customTitle || taskResponse.data.title || '学习报告'
          }));
        }
      } catch (err) {
        console.error('[ReportViewer] 加载任务信息失败:', err);
      }
      
      console.log('='.repeat(60));
      console.log('[ReportViewer] ✅ 数据加载完成');
      console.log('='.repeat(60) + '\n');
      
    } catch (error) {
      console.error('[ReportViewer] ❌ 加载数据失败:', error);
      console.error('[ReportViewer] 错误详情:', error.response?.data || error.message);
      message.error('加载数据失败');
      console.log('='.repeat(60) + '\n');
    } finally {
      setLoading(false);
    }
  };

  // 获取单词数据
  const getWordsData = () => {
    const words = [];
    data.words?.forEach((item, index) => {
      // ✅ v4.1 修复：使用稳定的key生成逻辑
      // 优先使用id，备用content+index
      const key = item.id || `word-${(item.content || item.word || 'unknown')}-${index}`;
      
      words.push({
        ...item,
        key: key,
        sortOrder: index
      });
      
      // 调试：检查key生成
      if (index < 3) {
        console.log(`[ReportViewer] 单词 ${index + 1} key: ${key}, id: ${item.id}, content: ${item.content}`);
      }
    });
    
    const filtered = words.filter(item => !hiddenItems.has(item.key));
    
    console.log(`[ReportViewer] 单词数据: 总数 ${words.length}, 过滤后 ${filtered.length}, 隐藏 ${words.length - filtered.length}`);
    
    return filtered.sort((a, b) => a.sortOrder - b.sortOrder);
  };

  // 获取短语数据（短语+句型）
  const getPhrasesData = () => {
    const phrases = [];
    
    data.phrases?.forEach((item, index) => {
      // ✅ v4.1 修复：使用稳定的key生成逻辑
      const key = item.id || `phrase-${(item.content || item.phrase || 'unknown')}-${index}`;
      
      phrases.push({
        ...item,
        key: key,
        sortOrder: index
      });
    });
    
    data.patterns?.forEach((item, index) => {
      // ✅ v4.1 修复：使用稳定的key生成逻辑
      const key = item.id || `pattern-${(item.content || item.pattern || 'unknown')}-${index}`;
      
      phrases.push({
        ...item,
        key: key,
        sortOrder: data.phrases?.length + index || index
      });
    });
    
    const filtered = phrases.filter(item => !hiddenItems.has(item.key));
    
    console.log(`[ReportViewer] 短语/句型数据: 总数 ${phrases.length}, 过滤后 ${filtered.length}, 隐藏 ${phrases.length - filtered.length}`);
    
    return filtered.sort((a, b) => a.sortOrder - b.sortOrder);
  };

  // 🔧 修改：处理"已学会"操作
  const handleConfirm = async (record) => {
    try {
      console.log('\n' + '='.repeat(60));
      console.log('[ReportViewer] 🎯 点击"已学会"');
      console.log('='.repeat(60));
      console.log('[ReportViewer] 记录信息:', {
        key: record.key,
        id: record.id,
        type: record.type,
        content: record.content || record.word || record.phrase || record.pattern
      });
      
      const token = localStorage.getItem('token');
      
      if (!token) {
        message.error('请先登录');
        console.log('[ReportViewer] ❌ 未登录');
        return;
      }
      
      // ✅ v4.1 修复：直接使用 type 字段（已经是英文：word/phrase/pattern/grammar）
      let wordType = record.type;
      
      // 确保类型有效
      if (!['word', 'phrase', 'pattern', 'grammar'].includes(wordType)) {
        console.warn(`[ReportViewer] ⚠️  未知类型: ${wordType}，默认使用 word`);
        wordType = 'word';
      }
      
      // ✅ v4.1 修复：使用 content 字段作为主字段
      const word = record.content || record.word || record.phrase || record.pattern;
      
      if (!word) {
        message.error('词汇内容为空');
        console.log('[ReportViewer] ❌ 词汇内容为空');
        return;
      }
      
      console.log(`[ReportViewer] 📤 准备发送请求:`);
      console.log(`[ReportViewer]    - word: ${word}`);
      console.log(`[ReportViewer]    - wordType: ${wordType}`);
      
      // 调用API添加到已掌握列表
      const response = await axios.post('/api/user-mastered/add', 
        { word, wordType },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      console.log('[ReportViewer] ✅ API响应:', response.data);
      
      // ✅ v4.3 优化：前端立即隐藏，不刷新页面（提升用户体验）
      console.log('[ReportViewer] 👁️  前端立即隐藏该词汇...');
      setHiddenItems(prev => new Set([...prev, record.key]));
      
      // 显示成功消息（带撤销选项）
      const key = `mastered-${record.key}`;
      message.success({
        content: (
          <span>
            已标记为掌握
            <a 
              onClick={async () => {
                // 🔧 F2修复：撤销操作 - 前端恢复显示 + 后端移除记录
                setHiddenItems(prev => {
                  const newSet = new Set(prev);
                  newSet.delete(record.key);
                  return newSet;
                });
                try {
                  const undoToken = localStorage.getItem('token');
                  if (undoToken) {
                    const undoWord = record.content || record.word || record.phrase || record.pattern;
                    const undoType = record.type || 'word';
                    console.log(`[ReportViewer] 🔄 撤销已掌握: "${undoWord}" (${undoType})`);
                    await axios.post('/api/user-mastered/remove',
                      { word: undoWord, wordType: undoType },
                      { headers: { 'Authorization': `Bearer ${undoToken}` } }
                    );
                    console.log('[ReportViewer] ✅ 后端撤销成功');
                  }
                } catch (undoErr) {
                  console.error('[ReportViewer] ❌ 撤销后端同步失败:', undoErr.message);
                }
                message.info('已撤销');
              }}
              style={{ marginLeft: 12, color: '#1890ff', cursor: 'pointer' }}
            >
              撤销
            </a>
          </span>
        ),
        key,
        duration: 3
      });
      
      console.log('[ReportViewer] ✅ 已隐藏，无需刷新页面');
      console.log('='.repeat(60) + '\n');
      
    } catch (error) {
      console.error('[ReportViewer] ❌ 操作失败:', error);
      console.error('[ReportViewer] 错误详情:', error.response?.data || error.message);
      console.log('='.repeat(60) + '\n');
      
      // ✅ v4.3 新增：保存失败，自动恢复显示
      console.log('[ReportViewer] 🔄 保存失败，恢复显示...');
      setHiddenItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(record.key);
        return newSet;
      });
      
      if (error.response?.status === 401) {
        message.error('登录已过期，请重新登录');
      } else {
        message.error('操作失败: ' + (error.response?.data?.message || error.message));
      }
    }
  };

  // 🔧 修改：处理"识别错误"操作
  const handleReject = async (record) => {
    try {
      console.log('\n' + '='.repeat(60));
      console.log('[ReportViewer] 🚫 点击"识别错误"');
      console.log('='.repeat(60));
      console.log('[ReportViewer] 记录信息:', {
        key: record.key,
        id: record.id,
        type: record.type,
        content: record.content || record.word || record.phrase || record.pattern
      });
      
      // 仅从前端隐藏，不调用任何后端API
      message.success('已从报告中移除');
      
      // 立即隐藏该项
      setHiddenItems(prev => new Set([...prev, record.key]));
      
      console.log('[ReportViewer] ✅ 已隐藏该项');
      console.log('='.repeat(60) + '\n');
      
    } catch (error) {
      console.error('[ReportViewer] ❌ 操作失败:', error);
      message.error('操作失败');
      console.log('='.repeat(60) + '\n');
    }
  };

  // 🔧 修改：处理语法"已学会"
  const handleGrammarConfirm = async (record) => {
    try {
      console.log('\n' + '='.repeat(60));
      console.log('[ReportViewer] 🎯 点击"语法已学会"');
      console.log('='.repeat(60));
      console.log('[ReportViewer] 记录信息:', {
        key: `grammar-${record.id}`,
        id: record.id,
        title: record.title,
        content: record.content
      });
      
      const token = localStorage.getItem('token');
      
      if (!token) {
        message.error('请先登录');
        console.log('[ReportViewer] ❌ 未登录');
        return;
      }
      
      // ✅ v4.1 修复：使用 content 或 title 字段
      const word = record.content || record.title;
      
      if (!word) {
        message.error('语法内容为空');
        console.log('[ReportViewer] ❌ 语法内容为空');
        return;
      }
      
      console.log(`[ReportViewer] 📤 准备发送请求:`);
      console.log(`[ReportViewer]    - word: ${word}`);
      console.log(`[ReportViewer]    - wordType: grammar`);
      
      // 调用API添加到已掌握列表
      const response = await axios.post('/api/user-mastered/add', 
        { word, wordType: 'grammar' },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      console.log('[ReportViewer] ✅ API响应:', response.data);
      
      // ✅ v4.3 优化：前端立即隐藏，不刷新页面
      console.log('[ReportViewer] 👁️  前端立即隐藏该语法...');
      const grammarKey = `grammar-${record.id}`;
      setHiddenItems(prev => new Set([...prev, grammarKey]));
      
      // 显示成功消息（带撤销选项）
      const messageKey = `mastered-${grammarKey}`;
      message.success({
        content: (
          <span>
            已标记为掌握
            <a 
              onClick={async () => {
                // 🔧 F2修复：撤销操作 - 前端恢复显示 + 后端移除记录
                setHiddenItems(prev => {
                  const newSet = new Set(prev);
                  newSet.delete(grammarKey);
                  return newSet;
                });
                try {
                  const undoToken = localStorage.getItem('token');
                  if (undoToken) {
                    const undoWord = record.content || record.title;
                    console.log(`[ReportViewer] 🔄 撤销语法已掌握: "${undoWord}"`);
                    await axios.post('/api/user-mastered/remove',
                      { word: undoWord, wordType: 'grammar' },
                      { headers: { 'Authorization': `Bearer ${undoToken}` } }
                    );
                    console.log('[ReportViewer] ✅ 后端语法撤销成功');
                  }
                } catch (undoErr) {
                  console.error('[ReportViewer] ❌ 语法撤销后端同步失败:', undoErr.message);
                }
                message.info('已撤销');
              }}
              style={{ marginLeft: 12, color: '#1890ff', cursor: 'pointer' }}
            >
              撤销
            </a>
          </span>
        ),
        key: messageKey,
        duration: 3
      });
      
      console.log('[ReportViewer] ✅ 已隐藏，无需刷新页面');
      console.log('='.repeat(60) + '\n');
      
    } catch (error) {
      console.error('[ReportViewer] ❌ 操作失败:', error);
      console.error('[ReportViewer] 错误详情:', error.response?.data || error.message);
      console.log('='.repeat(60) + '\n');
      
      // ✅ v4.3 新增：保存失败，自动恢复显示
      console.log('[ReportViewer] 🔄 保存失败，恢复显示...');
      const grammarKey = `grammar-${record.id}`;
      setHiddenItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(grammarKey);
        return newSet;
      });
      
      if (error.response?.status === 401) {
        message.error('登录已过期，请重新登录');
      } else {
        message.error('操作失败: ' + (error.response?.data?.message || error.message));
      }
    }
  };

  // 🔧 修改：处理语法"识别错误"
  const handleGrammarReject = async (record) => {
    try {
      console.log('\n' + '='.repeat(60));
      console.log('[ReportViewer] 🚫 点击"语法识别错误"');
      console.log('='.repeat(60));
      console.log('[ReportViewer] 记录信息:', {
        key: `grammar-${record.id}`,
        id: record.id,
        title: record.title
      });
      
      // 仅从前端隐藏
      message.success('已从报告中移除');
      
      const grammarKey = `grammar-${record.id}`;
      setHiddenItems(prev => new Set([...prev, grammarKey]));
      
      console.log('[ReportViewer] ✅ 已隐藏该项');
      console.log('='.repeat(60) + '\n');
      
    } catch (error) {
      console.error('[ReportViewer] ❌ 操作失败:', error);
      message.error('操作失败');
      console.log('='.repeat(60) + '\n');
    }
  };

  // ==================== 导出功能 ====================

  // PDF 导出 - 使用隐藏iframe + 原生打印，生成高质量可搜索PDF
  const exportToPDF = async () => {
    console.log('========== 📄 PDF导出开始 ==========');
    
    const wordsData = getWordsData();
    const phrasesData = getPhrasesData();
    const grammarData = data.grammar || [];
    const fileName = exportOptions.fileName || taskInfo?.customTitle || taskInfo?.title || '学习报告';
    
    if (wordsData.length === 0 && phrasesData.length === 0 && grammarData.length === 0) {
      message.warning('没有可导出的数据');
      return;
    }
    
    setExporting(true);
    message.loading({ content: '正在准备 PDF，请在打印对话框中选择"另存为PDF"...', key: 'pdfExport', duration: 0 });
    
    try {
      // HTML转义
      const esc = (str) => {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      };
      
      // 构建完整的HTML页面
      let wordsHTML = '';
      let phrasesHTML = '';
      let grammarHTML = '';
      
      // === 单词部分 ===
      if (exportOptions.includeVocabulary && wordsData.length > 0) {
        let rows = '';
        wordsData.forEach((item, i) => {
          const word = esc(item.word || item.content || item.text || '');
          const phonetic = item.phonetic ? formatPhonetic(item.phonetic) : '';
          const pos = item.pos || '';
          const meaning = esc(item.meaning || '-');
          const example = esc(item.example || '-');
          
          rows += `
            <tr class="${i % 2 === 0 ? 'row-even' : 'row-odd'}">
              <td class="col-no">${i + 1}</td>
              <td class="col-word">
                <span class="word-text">${word}</span>
                ${phonetic ? `<span class="phonetic">${esc(phonetic)}</span>` : ''}
              </td>
              <td class="col-meaning">
                ${pos ? `<span class="pos-tag">${esc(pos)}</span>` : ''}
                <span class="meaning-text">${meaning}</span>
              </td>
              <td class="col-example">${example}</td>
            </tr>`;
        });
        
        wordsHTML = `
          <div class="section-header">
            <span>📚 单词部分</span>
            <span>共 ${wordsData.length} 项</span>
          </div>
          <table class="data-table">
            <thead><tr>
              <th class="col-no">序号</th>
              <th class="col-word">单词</th>
              <th class="col-meaning">含义</th>
              <th class="col-example">例句</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>`;
      }
      
      // === 短语部分 ===
      if (exportOptions.includeVocabulary && phrasesData.length > 0) {
        let rows = '';
        phrasesData.forEach((item, i) => {
          const phrase = esc(item.phrase || item.pattern || item.content || '');
          const meaning = esc(item.meaning || '-');
          const example = esc(item.example || '-');
          
          rows += `
            <tr class="${i % 2 === 0 ? 'row-even' : 'row-odd'}">
              <td class="col-no">${i + 1}</td>
              <td class="col-word"><span class="word-text">${phrase}</span></td>
              <td class="col-meaning"><span class="meaning-text">${meaning}</span></td>
              <td class="col-example">${example}</td>
            </tr>`;
        });
        
        phrasesHTML = `
          <div class="section-header">
            <span>📝 短语和句型部分</span>
            <span>共 ${phrasesData.length} 项</span>
          </div>
          <table class="data-table">
            <thead><tr>
              <th class="col-no">序号</th>
              <th class="col-word">短语/句型</th>
              <th class="col-meaning">含义</th>
              <th class="col-example">例句</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>`;
      }
      
      // === 语法部分 ===
      if (exportOptions.includeGrammar && grammarData.length > 0) {
        let cards = '';
        grammarData.forEach((item, i) => {
          const usageText = item.usage ? (Array.isArray(item.usage) ? item.usage.join('; ') : item.usage) : '';
          const examplesText = item.examples ? (Array.isArray(item.examples) ? item.examples.join(' / ') : item.examples) : '';
          
          cards += `
            <div class="grammar-card">
              <div class="grammar-title">${i + 1}. ${esc(item.title || '')}</div>
              ${item.definition ? `<div class="grammar-row"><span class="g-label">📝 定义：</span><span class="g-content">${esc(item.definition)}</span></div>` : ''}
              ${item.structure ? `<div class="grammar-row"><span class="g-label">🏗️ 结构：</span><span class="g-content">${esc(item.structure)}</span></div>` : ''}
              ${usageText ? `<div class="grammar-row"><span class="g-label">💡 用法：</span><span class="g-content">${esc(usageText)}</span></div>` : ''}
              ${examplesText ? `<div class="grammar-row"><span class="g-label">📌 例句：</span><span class="g-content">${esc(examplesText)}</span></div>` : ''}
            </div>`;
        });
        
        grammarHTML = `
          <div class="section-header">
            <span>📖 语法部分</span>
            <span>共 ${grammarData.length} 项</span>
          </div>
          ${cards}`;
      }
      
      const fullHTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${esc(fileName)}</title>
<style>
  /* ========== 基础重置 ========== */
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
  
  body {
    font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "WenQuanYi Micro Hei", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #1f2937;
    background: #fff;
    line-height: 1.65;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .page-container {
    max-width: 750px;
    margin: 0 auto;
    padding: 32px 24px;
  }

  /* ========== 顶部标题区 ========== */
  .report-header {
    text-align: center;
    padding-bottom: 20px;
    margin-bottom: 28px;
    border-bottom: 3px solid #6366f1;
  }
  .report-header h1 {
    font-size: 26px;
    font-weight: 700;
    color: #111827;
    letter-spacing: 1px;
    margin-bottom: 8px;
  }
  .report-header .sub {
    font-size: 13px;
    color: #9ca3af;
  }

  /* ========== 章节标题 ========== */
  .section-header {
    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
    color: #fff;
    padding: 10px 18px;
    font-size: 15px;
    font-weight: 700;
    border-radius: 6px;
    margin: 32px 0 14px 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    page-break-after: avoid;
  }

  /* ========== 数据表格 ========== */
  .data-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 24px;
    font-size: 12.5px;
  }
  .data-table thead tr {
    background: #f1f5f9;
  }
  .data-table th {
    padding: 9px 10px;
    text-align: left;
    font-weight: 600;
    font-size: 12px;
    color: #475569;
    border-bottom: 2px solid #cbd5e1;
    white-space: nowrap;
  }
  .data-table td {
    padding: 8px 10px;
    border-bottom: 1px solid #e5e7eb;
    vertical-align: top;
    line-height: 1.55;
  }
  .row-even { background: #fff; }
  .row-odd  { background: #f8fafc; }

  /* 列宽控制 */
  .col-no      { width: 40px; text-align: center; color: #94a3b8; font-size: 12px; }
  .col-word    { width: 28%; }
  .col-meaning { width: 30%; }
  .col-example { width: auto; color: #64748b; font-style: italic; font-size: 12px; }

  /* 单词文字 */
  .word-text {
    font-weight: 600;
    font-size: 13.5px;
    color: #1e293b;
    margin-right: 6px;
  }
  /* 音标 */
  .phonetic {
    display: inline-block;
    font-family: Consolas, "Courier New", monospace;
    font-size: 11px;
    color: #6366f1;
    background: #eef2ff;
    padding: 1px 7px;
    border-radius: 3px;
    border: 1px solid #c7d2fe;
    vertical-align: middle;
    margin-top: -1px;
  }
  /* 词性标签 */
  .pos-tag {
    display: inline-block;
    font-size: 10.5px;
    font-weight: 600;
    color: #059669;
    background: #d1fae5;
    padding: 1px 6px;
    border-radius: 3px;
    border: 1px solid #a7f3d0;
    margin-right: 5px;
    vertical-align: middle;
  }
  .meaning-text {
    font-size: 12.5px;
    color: #1f2937;
  }

  /* ========== 语法卡片 ========== */
  .grammar-card {
    border: 1px solid #e2e8f0;
    border-left: 4px solid #8b5cf6;
    border-radius: 6px;
    padding: 14px 16px;
    margin-bottom: 12px;
    background: #fefefe;
    page-break-inside: avoid;
  }
  .grammar-title {
    font-size: 15px;
    font-weight: 700;
    color: #1e293b;
    margin-bottom: 8px;
    padding-bottom: 6px;
    border-bottom: 1px dashed #e5e7eb;
  }
  .grammar-row {
    margin: 5px 0;
    font-size: 12.5px;
    line-height: 1.65;
  }
  .g-label {
    color: #6b7280;
    font-weight: 500;
  }
  .g-content {
    color: #1f2937;
  }

  /* ========== 页脚 ========== */
  .page-footer {
    text-align: center;
    margin-top: 40px;
    padding-top: 16px;
    border-top: 1px solid #e5e7eb;
    font-size: 11px;
    color: #9ca3af;
  }

  /* ========== 打印工具栏 ========== */
  .print-toolbar {
    position: fixed;
    top: 0; left: 0; right: 0;
    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
    color: #fff;
    padding: 12px 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    z-index: 9999;
    box-shadow: 0 2px 12px rgba(0,0,0,0.15);
  }
  .print-toolbar .tips {
    font-size: 13px;
    opacity: 0.9;
  }
  .print-toolbar button {
    background: #fff;
    color: #6366f1;
    border: none;
    padding: 8px 24px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }
  .print-toolbar button:hover {
    background: #eef2ff;
    transform: scale(1.02);
  }

  /* ========== 打印样式 ========== */
  @media print {
    .print-toolbar { display: none !important; }
    body { padding: 0; margin: 0; }
    .page-container { max-width: none; padding: 0; margin: 0; }
    
    @page {
      size: A4;
      margin: 15mm 12mm;
    }

    .data-table tr {
      page-break-inside: avoid;
    }
    .section-header {
      page-break-after: avoid;
    }
    .grammar-card {
      page-break-inside: avoid;
    }
  }
</style>
</head>
<body>

<div class="print-toolbar">
  <div>
    <div style="font-weight:700;font-size:15px;">📄 PDF 导出预览</div>
    <div class="tips">请在打印对话框中：目标选择「另存为PDF」，勾选「背景图形」，边距选「默认」</div>
  </div>
  <button onclick="window.print()">🖨️ 保存为 PDF</button>
</div>

<div class="page-container" style="margin-top: 64px;">

  <div class="report-header">
    <h1>${esc(fileName)}</h1>
    <div class="sub">生成时间：${new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
  </div>

  ${wordsHTML}
  ${phrasesHTML}
  ${grammarHTML}

  <div class="page-footer">
    — 报告结束 —
  </div>

</div>

</body>
</html>`;

      // 在新窗口中打开
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        message.error({ content: '弹窗被拦截，请允许弹窗后重试', key: 'pdfExport' });
        setExporting(false);
        return;
      }
      
      printWindow.document.write(fullHTML);
      printWindow.document.close();
      
      message.success({ content: 'PDF预览已打开，点击右上角「保存为PDF」按钮即可导出', key: 'pdfExport', duration: 5 });
      
    } catch (error) {
      console.error('❌ PDF导出失败:', error);
      message.error({ content: `PDF 导出失败: ${error.message}`, key: 'pdfExport' });
    } finally {
      setExporting(false);
    }
  };
  
  // HTML转义辅助函数
  const escapeHtml = (str) => {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  // HTML 导出
  const exportToHTML = () => {
    try {
      setExporting(true);
      message.loading({ content: '正在生成 HTML...', key: 'export', duration: 0 });

      const wordsData = getWordsData();
      const phrasesData = getPhrasesData();
      const vocabularyData = [...wordsData, ...phrasesData]; // 为了兼容原有导出逻辑
      const grammarData = data.grammar || [];

      // 🔧 F6修复：HTML实体转义，防止XSS
      const esc = (str) => {
        if (!str) return '';
        return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      };

      let html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(exportOptions.fileName)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: #fafaf9;
      padding: 40px 20px;
      line-height: 1.6;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      padding: 40px;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    h1 {
      font-size: 28px;
      color: #1a1a1a;
      margin-bottom: 32px;
      padding-bottom: 16px;
      border-bottom: 3px solid #3b82f6;
    }
    h2 {
      font-size: 22px;
      color: #1a1a1a;
      margin: 32px 0 16px;
      padding-left: 12px;
      border-left: 4px solid #3b82f6;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      background: white;
    }
    th {
      background: #f5f5f7;
      color: #1d1d1f;
      font-weight: 600;
      padding: 12px;
      text-align: left;
      border-bottom: 2px solid #e5e5e7;
    }
    td {
      padding: 12px;
      border-bottom: 1px solid #f5f5f7;
    }
    tr:nth-child(even) { background: #fafafa; }
    tr:hover { background: #f0f9ff; }
    .grammar-card {
      background: white;
      border: 1px solid #e5e7eb;
      border-left: 5px solid #8b5cf6;
      border-radius: 8px;
      padding: 20px;
      margin: 16px 0;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .grammar-title {
      font-size: 18px;
      font-weight: 600;
      color: #1a1a1a;
      margin-bottom: 12px;
    }
    .grammar-field {
      margin: 8px 0;
      padding: 8px 0;
    }
    .field-label {
      color: #6b7280;
      font-weight: 500;
      margin-right: 8px;
    }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      margin-left: 8px;
    }
    .badge-category {
      background: #ede9fe;
      color: #6d28d9;
    }
    .sub-topic {
      background: #f9fafb;
      padding: 16px;
      margin: 12px 0;
      border-radius: 6px;
      border-left: 3px solid #d1d5db;
    }
    .sub-topic-title {
      font-weight: 600;
      color: #374151;
      margin-bottom: 8px;
    }
    @media print {
      body { background: white; padding: 0; }
      .container { box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>${exportOptions.fileName}</h1>
`;

      // 添加词汇部分
      if (exportOptions.includeVocabulary && vocabularyData.length > 0) {
        html += `
    <h2>📚 词汇部分 (共 ${vocabularyData.length} 项)</h2>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>类型</th>
          <th>内容</th>
          <th>词性</th>
          <th>含义</th>
          <th>例句</th>
        </tr>
      </thead>
      <tbody>
`;
        vocabularyData.forEach((item, index) => {
          html += `
        <tr>
          <td>${index + 1}</td>
          <td>${esc(item.type)}</td>
          <td><strong>${esc(item.content)}</strong> ${esc(item.phonetic)}</td>
          <td>${esc(item.partOfSpeech)}</td>
          <td>${esc(item.meaning)}</td>
          <td><em>${esc(item.example)}</em></td>
        </tr>
`;
        });
        html += `
      </tbody>
    </table>
`;
      }

      // 添加语法部分
      if (exportOptions.includeGrammar && grammarData.length > 0) {
        html += `
    <h2>📖 语法部分 (共 ${grammarData.length} 项)</h2>
`;
        grammarData.forEach((grammar) => {
          const subTopics = grammar.sub_topics || [];
          html += `
    <div class="grammar-card">
      <div class="grammar-title">
        ${esc(grammar.title)}
        ${grammar.category ? `<span class="badge badge-category">${esc(grammar.category)}</span>` : ''}
      </div>
      ${grammar.definition ? `<div class="grammar-field"><span class="field-label">定义：</span>${esc(grammar.definition)}</div>` : ''}
      ${grammar.structure ? `<div class="grammar-field"><span class="field-label">结构：</span>${esc(grammar.structure)}</div>` : ''}
      ${grammar.usage ? `<div class="grammar-field"><span class="field-label">用法：</span>${esc(Array.isArray(grammar.usage) ? grammar.usage.join('; ') : grammar.usage)}</div>` : ''}
      ${grammar.examples ? `<div class="grammar-field"><span class="field-label">例句：</span><em>${esc(Array.isArray(grammar.examples) ? grammar.examples.join(' / ') : grammar.examples)}</em></div>` : ''}
`;
          
          // 添加子话题
          if (subTopics.length > 0) {
            html += `<div style="margin-top: 16px;">`;
            subTopics.forEach((subTopic, idx) => {
              html += `
      <div class="sub-topic">
        <div class="sub-topic-title">${idx + 1}. ${esc(subTopic.title)}</div>
        ${subTopic.definition ? `<div>${esc(subTopic.definition)}</div>` : ''}
        ${subTopic.structure ? `<div><span class="field-label">结构：</span>${esc(subTopic.structure)}</div>` : ''}
        ${subTopic.examples ? `<div><span class="field-label">例句：</span><em>${esc(Array.isArray(subTopic.examples) ? subTopic.examples.join(' / ') : subTopic.examples)}</em></div>` : ''}
      </div>
`;
            });
            html += `</div>`;
          }
          
          html += `
    </div>
`;
        });
      }

      html += `
  </div>
</body>
</html>
`;

      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      saveAs(blob, `${exportOptions.fileName}.html`);
      message.success({ content: 'HTML 导出成功！', key: 'export' });
    } catch (error) {
      console.error('HTML导出错误:', error);
      message.error({ content: `HTML 导出失败: ${error.message}`, key: 'export' });
    } finally {
      setExporting(false);
    }
  };

  // Word 导出
  const exportToWord = async () => {
    try {
      setExporting(true);
      message.loading({ content: '正在生成 Word 文档...', key: 'export', duration: 0 });

      const wordsData = getWordsData();
      const phrasesData = getPhrasesData();
      const vocabularyData = [...wordsData, ...phrasesData]; // 为了兼容原有导出逻辑
      const grammarData = data.grammar || [];
      const sections = [];

      // 标题
      sections.push(
        new Paragraph({
          text: exportOptions.fileName,
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 400 }
        })
      );

      // 词汇部分
      if (exportOptions.includeVocabulary && vocabularyData.length > 0) {
        sections.push(
          new Paragraph({
            text: `📚 词汇部分 (共 ${vocabularyData.length} 项)`,
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 }
          })
        );

        // 创建词汇表格
        const tableRows = [
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph({ text: '#', bold: true })] }),
              new TableCell({ children: [new Paragraph({ text: '类型', bold: true })] }),
              new TableCell({ children: [new Paragraph({ text: '内容', bold: true })] }),
              new TableCell({ children: [new Paragraph({ text: '词性', bold: true })] }),
              new TableCell({ children: [new Paragraph({ text: '含义', bold: true })] }),
              new TableCell({ children: [new Paragraph({ text: '例句', bold: true })] })
            ]
          })
        ];

        vocabularyData.forEach((item, index) => {
          tableRows.push(
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph((index + 1).toString())] }),
                new TableCell({ children: [new Paragraph(item.type)] }),
                new TableCell({ children: [new Paragraph(`${item.content} ${item.phonetic || ''}`)] }),
                new TableCell({ children: [new Paragraph(item.partOfSpeech || '')] }),
                new TableCell({ children: [new Paragraph(item.meaning || '')] }),
                new TableCell({ children: [new Paragraph(item.example || '')] })
              ]
            })
          );
        });

        sections.push(
          new DocxTable({
            rows: tableRows,
            width: { size: 100, type: WidthType.PERCENTAGE }
          })
        );
      }

      // 语法部分
      if (exportOptions.includeGrammar && grammarData.length > 0) {
        sections.push(
          new Paragraph({
            text: `📖 语法部分 (共 ${grammarData.length} 项)`,
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 600, after: 200 }
          })
        );

        grammarData.forEach((grammar, index) => {
          const subTopics = grammar.sub_topics || [];
          
          // 语法标题
          sections.push(
            new Paragraph({
              text: `${index + 1}. ${grammar.title}`,
              heading: HeadingLevel.HEADING_3,
              spacing: { before: 300, after: 100 }
            })
          );

          // 语法内容
          if (grammar.category) {
            sections.push(new Paragraph({ text: `分类：${grammar.category}`, spacing: { after: 100 } }));
          }
          if (grammar.definition) {
            sections.push(new Paragraph({ text: `定义：${grammar.definition}`, spacing: { after: 100 } }));
          }
          if (grammar.structure) {
            sections.push(new Paragraph({ text: `结构：${grammar.structure}`, spacing: { after: 100 } }));
          }
          if (grammar.usage) {
            const usageText = Array.isArray(grammar.usage) ? grammar.usage.join('; ') : grammar.usage;
            sections.push(new Paragraph({ text: `用法：${usageText}`, spacing: { after: 100 } }));
          }
          if (grammar.examples) {
            const examplesText = Array.isArray(grammar.examples) ? grammar.examples.join(' / ') : grammar.examples;
            sections.push(new Paragraph({ text: `例句：${examplesText}`, spacing: { after: 100 } }));
          }

          // 子话题
          if (subTopics.length > 0) {
            sections.push(
              new Paragraph({
                text: `子话题 (${subTopics.length}个)：`,
                spacing: { before: 200, after: 100 },
                bold: true
              })
            );

            subTopics.forEach((subTopic, subIdx) => {
              sections.push(
                new Paragraph({
                  text: `${subIdx + 1}. ${subTopic.title}`,
                  spacing: { before: 100, after: 50 },
                  indent: { left: 400 }
                })
              );
              
              if (subTopic.definition) {
                sections.push(
                  new Paragraph({
                    text: subTopic.definition,
                    spacing: { after: 50 },
                    indent: { left: 800 }
                  })
                );
              }
              
              if (subTopic.structure) {
                sections.push(
                  new Paragraph({
                    text: `结构：${subTopic.structure}`,
                    spacing: { after: 50 },
                    indent: { left: 800 }
                  })
                );
              }
              
              if (subTopic.examples) {
                const examplesText = Array.isArray(subTopic.examples) ? subTopic.examples.join(' / ') : subTopic.examples;
                sections.push(
                  new Paragraph({
                    text: `例句：${examplesText}`,
                    spacing: { after: 100 },
                    indent: { left: 800 }
                  })
                );
              }
            });
          }
        });
      }

      const doc = new Document({
        sections: [{
          properties: {},
          children: sections
        }]
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, `${exportOptions.fileName}.docx`);
      message.success({ content: 'Word 文档导出成功！', key: 'export' });
    } catch (error) {
      console.error('Word导出错误:', error);
      message.error({ content: `Word 导出失败: ${error.message}`, key: 'export' });
    } finally {
      setExporting(false);
    }
  };

  // 打开导出设置对话框
  const showExportModal = (type) => {
    setExportType(type);
    setExportModalVisible(true);
  };

  // 执行导出
  const handleExport = async () => {
    setExportModalVisible(false);
    
    switch (exportType) {
      case 'pdf':
        await exportToPDF();
        break;
      case 'html':
        exportToHTML();
        break;
      case 'word':
        await exportToWord();
        break;
      default:
        break;
    }
  };

  // 词汇表格列定义
  // 单词表格列定义
  const wordColumns = [
    {
      title: '序号',
      width: 60,
      align: 'center',
      render: (_, __, index) => (
        <Text style={{ fontSize: '14px', color: '#6b7280' }}>
          {index + 1}
        </Text>
      )
    },
    {
      title: '单词',
      width: 240,
      render: (_, record) => {
        // 🔧 调试：查看record结构
        if (!record.word) {
          console.log('⚠️ 单词字段为空，record内容:', record);
        }
        
        return (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center',
            gap: '12px'
          }}>
            {/* 单词（固定宽度，确保对齐） */}
            <div style={{
              minWidth: '120px',
              maxWidth: '120px'
            }}>
              <Text style={{ 
                fontSize: '16px', 
                fontWeight: 600, 
                color: '#1a1a1a',
                letterSpacing: '0.3px',
                wordBreak: 'break-word'
              }}>
                {record.word || record.content || ''}
              </Text>
            </div>
            
            {/* 音标标签（和词性标签风格一致） */}
            {record.phonetic && (
              <span style={{ 
                color: '#4f46e5',
                fontSize: '12px',
                fontFamily: 'Consolas, "Courier New", monospace',
                backgroundColor: '#eef2ff',
                padding: '3px 10px',
                borderRadius: '4px',
                border: '1px solid #c7d2fe',
                display: 'inline-block',
                whiteSpace: 'nowrap',
                fontWeight: 500
              }}>
                {formatPhonetic(record.phonetic)}
              </span>
            )}
          </div>
        );
      }
    },
    {
      title: '含义',
      dataIndex: 'meaning',
      width: 300,
      render: (meaning, record) => (
        <div style={{ 
          display: 'flex', 
          alignItems: 'center',
          gap: '10px',
          flexWrap: 'wrap'
        }}>
          {/* 词性标签（横向在前） */}
          {record.pos && (
            <span style={{ 
              color: '#059669',
              fontSize: '12px',
              fontWeight: 600,
              backgroundColor: '#d1fae5',
              padding: '2px 8px',
              borderRadius: '4px',
              border: '1px solid #a7f3d0',
              display: 'inline-block',
              flexShrink: 0
            }}>
              {record.pos}
            </span>
          )}
          
          {/* 含义（横向紧跟） */}
          <Text style={{ 
            fontSize: '14px', 
            color: '#1a1a1a',
            flex: 1
          }}>
            {meaning}
          </Text>
        </div>
      )
    },
    {
      title: '例句',
      dataIndex: 'example',
      width: 300,
      render: (example) => example && (
        <Text style={{ 
          fontSize: '13px', 
          color: '#6b7280',
          fontStyle: 'italic'
        }}>
          {example}
        </Text>
      )
    },
    {
      title: '操作',
      width: 180,
      align: 'center',
      fixed: 'right',
      className: 'action-buttons',
      render: (_, record) => (
        <Space size="middle">
          <Button
            type="text"
            size="small"
            icon={<CheckOutlined />}
            onClick={() => handleConfirm(record)}
            style={{ color: '#10b981', minWidth: '75px' }}
          >
            已学会
          </Button>
          <Button
            type="text"
            size="small"
            danger
            icon={<CloseOutlined />}
            onClick={() => handleReject(record)}
            style={{ minWidth: '85px' }}
          >
            识别错误
          </Button>
        </Space>
      )
    }
  ];

  // 短语表格列定义
  const phraseColumns = [
    {
      title: '序号',
      width: 60,
      align: 'center',
      render: (_, __, index) => (
        <Text style={{ fontSize: '14px', color: '#6b7280' }}>
          {index + 1}
        </Text>
      )
    },
    {
      title: '短语/句型',
      width: 300,
      render: (_, record) => {
        // 🔧 修复：使用 content 字段
        const content = record.content || record.phrase || record.pattern || '';
        
        // 调试空白内容
        if (!content) {
          console.log('⚠️ 短语/句型字段为空，record内容:', record);
        }
        
        return (
          <Text style={{ 
            fontSize: '16px', 
            fontWeight: 600, 
            color: '#1a1a1a',
            letterSpacing: '0.3px',
            wordBreak: 'break-word'
          }}>
            {content}
          </Text>
        );
      }
    },
    {
      title: '含义',
      dataIndex: 'meaning',
      width: 350,
      render: (meaning) => (
        <Text style={{ 
          fontSize: '14px', 
          color: '#1a1a1a'
        }}>
          {meaning}
        </Text>
      )
    },
    {
      title: '例句',
      dataIndex: 'example',
      width: 400,
      render: (example) => example && (
        <Text style={{ 
          fontSize: '13px', 
          color: '#6b7280',
          fontStyle: 'italic'
        }}>
          {example}
        </Text>
      )
    },
    {
      title: '操作',
      width: 180,
      align: 'center',
      fixed: 'right',
      className: 'action-buttons',
      render: (_, record) => (
        <Space size="middle">
          <Button
            type="text"
            size="small"
            icon={<CheckOutlined />}
            onClick={() => handleConfirm(record)}
            style={{ color: '#10b981', minWidth: '75px' }}
          >
            已学会
          </Button>
          <Button
            type="text"
            size="small"
            danger
            icon={<CloseOutlined />}
            onClick={() => handleReject(record)}
            style={{ minWidth: '85px' }}
          >
            识别错误
          </Button>
        </Space>
      )
    }
  ];

  // 渲染语法卡片
  const renderGrammarCard = (grammar, index) => {
    const subTopics = grammar.sub_topics || [];
    const hasSubTopics = subTopics.length > 0;
    
    return (
      <Card
        key={grammar.id}
        className="grammar-card"
        bodyStyle={{ padding: '20px' }}
      >
        {/* 标题行 */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'flex-start',
          marginBottom: '16px'
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px',
              flexWrap: 'wrap',
              marginBottom: '8px'
            }}>
              <div className="grammar-number">{index + 1}</div>
              <Text style={{ 
                fontSize: '18px', 
                fontWeight: 600, 
                color: '#1a1a1a' 
              }}>
                {grammar.title}
              </Text>
              
              {grammar.category && (
                <span className="category-badge">
                  {grammar.category}
                </span>
              )}
              
              {hasSubTopics && (
                <span className="subtopic-badge">
                  📚 {subTopics.length} 个子话题
                </span>
              )}
            </div>
            
            {/* 定义/说明 */}
            {grammar.definition && (
              <div className="grammar-field">
                <span className="field-label">定义：</span>
                <span className="field-content">{grammar.definition}</span>
              </div>
            )}
            
            {/* 结构 */}
            {grammar.structure && (
              <div className="grammar-field">
                <span className="field-label">结构：</span>
                <span className="field-content highlight-structure">{grammar.structure}</span>
              </div>
            )}
            
            {/* 用法 */}
            {grammar.usage && (
              <div className="grammar-field">
                <span className="field-label">用法：</span>
                <span className="field-content">
                  {Array.isArray(grammar.usage) ? grammar.usage.join('; ') : grammar.usage}
                </span>
              </div>
            )}
            
            {/* 例句 */}
            {grammar.examples && (
              <div className="grammar-field">
                <span className="field-label">例句：</span>
                <span className="field-content example-text">
                  {Array.isArray(grammar.examples) 
                    ? grammar.examples.join(' / ')
                    : grammar.examples}
                </span>
              </div>
            )}
            
            {/* 常见错误 */}
            {grammar.mistakes && Array.isArray(grammar.mistakes) && grammar.mistakes.length > 0 && (
              <div className="grammar-field">
                <span className="field-label">常见错误：</span>
                <div style={{ marginTop: '6px' }}>
                  {grammar.mistakes.map((mistake, idx) => (
                    <div key={idx} style={{ marginBottom: '4px', paddingLeft: '12px' }}>
                      {typeof mistake === 'object' && mistake.wrong && mistake.correct ? (
                        <span>
                          <span className="mistake-wrong">❌ {mistake.wrong}</span>
                          {' → '}
                          <span className="mistake-correct">✅ {mistake.correct}</span>
                          {mistake.explanation && (
                            <span style={{ color: '#6b7280', marginLeft: '8px' }}>
                              ({mistake.explanation})
                            </span>
                          )}
                        </span>
                      ) : (
                        <span>{typeof mistake === 'string' ? mistake : JSON.stringify(mistake)}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          {/* 操作按钮 */}
          <Space direction="vertical" size="small" className="action-buttons" style={{ marginLeft: '16px' }}>
            <Button
              type="text"
              size="small"
              icon={<CheckOutlined />}
              onClick={() => handleGrammarConfirm(grammar)}
              style={{ color: '#10b981', padding: '4px 8px', minWidth: '80px' }}
            >
              已学会
            </Button>
            <Button
              type="text"
              size="small"
              danger
              icon={<CloseOutlined />}
              onClick={() => handleGrammarReject(grammar)}
              style={{ padding: '4px 8px', minWidth: '80px' }}
            >
              识别错误
            </Button>
          </Space>
        </div>
        
        {/* 子话题区域 */}
        {hasSubTopics && (
          <div className="subtopics-container">
            {subTopics.map((subTopic, subIdx) => (
              <div
                key={subIdx}
                className="subtopic-item"
              >
                {/* 子话题标题 */}
                <div className="subtopic-title">
                  <span style={{ color: '#6b7280' }}>{subIdx + 1}.</span>
                  <span style={{ flex: 1 }}>{subTopic.title}</span>
                </div>
                
                {/* 子话题定义 */}
                {subTopic.definition && (
                  <div className="subtopic-field">
                    {subTopic.definition}
                  </div>
                )}
                
                {/* 子话题结构 */}
                {subTopic.structure && (
                  <div className="subtopic-field">
                    <Text style={{ color: '#9ca3af', fontWeight: 500 }}>结构：</Text>
                    {subTopic.structure}
                  </div>
                )}
                
                {/* 子话题用法 */}
                {subTopic.usage && Array.isArray(subTopic.usage) && subTopic.usage.length > 0 && (
                  <div className="subtopic-field">
                    <Text style={{ color: '#9ca3af', fontWeight: 500 }}>用法：</Text>
                    {subTopic.usage.join('; ')}
                  </div>
                )}
                
                {/* 子话题例句 */}
                {subTopic.examples && (
                  <div className="subtopic-field example-text">
                    <Text style={{ color: '#9ca3af', fontWeight: 500 }}>例句：</Text>
                    {Array.isArray(subTopic.examples) 
                      ? subTopic.examples.join(' / ')
                      : subTopic.examples}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    );
  };

  // 🔧 F3修复：使用useMemo缓存计算结果，避免每次render重新计算
  const wordsData = useMemo(() => getWordsData(), [data.words, hiddenItems]);
  const phrasesData = useMemo(() => getPhrasesData(), [data.phrases, data.patterns, hiddenItems]);
  // 🔧 过滤掉已隐藏的语法项
  const grammarData = useMemo(() => {
    return (data.grammar || []).filter(item => {
      const grammarKey = `grammar-${item.id}`;
      return !hiddenItems.has(grammarKey);
    });
  }, [data.grammar, hiddenItems]);

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        minHeight: '400px',
        background: '#fafaf9'
      }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="report-viewer-container no-print-bg">
      <div ref={reportContentRef} className="report-content">
        {/* 顶部工具栏 */}
        <div className="toolbar">
          <div className="toolbar-left">
            <Title level={2} style={{ margin: 0, fontSize: '24px', color: '#1a1a1a' }}>
              学习报告
            </Title>
          </div>
          <div className="toolbar-right no-print">
            <Space size="middle">
              <Button
                icon={<SettingOutlined />}
                onClick={() => {
                  console.clear();
                  console.log('========== 🔍 手动诊断报告 ==========');
                  const words = getWordsData();
                  const phrases = getPhrasesData();
                  const table = document.querySelector('.ant-table');
                  const plugins = document.querySelectorAll('iframe, [class*="extension"], [class*="plugin"]');
                  
                  console.log('📊 数据:', {
                    单词: words.length,
                    短语和句型: phrases.length,
                    语法: data.grammar?.length || 0
                  });
                  
                  if (table) {
                    const headers = table.querySelectorAll('thead th');
                    const rows = table.querySelectorAll('tbody tr');
                    console.log('📋 表格:', {
                      列数: headers.length,
                      行数: rows.length,
                      宽度: table.offsetWidth + 'px'
                    });
                    
                    console.log('📐 各列宽度:');
                    headers.forEach((th, i) => {
                      console.log(`  列${i+1} (${th.textContent.trim()}): ${th.offsetWidth}px`);
                    });
                  }
                  
                  console.log('🔌 插件检测:', plugins.length + '个');
                  if (plugins.length > 0) {
                    console.warn('⚠️ 建议使用无痕模式（Ctrl+Shift+N）');
                  }
                  
                  console.log('========================================');
                  message.success('诊断信息已输出到控制台（按F12查看）');
                }}
                className="export-btn"
                style={{ background: 'rgba(255, 255, 255, 0.15)' }}
              >
                诊断
              </Button>
              <Button
                icon={<FilePdfOutlined />}
                onClick={() => showExportModal('pdf')}
                loading={exporting}
                className="export-btn export-btn-pdf"
              >
                导出 PDF
              </Button>
              <Button
                icon={<FileTextOutlined />}
                onClick={() => showExportModal('html')}
                loading={exporting}
                className="export-btn export-btn-html"
              >
                导出 HTML
              </Button>
              <Button
                icon={<FileWordOutlined />}
                onClick={() => showExportModal('word')}
                loading={exporting}
                className="export-btn export-btn-word"
              >
                导出 Word
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={loadData}
                className="refresh-btn"
              >
                刷新
              </Button>
            </Space>
          </div>
        </div>

        {/* 单词部分 - 表格展示 */}
        <div className="section vocabulary-section">
          <div className="section-header">
            <Title level={3} className="section-title vocabulary-title">
              📚 单词部分
            </Title>
            <Text className="section-count">
              共 {wordsData.length} 项
            </Text>
          </div>

          {wordsData.length > 0 ? (
            <Table
              columns={wordColumns}
              dataSource={wordsData}
              pagination={false}
              scroll={{ x: 1200 }}
              className="vocabulary-table"
            />
          ) : (
            <Empty 
              description="暂无单词数据"
              style={{ padding: '48px 0' }}
            />
          )}
        </div>

        {/* 短语部分 - 表格展示 */}
        <div className="section vocabulary-section">
          <div className="section-header">
            <Title level={3} className="section-title vocabulary-title">
              📝 短语和句型部分
            </Title>
            <Text className="section-count">
              共 {phrasesData.length} 项
            </Text>
          </div>

          {phrasesData.length > 0 ? (
            <Table
              columns={phraseColumns}
              dataSource={phrasesData}
              pagination={false}
              scroll={{ x: 1200 }}
              className="vocabulary-table"
            />
          ) : (
            <Empty 
              description="暂无短语数据"
              style={{ padding: '48px 0' }}
            />
          )}
        </div>

        {/* 语法部分 - 卡片展示 */}
        <div className="section grammar-section">
          <div className="section-header">
            <Title level={3} className="section-title grammar-title">
              📖 语法部分
            </Title>
            <Text className="section-count">
              共 {grammarData.length} 项
            </Text>
          </div>

          {grammarData.length > 0 ? (
            <div className="grammar-cards">
              {grammarData.map((grammar, index) => renderGrammarCard(grammar, index))}
            </div>
          ) : (
            <Empty 
              description="暂无语法数据"
              style={{ padding: '48px 0' }}
            />
          )}
        </div>
      </div>

      {/* 导出设置对话框 */}
      <Modal
        title={
          <Space>
            <SettingOutlined />
            导出设置
          </Space>
        }
        open={exportModalVisible}
        onOk={handleExport}
        onCancel={() => setExportModalVisible(false)}
        okText="确认导出"
        cancelText="取消"
        width={500}
      >
        <div style={{ padding: '16px 0' }}>
          <div style={{ marginBottom: '16px' }}>
            <Text strong>文件名：</Text>
            <Input
              value={exportOptions.fileName}
              onChange={(e) => setExportOptions({ ...exportOptions, fileName: e.target.value })}
              placeholder="请输入文件名"
              style={{ marginTop: '8px' }}
            />
          </div>
          
          <div style={{ marginBottom: '16px' }}>
            <Text strong>导出内容：</Text>
            <div style={{ marginTop: '8px' }}>
              <Checkbox
                checked={exportOptions.includeVocabulary}
                onChange={(e) => setExportOptions({ ...exportOptions, includeVocabulary: e.target.checked })}
              >
                包含词汇部分
              </Checkbox>
              <br />
              <Checkbox
                checked={exportOptions.includeGrammar}
                onChange={(e) => setExportOptions({ ...exportOptions, includeGrammar: e.target.checked })}
                style={{ marginTop: '8px' }}
              >
                包含语法部分
              </Checkbox>
            </div>
          </div>

          <div style={{ 
            background: '#f0f9ff', 
            padding: '12px', 
            borderRadius: '6px',
            fontSize: '13px',
            color: '#1e40af'
          }}>
            💡 提示：导出为 {exportType === 'pdf' ? 'PDF' : exportType === 'html' ? 'HTML' : 'Word'} 格式
          </div>
        </div>
      </Modal>

      {/* 样式 */}
      <style jsx>{`
        .report-viewer-container {
          background: #fafaf9;
          min-height: 100vh;
          padding: 24px;
        }

        .report-content {
          max-width: 1400px;
          margin: 0 auto;
          background: white;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
          overflow: hidden;
        }

        .toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 24px 32px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-bottom: 1px solid #e5e7eb;
        }

        .toolbar-left h2 {
          color: white !important;
          margin: 0;
        }

        .toolbar-right {
          display: flex;
          gap: 12px;
        }

        .export-btn {
          border: 1px solid rgba(255, 255, 255, 0.3);
          background: rgba(255, 255, 255, 0.15);
          color: white;
          backdrop-filter: blur(10px);
          transition: all 0.3s ease;
        }

        .export-btn:hover {
          background: rgba(255, 255, 255, 0.25);
          border-color: white;
          color: white;
          transform: translateY(-2px);
        }

        .refresh-btn {
          background: white;
          color: #667eea;
          border: none;
          transition: all 0.3s ease;
        }

        .refresh-btn:hover {
          background: #f0f9ff;
          color: #667eea;
          transform: translateY(-2px);
        }

        .section {
          padding: 32px;
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }

        .section-title {
          margin: 0 !important;
          font-size: 20px !important;
          font-weight: 600 !important;
          padding-left: 12px;
          position: relative;
        }

        .vocabulary-title {
          color: #1a1a1a !important;
          border-left: 4px solid #3b82f6;
        }

        .grammar-title {
          color: #1a1a1a !important;
          border-left: 4px solid #8b5cf6;
        }

        .section-count {
          font-size: 14px;
          color: #6b7280;
          background: #f3f4f6;
          padding: 4px 12px;
          border-radius: 12px;
          font-weight: 500;
        }

        /* 词汇表格样式 */
        .vocabulary-table :global(.ant-table) {
          background: transparent;
        }

        .vocabulary-table :global(.ant-table-thead > tr > th) {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white !important;
          font-weight: 600;
          font-size: 13px;
          border: none;
          padding: 14px 16px;
        }

        .vocabulary-table :global(.ant-table-tbody > tr) {
          transition: all 0.2s ease;
        }

        .vocabulary-table :global(.ant-table-tbody > tr:nth-child(even)) {
          background: #fafafa;
        }

        .vocabulary-table :global(.ant-table-tbody > tr:hover) {
          background: #f0f9ff !important;
          transform: translateX(4px);
        }

        .vocabulary-table :global(.ant-table-tbody > tr > td) {
          border-bottom: 1px solid #f3f4f6;
          padding: 14px 16px;
        }

        .row-number {
          width: 28px;
          height: 28px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 600;
        }

        .type-badge {
          display: inline-block;
          padding: 4px 10px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
        }

        .type-单词 {
          background: #dbeafe;
          color: #1e40af;
        }

        .type-短语 {
          background: #fce7f3;
          color: #be185d;
        }

        .type-句型 {
          background: #d1fae5;
          color: #065f46;
        }

        /* 语法卡片样式 */
        .grammar-cards {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .grammar-card {
          border: 1px solid #e5e7eb;
          border-left: 5px solid #8b5cf6;
          border-radius: 10px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
          transition: all 0.3s ease;
          background: white;
        }

        .grammar-card:hover {
          box-shadow: 0 4px 12px rgba(139, 92, 246, 0.15);
          transform: translateY(-2px);
        }

        .grammar-number {
          width: 32px;
          height: 32px;
          background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          font-weight: 600;
        }

        .category-badge {
          background: #ede9fe;
          color: #6d28d9;
          font-size: 11px;
          font-weight: 500;
          padding: 4px 10px;
          border-radius: 4px;
        }

        .subtopic-badge {
          background: #d1fae5;
          color: #065f46;
          font-size: 11px;
          font-weight: 500;
          padding: 4px 10px;
          border-radius: 4px;
        }

        .grammar-field {
          margin: 10px 0;
          font-size: 14px;
          line-height: 1.6;
        }

        .field-label {
          color: #6b7280;
          font-weight: 500;
          margin-right: 6px;
        }

        .field-content {
          color: #1a1a1a;
        }

        .highlight-structure {
          background: #fef3c7;
          padding: 2px 6px;
          border-radius: 3px;
          font-family: 'Courier New', monospace;
          font-weight: 500;
        }

        .example-text {
          color: #6b7280;
          font-style: italic;
        }

        .mistake-wrong {
          color: #dc2626;
          background: #fee2e2;
          padding: 2px 6px;
          border-radius: 3px;
        }

        .mistake-correct {
          color: #059669;
          background: #d1fae5;
          padding: 2px 6px;
          border-radius: 3px;
        }

        .subtopics-container {
          margin-top: 20px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
        }

        .subtopic-item {
          padding: 16px 0;
          border-bottom: 1px solid #f3f4f6;
        }

        .subtopic-item:last-child {
          border-bottom: none;
        }

        .subtopic-title {
          font-weight: 600;
          color: #374151;
          margin-bottom: 10px;
          font-size: 15px;
          display: flex;
          align-items: flex-start;
          gap: 8px;
        }

        .subtopic-field {
          font-size: 13px;
          color: #4b5563;
          margin: 8px 0;
          margin-left: 24px;
          line-height: 1.6;
        }

        /* 🖨️ 打印样式优化 - 强制分页版 */
        @media print {
          /* ========== 基础设置 ========== */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
            box-sizing: border-box !important;
          }

          html, body {
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 210mm !important;
            height: auto !important;
          }

          @page {
            margin: 8mm;
            size: A4 portrait;
          }

          /* ========== 隐藏不需要的元素 ========== */
          aside,
          .toolbar-right,
          .no-print,
          .action-buttons,
          button,
          .ant-btn,
          iframe,
          embed,
          object,
          [class*="extension"],
          [class*="plugin"] {
            display: none !important;
          }

          /* ========== 容器优化 ========== */
          .no-print-bg,
          .report-viewer-container,
          .report-content {
            background: white !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            height: auto !important;
            overflow: visible !important;
          }

          .toolbar {
            background: white !important;
            background-image: none !important;
            border-bottom: 1px solid #e5e7eb !important;
            padding: 6px 8px !important;
          }

          .toolbar-left h2 {
            color: #1a1a1a !important;
            font-size: 14px !important;
          }

          .section {
            padding: 6px 4px !important;
            break-inside: auto !important;
            page-break-inside: auto !important;
          }

          .section-header {
            break-after: avoid !important;
            page-break-after: avoid !important;
          }

          /* ========== 表格优化 - 关键！ ========== */
          
          /* 移除Ant Design的虚拟滚动 */
          .ant-table-body {
            overflow: visible !important;
            max-height: none !important;
            height: auto !important;
          }

          .vocabulary-table,
          .ant-table-wrapper {
            width: 100% !important;
            max-width: 100% !important;
            overflow: visible !important;
            height: auto !important;
          }

          .ant-table,
          .ant-table-container,
          .ant-table-content {
            width: 100% !important;
            max-width: 100% !important;
            overflow: visible !important;
            height: auto !important;
          }

          /* 表格布局 */
          .ant-table table {
            width: 100% !important;
            table-layout: fixed !important;
            border-collapse: collapse !important;
          }

          /* 确保thead和tbody正常显示 */
          .ant-table-thead,
          .ant-table-tbody {
            display: table-row-group !important;
          }

          .ant-table-thead > tr,
          .ant-table-tbody > tr {
            display: table-row !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          /* 强制所有单元格显示 */
          .ant-table-thead > tr > th,
          .ant-table-tbody > tr > td {
            display: table-cell !important;
            visibility: visible !important;
            padding: 3px 2px !important;
            font-size: 8px !important;
            line-height: 1.2 !important;
            border: 1px solid #e5e7eb !important;
            word-break: break-word !important;
            overflow: visible !important;
          }

          /* 列宽分配 */
          .ant-table-thead > tr > th:nth-child(1),
          .ant-table-tbody > tr > td:nth-child(1) {
            width: 4% !important;
          }

          .ant-table-thead > tr > th:nth-child(2),
          .ant-table-tbody > tr > td:nth-child(2) {
            width: 7% !important;
          }

          .ant-table-thead > tr > th:nth-child(3),
          .ant-table-tbody > tr > td:nth-child(3) {
            width: 18% !important;
          }

          .ant-table-thead > tr > th:nth-child(4),
          .ant-table-tbody > tr > td:nth-child(4) {
            width: 7% !important;
          }

          .ant-table-thead > tr > th:nth-child(5),
          .ant-table-tbody > tr > td:nth-child(5) {
            width: 20% !important;
          }

          .ant-table-thead > tr > th:nth-child(6),
          .ant-table-tbody > tr > td:nth-child(6) {
            width: 44% !important;
          }

          /* 隐藏操作列 */
          .ant-table-thead > tr > th:nth-child(7),
          .ant-table-tbody > tr > td:nth-child(7) {
            display: none !important;
          }

          /* 取消固定列 */
          .ant-table-cell-fix-left,
          .ant-table-cell-fix-right {
            position: static !important;
          }

          /* 表头样式 */
          .vocabulary-table .ant-table-thead > tr > th {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
            color: white !important;
            font-weight: 600 !important;
          }

          /* 斑马纹 */
          .ant-table-tbody > tr:nth-child(even) {
            background: #fafafa !important;
          }

          /* ========== 强制分页控制 ========== */
          table {
            break-inside: auto !important;
            page-break-inside: auto !important;
          }

          thead {
            display: table-header-group !important;
          }

          tbody {
            display: table-row-group !important;
          }

          tr {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            break-after: auto !important;
            page-break-after: auto !important;
          }

          /* 每50行强制分页 */
          .ant-table-tbody > tr:nth-child(50n) {
            break-after: page !important;
            page-break-after: always !important;
          }

          /* ========== 语法卡片 ========== */
          .grammar-card {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            box-shadow: none !important;
            border: 1px solid #e5e7eb !important;
            margin-bottom: 6px !important;
            padding: 8px !important;
            font-size: 9px !important;
          }

          /* ========== 其他优化 ========== */
          .section-title {
            font-size: 12px !important;
          }

          .section-count {
            font-size: 9px !important;
          }

          .row-number {
            width: 18px !important;
            height: 18px !important;
            font-size: 9px !important;
          }

          .type-badge {
            font-size: 8px !important;
            padding: 1px 3px !important;
          }
        }
      `}</style>
    </div>
  );
};

export default ReportViewer;