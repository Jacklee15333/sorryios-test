import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

/**
 * 用户认证 Provider
 */
export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    // 初始化时检查本地存储的登录状态
    useEffect(() => {
        checkAuth();
    }, []);

    // 检查认证状态
    const checkAuth = async () => {
        const savedUser = localStorage.getItem('user');
        const token = localStorage.getItem('token');
        
        if (savedUser && token) {
            try {
                // 验证 token 是否有效
                const response = await fetch('/api/user/stats', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
                if (response.ok) {
                    setUser(JSON.parse(savedUser));
                } else {
                    // Token 无效，清除本地存储
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                }
            } catch (e) {
                // 网络错误，保留本地用户信息
                setUser(JSON.parse(savedUser));
            }
        }
        setLoading(false);
    };

    // 登录
    const login = async (username, password) => {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || '登录失败');
        }

        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        setUser(data.user);
        return data.user;
    };

    // 注册
    const register = async (username, password, nickname) => {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, nickname })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || '注册失败');
        }

        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        setUser(data.user);
        return data.user;
    };

    // 登出
    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('rememberedAccount'); // 清除记住的密码，防止自动重新登录
        setUser(null);
    };

    // 获取用户学习数据
    const fetchLearningStats = async () => {
        const token = localStorage.getItem('token');
        if (!token) {
            throw new Error('未登录');
        }

        const response = await fetch('/api/user/stats', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error('获取学习数据失败');
        }

        return await response.json();
    };

    // 获取已掌握词汇统计
    const fetchMasteredStats = async () => {
        const token = localStorage.getItem('token');
        if (!token) {
            throw new Error('未登录');
        }

        const response = await fetch('/api/user-mastered/stats', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error('获取已掌握词汇统计失败');
        }

        const data = await response.json();
        return data.stats;
    };

    // 获取已掌握词汇列表
    const fetchMasteredList = async (type = null) => {
        const token = localStorage.getItem('token');
        if (!token) {
            throw new Error('未登录');
        }

        const url = type 
            ? `/api/user-mastered/list?type=${type}`
            : '/api/user-mastered/list';

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error('获取已掌握词汇列表失败');
        }

        const data = await response.json();
        return data.words;
    };

    // 添加已掌握词汇
    const addMasteredWord = async (word, wordType = 'word') => {
        const token = localStorage.getItem('token');
        if (!token) {
            throw new Error('未登录');
        }

        const response = await fetch('/api/user-mastered/add', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ word, wordType })
        });

        if (!response.ok) {
            throw new Error('添加失败');
        }

        return await response.json();
    };

    // 移除已掌握词汇
    const removeMasteredWord = async (word, wordType = null) => {
        const token = localStorage.getItem('token');
        if (!token) {
            throw new Error('未登录');
        }

        const response = await fetch('/api/user-mastered/remove', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ word, wordType })
        });

        if (!response.ok) {
            throw new Error('移除失败');
        }

        return await response.json();
    };

    // 清空所有已掌握词汇
    const clearAllMastered = async () => {
        const token = localStorage.getItem('token');
        if (!token) {
            throw new Error('未登录');
        }

        const response = await fetch('/api/user-mastered/clear', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error('清空失败');
        }

        return await response.json();
    };

    // 更新用户信息
    const updateUser = (newUserData) => {
        const updatedUser = { ...user, ...newUserData };
        localStorage.setItem('user', JSON.stringify(updatedUser));
        setUser(updatedUser);
    };

    return (
        <AuthContext.Provider value={{
            user,
            loading,
            login,
            register,
            logout,
            fetchLearningStats,
            fetchMasteredStats,
            fetchMasteredList,
            addMasteredWord,
            removeMasteredWord,
            clearAllMastered,
            updateUser,
            isAuthenticated: !!user
        }}>
            {children}
        </AuthContext.Provider>
    );
}

// Hook: 使用认证上下文
export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth 必须在 AuthProvider 内使用');
    }
    return context;
}

export default AuthContext;
