import { useState, useRef, useCallback } from 'react';

/**
 * ExamUploader - 试卷图片上传组件 v1.0
 * 
 * 功能：
 * - 拖拽上传区域（支持 jpg/png/pdf）
 * - 图片预览缩略图（多张）
 * - 删除已选图片
 * - 试卷标题输入（可选）
 * - 「开始分析」按钮
 * - 上传后自动跳转到识别进度页
 */
export default function ExamUploader({ onUploadSuccess }) {
    const [files, setFiles] = useState([]);
    const [title, setTitle] = useState('');
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef(null);

    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    const MAX_FILES = 10;
    const MAX_SIZE = 20 * 1024 * 1024; // 20MB

    // 处理文件选择
    const handleFiles = useCallback((newFiles) => {
        setError('');
        const fileArray = Array.from(newFiles);
        
        // 验证
        const validFiles = [];
        for (const file of fileArray) {
            if (!ALLOWED_TYPES.includes(file.type)) {
                setError(`不支持的文件类型: ${file.name}。支持 jpg/png/pdf`);
                continue;
            }
            if (file.size > MAX_SIZE) {
                setError(`文件太大: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)，最大20MB`);
                continue;
            }
            validFiles.push(file);
        }

        setFiles(prev => {
            const combined = [...prev, ...validFiles];
            if (combined.length > MAX_FILES) {
                setError(`最多上传 ${MAX_FILES} 张图片`);
                return combined.slice(0, MAX_FILES);
            }
            return combined;
        });
    }, []);

    // 拖拽处理
    const handleDragOver = (e) => { e.preventDefault(); setDragOver(true); };
    const handleDragLeave = () => setDragOver(false);
    const handleDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files.length > 0) {
            handleFiles(e.dataTransfer.files);
        }
    };

    // 点击选择
    const handleClick = () => fileInputRef.current?.click();
    const handleInputChange = (e) => {
        if (e.target.files.length > 0) {
            handleFiles(e.target.files);
        }
        e.target.value = ''; // 允许重复选择同一文件
    };

    // 删除图片
    const removeFile = (index) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    // 上传并触发识别
    const handleSubmit = async () => {
        if (files.length === 0) {
            setError('请先选择试卷图片');
            return;
        }

        setUploading(true);
        setError('');

        try {
            const token = localStorage.getItem('token');

            // 步骤1: 上传图片
            console.log('[ExamUploader] 📤 开始上传', files.length, '张图片');
            const formData = new FormData();
            files.forEach(file => formData.append('images', file));
            if (title.trim()) formData.append('title', title.trim());

            const uploadRes = await fetch('/api/exam/upload', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            if (!uploadRes.ok) {
                const errData = await uploadRes.json().catch(() => ({}));
                throw new Error(errData.message || errData.error || `上传失败 (${uploadRes.status})`);
            }

            const uploadData = await uploadRes.json();
            console.log('[ExamUploader] ✅ 上传成功:', uploadData);

            const examId = uploadData.exam.id;

            // 步骤2: 触发AI识别
            console.log('[ExamUploader] 🚀 触发AI识别, examId:', examId);
            const processRes = await fetch(`/api/exam/${examId}/process`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!processRes.ok) {
                const errData = await processRes.json().catch(() => ({}));
                throw new Error(errData.message || errData.error || `触发识别失败 (${processRes.status})`);
            }

            const processData = await processRes.json();
            console.log('[ExamUploader] ✅ 识别已启动:', processData);

            // 通知父组件
            if (onUploadSuccess) {
                onUploadSuccess({
                    examId: examId,
                    taskId: `exam_${examId}`,
                    title: title.trim() || `试卷 #${examId}`,
                    imageCount: files.length
                });
            }

            // 清空表单
            setFiles([]);
            setTitle('');

        } catch (err) {
            console.error('[ExamUploader] ❌ 错误:', err);
            setError(err.message);
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="bg-white rounded-2xl shadow-xl p-8">
            {/* 标题 */}
            <div className="flex items-center space-x-3 mb-6">
                <div className="w-12 h-12 bg-gradient-to-br from-red-400 to-orange-500 rounded-xl flex items-center justify-center shadow-lg">
                    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">上传试卷</h2>
                    <p className="text-sm text-gray-500">拍照或选择已批改的英语试卷，AI 自动识别错题</p>
                </div>
            </div>

            {/* 试卷标题 */}
            <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">试卷标题（可选）</label>
                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="例如：Unit 5 单元测试"
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                    disabled={uploading}
                />
            </div>

            {/* 拖拽上传区 */}
            <div
                onClick={handleClick}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 ${
                    dragOver
                        ? 'border-orange-500 bg-orange-50'
                        : 'border-gray-300 hover:border-orange-400 hover:bg-orange-50/50'
                } ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".jpg,.jpeg,.png,.pdf"
                    multiple
                    onChange={handleInputChange}
                    className="hidden"
                />
                <div className="flex flex-col items-center">
                    <svg className="w-16 h-16 text-orange-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-lg font-medium text-gray-700 mb-1">
                        拖拽图片到此处，或点击选择
                    </p>
                    <p className="text-sm text-gray-500">
                        支持 JPG、PNG、PDF，最多 {MAX_FILES} 张，单个不超过 20MB
                    </p>
                </div>
            </div>

            {/* 图片预览 */}
            {files.length > 0 && (
                <div className="mt-6">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium text-gray-700">
                            已选择 {files.length} 张图片
                        </span>
                        <button
                            onClick={() => setFiles([])}
                            className="text-sm text-red-500 hover:text-red-600"
                            disabled={uploading}
                        >
                            清空全部
                        </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                        {files.map((file, index) => (
                            <div key={index} className="relative group">
                                <div className="w-full h-32 bg-gray-100 rounded-xl overflow-hidden border border-gray-200">
                                    {file.type === 'application/pdf' ? (
                                        <div className="w-full h-full flex flex-col items-center justify-center text-gray-500">
                                            <svg className="w-10 h-10 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                            </svg>
                                            <span className="text-xs">PDF</span>
                                        </div>
                                    ) : (
                                        <img
                                            src={URL.createObjectURL(file)}
                                            alt={file.name}
                                            className="w-full h-full object-cover"
                                        />
                                    )}
                                </div>
                                {/* 删除按钮 */}
                                <button
                                    onClick={(e) => { e.stopPropagation(); removeFile(index); }}
                                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                                    disabled={uploading}
                                >
                                    ×
                                </button>
                                {/* 文件名 */}
                                <p className="mt-1 text-xs text-gray-500 truncate">{file.name}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* 错误提示 */}
            {error && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                    ❌ {error}
                </div>
            )}

            {/* 提交按钮 */}
            <div className="mt-6">
                <button
                    onClick={handleSubmit}
                    disabled={files.length === 0 || uploading}
                    className={`w-full py-4 rounded-xl font-semibold text-lg transition-all duration-200 ${
                        files.length === 0 || uploading
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            : 'bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-orange-600 hover:to-red-600 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5'
                    }`}
                >
                    {uploading ? (
                        <span className="flex items-center justify-center space-x-2">
                            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            <span>正在上传并启动识别...</span>
                        </span>
                    ) : (
                        `🔍 开始分析 (${files.length} 张图片)`
                    )}
                </button>
            </div>
        </div>
    );
}
