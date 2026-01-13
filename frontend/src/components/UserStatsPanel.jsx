import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

/**
 * 用户学习数据面板组件
 */
function UserStatsPanel({ onClose }) {
    const { user, fetchLearningStats } = useAuth();
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        loadStats();
    }, []);

    const loadStats = async () => {
        try {
            setLoading(true);
            const data = await fetchLearningStats();
            setStats(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white rounded-2xl p-8 text-center">
                    <div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                    <p className="text-gray-600">加载学习数据...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
                {/* 头部 */}
                <div className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white p-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center text-2xl">
                                👤
                            </div>
                            <div>
                                <h2 className="text-xl font-bold">{user?.nickname || user?.username}</h2>
                                <p className="text-white/80 text-sm">@{user?.username}</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center hover:bg-white/30 transition-colors"
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {/* 内容区 */}
                <div className="p-6 overflow-y-auto max-h-[60vh]">
                    {error ? (
                        <div className="text-center text-red-500 py-8">
                            <p>{error}</p>
                            <button
                                onClick={loadStats}
                                className="mt-4 px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600"
                            >
                                重试
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* 学习统计卡片 */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                                <StatCard
                                    icon="📚"
                                    label="处理文件"
                                    value={stats?.totalTasks || 0}
                                    unit="个"
                                />
                                <StatCard
                                    icon="✅"
                                    label="完成任务"
                                    value={stats?.completedTasks || 0}
                                    unit="个"
                                />
                                <StatCard
                                    icon="📝"
                                    label="学习词汇"
                                    value={stats?.totalWords || 0}
                                    unit="个"
                                />
                                <StatCard
                                    icon="⏱️"
                                    label="使用天数"
                                    value={stats?.activeDays || 0}
                                    unit="天"
                                />
                            </div>

                            {/* 最近学习记录 */}
                            <div className="bg-gray-50 rounded-xl p-4">
                                <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                                    <span>📋</span> 最近学习记录
                                </h3>
                                {stats?.recentTasks?.length > 0 ? (
                                    <div className="space-y-2">
                                        {stats.recentTasks.map((task, index) => (
                                            <div
                                                key={task.id || index}
                                                className="bg-white p-3 rounded-lg flex items-center justify-between"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <span className="text-lg">
                                                        {task.status === 'completed' ? '✅' : '⏳'}
                                                    </span>
                                                    <div>
                                                        <p className="font-medium text-gray-800 text-sm">
                                                            {task.title || task.fileName || '未命名任务'}
                                                        </p>
                                                        <p className="text-xs text-gray-500">
                                                            {new Date(task.createdAt).toLocaleDateString('zh-CN')}
                                                        </p>
                                                    </div>
                                                </div>
                                                <span className={`text-xs px-2 py-1 rounded-full ${
                                                    task.status === 'completed'
                                                        ? 'bg-green-100 text-green-600'
                                                        : 'bg-yellow-100 text-yellow-600'
                                                }`}>
                                                    {task.status === 'completed' ? '已完成' : '处理中'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-gray-500 text-center py-4">暂无学习记录</p>
                                )}
                            </div>

                            {/* 账号信息 */}
                            <div className="mt-4 text-center text-sm text-gray-500">
                                注册时间: {new Date(user?.createdAt || Date.now()).toLocaleDateString('zh-CN')}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

// 统计卡片子组件
function StatCard({ icon, label, value, unit }) {
    return (
        <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-4 text-center">
            <div className="text-2xl mb-1">{icon}</div>
            <div className="text-2xl font-bold text-gray-800">
                {value}<span className="text-sm font-normal text-gray-500 ml-1">{unit}</span>
            </div>
            <div className="text-xs text-gray-500">{label}</div>
        </div>
    );
}

export default UserStatsPanel;
