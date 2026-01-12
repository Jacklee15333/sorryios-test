/**
 * 进度跟踪组件 - 显示任务处理进度
 */
function ProgressTracker({ task, onCancel, onViewReport }) {
    if (!task) return null;

    const { status, progress = 0, currentStep, totalSegments, processedSegments, error } = task;

    // 状态颜色映射
    const statusColors = {
        pending: 'bg-yellow-500',
        processing: 'bg-blue-500',
        completed: 'bg-green-500',
        failed: 'bg-red-500',
        cancelled: 'bg-gray-500'
    };

    // 状态文字映射
    const statusText = {
        pending: '等待处理',
        processing: '处理中',
        completed: '已完成',
        failed: '处理失败',
        cancelled: '已取消'
    };

    // 状态图标映射
    const statusIcons = {
        pending: '⏳',
        processing: '🔄',
        completed: '✅',
        failed: '❌',
        cancelled: '🚫'
    };

    const isProcessing = status === 'processing' || status === 'pending';
    const isCompleted = status === 'completed';
    const isFailed = status === 'failed';

    return (
        <div className="bg-white rounded-2xl shadow-lg p-6 fade-in">
            {/* 顶部状态 */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <span className="text-2xl">{statusIcons[status]}</span>
                    <div>
                        <h3 className="font-semibold text-gray-800">
                            {statusText[status]}
                        </h3>
                        <p className="text-sm text-gray-500">
                            {currentStep || '准备中...'}
                        </p>
                    </div>
                </div>
                <span className={`px-3 py-1 rounded-full text-white text-sm font-medium ${statusColors[status]}`}>
                    {progress}%
                </span>
            </div>

            {/* 进度条 */}
            <div className="relative h-4 bg-gray-200 rounded-full overflow-hidden mb-4">
                <div
                    className={`progress-bar h-full rounded-full ${statusColors[status]} ${isProcessing ? 'animate-pulse-slow' : ''}`}
                    style={{ width: `${progress}%` }}
                />
            </div>

            {/* 片段进度 */}
            {totalSegments > 0 && (
                <div className="flex items-center justify-between text-sm text-gray-600 mb-4">
                    <span>处理进度</span>
                    <span className="font-medium">
                        {processedSegments || 0} / {totalSegments} 段
                    </span>
                </div>
            )}

            {/* 片段指示器 */}
            {totalSegments > 0 && (
                <div className="flex gap-1 mb-4">
                    {Array.from({ length: totalSegments }).map((_, i) => (
                        <div
                            key={i}
                            className={`
                                flex-1 h-2 rounded-full transition-all duration-300
                                ${i < (processedSegments || 0)
                                    ? 'bg-green-500'
                                    : i === (processedSegments || 0) && isProcessing
                                        ? 'bg-blue-500 animate-pulse'
                                        : 'bg-gray-200'
                                }
                            `}
                        />
                    ))}
                </div>
            )}

            {/* 错误信息 */}
            {isFailed && error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                    <p className="text-red-600 text-sm">
                        <span className="font-medium">错误：</span>{error}
                    </p>
                </div>
            )}

            {/* 操作按钮 */}
            <div className="flex gap-3">
                {isProcessing && (
                    <button
                        onClick={onCancel}
                        className="flex-1 py-2 px-4 rounded-lg font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all"
                    >
                        取消处理
                    </button>
                )}
                {isCompleted && (
                    <button
                        onClick={onViewReport}
                        className="flex-1 py-2 px-4 rounded-lg font-medium text-white bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 shadow-lg transition-all"
                    >
                        📄 查看报告
                    </button>
                )}
                {(isFailed || status === 'cancelled') && (
                    <button
                        onClick={onCancel}
                        className="flex-1 py-2 px-4 rounded-lg font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all"
                    >
                        重新上传
                    </button>
                )}
            </div>
        </div>
    );
}

export default ProgressTracker;
