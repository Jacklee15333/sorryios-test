import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoginPage from './components/LoginPage';
import FileUploader from './components/FileUploader';
import ProgressTracker from './components/ProgressTracker';
import ReportViewer from './components/ReportViewer';
import MasteredWords from './components/MasteredWords';
import useTaskProgress from './hooks/useTaskProgress';
import ExamUploader from './components/ExamUploader';
import WrongQuestionBook from './components/WrongQuestionBook';
import ExamReportViewer from './components/ExamReportViewer';

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

    // 🆕 错题收集相关状态
    const [examTaskId, setExamTaskId] = useState(null);
    const [currentExamId, setCurrentExamId] = useState(null); // 🆕 当前查看的试卷ID（用于错题报告）
    const [examHistory, setExamHistory] = useState([]); // 🆕 试卷历史记录

    // 学习数据
    const [stats, setStats] = useState(null);
    const [masteredWords, setMasteredWords] = useState([]);
    const [masteredStats, setMasteredStats] = useState(null);
    const [taskHistory, setTaskHistory] = useState([]);
    const [savedReports, setSavedReports] = useState([]); // 🆕 已保存报告列表
    const [savedReportHiddenItems, setSavedReportHiddenItems] = useState(null); // 🆕 当前查看的已保存报告的隐藏项

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
            // 🔧 兼容 'completed'（课堂笔记）和 'done'（试卷错题）两种完成状态
            if (progress.status === 'completed' || progress.status === 'done') {
                console.log(`[App] 任务完成, status=${progress.status}, taskId=${currentTaskId}`);
                
                // 判断是试卷任务还是课堂笔记任务
                if (currentTaskId && currentTaskId.startsWith('exam_')) {
                    // 🆕 试卷任务完成 - 提取 examId
                    const completedExamId = parseInt(currentTaskId.replace('exam_', ''));
                    console.log(`[App] 试卷任务完成, examId: ${completedExamId}`);
                    setCurrentExamId(completedExamId);
                    setLastCompletedTask({
                        id: currentTaskId,
                        examId: completedExamId,
                        title: taskInfo?.customTitle || progress.customTitle || '试卷错题',
                        type: 'exam'
                    });
                } else {
                    // 课堂笔记任务完成
                    setLastCompletedTask({
                        id: currentTaskId,
                        title: taskInfo?.customTitle || progress.customTitle || '课堂笔记',
                        type: 'note'
                    });
                }
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

            // 🆕 加载试卷历史列表
            try {
                const examListRes = await fetch('/api/exam/list', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (examListRes.ok) {
                    const data = await examListRes.json();
                    console.log(`[App] 加载试卷历史: ${data.exams?.length || 0} 条`);
                    setExamHistory(data.exams || []);
                }
            } catch (examErr) {
                console.error('[App] 加载试卷历史失败:', examErr);
            }

            // 🆕 加载已保存报告列表
            try {
                const savedRes = await fetch('/api/saved-report/list', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (savedRes.ok) {
                    const data = await savedRes.json();
                    console.log(`[App] 加载已保存报告: ${data.reports?.length || 0} 条`);
                    setSavedReports(data.reports || []);
                }
            } catch (savedErr) {
                console.error('[App] 加载已保存报告失败:', savedErr);
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
        setSavedReportHiddenItems(null); // 清除已保存的隐藏项
        setCurrentPage('report');
    };

    // 🆕 查看已保存报告
    const handleViewSavedReport = (report) => {
        console.log(`[App] 查看已保存报告: id=${report.id}, task=${report.task_id}`);
        setCurrentTaskId(report.task_id);
        setSavedReportHiddenItems(report.hiddenItems || []);
        setCurrentPage('report');
    };

    // 🆕 删除已保存报告
    const handleDeleteSavedReport = async (reportId, e) => {
        e.stopPropagation();
        if (!confirm('确定要删除这个已保存的报告吗？')) return;
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/saved-report/${reportId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                loadUserData();
            }
        } catch (err) {
            console.error('删除失败:', err);
        }
    };

    // 🆕 错题上传成功
    const handleExamUploadSuccess = (data) => {
        console.log('[App] 错题上传成功:', data);
        setExamTaskId(data.taskId);
        setCurrentTaskId(data.taskId);
        setCurrentExamId(data.examId); // 🆕 保存 examId
        setTaskInfo({
            id: data.taskId,
            status: 'processing',
            progress: 0,
            currentStep: '识别任务已启动...',
            customTitle: data.title
        });
        setCurrentPage('exam-progress');
    };

    // 🆕 查看试卷错题报告
    const handleViewExamReport = (examId) => {
        console.log(`[App] 查看试卷错题报告, examId: ${examId}`);
        setCurrentExamId(examId);
        setCurrentPage('exam-report');
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
            <aside className={`${sidebarCollapsed ? 'w-16' : 'w-64'} relative bg-gradient-to-br from-indigo-900 via-indigo-800 to-purple-900 text-white flex-shrink-0 transition-all duration-300 shadow-2xl overflow-hidden`}>
                <div className="p-4 flex items-center justify-between border-b border-indigo-700">
                    {!sidebarCollapsed && (
                        <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-xl flex items-center justify-center shadow-lg">
                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                                </svg>
                            </div>
                            <div>
                                <h1 className="text-xl font-bold bg-gradient-to-r from-yellow-200 to-yellow-400 bg-clip-text text-transparent">智学笔记</h1>
                                <p className="text-xs text-indigo-300">智能学习报告系统</p>
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

                <nav className="mt-6 px-2 space-y-1 pb-32">
                    {/* ═══ 📖 课堂笔记分组 ═══ */}
                    {!sidebarCollapsed && (
                        <p className="px-4 pt-3 pb-1 text-xs font-semibold text-indigo-400 uppercase tracking-wider">📖 课堂笔记</p>
                    )}
                    <button
                        onClick={() => {
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

                    {/* 如果有正在进行的单词任务 */}
                    {taskInfo && taskInfo.status === 'processing' && currentPage !== 'exam-progress' && (
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

                    {/* ═══ 📝 错题收集分组 ═══ */}
                    {!sidebarCollapsed && (
                        <p className="px-4 pt-5 pb-1 text-xs font-semibold text-indigo-400 uppercase tracking-wider">📝 错题收集</p>
                    )}
                    <button
                        onClick={() => setCurrentPage('exam-upload')}
                        className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                            currentPage === 'exam-upload'
                                ? 'bg-gradient-to-r from-orange-500 to-red-500 shadow-lg transform scale-105'
                                : 'hover:bg-indigo-700/50'
                        }`}
                    >
                        <svg className="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        {!sidebarCollapsed && <span className="font-medium">上传试卷</span>}
                    </button>

                    {/* 如果有正在进行的错题识别任务 */}
                    {currentPage === 'exam-progress' && taskInfo && taskInfo.status === 'processing' && (
                        <button
                            onClick={() => setCurrentPage('exam-progress')}
                            className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl bg-orange-500/20 hover:bg-orange-500/30 border border-orange-400 relative animate-pulse"
                        >
                            <svg className="w-6 h-6 flex-shrink-0 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            {!sidebarCollapsed && (
                                <>
                                    <span className="font-medium text-orange-400">识别中</span>
                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 bg-orange-400 text-indigo-900 text-xs font-bold px-2 py-1 rounded-full">
                                        {taskInfo.progress}%
                                    </span>
                                </>
                            )}
                        </button>
                    )}

                    <button
                        onClick={() => setCurrentPage('exam-book')}
                        className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                            currentPage === 'exam-book'
                                ? 'bg-gradient-to-r from-orange-500 to-red-500 shadow-lg transform scale-105'
                                : 'hover:bg-indigo-700/50'
                        }`}
                    >
                        <svg className="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                        {!sidebarCollapsed && <span className="font-medium">错题本</span>}
                    </button>

                    {/* ═══ 📊 通用功能 ═══ */}
                    {!sidebarCollapsed && (
                        <p className="px-4 pt-5 pb-1 text-xs font-semibold text-indigo-400 uppercase tracking-wider">📊 通用</p>
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

                    {/* 🆕 已保存报告 */}
                    <button
                        onClick={() => setCurrentPage('saved')}
                        className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                            currentPage === 'saved'
                                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 shadow-lg transform scale-105'
                                : 'hover:bg-indigo-700/50'
                        }`}
                    >
                        <svg className="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                        </svg>
                        {!sidebarCollapsed && (
                            <span className="font-medium">
                                已保存{savedReports.length > 0 ? ` (${savedReports.length})` : ''}
                            </span>
                        )}
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
                            initialHiddenItems={savedReportHiddenItems}
                            onSaved={() => loadUserData()}
                        />
                    )}

                    {/* 🆕 已保存报告列表 */}
                    {currentPage === 'saved' && (
                        <div className="bg-white rounded-2xl shadow-xl p-8">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-2xl font-bold text-gray-800 flex items-center space-x-3">
                                    <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                                    </svg>
                                    <span>已保存报告</span>
                                </h2>
                                <span className="text-sm text-gray-500">
                                    共 {savedReports.length} 份报告
                                </span>
                            </div>

                            {savedReports.length === 0 ? (
                                <div className="text-center py-16">
                                    <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                                        </svg>
                                    </div>
                                    <p className="text-gray-500 mb-2">还没有保存过报告</p>
                                    <p className="text-gray-400 text-sm mb-4">在学习报告中修改内容后，点击"保存报告"按钮即可保存</p>
                                    <button
                                        onClick={() => setCurrentPage('history')}
                                        className="text-indigo-600 hover:text-indigo-700 font-medium"
                                    >
                                        去历史记录查看报告 →
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {savedReports.map((report) => (
                                        <div
                                            key={`saved-${report.id}`}
                                            className="rounded-xl p-5 hover:shadow-lg transition-all duration-200 cursor-pointer border bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-100"
                                            onClick={() => handleViewSavedReport(report)}
                                        >
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1">
                                                    <div className="flex items-center space-x-3 mb-2">
                                                        <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                                                            📑 已保存
                                                        </span>
                                                        <span className="text-lg font-semibold text-gray-800">
                                                            {report.title || report.task_title || '学习报告'}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center space-x-4 text-sm text-gray-600">
                                                        <span className="flex items-center">
                                                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                            </svg>
                                                            {report.updated_at ? new Date(report.updated_at).toLocaleString() : ''}
                                                        </span>
                                                        {report.word_count > 0 && (
                                                            <span className="text-indigo-600 font-medium">
                                                                📚 {report.word_count} 单词
                                                            </span>
                                                        )}
                                                        {report.phrase_count > 0 && (
                                                            <span className="text-purple-600 font-medium">
                                                                📝 {report.phrase_count} 短语
                                                            </span>
                                                        )}
                                                        {report.grammar_count > 0 && (
                                                            <span className="text-orange-600 font-medium">
                                                                📖 {report.grammar_count} 语法
                                                            </span>
                                                        )}
                                                        {(report.hiddenItems?.length || 0) > 0 && (
                                                            <span className="text-gray-400">
                                                                已筛除 {report.hiddenItems.length} 项
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex items-center space-x-2">
                                                    <button
                                                        onClick={(e) => handleDeleteSavedReport(report.id, e)}
                                                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                        title="删除"
                                                    >
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                    </button>
                                                    <svg className="w-6 h-6 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                    </svg>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* 历史记录 - 混合显示课堂笔记 + 试卷错题 */}
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
                                    共 {taskHistory.length + examHistory.length} 条记录
                                </span>
                            </div>

                            {taskHistory.length === 0 && examHistory.length === 0 ? (
                                <div className="text-center py-16">
                                    <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                    </div>
                                    <p className="text-gray-500 mb-2">还没有任何记录</p>
                                    <button
                                        onClick={() => setCurrentPage('upload')}
                                        className="text-indigo-600 hover:text-indigo-700 font-medium"
                                    >
                                        去上传第一个笔记 →
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {/* 合并课堂笔记和试卷历史，按时间倒序排列 */}
                                    {[
                                        // 课堂笔记记录
                                        ...taskHistory.map(task => ({
                                            ...task,
                                            _type: 'note',
                                            _time: task.createdAt || task.created_at || '',
                                            _title: task.customTitle || task.fileName || '课堂笔记',
                                            _status: task.status,
                                        })),
                                        // 试卷错题记录
                                        ...examHistory.map(exam => ({
                                            ...exam,
                                            _type: 'exam',
                                            _time: exam.createdAt || exam.created_at || '',
                                            _title: exam.title || `试卷 #${exam.id}`,
                                            _status: exam.status === 'done' ? 'completed' : exam.status,
                                        }))
                                    ]
                                    .sort((a, b) => new Date(b._time) - new Date(a._time))
                                    .map((item, index) => (
                                        <div
                                            key={`${item._type}-${item.id}-${index}`}
                                            className={`rounded-xl p-5 hover:shadow-lg transition-all duration-200 cursor-pointer border ${
                                                item._type === 'exam'
                                                    ? 'bg-gradient-to-r from-orange-50 to-red-50 border-orange-100'
                                                    : 'bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-100'
                                            }`}
                                            onClick={() => {
                                                if (item._type === 'exam') {
                                                    handleViewExamReport(item.id);
                                                } else {
                                                    handleViewReport(item.id);
                                                }
                                            }}
                                        >
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1">
                                                    <div className="flex items-center space-x-3 mb-2">
                                                        {/* 类型标注 */}
                                                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                                                            item._type === 'exam'
                                                                ? 'bg-orange-100 text-orange-700'
                                                                : 'bg-indigo-100 text-indigo-700'
                                                        }`}>
                                                            {item._type === 'exam' ? '📝 试卷错题' : '📖 课堂笔记'}
                                                        </span>
                                                        <span className="text-lg font-semibold text-gray-800">
                                                            {item._title}
                                                        </span>
                                                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                                                            item._status === 'completed'
                                                                ? 'bg-green-100 text-green-700'
                                                                : item._status === 'failed'
                                                                ? 'bg-red-100 text-red-700'
                                                                : 'bg-yellow-100 text-yellow-700'
                                                        }`}>
                                                            {item._status === 'completed' ? '✓ 已完成' : item._status === 'failed' ? '✗ 失败' : '处理中'}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center space-x-4 text-sm text-gray-600">
                                                        <span className="flex items-center">
                                                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                            </svg>
                                                            {item._time ? new Date(item._time).toLocaleString() : ''}
                                                        </span>
                                                        {/* 课堂笔记的匹配统计 */}
                                                        {item._type === 'note' && item.stats && (
                                                            <>
                                                                <span className="text-indigo-600 font-medium">
                                                                    {item.stats.exactMatch || 0} 精确
                                                                </span>
                                                                <span className="text-purple-600 font-medium">
                                                                    {item.stats.fuzzyMatch || 0} 模糊
                                                                </span>
                                                                <span className="text-orange-600 font-medium">
                                                                    {item.stats.unmatched || 0} 未匹配
                                                                </span>
                                                            </>
                                                        )}
                                                        {/* 试卷错题的统计 */}
                                                        {item._type === 'exam' && (
                                                            <>
                                                                {item.imageCount > 0 && (
                                                                    <span className="text-gray-500">
                                                                        📷 {item.imageCount} 张图片
                                                                    </span>
                                                                )}
                                                                {item.wrongCount > 0 && (
                                                                    <span className="text-red-600 font-medium">
                                                                        ✏️ {item.wrongCount} 道错题
                                                                    </span>
                                                                )}
                                                                {item.totalQuestions > 0 && (
                                                                    <span className="text-gray-500">
                                                                        / 共 {item.totalQuestions} 题
                                                                    </span>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                                <svg className="w-6 h-6 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

                    {/* 🆕 错题上传页面 */}
                    {currentPage === 'exam-upload' && (
                        <ExamUploader onUploadSuccess={handleExamUploadSuccess} />
                    )}

                    {/* 🆕 错题识别进度（复用 ProgressTracker） */}
                    {currentPage === 'exam-progress' && (
                        <ProgressTracker
                            taskInfo={taskInfo}
                            connected={connected}
                            logs={logs}
                            onReset={async () => {
                                // 🛡️ 调用后端取消API，关闭浏览器进程
                                if (currentExamId) {
                                    try {
                                        const token = localStorage.getItem('token');
                                        await fetch(`/api/exam/${currentExamId}/cancel`, {
                                            method: 'POST',
                                            headers: { 'Authorization': `Bearer ${token}` }
                                        });
                                        console.log('[App] ✅ 已发送取消请求');
                                    } catch (e) {
                                        console.warn('[App] ⚠️ 取消请求失败:', e.message);
                                    }
                                }
                                setCurrentPage('exam-book');
                                setExamTaskId(null);
                            }}
                            onViewReport={() => {
                                // 🆕 完成后跳转到本次错题报告
                                if (currentExamId) {
                                    console.log(`[App] exam-progress 完成，跳转到错题报告, examId: ${currentExamId}`);
                                    handleViewExamReport(currentExamId);
                                } else {
                                    console.log('[App] exam-progress 完成，无 examId，跳转到错题本');
                                    setCurrentPage('exam-book');
                                }
                            }}
                        />
                    )}

                    {/* 🆕 错题本 */}
                    {currentPage === 'exam-book' && (
                        <WrongQuestionBook />
                    )}

                    {/* 🆕 本次错题报告 */}
                    {currentPage === 'exam-report' && (
                        <ExamReportViewer
                            examId={currentExamId}
                            onBack={() => setCurrentPage('exam-book')}
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