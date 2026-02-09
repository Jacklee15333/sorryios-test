import { useState, useEffect, useCallback } from 'react';

/**
 * WrongQuestionBook - 错题本 Dashboard v1.0
 * 
 * 功能：
 * - 顶部统计卡片（总错题、已掌握、本周新增）
 * - 筛选栏（section, questionType, mastered）
 * - 错题列表（卡片式）
 * - 展开详情
 * - 标记已掌握/取消
 * - 删除错题
 */
export default function WrongQuestionBook() {
    const [questions, setQuestions] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [expandedId, setExpandedId] = useState(null);

    // 筛选
    const [filterSection, setFilterSection] = useState('');
    const [filterType, setFilterType] = useState('');
    const [filterMastered, setFilterMastered] = useState('');

    const token = localStorage.getItem('token');

    // 加载数据
    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            setError('');

            // 加载统计
            const statsRes = await fetch('/api/wrong-questions/stats', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (statsRes.ok) {
                const data = await statsRes.json();
                setStats(data.stats);
            }

            // 加载错题列表
            const params = new URLSearchParams();
            if (filterSection) params.append('section', filterSection);
            if (filterType) params.append('questionType', filterType);
            if (filterMastered !== '') params.append('mastered', filterMastered);

            const listRes = await fetch(`/api/wrong-questions?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (listRes.ok) {
                const data = await listRes.json();
                setQuestions(data.questions || []);
            } else {
                const errData = await listRes.json().catch(() => ({}));
                setError(errData.message || '加载失败');
            }
        } catch (err) {
            console.error('[WrongQuestionBook] 加载失败:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [token, filterSection, filterType, filterMastered]);

    useEffect(() => { loadData(); }, [loadData]);

    // 标记已掌握
    const handleMaster = async (id) => {
        try {
            const res = await fetch(`/api/wrong-questions/${id}/master`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                setQuestions(prev => prev.map(q => q.id === id ? { ...q, mastered: 1 } : q));
                if (stats) setStats(prev => ({ ...prev, mastered: prev.mastered + 1, unmastered: prev.unmastered - 1 }));
            }
        } catch (err) {
            console.error('标记失败:', err);
        }
    };

    // 取消已掌握
    const handleUnmaster = async (id) => {
        try {
            const res = await fetch(`/api/wrong-questions/${id}/unmaster`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                setQuestions(prev => prev.map(q => q.id === id ? { ...q, mastered: 0 } : q));
                if (stats) setStats(prev => ({ ...prev, mastered: prev.mastered - 1, unmastered: prev.unmastered + 1 }));
            }
        } catch (err) {
            console.error('取消失败:', err);
        }
    };

    // 删除
    const handleDelete = async (id) => {
        if (!confirm('确定删除这道错题吗？')) return;
        try {
            const res = await fetch(`/api/wrong-questions/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                setQuestions(prev => prev.filter(q => q.id !== id));
                if (stats) setStats(prev => ({ ...prev, total: prev.total - 1 }));
            }
        } catch (err) {
            console.error('删除失败:', err);
        }
    };

    // 获取所有 section 和 type（用于筛选选项）
    const allSections = [...new Set(questions.map(q => q.section).filter(Boolean))];
    const allTypes = [...new Set(questions.map(q => q.question_type).filter(Boolean))];

    const typeLabels = {
        choice: '选择题',
        fill_blank: '填空题',
        short_answer: '简答题',
        dialogue: '对话题',
    };

    return (
        <div className="space-y-6">
            {/* 统计卡片 */}
            {stats && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-gradient-to-br from-red-500 to-orange-500 rounded-2xl p-6 text-white shadow-lg">
                        <p className="text-sm opacity-80">总错题</p>
                        <p className="text-3xl font-bold mt-1">{stats.total}</p>
                    </div>
                    <div className="bg-gradient-to-br from-green-500 to-emerald-500 rounded-2xl p-6 text-white shadow-lg">
                        <p className="text-sm opacity-80">已掌握</p>
                        <p className="text-3xl font-bold mt-1">{stats.mastered}</p>
                    </div>
                    <div className="bg-gradient-to-br from-blue-500 to-indigo-500 rounded-2xl p-6 text-white shadow-lg">
                        <p className="text-sm opacity-80">本周新增</p>
                        <p className="text-3xl font-bold mt-1">{stats.thisWeek}</p>
                    </div>
                </div>
            )}

            {/* 筛选栏 */}
            <div className="bg-white rounded-2xl shadow-xl p-6">
                <div className="flex items-center space-x-3 mb-4">
                    <svg className="w-6 h-6 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                    </svg>
                    <h3 className="font-semibold text-gray-700">筛选</h3>
                </div>
                <div className="flex flex-wrap gap-3">
                    <select
                        value={filterSection}
                        onChange={(e) => setFilterSection(e.target.value)}
                        className="px-4 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-orange-500"
                    >
                        <option value="">全部题型</option>
                        {allSections.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>

                    <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                        className="px-4 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-orange-500"
                    >
                        <option value="">全部类型</option>
                        {allTypes.map(t => <option key={t} value={t}>{typeLabels[t] || t}</option>)}
                    </select>

                    <select
                        value={filterMastered}
                        onChange={(e) => setFilterMastered(e.target.value)}
                        className="px-4 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-orange-500"
                    >
                        <option value="">全部状态</option>
                        <option value="0">未掌握</option>
                        <option value="1">已掌握</option>
                    </select>

                    {(filterSection || filterType || filterMastered !== '') && (
                        <button
                            onClick={() => { setFilterSection(''); setFilterType(''); setFilterMastered(''); }}
                            className="px-4 py-2 text-sm text-orange-600 hover:text-orange-700 font-medium"
                        >
                            清除筛选
                        </button>
                    )}
                </div>
            </div>

            {/* 错题列表 */}
            <div className="bg-white rounded-2xl shadow-xl p-6">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-gray-800 flex items-center space-x-2">
                        <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                        <span>错题本</span>
                    </h2>
                    <span className="text-sm text-gray-500">{questions.length} 道错题</span>
                </div>

                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin h-10 w-10 border-4 border-orange-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                        <p className="text-gray-500">加载中...</p>
                    </div>
                ) : error ? (
                    <div className="text-center py-12">
                        <p className="text-red-500 mb-2">❌ {error}</p>
                        <button onClick={loadData} className="text-orange-600 hover:text-orange-700 font-medium">重试</button>
                    </div>
                ) : questions.length === 0 ? (
                    <div className="text-center py-16">
                        <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <p className="text-gray-500 mb-1">暂无错题</p>
                        <p className="text-sm text-gray-400">上传试卷后，AI会自动识别错题</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {questions.map((q) => (
                            <div
                                key={q.id}
                                className={`border rounded-xl transition-all duration-200 ${
                                    q.mastered
                                        ? 'border-green-200 bg-green-50/50'
                                        : 'border-gray-200 bg-white hover:shadow-md'
                                }`}
                            >
                                {/* 卡片头部 */}
                                <div
                                    className="p-4 cursor-pointer"
                                    onClick={() => setExpandedId(expandedId === q.id ? null : q.id)}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center space-x-2 mb-1">
                                                <span className="text-sm font-bold text-orange-600">
                                                    第{q.question_number || '?'}题
                                                </span>
                                                {q.section && (
                                                    <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">
                                                        {q.section}
                                                    </span>
                                                )}
                                                {q.question_type && (
                                                    <span className="px-2 py-0.5 rounded-full text-xs bg-purple-100 text-purple-700">
                                                        {typeLabels[q.question_type] || q.question_type}
                                                    </span>
                                                )}
                                                {q.mastered ? (
                                                    <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">✓ 已掌握</span>
                                                ) : null}
                                            </div>
                                            <p className="text-gray-800 text-sm line-clamp-2">
                                                {q.question_content || '(题目内容未识别)'}
                                            </p>
                                            {q.exam_title && (
                                                <p className="text-xs text-gray-400 mt-1">来自: {q.exam_title}</p>
                                            )}
                                        </div>
                                        <svg className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform ${expandedId === q.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </div>
                                </div>

                                {/* 展开详情 */}
                                {expandedId === q.id && (
                                    <div className="border-t border-gray-100 p-4 space-y-3 bg-gray-50/50">
                                        {/* 答案对比 */}
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                                                <p className="text-xs text-red-500 font-medium mb-1">❌ 我的答案</p>
                                                <p className="text-sm text-red-700 font-semibold">{q.user_answer || 'unclear'}</p>
                                            </div>
                                            <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                                                <p className="text-xs text-green-500 font-medium mb-1">✅ 正确答案</p>
                                                <p className="text-sm text-green-700 font-semibold">{q.correct_answer || 'unclear'}</p>
                                            </div>
                                        </div>

                                        {/* 错误分析 */}
                                        {q.error_analysis && (
                                            <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                                                <p className="text-xs text-yellow-600 font-medium mb-1">💡 错误分析</p>
                                                <p className="text-sm text-gray-700">{q.error_analysis}</p>
                                            </div>
                                        )}

                                        {/* 知识点 */}
                                        {q.knowledge_points && q.knowledge_points.length > 0 && (
                                            <div>
                                                <p className="text-xs text-gray-500 mb-1">📚 相关知识点</p>
                                                <div className="flex flex-wrap gap-1">
                                                    {q.knowledge_points.map((kp, i) => (
                                                        <span key={i} className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs">
                                                            {kp}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* 操作按钮 */}
                                        <div className="flex items-center space-x-3 pt-2 border-t border-gray-200">
                                            {q.mastered ? (
                                                <button
                                                    onClick={() => handleUnmaster(q.id)}
                                                    className="px-4 py-2 text-sm bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                                                >
                                                    ↩️ 取消掌握
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => handleMaster(q.id)}
                                                    className="px-4 py-2 text-sm bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors"
                                                >
                                                    ✅ 我已掌握
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleDelete(q.id)}
                                                className="px-4 py-2 text-sm bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition-colors"
                                            >
                                                🗑️ 删除
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
