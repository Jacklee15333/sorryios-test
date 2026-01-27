/**
 * ReportViewer v3.0 - 语法卡片式展示版
 * 设计理念：
 * - 词汇：表格展示（简洁清晰）
 * - 语法：卡片展示（信息丰富，支持子话题）
 */

import React, { useState, useEffect } from 'react';
import { Table, Button, message, Spin, Empty, Typography, Space, Card } from 'antd';
import { CheckOutlined, CloseOutlined, ReloadOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Title, Text, Paragraph } = Typography;

const ReportViewer = ({ taskId }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    words: [],
    phrases: [],
    patterns: [],
    grammar: []
  });

  // 加载数据
  useEffect(() => {
    if (taskId) {
      loadData();
    }
  }, [taskId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/tasks/${taskId}/report`);
      setData(response.data);
    } catch (error) {
      message.error('加载数据失败');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // 合并词汇数据（单词+短语+句型）
  const getVocabularyData = () => {
    const vocabulary = [];
    
    // 添加单词
    data.words?.forEach(item => {
      vocabulary.push({
        ...item,
        type: '单词',
        key: `word-${item.id}`,
        sortOrder: item.id || 0
      });
    });
    
    // 添加短语
    data.phrases?.forEach(item => {
      vocabulary.push({
        ...item,
        type: '短语',
        key: `phrase-${item.id}`,
        sortOrder: item.id || 0
      });
    });
    
    // 添加句型
    data.patterns?.forEach(item => {
      vocabulary.push({
        ...item,
        type: '句型',
        key: `pattern-${item.id}`,
        sortOrder: item.id || 0
      });
    });
    
    // 按ID排序
    return vocabulary.sort((a, b) => a.sortOrder - b.sortOrder);
  };

  // 处理确认操作
  const handleConfirm = async (record) => {
    try {
      const endpoint = record.type === '单词' ? 'words' : 
                      record.type === '短语' ? 'phrases' : 'patterns';
      await axios.post(`/api/${endpoint}/${record.id}/confirm`);
      message.success('已确认');
      loadData();
    } catch (error) {
      message.error('操作失败');
    }
  };

  // 处理删除操作
  const handleReject = async (record) => {
    try {
      const endpoint = record.type === '单词' ? 'words' : 
                      record.type === '短语' ? 'phrases' : 'patterns';
      await axios.delete(`/api/${endpoint}/${record.id}`);
      message.success('已删除');
      loadData();
    } catch (error) {
      message.error('操作失败');
    }
  };

  // 处理语法确认
  const handleGrammarConfirm = async (record) => {
    try {
      await axios.post(`/api/grammar/${record.id}/confirm`);
      message.success('已确认');
      loadData();
    } catch (error) {
      message.error('操作失败');
    }
  };

  // 处理语法删除
  const handleGrammarReject = async (record) => {
    try {
      await axios.delete(`/api/grammar/${record.id}`);
      message.success('已删除');
      loadData();
    } catch (error) {
      message.error('操作失败');
    }
  };

  // 词汇表格列定义
  const vocabularyColumns = [
    {
      title: '#',
      width: 60,
      render: (_, __, index) => (
        <Text style={{ color: '#8e8e93', fontSize: '14px' }}>
          {index + 1}
        </Text>
      )
    },
    {
      title: '类型',
      dataIndex: 'type',
      width: 80,
      render: (type) => (
        <Text style={{ 
          color: '#007aff',
          fontSize: '13px',
          fontWeight: 500
        }}>
          {type}
        </Text>
      )
    },
    {
      title: '词汇内容',
      dataIndex: 'content',
      width: 200,
      render: (content, record) => (
        <div>
          <Text style={{ fontSize: '15px', fontWeight: 500, color: '#1d1d1f' }}>
            {content}
          </Text>
          {record.phonetic && (
            <Text style={{ 
              marginLeft: '8px', 
              color: '#8e8e93',
              fontSize: '13px'
            }}>
              {record.phonetic}
            </Text>
          )}
        </div>
      )
    },
    {
      title: '词性',
      dataIndex: 'partOfSpeech',
      width: 80,
      render: (pos) => pos && (
        <Text style={{ color: '#8e8e93', fontSize: '13px' }}>
          {pos}
        </Text>
      )
    },
    {
      title: '含义',
      dataIndex: 'meaning',
      width: 250,
      render: (meaning) => (
        <Text style={{ fontSize: '14px', color: '#1d1d1f' }}>
          {meaning}
        </Text>
      )
    },
    {
      title: '例句',
      dataIndex: 'example',
      width: 300,
      render: (example) => example && (
        <Text style={{ 
          fontSize: '13px', 
          color: '#6e6e73',
          fontStyle: 'italic'
        }}>
          {example}
        </Text>
      )
    },
    {
      title: '操作',
      width: 120,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button
            type="text"
            size="small"
            icon={<CheckOutlined />}
            onClick={() => handleConfirm(record)}
            style={{ color: '#34c759' }}
          >
            确认
          </Button>
          <Button
            type="text"
            size="small"
            danger
            icon={<CloseOutlined />}
            onClick={() => handleReject(record)}
          >
            删除
          </Button>
        </Space>
      )
    }
  ];

  // 渲染语法卡片
  const renderGrammarCard = (grammar, index) => {
    const subTopics = grammar.sub_topics || [];
    const hasSubTopics = subTopics.length > 0;
    const keywords = grammar.keywords || [];
    
    return (
      <Card
        key={grammar.id}
        style={{
          marginBottom: '16px',
          borderRadius: '10px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
        }}
        bodyStyle={{ padding: '16px' }}
      >
        {/* 标题行 */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'flex-start',
          marginBottom: '12px'
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px',
              flexWrap: 'wrap',
              marginBottom: '8px'
            }}>
              <Text style={{ 
                fontSize: '16px', 
                fontWeight: 600, 
                color: '#1a1a1a' 
              }}>
                {grammar.title}
              </Text>
              
              {grammar.category && (
                <span style={{
                  background: '#ede9fe',
                  color: '#6d28d9',
                  fontSize: '11px',
                  fontWeight: 500,
                  padding: '2px 8px',
                  borderRadius: '4px'
                }}>
                  {grammar.category}
                </span>
              )}
              
              {hasSubTopics && (
                <span style={{
                  background: '#d1fae5',
                  color: '#065f46',
                  fontSize: '11px',
                  fontWeight: 500,
                  padding: '2px 8px',
                  borderRadius: '4px'
                }}>
                  📚 {subTopics.length} 个子话题
                </span>
              )}
            </div>
            
            {/* 定义/说明 */}
            {grammar.definition && (
              <Paragraph style={{ 
                color: '#666', 
                fontSize: '14px',
                marginBottom: '8px',
                lineHeight: '1.6'
              }}>
                {grammar.definition}
              </Paragraph>
            )}
            
            {/* 结构 */}
            {grammar.structure && (
              <div style={{ 
                fontSize: '13px', 
                color: '#6b7280',
                marginBottom: '8px',
                lineHeight: '1.5'
              }}>
                <Text style={{ color: '#9ca3af', fontWeight: 500 }}>结构：</Text>
                {grammar.structure}
              </div>
            )}
            
            {/* 用法 */}
            {grammar.usage && (Array.isArray(grammar.usage) ? grammar.usage.length > 0 : grammar.usage) && (
              <div style={{ 
                fontSize: '13px', 
                color: '#6b7280',
                marginBottom: '8px',
                lineHeight: '1.5'
              }}>
                <Text style={{ color: '#9ca3af', fontWeight: 500 }}>用法：</Text>
                {Array.isArray(grammar.usage) ? grammar.usage.join('; ') : grammar.usage}
              </div>
            )}
            
            {/* 例句 */}
            {grammar.examples && (Array.isArray(grammar.examples) ? grammar.examples.length > 0 : grammar.examples) && (
              <div style={{ 
                fontSize: '13px', 
                color: '#6e6e73',
                fontStyle: 'italic',
                marginBottom: '8px',
                lineHeight: '1.5'
              }}>
                <Text style={{ color: '#9ca3af', fontWeight: 500 }}>例句：</Text>
                {Array.isArray(grammar.examples) ? grammar.examples.join(' / ') : grammar.examples}
              </div>
            )}
            
            {/* 常见错误 */}
            {grammar.mistakes && Array.isArray(grammar.mistakes) && grammar.mistakes.length > 0 && (
              <div style={{ 
                fontSize: '13px', 
                color: '#dc2626',
                marginBottom: '8px',
                lineHeight: '1.8'
              }}>
                <div style={{ color: '#ef4444', fontWeight: 500, marginBottom: '4px' }}>常见错误：</div>
                {grammar.mistakes.map((mistake, idx) => (
                  <div key={idx} style={{ marginBottom: idx < grammar.mistakes.length - 1 ? '6px' : '0' }}>
                    {mistake.wrong && mistake.correct ? (
                      <span>
                        <span style={{ textDecoration: 'line-through', color: '#dc2626' }}>{mistake.wrong}</span>
                        {' → '}
                        <span style={{ color: '#059669', fontWeight: 500 }}>{mistake.correct}</span>
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
            )}
            
            {/* 移除关键词标签显示 - 简化界面 */}
          </div>
          
          {/* 操作按钮 */}
          <Space direction="vertical" size="small" style={{ marginLeft: '16px' }}>
            <Button
              type="text"
              size="small"
              icon={<CheckOutlined />}
              onClick={() => handleGrammarConfirm(grammar)}
              style={{ color: '#34c759', padding: '4px 8px' }}
            >
              确认
            </Button>
            <Button
              type="text"
              size="small"
              danger
              icon={<CloseOutlined />}
              onClick={() => handleGrammarReject(grammar)}
              style={{ padding: '4px 8px' }}
            >
              删除
            </Button>
          </Space>
        </div>
        
        {/* 子话题区域 */}
        {hasSubTopics && (
          <div style={{
            marginTop: '16px',
            paddingTop: '16px',
            borderTop: '1px solid #e5e7eb'
          }}>
            {subTopics.map((subTopic, subIdx) => (
              <div
                key={subIdx}
                style={{
                  padding: '12px 0',
                  borderBottom: subIdx < subTopics.length - 1 ? '1px solid #f3f4f6' : 'none'
                }}
              >
                {/* 子话题标题 - 带编号 */}
                <div style={{ 
                  fontWeight: 600, 
                  color: '#374151',
                  marginBottom: '8px',
                  fontSize: '15px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '6px'
                }}>
                  <span style={{ color: '#6b7280' }}>{subIdx + 1}.</span>
                  <span style={{ flex: 1 }}>{subTopic.title}</span>
                </div>
                
                {/* 子话题定义/说明 */}
                {subTopic.definition && (
                  <div style={{ 
                    fontSize: '14px', 
                    color: '#4b5563',
                    marginBottom: '8px',
                    marginLeft: '20px',
                    lineHeight: '1.6'
                  }}>
                    {subTopic.definition}
                  </div>
                )}
                
                {/* 子话题结构 */}
                {subTopic.structure && (
                  <div style={{ 
                    fontSize: '13px', 
                    color: '#6b7280',
                    marginBottom: '6px',
                    marginLeft: '20px',
                    lineHeight: '1.5'
                  }}>
                    <Text style={{ color: '#9ca3af', fontWeight: 500 }}>结构：</Text>
                    {subTopic.structure}
                  </div>
                )}
                
                {/* 子话题用法 */}
                {subTopic.usage && Array.isArray(subTopic.usage) && subTopic.usage.length > 0 && (
                  <div style={{ 
                    fontSize: '13px', 
                    color: '#6b7280',
                    marginBottom: '6px',
                    marginLeft: '20px',
                    lineHeight: '1.5'
                  }}>
                    <Text style={{ color: '#9ca3af', fontWeight: 500 }}>用法：</Text>
                    {subTopic.usage.join('; ')}
                  </div>
                )}
                
                {/* 子话题例句 */}
                {subTopic.examples && (
                  <div style={{ 
                    fontSize: '13px', 
                    color: '#6b7280',
                    marginLeft: '20px',
                    fontStyle: 'italic',
                    lineHeight: '1.5'
                  }}>
                    <Text style={{ color: '#9ca3af', fontWeight: 500 }}>例句：</Text>
                    {Array.isArray(subTopic.examples) 
                      ? subTopic.examples.join(' / ')
                      : subTopic.examples}
                  </div>
                )}
                
                {/* 添加时间 */}
                {subTopic.added_at && (
                  <div style={{ 
                    fontSize: '11px', 
                    color: '#9ca3af',
                    marginTop: '8px',
                    marginLeft: '20px'
                  }}>
                    添加于 {new Date(subTopic.added_at).toLocaleString('zh-CN')}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    );
  };

  const vocabularyData = getVocabularyData();
  const grammarData = data.grammar || [];

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        minHeight: '400px',
        background: '#fff'
      }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ 
      maxWidth: '1400px',
      margin: '0 auto',
      padding: '24px 32px',
      background: '#fff',
      minHeight: '100vh'
    }}>
      {/* 顶部刷新按钮 */}
      <div style={{ 
        marginBottom: '24px',
        display: 'flex',
        justifyContent: 'flex-end'
      }}>
        <Button
          icon={<ReloadOutlined />}
          onClick={loadData}
          style={{ 
            color: '#007aff',
            borderColor: '#007aff'
          }}
        >
          刷新数据
        </Button>
      </div>

      {/* 词汇部分 - 表格展示 */}
      <div style={{ marginBottom: '48px' }}>
        <Title 
          level={3} 
          style={{ 
            fontSize: '20px',
            fontWeight: 600,
            color: '#1d1d1f',
            marginBottom: '16px',
            borderBottom: '2px solid #007aff',
            paddingBottom: '8px'
          }}
        >
          📚 词汇部分
          <Text style={{ 
            fontSize: '14px', 
            color: '#8e8e93', 
            fontWeight: 400,
            marginLeft: '12px'
          }}>
            共 {vocabularyData.length} 项
          </Text>
        </Title>

        {vocabularyData.length > 0 ? (
          <Table
            columns={vocabularyColumns}
            dataSource={vocabularyData}
            pagination={false}
            scroll={{ x: 1200 }}
            style={{
              background: '#fff'
            }}
            className="clean-table"
          />
        ) : (
          <Empty 
            description="暂无词汇数据"
            style={{ padding: '48px 0' }}
          />
        )}
      </div>

      {/* 语法部分 - 卡片展示 */}
      <div>
        <Title 
          level={3} 
          style={{ 
            fontSize: '20px',
            fontWeight: 600,
            color: '#1d1d1f',
            marginBottom: '16px',
            borderBottom: '2px solid #7c3aed',
            paddingBottom: '8px'
          }}
        >
          📖 语法部分
          <Text style={{ 
            fontSize: '14px', 
            color: '#8e8e93', 
            fontWeight: 400,
            marginLeft: '12px'
          }}>
            共 {grammarData.length} 项
          </Text>
        </Title>

        {grammarData.length > 0 ? (
          <div>
            {grammarData.map((grammar, index) => renderGrammarCard(grammar, index))}
          </div>
        ) : (
          <Empty 
            description="暂无语法数据"
            style={{ padding: '48px 0' }}
          />
        )}
      </div>

      {/* 自定义样式 */}
      <style jsx>{`
        .clean-table .ant-table {
          background: #fff;
        }
        
        .clean-table .ant-table-thead > tr > th {
          background: #f5f5f7;
          color: #1d1d1f;
          font-weight: 600;
          font-size: 13px;
          border-bottom: 1px solid #e5e5e7;
          padding: 12px 16px;
        }
        
        .clean-table .ant-table-tbody > tr > td {
          border-bottom: 1px solid #f5f5f7;
          padding: 16px;
        }
        
        .clean-table .ant-table-tbody > tr:hover > td {
          background: #fafafa;
        }
        
        .clean-table .ant-table-tbody > tr:last-child > td {
          border-bottom: none;
        }

        .clean-table .ant-empty {
          color: #8e8e93;
        }
      `}</style>
    </div>
  );
};

export default ReportViewer;