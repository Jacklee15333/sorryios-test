import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * 任务进度 WebSocket Hook v4.6
 * 
 * 修复:
 * - WebSocket 连接到后端 3000 端口，而不是前端 5173 端口
 */
function useTaskProgress(taskId) {
    const [progress, setProgress] = useState(null);
    const [connected, setConnected] = useState(false);
    const [logs, setLogs] = useState([]);
    
    const wsRef = useRef(null);
    const reconnectTimeoutRef = useRef(null);
    const lastMessageRef = useRef('');
    const logIdRef = useRef(0);
    const currentTaskIdRef = useRef(taskId);

    // 更新 ref
    useEffect(() => {
        currentTaskIdRef.current = taskId;
    }, [taskId]);

    // 清除日志
    const clearLogs = useCallback(() => {
        setLogs([]);
        lastMessageRef.current = '';
        logIdRef.current = 0;
    }, []);

    // 订阅任务 - 独立函数
    const subscribeToTask = useCallback((tid) => {
        if (wsRef.current?.readyState === WebSocket.OPEN && tid) {
            const msg = JSON.stringify({ type: 'subscribe', taskId: tid });
            wsRef.current.send(msg);
            console.log('[WS] 📡 发送订阅请求:', tid);
        } else {
            console.log('[WS] ⚠️ 无法订阅:', {
                wsState: wsRef.current?.readyState,
                taskId: tid
            });
        }
    }, []);

    // 初始化 WebSocket 连接 - 只执行一次
    useEffect(() => {
        // 🔧 修复：正确的 WebSocket 地址
        // 开发环境连接到后端 3000 端口，生产环境使用当前域名
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.hostname;
        
        // 如果是开发环境（5173端口），连接到后端3000端口
        // 如果是生产环境（其他端口），使用当前端口
        const port = window.location.port === '5173' ? '3000' : window.location.port;
        const wsUrl = `${protocol}//${host}:${port}`;
        
        console.log('[WS] 🔌 连接中...', wsUrl);
        
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log('[WS] ✅ 连接成功');
            setConnected(true);
            
            // 如果已有任务ID，立即订阅
            if (currentTaskIdRef.current) {
                console.log('[WS] 📡 连接后自动订阅:', currentTaskIdRef.current);
                ws.send(JSON.stringify({ type: 'subscribe', taskId: currentTaskIdRef.current }));
            }
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                
                // 调试：打印所有收到的消息
                console.log('[WS] 📥 收到:', data.type, data.taskId?.slice(0,8), (data.message || data.currentStep)?.substring(0, 40));
                
                // 处理进度消息
                if (data.type === 'progress' || data.type === 'taskProgress') {
                    // 检查是否是当前任务的消息
                    if (data.taskId && currentTaskIdRef.current && data.taskId !== currentTaskIdRef.current) {
                        console.log('[WS] ⏭️ 忽略其他任务的消息:', data.taskId?.slice(0,8));
                        return;
                    }
                    
                    // 获取消息内容 - 服务器发送的是 message 和 currentStep 字段
                    const stepMessage = data.message || data.currentStep || '';
                    
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
                        
                        console.log('[WS] 📝 新日志:', logIdRef.current, stepMessage.substring(0, 30));
                        
                        setLogs(prev => [...prev, newLog]);
                    }
                } else if (data.type === 'connected') {
                    console.log('[WS] 🎉 服务器确认连接, clientId:', data.clientId);
                }
            } catch (e) {
                console.error('[WS] ❌ 解析错误:', e, event.data);
            }
        };

        ws.onclose = (event) => {
            console.log('[WS] 🔌 连接关闭, code:', event.code);
            setConnected(false);
            
            // 3秒后重连
            reconnectTimeoutRef.current = setTimeout(() => {
                console.log('[WS] 🔄 尝试重连...');
                // 触发重新渲染来重连
                setConnected(false);
            }, 3000);
        };

        ws.onerror = (error) => {
            console.error('[WS] ❌ 错误:', error);
        };

        // 清理函数
        return () => {
            console.log('[WS] 🧹 清理连接');
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
        };
    }, []); // 空依赖，只执行一次

    // 当 taskId 变化时，重新订阅
    useEffect(() => {
        if (taskId && connected) {
            console.log('[WS] 🔄 taskId 变化，重新订阅:', taskId);
            clearLogs();
            subscribeToTask(taskId);
        }
    }, [taskId, connected, subscribeToTask, clearLogs]);

    return {
        progress,
        connected,
        logs,
        subscribe: subscribeToTask,
        unsubscribe: useCallback(() => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'unsubscribe' }));
            }
        }, []),
        clearLogs
    };
}

export default useTaskProgress;