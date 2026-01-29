/**
 * PDF预览页面 - 100%复制网页版
 * 三个部分：单词、短语、语法
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useParams } from 'react-router-dom';

const PDFPreviewPage = () => {
  const { taskId } = useParams();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    words: [],
    phrases: [],
    patterns: [],
    grammar: []
  });
  const [taskInfo, setTaskInfo] = useState(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/tasks/${taskId}/report`);
      setData(response.data);
      
      try {
        const taskResponse = await axios.get(`/api/tasks/${taskId}`);
        setTaskInfo(taskResponse.data.task || taskResponse.data);
        console.log('✅ 任务信息加载成功:', taskResponse.data);
      } catch (err) {
        console.error('⚠️ 加载任务信息失败:', err);
      }
    } catch (error) {
      console.error('❌ 加载数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [taskId]);

  useEffect(() => {
    if (taskInfo) {
      // 优先使用customTitle，其次title，最后默认
      const pageTitle = taskInfo.customTitle || taskInfo.title || '学习报告';
      document.title = pageTitle;
      console.log('📝 PDF文件名设置为:', pageTitle);
    } else if (!loading) {
      // 如果taskInfo加载失败，使用默认标题
      document.title = '学习报告';
      console.log('⚠️ taskInfo未加载，使用默认文件名');
    }
  }, [taskInfo, loading]);

  // 音标格式化
  const formatPhonetic = (phonetic) => {
    if (!phonetic) return '';
    const trimmed = phonetic.trim();
    if (trimmed.startsWith('/') && trimmed.endsWith('/')) return trimmed;
    if (trimmed.startsWith('/') || trimmed.endsWith('/')) {
      return trimmed.startsWith('/') ? trimmed + '/' : '/' + trimmed;
    }
    return `/${trimmed}/`;
  };

  // 🎯 按照网页版，分成三个独立的数据源
  const wordsData = data.words || [];
  const phrasesData = [...(data.phrases || []), ...(data.patterns || [])];
  const grammarData = data.grammar || [];
  
  const reportTitle = taskInfo?.customTitle || taskInfo?.title || '学习报告';

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div>加载中...</div>
      </div>
    );
  }

  return (
    <div className="pdf-container">
      <style>{`
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif;
          background: white;
        }

        .pdf-container {
          max-width: 210mm;
          margin: 0 auto;
          padding: 10mm;
          background: white;
        }

        /* 标题 */
        .pdf-header {
          text-align: center;
          margin-bottom: 20px;
          padding-bottom: 15px;
          border-bottom: 2px solid #667eea;
        }

        .pdf-title {
          font-size: 24px;
          font-weight: bold;
          color: #1a1a1a;
          margin-bottom: 8px;
        }

        .pdf-subtitle {
          font-size: 14px;
          color: #666;
        }

        /* 导出按钮 */
        .export-button {
          position: absolute;
          top: 10px;
          right: 10px;
          padding: 10px 20px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
        }

        @media print {
          .export-button {
            display: none !important;
          }
        }

        /* 章节标题 */
        .section-header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 10px 15px;
          font-size: 16px;
          font-weight: bold;
          border-radius: 6px;
          margin: 25px 0 15px 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        /* 表格 */
        .vocabulary-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
        }

        .vocabulary-table thead {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }

        .vocabulary-table th {
          padding: 14px 16px;
          text-align: left;
          font-weight: 600;
          font-size: 13px;
          color: white;
          border: 1px solid #e5e7eb;
        }

        .vocabulary-table td {
          padding: 14px 16px;
          border: 1px solid #f3f4f6;
          vertical-align: top;
          font-size: 13px;
        }

        .vocabulary-table tbody tr:nth-child(even) {
          background: #fafafa;
        }

        /* 序号列 */
        .vocabulary-table th:nth-child(1),
        .vocabulary-table td:nth-child(1) {
          width: 60px;
          text-align: center;
        }

        /* 单词列 */
        .vocabulary-table th:nth-child(2),
        .vocabulary-table td:nth-child(2) {
          width: 240px;
        }

        /* 含义列 */
        .vocabulary-table th:nth-child(3),
        .vocabulary-table td:nth-child(3) {
          width: 300px;
        }

        /* 例句列 */
        .vocabulary-table th:nth-child(4),
        .vocabulary-table td:nth-child(4) {
          flex: 1;
        }

        /* 序号样式 */
        .row-number {
          font-size: 14px;
          color: #6b7280;
        }

        /* 🎯 单词内容 - 横向排列！ */
        .word-content {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .word-text {
          min-width: 120px;
          max-width: 120px;
          font-size: 16px;
          font-weight: 600;
          color: #1a1a1a;
          letter-spacing: 0.3px;
          word-break: break-word;
        }

        /* 音标标签 */
        .phonetic-tag {
          display: inline-block;
          color: #4f46e5;
          font-size: 12px;
          font-family: Consolas, "Courier New", monospace;
          background-color: #eef2ff;
          padding: 3px 10px;
          border-radius: 4px;
          border: 1px solid #c7d2fe;
          font-weight: 500;
          white-space: nowrap;
        }

        /* 含义内容 - 横向排列 */
        .meaning-content {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        /* 词性标签 */
        .pos-tag {
          display: inline-block;
          color: #059669;
          font-size: 12px;
          font-weight: 600;
          background-color: #d1fae5;
          padding: 2px 8px;
          border-radius: 4px;
          border: 1px solid #a7f3d0;
          flex-shrink: 0;
        }

        .meaning-text {
          font-size: 14px;
          color: #1a1a1a;
          flex: 1;
        }

        /* 例句 */
        .example-text {
          font-size: 13px;
          color: #6b7280;
          font-style: italic;
        }

        /* 语法卡片 */
        .grammar-card {
          border: 2px solid #e5e7eb;
          border-left: 5px solid #8b5cf6;
          border-radius: 10px;
          padding: 20px;
          margin-bottom: 20px;
          background: white;
          break-inside: avoid;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }

        .grammar-title {
          font-size: 18px;
          font-weight: 600;
          color: #1a1a1a;
          margin-bottom: 12px;
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
      `}</style>

      {/* 导出按钮 */}
      <button 
        className="export-button"
        onClick={() => {
          // 确保文件名是正确的
          const pdfFileName = taskInfo?.customTitle || taskInfo?.title || '学习报告';
          document.title = pdfFileName;
          console.log('📄 导出PDF，文件名:', pdfFileName);
          
          // 稍微延迟一下，确保标题已更新
          setTimeout(() => {
            window.print();
          }, 100);
        }}
      >
        📄 导出PDF
      </button>

      {/* 标题 */}
      <div className="pdf-header">
        <div className="pdf-title">{reportTitle}</div>
        <div className="pdf-subtitle">
          生成时间: {new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </div>

      {/* 🎯 第一部分：单词 */}
      {wordsData.length > 0 && (
        <>
          <div className="section-header">
            <span>📚 单词部分</span>
            <span>共 {wordsData.length} 项</span>
          </div>

          <table className="vocabulary-table">
            <thead>
              <tr>
                <th>序号</th>
                <th>单词</th>
                <th>含义</th>
                <th>例句</th>
              </tr>
            </thead>
            <tbody>
              {wordsData.map((item, index) => (
                <tr key={index}>
                  {/* 序号 */}
                  <td>
                    <span style={{ fontSize: '14px', color: '#6b7280' }}>
                      {index + 1}
                    </span>
                  </td>

                  {/* 单词+音标（横向排列） */}
                  <td>
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center',
                      gap: '12px'
                    }}>
                      {/* 单词文字 - 尝试多个字段 */}
                      <span style={{ 
                        fontSize: '16px', 
                        fontWeight: 600, 
                        color: '#1a1a1a',
                        letterSpacing: '0.3px',
                        wordBreak: 'break-word',
                        minWidth: '120px'
                      }}>
                        {item.word || item.content || item.text || ''}
                      </span>
                      
                      {/* 音标标签 */}
                      {item.phonetic && (
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
                          {formatPhonetic(item.phonetic)}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* 词性+含义（横向排列） */}
                  <td>
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center',
                      gap: '10px',
                      flexWrap: 'wrap'
                    }}>
                      {/* 词性标签 */}
                      {item.pos && (
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
                          {item.pos}
                        </span>
                      )}
                      
                      {/* 含义文字 */}
                      <span style={{ 
                        fontSize: '14px', 
                        color: '#1a1a1a',
                        flex: 1
                      }}>
                        {item.meaning || '-'}
                      </span>
                    </div>
                  </td>

                  {/* 例句 */}
                  <td>
                    <span style={{ 
                      fontSize: '13px', 
                      color: '#6b7280',
                      fontStyle: 'italic'
                    }}>
                      {item.example || '-'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* 🎯 第二部分：短语和句型 */}
      {phrasesData.length > 0 && (
        <>
          <div className="section-header">
            <span>📝 短语和句型部分</span>
            <span>共 {phrasesData.length} 项</span>
          </div>

          <table className="vocabulary-table">
            <thead>
              <tr>
                <th>序号</th>
                <th>短语/句型</th>
                <th>含义</th>
                <th>例句</th>
              </tr>
            </thead>
            <tbody>
              {phrasesData.map((item, index) => (
                <tr key={index}>
                  {/* 序号 */}
                  <td>
                    <span style={{ fontSize: '14px', color: '#6b7280' }}>
                      {index + 1}
                    </span>
                  </td>

                  {/* 短语/句型 */}
                  <td>
                    <span style={{ 
                      fontSize: '16px', 
                      fontWeight: 600, 
                      color: '#1a1a1a',
                      letterSpacing: '0.3px',
                      wordBreak: 'break-word'
                    }}>
                      {item.phrase || item.pattern || item.content}
                    </span>
                  </td>

                  {/* 含义 */}
                  <td>
                    <span style={{ 
                      fontSize: '14px', 
                      color: '#1a1a1a'
                    }}>
                      {item.meaning || '-'}
                    </span>
                  </td>

                  {/* 例句 */}
                  <td>
                    <span style={{ 
                      fontSize: '13px', 
                      color: '#6b7280',
                      fontStyle: 'italic'
                    }}>
                      {item.example || '-'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* 🎯 第三部分：语法 */}
      {grammarData.length > 0 && (
        <>
          <div className="section-header">
            <span>📖 语法部分</span>
            <span>共 {grammarData.length} 项</span>
          </div>

          {grammarData.map((item, index) => (
            <div key={index} className="grammar-card">
              <div className="grammar-title">{index + 1}. {item.title}</div>

              {item.definition && (
                <div className="grammar-field">
                  <span className="field-label">📝 定义：</span>
                  <span className="field-content">{item.definition}</span>
                </div>
              )}

              {item.structure && (
                <div className="grammar-field">
                  <span className="field-label">🏗️ 结构：</span>
                  <span className="field-content">{item.structure}</span>
                </div>
              )}

              {item.usage && (
                <div className="grammar-field">
                  <span className="field-label">💡 用法：</span>
                  <span className="field-content">
                    {Array.isArray(item.usage) ? item.usage.join('; ') : item.usage}
                  </span>
                </div>
              )}

              {item.examples && (
                <div className="grammar-field">
                  <span className="field-label">📌 例句：</span>
                  <span className="field-content">
                    {Array.isArray(item.examples) ? item.examples.join(' / ') : item.examples}
                  </span>
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
};

export default PDFPreviewPage;