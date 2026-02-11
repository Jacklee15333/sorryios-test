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
    const [showExportMenu, setShowExportMenu] = useState(false);

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
    // 导出功能
    // ============================================
    const generateExportHTML = () => {
        const title = examInfo?.title || '试卷错题报告';
        const completedAt = examInfo?.completedAt ? new Date(examInfo.completedAt).toLocaleString() : '';
        const totalQuestions = examInfo?.totalQuestions || 0;
        
        let html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif; background: #f5f5f5; color: #333; line-height: 1.6; padding: 20px; }
    .container { max-width: 900px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.1); overflow: hidden; }
    .header { background: linear-gradient(135deg, #f97316, #ef4444, #ec4899); color: #fff; padding: 24px 32px; }
    .header h1 { font-size: 22px; margin-bottom: 8px; }
    .header .meta { font-size: 13px; opacity: 0.85; }
    .stats { display: flex; gap: 24px; margin-top: 16px; }
    .stats .item { display: flex; align-items: center; gap: 8px; }
    .stats .num { background: rgba(255,255,255,0.2); border-radius: 8px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px; }
    .stats .label { font-size: 13px; opacity: 0.85; }
    .section { border-bottom: 1px solid #e5e7eb; }
    .section-title { padding: 16px 24px; background: #f0f4ff; font-size: 16px; font-weight: bold; color: #1e293b; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: between; }
    .section-title .badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 11px; font-weight: 500; margin-left: 8px; }
    .badge-listening { background: #f3f4f6; color: #6b7280; }
    .badge-cloze { background: #fef3c7; color: #92400e; }
    .badge-reading { background: #dbeafe; color: #1e40af; }
    .badge-grammar { background: #ede9fe; color: #5b21b6; }
    .badge-vocab { background: #d1fae5; color: #065f46; }
    .section-status { float: right; font-size: 13px; font-weight: 500; }
    .status-correct { color: #16a34a; }
    .status-errors { color: #dc2626; }
    .content-block { padding: 16px 24px; }
    .content-label { font-size: 11px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
    .content-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; font-size: 14px; white-space: pre-wrap; line-height: 1.8; }
    .question-card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px; margin-bottom: 12px; background: #fff; }
    .question-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
    .question-num { background: linear-gradient(135deg, #f97316, #ef4444); color: #fff; width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: bold; }
    .question-type { background: #f3e8ff; color: #7c3aed; padding: 2px 8px; border-radius: 10px; font-size: 11px; }
    .answer-row { display: flex; gap: 16px; margin: 6px 0; font-size: 13px; }
    .answer-label { color: #9ca3af; min-width: 70px; }
    .answer-wrong { color: #dc2626; font-weight: 500; }
    .answer-correct { color: #16a34a; font-weight: 500; }
    .analysis { background: #f0fdf4; border-left: 3px solid #22c55e; padding: 10px 14px; border-radius: 0 8px 8px 0; margin-top: 8px; font-size: 13px; color: #15803d; }
    .all-correct { text-align: center; padding: 20px; color: #16a34a; font-weight: 500; }
    .listening-note { text-align: center; padding: 16px; color: #9ca3af; font-size: 13px; }
    .footer { text-align: center; padding: 16px; color: #9ca3af; font-size: 12px; border-top: 1px solid #f3f4f6; }
    @media print { body { background: #fff; padding: 0; } .container { box-shadow: none; } }
</style>
</head>
<body>
<div class="container">
    <div class="header">
        <h1>📋 ${title}</h1>
        ${completedAt ? `<div class="meta">完成时间: ${completedAt}</div>` : ''}
        <div class="stats">
            <div class="item"><div class="num">${totalQuestions}</div><div class="label">总题数</div></div>
            <div class="item"><div class="num">${questions.length}</div><div class="label">错题</div></div>
            <div class="item"><div class="num">${masteredCount}</div><div class="label">已掌握</div></div>
        </div>
    </div>`;

        if (hasSections) {
            sections.forEach(sec => {
                const secQuestions = questions.filter(q => q.section_id === sec.id);
                const isListening = sec.isListening;
                const hasErrors = secQuestions.length > 0;
                const badgeClass = isListening ? 'badge-listening' : 
                    (sec.sectionType === 'cloze' ? 'badge-cloze' : 
                     sec.sectionType === 'reading' ? 'badge-reading' : 
                     sec.sectionType === 'grammar' ? 'badge-grammar' : 'badge-vocab');
                const badgeText = sectionTypeLabels[sec.sectionType] || sec.sectionType || '';

                html += `
    <div class="section">
        <div class="section-title">
            ${sec.sectionName}
            ${badgeText ? `<span class="badge ${badgeClass}">${badgeText}</span>` : ''}
            <span class="section-status ${hasErrors ? 'status-errors' : 'status-correct'}" style="margin-left:auto">
                ${hasErrors ? `✗ ${secQuestions.length}题错误` : '✓ 全对'}
            </span>
        </div>`;

                if (sec.sectionContent) {
                    html += `
        <div class="content-block">
            <div class="content-label">📄 原题内容</div>
            <div class="content-box">${sec.sectionContent.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
        </div>`;
                }

                if (isListening) {
                    html += `<div class="listening-note">🎧 听力题需要音频配合，暂不分析错题</div>`;
                } else if (!hasErrors) {
                    html += `<div class="all-correct">✅ 本大题全部正确，继续保持！</div>`;
                } else {
                    html += `<div class="content-block">`;
                    secQuestions.forEach(q => {
                        html += `
            <div class="question-card">
                <div class="question-header">
                    <div class="question-num">${q.question_number || '?'}</div>
                    ${q.question_type ? `<span class="question-type">${typeLabels[q.question_type] || q.question_type}</span>` : ''}
                </div>
                ${q.question_content ? `<div style="font-size:13px;color:#4b5563;margin-bottom:8px">${q.question_content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>` : ''}
                <div class="answer-row">
                    <span class="answer-label">你的答案:</span>
                    <span class="answer-wrong">${q.user_answer || '-'}</span>
                </div>
                <div class="answer-row">
                    <span class="answer-label">正确答案:</span>
                    <span class="answer-correct">${q.correct_answer || '-'}</span>
                </div>
                ${q.error_analysis ? `<div class="analysis">💡 ${q.error_analysis.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>` : ''}
            </div>`;
                    });
                    html += `</div>`;
                }
                html += `</div>`;
            });
        } else {
            // 旧版兼容
            const grouped = getGroupedQuestions();
            Object.entries(grouped).forEach(([section, qs]) => {
                html += `
    <div class="section">
        <div class="section-title">${section}</div>
        <div class="content-block">`;
                qs.forEach(q => {
                    html += `
            <div class="question-card">
                <div class="question-header">
                    <div class="question-num">${q.question_number || '?'}</div>
                </div>
                ${q.question_content ? `<div style="font-size:13px;color:#4b5563;margin-bottom:8px">${q.question_content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>` : ''}
                <div class="answer-row">
                    <span class="answer-label">你的答案:</span>
                    <span class="answer-wrong">${q.user_answer || '-'}</span>
                </div>
                <div class="answer-row">
                    <span class="answer-label">正确答案:</span>
                    <span class="answer-correct">${q.correct_answer || '-'}</span>
                </div>
                ${q.error_analysis ? `<div class="analysis">💡 ${q.error_analysis.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>` : ''}
            </div>`;
                });
                html += `</div></div>`;
            });
        }

        html += `
    <div class="footer">Sorryios AI 智能笔记助手 · 生成于 ${new Date().toLocaleString()}</div>
</div>
</body>
</html>`;
        return html;
    };

    const exportHTML = () => {
        const html = generateExportHTML();
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${examInfo?.title || '错题报告'}.html`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const exportWord = () => {
        // Word 可以打开带 mso 声明的 HTML
        const html = generateExportHTML();
        const wordHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="UTF-8"><!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]--></head>
<body>${html}</body></html>`;
        const blob = new Blob([wordHtml], { type: 'application/msword' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${examInfo?.title || '错题报告'}.doc`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const exportPDF = () => {
        // 打开新窗口显示HTML，然后调用打印 → 用户选"另存为PDF"
        const html = generateExportHTML();
        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(html);
            printWindow.document.close();
            // 等待内容加载完成后触发打印
            printWindow.onload = () => {
                setTimeout(() => printWindow.print(), 300);
            };
            // 备用：如果 onload 不触发
            setTimeout(() => {
                try { printWindow.print(); } catch(e) { /* 忽略 */ }
            }, 1000);
        } else {
            alert('浏览器阻止了弹出窗口，请允许弹出窗口后重试');
        }
    };

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
                    <div className="flex items-center space-x-2">
                        <button onClick={loadData} className="p-2 hover:bg-white/20 rounded-lg transition-colors" title="刷新">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        </button>
                        {/* 导出按钮 */}
                        <div className="relative">
                            <button 
                                onClick={() => setShowExportMenu(!showExportMenu)} 
                                className="p-2 hover:bg-white/20 rounded-lg transition-colors flex items-center space-x-1" 
                                title="导出报告"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                            </button>
                            {showExportMenu && (
                                <>
                                    <div className="fixed inset-0 z-10" onClick={() => setShowExportMenu(false)}></div>
                                    <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-2xl border border-gray-200 py-2 z-20">
                                        <button onClick={() => { exportPDF(); setShowExportMenu(false); }} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-orange-50 flex items-center space-x-3 transition-colors">
                                            <span className="text-lg">📄</span><span>导出为 PDF</span>
                                        </button>
                                        <button onClick={() => { exportWord(); setShowExportMenu(false); }} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 flex items-center space-x-3 transition-colors">
                                            <span className="text-lg">📝</span><span>导出为 Word</span>
                                        </button>
                                        <button onClick={() => { exportHTML(); setShowExportMenu(false); }} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-green-50 flex items-center space-x-3 transition-colors">
                                            <span className="text-lg">🌐</span><span>导出为 HTML</span>
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
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
                                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
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
                                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
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