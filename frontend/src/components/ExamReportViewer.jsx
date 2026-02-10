/**
 * ExamReportViewer v1.1 - 本次试卷错题报告查看器（增强版）
 * 
 * v1.1 新增:
 * - 按 section 展示完整原题内容（sectionContent）
 * - 在原题中标记错题（✗）
 * - 原题下方逐题分析错题
 * - 听力题标记提示（不做分析）
 * - 兼容旧版无 sections 数据
 * 
 * @version 1.1
 * @date 2026-02-10
 */

import { useState, useEffect, useCallback } from 'react';

export default function ExamReportViewer({ examId, onBack }) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [examInfo, setExamInfo] = useState(null);
    const [questions, setQuestions] = useState([]);
    const [sections, setSections] = useState([]);  // v1.1: sections 数据
    const [hiddenIds, setHiddenIds] = useState(new Set());
    const [undoTimers, setUndoTimers] = useState({});

    const token = localStorage.getItem('token');

    const typeLabels = {
        choice: '选择题',
        fill_blank: '填空题',
        short_answer: '简答题',
        dialogue: '对话题',
    };

    const sectionTypeLabels = {
        listening: '🎧 听力',
        cloze: '📝 完形填空',
        reading: '📖 阅读理解',
        grammar: '📐 语法',
        writing: '✍️ 写作',
        vocabulary: '📚 词汇',
        dialogue: '💬 对话',
        other: '📋 其他',
    };

    // ============================================
    // 加载数据
    // ============================================
    const loadData = useCallback(async () => {
        if (!examId) {
            console.error('[ExamReportViewer] ❌ examId 为空');
            setError('examId 为空，无法加载报告');
            setLoading(false);
            return;
        }

        console.log('\n' + '='.repeat(60));
        console.log(`[ExamReportViewer] 🔄 开始加载报告, examId: ${examId}`);
        console.log('='.repeat(60));

        try {
            setLoading(true);
            setError('');

            const res = await fetch(`/api/exam/${examId}/result`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.message || errData.error || `请求失败 (${res.status})`);
            }

            const data = await res.json();
            console.log('[ExamReportViewer] ✅ 数据加载成功');
            console.log(`[ExamReportViewer]   试卷: "${data.exam?.title || '(无标题)'}"`);
            console.log(`[ExamReportViewer]   状态: ${data.exam?.status}`);
            console.log(`[ExamReportViewer]   总题数: ${data.exam?.totalQuestions || 0}`);
            console.log(`[ExamReportViewer]   错题数: ${data.wrongQuestions?.length || 0}`);
            console.log(`[ExamReportViewer]   sections数: ${data.sections?.length || 0}`);

            setExamInfo(data.exam);
            setSections(data.sections || []);

            // 解析 knowledge_points（可能是 JSON 字符串）
            const parsed = (data.wrongQuestions || []).map(q => {
                let kp = q.knowledge_points;
                if (typeof kp === 'string') {
                    try { kp = JSON.parse(kp); } catch (e) { kp = []; }
                }
                return { ...q, knowledge_points: Array.isArray(kp) ? kp : [] };
            });
            setQuestions(parsed);

            console.log('='.repeat(60));
            console.log('[ExamReportViewer] ✅ 加载完成');
            console.log('='.repeat(60) + '\n');

        } catch (err) {
            console.error('[ExamReportViewer] ❌ 加载失败:', err.message);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [examId, token]);

    useEffect(() => { loadData(); }, [loadData]);

    useEffect(() => {
        return () => {
            Object.values(undoTimers).forEach(t => clearTimeout(t));
        };
    }, [undoTimers]);

    // ============================================
    // 标记已掌握
    // ============================================
    const handleMaster = async (question) => {
        const qId = question.id;
        console.log(`[ExamReportViewer] ✅ 标记已掌握, id: ${qId}, 题号: ${question.question_number}`);
        try {
            const res = await fetch(`/api/wrong-questions/${qId}/master`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.message || '标记失败');
            }
            setHiddenIds(prev => new Set([...prev, qId]));
            setQuestions(prev => prev.map(q => q.id === qId ? { ...q, mastered: 1 } : q));
        } catch (err) {
            console.error(`[ExamReportViewer] ❌ 标记失败:`, err.message);
            setHiddenIds(prev => { const s = new Set(prev); s.delete(qId); return s; });
            alert('标记失败: ' + err.message);
        }
    };

    // ============================================
    // 撤销已掌握
    // ============================================
    const handleUnmaster = async (question) => {
        const qId = question.id;
        console.log(`[ExamReportViewer] ↩️ 撤销已掌握, id: ${qId}`);
        try {
            const res = await fetch(`/api/wrong-questions/${qId}/unmaster`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.message || '撤销失败');
            }
            setHiddenIds(prev => { const s = new Set(prev); s.delete(qId); return s; });
            setQuestions(prev => prev.map(q => q.id === qId ? { ...q, mastered: 0 } : q));
        } catch (err) {
            console.error(`[ExamReportViewer] ❌ 撤销失败:`, err.message);
            alert('撤销失败: ' + err.message);
        }
    };

    // ============================================
    // 数据整理
    // ============================================
    const hasSections = sections.length > 0;

    // 将错题按 section_id 分组（用于 v1.1 展示）
    const getQuestionsBySectionId = (sectionId) => {
        return questions
            .filter(q => q.section_id === sectionId && !hiddenIds.has(q.id))
            .sort((a, b) => (parseInt(a.question_number) || 0) - (parseInt(b.question_number) || 0));
    };

    // 旧版兼容：按 section 字段分组
    const getGroupedQuestions = () => {
        const visible = questions.filter(q => !hiddenIds.has(q.id));
        const groups = {};
        visible.forEach(q => {
            const section = q.section || '其他';
            if (!groups[section]) groups[section] = [];
            groups[section].push(q);
        });
        Object.keys(groups).forEach(key => {
            groups[key].sort((a, b) => (parseInt(a.question_number) || 0) - (parseInt(b.question_number) || 0));
        });
        return groups;
    };

    const visibleCount = questions.filter(q => !hiddenIds.has(q.id)).length;
    const masteredCount = questions.filter(q => q.mastered === 1).length;

    // ============================================
    // 渲染：单道错题分析卡片
    // ============================================
    const renderQuestionAnalysis = (q) => (
        <div key={q.id} className="p-5 border border-gray-200 rounded-xl bg-white hover:shadow-md transition-shadow">
            {/* 题号 + 题型 + 操作 */}
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                    <span className="w-8 h-8 bg-gradient-to-br from-orange-400 to-red-500 text-white rounded-lg flex items-center justify-center text-sm font-bold shadow-sm">
                        {q.question_number || '?'}
                    </span>
                    {q.question_type && (
                        <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                            {typeLabels[q.question_type] || q.question_type}
                        </span>
                    )}
                    {q.mastered === 1 && (
                        <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">✓ 已掌握</span>
                    )}
                </div>
                <div className="flex items-center space-x-2">
                    {q.mastered === 1 ? (
                        <button onClick={() => handleUnmaster(q)}
                            className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors">
                            ↩️ 取消掌握
                        </button>
                    ) : (
                        <button onClick={() => handleMaster(q)}
                            className="px-3 py-1.5 text-xs font-medium bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors">
                            ✅ 已掌握
                        </button>
                    )}
                </div>
            </div>

            {/* 题目内容 */}
            {q.question_content && q.question_content !== 'unclear' && (
                <div className="mb-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="text-xs text-gray-400 font-medium mb-1">📄 题目</p>
                    <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{q.question_content}</p>
                </div>
            )}

            {/* 答案对比 */}
            <div className="grid grid-cols-2 gap-3 mb-3">
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
            {q.error_analysis && q.error_analysis !== 'unclear' && (
                <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200 mb-3">
                    <p className="text-xs text-yellow-600 font-medium mb-1">💡 错误分析</p>
                    <p className="text-sm text-gray-700 leading-relaxed">{q.error_analysis}</p>
                </div>
            )}

            {/* 知识点 */}
            {q.knowledge_points && q.knowledge_points.length > 0 && (
                <div className="flex items-start space-x-2">
                    <span className="text-xs text-gray-400 mt-1 flex-shrink-0">📚</span>
                    <div className="flex flex-wrap gap-1.5">
                        {q.knowledge_points.map((kp, i) => (
                            <span key={i} className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium">{kp}</span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );

    // ============================================
    // 渲染：加载中 / 错误
    // ============================================
    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center">
                    <div className="animate-spin h-12 w-12 border-4 border-orange-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                    <p className="text-gray-500">加载错题报告中...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <p className="text-red-600 mb-4">加载失败: {error}</p>
                <div className="flex items-center justify-center space-x-3">
                    <button onClick={loadData} className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors">重试</button>
                    {onBack && <button onClick={onBack} className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors">返回</button>}
                </div>
            </div>
        );
    }

    // ============================================
    // 渲染：主内容
    // ============================================
    return (
        <div className="space-y-6">
            {/* ═══ 顶部信息栏 ═══ */}
            <div className="bg-gradient-to-r from-orange-500 via-red-500 to-pink-500 rounded-2xl shadow-xl p-6 text-white">
                <div className="flex items-start justify-between">
                    <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                            {onBack && (
                                <button onClick={onBack} className="p-2 hover:bg-white/20 rounded-lg transition-colors" title="返回">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                    </svg>
                                </button>
                            )}
                            <h2 className="text-2xl font-bold">📋 {examInfo?.title || '试卷错题报告'}</h2>
                        </div>
                        <p className="text-white/80 text-sm mt-1">
                            {examInfo?.completedAt ? `完成时间: ${new Date(examInfo.completedAt).toLocaleString()}` : ''}
                        </p>
                    </div>
                    <button onClick={loadData} className="p-2 hover:bg-white/20 rounded-lg transition-colors" title="刷新">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                </div>

                {/* 统计条 */}
                <div className="flex items-center space-x-6 mt-4">
                    <div className="flex items-center space-x-2">
                        <span className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center text-sm font-bold">{examInfo?.totalQuestions || 0}</span>
                        <span className="text-sm text-white/80">总题数</span>
                    </div>
                    <div className="flex items-center space-x-2">
                        <span className="w-8 h-8 bg-red-400/50 rounded-lg flex items-center justify-center text-sm font-bold">{questions.length}</span>
                        <span className="text-sm text-white/80">错题</span>
                    </div>
                    <div className="flex items-center space-x-2">
                        <span className="w-8 h-8 bg-green-400/50 rounded-lg flex items-center justify-center text-sm font-bold">{masteredCount}</span>
                        <span className="text-sm text-white/80">已掌握</span>
                    </div>
                    {hasSections && (
                        <div className="flex items-center space-x-2">
                            <span className="w-8 h-8 bg-blue-400/50 rounded-lg flex items-center justify-center text-sm font-bold">{sections.length}</span>
                            <span className="text-sm text-white/80">大题</span>
                        </div>
                    )}
                </div>
            </div>

            {/* ═══ 无错题 ═══ */}
            {questions.length === 0 && !hasSections && (
                <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
                    <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-12 h-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <p className="text-gray-600 text-lg font-medium">这次没有发现错题，太棒了！🎉</p>
                    <p className="text-gray-400 text-sm mt-1">继续保持，加油！</p>
                </div>
            )}

            {/* ═══ 全部已掌握 ═══ */}
            {questions.length > 0 && visibleCount === 0 && (
                <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center">
                    <p className="text-green-700 font-medium">🎉 本次所有错题都已标记为"已掌握"</p>
                    <button onClick={() => setHiddenIds(new Set())} className="mt-2 text-sm text-green-600 hover:text-green-700 underline">
                        显示所有错题
                    </button>
                </div>
            )}

            {/* ═══════════════════════════════════════════ */}
            {/* v1.1: 按 Section 展示（完整原题 + 错题分析）    */}
            {/* ═══════════════════════════════════════════ */}
            {hasSections ? (
                // ── v1.1 新版：有 sections 数据 ──
                <>
                {sections.map((sec) => {
                    const sectionQuestions = getQuestionsBySectionId(sec.id);
                    const allSectionQuestions = questions.filter(q => q.section_id === sec.id);
                    const isListening = sec.isListening;

                    return (
                        <div key={sec.id} className="bg-white rounded-2xl shadow-xl overflow-hidden">
                            {/* Section 标题栏 */}
                            <div className={`px-6 py-4 border-b ${
                                isListening 
                                    ? 'bg-gradient-to-r from-gray-100 to-gray-50 border-gray-200' 
                                    : 'bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-100'
                            }`}>
                                <div className="flex items-center justify-between">
                                    <h3 className="text-lg font-bold text-gray-800 flex items-center space-x-2">
                                        <span className={`w-2 h-6 rounded-full ${isListening ? 'bg-gray-400' : 'bg-indigo-500'}`}></span>
                                        <span>{sec.sectionName}</span>
                                        {sec.sectionType && (
                                            <span className={`px-2 py-0.5 rounded-full text-xs ${
                                                isListening ? 'bg-gray-200 text-gray-600' : 'bg-indigo-100 text-indigo-600'
                                            }`}>
                                                {sectionTypeLabels[sec.sectionType] || sec.sectionType}
                                            </span>
                                        )}
                                    </h3>
                                    <div className="flex items-center space-x-2">
                                        {isListening ? (
                                            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">🎧 听力题 · 不分析错题</span>
                                        ) : allSectionQuestions.length > 0 ? (
                                            <span className="text-sm text-red-500 font-medium">{allSectionQuestions.length} 道错题</span>
                                        ) : (
                                            <span className="text-sm text-green-500">✓ 全对</span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Section 完整原题内容 */}
                            {sec.sectionContent && (
                                <div className="px-6 py-4 border-b border-gray-100">
                                    <div className="flex items-center space-x-2 mb-3">
                                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">📄 原题内容</span>
                                    </div>
                                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 max-h-[600px] overflow-y-auto">
                                        <pre className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap font-sans">{sec.sectionContent}</pre>
                                    </div>
                                </div>
                            )}

                            {/* 听力题提示 */}
                            {isListening && (
                                <div className="px-6 py-4 text-center">
                                    <p className="text-gray-400 text-sm">🎧 听力题需要音频配合，暂不分析错题</p>
                                </div>
                            )}

                            {/* 错题逐个分析 */}
                            {!isListening && sectionQuestions.length > 0 && (
                                <div className="px-6 py-4">
                                    <div className="flex items-center space-x-2 mb-4">
                                        <span className="text-xs font-semibold text-red-500 uppercase tracking-wider">📝 错题分析</span>
                                        <span className="text-xs text-gray-400">({sectionQuestions.length} 道)</span>
                                    </div>
                                    <div className="space-y-4">
                                        {sectionQuestions.map(q => renderQuestionAnalysis(q))}
                                    </div>
                                </div>
                            )}

                            {/* 该section无错题（非听力） */}
                            {!isListening && allSectionQuestions.length === 0 && (
                                <div className="px-6 py-4 text-center">
                                    <p className="text-green-500 text-sm">✅ 本大题全部正确，继续保持！</p>
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* v1.1 兜底：显示未关联到任何 section 的错题（section_id 为 null） */}
                {(() => {
                    const sectionIds = new Set(sections.map(s => s.id));
                    const orphanedQuestions = questions.filter(q => 
                        !hiddenIds.has(q.id) && (q.section_id == null || !sectionIds.has(q.section_id))
                    );
                    if (orphanedQuestions.length === 0) return null;
                    return (
                        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
                            <div className="bg-gradient-to-r from-amber-50 to-orange-50 px-6 py-4 border-b border-amber-100">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-lg font-bold text-gray-800 flex items-center space-x-2">
                                        <span className="w-2 h-6 bg-amber-500 rounded-full"></span>
                                        <span>其他错题</span>
                                    </h3>
                                    <span className="text-sm text-amber-600 font-medium">{orphanedQuestions.length} 道</span>
                                </div>
                            </div>
                            <div className="px-6 py-4 space-y-4">
                                {orphanedQuestions.map(q => renderQuestionAnalysis(q))}
                            </div>
                        </div>
                    );
                })()}
                </>
            ) : (
                // ── v1.0 旧版兼容：无 sections，按 section 字段分组 ──
                Object.entries(getGroupedQuestions()).map(([section, sectionQuestions]) => (
                    <div key={section} className="bg-white rounded-2xl shadow-xl overflow-hidden">
                        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 px-6 py-4 border-b border-indigo-100">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-bold text-gray-800 flex items-center space-x-2">
                                    <span className="w-2 h-6 bg-indigo-500 rounded-full"></span>
                                    <span>{section}</span>
                                </h3>
                                <span className="text-sm text-gray-500">{sectionQuestions.length} 道错题</span>
                            </div>
                        </div>

                        {/* 如果有 section_content（旧数据通过 JOIN 获取） */}
                        {sectionQuestions[0]?.section_content && (
                            <div className="px-6 py-4 border-b border-gray-100">
                                <div className="flex items-center space-x-2 mb-3">
                                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">📄 原题内容</span>
                                </div>
                                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 max-h-[600px] overflow-y-auto">
                                    <pre className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap font-sans">{sectionQuestions[0].section_content}</pre>
                                </div>
                            </div>
                        )}

                        <div className="px-6 py-4 space-y-4">
                            {sectionQuestions.map(q => renderQuestionAnalysis(q))}
                        </div>
                    </div>
                ))
            )}
        </div>
    );
}
