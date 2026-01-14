import { useEffect, useState, useCallback } from 'react';

/**
 * WebSocket Hook - 用于订阅任务进度
 * 
 * 版本: v4.0.2 (稳定版)
 * 修复: React StrictMode 导致的重复连接问题
 * 方案: 使用模块级单例，避免组件重渲染时重复创建连接
 */

// ============================================
// 模块级单例（所有组件共享一个 WebSocket 连接）
// ============================================
let wsInstance = null;
let wsConnected = false;
let reconnectAttempts = 0;
let reconnectTimer = null;
let heartbeatTimer = null;
let subscribers = new Set(); // 订阅者（组件）
let currentTaskId = null;

// 进度回调
let progressCallbacks = new Set();
let connectionCallbacks = new Set();

// 连接 WebSocket
function connectWebSocket() {
    // 已经连接或正在连接中，跳过
    if (wsInstance && (wsInstance.readyState === WebSocket.CONNECTING || wsInstance.readyState === WebSocket.OPEN)) {
        return;
    }

    const wsUrl = 'ws://localhost:3000';
    console.log('[WebSocket] 正在连接:', wsUrl);

    try {
        wsInstance = new WebSocket(wsUrl);
    } catch (e) {
        console.error('[WebSocket] 创建失败:', e);
        return;
    }

    wsInstance.onopen = () => {
        console.log('[WebSocket] ✅ 连接成功');
        wsConnected = true;
        reconnectAttempts = 0;
        
        // 通知所有订阅者
        connectionCallbacks.forEach(cb => cb(true));
        
        // 启动心跳
        startHeartbeat();

        // 如果有任务ID，发送订阅
        if (currentTaskId) {
            sendSubscribe(currentTaskId);
        }
    };

    wsInstance.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            switch (data.type) {
                case 'connected':
                    console.log('[WebSocket] 服务器确认连接, clientId:', data.clientId);
                    break;
                
                case 'progress':
                    console.log('[WebSocket] 📥 进度更新:', data);
                    // 通知所有订阅者
                    progressCallbacks.forEach(cb => cb({
                        taskId: data.taskId,
                        progress: data.progress,
                        status: data.status,
                        message: data.message,
                        currentStep: data.message,
                        timestamp: data.timestamp
                    }));
                    break;
                
                case 'pong':
                    // 心跳响应，忽略
                    break;
            }
        } catch (e) {
            // 忽略解析错误
        }
    };

    wsInstance.onclose = (event) => {
        console.log('[WebSocket] 连接关闭, code:', event.code);
        wsConnected = false;
        connectionCallbacks.forEach(cb => cb(false));
        stopHeartbeat();

        // 如果还有订阅者，尝试重连
        if (subscribers.size > 0 && reconnectAttempts < 5) {
            reconnectAttempts++;
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);
            console.log(`[WebSocket] 🔄 ${delay/1000}秒后重连 (${reconnectAttempts}/5)`);
            
            reconnectTimer = setTimeout(() => {
                connectWebSocket();
            }, delay);
        }
    };

    wsInstance.onerror = (error) => {
        console.error('[WebSocket] 错误');
    };
}

// 断开 WebSocket
function disconnectWebSocket() {
    stopHeartbeat();
    
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    
    if (wsInstance) {
        wsInstance.close(1000, 'Client disconnect');
        wsInstance = null;
    }
    
    wsConnected = false;
    reconnectAttempts = 0;
}

// 启动心跳
function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
        if (wsInstance && wsInstance.readyState === WebSocket.OPEN) {
            wsInstance.send(JSON.stringify({ type: 'ping' }));
        }
    }, 30000);
}

// 停止心跳
function stopHeartbeat() {
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }
}

// 发送订阅消息
function sendSubscribe(taskId) {
    if (wsInstance && wsInstance.readyState === WebSocket.OPEN && taskId) {
        wsInstance.send(JSON.stringify({ type: 'subscribe', taskId }));
        console.log('[WebSocket] 📌 订阅任务:', taskId);
    }
}

// 发送取消订阅消息
function sendUnsubscribe(taskId) {
    if (wsInstance && wsInstance.readyState === WebSocket.OPEN && taskId) {
        wsInstance.send(JSON.stringify({ type: 'unsubscribe', taskId }));
    }
}

// ============================================
// React Hook
// ============================================
export function useTaskProgress(taskId) {
    const [progress, setProgress] = useState(null);
    const [connected, setConnected] = useState(wsConnected);

    useEffect(() => {
        // 注册订阅者
        const subscriberId = Date.now();
        subscribers.add(subscriberId);

        // 注册回调
        const progressCb = (data) => setProgress(data);
        const connectionCb = (status) => setConnected(status);
        
        progressCallbacks.add(progressCb);
        connectionCallbacks.add(connectionCb);

        // 首次挂载时连接
        if (subscribers.size === 1) {
            connectWebSocket();
        } else {
            // 已经连接，直接更新状态
            setConnected(wsConnected);
        }

        // 清理函数
        return () => {
            subscribers.delete(subscriberId);
            progressCallbacks.delete(progressCb);
            connectionCallbacks.delete(connectionCb);

            // 最后一个订阅者卸载时断开连接
            if (subscribers.size === 0) {
                // 延迟断开，避免 React StrictMode 的 mount/unmount/mount
                setTimeout(() => {
                    if (subscribers.size === 0) {
                        console.log('[WebSocket] 🧹 所有组件已卸载，断开连接');
                        disconnectWebSocket();
                    }
                }, 1000);
            }
        };
    }, []);

    // 任务ID变化时发送订阅
    useEffect(() => {
        if (taskId) {
            currentTaskId = taskId;
            sendSubscribe(taskId);
        }
        
        return () => {
            if (taskId) {
                sendUnsubscribe(taskId);
                if (currentTaskId === taskId) {
                    currentTaskId = null;
                }
            }
        };
    }, [taskId]);

    // 手动订阅
    const subscribe = useCallback((id) => {
        currentTaskId = id;
        sendSubscribe(id);
    }, []);

    // 手动取消订阅
    const unsubscribe = useCallback((id) => {
        sendUnsubscribe(id);
        if (currentTaskId === id) {
            currentTaskId = null;
        }
    }, []);

    return { progress, connected, subscribe, unsubscribe };
}

export default useTaskProgress;