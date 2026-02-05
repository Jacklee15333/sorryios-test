/**
 * 任务队列管理器 v2.3 - 数据库持久化版 + 用户隔离
 * 
 * 【v2.3 修复内容】
 * - 添加：getTasksByUserId() 按用户查询任务
 * - 改进：详细的调试日志
 * - 修复：确保用户数据隔离
 * 
 * 功能：
 * - 任务创建、查询、更新
 * - 队列管理（FIFO）
 * - 进度回调
 * - 数据库持久化
 * - ⭐ 用户数据隔离
 */

const { v4: uuidv4 } = require('uuid');
const { TaskDB } = require('./database');

class TaskQueue {
    constructor() {
        // 任务存储 Map<taskId, TaskObject>（内存缓存）
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

        // v2.2: 启动时恢复未完成的任务
        this._recoverPendingTasks();
    }

    /**
     * v2.2: 恢复未完成的任务
     */
    _recoverPendingTasks() {
        try {
            // 查找数据库中 pending 和 processing 状态的任务
            const { db } = require('./database');
            const pendingTasks = db.prepare(`
                SELECT * FROM tasks WHERE status IN ('pending', 'processing') ORDER BY created_at ASC
            `).all();

            if (pendingTasks.length > 0) {
                console.log(`[TaskQueue] 📋 发现 ${pendingTasks.length} 个未完成任务`);
                // 暂时不自动恢复，只是加载到内存
                // 可以在管理后台手动重试
            }
        } catch (e) {
            console.log('[TaskQueue] 恢复任务失败:', e.message);
        }
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
     * v2.2: 支持 userId 参数，写入数据库
     */
    createTask(fileInfo) {
        const taskId = uuidv4();
        const now = new Date().toISOString();

        console.log('\n' + '='.repeat(60));
        console.log('[TaskQueue] 📝 创建新任务');
        console.log('='.repeat(60));
        console.log(`[TaskQueue] 任务ID: ${taskId}`);
        console.log(`[TaskQueue] 文件名: ${fileInfo.originalName}`);
        console.log(`[TaskQueue] 标题: ${fileInfo.customTitle || '默认标题'}`);
        console.log(`[TaskQueue] 用户ID: ${fileInfo.userId || 'null (⚠️ 警告: 未关联用户!)'}`);
        console.log(`[TaskQueue] 文件大小: ${(fileInfo.size / 1024).toFixed(2)} KB`);

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
            
            // v2.1: 自定义标题
            customTitle: fileInfo.customTitle || null,
            
            // ⭐ v2.2: 用户ID（关键字段）
            userId: fileInfo.userId || null,
            
            // 结果
            result: null,           // 处理完成后的报告路径
            error: null,            // 错误信息
            
            // 时间戳
            createdAt: now,
            startedAt: null,
            completedAt: null
        };

        // v2.2: 写入数据库
        try {
            console.log('[TaskQueue] 💾 写入数据库...');
            TaskDB.create({
                id: taskId,
                user_id: fileInfo.userId || null,  // ⭐ 关键：用户ID
                title: fileInfo.customTitle || fileInfo.originalName,
                status: 'pending',
                file_name: fileInfo.originalName,
                file_size: fileInfo.size,
                file_type: 'txt'
            });
            console.log(`[TaskQueue] ✅ 数据库写入成功`);
            console.log(`[TaskQueue]    - 任务ID: ${taskId}`);
            console.log(`[TaskQueue]    - 用户ID: ${fileInfo.userId || 'null'}`);
        } catch (e) {
            console.error('[TaskQueue] ❌ 数据库写入失败:', e.message);
        }

        // 存入内存
        this.tasks.set(taskId, task);
        this.queue.push(taskId);
        
        console.log('[TaskQueue] ✅ 任务已创建并加入队列');
        console.log(`[TaskQueue] 当前队列长度: ${this.queue.length}`);
        console.log('='.repeat(60) + '\n');
        
        // 尝试处理队列
        this._processQueue();

        return task;
    }

    /**
     * 获取任务
     */
    getTask(taskId) {
        // 先从内存获取
        let task = this.tasks.get(taskId);
        
        // 如果内存没有，尝试从数据库获取
        if (!task) {
            try {
                const dbTask = TaskDB.getById(taskId);
                if (dbTask) {
                    task = this._dbTaskToMemoryTask(dbTask);
                    this.tasks.set(taskId, task);
                    console.log(`[TaskQueue] 📂 从数据库加载任务: ${taskId.substring(0, 8)}...`);
                }
            } catch (e) {
                console.log('[TaskQueue] 从数据库获取任务失败:', e.message);
            }
        }
        
        return task || null;
    }

    /**
     * v2.2: 数据库任务转内存格式
     */
    _dbTaskToMemoryTask(dbTask) {
        return {
            id: dbTask.id,
            status: dbTask.status,
            progress: dbTask.progress || 0,
            currentStep: dbTask.status === 'completed' ? '处理完成' : '等待处理',
            totalSegments: dbTask.segments_total || 0,
            processedSegments: dbTask.segments_processed || 0,
            file: {
                originalName: dbTask.file_name,
                savedPath: null,
                size: dbTask.file_size,
                mimeType: 'text/plain'
            },
            customTitle: dbTask.title,
            userId: dbTask.user_id,  // ⭐ 保留用户ID
            result: dbTask.output_html ? {
                html: dbTask.output_html,
                md: dbTask.output_md,
                json: dbTask.output_json
            } : null,
            error: dbTask.error_message,
            createdAt: dbTask.created_at,
            startedAt: dbTask.started_at,
            completedAt: dbTask.completed_at
        };
    }

    /**
     * ⭐ v2.3 新增：获取指定用户的任务（分页）
     * 这是用户数据隔离的核心方法
     */
    getTasksByUserId(userId, page = 1, limit = 10) {
        console.log('\n' + '='.repeat(60));
        console.log('[TaskQueue] 🔍 查询用户任务');
        console.log('='.repeat(60));
        console.log(`[TaskQueue] 用户ID: ${userId}`);
        console.log(`[TaskQueue] 分页: 第 ${page} 页, 每页 ${limit} 条`);
        
        // 步骤1: 从内存获取用户任务
        let userTasks = Array.from(this.tasks.values())
            .filter(task => task.userId === userId)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        console.log(`[TaskQueue] 📊 内存中的用户任务: ${userTasks.length} 条`);
        
        // 步骤2: 如果内存中的任务不够，从数据库补充
        if (userTasks.length === 0) {
            console.log(`[TaskQueue] 📂 从数据库查询用户任务...`);
            try {
                const dbTasks = TaskDB.getByUserId(userId, 100);
                console.log(`[TaskQueue] 📊 数据库中的用户任务: ${dbTasks.length} 条`);
                
                userTasks = dbTasks.map(dbTask => this._dbTaskToMemoryTask(dbTask));
                
                // 缓存到内存
                userTasks.forEach(task => {
                    if (!this.tasks.has(task.id)) {
                        this.tasks.set(task.id, task);
                    }
                });
                
                console.log(`[TaskQueue] ✅ 已缓存到内存`);
            } catch (e) {
                console.log('[TaskQueue] ❌ 从数据库获取用户任务失败:', e.message);
            }
        }
        
        // 步骤3: 分页
        const start = (page - 1) * limit;
        const end = start + limit;
        const paginatedTasks = userTasks.slice(start, end);
        
        console.log(`[TaskQueue] 📄 分页结果:`);
        console.log(`[TaskQueue]    - 总任务数: ${userTasks.length}`);
        console.log(`[TaskQueue]    - 当前页任务数: ${paginatedTasks.length}`);
        console.log(`[TaskQueue]    - 总页数: ${Math.ceil(userTasks.length / limit)}`);
        
        if (paginatedTasks.length > 0) {
            console.log(`[TaskQueue] 📝 任务列表:`);
            paginatedTasks.forEach((task, index) => {
                console.log(`[TaskQueue]    ${index + 1}. ${task.id.substring(0, 8)}... - ${task.customTitle || task.file.originalName} (${task.status})`);
            });
        }
        
        console.log('='.repeat(60) + '\n');
        
        return {
            tasks: paginatedTasks,
            total: userTasks.length,
            page,
            limit,
            totalPages: Math.ceil(userTasks.length / limit)
        };
    }

    /**
     * 获取所有任务（分页）
     * ⚠️ 此方法应该只给管理员使用
     */
    getAllTasks(page = 1, limit = 10) {
        console.log('[TaskQueue] ⚠️ 警告: getAllTasks() 被调用 - 此方法返回所有任务，应该只给管理员使用');
        
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
     * v2.2: 同步更新数据库
     */
    updateTask(taskId, updates) {
        const task = this.tasks.get(taskId);
        if (!task) return null;

        console.log(`[TaskQueue] 🔄 更新任务: ${taskId.substring(0, 8)}...`);
        if (updates.progress !== undefined) {
            console.log(`[TaskQueue]    - 进度: ${task.progress}% → ${updates.progress}%`);
        }
        if (updates.status) {
            console.log(`[TaskQueue]    - 状态: ${task.status} → ${updates.status}`);
        }
        if (updates.currentStep) {
            console.log(`[TaskQueue]    - 步骤: ${updates.currentStep}`);
        }

        Object.assign(task, updates);
        
        // v2.2: 同步更新数据库
        try {
            if (updates.status) {
                TaskDB.updateStatus(taskId, updates.status, updates.progress);
            } else if (updates.progress !== undefined) {
                TaskDB.updateProgress(taskId, updates.progress, updates.processedSegments);
            }
            
            // 如果是开始处理
            if (updates.status === 'processing' && updates.totalSegments) {
                TaskDB.markStarted(taskId, updates.totalSegments);
            }
            
            // 如果是完成
            if (updates.status === 'completed' && updates.result) {
                TaskDB.markCompleted(taskId, {
                    html: updates.result.html || updates.result.htmlPath || '',
                    md: updates.result.md || updates.result.mdPath || '',
                    json: updates.result.json || updates.result.jsonPath || ''
                });
            }
            
            // 如果是失败
            if (updates.status === 'failed' && updates.error) {
                TaskDB.markFailed(taskId, updates.error);
            }
        } catch (e) {
            console.log('[TaskQueue] ❌ 更新数据库失败:', e.message);
        }
        
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

        console.log(`[TaskQueue] 🛑 取消任务: ${taskId.substring(0, 8)}...`);

        if (task.status === 'pending') {
            // 从队列移除
            const index = this.queue.indexOf(taskId);
            if (index > -1) {
                this.queue.splice(index, 1);
                console.log(`[TaskQueue]    - 已从队列移除`);
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
            console.log(`[TaskQueue]    - 已标记为取消`);
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

        console.log(`[TaskQueue] 🗑️  删除任务: ${taskId.substring(0, 8)}...`);

        // 只能删除已完成/失败/取消的任务
        if (['completed', 'failed', 'cancelled'].includes(task.status)) {
            this.tasks.delete(taskId);
            
            // v2.2: 同步删除数据库
            try {
                TaskDB.delete(taskId);
                console.log(`[TaskQueue]    - 已从数据库删除`);
            } catch (e) {
                console.log('[TaskQueue] ❌ 删除数据库记录失败:', e.message);
            }
            
            console.log(`[TaskQueue] ✅ 任务已删除`);
            return true;
        }

        console.log(`[TaskQueue] ❌ 删除失败: 任务状态为 ${task.status}`);
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
            console.error('[TaskQueue] ❌ 未设置任务处理器');
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
        console.log('\n' + '='.repeat(60));
        console.log(`[TaskQueue] 🚀 开始处理任务: ${taskId.substring(0, 8)}...`);
        console.log(`[TaskQueue]    - 标题: ${task.customTitle || task.file.originalName}`);
        console.log(`[TaskQueue]    - 用户: ${task.userId || '未知'}`);
        console.log('='.repeat(60));
        
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

            console.log(`[TaskQueue] ✅ 任务完成: ${taskId.substring(0, 8)}...`);

        } catch (error) {
            // 处理失败
            this.updateTask(taskId, {
                status: 'failed',
                currentStep: '处理失败',
                error: error.message,
                completedAt: new Date().toISOString()
            });

            console.error(`[TaskQueue] ❌ 任务失败: ${taskId.substring(0, 8)}...`);
            console.error(`[TaskQueue] 错误:`, error.message);
        } finally {
            this.activeCount--;
            // 继续处理队列中的下一个任务
            this._processQueue();
        }
    }
}

// 单例导出
module.exports = new TaskQueue();
