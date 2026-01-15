import { useState, useEffect } from 'react';

/**
 * 报告查看组件 v4.1
 * - 网页版样式（蓝紫色渐变）
 * - 表格形式显示
 * - 带确认对话框
 * - 显示学生姓名
 * - 正确的下载文件名
 */
function ReportViewer({ taskId, onBack }) {
    const [report, setReport] = useState(null);
    const [reportData, setReportData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('vocabulary');
    const [hiddenItems, setHiddenItems] = useState(new Set());
    const [actionLoading, setActionLoading] = useState(null);
    const [userInfo, setUserInfo] = useState(null);
    
    // 确认对话框状态
    const [confirmDialog, setConfirmDialog] = useState(null);

    // 获取报告信息
    useEffect(() => {
        if (!taskId) return;

        const fetchReport = async () => {
            try {
                setLoading(true);
                const token = localStorage.getItem('token');
                
                const response = await fetch(`/api/report/${taskId}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                const data = await response.json();

                if (!response.ok || !data.success) {
                    throw new Error(data.message || data.error || '获取报告失败');
                }

                setReport(data.report);
                
                // 获取用户信息
                if (data.user) {
                    setUserInfo(data.user);
                }

                // 获取报告JSON数据
                if (data.report?.files?.json?.preview) {
                    const jsonResponse = await fetch(data.report.files.json.preview);
                    const jsonData = await jsonResponse.json();
                    setReportData(jsonData);
                }
            } catch (err) {
                console.error('获取报告错误:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchReport();
    }, [taskId]);

    // 显示确认对话框
    const showConfirm = (type, item, itemType) => {
        const word = item.word || item.phrase || item.pattern || item.title;
        setConfirmDialog({
            type,
            word,
            item,
            itemType,
            message: type === 'mastered' 
                ? `确定将「${word}」标记为已掌握吗？\n\n标记后会记录到你的词库，下次生成报告时将自动过滤。`
                : `确定将「${word}」标记为识别错误吗？\n\n标记后仅从当前报告中隐藏。`
        });
    };

    // 确认操作
    const handleConfirm = async () => {
        if (!confirmDialog) return;
        
        const { type, item, itemType, word } = confirmDialog;
        const itemKey = `${itemType}-${word}`;
        
        if (type === 'mastered') {
            setActionLoading(itemKey);
            try {
                const token = localStorage.getItem('token');
                const response = await fetch('/api/user-mastered/add', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ word, wordType: itemType })
                });

                if (response.ok) {
                    setHiddenItems(prev => new Set([...prev, itemKey]));
                }
            } catch (e) {
                console.error('标记已掌握失败:', e);
            } finally {
                setActionLoading(null);
            }
        } else {
            setHiddenItems(prev => new Set([...prev, itemKey]));
        }
        
        setConfirmDialog(null);
    };

    // 统计数量
    const getVisibleCount = (items, type, keyField) => {
        if (!items) return 0;
        return items.filter(item => {
            const word = item[keyField];
            const itemKey = `${type}-${word}`;
            return !hiddenItems.has(itemKey);
        }).length;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-center">
                    <div className="animate-spin h-10 w-10 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                    <p className="text-gray-600">加载报告中...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-center">
                    <div className="text-5xl mb-4">❌</div>
                    <p className="text-red-600 mb-4">{error}</p>
                    <button
                        onClick={onBack}
                        className="py-2 px-6 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600"
                    >
                        返回
                    </button>
                </div>
            </div>
        );
    }

    if (!report || !reportData) return null;

    const { files } = report;
    const vocabulary = reportData.vocabulary || { words: [], phrases: [], patterns: [] };
    const grammar = reportData.grammar || [];
    
    // 获取正确的标题 - 优先使用 report.title（用户输入的标题）
    const title = report.title || reportData.metadata?.title || '课堂笔记';
    const processedAt = reportData.metadata?.processedAt;
    
    // 学生姓名 - 优先使用昵称，否则使用用户名
    const studentName = userInfo?.nickname || userInfo?.username || report.userName || '';
    
    // 生成下载文件名（去除特殊字符）
    const safeFileName = title.replace(/[\\/:*?"<>|]/g, '_');

    // 计算可见数量
    const visibleWords = getVisibleCount(vocabulary.words, 'word', 'word');
    const visiblePhrases = getVisibleCount(vocabulary.phrases, 'phrase', 'phrase');
    const visiblePatterns = getVisibleCount(vocabulary.patterns, 'pattern', 'pattern');
    const visibleGrammar = getVisibleCount(grammar, 'grammar', 'title');
    const totalVocab = visibleWords + visiblePhrases + visiblePatterns;

    return (
        <div className="min-h-screen" style={{ backgroundColor: '#e8f4fc' }}>
            {/* 确认对话框 */}
            {confirmDialog && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
                        <div className={`p-4 ${confirmDialog.type === 'mastered' ? 'bg-green-500' : 'bg-red-500'} text-white`}>
                            <h3 className="text-lg font-bold">
                                {confirmDialog.type === 'mastered' ? '✓ 确认已掌握' : '✗ 确认识别错误'}
                            </h3>
                        </div>
                        <div className="p-6">
                            <p className="text-gray-700 whitespace-pre-line">{confirmDialog.message}</p>
                        </div>
                        <div className="px-6 pb-6 flex gap-3">
                            <button
                                onClick={() => setConfirmDialog(null)}
                                className="flex-1 py-2.5 px-4 rounded-lg text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleConfirm}
                                className={`flex-1 py-2.5 px-4 rounded-lg text-white transition-colors ${
                                    confirmDialog.type === 'mastered' 
                                        ? 'bg-green-500 hover:bg-green-600' 
                                        : 'bg-red-500 hover:bg-red-600'
                                }`}
                            >
                                确认
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 顶部标题区 - 网页版样式 */}
            <div className="bg-gradient-to-r from-blue-500 via-blue-600 to-purple-600 text-white">
                <div className="max-w-5xl mx-auto px-6 py-8">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <span className="text-3xl">📖</span>
                            <h1 className="text-2xl font-bold">{title}</h1>
                        </div>
                        <div className="flex gap-2">
                            <a
                                href={files.html.preview}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm transition-colors backdrop-blur"
                            >
                                🌐 网页版
                            </a>
                            <a
                                href={files.html.download}
                                download={`${safeFileName}.html`}
                                className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm transition-colors backdrop-blur"
                            >
                                ⬇️ 下载
                            </a>
                            <button
                                onClick={onBack}
                                className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm transition-colors backdrop-blur"
                            >
                                ← 返回
                            </button>
                        </div>
                    </div>
                    
                    {/* 生成时间和学生姓名 */}
                    <div className="text-white/70 text-sm mb-6 space-y-1">
                        {processedAt && (
                            <p>生成时间: {new Date(processedAt).toLocaleString('zh-CN')}</p>
                        )}
                        {studentName && (
                            <p>学生姓名: {studentName}</p>
                        )}
                    </div>

                    {/* 统计卡片 */}
                    <div className="flex justify-center gap-4">
                        <div className="bg-white/10 backdrop-blur rounded-xl px-8 py-4 text-center">
                            <div className="text-3xl font-bold">{totalVocab}</div>
                            <div className="text-sm text-white/80">词汇</div>
                        </div>
                        <div className="bg-white/10 backdrop-blur rounded-xl px-8 py-4 text-center">
                            <div className="text-3xl font-bold">{visibleGrammar}</div>
                            <div className="text-sm text-white/80">语法</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 主内容区 */}
            <div className="max-w-5xl mx-auto px-6 py-6">
                {/* 标签页 */}
                <div className="bg-white rounded-t-xl border-b border-gray-200 flex">
                    <button
                        onClick={() => setActiveTab('vocabulary')}
                        className={`flex-1 py-4 px-6 text-sm font-medium transition-all ${
                            activeTab === 'vocabulary'
                                ? 'text-blue-600 border-b-2 border-blue-600'
                                : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        📚 词汇 ({totalVocab})
                    </button>
                    <button
                        onClick={() => setActiveTab('grammar')}
                        className={`flex-1 py-4 px-6 text-sm font-medium transition-all ${
                            activeTab === 'grammar'
                                ? 'text-blue-600 border-b-2 border-blue-600'
                                : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        📖 语法 ({visibleGrammar})
                    </button>
                </div>

                {/* 操作提示 */}
                <div className="bg-blue-50 px-6 py-3 text-sm text-blue-700">
                    💡 点击 <span className="font-medium text-green-600">[✓ 已掌握]</span> 会记录到你的词库，下次不再显示；
                    点击 <span className="font-medium text-red-600">[✗ 识别错误]</span> 只会从当前报告隐藏
                </div>

                {/* 内容区域 */}
                <div className="bg-white rounded-b-xl shadow-sm">
                    {activeTab === 'vocabulary' && (
                        <div className="divide-y divide-gray-100">
                            {/* 单词表格 */}
                            {vocabulary.words?.length > 0 && (
                                <div className="p-6">
                                    <div className="bg-blue-600 text-white px-4 py-3 rounded-t-lg flex items-center gap-2">
                                        <span>📝</span>
                                        <span className="font-medium">单词</span>
                                        <span className="ml-auto text-sm">共 {visibleWords} 项</span>
                                    </div>
                                    <table className="w-full">
                                        <thead className="bg-blue-50 text-blue-800 text-sm">
                                            <tr>
                                                <th className="px-4 py-3 text-left w-12">#</th>
                                                <th className="px-4 py-3 text-left">词汇</th>
                                                <th className="px-4 py-3 text-left">音标</th>
                                                <th className="px-4 py-3 text-left">含义</th>
                                                <th className="px-4 py-3 text-left">例句</th>
                                                <th className="px-4 py-3 text-center w-48">操作</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {vocabulary.words.map((item, index) => {
                                                const itemKey = `word-${item.word}`;
                                                if (hiddenItems.has(itemKey)) return null;
                                                
                                                return (
                                                    <tr key={index} className="hover:bg-gray-50">
                                                        <td className="px-4 py-3 text-gray-400">{index + 1}</td>
                                                        <td className="px-4 py-3 font-medium text-gray-800">{item.word}</td>
                                                        <td className="px-4 py-3 text-purple-500 text-sm">{item.phonetic || '-'}</td>
                                                        <td className="px-4 py-3 text-gray-600">
                                                            {item.pos && <span className="text-blue-500">{item.pos} </span>}
                                                            {item.meaning}
                                                        </td>
                                                        <td className="px-4 py-3 text-gray-500 text-sm italic">{item.example || '-'}</td>
                                                        <td className="px-4 py-3">
                                                            <div className="flex justify-center gap-2">
                                                                <button
                                                                    onClick={() => showConfirm('mastered', item, 'word')}
                                                                    disabled={actionLoading === itemKey}
                                                                    className="px-2 py-1 text-xs bg-green-100 hover:bg-green-200 text-green-700 rounded transition-colors disabled:opacity-50"
                                                                >
                                                                    {actionLoading === itemKey ? '...' : '✓ 已掌握'}
                                                                </button>
                                                                <button
                                                                    onClick={() => showConfirm('wrong', item, 'word')}
                                                                    className="px-2 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-700 rounded transition-colors"
                                                                >
                                                                    ✗ 识别错误
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* 短语表格 */}
                            {vocabulary.phrases?.length > 0 && (
                                <div className="p-6">
                                    <div className="bg-green-600 text-white px-4 py-3 rounded-t-lg flex items-center gap-2">
                                        <span>💬</span>
                                        <span className="font-medium">短语</span>
                                        <span className="ml-auto text-sm">共 {visiblePhrases} 项</span>
                                    </div>
                                    <table className="w-full">
                                        <thead className="bg-green-50 text-green-800 text-sm">
                                            <tr>
                                                <th className="px-4 py-3 text-left w-12">#</th>
                                                <th className="px-4 py-3 text-left">短语</th>
                                                <th className="px-4 py-3 text-left">含义</th>
                                                <th className="px-4 py-3 text-left">例句</th>
                                                <th className="px-4 py-3 text-center w-48">操作</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {vocabulary.phrases.map((item, index) => {
                                                const itemKey = `phrase-${item.phrase}`;
                                                if (hiddenItems.has(itemKey)) return null;
                                                
                                                return (
                                                    <tr key={index} className="hover:bg-gray-50">
                                                        <td className="px-4 py-3 text-gray-400">{index + 1}</td>
                                                        <td className="px-4 py-3 font-medium text-gray-800">{item.phrase}</td>
                                                        <td className="px-4 py-3 text-gray-600">{item.meaning}</td>
                                                        <td className="px-4 py-3 text-gray-500 text-sm italic">{item.example || '-'}</td>
                                                        <td className="px-4 py-3">
                                                            <div className="flex justify-center gap-2">
                                                                <button
                                                                    onClick={() => showConfirm('mastered', item, 'phrase')}
                                                                    disabled={actionLoading === itemKey}
                                                                    className="px-2 py-1 text-xs bg-green-100 hover:bg-green-200 text-green-700 rounded transition-colors disabled:opacity-50"
                                                                >
                                                                    {actionLoading === itemKey ? '...' : '✓ 已掌握'}
                                                                </button>
                                                                <button
                                                                    onClick={() => showConfirm('wrong', item, 'phrase')}
                                                                    className="px-2 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-700 rounded transition-colors"
                                                                >
                                                                    ✗ 识别错误
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* 句型表格 */}
                            {vocabulary.patterns?.length > 0 && (
                                <div className="p-6">
                                    <div className="bg-purple-600 text-white px-4 py-3 rounded-t-lg flex items-center gap-2">
                                        <span>📐</span>
                                        <span className="font-medium">句型</span>
                                        <span className="ml-auto text-sm">共 {visiblePatterns} 项</span>
                                    </div>
                                    <table className="w-full">
                                        <thead className="bg-purple-50 text-purple-800 text-sm">
                                            <tr>
                                                <th className="px-4 py-3 text-left w-12">#</th>
                                                <th className="px-4 py-3 text-left">句型</th>
                                                <th className="px-4 py-3 text-left">含义</th>
                                                <th className="px-4 py-3 text-left">例句</th>
                                                <th className="px-4 py-3 text-center w-48">操作</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {vocabulary.patterns.map((item, index) => {
                                                const itemKey = `pattern-${item.pattern}`;
                                                if (hiddenItems.has(itemKey)) return null;
                                                
                                                return (
                                                    <tr key={index} className="hover:bg-gray-50">
                                                        <td className="px-4 py-3 text-gray-400">{index + 1}</td>
                                                        <td className="px-4 py-3 font-medium text-gray-800">{item.pattern}</td>
                                                        <td className="px-4 py-3 text-gray-600">{item.meaning}</td>
                                                        <td className="px-4 py-3 text-gray-500 text-sm italic">{item.example || '-'}</td>
                                                        <td className="px-4 py-3">
                                                            <div className="flex justify-center gap-2">
                                                                <button
                                                                    onClick={() => showConfirm('mastered', item, 'pattern')}
                                                                    disabled={actionLoading === itemKey}
                                                                    className="px-2 py-1 text-xs bg-green-100 hover:bg-green-200 text-green-700 rounded transition-colors disabled:opacity-50"
                                                                >
                                                                    {actionLoading === itemKey ? '...' : '✓ 已掌握'}
                                                                </button>
                                                                <button
                                                                    onClick={() => showConfirm('wrong', item, 'pattern')}
                                                                    className="px-2 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-700 rounded transition-colors"
                                                                >
                                                                    ✗ 识别错误
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {totalVocab === 0 && (
                                <p className="text-center text-gray-400 py-12">暂无词汇内容</p>
                            )}
                        </div>
                    )}

                    {activeTab === 'grammar' && (
                        <div className="p-6 space-y-4">
                            {grammar.map((item, index) => {
                                const itemKey = `grammar-${item.title}`;
                                if (hiddenItems.has(itemKey)) return null;
                                
                                return (
                                    <GrammarCard
                                        key={index}
                                        item={item}
                                        index={index}
                                        onMastered={() => showConfirm('mastered', item, 'grammar')}
                                        onWrong={() => showConfirm('wrong', item, 'grammar')}
                                        loading={actionLoading === itemKey}
                                    />
                                );
                            })}

                            {visibleGrammar === 0 && (
                                <p className="text-center text-gray-400 py-12">暂无语法内容</p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

/**
 * 语法卡片组件
 */
function GrammarCard({ item, index, onMastered, onWrong, loading }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
            {/* 标题行 */}
            <div 
                className="flex items-center gap-4 p-4 cursor-pointer hover:bg-gray-50 transition-colors bg-gradient-to-r from-orange-50 to-amber-50"
                onClick={() => setExpanded(!expanded)}
            >
                <span className="w-8 h-8 bg-orange-500 text-white rounded-lg flex items-center justify-center font-bold">
                    {index + 1}
                </span>
                <span className="font-bold text-gray-800 flex-1">{item.title}</span>
                
                {/* 操作按钮 */}
                <div 
                    className="flex gap-2"
                    onClick={e => e.stopPropagation()}
                >
                    <button
                        onClick={onMastered}
                        disabled={loading}
                        className="px-2 py-1 text-xs bg-green-100 hover:bg-green-200 text-green-700 rounded transition-colors disabled:opacity-50"
                    >
                        {loading ? '...' : '✓ 已掌握'}
                    </button>
                    <button
                        onClick={onWrong}
                        className="px-2 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-700 rounded transition-colors"
                    >
                        ✗ 识别错误
                    </button>
                </div>
                
                <span className="text-gray-400 ml-2">
                    {expanded ? '▲' : '▼'}
                </span>
            </div>

            {/* 展开内容 */}
            {expanded && (
                <div className="px-6 pb-6 space-y-4 border-t border-gray-200 bg-white">
                    {item.definition && (
                        <div className="mt-4">
                            <span className="text-sm text-gray-500 font-medium">📝 定义</span>
                            <p className="text-gray-700 mt-1">{item.definition}</p>
                        </div>
                    )}
                    {item.structure && (
                        <div>
                            <span className="text-sm text-gray-500 font-medium">📋 结构</span>
                            <p className="text-gray-700 mt-1 font-mono bg-gray-50 px-3 py-2 rounded-lg">{item.structure}</p>
                        </div>
                    )}
                    {item.usage?.length > 0 && (
                        <div>
                            <span className="text-sm text-gray-500 font-medium">💡 用法</span>
                            <ul className="text-gray-700 mt-1 list-disc list-inside space-y-1">
                                {item.usage.map((u, i) => <li key={i}>{u}</li>)}
                            </ul>
                        </div>
                    )}
                    {item.examples?.length > 0 && (
                        <div>
                            <span className="text-sm text-gray-500 font-medium">📌 例句</span>
                            <ul className="text-gray-600 mt-1 italic space-y-1">
                                {item.examples.map((ex, i) => <li key={i}>• {ex}</li>)}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default ReportViewer;