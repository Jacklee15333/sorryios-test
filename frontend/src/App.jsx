import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoginPage from './components/LoginPage';
import FileUploader from './components/FileUploader';
import ProgressTracker from './components/ProgressTracker';
import ReportViewer from './components/ReportViewer';
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
                    
                    /* 主内容区占满整个页面 */
                    main {
                        margin-left: 0 !important;
                        width: 100% !important;
                    }
                    
                    /* 确保背景纯白 */
                    html, body {
                        background: white !important;
                    }
                }
            `}</style>

            {/* 左侧导航栏 */}
            <aside className={`
                ${sidebarCollapsed ? 'w-16' : 'w-64'}
                bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900
                text-white flex flex-col transition-all duration-300 shadow-2xl
            `}>
                {/* Logo区域 */}
                <div className="p-6 flex items-center justify-between border-b border-gray-700">
                    {!sidebarCollapsed && (
                        <div className="flex items-center gap-3">
                            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2 rounded-xl">
                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                            </div>
                            <div>
                                <h1 className="font-bold text-lg">Sorryios</h1>
                                <p className="text-xs text-gray-400">AI 智能笔记助手 v4.2</p>
                            </div>
                        </div>
                    )}
                    <button
                        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                        className="p-2 hover:bg-gray-700 rounded-lg transition"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                    </button>
                </div>

                {/* 导航菜单 */}
                <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
                    <button
                        onClick={() => setCurrentPage('upload')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition ${
                            currentPage === 'upload'
                                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg'
                                : 'text-gray-300 hover:bg-gray-800'
                        }`}
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        {!sidebarCollapsed && <span className="font-medium">上传笔记</span>}
                    </button>

                    <button
                        onClick={() => setCurrentPage('history')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition ${
                            currentPage === 'history'
                                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg'
                                : 'text-gray-300 hover:bg-gray-800'
                        }`}
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {!sidebarCollapsed && <span className="font-medium">历史记录</span>}
                        {!sidebarCollapsed && taskHistory.length > 0 && (
                            <span className="ml-auto bg-indigo-500 text-white text-xs px-2 py-0.5 rounded-full">
                                {taskHistory.length}
                            </span>
                        )}
                    </button>

                    <button
                        onClick={() => setCurrentPage('filter')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition ${
                            currentPage === 'filter'
                                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg'
                                : 'text-gray-300 hover:bg-gray-800'
                        }`}
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                        </svg>
                        {!sidebarCollapsed && <span className="font-medium">过滤器</span>}
                    </button>

                    <button
                        onClick={() => setCurrentPage('settings')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition ${
                            currentPage === 'settings'
                                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg'
                                : 'text-gray-300 hover:bg-gray-800'
                        }`}
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        {!sidebarCollapsed && <span className="font-medium">设置</span>}
                    </button>
                </nav>

                {/* 底部用户信息 */}
                <div className="p-4 border-t border-gray-700">
                    {!sidebarCollapsed ? (
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-full flex items-center justify-center font-bold text-white">
                                    {user?.nickname?.[0] || user?.username?.[0] || 'U'}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-sm truncate">{user?.nickname || user?.username}</p>
                                    <p className="text-xs text-gray-400">{user?.role === 'admin' ? '管理员' : '用户'}</p>
                                </div>
                            </div>
                            <button
                                onClick={logout}
                                className="p-2 hover:bg-gray-700 rounded-lg transition"
                                title="退出登录"
                            >
                                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                </svg>
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={logout}
                            className="w-full p-2 hover:bg-gray-700 rounded-lg transition"
                            title="退出登录"
                        >
                            <svg className="w-5 h-5 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                        </button>
                    )}
                </div>
            </aside>

            {/* ========== 🖨️ 打印时隐藏悬浮按钮 ========== */}
            {/* AI智能助手悬浮按钮 */}
            <button className="ai-chat-button fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-full shadow-2xl hover:shadow-indigo-500/50 hover:scale-110 transition-all duration-300 flex items-center justify-center z-50">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
            </button>

            {/* 主内容区 */}
            <main className="flex-1 overflow-y-auto">
                <div className="p-8">
                    {/* 上传页面 */}
                    {currentPage === 'upload' && (
                        <div className="space-y-6">
                            {/* 头部统计 */}
                            <div className="grid grid-cols-4 gap-4">
                                <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl p-6 shadow-lg">
                                    <div className="text-3xl font-bold mb-2">{stats?.totalTasks || 0}</div>
                                    <div className="text-blue-100">总任务数</div>
                                </div>
                                <div className="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-xl p-6 shadow-lg">
                                    <div className="text-3xl font-bold mb-2">{stats?.totalFiles || 0}</div>
                                    <div className="text-green-100">总文件数</div>
                                </div>
                                <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-xl p-6 shadow-lg">
                                    <div className="text-3xl font-bold mb-2">{stats?.totalItems || 0}</div>
                                    <div className="text-purple-100">提取词条</div>
                                </div>
                                <div className="bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-xl p-6 shadow-lg">
                                    <div className="text-3xl font-bold mb-2">{masteredStats?.total || 0}</div>
                                    <div className="text-orange-100">已掌握</div>
                                </div>
                            </div>

                            {/* 文件上传器 */}
                            <FileUploader onUploadSuccess={handleUploadSuccess} />
                        </div>
                    )}

                    {/* 处理中页面 */}
                    {currentPage === 'processing' && (
                        <ProgressTracker
                            taskInfo={taskInfo}
                            connected={connected}
                            logs={logs}
                            onReset={handleReset}
                            onViewReport={() => handleViewReport(currentTaskId)}
                            lastCompletedTask={lastCompletedTask}
                        />
                    )}

                    {/* 报告页面 */}
                    {currentPage === 'report' && (
                        <ReportViewer taskId={currentTaskId} />
                    )}

                    {/* 历史记录 */}
                    {currentPage === 'history' && (
                        <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-2xl font-bold text-gray-800">📚 历史记录</h2>
                                    <p className="text-gray-500 mt-1">查看您的处理历史</p>
                                </div>
                            </div>

                            {taskHistory.length > 0 ? (
                                <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                                    <div className="divide-y divide-gray-100">
                                        {taskHistory.map((task, index) => (
                                            <div key={index} className="p-6 hover:bg-gray-50 transition">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-3 mb-2">
                                                            <h3 className="font-bold text-gray-800 text-lg">{task.title}</h3>
                                                            <span className={`text-xs px-3 py-1 rounded-full font-medium ${
                                                                task.status === 'completed' ? 'bg-green-100 text-green-700' :
                                                                task.status === 'processing' ? 'bg-blue-100 text-blue-700' :
                                                                task.status === 'error' ? 'bg-red-100 text-red-700' :
                                                                'bg-gray-100 text-gray-700'
                                                            }`}>
                                                                {task.status === 'completed' ? '✓ 已完成' :
                                                                 task.status === 'processing' ? '⏳ 处理中' :
                                                                 task.status === 'error' ? '✗ 失败' : '等待中'}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-6 text-sm text-gray-500">
                                                            <span>📄 {task.fileName}</span>
                                                            <span>🕒 {new Date(task.createdAt).toLocaleString('zh-CN')}</span>
                                                            {task.totalItems > 0 && (
                                                                <span>📊 提取 {task.totalItems} 项</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {task.status === 'completed' && (
                                                        <button
                                                            onClick={() => handleViewReport(task.id)}
                                                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition"
                                                        >
                                                            查看报告
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-white rounded-xl shadow-sm p-12 text-center">
                                    <span className="text-6xl block mb-4">📭</span>
                                    <p className="text-gray-500 text-lg">暂无历史记录</p>
                                    <p className="text-gray-400 text-sm mt-2">上传笔记后将在此显示</p>
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
                                    <p><span className="font-medium">版本：</span>v4.2.3</p>
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