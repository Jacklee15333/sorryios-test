import { useState, useEffect, useRef, useMemo } from 'react';

/**
 * 进度跟踪组件 v4.0 - Claude 风格简约版
 * 
 * 设计风格:
 * - 米色背景 + 深色文字
 * - 简约专业
 * - 去掉花哨的颜色
 */
function ProgressTracker({ task, logs = [], onCancel, onViewReport }) {
    const [expandedStages, setExpandedStages] = useState({});
    const [showTimestamp, setShowTimestamp] = useState(false);
    const [startTime] = useState(() => Date.now());
    const logsEndRef = useRef(null);

    // 自动滚动到底部
    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    // 默认展开所有阶段
    useEffect(() => {
        const stages = {};
        logs.forEach(log => {
            if (log.message?.includes('📌 阶段')) {
                stages[log.message] = true;
            }
        });
        setExpandedStages(prev => ({ ...prev, ...stages }));
    }, [logs]);

    if (!task) return null;

    const { status, progress = 0, currentStep, error } = task;

    const isProcessing = status === 'processing' || status === 'pending';
    const isCompleted = status === 'completed';
    const isFailed = status === 'failed';

    // 计算已用时间和预估剩余时间
    const elapsedTime = Math.floor((Date.now() - startTime) / 1000);
    const estimatedTotal = progress > 5 ? Math.floor(elapsedTime / progress * 100) : 0;
    const remainingTime = Math.max(0, estimatedTotal - elapsedTime);

    const formatTime = (seconds) => {
        if (seconds < 60) return `${seconds}秒`;
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}分${secs}秒`;
    };

    // 将日志按阶段分组
    const groupedLogs = useMemo(() => {
        const groups = [];
        let currentStage = { title: '初始化', logs: [], isStageHeader: true };
        
        logs.forEach(log => {
            const msg = log.message || '';
            if (msg.includes('📌 阶段')) {
                if (currentStage.logs.length > 0 || currentStage.title !== '初始化') {
                    groups.push(currentStage);
                }
                // 提取阶段名称，去掉 emoji
                const cleanTitle = msg.replace(/📌\s*/, '');
                currentStage = { title: cleanTitle, logs: [], isStageHeader: true };
            } else if (msg.includes('═══')) {
                if (currentStage.logs.length > 0) {
                    groups.push(currentStage);
                }
                currentStage = { title: '处理结果', logs: [], isStageHeader: true };
            } else {
                currentStage.logs.push(log);
            }
        });
        if (currentStage.logs.length > 0 || groups.length === 0) {
            groups.push(currentStage);
        }
        return groups;
    }, [logs]);

    // 切换阶段展开/收起
    const toggleStage = (title) => {
        setExpandedStages(prev => ({
            ...prev,
            [title]: !prev[title]
        }));
    };

    // 展开/收起全部
    const toggleAll = (expand) => {
        const newState = {};
        groupedLogs.forEach(stage => {
            newState[stage.title] = expand;
        });
        setExpandedStages(newState);
    };

    // 格式化时间戳
    const formatTimestamp = (timestamp) => {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    // 清理日志文本中的 emoji
    const cleanLogText = (text) => {
        return text
            .replace(/[📌📄✂️🌐✅❌⚠️🔍📤⏳💾📝🎉🔄🔧📊📚📖📋📑⏭️]/g, '')
            .trim();
    };

    return (
        <div className="rounded-xl overflow-hidden border border-stone-200" style={{ backgroundColor: '#faf8f5' }}>
            {/* 顶部状态栏 */}
            <div className="p-5 border-b border-stone-200">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                        {isProcessing && (
                            <div className="w-5 h-5 border-2 border-stone-400 border-t-stone-700 rounded-full animate-spin"></div>
                        )}
                        {isCompleted && (
                            <div className="w-5 h-5 rounded-full bg-stone-700 flex items-center justify-center">
                                <span className="text-white text-xs">✓</span>
                            </div>
                        )}
                        {isFailed && (
                            <div className="w-5 h-5 rounded-full bg-red-600 flex items-center justify-center">
                                <span className="text-white text-xs">×</span>
                            </div>
                        )}
                        <div>
                            <h3 className="font-medium text-stone-800">
                                {isCompleted ? '处理完成' : isFailed ? '处理失败' : '正在处理'}
                            </h3>
                            <p className="text-sm text-stone-500 mt-0.5">
                                {cleanLogText(currentStep || '准备中...')}
                            </p>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-2xl font-light text-stone-700">{progress}%</div>
                        {isProcessing && remainingTime > 0 && (
                            <div className="text-xs text-stone-400">
                                预计 {formatTime(remainingTime)}
                            </div>
                        )}
                    </div>
                </div>
                
                {/* 进度条 */}
                <div className="h-1.5 bg-stone-200 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-stone-600 rounded-full transition-all duration-500"
                        style={{ width: `${progress}%` }}
                    />
                </div>
            </div>

            {/* 工具栏 */}
            <div className="px-5 py-2 flex items-center justify-between border-b border-stone-200 bg-stone-50">
                <div className="flex items-center gap-4 text-xs text-stone-500">
                    <span>{logs.length} 条日志</span>
                    <span>已用 {formatTime(elapsedTime)}</span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowTimestamp(!showTimestamp)}
                        className={`px-2 py-1 rounded text-xs transition-colors ${
                            showTimestamp 
                                ? 'bg-stone-600 text-white' 
                                : 'text-stone-500 hover:bg-stone-200'
                        }`}
                    >
                        时间
                    </button>
                    <button
                        onClick={() => toggleAll(true)}
                        className="px-2 py-1 rounded text-xs text-stone-500 hover:bg-stone-200 transition-colors"
                    >
                        展开
                    </button>
                    <button
                        onClick={() => toggleAll(false)}
                        className="px-2 py-1 rounded text-xs text-stone-500 hover:bg-stone-200 transition-colors"
                    >
                        收起
                    </button>
                </div>
            </div>

            {/* 日志区域 */}
            <div className="max-h-[350px] overflow-y-auto" style={{ backgroundColor: '#f5f3f0' }}>
                {groupedLogs.length === 0 ? (
                    <div className="text-stone-400 text-center py-12 text-sm">
                        等待任务开始...
                    </div>
                ) : (
                    <div className="py-2">
                        {groupedLogs.map((stage, stageIndex) => {
                            const isExpanded = expandedStages[stage.title] !== false;
                            const isCurrentStage = stageIndex === groupedLogs.length - 1;
                            
                            return (
                                <div key={stageIndex} className="px-5">
                                    {/* 阶段标题 */}
                                    <div
                                        className={`flex items-center gap-2 cursor-pointer py-2 transition-colors rounded ${
                                            isCurrentStage ? 'text-stone-800' : 'text-stone-600'
                                        } hover:bg-stone-200/50`}
                                        onClick={() => toggleStage(stage.title)}
                                    >
                                        <span className={`text-stone-400 text-xs transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
                                            ▶
                                        </span>
                                        <span className={`text-sm ${isCurrentStage ? 'font-medium' : ''}`}>
                                            {stage.title}
                                        </span>
                                        {isCurrentStage && isProcessing && (
                                            <span className="w-1.5 h-1.5 bg-stone-500 rounded-full animate-pulse ml-1"></span>
                                        )}
                                        {stage.logs.length > 0 && (
                                            <span className="text-stone-400 text-xs ml-auto">
                                                {stage.logs.length}
                                            </span>
                                        )}
                                    </div>
                                    
                                    {/* 阶段日志 */}
                                    {isExpanded && stage.logs.length > 0 && (
                                        <div className="ml-4 mb-2 pl-3 border-l border-stone-300">
                                            {stage.logs.map((log, logIndex) => (
                                                <div
                                                    key={log.id || logIndex}
                                                    className="text-sm text-stone-600 py-0.5 flex items-start gap-2"
                                                >
                                                    {showTimestamp && log.timestamp && (
                                                        <span className="text-stone-400 text-xs shrink-0">
                                                            {formatTimestamp(log.timestamp)}
                                                        </span>
                                                    )}
                                                    <span>{cleanLogText(log.message)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
                <div ref={logsEndRef} />
            </div>

            {/* 错误信息 */}
            {isFailed && error && (
                <div className="px-5 py-3 border-t border-stone-200 bg-red-50">
                    <p className="text-red-700 text-sm">{error}</p>
                </div>
            )}

            {/* 操作按钮 */}
            <div className="p-4 border-t border-stone-200 flex gap-3" style={{ backgroundColor: '#faf8f5' }}>
                {isProcessing && (
                    <button
                        onClick={onCancel}
                        className="flex-1 py-2.5 px-4 rounded-lg text-sm font-medium text-stone-600 bg-white border border-stone-300 hover:bg-stone-50 transition-colors"
                    >
                        取消处理
                    </button>
                )}
                {isCompleted && (
                    <button
                        onClick={onViewReport}
                        className="flex-1 py-2.5 px-4 rounded-lg text-sm font-medium text-white bg-stone-700 hover:bg-stone-800 transition-colors"
                    >
                        查看报告
                    </button>
                )}
                {(isFailed || status === 'cancelled') && (
                    <button
                        onClick={onCancel}
                        className="flex-1 py-2.5 px-4 rounded-lg text-sm font-medium text-stone-600 bg-white border border-stone-300 hover:bg-stone-50 transition-colors"
                    >
                        重新上传
                    </button>
                )}
            </div>
        </div>
    );
}

export default ProgressTracker;