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
 * 主应用内容组件 - 千问风格极简侧边栏布局
 * v5.0.0: UI重构 - 极简白色主题
 */
function AppContent() {
    const { user, loading, logout, isAuthenticated } = useAuth();
    
    const [currentPage, setCurrentPage] = useState('upload');
    const [currentTaskId, setCurrentTaskId] = useState(null);
    const [taskInfo, setTaskInfo] = useState(null);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [lastCompletedTask, setLastCompletedTask] = useState(null);

    const [examTaskId, setExamTaskId] = useState(null);
    const [currentExamId, setCurrentExamId] = useState(null);
    const [examHistory, setExamHistory] = useState([]);

    const [stats, setStats] = useState(null);
    const [masteredWords, setMasteredWords] = useState([]);
    const [masteredStats, setMasteredStats] = useState(null);
    const [taskHistory, setTaskHistory] = useState([]);
    const [savedReports, setSavedReports] = useState([]);
    const [savedReportHiddenItems, setSavedReportHiddenItems] = useState(null);

    const { progress, connected, logs } = useTaskProgress(currentTaskId);

    useEffect(() => {
        if (progress) {
            setTaskInfo(prev => ({
                ...prev,
                ...progress
            }));
            
            if (progress.status === 'completed' || progress.status === 'done') {
                console.log(`[App] 任务完成, status=${progress.status}, taskId=${currentTaskId}`);
                
                if (currentTaskId && currentTaskId.startsWith('exam_')) {
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
                    setLastCompletedTask({
                        id: currentTaskId,
                        title: taskInfo?.customTitle || progress.customTitle || '课堂笔记',
                        type: 'note'
                    });
                }
                loadUserData();
            }
        }
    }, [progress]);

    useEffect(() => {
        if (isAuthenticated) {
            loadUserData();
        }
    }, [isAuthenticated]);

    const loadUserData = async () => {
        try {
            const token = localStorage.getItem('token');
            
            const statsRes = await fetch('/api/user/stats', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (statsRes.ok) {
                const data = await statsRes.json();
                setStats(data);
                setTaskHistory(data.recentTasks || []);
            }

            const masteredStatsRes = await fetch('/api/user-mastered/stats', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (masteredStatsRes.ok) {
                const data = await masteredStatsRes.json();
                setMasteredStats(data.stats);
            }

            const masteredListRes = await fetch('/api/user-mastered/list', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (masteredListRes.ok) {
                const data = await masteredListRes.json();
                setMasteredWords(data.words || []);
            }

            try {
                const examListRes = await fetch('/api/exam/list', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (examListRes.ok) {
                    const data = await examListRes.json();
                    setExamHistory(data.exams || []);
                }
            } catch (examErr) {
                console.error('[App] 加载试卷历史失败:', examErr);
            }

            try {
                const savedRes = await fetch('/api/saved-report/list', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (savedRes.ok) {
                    const data = await savedRes.json();
                    setSavedReports(data.reports || []);
                }
            } catch (savedErr) {
                console.error('[App] 加载已保存报告失败:', savedErr);
            }
        } catch (err) {
            console.error('加载数据失败:', err);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-3"></div>
                    <p className="text-gray-400 text-sm">加载中...</p>
                </div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <LoginPage />;
    }

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

    const handleReset = () => {
        setCurrentPage('upload');
        setCurrentTaskId(null);
        setTaskInfo(null);
        setLastCompletedTask(null);
        loadUserData();
    };

    const handleViewReport = (taskId = null) => {
        if (taskId) setCurrentTaskId(taskId);
        setSavedReportHiddenItems(null);
        setCurrentPage('report');
    };

    const handleViewSavedReport = (report) => {
        setCurrentTaskId(report.task_id);
        setSavedReportHiddenItems(report.hiddenItems || []);
        setCurrentPage('report');
    };

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

    const handleExamUploadSuccess = (data) => {
        setExamTaskId(data.taskId);
        setCurrentTaskId(data.taskId);
        setCurrentExamId(data.examId);
        setTaskInfo({
            id: data.taskId,
            status: 'processing',
            progress: 0,
            currentStep: '识别任务已启动...',
            customTitle: data.title
        });
        setCurrentPage('exam-progress');
    };

    const handleViewExamReport = (examId) => {
        setCurrentExamId(examId);
        setCurrentPage('exam-report');
    };

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

    const handleClearAll = async () => {
        if (!confirm('确定要清空所有已知词汇吗？')) return;
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

    /* ========== 侧边栏导航项组件 ========== */
    const NavItem = ({ page, icon, label, badge, onClick }) => {
        const isActive = currentPage === page;
        return (
            <button
                onClick={onClick || (() => setCurrentPage(page))}
                className={`w-full flex items-center px-3 py-2.5 rounded-lg text-sm transition-all duration-150 group relative ${
                    isActive
                        ? 'bg-blue-50 text-blue-600 font-medium'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
            >
                {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-500 rounded-r-full"></span>
                )}
                <span className={`w-5 h-5 flex-shrink-0 ${sidebarCollapsed ? '' : 'mr-3'}`}>
                    {icon}
                </span>
                {!sidebarCollapsed && (
                    <>
                        <span className="flex-1 text-left truncate">{label}</span>
                        {badge && (
                            <span className="ml-2 px-1.5 py-0.5 text-xs bg-gray-100 text-gray-500 rounded-full min-w-[20px] text-center">
                                {badge}
                            </span>
                        )}
                    </>
                )}
            </button>
        );
    };

    /* ========== 处理中的导航指示器 ========== */
    const ProcessingIndicator = ({ label, progressVal, onClick }) => (
        <button
            onClick={onClick}
            className={`w-full flex items-center px-3 py-2.5 rounded-lg text-sm transition-all duration-150 ${
                'bg-blue-50 text-blue-600'
            }`}
        >
            <span className={`w-5 h-5 flex-shrink-0 ${sidebarCollapsed ? '' : 'mr-3'}`}>
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
            </span>
            {!sidebarCollapsed && (
                <>
                    <span className="flex-1 text-left truncate font-medium">{label}</span>
                    <span className="ml-2 text-xs font-semibold text-blue-500">{progressVal}%</span>
                </>
            )}
        </button>
    );

    /* ========== 分组标题 ========== */
    const SectionTitle = ({ title }) => {
        if (sidebarCollapsed) return <div className="my-2 mx-3 border-t border-gray-100"></div>;
        return (
            <div className="px-3 pt-5 pb-1.5">
                <span className="text-xs font-medium text-gray-400 tracking-wide">{title}</span>
            </div>
        );
    };

    return (
        <div className="flex h-screen bg-white overflow-hidden">
            {/* ========== 打印时隐藏侧边栏 ========== */}
            <style>{`
                @media print {
                    aside, aside * {
                        display: none !important;
                        visibility: hidden !important;
                        opacity: 0 !important;
                        width: 0 !important;
                        height: 0 !important;
                        position: absolute !important;
                        left: -9999px !important;
                    }
                    .ai-chat-button, .ai-chat-button * {
                        display: none !important;
                    }
                    .fixed, .sticky, [role="dialog"], [role="alertdialog"] {
                        display: none !important;
                    }
                    main {
                        margin: 0 !important;
                        padding: 20px !important;
                        width: 100% !important;
                        max-width: 100% !important;
                    }
                }
            `}</style>

            {/* ========== 侧边栏 ========== */}
            <aside className={`${sidebarCollapsed ? 'w-[60px]' : 'w-[240px]'} relative bg-white border-r border-gray-200 flex-shrink-0 transition-all duration-200 flex flex-col`}>
                
                {/* Logo 区域 */}
                <div className={`h-14 flex items-center border-b border-gray-100 flex-shrink-0 ${sidebarCollapsed ? 'justify-center px-2' : 'px-4 justify-between'}`}>
                    {!sidebarCollapsed && (
                        <div className="flex items-center space-x-2.5 min-w-0">
                            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
                                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                                </svg>
                            </div>
                            <div className="min-w-0">
                                <h1 className="text-[15px] font-semibold text-gray-800 truncate leading-tight">AI智能课堂笔记</h1>
                            </div>
                        </div>
                    )}
                    <button 
                        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                        className="p-1.5 hover:bg-gray-100 rounded-md transition-colors text-gray-400 hover:text-gray-600 flex-shrink-0"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            {sidebarCollapsed ? (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                            ) : (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                            )}
                        </svg>
                    </button>
                </div>

                {/* 导航列表 */}
                <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
                    
                    {/* ═══ 模块1：智能处理 ═══ */}
                    <SectionTitle title="智能处理" />
                    
                    <NavItem
                        page="upload"
                        icon={
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                        }
                        label="上传笔记"
                    />

                    <NavItem
                        page="exam-upload"
                        icon={
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                        }
                        label="上传试卷"
                    />

                    {/* 笔记处理中 */}
                    {taskInfo && taskInfo.status === 'processing' && currentPage !== 'exam-progress' && (
                        <ProcessingIndicator
                            label="笔记处理中"
                            progressVal={taskInfo.progress || 0}
                            onClick={() => setCurrentPage('processing')}
                        />
                    )}

                    {/* 试卷识别中 */}
                    {currentPage === 'exam-progress' && taskInfo && taskInfo.status === 'processing' && (
                        <ProcessingIndicator
                            label="试卷识别中"
                            progressVal={taskInfo.progress || 0}
                            onClick={() => setCurrentPage('exam-progress')}
                        />
                    )}

                    <NavItem
                        page="history"
                        icon={
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        }
                        label="生成历史"
                        badge={taskHistory.length + examHistory.length > 0 ? taskHistory.length + examHistory.length : null}
                    />

                    {/* ═══ 模块2：学习成果 ═══ */}
                    <SectionTitle title="学习成果" />

                    <NavItem
                        page="saved"
                        icon={
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        }
                        label="笔记整理"
                        badge={savedReports.length > 0 ? savedReports.length : null}
                    />

                    <NavItem
                        page="exam-book"
                        icon={
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                            </svg>
                        }
                        label="错题整理"
                    />

                    {/* ═══ 模块3：通用 ═══ */}
                    <SectionTitle title="通用" />

                    <NavItem
                        page="filter"
                        icon={
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                            </svg>
                        }
                        label="已知词库"
                    />
                </nav>

                {/* 用户信息区 */}
                <div className="flex-shrink-0 border-t border-gray-100">
                    {!sidebarCollapsed ? (
                        <div className="p-3">
                            <div className="flex items-center space-x-2.5 mb-2.5">
                                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
                                    {user?.username?.[0]?.toUpperCase() || 'U'}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-700 truncate">{user?.username || '用户'}</p>
                                    <p className="text-xs text-gray-400">
                                        {stats ? `已处理 ${stats.tasksCompleted || 0} 个笔记` : ''}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={logout}
                                className="w-full flex items-center justify-center space-x-1.5 px-3 py-2 text-sm text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                </svg>
                                <span>退出登录</span>
                            </button>
                        </div>
                    ) : (
                        <div className="p-2 flex justify-center">
                            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                                {user?.username?.[0]?.toUpperCase() || 'U'}
                            </div>
                        </div>
                    )}
                </div>
            </aside>

            {/* ========== 主内容区 ========== */}
            <main className="flex-1 overflow-auto bg-gray-50">
                <div className="max-w-7xl mx-auto p-6 md:p-8">
                    {/* 上传笔记 */}
                    {currentPage === 'upload' && (
                        <FileUploader
                            onUploadSuccess={handleUploadSuccess}
                            stats={stats}
                        />
                    )}

                    {/* 笔记处理中 */}
                    {currentPage === 'processing' && (
                        <ProgressTracker
                            taskInfo={taskInfo}
                            connected={connected}
                            logs={logs}
                            onReset={handleReset}
                            onViewReport={() => handleViewReport(currentTaskId)}
                        />
                    )}

                    {/* 报告查看 */}
                    {currentPage === 'report' && (
                        <ReportViewer
                            taskId={currentTaskId}
                            onBack={handleReset}
                            initialHiddenItems={savedReportHiddenItems}
                            onSaved={() => loadUserData()}
                        />
                    )}

                    {/* 笔记整理（已保存报告） */}
                    {currentPage === 'saved' && (
                        <div className="bg-white rounded-xl border border-gray-200 p-6 md:p-8">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-semibold text-gray-800 flex items-center space-x-2">
                                    <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    <span>笔记整理</span>
                                </h2>
                                <span className="text-sm text-gray-400">
                                    共 {savedReports.length} 份
                                </span>
                            </div>

                            {savedReports.length === 0 ? (
                                <div className="text-center py-16">
                                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                    </div>
                                    <p className="text-gray-400 mb-1">还没有整理好的笔记</p>
                                    <p className="text-gray-300 text-sm mb-4">在学习报告中修改内容后，点击"保存报告"即可</p>
                                    <button
                                        onClick={() => setCurrentPage('history')}
                                        className="text-blue-500 hover:text-blue-600 text-sm font-medium"
                                    >
                                        去生成历史查看 →
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {savedReports.map((report) => (
                                        <div
                                            key={`saved-${report.id}`}
                                            className="rounded-lg p-4 hover:bg-gray-50 transition-colors cursor-pointer border border-gray-100 group"
                                            onClick={() => handleViewSavedReport(report)}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center space-x-2.5 mb-1.5">
                                                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-600">
                                                            笔记
                                                        </span>
                                                        <span className="text-[15px] font-medium text-gray-800 truncate">
                                                            {report.title || report.task_title || '学习报告'}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center space-x-3 text-xs text-gray-400">
                                                        <span>
                                                            {report.updated_at ? new Date(report.updated_at).toLocaleString() : ''}
                                                        </span>
                                                        {report.word_count > 0 && (
                                                            <span>{report.word_count} 单词</span>
                                                        )}
                                                        {report.phrase_count > 0 && (
                                                            <span>{report.phrase_count} 短语</span>
                                                        )}
                                                        {report.grammar_count > 0 && (
                                                            <span>{report.grammar_count} 语法</span>
                                                        )}
                                                        {(report.hiddenItems?.length || 0) > 0 && (
                                                            <span>已筛除 {report.hiddenItems.length} 项</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex items-center space-x-1">
                                                    <button
                                                        onClick={(e) => handleDeleteSavedReport(report.id, e)}
                                                        className="p-1.5 text-gray-300 hover:text-red-400 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                                                        title="删除"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                    </button>
                                                    <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
                                                    </svg>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* 生成历史 */}
                    {currentPage === 'history' && (
                        <div className="bg-white rounded-xl border border-gray-200 p-6 md:p-8">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-semibold text-gray-800 flex items-center space-x-2">
                                    <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span>生成历史</span>
                                </h2>
                                <span className="text-sm text-gray-400">
                                    共 {taskHistory.length + examHistory.length} 条
                                </span>
                            </div>

                            {taskHistory.length === 0 && examHistory.length === 0 ? (
                                <div className="text-center py-16">
                                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                    </div>
                                    <p className="text-gray-400 mb-1">还没有任何记录</p>
                                    <button
                                        onClick={() => setCurrentPage('upload')}
                                        className="text-blue-500 hover:text-blue-600 text-sm font-medium"
                                    >
                                        去上传第一个笔记 →
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {[
                                        ...taskHistory.map(task => ({
                                            ...task,
                                            _type: 'note',
                                            _time: task.createdAt || task.created_at || '',
                                            _title: task.customTitle || task.fileName || '课堂笔记',
                                            _status: task.status,
                                        })),
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
                                            className="rounded-lg p-4 hover:bg-gray-50 transition-colors cursor-pointer border border-gray-100 group"
                                            onClick={() => {
                                                if (item._type === 'exam') {
                                                    handleViewExamReport(item.id);
                                                } else {
                                                    handleViewReport(item.id);
                                                }
                                            }}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center space-x-2.5 mb-1.5">
                                                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                                            item._type === 'exam'
                                                                ? 'bg-orange-50 text-orange-600'
                                                                : 'bg-blue-50 text-blue-600'
                                                        }`}>
                                                            {item._type === 'exam' ? '试卷' : '笔记'}
                                                        </span>
                                                        <span className="text-[15px] font-medium text-gray-800 truncate">
                                                            {item._title}
                                                        </span>
                                                        <span className={`px-2 py-0.5 rounded text-xs ${
                                                            item._status === 'completed'
                                                                ? 'bg-green-50 text-green-600'
                                                                : item._status === 'failed'
                                                                ? 'bg-red-50 text-red-500'
                                                                : 'bg-yellow-50 text-yellow-600'
                                                        }`}>
                                                            {item._status === 'completed' ? '已完成' : item._status === 'failed' ? '失败' : '处理中'}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center space-x-3 text-xs text-gray-400">
                                                        <span>
                                                            {item._time ? new Date(item._time).toLocaleString() : ''}
                                                        </span>
                                                        {item._type === 'note' && item.stats && (
                                                            <>
                                                                <span>{item.stats.exactMatch || 0} 精确</span>
                                                                <span>{item.stats.fuzzyMatch || 0} 模糊</span>
                                                                <span>{item.stats.unmatched || 0} 未匹配</span>
                                                            </>
                                                        )}
                                                        {item._type === 'exam' && (
                                                            <>
                                                                {item.imageCount > 0 && (
                                                                    <span>{item.imageCount} 张图片</span>
                                                                )}
                                                                {item.wrongCount > 0 && (
                                                                    <span>{item.wrongCount} 道错题</span>
                                                                )}
                                                                {item.totalQuestions > 0 && (
                                                                    <span>共 {item.totalQuestions} 题</span>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                                <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
                                                </svg>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* 已知词库 */}
                    {currentPage === 'filter' && (
                        <MasteredWords
                            words={masteredWords}
                            stats={masteredStats}
                            onRemove={handleRemoveMastered}
                            onClearAll={handleClearAll}
                        />
                    )}

                    {/* 上传试卷 */}
                    {currentPage === 'exam-upload' && (
                        <ExamUploader onUploadSuccess={handleExamUploadSuccess} />
                    )}

                    {/* 试卷识别进度 */}
                    {currentPage === 'exam-progress' && (
                        <ProgressTracker
                            taskInfo={taskInfo}
                            connected={connected}
                            logs={logs}
                            onReset={async () => {
                                if (currentExamId) {
                                    try {
                                        const token = localStorage.getItem('token');
                                        await fetch(`/api/exam/${currentExamId}/cancel`, {
                                            method: 'POST',
                                            headers: { 'Authorization': `Bearer ${token}` }
                                        });
                                    } catch (e) {
                                        console.warn('[App] 取消请求失败:', e.message);
                                    }
                                }
                                setCurrentPage('exam-book');
                                setExamTaskId(null);
                            }}
                            onViewReport={() => {
                                if (currentExamId) {
                                    handleViewExamReport(currentExamId);
                                } else {
                                    setCurrentPage('exam-book');
                                }
                            }}
                        />
                    )}

                    {/* 错题整理 */}
                    {currentPage === 'exam-book' && (
                        <WrongQuestionBook />
                    )}

                    {/* 错题报告 */}
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
