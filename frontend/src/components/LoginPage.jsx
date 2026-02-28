import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

/**
 * 登录/注册页面组件
 */
function LoginPage() {
    const [isLogin, setIsLogin] = useState(true); // true=登录, false=注册
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [nickname, setNickname] = useState('');
    const [rememberPassword, setRememberPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [autoLogging, setAutoLogging] = useState(false);

    const { login, register } = useAuth();

    // 初始化时检查是否有记住的账号密码
    useEffect(() => {
        try {
            const saved = localStorage.getItem('rememberedAccount');
            if (saved) {
                const { username: savedUser, password: savedPass } = JSON.parse(saved);
                if (savedUser && savedPass) {
                    const decodedPass = atob(savedPass);
                    setUsername(savedUser);
                    setPassword(decodedPass);
                    setRememberPassword(true);
                    // 自动登录
                    setAutoLogging(true);
                    setLoading(true);
                    login(savedUser, decodedPass)
                        .catch((err) => {
                            setError('自动登录失败：' + err.message);
                            setAutoLogging(false);
                        })
                        .finally(() => {
                            setLoading(false);
                            setAutoLogging(false);
                        });
                }
            }
        } catch (e) {
            // 忽略解析错误
        }
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (isLogin) {
                await login(username, password);
                // 登录成功后处理记住密码
                if (rememberPassword) {
                    localStorage.setItem('rememberedAccount', JSON.stringify({
                        username,
                        password: btoa(password) // base64 编码存储
                    }));
                } else {
                    localStorage.removeItem('rememberedAccount');
                }
            } else {
                await register(username, password, nickname || username);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100 flex items-center justify-center px-4">
            <div className="w-full max-w-md">
                {/* Logo 区域 */}
                <div className="text-center mb-8">
                    <div className="text-5xl mb-3">🤖</div>
                    <h1 className="text-2xl font-bold text-gray-800">智学笔记</h1>
                    <p className="text-gray-500 text-sm mt-1">AI 课堂笔记自动化处理系统</p>
                </div>

                {/* 登录/注册表单 */}
                <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-8">
                    {/* 切换标签 */}
                    <div className="flex mb-6 bg-gray-100 rounded-lg p-1">
                        <button
                            onClick={() => { setIsLogin(true); setError(''); }}
                            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                                isLogin
                                    ? 'bg-white text-indigo-600 shadow'
                                    : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            登录
                        </button>
                        <button
                            onClick={() => { setIsLogin(false); setError(''); }}
                            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                                !isLogin
                                    ? 'bg-white text-indigo-600 shadow'
                                    : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            注册
                        </button>
                    </div>

                    {/* 错误提示 */}
                    {error && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit}>
                        {/* 用户名 */}
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                用户名
                            </label>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                                minLength={3}
                                maxLength={20}
                                placeholder="请输入用户名"
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                            />
                        </div>

                        {/* 昵称（仅注册） */}
                        {!isLogin && (
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    昵称 <span className="text-gray-400">(选填)</span>
                                </label>
                                <input
                                    type="text"
                                    value={nickname}
                                    onChange={(e) => setNickname(e.target.value)}
                                    maxLength={20}
                                    placeholder="显示名称"
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                                />
                            </div>
                        )}

                        {/* 密码 */}
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                密码
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                minLength={6}
                                placeholder="请输入密码"
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                            />
                        </div>

                        {/* 记住密码（仅登录模式显示） */}
                        {isLogin && (
                            <div className="mb-6 flex items-center">
                                <input
                                    type="checkbox"
                                    id="rememberPassword"
                                    checked={rememberPassword}
                                    onChange={(e) => {
                                        setRememberPassword(e.target.checked);
                                        if (!e.target.checked) {
                                            localStorage.removeItem('rememberedAccount');
                                        }
                                    }}
                                    className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer"
                                />
                                <label htmlFor="rememberPassword" className="ml-2 text-sm text-gray-600 cursor-pointer select-none">
                                    记住密码
                                </label>
                            </div>
                        )}

                        {/* 提交按钮 */}
                        <button
                            type="submit"
                            disabled={loading}
                            className={`w-full py-3 px-4 rounded-lg text-white font-medium transition-all ${
                                loading
                                    ? 'bg-gray-400 cursor-not-allowed'
                                    : 'bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 shadow-lg hover:shadow-xl'
                            }`}
                        >
                            {loading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    处理中...
                                </span>
                            ) : (
                                isLogin ? '登 录' : '注 册'
                            )}
                        </button>
                    </form>
                </div>

                {/* 底部提示 */}
                <p className="text-center text-gray-500 text-sm mt-6">
                    智学笔记 v1.0
                </p>
            </div>
        </div>
    );
}

export default LoginPage;
