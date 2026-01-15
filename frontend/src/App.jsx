import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoginPage from './components/LoginPage';
import FileUploader from './components/FileUploader';
import ProgressTracker from './components/ProgressTracker';
import ReportViewer from './components/ReportViewer';
import useTaskProgress from './hooks/useTaskProgress';

/**
 * 主应用内容组件 - 全屏侧边栏布局
 * v4.2.2: 修复任务完成后不跳转，在当前页面显示查看报告按钮
 */
function AppContent() {
    const { user, loading, logout, isAuthenticated } = useAuth();
    
    // 当前页面: upload | processing | report | history | filter | settings
    const [currentPage, setCurrentPage] = useState('upload');
    const [currentTaskId, setCurrentTaskId] = useState(null);
    const [taskInfo, setTaskInfo] = useState(null);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [lastCompletedTask, setLastCompletedTask] = useState(null);

    // 学习数据
    const [stats, setStats] = useState(null);
    const [masteredWords, setMasteredWords] = useState([]);
    const [masteredStats, setMasteredStats] = useState(null);
    const [taskHistory, setTaskHistory] = useState([]);

    // 🔧 修改：添加 logs
    const { progress, connected, logs } = useTaskProgress(currentTaskId);

    // 当收到进度更新时，更新任务信息
    useEffect(() => {
        if (progress) {
            setTaskInfo(prev => ({
                ...prev,
                ...progress
            }));
            
            // 🔧 修改：任务完成后不跳转，保持在处理页面显示完成状态
            if (progress.status === 'completed') {
                setLastCompletedTask({
                    id: currentTaskId,
                    title: taskInfo?.customTitle || progress.customTitle || '课堂笔记'
                });
                loadUserData();  // 刷新数据
                // 🚫 移除自动跳转：setTimeout(() => setCurrentPage('upload'), 500);
                // 现在用户需要点击"查看报告"按钮
            }
        }
    }, [progress]);

    // 加载用户数据
    useEffect(() => {
        if (isAuthenticated) {
            loadUserData();
        }
    }, [isAuthenticated]);

    const loadUserData = async () => {
        try {
            const token = localStorage.getItem('token');
            
            // 加载学习统计
            const statsRes = await fetch('/api/user/stats', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (statsRes.ok) {
                const data = await statsRes.json();
                setStats(data);
                setTaskHistory(data.recentTasks || []);
            }

            // 加载已掌握词汇统计
            const masteredStatsRes = await fetch('/api/user-mastered/stats', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (masteredStatsRes.ok) {
                const data = await masteredStatsRes.json();
                setMasteredStats(data.stats);
            }

            // 加载已掌握词汇列表
            const masteredListRes = await fetch('/api/user-mastered/list', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (masteredListRes.ok) {
                const data = await masteredListRes.json();
                setMasteredWords(data.words || []);
            }
        } catch (err) {
            console.error('加载数据失败:', err);
        }
    };

    // 加载中
    if (loading) {
        return (
            <div className="min-h-screen bg-gray-100 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin h-12 w-12 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                    <p className="text-gray-600">加载中...</p>
                </div>
            </div>
        );
    }

    // 未登录显示登录页
    if (!isAuthenticated) {
        return <LoginPage />;
    }

    // 上传成功
    const handleUploadSuccess = (data) => {
        setLastCompletedTask(null);
        setCurrentTaskId(data.task.id);
        setTaskInfo({
            id: data.task.id,
            status: data.task.status,
            progress: 0,
            currentStep: '任务已创建，等待处理...',
            file: data.task.file,
            customTitle: data.task.customTitle
        });
        setCurrentPage('processing');
    };

    // 重置
    const handleReset = () => {
        setCurrentPage('upload');
        setCurrentTaskId(null);
        setTaskInfo(null);
        setLastCompletedTask(null);
        loadUserData();
    };

    // 查看报告
    const handleViewReport = (taskId = null) => {
        if (taskId) setCurrentTaskId(taskId);
        setCurrentPage('report');
    };

    // 移除已掌握词汇
    const handleRemoveMastered = async (word, wordType) => {
        try {
            const token = localStorage.getItem('token');
            await fetch('/api/user-mastered/remove', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ word, wordType })
            });
            loadUserData();
        } catch (err) {
            console.error('移除失败:', err);
        }
    };

    // 清空所有已掌握词汇
    const handleClearAll = async () => {
        if (!confirm('确定要清空所有已掌握词汇吗？')) return;
        try {
            const token = localStorage.getItem('token');
            await fetch('/api/user-mastered/clear', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            loadUserData();
        } catch (err) {
            console.error('清空失败:', err);
        }
    };

    // 侧边栏菜单
    const menuItems = [
        { id: 'upload', icon: '📤', label: '上传笔记', badge: null },
        { id: 'history', icon: '📋', label: '历史记录', badge: taskHistory.length || null },
        { id: 'filter', icon: '🔧', label: '过滤器', badge: masteredStats?.total || null },
        { id: 'settings', icon: '⚙️', label: '设置', badge: null },
    ];

    return (
        <div className="min-h-screen bg-gray-100 flex">
            {/* 侧边栏 */}
            <aside className={`${sidebarCollapsed ? 'w-16' : 'w-64'} bg-slate-800 text-white flex flex-col transition-all duration-300`}>
                {/* Logo */}
                <div className="p-4 border-b border-slate-700">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">🤖</span>
                        {!sidebarCollapsed && (
                            <div>
                                <h1 className="font-bold text-lg">Sorryios AI</h1>
                                <p className="text-xs text-slate-400">智能笔记助手 v4.2</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* 用户信息 */}
                <div className="p-4 border-b border-slate-700">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full flex items-center justify-center text-lg font-bold">
                            {(user?.username || 'U').charAt(0).toUpperCase()}
                        </div>
                        {!sidebarCollapsed && (
                            <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{user?.nickname || user?.username}</p>
                                <p className="text-xs text-slate-400">@{user?.username}</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* 统计卡片 */}
                {!sidebarCollapsed && (
                    <div className="p-4 border-b border-slate-700">
                        <div className="grid grid-cols-2 gap-2 text-center">
                            <div className="bg-slate-700/50 rounded-lg p-2">
                                <div className="text-lg font-bold text-indigo-400">{stats?.totalTasks || 0}</div>
                                <div className="text-xs text-slate-400">处理文件</div>
                            </div>
                            <div className="bg-slate-700/50 rounded-lg p-2">
                                <div className="text-lg font-bold text-green-400">{masteredStats?.total || 0}</div>
                                <div className="text-xs text-slate-400">已掌握</div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 菜单 */}
                <nav className="flex-1 p-2">
                    {menuItems.map(item => (
                        <button
                            key={item.id}
                            onClick={() => setCurrentPage(item.id)}
                            className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg mb-1 transition-colors ${
                                currentPage === item.id
                                    ? 'bg-indigo-600 text-white'
                                    : 'text-slate-300 hover:bg-slate-700'
                            }`}
                        >
                            <span className="text-xl">{item.icon}</span>
                            {!sidebarCollapsed && (
                                <>
                                    <span className="flex-1 text-left">{item.label}</span>
                                    {item.badge && (
                                        <span className="bg-slate-600 text-xs px-2 py-0.5 rounded-full">
                                            {item.badge}
                                        </span>
                                    )}
                                </>
                            )}
                        </button>
                    ))}
                </nav>

                {/* 底部 */}
                <div className="p-2 border-t border-slate-700">
                    <button
                        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:bg-slate-700 transition-colors"
                    >
                        <span className="text-xl">{sidebarCollapsed ? '→' : '←'}</span>
                        {!sidebarCollapsed && <span>收起侧边栏</span>}
                    </button>
                    <button
                        onClick={logout}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-red-400 hover:bg-slate-700 transition-colors mt-1"
                    >
                        <span className="text-xl">🚪</span>
                        {!sidebarCollapsed && <span>退出登录</span>}
                    </button>
                </div>
            </aside>

            {/* 主内容区 */}
            <main className="flex-1 flex flex-col min-h-screen">
                {/* 顶部栏 */}
                <header className="bg-white shadow-sm px-6 py-4 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800">
                            {currentPage === 'upload' && '📤 上传笔记'}
                            {currentPage === 'processing' && '⏳ 处理中'}
                            {currentPage === 'report' && '📊 查看报告'}
                            {currentPage === 'history' && '📋 历史记录'}
                            {currentPage === 'filter' && '🔧 过滤器管理'}
                            {currentPage === 'settings' && '⚙️ 设置'}
                        </h2>
                        <p className="text-sm text-gray-500">
                            {currentPage === 'upload' && '上传课堂录音转文字文件，AI 自动提取关键词'}
                            {currentPage === 'processing' && '正在处理文件，请稍候...'}
                            {currentPage === 'report' && '查看和管理提取结果'}
                            {currentPage === 'history' && '查看所有处理过的文件'}
                            {currentPage === 'filter' && '管理已掌握的词汇，下次生成时自动过滤'}
                            {currentPage === 'settings' && '账户信息和系统设置'}
                        </p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
                            <span className="text-sm text-gray-500">{connected ? '已连接' : '未连接'}</span>
                        </div>
                    </div>
                </header>

                {/* 内容区 */}
                <div className="flex-1 p-6 overflow-auto">
                    {/* 上传页面 */}
                    {currentPage === 'upload' && (
                        <div className="max-w-2xl mx-auto">
                            <div className="bg-white rounded-xl shadow-sm p-6">
                                <FileUploader
                                    onUploadStart={() => setLastCompletedTask(null)}
                                    onUploadSuccess={handleUploadSuccess}
                                    onUploadError={(err) => alert('上传失败: ' + err)}
                                />
                            </div>

                            {/* 任务完成提示 */}
                            {lastCompletedTask && (
                                <div className="mt-6 bg-green-50 border border-green-200 rounded-xl p-6 text-center">
                                    <div className="text-5xl mb-4">🎉</div>
                                    <h3 className="text-xl font-bold text-green-800 mb-2">处理完成！</h3>
                                    <p className="text-green-600 mb-4">
                                        {lastCompletedTask.title || '课堂笔记'} 已成功生成报告
                                    </p>
                                    <button
                                        onClick={() => handleViewReport(lastCompletedTask.id)}
                                        className="px-8 py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-medium rounded-xl shadow-lg hover:shadow-xl transition-all"
                                    >
                                        📊 查看报告
                                    </button>
                                </div>
                            )}

                            {/* 功能说明 */}
                            <div className="mt-6 grid grid-cols-3 gap-4">
                                <div className="bg-white rounded-xl p-4 text-center shadow-sm">
                                    <div className="text-2xl mb-2">📝</div>
                                    <div className="font-medium text-gray-700">智能分段</div>
                                    <div className="text-xs text-gray-500 mt-1">自动切分长文本</div>
                                </div>
                                <div className="bg-white rounded-xl p-4 text-center shadow-sm">
                                    <div className="text-2xl mb-2">🤖</div>
                                    <div className="font-medium text-gray-700">AI 分析</div>
                                    <div className="text-xs text-gray-500 mt-1">提取关键词汇语法</div>
                                </div>
                                <div className="bg-white rounded-xl p-4 text-center shadow-sm">
                                    <div className="text-2xl mb-2">📊</div>
                                    <div className="font-medium text-gray-700">生成报告</div>
                                    <div className="text-xs text-gray-500 mt-1">多格式导出下载</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 🔧 修改：处理中页面 - 不再区分完成状态，统一由 ProgressTracker 处理 */}
                    {currentPage === 'processing' && taskInfo && (
                        <div className="max-w-3xl mx-auto">
                            <ProgressTracker
                                task={taskInfo}
                                logs={logs}
                                onCancel={handleReset}
                                onViewReport={() => setCurrentPage('report')}
                            />
                            
                            {/* 只在处理中显示提示 - Claude 风格 */}
                            {taskInfo.status !== 'completed' && taskInfo.status !== 'failed' && (
                                <div className="mt-4 rounded-lg p-4 border border-stone-200 text-center" style={{ backgroundColor: '#faf8f5' }}>
                                    <p className="text-sm text-stone-600">
                                        正在处理，请不要关闭浏览器窗口。
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* 报告页面 */}
                    {currentPage === 'report' && currentTaskId && (
                        <div>
                            <ReportViewer taskId={currentTaskId} onBack={handleReset} />
                        </div>
                    )}

                    {/* 历史记录 */}
                    {currentPage === 'history' && (
                        <div className="bg-white rounded-xl shadow-sm">
                            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                                <h3 className="font-bold text-gray-800">处理历史</h3>
                                <span className="text-sm text-gray-500">共 {taskHistory.length} 条</span>
                            </div>
                            {taskHistory.length > 0 ? (
                                <div className="divide-y divide-gray-100">
                                    {taskHistory.map((task, index) => (
                                        <div key={task.id || index} className="p-4 flex items-center justify-between hover:bg-gray-50">
                                            <div className="flex items-center gap-4">
                                                <span className="text-2xl">
                                                    {task.status === 'completed' ? '✅' : task.status === 'failed' ? '❌' : '⏳'}
                                                </span>
                                                <div>
                                                    <p className="font-medium text-gray-800">{task.title || task.fileName || '未命名'}</p>
                                                    <p className="text-sm text-gray-500">{new Date(task.createdAt).toLocaleString('zh-CN')}</p>
                                                </div>
                                            </div>
                                            {task.status === 'completed' && (
                                                <button
                                                    onClick={() => handleViewReport(task.id)}
                                                    className="px-4 py-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg text-sm"
                                                >
                                                    查看报告
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-12 text-center text-gray-500">
                                    <span className="text-4xl block mb-4">📭</span>
                                    <p>暂无处理记录</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* 过滤器管理 */}
                    {currentPage === 'filter' && (
                        <div className="space-y-6">
                            {/* 统计 */}
                            <div className="grid grid-cols-4 gap-4">
                                <div className="bg-white rounded-xl p-4 shadow-sm">
                                    <div className="text-3xl font-bold text-blue-600">{masteredStats?.words || 0}</div>
                                    <div className="text-sm text-gray-500">单词</div>
                                </div>
                                <div className="bg-white rounded-xl p-4 shadow-sm">
                                    <div className="text-3xl font-bold text-green-600">{masteredStats?.phrases || 0}</div>
                                    <div className="text-sm text-gray-500">短语</div>
                                </div>
                                <div className="bg-white rounded-xl p-4 shadow-sm">
                                    <div className="text-3xl font-bold text-purple-600">{masteredStats?.patterns || 0}</div>
                                    <div className="text-sm text-gray-500">句型</div>
                                </div>
                                <div className="bg-white rounded-xl p-4 shadow-sm">
                                    <div className="text-3xl font-bold text-orange-600">{masteredStats?.grammars || 0}</div>
                                    <div className="text-sm text-gray-500">语法</div>
                                </div>
                            </div>

                            {/* 列表 */}
                            <div className="bg-white rounded-xl shadow-sm">
                                <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                                    <div>
                                        <h3 className="font-bold text-gray-800">已掌握词汇</h3>
                                        <p className="text-sm text-gray-500">这些词汇在生成报告时可自动过滤</p>
                                    </div>
                                    {masteredWords.length > 0 && (
                                        <button
                                            onClick={handleClearAll}
                                            className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm"
                                        >
                                            清空全部
                                        </button>
                                    )}
                                </div>
                                {masteredWords.length > 0 ? (
                                    <div className="divide-y divide-gray-100 max-h-[500px] overflow-auto">
                                        {masteredWords.map((item, index) => (
                                            <div key={index} className="p-4 flex items-center justify-between hover:bg-gray-50">
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
                                                <div className="flex items-center gap-3">
                                                    <span className="text-sm text-gray-400">
                                                        {new Date(item.created_at).toLocaleDateString('zh-CN')}
                                                    </span>
                                                    <button
                                                        onClick={() => handleRemoveMastered(item.word, item.word_type)}
                                                        className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-600 rounded text-sm"
                                                    >
                                                        移除
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-12 text-center text-gray-500">
                                        <span className="text-4xl block mb-4">📝</span>
                                        <p>暂无已掌握词汇</p>
                                        <p className="text-sm mt-2">在报告中点击"已掌握"按钮添加</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* 设置 */}
                    {currentPage === 'settings' && (
                        <div className="max-w-2xl space-y-6">
                            {/* 账户信息 */}
                            <div className="bg-white rounded-xl shadow-sm">
                                <div className="p-4 border-b border-gray-100">
                                    <h3 className="font-bold text-gray-800">👤 账户信息</h3>
                                </div>
                                <div className="p-4 space-y-4">
                                    <div className="flex items-center justify-between py-2 border-b border-gray-100">
                                        <span className="text-gray-600">用户名</span>
                                        <span className="font-medium text-gray-800">{user?.username}</span>
                                    </div>
                                    <div className="flex items-center justify-between py-2 border-b border-gray-100">
                                        <span className="text-gray-600">昵称</span>
                                        <span className="font-medium text-gray-800">{user?.nickname || user?.username}</span>
                                    </div>
                                    <div className="flex items-center justify-between py-2 border-b border-gray-100">
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
                            <div className="bg-white rounded-xl shadow-sm">
                                <div className="p-4 border-b border-gray-100">
                                    <h3 className="font-bold text-gray-800">🗄️ 数据管理</h3>
                                </div>
                                <div className="p-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-medium text-gray-800">清空已掌握词汇</p>
                                            <p className="text-sm text-gray-500">重置所有已标记为"已掌握"的词汇</p>
                                        </div>
                                        <button
                                            onClick={handleClearAll}
                                            className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm"
                                        >
                                            清空
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* 关于 */}
                            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-6">
                                <h3 className="font-bold text-gray-800 mb-4">ℹ️ 关于</h3>
                                <div className="space-y-2 text-sm text-gray-600">
                                    <p><span className="font-medium">应用名称：</span>Sorryios AI 智能笔记助手</p>
                                    <p><span className="font-medium">版本：</span>v4.2.2</p>
                                    <p><span className="font-medium">功能：</span>课堂笔记自动化处理系统</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}

/**
 * 主应用组件
 */
function App() {
    return (
        <AuthProvider>
            <AppContent />
        </AuthProvider>
    );
}

export default App;