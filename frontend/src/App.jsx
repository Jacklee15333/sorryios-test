import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoginPage from './components/LoginPage';
import FileUploader from './components/FileUploader';
import ProgressTracker from './components/ProgressTracker';
import ReportViewer from './components/ReportViewer';
import MasteredWords from './components/MasteredWords';
import useTaskProgress from './hooks/useTaskProgress';

/**
 * 主应用内容组件 - 全屏侧边栏布局
 * v4.2.3: 修复PDF导出 - 隐藏侧边栏和悬浮框
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

    return (
        <div className="flex h-screen bg-gray-50 overflow-hidden">
            {/* ========== 🖨️ 打印时隐藏侧边栏和悬浮元素 ========== */}
            <style>{`
                @media print {
                    /* 强制隐藏侧边栏 */
                    aside,
                    aside * {
                        display: none !important;
                        visibility: hidden !important;
                        opacity: 0 !important;
                        width: 0 !important;
                        height: 0 !important;
                        position: absolute !important;
                        left: -9999px !important;
                    }
                    
                    /* 强制隐藏AI助手按钮 */
                    .ai-chat-button,
                    .ai-chat-button * {
                        display: none !important;
                        visibility: hidden !important;
                        opacity: 0 !important;
                        width: 0 !important;
                        height: 0 !important;
                        position: absolute !important;
                        left: -9999px !important;
                    }
                    
                    /* 强制隐藏悬浮窗和弹窗 */
                    .fixed,
                    .sticky,
                    [role="dialog"],
                    [role="alertdialog"] {
                        display: none !important;
                        visibility: hidden !important;
                    }
                    
                    /* 主内容区占满整个页面 */
                    main {
                        margin: 0 !important;
                        padding: 20px !important;
                        width: 100% !important;
                        max-width: 100% !important;
                    }
                }
            `}</style>

            {/* 侧边栏 */}
            <aside className={`${sidebarCollapsed ? 'w-16' : 'w-64'} bg-gradient-to-br from-indigo-900 via-indigo-800 to-purple-900 text-white flex-shrink-0 transition-all duration-300 shadow-2xl`}>
                <div className="p-4 flex items-center justify-between border-b border-indigo-700">
                    {!sidebarCollapsed && (
                        <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-xl flex items-center justify-center shadow-lg">
                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                                </svg>
                            </div>
                            <div>
                                <h1 className="text-xl font-bold bg-gradient-to-r from-yellow-200 to-yellow-400 bg-clip-text text-transparent">Sorryios</h1>
                                <p className="text-xs text-indigo-300">AI 智能笔记助手 v4.2</p>
                            </div>
                        </div>
                    )}
                    <button 
                        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                        className="p-2 hover:bg-indigo-700 rounded-lg transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            {sidebarCollapsed ? (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                            ) : (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                            )}
                        </svg>
                    </button>
                </div>

                <nav className="mt-6 px-2 space-y-1">
                    <button
                        onClick={() => {
                            // 🔧 修复：只切换页面，不清空任务信息
                            // 这样可以在不同页面间自由切换，再回来时任务还在
                            setCurrentPage('upload');
                        }}
                        className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                            currentPage === 'upload'
                                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 shadow-lg transform scale-105'
                                : 'hover:bg-indigo-700/50'
                        }`}
                    >
                        <svg className="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        {!sidebarCollapsed && <span className="font-medium">上传笔记</span>}
                    </button>

                    {/* 🆕 如果有正在进行的任务，显示"处理中"按钮 */}
                    {taskInfo && taskInfo.status === 'processing' && (
                        <button
                            onClick={() => setCurrentPage('processing')}
                            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                                currentPage === 'processing'
                                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 shadow-lg transform scale-105'
                                    : 'bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-400'
                            } relative animate-pulse`}
                        >
                            <svg className="w-6 h-6 flex-shrink-0 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            {!sidebarCollapsed && (
                                <>
                                    <span className="font-medium text-yellow-400">处理中</span>
                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 bg-yellow-400 text-indigo-900 text-xs font-bold px-2 py-1 rounded-full">
                                        {taskInfo.progress}%
                                    </span>
                                </>
                            )}
                        </button>
                    )}

                    <button
                        onClick={() => setCurrentPage('history')}
                        className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                            currentPage === 'history'
                                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 shadow-lg transform scale-105'
                                : 'hover:bg-indigo-700/50'
                        }`}
                    >
                        <svg className="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {!sidebarCollapsed && <span className="font-medium">历史记录</span>}
                    </button>

                    <button
                        onClick={() => setCurrentPage('filter')}
                        className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                            currentPage === 'filter'
                                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 shadow-lg transform scale-105'
                                : 'hover:bg-indigo-700/50'
                        }`}
                    >
                        <svg className="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {!sidebarCollapsed && <span className="font-medium">已掌握</span>}
                    </button>
                </nav>

                {/* 用户信息 */}
                {!sidebarCollapsed && (
                    <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-indigo-700 bg-indigo-900/50 backdrop-blur-sm">
                        <div className="flex items-center space-x-3 mb-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-pink-400 to-purple-500 rounded-full flex items-center justify-center text-white font-bold shadow-lg">
                                {user?.username?.[0]?.toUpperCase() || 'U'}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-white truncate">{user?.username || '用户'}</p>
                                <p className="text-xs text-indigo-300">
                                    {stats ? `已处理 ${stats.tasksCompleted || 0} 个笔记` : '加载中...'}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={logout}
                            className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-indigo-700 hover:bg-indigo-600 rounded-lg transition-colors text-sm font-medium"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                            <span>退出登录</span>
                        </button>
                    </div>
                )}
            </aside>

            {/* 主内容区 */}
            <main className="flex-1 overflow-auto bg-gradient-to-br from-gray-50 to-indigo-50">
                <div className="max-w-7xl mx-auto p-8">
                    {/* 上传页面 */}
                    {currentPage === 'upload' && (
                        <FileUploader
                            onUploadSuccess={handleUploadSuccess}
                            stats={stats}
                        />
                    )}

                    {/* 处理中页面 */}
                    {currentPage === 'processing' && (
                        <ProgressTracker
                            taskInfo={taskInfo}
                            connected={connected}
                            logs={logs}
                            onReset={handleReset}
                            onViewReport={() => handleViewReport(currentTaskId)}
                        />
                    )}

                    {/* 报告页面 */}
                    {currentPage === 'report' && (
                        <ReportViewer
                            taskId={currentTaskId}
                            onBack={handleReset}
                        />
                    )}

                    {/* 历史记录 */}
                    {currentPage === 'history' && (
                        <div className="bg-white rounded-2xl shadow-xl p-8">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-2xl font-bold text-gray-800 flex items-center space-x-3">
                                    <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span>历史记录</span>
                                </h2>
                                <span className="text-sm text-gray-500">
                                    共 {taskHistory.length} 条记录
                                </span>
                            </div>

                            {taskHistory.length === 0 ? (
                                <div className="text-center py-16">
                                    <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                    </div>
                                    <p className="text-gray-500 mb-2">还没有处理过笔记</p>
                                    <button
                                        onClick={() => setCurrentPage('upload')}
                                        className="text-indigo-600 hover:text-indigo-700 font-medium"
                                    >
                                        去上传第一个笔记 →
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {taskHistory.map((task, index) => (
                                        <div
                                            key={task.id}
                                            className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-5 hover:shadow-lg transition-all duration-200 cursor-pointer border border-indigo-100"
                                            onClick={() => handleViewReport(task.id)}
                                        >
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1">
                                                    <div className="flex items-center space-x-3 mb-2">
                                                        <span className="text-lg font-semibold text-gray-800">
                                                            {task.customTitle || task.fileName}
                                                        </span>
                                                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                                                            task.status === 'completed'
                                                                ? 'bg-green-100 text-green-700'
                                                                : task.status === 'failed'
                                                                ? 'bg-red-100 text-red-700'
                                                                : 'bg-yellow-100 text-yellow-700'
                                                        }`}>
                                                            {task.status === 'completed' ? '✓ 已完成' : task.status === 'failed' ? '✗ 失败' : '处理中'}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center space-x-4 text-sm text-gray-600">
                                                        <span className="flex items-center">
                                                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                            </svg>
                                                            {new Date(task.createdAt).toLocaleString()}
                                                        </span>
                                                        {task.stats && (
                                                            <>
                                                                <span className="text-indigo-600 font-medium">
                                                                    {task.stats.exactMatch || 0} 精确
                                                                </span>
                                                                <span className="text-purple-600 font-medium">
                                                                    {task.stats.fuzzyMatch || 0} 模糊
                                                                </span>
                                                                <span className="text-orange-600 font-medium">
                                                                    {task.stats.unmatched || 0} 未匹配
                                                                </span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                                <svg className="w-6 h-6 text-indigo-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                </svg>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* 已掌握词汇 */}
                    {currentPage === 'filter' && (
                        <MasteredWords
                            words={masteredWords}
                            stats={masteredStats}
                            onRemove={handleRemoveMastered}
                            onClearAll={handleClearAll}
                        />
                    )}
                </div>
            </main>
        </div>
    );
}

/**
 * 主应用组件 - 包裹 AuthProvider
 */
function App() {
    return (
        <AuthProvider>
            <AppContent />
        </AuthProvider>
    );
}

export default App;