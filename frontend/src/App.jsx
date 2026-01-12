import { useState, useEffect } from 'react';
import FileUploader from './components/FileUploader';
import ProgressTracker from './components/ProgressTracker';
import ReportViewer from './components/ReportViewer';
import useTaskProgress from './hooks/useTaskProgress';

/**
 * 主应用组件
 */
function App() {
    // 应用状态：upload | processing | report
    const [appState, setAppState] = useState('upload');
    const [currentTaskId, setCurrentTaskId] = useState(null);
    const [taskInfo, setTaskInfo] = useState(null);

    // WebSocket 进度订阅
    const { progress, connected } = useTaskProgress(currentTaskId);

    // 当收到进度更新时，更新任务信息
    useEffect(() => {
        if (progress) {
            setTaskInfo(progress);

            // 任务完成时自动切换到报告页面
            if (progress.status === 'completed') {
                setTimeout(() => setAppState('report'), 500);
            }
        }
    }, [progress]);

    // 上传开始
    const handleUploadStart = () => {
        console.log('上传开始');
    };

    // 上传成功
    const handleUploadSuccess = (data) => {
        console.log('上传成功:', data);
        setCurrentTaskId(data.task.id);
        setTaskInfo({
            id: data.task.id,
            status: data.task.status,
            progress: 0,
            currentStep: '任务已创建，等待处理...',
            file: data.task.file
        });
        setAppState('processing');
    };

    // 上传失败
    const handleUploadError = (error) => {
        alert('上传失败: ' + error);
    };

    // 取消/重置
    const handleReset = async () => {
        // 如果任务正在处理，尝试取消
        if (currentTaskId && taskInfo?.status === 'processing') {
            try {
                await fetch(`/api/task/${currentTaskId}/cancel`, { method: 'POST' });
            } catch (e) {
                console.error('取消任务失败:', e);
            }
        }

        setAppState('upload');
        setCurrentTaskId(null);
        setTaskInfo(null);
    };

    // 查看报告
    const handleViewReport = () => {
        setAppState('report');
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100">
            {/* 顶部导航 */}
            <header className="bg-white/80 backdrop-blur-sm shadow-sm sticky top-0 z-10">
                <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="text-3xl">🤖</span>
                        <div>
                            <h1 className="text-xl font-bold text-gray-800">AI 智能笔记助手</h1>
                            <p className="text-xs text-gray-500">课堂笔记自动化处理系统</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
                        <span className="text-xs text-gray-500">
                            {connected ? '已连接' : '未连接'}
                        </span>
                    </div>
                </div>
            </header>

            {/* 主内容区 */}
            <main className="max-w-2xl mx-auto px-4 py-8">
                {/* 上传状态 */}
                {appState === 'upload' && (
                    <div className="fade-in">
                        <div className="text-center mb-8">
                            <h2 className="text-2xl font-bold text-gray-800 mb-2">
                                上传课堂笔记
                            </h2>
                            <p className="text-gray-600">
                                支持语音转文字的 txt 文件，AI 将自动分析并生成结构化报告
                            </p>
                        </div>
                        <FileUploader
                            onUploadStart={handleUploadStart}
                            onUploadSuccess={handleUploadSuccess}
                            onUploadError={handleUploadError}
                        />

                        {/* 功能说明 */}
                        <div className="mt-8 grid grid-cols-3 gap-4">
                            <div className="bg-white/60 rounded-xl p-4 text-center">
                                <div className="text-2xl mb-2">📝</div>
                                <div className="text-sm font-medium text-gray-700">智能分段</div>
                                <div className="text-xs text-gray-500 mt-1">自动切分长文本</div>
                            </div>
                            <div className="bg-white/60 rounded-xl p-4 text-center">
                                <div className="text-2xl mb-2">🤖</div>
                                <div className="text-sm font-medium text-gray-700">AI 分析</div>
                                <div className="text-xs text-gray-500 mt-1">提取关键信息</div>
                            </div>
                            <div className="bg-white/60 rounded-xl p-4 text-center">
                                <div className="text-2xl mb-2">📊</div>
                                <div className="text-sm font-medium text-gray-700">生成报告</div>
                                <div className="text-xs text-gray-500 mt-1">多格式导出</div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 处理状态 */}
                {appState === 'processing' && taskInfo && (
                    <div className="fade-in">
                        <div className="text-center mb-6">
                            <h2 className="text-2xl font-bold text-gray-800 mb-2">
                                正在处理
                            </h2>
                            <p className="text-gray-600">
                                {taskInfo.file?.name || '文件处理中'}
                            </p>
                        </div>
                        <ProgressTracker
                            task={taskInfo}
                            onCancel={handleReset}
                            onViewReport={handleViewReport}
                        />

                        {/* 提示信息 */}
                        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-4">
                            <p className="text-sm text-blue-700">
                                💡 <span className="font-medium">提示：</span>
                                处理过程中会自动打开浏览器与 AI 交互，请不要关闭浏览器窗口。
                            </p>
                        </div>
                    </div>
                )}

                {/* 报告状态 */}
                {appState === 'report' && currentTaskId && (
                    <ReportViewer
                        taskId={currentTaskId}
                        onBack={handleReset}
                    />
                )}
            </main>

            {/* 底部 */}
            <footer className="text-center py-6 text-gray-500 text-sm">
                <p>Sorryios AI 智能笔记系统 v1.0</p>
            </footer>
        </div>
    );
}

export default App;
