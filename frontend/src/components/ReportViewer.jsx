import { useState, useEffect } from 'react';

/**
 * 报告查看组件 - 预览和下载报告
 */
function ReportViewer({ taskId, onBack }) {
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('preview');

    // 获取报告信息
    useEffect(() => {
        if (!taskId) return;

        const fetchReport = async () => {
            try {
                setLoading(true);
                const response = await fetch(`/api/report/${taskId}`);
                const data = await response.json();

                if (response.ok && data.success) {
                    setReport(data.report);
                } else {
                    throw new Error(data.message || '获取报告失败');
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

    if (loading) {
        return (
            <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
                <div className="animate-spin text-4xl mb-4">⏳</div>
                <p className="text-gray-600">加载报告中...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
                <div className="text-4xl mb-4">❌</div>
                <p className="text-red-600 mb-4">{error}</p>
                <button
                    onClick={onBack}
                    className="py-2 px-4 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600"
                >
                    返回
                </button>
            </div>
        );
    }

    if (!report) return null;

    const { stats, files } = report;

    return (
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden fade-in">
            {/* 顶部信息栏 */}
            <div className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white p-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold mb-1">📊 处理报告</h2>
                        <p className="text-indigo-100 text-sm">
                            共 {stats.totalCharacters.toLocaleString()} 字符，{stats.totalSegments} 个片段
                        </p>
                    </div>
                    <button
                        onClick={onBack}
                        className="py-2 px-4 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-all"
                    >
                        ← 返回
                    </button>
                </div>

                {/* 统计卡片 */}
                <div className="grid grid-cols-3 gap-4 mt-4">
                    <div className="bg-white/10 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold">{stats.totalSegments}</div>
                        <div className="text-xs text-indigo-100">总片段</div>
                    </div>
                    <div className="bg-white/10 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-green-300">{stats.successCount}</div>
                        <div className="text-xs text-indigo-100">成功</div>
                    </div>
                    <div className="bg-white/10 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-red-300">{stats.failCount}</div>
                        <div className="text-xs text-indigo-100">失败</div>
                    </div>
                </div>
            </div>

            {/* 标签页 */}
            <div className="border-b border-gray-200">
                <div className="flex">
                    <button
                        onClick={() => setActiveTab('preview')}
                        className={`flex-1 py-3 px-4 text-sm font-medium transition-all ${
                            activeTab === 'preview'
                                ? 'text-indigo-600 border-b-2 border-indigo-600'
                                : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        📄 预览
                    </button>
                    <button
                        onClick={() => setActiveTab('download')}
                        className={`flex-1 py-3 px-4 text-sm font-medium transition-all ${
                            activeTab === 'download'
                                ? 'text-indigo-600 border-b-2 border-indigo-600'
                                : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        ⬇️ 下载
                    </button>
                </div>
            </div>

            {/* 内容区域 */}
            <div className="p-6">
                {activeTab === 'preview' && (
                    <div className="space-y-4">
                        <p className="text-gray-600 text-sm mb-4">
                            点击下方按钮在新窗口中预览报告：
                        </p>
                        <a
                            href={files.html.preview}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block w-full py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-center font-medium hover:from-indigo-600 hover:to-purple-700 shadow-lg transition-all"
                        >
                            🌐 在浏览器中查看 HTML 报告
                        </a>
                        <div className="bg-gray-50 rounded-lg p-4">
                            <p className="text-sm text-gray-500 mb-2">预览链接：</p>
                            <code className="text-xs text-gray-600 break-all">
                                {files.html.preview}
                            </code>
                        </div>
                    </div>
                )}

                {activeTab === 'download' && (
                    <div className="space-y-3">
                        {/* HTML 下载 */}
                        <a
                            href={files.html.download}
                            download
                            className="flex items-center justify-between p-4 rounded-xl border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 transition-all"
                        >
                            <div className="flex items-center gap-3">
                                <span className="text-2xl">📄</span>
                                <div>
                                    <div className="font-medium text-gray-800">HTML 报告</div>
                                    <div className="text-sm text-gray-500">美观的网页格式，推荐</div>
                                </div>
                            </div>
                            <span className="text-indigo-600">⬇️</span>
                        </a>

                        {/* Markdown 下载 */}
                        <a
                            href={files.markdown.download}
                            download
                            className="flex items-center justify-between p-4 rounded-xl border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 transition-all"
                        >
                            <div className="flex items-center gap-3">
                                <span className="text-2xl">📝</span>
                                <div>
                                    <div className="font-medium text-gray-800">Markdown 报告</div>
                                    <div className="text-sm text-gray-500">纯文本格式，方便编辑</div>
                                </div>
                            </div>
                            <span className="text-indigo-600">⬇️</span>
                        </a>

                        {/* JSON 下载 */}
                        <a
                            href={files.json.download}
                            download
                            className="flex items-center justify-between p-4 rounded-xl border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 transition-all"
                        >
                            <div className="flex items-center gap-3">
                                <span className="text-2xl">📊</span>
                                <div>
                                    <div className="font-medium text-gray-800">JSON 数据</div>
                                    <div className="text-sm text-gray-500">原始数据，程序处理用</div>
                                </div>
                            </div>
                            <span className="text-indigo-600">⬇️</span>
                        </a>
                    </div>
                )}
            </div>
        </div>
    );
}

export default ReportViewer;
