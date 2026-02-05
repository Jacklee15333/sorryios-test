/**
 * MasteredWords.jsx - 已掌握词汇管理界面
 * 
 * 功能：
 * - 显示用户所有已掌握的词汇
 * - 按类型分类（单词、短语、句型、语法）
 * - 支持移除操作（带确认）
 * - 支持搜索和筛选
 * - 显示统计信息
 */

import React, { useState, useEffect } from 'react';
import { 
  Card, 
  Table, 
  Button, 
  message, 
  Modal, 
  Tag, 
  Space, 
  Input,
  Statistic,
  Row,
  Col,
  Popconfirm,
  Tabs,
  Empty,
  Typography
} from 'antd';
import { 
  DeleteOutlined, 
  SearchOutlined, 
  ReloadOutlined,
  CheckCircleOutlined,
  BookOutlined,
  FileTextOutlined,
  FormOutlined,
  InfoCircleOutlined
} from '@ant-design/icons';
import axios from 'axios';

const { Search } = Input;
const { Title } = Typography;

const MasteredWords = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({
    all: [],
    words: [],
    phrases: [],
    patterns: [],
    grammar: []
  });
  const [stats, setStats] = useState({
    total: 0,
    words: 0,
    phrases: 0,
    patterns: 0,
    grammar: 0
  });
  const [searchText, setSearchText] = useState('');
  const [activeTab, setActiveTab] = useState('all');

  // 加载数据
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      if (!token) {
        message.error('请先登录');
        return;
      }

      console.log('[MasteredWords] 📊 开始加载已掌握词汇...');

      // 1. 获取所有已掌握词汇
      const allResponse = await axios.get('/api/user-mastered/list', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      // 2. 获取统计信息
      const statsResponse = await axios.get('/api/user-mastered/stats', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      console.log('[MasteredWords] ✅ 数据加载成功');
      console.log('[MasteredWords] 统计:', statsResponse.data.stats);

      // 按类型分组
      const allWords = allResponse.data.words || [];
      const grouped = {
        all: allWords,
        words: allWords.filter(w => w.word_type === 'word'),
        phrases: allWords.filter(w => w.word_type === 'phrase'),
        patterns: allWords.filter(w => w.word_type === 'pattern'),
        grammar: allWords.filter(w => w.word_type === 'grammar')
      };

      setData(grouped);
      setStats(statsResponse.data.stats || {});

    } catch (error) {
      console.error('[MasteredWords] ❌ 加载失败:', error);
      message.error('加载失败: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  // 移除单词
  const handleRemove = async (record) => {
    try {
      const token = localStorage.getItem('token');
      
      console.log('[MasteredWords] 🗑️  移除词汇:', record.word);

      const response = await axios.post('/api/user-mastered/remove', {
        word: record.word,
        wordType: record.word_type
      }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.data.success) {
        message.success('已移除');
        // 重新加载数据
        await loadData();
      }

    } catch (error) {
      console.error('[MasteredWords] ❌ 移除失败:', error);
      message.error('移除失败: ' + (error.response?.data?.message || error.message));
    }
  };

  // 批量清空
  const handleClearAll = async () => {
    Modal.confirm({
      title: '⚠️ 确认清空所有已掌握词汇？',
      content: (
        <div>
          <p>此操作将清空 <strong style={{color: '#ff4d4f'}}>{stats.total}</strong> 个已掌握的词汇。</p>
          <p style={{color: '#999', fontSize: '13px'}}>此操作不可撤销，请谨慎操作。</p>
        </div>
      ),
      okText: '确认清空',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          const token = localStorage.getItem('token');
          
          const response = await axios.post('/api/user-mastered/clear', {}, {
            headers: { 'Authorization': `Bearer ${token}` }
          });

          if (response.data.success) {
            message.success(`已清空 ${response.data.clearedCount} 个词汇`);
            await loadData();
          }

        } catch (error) {
          console.error('[MasteredWords] ❌ 清空失败:', error);
          message.error('清空失败');
        }
      }
    });
  };

  // 获取类型标签颜色
  const getTypeColor = (type) => {
    const colors = {
      word: 'blue',
      phrase: 'green',
      pattern: 'orange',
      grammar: 'purple'
    };
    return colors[type] || 'default';
  };

  // 获取类型中文名
  const getTypeName = (type) => {
    const names = {
      word: '单词',
      phrase: '短语',
      pattern: '句型',
      grammar: '语法'
    };
    return names[type] || type;
  };

  // 表格列定义
  const columns = [
    {
      title: '词汇',
      dataIndex: 'word',
      key: 'word',
      width: '40%',
      render: (text, record) => (
        <Space>
          <Tag color={getTypeColor(record.word_type)}>
            {getTypeName(record.word_type)}
          </Tag>
          <span style={{ fontSize: '15px', fontWeight: 500 }}>{text}</span>
        </Space>
      ),
      filteredValue: searchText ? [searchText] : null,
      onFilter: (value, record) => {
        return record.word.toLowerCase().includes(value.toLowerCase());
      }
    },
    {
      title: '添加时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: '35%',
      render: (text) => {
        const date = new Date(text);
        return date.toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        });
      }
    },
    {
      title: '操作',
      key: 'action',
      width: '25%',
      render: (_, record) => (
        <Popconfirm
          title="确认移除此词汇？"
          description={
            <div style={{ maxWidth: 300 }}>
              <p>将移除：<strong>{record.word}</strong></p>
              <p style={{ color: '#999', fontSize: '12px', margin: 0 }}>
                移除后，该词汇将重新出现在学习报告中
              </p>
            </div>
          }
          onConfirm={() => handleRemove(record)}
          okText="确认移除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
        >
          <Button 
            type="link" 
            danger 
            icon={<DeleteOutlined />}
          >
            移除
          </Button>
        </Popconfirm>
      )
    }
  ];

  // 获取当前Tab的数据
  const getCurrentData = () => {
    return data[activeTab] || [];
  };

  // Tab项配置
  const tabItems = [
    {
      key: 'all',
      label: (
        <span>
          <CheckCircleOutlined /> 全部 ({stats.total || 0})
        </span>
      ),
      children: null
    },
    {
      key: 'words',
      label: (
        <span>
          <BookOutlined /> 单词 ({stats.words || 0})
        </span>
      ),
      children: null
    },
    {
      key: 'phrases',
      label: (
        <span>
          <FileTextOutlined /> 短语 ({stats.phrases || 0})
        </span>
      ),
      children: null
    },
    {
      key: 'patterns',
      label: (
        <span>
          <FormOutlined /> 句型 ({stats.patterns || 0})
        </span>
      ),
      children: null
    },
    {
      key: 'grammar',
      label: (
        <span>
          <InfoCircleOutlined /> 语法 ({stats.grammar || 0})
        </span>
      ),
      children: null
    }
  ];

  return (
    <div style={{ padding: '24px', background: '#f0f2f5', minHeight: '100vh' }}>
      <Card 
        bordered={false}
        style={{ maxWidth: 1200, margin: '0 auto' }}
      >
        {/* 标题和统计 */}
        <div style={{ marginBottom: 24 }}>
          <Title level={3} style={{ marginBottom: 16 }}>
            📚 已掌握词汇管理
          </Title>
          
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={12} md={6}>
              <Card>
                <Statistic
                  title="总计"
                  value={stats.total || 0}
                  prefix={<CheckCircleOutlined />}
                  valueStyle={{ color: '#3f8600' }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card>
                <Statistic
                  title="单词"
                  value={stats.words || 0}
                  prefix={<BookOutlined />}
                  valueStyle={{ color: '#1890ff' }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card>
                <Statistic
                  title="短语"
                  value={stats.phrases || 0}
                  prefix={<FileTextOutlined />}
                  valueStyle={{ color: '#52c41a' }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card>
                <Statistic
                  title="语法"
                  value={stats.grammar || 0}
                  prefix={<InfoCircleOutlined />}
                  valueStyle={{ color: '#722ed1' }}
                />
              </Card>
            </Col>
          </Row>
        </div>

        {/* 操作栏 */}
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space>
            <Search
              placeholder="搜索词汇..."
              allowClear
              style={{ width: 300 }}
              onChange={(e) => setSearchText(e.target.value)}
              prefix={<SearchOutlined />}
            />
          </Space>
          
          <Space>
            <Button 
              icon={<ReloadOutlined />} 
              onClick={loadData}
            >
              刷新
            </Button>
            <Button 
              danger 
              icon={<DeleteOutlined />} 
              onClick={handleClearAll}
              disabled={stats.total === 0}
            >
              清空全部
            </Button>
          </Space>
        </div>

        {/* Tab切换和表格 */}
        <Tabs
          activeKey={activeTab}
          items={tabItems}
          onChange={setActiveTab}
        />

        <Table
          columns={columns}
          dataSource={getCurrentData()}
          rowKey={(record) => `${record.word_type}-${record.word}-${record.created_at}`}
          loading={loading}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <div>
                    <p style={{ marginBottom: 8 }}>暂无已掌握的词汇</p>
                    <p style={{ color: '#999', fontSize: '13px' }}>
                      在学习报告中点击"已学会"按钮标记词汇
                    </p>
                  </div>
                }
              />
            )
          }}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 个词汇`,
            pageSizeOptions: ['10', '20', '50', '100']
          }}
        />
      </Card>
    </div>
  );
};

export default MasteredWords;