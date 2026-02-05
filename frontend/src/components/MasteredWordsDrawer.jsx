/**
 * MasteredWordsDrawer.jsx - 已掌握词汇抽屉组件
 * 
 * 用法：在 ReportViewer 中集成
 * 
 * <MasteredWordsDrawer 
 *   visible={masteredDrawerVisible}
 *   onClose={() => setMasteredDrawerVisible(false)}
 *   onWordRemoved={() => loadData()}  // 移除词汇后刷新报告
 * />
 */

import React, { useState, useEffect } from 'react';
import { 
  Drawer,
  Table, 
  Button, 
  message, 
  Tag, 
  Space, 
  Input,
  Statistic,
  Row,
  Col,
  Popconfirm,
  Tabs,
  Empty,
  Card,
  Badge
} from 'antd';
import { 
  DeleteOutlined, 
  SearchOutlined, 
  ReloadOutlined,
  CheckCircleOutlined,
  BookOutlined,
  FileTextOutlined,
  FormOutlined,
  InfoCircleOutlined,
  ClearOutlined
} from '@ant-design/icons';
import axios from 'axios';

const { Search } = Input;

const MasteredWordsDrawer = ({ visible, onClose, onWordRemoved }) => {
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

  // 每次打开时加载数据
  useEffect(() => {
    if (visible) {
      loadData();
    }
  }, [visible]);

  const loadData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      if (!token) {
        message.error('请先登录');
        return;
      }

      console.log('[MasteredDrawer] 📊 加载已掌握词汇...');

      // 获取所有已掌握词汇
      const allResponse = await axios.get('/api/user-mastered/list', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      // 获取统计信息
      const statsResponse = await axios.get('/api/user-mastered/stats', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      console.log('[MasteredDrawer] ✅ 加载成功，共', statsResponse.data.stats.total, '个');

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
      console.error('[MasteredDrawer] ❌ 加载失败:', error);
      message.error('加载失败');
    } finally {
      setLoading(false);
    }
  };

  // 移除单词
  const handleRemove = async (record) => {
    try {
      const token = localStorage.getItem('token');
      
      console.log('[MasteredDrawer] 🗑️  移除:', record.word);

      const response = await axios.post('/api/user-mastered/remove', {
        word: record.word,
        wordType: record.word_type
      }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.data.success) {
        message.success('已移除');
        
        // 重新加载列表
        await loadData();
        
        // 通知父组件（ReportViewer）刷新报告
        if (onWordRemoved) {
          onWordRemoved();
        }
      }

    } catch (error) {
      console.error('[MasteredDrawer] ❌ 移除失败:', error);
      message.error('移除失败');
    }
  };

  // 批量清空
  const handleClearAll = () => {
    const count = stats.total;
    
    if (count === 0) {
      message.info('没有需要清空的词汇');
      return;
    }

    const modal = require('antd').Modal;
    modal.confirm({
      title: '⚠️ 确认清空所有已掌握词汇？',
      content: (
        <div>
          <p>此操作将清空 <strong style={{color: '#ff4d4f'}}>{count}</strong> 个已掌握的词汇。</p>
          <p style={{color: '#999', fontSize: '13px', marginBottom: 0}}>
            清空后，这些词汇将重新出现在学习报告中。
          </p>
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
            
            // 通知父组件刷新报告
            if (onWordRemoved) {
              onWordRemoved();
            }
          }

        } catch (error) {
          console.error('[MasteredDrawer] ❌ 清空失败:', error);
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
      render: (text, record) => (
        <Space>
          <Tag color={getTypeColor(record.word_type)}>
            {getTypeName(record.word_type)}
          </Tag>
          <span style={{ fontSize: '14px', fontWeight: 500 }}>{text}</span>
        </Space>
      ),
      filteredValue: searchText ? [searchText] : null,
      onFilter: (value, record) => {
        return record.word.toLowerCase().includes(value.toLowerCase());
      }
    },
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 140,
      render: (text) => {
        const date = new Date(text);
        return (
          <span style={{ fontSize: '12px', color: '#999' }}>
            {date.toLocaleDateString('zh-CN', {
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </span>
        );
      }
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_, record) => (
        <Popconfirm
          title="确认移除？"
          description={
            <div style={{ maxWidth: 250 }}>
              <p style={{ marginBottom: 4 }}>将移除：<strong>{record.word}</strong></p>
              <p style={{ color: '#999', fontSize: '12px', margin: 0 }}>
                移除后将重新出现在报告中
              </p>
            </div>
          }
          onConfirm={() => handleRemove(record)}
          okText="确认"
          cancelText="取消"
          okButtonProps={{ danger: true }}
        >
          <Button 
            type="link" 
            danger 
            size="small"
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
          <CheckCircleOutlined /> 全部
          <Badge 
            count={stats.total || 0} 
            style={{ marginLeft: 8, backgroundColor: '#52c41a' }} 
          />
        </span>
      ),
      children: null
    },
    {
      key: 'words',
      label: (
        <span>
          <BookOutlined /> 单词
          <Badge 
            count={stats.words || 0} 
            style={{ marginLeft: 8, backgroundColor: '#1890ff' }} 
          />
        </span>
      ),
      children: null
    },
    {
      key: 'phrases',
      label: (
        <span>
          <FileTextOutlined /> 短语
          <Badge 
            count={stats.phrases || 0} 
            style={{ marginLeft: 8, backgroundColor: '#52c41a' }} 
          />
        </span>
      ),
      children: null
    },
    {
      key: 'patterns',
      label: (
        <span>
          <FormOutlined /> 句型
          <Badge 
            count={stats.patterns || 0} 
            style={{ marginLeft: 8, backgroundColor: '#faad14' }} 
          />
        </span>
      ),
      children: null
    },
    {
      key: 'grammar',
      label: (
        <span>
          <InfoCircleOutlined /> 语法
          <Badge 
            count={stats.grammar || 0} 
            style={{ marginLeft: 8, backgroundColor: '#722ed1' }} 
          />
        </span>
      ),
      children: null
    }
  ];

  return (
    <Drawer
      title={
        <Space>
          <CheckCircleOutlined style={{ color: '#52c41a' }} />
          <span>已掌握词汇管理</span>
          <Badge 
            count={stats.total || 0} 
            style={{ backgroundColor: '#52c41a' }} 
            showZero
          />
        </Space>
      }
      placement="right"
      width={720}
      onClose={onClose}
      open={visible}
      extra={
        <Space>
          <Button 
            icon={<ReloadOutlined />} 
            onClick={loadData}
            size="small"
          >
            刷新
          </Button>
          <Button 
            danger 
            icon={<ClearOutlined />} 
            onClick={handleClearAll}
            disabled={stats.total === 0}
            size="small"
          >
            清空
          </Button>
        </Space>
      }
    >
      {/* 统计卡片 */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small" style={{ textAlign: 'center' }}>
            <Statistic
              value={stats.total || 0}
              valueStyle={{ fontSize: '20px', color: '#52c41a' }}
              prefix={<CheckCircleOutlined />}
              suffix={<span style={{ fontSize: '12px', color: '#999' }}>总计</span>}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" style={{ textAlign: 'center' }}>
            <Statistic
              value={stats.words || 0}
              valueStyle={{ fontSize: '20px', color: '#1890ff' }}
              prefix={<BookOutlined />}
              suffix={<span style={{ fontSize: '12px', color: '#999' }}>单词</span>}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" style={{ textAlign: 'center' }}>
            <Statistic
              value={stats.phrases || 0}
              valueStyle={{ fontSize: '20px', color: '#52c41a' }}
              prefix={<FileTextOutlined />}
              suffix={<span style={{ fontSize: '12px', color: '#999' }}>短语</span>}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" style={{ textAlign: 'center' }}>
            <Statistic
              value={stats.grammar || 0}
              valueStyle={{ fontSize: '20px', color: '#722ed1' }}
              prefix={<InfoCircleOutlined />}
              suffix={<span style={{ fontSize: '12px', color: '#999' }}>语法</span>}
            />
          </Card>
        </Col>
      </Row>

      {/* 搜索框 */}
      <Search
        placeholder="搜索词汇..."
        allowClear
        style={{ marginBottom: 16 }}
        onChange={(e) => setSearchText(e.target.value)}
        prefix={<SearchOutlined />}
      />

      {/* Tab切换 */}
      <Tabs
        activeKey={activeTab}
        items={tabItems}
        onChange={setActiveTab}
        style={{ marginBottom: 16 }}
      />

      {/* 表格 */}
      <Table
        columns={columns}
        dataSource={getCurrentData()}
        rowKey={(record) => `${record.word_type}-${record.word}-${record.created_at}`}
        loading={loading}
        size="small"
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <div style={{ padding: '20px 0' }}>
                  <p style={{ marginBottom: 8, color: '#999' }}>暂无已掌握的词汇</p>
                  <p style={{ color: '#bfbfbf', fontSize: '12px', margin: 0 }}>
                    在学习报告中点击"已学会"按钮标记词汇
                  </p>
                </div>
              }
            />
          )
        }}
        pagination={{
          pageSize: 15,
          showSizeChanger: false,
          showTotal: (total) => (
            <span style={{ fontSize: '12px', color: '#999' }}>
              共 <strong style={{ color: '#1890ff' }}>{total}</strong> 个词汇
            </span>
          ),
          size: 'small'
        }}
      />
    </Drawer>
  );
};

export default MasteredWordsDrawer;
