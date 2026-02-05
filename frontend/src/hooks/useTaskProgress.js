import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * 任务进度 WebSocket Hook v4.7.1 - Bug修复版
 * 
 * 🐛 v4.7.1 Bug修复：
 * ✅ 修复重连逻辑不工作的严重bug
 * ✅ 修复useCallback依赖问题
 * ✅ 优化连接管理逻辑
 * ✅ 添加更完善的错误处理
 * 
 * 🆕 v4.7 功能：
 * ✅ WebSocket 心跳机制 (每30秒ping)
 * ✅ 页面可见性检测 (标签页切回时同步状态)
 * ✅ HTTP 轮询备份 (WebSocket失效时自动降级)
 * ✅ 详细的调试日志
 * ✅ 修复切换标签页导致任务显示中断的问题
 */

// ============================================
// 配置常量
// ============================================

const CONFIG = {
    WS_RECONNECT_DELAY: 3000,        // WebSocket 重连延迟 (ms)
    WS_MAX_RETRIES: 5,               // 最大重连次数
    WS_HEARTBEAT_INTERVAL: 30000,    // 心跳间隔 (30秒)
    POLL_INTERVAL: 5000,             // 轮询间隔 (5秒)
    POLL_FALLBACK_DELAY: 10000,      // WebSocket失效后多久启用轮询 (10秒)
    DEBUG: true,                     // 是否启用调试日志
};

/**
 * 调试日志函数
 */
function debugLog(message, type = 'INFO', data = null) {
    if (!CONFIG.DEBUG) return;
    
    const timestamp = new Date().toLocaleTimeString();
    const prefix = `[useTaskProgress ${timestamp}]`;
    
    const styles = {
        INFO: 'color: #2563eb',
        SUCCESS: 'color: #16a34a',
        ERROR: 'color: #dc2626',
        WARN: 'color: #ca8a04',
        WS: 'color: #7c3aed',
        POLL: 'color: #0891b2',
        HEARTBEAT: 'color: #ec4899',
    };
    
    console.log(`%c${prefix} ${message}`, styles[type] || styles.INFO, data || '');
}

/**
 * useTaskProgress Hook
 * 
 * @param {string} taskId - 任务ID
 * @returns {Object} - { progress, connected, logs, subscribe, unsubscribe, clearLogs }
 */
function useTaskProgress(taskId) {
    // ========== 状态管理 ==========
    const [progress, setProgress] = useState(null);
    const [connected, setConnected] = useState(false);
    const [logs, setLogs] = useState([]);
    
    // ========== Refs (避免闭包陷阱) ==========
    const wsRef = useRef(null);
    const reconnectTimeoutRef = useRef(null);
    const heartbeatTimerRef = useRef(null);
    const pollTimerRef = useRef(null);
    const healthCheckTimerRef = useRef(null);
    const retryCountRef = useRef(0);
    const lastMessageTimeRef = useRef(Date.now());
    const lastMessageRef = useRef('');
    const logIdRef = useRef(0);
    const currentTaskIdRef = useRef(taskId);
    const isUsingPollingRef = useRef(false);
    const isMountedRef = useRef(true);
    const isConnectingRef = useRef(false);

    // 更新 taskId ref
    useEffect(() => {
        currentTaskIdRef.current = taskId;
    }, [taskId]);

    // ========== 清除日志 ==========
    const clearLogs = useCallback(() => {
        debugLog('清除日志', 'INFO');
        setLogs([]);
        lastMessageRef.current = '';
        logIdRef.current = 0;
    }, []);

    // ========== HTTP 轮询获取任务状态 ==========
    const pollTaskStatus = useCallback(async () => {
        if (!currentTaskIdRef.current || !isMountedRef.current) return;
        
        try {
            debugLog('🔄 轮询任务状态...', 'POLL', currentTaskIdRef.current.substring(0, 8));
            
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/task/${currentTaskIdRef.current}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success && data.task) {
                debugLog('✅ 轮询获取状态成功', 'POLL', {
                    进度: `${data.task.progress}%`,
                    状态: data.task.status,
                });
                
                // 更新进度状态
                setProgress({
                    progress: data.task.progress,
                    status: data.task.status,
                    currentStep: data.task.currentStep || ''
                });
                
                lastMessageTimeRef.current = Date.now();
                
                // 如果任务已完成，停止轮询
                if (['completed', 'failed', 'cancelled'].includes(data.task.status)) {
                    debugLog('🏁 任务已结束，停止轮询', 'POLL');
                    stopPolling();
                }
            }
        } catch (error) {
            debugLog(`❌ 轮询失败: ${error.message}`, 'ERROR');
        }
    }, []);
    
    // ========== 启动轮询 ==========
    const startPolling = useCallback(() => {
        if (isUsingPollingRef.current || !currentTaskIdRef.current) return;
        
        debugLog('🚀 启动HTTP轮询备份', 'POLL');
        isUsingPollingRef.current = true;
        
        // 立即执行一次
        pollTaskStatus();
        
        // 定时轮询
        pollTimerRef.current = setInterval(pollTaskStatus, CONFIG.POLL_INTERVAL);
    }, [pollTaskStatus]);
    
    // ========== 停止轮询 ==========
    const stopPolling = useCallback(() => {
        if (!isUsingPollingRef.current) return;
        
        debugLog('🛑 停止轮询', 'POLL');
        isUsingPollingRef.current = false;
        
        if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
        }
    }, []);
    
    // ========== 发送 WebSocket 心跳 ==========
    const sendHeartbeat = useCallback(() => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            debugLog('⚠️ WebSocket未连接，跳过心跳', 'WARN');
            return;
        }
        
        try {
            debugLog('💓 发送心跳ping', 'HEARTBEAT');
            wsRef.current.send(JSON.stringify({ type: 'ping' }));
        } catch (error) {
            debugLog(`❌ 心跳发送失败: ${error.message}`, 'ERROR');
        }
    }, []);
    
    // ========== 启动心跳定时器 ==========
    const startHeartbeat = useCallback(() => {
        // 清除旧的心跳定时器
        if (heartbeatTimerRef.current) {
            clearInterval(heartbeatTimerRef.current);
        }
        
        debugLog('💓 启动心跳定时器', 'HEARTBEAT', `每 ${CONFIG.WS_HEARTBEAT_INTERVAL / 1000} 秒`);
        
        // 立即发送一次
        sendHeartbeat();
        
        // 定时发送
        heartbeatTimerRef.current = setInterval(sendHeartbeat, CONFIG.WS_HEARTBEAT_INTERVAL);
    }, [sendHeartbeat]);
    
    // ========== 停止心跳定时器 ==========
    const stopHeartbeat = useCallback(() => {
        if (heartbeatTimerRef.current) {
            debugLog('🛑 停止心跳定时器', 'HEARTBEAT');
            clearInterval(heartbeatTimerRef.current);
            heartbeatTimerRef.current = null;
        }
    }, []);

    // ========== 订阅任务 ==========
    const subscribeToTask = useCallback((tid) => {
        if (wsRef.current?.readyState === WebSocket.OPEN && tid) {
            const msg = JSON.stringify({ type: 'subscribe', taskId: tid });
            wsRef.current.send(msg);
            debugLog('📡 发送订阅请求', 'WS', tid.substring(0, 8));
        } else {
            debugLog('⚠️ 无法订阅', 'WARN', {
                wsState: wsRef.current?.readyState,
                taskId: tid?.substring(0, 8),
            });
        }
    }, []);

    // ========== 取消订阅 ==========
    const unsubscribeTask = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'unsubscribe' }));
            debugLog('📡 取消订阅', 'WS');
        }
    }, []);

    // ========== 🆕 连接 WebSocket - 独立函数（修复重连bug）==========
    const connectWebSocket = useCallback(() => {
        // 防止重复连接
        if (isConnectingRef.current) {
            debugLog('⚠️ 正在连接中，跳过重复连接', 'WARN');
            return;
        }
        
        // 关闭现有连接
        if (wsRef.current) {
            try {
                wsRef.current.close();
            } catch (e) {
                // 忽略错误
            }
            wsRef.current = null;
        }
        
        isConnectingRef.current = true;
        
        // 构建 WebSocket URL
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.hostname;
        const port = window.location.port === '5173' ? '3000' : window.location.port;
        const wsUrl = `${protocol}//${host}:${port}`;
        
        debugLog('🔌 正在连接WebSocket...', 'WS', wsUrl);
        
        try {
            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            // ===== WebSocket 事件处理 =====
            
            ws.onopen = () => {
                debugLog('✅ WebSocket连接成功', 'SUCCESS');
                isConnectingRef.current = false;
                setConnected(true);
                retryCountRef.current = 0;
                lastMessageTimeRef.current = Date.now();
                
                // 启动心跳
                startHeartbeat();
                
                // 停止轮询（如果正在轮询）
                stopPolling();
                
                // 如果已有任务ID，立即订阅
                if (currentTaskIdRef.current) {
                    debugLog('📡 连接后自动订阅', 'WS', currentTaskIdRef.current.substring(0, 8));
                    try {
                        ws.send(JSON.stringify({ type: 'subscribe', taskId: currentTaskIdRef.current }));
                    } catch (error) {
                        debugLog('❌ 订阅失败', 'ERROR', error.message);
                    }
                }
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    lastMessageTimeRef.current = Date.now();
                    
                    // 处理pong响应
                    if (data.type === 'pong') {
                        debugLog('💓 收到心跳pong', 'HEARTBEAT');
                        return;
                    }
                    
                    // 处理连接确认
                    if (data.type === 'connected') {
                        debugLog('🎉 服务器确认连接', 'SUCCESS', {
                            clientId: data.clientId?.substring(0, 8),
                            heartbeatInterval: data.heartbeatInterval,
                        });
                        return;
                    }
                    
                    // 处理进度消息
                    if (data.type === 'progress' || data.type === 'taskProgress') {
                        // 检查是否是当前任务的消息
                        if (data.taskId && currentTaskIdRef.current && data.taskId !== currentTaskIdRef.current) {
                            debugLog('⏭️ 忽略其他任务的消息', 'INFO', data.taskId?.substring(0, 8));
                            return;
                        }
                        
                        // 获取消息内容
                        const stepMessage = data.message || data.currentStep || '';
                        
                        debugLog('📨 收到进度消息', 'WS', {
                            进度: `${data.progress}%`,
                            状态: data.status,
                            消息: stepMessage.substring(0, 30),
                        });
                        
                        // 更新进度状态
                        setProgress({
                            progress: data.progress,
                            status: data.status,
                            currentStep: stepMessage
                        });

                        // 添加日志（去重）
                        if (stepMessage && stepMessage !== lastMessageRef.current) {
                            lastMessageRef.current = stepMessage;
                            logIdRef.current += 1;
                            
                            const newLog = {
                                id: logIdRef.current,
                                message: stepMessage,
                                timestamp: data.timestamp || Date.now(),
                                progress: data.progress
                            };
                            
                            debugLog('📝 新日志', 'INFO', {
                                id: logIdRef.current,
                                message: stepMessage.substring(0, 30),
                            });
                            
                            setLogs(prev => [...prev, newLog]);
                        }
                    }
                    
                } catch (e) {
                    debugLog(`❌ 解析消息失败: ${e.message}`, 'ERROR', event.data);
                }
            };

            ws.onclose = (event) => {
                debugLog(`🔌 WebSocket关闭 (code: ${event.code})`, 'WARN');
                isConnectingRef.current = false;
                setConnected(false);
                stopHeartbeat();
                
                // 如果不是手动关闭且组件未卸载，尝试重连
                if (event.code !== 1000 && isMountedRef.current && retryCountRef.current < CONFIG.WS_MAX_RETRIES) {
                    retryCountRef.current++;
                    debugLog(`🔄 ${CONFIG.WS_RECONNECT_DELAY/1000}秒后重连 (${retryCountRef.current}/${CONFIG.WS_MAX_RETRIES})`, 'WARN');
                    
                    reconnectTimeoutRef.current = setTimeout(() => {
                        if (isMountedRef.current) {
                            debugLog('🔄 尝试重连...', 'INFO');
                            connectWebSocket(); // 🆕 直接调用连接函数
                        }
                    }, CONFIG.WS_RECONNECT_DELAY);
                } else if (retryCountRef.current >= CONFIG.WS_MAX_RETRIES) {
                    debugLog('❌ WebSocket重连失败次数过多，切换到轮询模式', 'ERROR');
                    
                    // 启动轮询作为备份
                    setTimeout(() => {
                        if (isMountedRef.current) {
                            startPolling();
                        }
                    }, CONFIG.POLL_FALLBACK_DELAY);
                }
            };

            ws.onerror = (error) => {
                debugLog(`❌ WebSocket错误`, 'ERROR', error);
                isConnectingRef.current = false;
            };
            
        } catch (error) {
            debugLog(`❌ 创建WebSocket失败: ${error.message}`, 'ERROR');
            isConnectingRef.current = false;
            setConnected(false);
        }
    }, [startHeartbeat, stopHeartbeat, startPolling, stopPolling]);

    // ========== 页面可见性变化处理 ==========
    const handleVisibilityChange = useCallback(() => {
        if (document.hidden) {
            debugLog('👁️ 页面失去焦点（标签页切换）', 'INFO');
            // 页面隐藏时不做特殊处理，让心跳和轮询继续
        } else {
            debugLog('👁️ 页面获得焦点（标签页切回）', 'SUCCESS');
            
            // 检查上次消息时间
            const timeSinceLastMessage = Date.now() - lastMessageTimeRef.current;
            const isStale = timeSinceLastMessage > CONFIG.WS_HEARTBEAT_INTERVAL * 2;
            
            if (isStale) {
                debugLog(`⚠️ 数据可能过期 (${(timeSinceLastMessage/1000).toFixed(0)}秒未更新)`, 'WARN');
                
                // 立即同步状态
                if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                    debugLog('🔄 通过WebSocket同步状态', 'WS');
                    sendHeartbeat();
                } else if (!isUsingPollingRef.current && currentTaskIdRef.current) {
                    debugLog('🔄 通过HTTP轮询同步状态', 'POLL');
                    pollTaskStatus();
                }
            } else {
                debugLog('✅ 数据新鲜，无需同步', 'SUCCESS');
            }
        }
    }, [sendHeartbeat, pollTaskStatus]);

    // ========== 初始化 WebSocket 连接 ==========
    useEffect(() => {
        debugLog('🚀 初始化 useTaskProgress', 'INFO');
        isMountedRef.current = true;
        
        // 连接 WebSocket
        connectWebSocket();
        
        // 监听页面可见性变化
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // ===== 清理函数 =====
        return () => {
            debugLog('🧹 清理连接', 'INFO');
            isMountedRef.current = false;
            
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
            
            stopHeartbeat();
            stopPolling();
            
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.close(1000, 'Component unmounted');
            }
            wsRef.current = null;
        };
    }, [connectWebSocket, handleVisibilityChange, stopHeartbeat, stopPolling]);

    // ========== 当 taskId 变化时，重新订阅 ==========
    useEffect(() => {
        if (taskId && connected) {
            debugLog('🔄 taskId 变化，重新订阅', 'INFO', taskId.substring(0, 8));
            clearLogs();
            subscribeToTask(taskId);
        }
    }, [taskId, connected, subscribeToTask, clearLogs]);

    // ========== 监控 WebSocket 健康状态 ==========
    useEffect(() => {
        if (!taskId) return;
        
        healthCheckTimerRef.current = setInterval(() => {
            const timeSinceLastMessage = Date.now() - lastMessageTimeRef.current;
            const isWebSocketConnected = wsRef.current && wsRef.current.readyState === WebSocket.OPEN;
            
            // 如果超过2个心跳周期没收到消息，且WebSocket已断开，启动轮询
            if (timeSinceLastMessage > CONFIG.WS_HEARTBEAT_INTERVAL * 2 && 
                !isWebSocketConnected && 
                !isUsingPollingRef.current) {
                
                debugLog('⚠️ WebSocket长时间无响应，启动轮询备份', 'WARN');
                startPolling();
            }
            
            // 如果WebSocket恢复，停止轮询
            if (isWebSocketConnected && isUsingPollingRef.current) {
                debugLog('✅ WebSocket已恢复，停止轮询', 'SUCCESS');
                stopPolling();
            }
        }, CONFIG.WS_HEARTBEAT_INTERVAL);
        
        return () => {
            if (healthCheckTimerRef.current) {
                clearInterval(healthCheckTimerRef.current);
                healthCheckTimerRef.current = null;
            }
        };
    }, [taskId, startPolling, stopPolling]);

    // ========== 返回值 ==========
    return {
        progress,           // 任务进度对象
        connected,          // WebSocket连接状态
        logs,               // 日志数组
        subscribe: subscribeToTask,     // 订阅任务函数
        unsubscribe: unsubscribeTask,   // 取消订阅函数
        clearLogs,          // 清除日志函数
    };
}

export default useTaskProgress;