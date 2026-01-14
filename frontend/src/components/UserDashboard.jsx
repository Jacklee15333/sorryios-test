import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

/**
 * 用户 Dashboard 组件
 * 包含：个人信息、学习数据、过滤器管理、历史记录
 */
function UserDashboard({ onClose, onViewReport }) {
    const { user, fetchLearningStats } = useAuth();
    const [activeTab, setActiveTab] = useState('overview');
    const [stats, setStats] = useState(null);
    const [masteredWords, setMasteredWords] = useState([]);
    const [masteredStats, setMasteredStats] = useState(null);
    const [taskHistory, setTaskHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // 加载所有数据
    useEffect(() => {
        loadAllData();
    }, []);

    const loadAllData = async () => {
        setLoading(true);
        setError('');
        try {
            await Promise.all([
                loadStats(),
                loadMasteredWords(),
                loadTaskHistory()
            ]);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // 加载学习统计
    const loadStats = async () => {
        try {
            const data = await fetchLearningStats();
            setStats(data);
        } catch (err) {
            console.error('加载统计失败:', err);
        }
    };

    // 加载已掌握词汇
    const loadMasteredWords = async () => {
        try {
            const token = localStorage.getItem('token');
            
            // 获取统计
            const statsRes = await fetch('/api/user-mastered/stats', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const statsData = await statsRes.json();
            if (statsData.success) {
                setMasteredStats(statsData.stats);
            }

            // 获取列表
            const listRes = await fetch('/api/user-mastered/list', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const listData = await listRes.json();
            if (listData.success) {
                setMasteredWords(listData.words || []);
            }
        } catch (err) {
            console.error('加载已掌握词汇失败:', err);
        }
    };

    // 加载任务历史
    const loadTaskHistory = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/user/stats', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (data.recentTasks) {
                setTaskHistory(data.recentTasks);
            }
        } catch (err) {
            console.error('加载历史失败:', err);
        }
    };

    // 移除已掌握词汇
    const handleRemoveMastered = async (word, wordType) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/user-mastered/remove', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ word, wordType })
            });

            if (response.ok) {
                // 刷新列表
                await loadMasteredWords();
            }
        } catch (err) {
            console.error('移除失败:', err);
        }
    };

    // 清空所有已掌握词汇
    const handleClearAll = async () => {
        if (!confirm('确定要清空所有已掌握词汇吗？此操作不可恢复！')) {
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/user-mastered/clear', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                await loadMasteredWords();
            }
        } catch (err) {
            console.error('清空失败:', err);
        }
    };

    // 查看报告
    const handleViewReport = (taskId) => {
        onClose();
        if (onViewReport) {
            onViewReport(taskId);
        }
    };

    if (loading) {
        return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white rounded-2xl p-8 text-center">
                    <div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                    <p className="text-gray-600">加载数据中...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* 头部 */}
                <div className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white p-6 shrink-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center text-3xl">
                                👤
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold">{user?.nickname || user?.username}</h2>
                                <p className="text-white/80">@{user?.username}</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center hover:bg-white/30 transition-colors text-xl"
                        >
                            ✕
                        </button>
                    </div>

                    {/* 快速统计 */}
                    <div className="grid grid-cols-4 gap-4 mt-6">
                        <div className="bg-white/10 rounded-lg p-3 text-center">
                            <div className="text-2xl font-bold">{stats?.totalTasks || 0}</div>
                            <div className="text-xs text-white/80">处理文件</div>
                        </div>
                        <div className="bg-white/10 rounded-lg p-3 text-center">
                            <div className="text-2xl font-bold">{stats?.totalWords || 0}</div>
                            <div className="text-xs text-white/80">学习词汇</div>
                        </div>
                        <div className="bg-white/10 rounded-lg p-3 text-center">
                            <div className="text-2xl font-bold">{masteredStats?.total || 0}</div>
                            <div className="text-xs text-white/80">已掌握</div>
                        </div>
                        <div className="bg-white/10 rounded-lg p-3 text-center">
                            <div className="text-2xl font-bold">{stats?.activeDays || 0}</div>
                            <div className="text-xs text-white/80">活跃天数</div>
                        </div>
                    </div>
                </div>

                {/* 标签页 */}
                <div className="border-b border-gray-200 shrink-0">
                    <div className="flex">
                        {[
                            { id: 'overview', label: '📊 概览', icon: '📊' },
                            { id: 'history', label: '📋 历史', icon: '📋' },
                            { id: 'filter', label: '🔧 过滤器', icon: '🔧' },
                            { id: 'settings', label: '⚙️ 设置', icon: '⚙️' }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex-1 py-3 px-4 text-sm font-medium transition-all ${
                                    activeTab === tab.id
                                        ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50'
                                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* 内容区 */}
                <div className="flex-1 overflow-y-auto p-6">
                    {error && (
                        <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-4">
                            {error}
                        </div>
                    )}

                    {/* 概览 */}
                    {activeTab === 'overview' && (
                        <div className="space-y-6">
                            {/* 学习进度 */}
                            <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-6">
                                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                                    <span>📈</span> 学习进度
                                </h3>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <StatCard
                                        icon="📝"
                                        label="单词"
                                        value={masteredStats?.words || 0}
                                        color="blue"
                                    />
                                    <StatCard
                                        icon="💬"
                                        label="短语"
                                        value={masteredStats?.phrases || 0}
                                        color="green"
                                    />
                                    <StatCard
                                        icon="📐"
                                        label="句型"
                                        value={masteredStats?.patterns || 0}
                                        color="purple"
                                    />
                                    <StatCard
                                        icon="📖"
                                        label="语法"
                                        value={masteredStats?.grammars || 0}
                                        color="orange"
                                    />
                                </div>
                            </div>

                            {/* 最近学习 */}
                            <div className="bg-gray-50 rounded-xl p-6">
                                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                                    <span>🕐</span> 最近学习
                                </h3>
                                {taskHistory.length > 0 ? (
                                    <div className="space-y-2">
                                        {taskHistory.slice(0, 5).map((task, index) => (
                                            <div
                                                key={task.id || index}
                                                className="bg-white p-3 rounded-lg flex items-center justify-between hover:shadow-md transition-shadow cursor-pointer"
                                                onClick={() => task.status === 'completed' && handleViewReport(task.id)}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <span className="text-xl">
                                                        {task.status === 'completed' ? '✅' : task.status === 'failed' ? '❌' : '⏳'}
                                                    </span>
                                                    <div>
                                                        <p className="font-medium text-gray-800">
                                                            {task.title || task.fileName || '未命名'}
                                                        </p>
                                                        <p className="text-xs text-gray-500">
                                                            {new Date(task.createdAt).toLocaleString('zh-CN')}
                                                        </p>
                                                    </div>
                                                </div>
                                                {task.status === 'completed' && (
                                                    <span className="text-indigo-500 text-sm">查看 →</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-gray-500 text-center py-4">暂无学习记录</p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* 历史记录 */}
                    {activeTab === 'history' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-bold text-gray-800">📋 处理历史</h3>
                                <span className="text-sm text-gray-500">共 {taskHistory.length} 条</span>
                            </div>

                            {taskHistory.length > 0 ? (
                                <div className="space-y-3">
                                    {taskHistory.map((task, index) => (
                                        <div
                                            key={task.id || index}
                                            className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow"
                                        >
                                            <div className="flex items-start justify-between">
                                                <div className="flex items-start gap-3">
                                                    <span className="text-2xl mt-1">
                                                        {task.status === 'completed' ? '✅' : task.status === 'failed' ? '❌' : '⏳'}
                                                    </span>
                                                    <div>
                                                        <p className="font-medium text-gray-800">
                                                            {task.title || task.fileName || '未命名任务'}
                                                        </p>
                                                        <p className="text-sm text-gray-500 mt-1">
                                                            {new Date(task.createdAt).toLocaleString('zh-CN')}
                                                        </p>
                                                        <div className="flex gap-2 mt-2">
                                                            <span className={`text-xs px-2 py-1 rounded-full ${
                                                                task.status === 'completed'
                                                                    ? 'bg-green-100 text-green-600'
                                                                    : task.status === 'failed'
                                                                    ? 'bg-red-100 text-red-600'
                                                                    : 'bg-yellow-100 text-yellow-600'
                                                            }`}>
                                                                {task.status === 'completed' ? '已完成' : task.status === 'failed' ? '失败' : '处理中'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                {task.status === 'completed' && (
                                                    <button
                                                        onClick={() => handleViewReport(task.id)}
                                                        className="px-4 py-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg text-sm transition-colors"
                                                    >
                                                        查看报告
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-12 text-gray-500">
                                    <span className="text-4xl mb-4 block">📭</span>
                                    <p>暂无处理记录</p>
                                    <p className="text-sm mt-2">上传文件开始学习吧！</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* 过滤器管理 */}
                    {activeTab === 'filter' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h3 className="text-lg font-bold text-gray-800">🔧 已掌握词汇过滤器</h3>
                                    <p className="text-sm text-gray-500 mt-1">
                                        这些词汇已标记为"已掌握"，生成报告时可自动过滤
                                    </p>
                                </div>
                                {masteredWords.length > 0 && (
                                    <button
                                        onClick={handleClearAll}
                                        className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm transition-colors"
                                    >
                                        清空全部
                                    </button>
                                )}
                            </div>

                            {/* 统计 */}
                            <div className="grid grid-cols-4 gap-3 mb-4">
                                <div className="bg-blue-50 rounded-lg p-3 text-center">
                                    <div className="text-xl font-bold text-blue-600">{masteredStats?.words || 0}</div>
                                    <div className="text-xs text-blue-500">单词</div>
                                </div>
                                <div className="bg-green-50 rounded-lg p-3 text-center">
                                    <div className="text-xl font-bold text-green-600">{masteredStats?.phrases || 0}</div>
                                    <div className="text-xs text-green-500">短语</div>
                                </div>
                                <div className="bg-purple-50 rounded-lg p-3 text-center">
                                    <div className="text-xl font-bold text-purple-600">{masteredStats?.patterns || 0}</div>
                                    <div className="text-xs text-purple-500">句型</div>
                                </div>
                                <div className="bg-orange-50 rounded-lg p-3 text-center">
                                    <div className="text-xl font-bold text-orange-600">{masteredStats?.grammars || 0}</div>
                                    <div className="text-xs text-orange-500">语法</div>
                                </div>
                            </div>

                            {/* 词汇列表 */}
                            {masteredWords.length > 0 ? (
                                <div className="bg-gray-50 rounded-xl p-4 max-h-[400px] overflow-y-auto">
                                    <div className="space-y-2">
                                        {masteredWords.map((item, index) => (
                                            <div
                                                key={index}
                                                className="flex items-center justify-between bg-white p-3 rounded-lg"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <span className={`text-xs px-2 py-1 rounded-full ${
                                                        item.word_type === 'word' ? 'bg-blue-100 text-blue-600' :
                                                        item.word_type === 'phrase' ? 'bg-green-100 text-green-600' :
                                                        item.word_type === 'pattern' ? 'bg-purple-100 text-purple-600' :
                                                        'bg-orange-100 text-orange-600'
                                                    }`}>
                                                        {item.word_type === 'word' ? '单词' :
                                                         item.word_type === 'phrase' ? '短语' :
                                                         item.word_type === 'pattern' ? '句型' : '语法'}
                                                    </span>
                                                    <span className="font-medium text-gray-800">{item.word}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-gray-400">
                                                        {new Date(item.created_at).toLocaleDateString('zh-CN')}
                                                    </span>
                                                    <button
                                                        onClick={() => handleRemoveMastered(item.word, item.word_type)}
                                                        className="px-2 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-600 rounded transition-colors"
                                                        title="移除（下次会重新出现）"
                                                    >
                                                        移除
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-xl">
                                    <span className="text-4xl mb-4 block">📝</span>
                                    <p>暂无已掌握词汇</p>
                                    <p className="text-sm mt-2">在报告中点击"已掌握"按钮添加</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* 设置 */}
                    {activeTab === 'settings' && (
                        <div className="space-y-6">
                            {/* 账户信息 */}
                            <div className="bg-gray-50 rounded-xl p-6">
                                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                                    <span>👤</span> 账户信息
                                </h3>
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between py-2 border-b border-gray-200">
                                        <span className="text-gray-600">用户名</span>
                                        <span className="font-medium text-gray-800">{user?.username}</span>
                                    </div>
                                    <div className="flex items-center justify-between py-2 border-b border-gray-200">
                                        <span className="text-gray-600">昵称</span>
                                        <span className="font-medium text-gray-800">{user?.nickname || user?.username}</span>
                                    </div>
                                    <div className="flex items-center justify-between py-2 border-b border-gray-200">
                                        <span className="text-gray-600">角色</span>
                                        <span className={`px-2 py-1 rounded-full text-xs ${
                                            user?.role === 'admin' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
                                        }`}>
                                            {user?.role === 'admin' ? '管理员' : '普通用户'}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between py-2">
                                        <span className="text-gray-600">注册时间</span>
                                        <span className="font-medium text-gray-800">
                                            {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('zh-CN') : '未知'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* 数据管理 */}
                            <div className="bg-gray-50 rounded-xl p-6">
                                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                                    <span>🗄️</span> 数据管理
                                </h3>
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between py-2">
                                        <div>
                                            <span className="text-gray-800 font-medium">清空已掌握词汇</span>
                                            <p className="text-xs text-gray-500 mt-1">重置所有已标记为"已掌握"的词汇</p>
                                        </div>
                                        <button
                                            onClick={handleClearAll}
                                            className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm transition-colors"
                                        >
                                            清空
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* 关于 */}
                            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-6">
                                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                                    <span>ℹ️</span> 关于
                                </h3>
                                <div className="space-y-2 text-sm text-gray-600">
                                    <p><span className="font-medium">应用名称：</span>Sorryios AI 智能笔记助手</p>
                                    <p><span className="font-medium">版本：</span>v4.1.0</p>
                                    <p><span className="font-medium">功能：</span>课堂笔记自动化处理系统</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

/**
 * 统计卡片组件
 */
function StatCard({ icon, label, value, color }) {
    const colorClasses = {
        blue: 'bg-blue-100 text-blue-600',
        green: 'bg-green-100 text-green-600',
        purple: 'bg-purple-100 text-purple-600',
        orange: 'bg-orange-100 text-orange-600'
    };

    return (
        <div className={`${colorClasses[color]} rounded-xl p-4 text-center`}>
            <div className="text-2xl mb-1">{icon}</div>
            <div className="text-2xl font-bold">{value}</div>
            <div className="text-xs opacity-80">{label}</div>
        </div>
    );
}

export default UserDashboard;
