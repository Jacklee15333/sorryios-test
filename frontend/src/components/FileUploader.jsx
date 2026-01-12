import { useState, useCallback, useEffect } from 'react';

/**
 * 生成默认标题：X月X日课堂笔记
 */
function generateDefaultTitle() {
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    return `${month}月${day}日课堂笔记`;
}

/**
 * 文件上传组件 - 支持拖拽 + 自定义标题
 */
function FileUploader({ onUploadStart, onUploadSuccess, onUploadError, disabled }) {
    const [isDragging, setIsDragging] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    
    // 【新增】自定义标题
    const [customTitle, setCustomTitle] = useState(generateDefaultTitle());

    // 【新增】每次选择新文件时，重置标题为默认值
    useEffect(() => {
        if (selectedFile) {
            setCustomTitle(generateDefaultTitle());
        }
    }, [selectedFile]);

    // 处理拖拽进入
    const handleDragEnter = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled) setIsDragging(true);
    }, [disabled]);

    // 处理拖拽离开
    const handleDragLeave = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    }, []);

    // 处理拖拽悬停
    const handleDragOver = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    // 处理文件放下
    const handleDrop = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        if (disabled) return;

        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            handleFileSelect(files[0]);
        }
    }, [disabled]);

    // 处理文件选择
    const handleFileSelect = (file) => {
        // 检查文件类型
        if (!file.name.endsWith('.txt')) {
            alert('目前只支持 .txt 文件');
            return;
        }

        // 检查文件大小（10MB）
        if (file.size > 10 * 1024 * 1024) {
            alert('文件大小不能超过 10MB');
            return;
        }

        setSelectedFile(file);
    };

    // 处理文件输入变化
    const handleInputChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            handleFileSelect(file);
        }
    };

    // 上传文件
    const handleUpload = async () => {
        if (!selectedFile) return;

        setUploading(true);
        onUploadStart?.();

        try {
            const formData = new FormData();
            formData.append('file', selectedFile);
            
            // 【新增】添加自定义标题
            const titleToUse = customTitle.trim() || generateDefaultTitle();
            formData.append('customTitle', titleToUse);

            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (response.ok && data.success) {
                onUploadSuccess?.(data);
                setSelectedFile(null);
                setCustomTitle(generateDefaultTitle()); // 重置标题
            } else {
                throw new Error(data.message || '上传失败');
            }
        } catch (error) {
            console.error('上传错误:', error);
            onUploadError?.(error.message);
        } finally {
            setUploading(false);
        }
    };

    // 取消选择
    const handleCancel = () => {
        setSelectedFile(null);
        setCustomTitle(generateDefaultTitle());
    };

    return (
        <div className="w-full">
            {/* 拖拽上传区域 */}
            <div
                className={`
                    upload-zone relative border-2 border-dashed rounded-2xl p-8
                    transition-all duration-300 cursor-pointer
                    ${isDragging ? 'dragging border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-indigo-400 hover:bg-gray-50'}
                    ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
                `}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => !disabled && document.getElementById('file-input').click()}
            >
                <input
                    id="file-input"
                    type="file"
                    accept=".txt"
                    onChange={handleInputChange}
                    className="hidden"
                    disabled={disabled}
                />

                <div className="text-center">
                    {/* 图标 */}
                    <div className="mb-4">
                        <span className="text-6xl">
                            {isDragging ? '📥' : selectedFile ? '📄' : '📁'}
                        </span>
                    </div>

                    {/* 文字提示 */}
                    {selectedFile ? (
                        <div className="fade-in">
                            <p className="text-lg font-medium text-gray-800">
                                {selectedFile.name}
                            </p>
                            <p className="text-sm text-gray-500 mt-1">
                                {(selectedFile.size / 1024).toFixed(1)} KB
                            </p>
                        </div>
                    ) : (
                        <div>
                            <p className="text-lg font-medium text-gray-700">
                                {isDragging ? '松开鼠标上传文件' : '拖拽文件到这里，或点击选择'}
                            </p>
                            <p className="text-sm text-gray-500 mt-2">
                                支持 .txt 文件，最大 10MB
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* 【新增】标题输入框 - 选择文件后显示 */}
            {selectedFile && (
                <div className="mt-4 fade-in">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        📝 报告标题
                    </label>
                    <input
                        type="text"
                        value={customTitle}
                        onChange={(e) => setCustomTitle(e.target.value)}
                        placeholder="输入报告标题..."
                        disabled={uploading || disabled}
                        className={`
                            w-full px-4 py-3 rounded-xl border-2 
                            transition-all duration-200
                            focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                            ${uploading || disabled 
                                ? 'bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed' 
                                : 'bg-white border-gray-200 hover:border-indigo-300'
                            }
                        `}
                        onClick={(e) => e.stopPropagation()}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                        默认格式：X月X日课堂笔记，可自行修改
                    </p>
                </div>
            )}

            {/* 操作按钮 */}
            {selectedFile && (
                <div className="flex gap-3 mt-4 fade-in">
                    <button
                        onClick={handleUpload}
                        disabled={uploading || disabled}
                        className={`
                            flex-1 py-3 px-6 rounded-xl font-medium text-white
                            transition-all duration-200
                            ${uploading || disabled
                                ? 'bg-gray-400 cursor-not-allowed'
                                : 'bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 shadow-lg hover:shadow-xl'
                            }
                        `}
                    >
                        {uploading ? (
                            <span className="flex items-center justify-center gap-2">
                                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                上传中...
                            </span>
                        ) : (
                            '🚀 开始处理'
                        )}
                    </button>
                    <button
                        onClick={handleCancel}
                        disabled={uploading}
                        className="py-3 px-6 rounded-xl font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all duration-200"
                    >
                        取消
                    </button>
                </div>
            )}
        </div>
    );
}

export default FileUploader;