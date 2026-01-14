import { useState, useEffect } from 'react';

/**
 * 报告查看组件 v3.0
 * - 全屏布局，内容充实
 * - 支持"已掌握"和"识别错误"操作
 */
function ReportViewer({ taskId, onBack }) {
    const [report, setReport] = useState(null);
    const [reportData, setReportData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('vocabulary');
    const [hiddenItems, setHiddenItems] = useState(new Set());
    const [actionLoading, setActionLoading] = useState(null);

    // 获取报告信息
    useEffect(() => {
        if (!taskId) return;

        const fetchReport = async () => {
            try {
                setLoading(true);
                
                const response = await fetch(`/api/report/${taskId}`);
                const data = await response.json();

                if (!response.ok || !data.success) {
                    throw new Error(data.message || data.error || '获取报告失败');
                }

                setReport(data.report);

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

    // 标记为已掌握
    const handleMastered = async (item, type) => {
        const word = item.word || item.phrase || item.pattern || item.title;
        const itemKey = `${type}-${word}`;
        
        setActionLoading(itemKey);
        
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/user-mastered/add', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ word, wordType: type })
            });

            if (response.ok) {
                setHiddenItems(prev => new Set([...prev, itemKey]));
            }
        } catch (e) {
            console.error('标记已掌握失败:', e);
        } finally {
            setActionLoading(null);
        }
    };

    // 标记为识别错误
    const handleWrongRecognition = (item, type) => {
        const word = item.word || item.phrase || item.pattern || item.title;
        const itemKey = `${type}-${word}`;
        setHiddenItems(prev => new Set([...prev, itemKey]));
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
                    <div className="animate-spin h-10 w-10 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto mb-4"></div>
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

    // 计算可见数量
    const visibleWords = getVisibleCount(vocabulary.words, 'word', 'word');
    const visiblePhrases = getVisibleCount(vocabulary.phrases, 'phrase', 'phrase');
    const visiblePatterns = getVisibleCount(vocabulary.patterns, 'pattern', 'pattern');
    const visibleGrammar = getVisibleCount(grammar, 'grammar', 'title');
    const totalVocab = visibleWords + visiblePhrases + visiblePatterns;

    return (
        <div className="space-y-6">
            {/* 顶部统计 */}
            <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl p-6 text-white">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="text-2xl font-bold">📊 学习报告</h2>
                        <p className="text-white/80 text-sm mt-1">
                            {reportData.metadata?.originalFile || reportData.metadata?.title || '课堂笔记'}
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <a
                            href={files.html.preview}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm transition-colors"
                        >
                            🌐 网页版
                        </a>
                        <a
                            href={files.html.download}
                            download
                            className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm transition-colors"
                        >
                            ⬇️ 下载
                        </a>
                        <button
                            onClick={onBack}
                            className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm transition-colors"
                        >
                            ← 返回
                        </button>
                    </div>
                </div>

                {/* 统计卡片 */}
                <div className="grid grid-cols-4 gap-4">
                    <div className="bg-white/10 rounded-lg p-4 text-center">
                        <div className="text-3xl font-bold">{visibleWords}</div>
                        <div className="text-sm text-white/80">单词</div>
                    </div>
                    <div className="bg-white/10 rounded-lg p-4 text-center">
                        <div className="text-3xl font-bold">{visiblePhrases}</div>
                        <div className="text-sm text-white/80">短语</div>
                    </div>
                    <div className="bg-white/10 rounded-lg p-4 text-center">
                        <div className="text-3xl font-bold">{visiblePatterns}</div>
                        <div className="text-sm text-white/80">句型</div>
                    </div>
                    <div className="bg-white/10 rounded-lg p-4 text-center">
                        <div className="text-3xl font-bold">{visibleGrammar}</div>
                        <div className="text-sm text-white/80">语法</div>
                    </div>
                </div>
            </div>

            {/* 标签页 */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="border-b border-gray-200">
                    <div className="flex">
                        <button
                            onClick={() => setActiveTab('vocabulary')}
                            className={`flex-1 py-4 px-6 text-sm font-medium transition-all ${
                                activeTab === 'vocabulary'
                                    ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50'
                                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                            }`}
                        >
                            📚 词汇 ({totalVocab})
                        </button>
                        <button
                            onClick={() => setActiveTab('grammar')}
                            className={`flex-1 py-4 px-6 text-sm font-medium transition-all ${
                                activeTab === 'grammar'
                                    ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50'
                                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                            }`}
                        >
                            📖 语法 ({visibleGrammar})
                        </button>
                    </div>
                </div>

                {/* 操作提示 */}
                <div className="bg-blue-50 px-6 py-3 border-b border-blue-100">
                    <p className="text-sm text-blue-600">
                        💡 点击 <span className="font-medium text-green-600">[已掌握]</span> 会记录到你的词库，下次不再显示；
                        点击 <span className="font-medium text-red-600">[识别错误]</span> 只会从当前报告隐藏
                    </p>
                </div>

                {/* 内容区域 */}
                <div className="p-6">
                    {activeTab === 'vocabulary' && (
                        <div className="space-y-6">
                            {/* 单词 */}
                            {vocabulary.words?.length > 0 && (
                                <div>
                                    <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                                        <span className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">📝</span>
                                        单词 ({visibleWords})
                                    </h3>
                                    <div className="grid gap-3">
                                        {vocabulary.words.map((item, index) => {
                                            const itemKey = `word-${item.word}`;
                                            if (hiddenItems.has(itemKey)) return null;
                                            
                                            return (
                                                <VocabItem
                                                    key={index}
                                                    item={item}
                                                    type="word"
                                                    nameField="word"
                                                    onMastered={() => handleMastered(item, 'word')}
                                                    onWrong={() => handleWrongRecognition(item, 'word')}
                                                    loading={actionLoading === itemKey}
                                                />
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* 短语 */}
                            {vocabulary.phrases?.length > 0 && (
                                <div>
                                    <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                                        <span className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">💬</span>
                                        短语 ({visiblePhrases})
                                    </h3>
                                    <div className="grid gap-3">
                                        {vocabulary.phrases.map((item, index) => {
                                            const itemKey = `phrase-${item.phrase}`;
                                            if (hiddenItems.has(itemKey)) return null;
                                            
                                            return (
                                                <VocabItem
                                                    key={index}
                                                    item={item}
                                                    type="phrase"
                                                    nameField="phrase"
                                                    onMastered={() => handleMastered(item, 'phrase')}
                                                    onWrong={() => handleWrongRecognition(item, 'phrase')}
                                                    loading={actionLoading === itemKey}
                                                />
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* 句型 */}
                            {vocabulary.patterns?.length > 0 && (
                                <div>
                                    <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                                        <span className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">📐</span>
                                        句型 ({visiblePatterns})
                                    </h3>
                                    <div className="grid gap-3">
                                        {vocabulary.patterns.map((item, index) => {
                                            const itemKey = `pattern-${item.pattern}`;
                                            if (hiddenItems.has(itemKey)) return null;
                                            
                                            return (
                                                <VocabItem
                                                    key={index}
                                                    item={item}
                                                    type="pattern"
                                                    nameField="pattern"
                                                    onMastered={() => handleMastered(item, 'pattern')}
                                                    onWrong={() => handleWrongRecognition(item, 'pattern')}
                                                    loading={actionLoading === itemKey}
                                                />
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {totalVocab === 0 && (
                                <p className="text-center text-gray-400 py-12">暂无词汇内容</p>
                            )}
                        </div>
                    )}

                    {activeTab === 'grammar' && (
                        <div className="space-y-4">
                            {grammar.map((item, index) => {
                                const itemKey = `grammar-${item.title}`;
                                if (hiddenItems.has(itemKey)) return null;
                                
                                return (
                                    <GrammarItem
                                        key={index}
                                        item={item}
                                        onMastered={() => handleMastered(item, 'grammar')}
                                        onWrong={() => handleWrongRecognition(item, 'grammar')}
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
 * 词汇项组件
 */
function VocabItem({ item, type, nameField, onMastered, onWrong, loading }) {
    const name = item[nameField] || '';
    const meaning = item.meaning || '';
    const phonetic = item.phonetic || '';
    const pos = item.pos || '';
    const example = item.example || '';

    return (
        <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors group">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-bold text-gray-800 text-lg">{name}</span>
                    {phonetic && <span className="text-purple-500">{phonetic}</span>}
                    {pos && <span className="text-blue-500 text-sm bg-blue-50 px-2 py-0.5 rounded">{pos}</span>}
                </div>
                {meaning && (
                    <p className="text-gray-600 mt-1">{meaning}</p>
                )}
                {example && (
                    <p className="text-gray-400 text-sm mt-2 italic">📌 {example}</p>
                )}
            </div>
            
            {/* 操作按钮 */}
            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button
                    onClick={onMastered}
                    disabled={loading}
                    className="px-3 py-1.5 text-sm bg-green-100 hover:bg-green-200 text-green-700 rounded-lg transition-colors disabled:opacity-50"
                    title="已掌握（记录并隐藏）"
                >
                    {loading ? '...' : '✓ 已掌握'}
                </button>
                <button
                    onClick={onWrong}
                    className="px-3 py-1.5 text-sm bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-colors"
                    title="识别错误（仅隐藏）"
                >
                    ✗ 错误
                </button>
            </div>
        </div>
    );
}

/**
 * 语法项组件
 */
function GrammarItem({ item, onMastered, onWrong, loading }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="bg-gray-50 rounded-xl overflow-hidden">
            {/* 标题行 */}
            <div 
                className="flex items-center gap-4 p-4 cursor-pointer hover:bg-gray-100 transition-colors group"
                onClick={() => setExpanded(!expanded)}
            >
                <span className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center text-xl">
                    {expanded ? '📖' : '📕'}
                </span>
                <span className="font-bold text-gray-800 flex-1">{item.title}</span>
                
                {/* 操作按钮 */}
                <div 
                    className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={e => e.stopPropagation()}
                >
                    <button
                        onClick={onMastered}
                        disabled={loading}
                        className="px-3 py-1.5 text-sm bg-green-100 hover:bg-green-200 text-green-700 rounded-lg transition-colors disabled:opacity-50"
                    >
                        {loading ? '...' : '✓ 已掌握'}
                    </button>
                    <button
                        onClick={onWrong}
                        className="px-3 py-1.5 text-sm bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-colors"
                    >
                        ✗ 错误
                    </button>
                </div>
                
                <span className="text-gray-400">
                    {expanded ? '▲' : '▼'}
                </span>
            </div>

            {/* 展开内容 */}
            {expanded && (
                <div className="px-6 pb-6 space-y-3 border-t border-gray-200 bg-white">
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
