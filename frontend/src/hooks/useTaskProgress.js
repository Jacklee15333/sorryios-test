import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

/**
 * WebSocket Hook - 用于订阅任务进度
 */
export function useTaskProgress(taskId) {
    const [progress, setProgress] = useState(null);
    const [connected, setConnected] = useState(false);
    const socketRef = useRef(null);

    useEffect(() => {
        // 连接到后端 WebSocket
        const socket = io('http://localhost:3000', {
            transports: ['websocket', 'polling']
        });

        socketRef.current = socket;

        socket.on('connect', () => {
            console.log('WebSocket 已连接');
            setConnected(true);
        });

        socket.on('disconnect', () => {
            console.log('WebSocket 已断开');
            setConnected(false);
        });

        socket.on('taskUpdate', (data) => {
            console.log('收到进度更新:', data);
            setProgress(data);
        });

        return () => {
            socket.disconnect();
        };
    }, []);

    // 订阅任务
    const subscribe = useCallback((id) => {
        if (socketRef.current && id) {
            console.log('订阅任务:', id);
            socketRef.current.emit('subscribe', id);
        }
    }, []);

    // 取消订阅
    const unsubscribe = useCallback((id) => {
        if (socketRef.current && id) {
            console.log('取消订阅:', id);
            socketRef.current.emit('unsubscribe', id);
        }
    }, []);

    // 当 taskId 变化时自动订阅
    useEffect(() => {
        if (taskId) {
            subscribe(taskId);
        }
        return () => {
            if (taskId) {
                unsubscribe(taskId);
            }
        };
    }, [taskId, subscribe, unsubscribe]);

    return { progress, connected, subscribe, unsubscribe };
}

export default useTaskProgress;
