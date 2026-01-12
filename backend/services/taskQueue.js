/**
 * 任务队列管理器 - 内存版
 * 
 * 功能：
 * - 任务创建、查询、更新
 * - 队列管理（FIFO）
 * - 进度回调
 * 
 * 【v2.1 更新】支持自定义标题
 * 
 * 后续可升级为 Redis + Bull 实现持久化
 */

const { v4: uuidv4 } = require('uuid');

class TaskQueue {
    constructor() {
        // 任务存储 Map<taskId, TaskObject>
        this.tasks = new Map();
        
        // 待处理队列
        this.queue = [];
        
        // 当前正在处理的任务数
        this.activeCount = 0;
        
        // 最大并发数（Puppeteer 控制浏览器，建议串行）
        this.maxConcurrent = 1;
        
        // 进度回调函数
        this.progressCallback = null;
        
        // 任务处理函数（由 aiProcessor 注入）
        this.processor = null;
    }

    /**
     * 设置进度回调（供 WebSocket 推送）
     */
    setProgressCallback(callback) {
        this.progressCallback = callback;
    }

    /**
     * 设置任务处理器
     */
    setProcessor(processor) {
        this.processor = processor;
    }

    /**
     * 创建新任务
     * 【v2.1 更新】支持 customTitle 参数
     */
    createTask(fileInfo) {
        const taskId = uuidv4();
        const now = new Date().toISOString();

        const task = {
            id: taskId,
            status: 'pending',      // pending | processing | completed | failed | cancelled
            progress: 0,            // 0-100
            currentStep: '等待处理',
            totalSegments: 0,
            processedSegments: 0,
            
            // 文件信息
            file: {
                originalName: fileInfo.originalName,
                savedPath: fileInfo.savedPath,
                size: fileInfo.size,
                mimeType: fileInfo.mimeType
            },
            
            // 【新增】自定义标题
            customTitle: fileInfo.customTitle || null,
            
            // 结果
            result: null,           // 处理完成后的报告路径
            error: null,            // 错误信息
            
            // 时间戳
            createdAt: now,
            startedAt: null,
            completedAt: null
        };

        this.tasks.set(taskId, task);
        this.queue.push(taskId);
        
        console.log(`📝 任务已创建: ${taskId}`);
        if (task.customTitle) {
            console.log(`   标题: ${task.customTitle}`);
        }
        
        // 尝试处理队列
        this._processQueue();

        return task;
    }

    /**
     * 获取任务
     */
    getTask(taskId) {
        return this.tasks.get(taskId) || null;
    }

    /**
     * 获取所有任务（分页）
     */
    getAllTasks(page = 1, limit = 10) {
        const allTasks = Array.from(this.tasks.values())
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        const start = (page - 1) * limit;
        const end = start + limit;
        
        return {
            tasks: allTasks.slice(start, end),
            total: allTasks.length,
            page,
            limit,
            totalPages: Math.ceil(allTasks.length / limit)
        };
    }

    /**
     * 更新任务状态
     */
    updateTask(taskId, updates) {
        const task = this.tasks.get(taskId);
        if (!task) return null;

        Object.assign(task, updates);
        
        // 触发进度回调
        if (this.progressCallback) {
            this.progressCallback(taskId, task);
        }

        return task;
    }

    /**
     * 取消任务
     */
    cancelTask(taskId) {
        const task = this.tasks.get(taskId);
        if (!task) return false;

        if (task.status === 'pending') {
            // 从队列移除
            const index = this.queue.indexOf(taskId);
            if (index > -1) {
                this.queue.splice(index, 1);
            }
            this.updateTask(taskId, {
                status: 'cancelled',
                completedAt: new Date().toISOString()
            });
            return true;
        }

        if (task.status === 'processing') {
            // 标记为取消（处理器需要检查此状态）
            this.updateTask(taskId, {
                status: 'cancelled',
                completedAt: new Date().toISOString()
            });
            return true;
        }

        return false;
    }

    /**
     * 删除任务
     */
    deleteTask(taskId) {
        const task = this.tasks.get(taskId);
        if (!task) return false;

        // 只能删除已完成/失败/取消的任务
        if (['completed', 'failed', 'cancelled'].includes(task.status)) {
            this.tasks.delete(taskId);
            return true;
        }

        return false;
    }

    /**
     * 获取队列信息
     */
    getQueueSize() {
        return this.queue.length;
    }

    getActiveTasks() {
        return this.activeCount;
    }

    /**
     * 处理队列
     */
    async _processQueue() {
        // 检查是否可以处理新任务
        if (this.activeCount >= this.maxConcurrent) {
            return;
        }

        if (this.queue.length === 0) {
            return;
        }

        if (!this.processor) {
            console.error('❌ 未设置任务处理器');
            return;
        }

        // 取出下一个任务
        const taskId = this.queue.shift();
        const task = this.tasks.get(taskId);

        if (!task || task.status !== 'pending') {
            // 任务已取消或不存在，继续处理下一个
            this._processQueue();
            return;
        }

        // 开始处理
        this.activeCount++;
        this.updateTask(taskId, {
            status: 'processing',
            startedAt: new Date().toISOString(),
            currentStep: '开始处理...'
        });

        try {
            // 调用处理器
            const result = await this.processor(task, (progress) => {
                // 进度更新回调
                this.updateTask(taskId, progress);
            });

            // 处理完成
            this.updateTask(taskId, {
                status: 'completed',
                progress: 100,
                currentStep: '处理完成',
                result: result,
                completedAt: new Date().toISOString()
            });

            console.log(`✅ 任务完成: ${taskId}`);

        } catch (error) {
            // 处理失败
            this.updateTask(taskId, {
                status: 'failed',
                currentStep: '处理失败',
                error: error.message,
                completedAt: new Date().toISOString()
            });

            console.error(`❌ 任务失败: ${taskId}`, error.message);
        } finally {
            this.activeCount--;
            // 继续处理队列中的下一个任务
            this._processQueue();
        }
    }
}

// 单例导出
module.exports = new TaskQueue();