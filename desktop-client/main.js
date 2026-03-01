/**
 * AI智能课堂笔记 - Electron 桌面应用
 * 
 * ============================================================
 * 🔧 定制指南（后续修改请看这里）：
 * ============================================================
 * 
 * 【修改软件名称】
 *   1. config.json → "appName" 字段（运行时读取的名称）
 *   2. package.json → "productName" 字段（安装包和 exe 显示的名称）
 *   3. package.json → "build.nsis.shortcutName"（桌面快捷方式名称）
 * 
 * 【修改图标】
 *   1. 替换 desktop-client/app.ico（必须是 .ico 格式，建议 256x256）
 *   2. package.json → "build.win.icon" 指定图标路径
 * 
 * 【修改启动界面】
 *   搜索 "getSplashHTML" 函数（在本文件底部），修改其中的：
 *   - 标题文字、副标题
 *   - 背景颜色（CSS gradient）
 *   - Logo emoji 或图片
 *   - 加载提示文字
 * 
 * 【修改窗口大小】
 *   修改本文件顶部 CONFIG 对象中的 WINDOW_WIDTH / WINDOW_HEIGHT
 * 
 * 【修改服务器地址】
 *   config.json → "server" 字段
 * ============================================================
 */

const { app, BrowserWindow, Menu, Tray, shell, dialog, globalShortcut, ipcMain } = require('electron');
const { spawn, execSync } = require('child_process');
const path = require('path');
const http = require('http');
const https = require('https');
const fs = require('fs');

// ============================================================
// Load Config
// ============================================================
const CONFIG_PATH = path.join(__dirname, 'config.json');
let userConfig = { server: 'http://localhost:3000' };
try {
  userConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
} catch (e) {
  console.log('config.json not found, using defaults');
}

const SERVER_URL = userConfig.server.replace(/\/+$/, '');
const APP_NAME = userConfig.appName || 'AI智能课堂笔记';
const IS_LOCAL = SERVER_URL.includes('localhost') || SERVER_URL.includes('127.0.0.1');

const CONFIG = {
  APP_URL: SERVER_URL,
  STARTUP_TIMEOUT: 30000,
  POLL_INTERVAL: 500,
  WINDOW_WIDTH: 1360,
  WINDOW_HEIGHT: 860,
  MIN_WIDTH: 1024,
  MIN_HEIGHT: 700,
  MAX_LOG_LINES: 2000,
};

function getPort() {
  try {
    const url = new URL(SERVER_URL);
    return url.port || (url.protocol === 'https:' ? '443' : '80');
  } catch (e) {
    return '3000';
  }
}

// ============================================================
// Path resolution - packaged vs development
// ============================================================
const IS_PACKAGED = app.isPackaged;

let BACKEND_DIR;
if (IS_PACKAGED) {
  BACKEND_DIR = path.join(process.resourcesPath, 'backend');
} else {
  BACKEND_DIR = path.join(__dirname, '..', 'backend');
}

const ICON_PATH = path.join(__dirname, 'app.ico');

let mainWindow = null;
let logWindow = null;
let tray = null;
let backendProcess = null;
let isQuitting = false;

// ============================================================
// Log Buffer
// ============================================================
const logBuffer = [];

function log(msg) {
  const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
  const line = '[' + ts + '] ' + msg;
  console.log(line);
  logBuffer.push(line);
  if (logBuffer.length > CONFIG.MAX_LOG_LINES) logBuffer.shift();
  if (logWindow && !logWindow.isDestroyed()) {
    try { logWindow.webContents.send('log-line', line); } catch (e) {}
  }
}

// ============================================================
// Kill port (Windows)
// ============================================================
function killPort(port) {
  try {
    if (process.platform === 'win32') {
      var result = execSync(
        'netstat -ano | findstr ":' + port + ' " | findstr "LISTENING"',
        { encoding: 'utf8', timeout: 5000, windowsHide: true }
      ).trim();
      if (result) {
        var pids = {};
        result.split('\n').forEach(function (line) {
          var parts = line.trim().split(/\s+/);
          var pid = parts[parts.length - 1];
          if (pid && pid !== '0') pids[pid] = true;
        });
        Object.keys(pids).forEach(function (pid) {
          try { execSync('taskkill /PID ' + pid + ' /T /F', { timeout: 5000, windowsHide: true }); } catch (e) {}
        });
      }
    }
  } catch (e) {}
}

// ============================================================
// Check if server is reachable
// ============================================================
function checkServer() {
  return new Promise(function (resolve) {
    var getter = SERVER_URL.startsWith('https') ? https : http;
    var req = getter.get(SERVER_URL, { timeout: 3000 }, function (res) {
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });
    req.on('error', function () { resolve(false); });
    req.on('timeout', function () { req.destroy(); resolve(false); });
  });
}

// ============================================================
// Start Local Backend
// ============================================================
function startBackend() {
  return new Promise(function (resolve, reject) {
    log('正在启动后端服务...');
    log('后端目录: ' + BACKEND_DIR);

    if (!fs.existsSync(BACKEND_DIR)) {
      reject(new Error('找不到后端目录: ' + BACKEND_DIR
        + '\n\n请确保应用打包时包含了 backend 目录。'));
      return;
    }

    if (!fs.existsSync(path.join(BACKEND_DIR, 'server.js'))) {
      reject(new Error('找不到 server.js: ' + BACKEND_DIR));
      return;
    }

    if (!fs.existsSync(path.join(BACKEND_DIR, 'node_modules'))) {
      log('正在安装后端依赖...');
      try {
        var npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
        execSync(npmCmd + ' install --production', {
          cwd: BACKEND_DIR,
          timeout: 120000,
          windowsHide: true,
          env: Object.assign({}, process.env),
          shell: process.env.ComSpec || true
        });
        log('后端依赖安装完成');
      } catch (e) {
        reject(new Error('安装后端依赖失败: ' + e.message
          + '\n\n请确保系统已安装 Node.js 和 npm。'));
        return;
      }
    }

    var port = getPort();
    killPort(port);

    var env = {};
    Object.keys(process.env).forEach(function (k) { env[k] = process.env[k]; });
    env.PORT = String(port);
    env.NODE_ENV = 'production';
    env.SORRYIOS_DESKTOP = '1';

    // Find system Node.js in packaged mode
    var nodePath = 'node';
    if (IS_PACKAGED) {
      try {
        var found = execSync(process.platform === 'win32' ? 'where node' : 'which node', {
          encoding: 'utf8', timeout: 5000, windowsHide: true,
          shell: process.env.ComSpec || true
        }).trim().split('\n')[0].trim();
        if (found && fs.existsSync(found)) {
          nodePath = found;
        }
      } catch (e) {
        var common = [
          'C:\\Program Files\\nodejs\\node.exe',
          'C:\\Program Files (x86)\\nodejs\\node.exe',
        ];
        for (var i = 0; i < common.length; i++) {
          if (fs.existsSync(common[i])) { nodePath = common[i]; break; }
        }
      }
    }

    log('Node 路径: ' + nodePath);

    backendProcess = spawn(nodePath, ['server.js'], {
      cwd: BACKEND_DIR,
      env: env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    backendProcess.stdout.on('data', function (data) {
      data.toString().split('\n').forEach(function (line) {
        line = line.trim();
        if (line) log('[后端] ' + line);
      });
    });

    backendProcess.stderr.on('data', function (data) {
      data.toString().split('\n').forEach(function (line) {
        line = line.trim();
        if (line) log('[后端:错误] ' + line);
      });
    });

    backendProcess.on('error', function (err) {
      log('后端启动错误: ' + err.message);
      reject(err);
    });

    backendProcess.on('exit', function (code) {
      log('后端已退出: ' + code);
      backendProcess = null;
      if (!isQuitting) {
        dialog.showErrorBox('后端错误', '后端服务意外停止，应用即将关闭。');
        app.quit();
      }
    });

    var startTime = Date.now();
    function poll() {
      if (Date.now() - startTime > CONFIG.STARTUP_TIMEOUT) {
        reject(new Error('后端启动超时'));
        return;
      }
      checkServer().then(function (ok) {
        if (ok) { log('后端服务已就绪'); resolve(); }
        else { setTimeout(poll, CONFIG.POLL_INTERVAL); }
      });
    }
    setTimeout(poll, 1000);
  });
}

// ============================================================
// Stop Backend
// ============================================================
function stopBackend() {
  if (backendProcess) {
    isQuitting = true;
    if (process.platform === 'win32') {
      try { execSync('taskkill /PID ' + backendProcess.pid + ' /T /F', { timeout: 5000, windowsHide: true }); } catch (e) {}
    } else {
      backendProcess.kill('SIGTERM');
    }
    backendProcess = null;
    if (IS_LOCAL) killPort(getPort());
  }
}

// ============================================================
// Frontend check
// ============================================================
function isFrontendBuilt() {
  return fs.existsSync(path.join(BACKEND_DIR, 'public', 'app', 'index.html'));
}

// ============================================================
// Log Viewer Window (Ctrl+L)
// ============================================================
function createLogWindow() {
  if (logWindow && !logWindow.isDestroyed()) { logWindow.focus(); return; }

  logWindow = new BrowserWindow({
    width: 850, height: 520,
    title: APP_NAME + ' - 控制台',
    icon: ICON_PATH,
    backgroundColor: '#1e1e2e',
    autoHideMenuBar: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });

  var logHTML = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>'
    + 'body{margin:0;padding:12px;background:#1e1e2e;color:#cdd6f4;font:13px/1.6 "Cascadia Code",Consolas,monospace;}'
    + '#log{white-space:pre-wrap;word-break:break-all;}'
    + '.ts{color:#89b4fa;} .be{color:#a6e3a1;} .er{color:#f38ba8;}'
    + '</style></head><body><div id="log"></div><script>'
    + 'const {ipcRenderer}=require("electron");'
    + 'const el=document.getElementById("log");'
    + 'function add(l){const d=document.createElement("div");'
    + 'l=l.replace(/\\[(\\d{2}:\\d{2}:\\d{2})\\]/,\'<span class="ts">[$1]</span>\');'
    + 'if(l.includes("[后端]"))l=l.replace("[后端]",\'<span class="be">[后端]</span>\');'
    + 'if(l.includes("错误"))l=l.replace(/(错误[^<]*)/i,\'<span class="er">$1</span>\');'
    + 'd.innerHTML=l;el.appendChild(d);window.scrollTo(0,document.body.scrollHeight);}'
    + 'ipcRenderer.on("log-line",(_,l)=>add(l));'
    + 'ipcRenderer.on("log-init",(_,lines)=>lines.forEach(add));'
    + '</script></body></html>';

  logWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(logHTML));
  logWindow.webContents.on('did-finish-load', function () {
    logWindow.webContents.send('log-init', logBuffer);
  });
  logWindow.on('closed', function () { logWindow = null; });
}

// ============================================================
// Main Window
// ============================================================
function createWindow() {
  mainWindow = new BrowserWindow({
    width: CONFIG.WINDOW_WIDTH, height: CONFIG.WINDOW_HEIGHT,
    minWidth: CONFIG.MIN_WIDTH, minHeight: CONFIG.MIN_HEIGHT,
    title: APP_NAME, icon: ICON_PATH,
    backgroundColor: '#f5f3ff', show: false, autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, spellcheck: false }
  });

  // 右键菜单（中文）
  mainWindow.webContents.on('context-menu', function () {
    Menu.buildFromTemplate([
      { label: '返回', click: function () { mainWindow.webContents.goBack(); } },
      { label: '刷新', click: function () { mainWindow.webContents.reload(); } },
      { type: 'separator' },
      { label: '复制', role: 'copy' },
      { label: '粘贴', role: 'paste' },
      { label: '全选', role: 'selectAll' },
      { type: 'separator' },
      { label: '控制台 (Ctrl+L)', click: function () { createLogWindow(); } },
      { label: '开发者工具 (F12)', click: function () { mainWindow.webContents.openDevTools(); } },
    ]).popup();
  });

  mainWindow.webContents.setWindowOpenHandler(function (details) {
    var url = details.url;
    if (!url || url === '' || url === 'about:blank' || url.indexOf('localhost') > -1 || url.indexOf('127.0.0.1') > -1) {
      return { action: 'allow', overrideBrowserWindowOptions: { width: 950, height: 750, autoHideMenuBar: true, title: APP_NAME, icon: ICON_PATH, backgroundColor: '#ffffff' } };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', function () { mainWindow = null; });
  return mainWindow;
}

// ============================================================
// System Tray (中文)
// ============================================================
function createTray() {
  if (!fs.existsSync(ICON_PATH)) return;
  try {
    tray = new Tray(ICON_PATH);
    tray.setToolTip(APP_NAME);
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: '打开应用', click: function () { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
      { label: '控制台', click: function () { createLogWindow(); } },
      { type: 'separator' },
      { label: '刷新', click: function () { if (mainWindow) mainWindow.webContents.reload(); } },
      { type: 'separator' },
      { label: '退出', click: function () { isQuitting = true; app.quit(); } },
    ]));
    tray.on('click', function () { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });
  } catch (e) { log('托盘图标加载失败: ' + e.message); }
}

// ============================================================
// 启动界面（中文，无技术信息）
// ============================================================
// 【定制说明】修改这个函数可以自定义启动画面的外观
function getSplashHTML(statusText) {
  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>'
    + '*{margin:0;padding:0;box-sizing:border-box}'
    + 'body{font-family:"Microsoft YaHei","PingFang SC",sans-serif;'
    + 'background:linear-gradient(135deg,#0f0f1a 0%,#1a1a3e 40%,#2d1b69 100%);'
    + 'height:100vh;display:flex;align-items:center;justify-content:center;overflow:hidden;}'
    + '.bg{position:fixed;width:400px;height:400px;border-radius:50%;filter:blur(120px);opacity:0.3;}'
    + '.bg.a{top:-100px;right:-100px;background:#7c5cfc;}'
    + '.bg.b{bottom:-100px;left:-100px;background:#a78bfa;}'
    + '.c{text-align:center;color:#fff;position:relative;z-index:1;}'
    + '.logo{width:72px;height:72px;background:linear-gradient(135deg,#7c5cfc,#a78bfa);'
    + 'border-radius:18px;display:flex;align-items:center;justify-content:center;font-size:36px;'
    + 'margin:0 auto 24px;box-shadow:0 8px 32px rgba(124,92,252,0.3);}'
    + '.title{font-size:28px;font-weight:700;letter-spacing:2px;margin-bottom:8px;}'
    + '.sub{font-size:14px;opacity:0.5;margin-bottom:48px;letter-spacing:3px;}'
    + '.sp{width:36px;height:36px;border:3px solid rgba(255,255,255,0.12);'
    + 'border-top-color:rgba(124,92,252,0.9);border-radius:50%;'
    + 'animation:s 0.8s linear infinite;margin:0 auto 18px;}'
    + '@keyframes s{to{transform:rotate(360deg)}}'
    + '.st{font-size:13px;opacity:0.5;letter-spacing:1px;}'
    + '</style></head><body>'
    + '<div class="bg a"></div><div class="bg b"></div>'
    + '<div class="c">'
    + '<div class="logo">\uD83D\uDCDA</div>'           // 📚 书本emoji，可替换
    + '<div class="title">' + APP_NAME + '</div>'
    + '<div class="sub">智能学习 · 高效笔记</div>'
    + '<div class="sp"></div>'
    + '<div class="st">' + statusText + '</div>'
    // 不再显示 localhost 等技术信息
    + '</div></body></html>';
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
}

// ============================================================
// App Lifecycle
// ============================================================
app.whenReady().then(async function () {
  log('====================================');
  log('  ' + APP_NAME + ' 启动中');
  log('  模式: ' + (IS_LOCAL ? '本地' : '远程'));
  log('  后端目录: ' + BACKEND_DIR);
  log('====================================');

  var win = createWindow();
  win.loadURL(getSplashHTML('正在初始化...'));
  win.show();
  createTray();
  globalShortcut.register('CommandOrControl+L', function () { createLogWindow(); });

  try {
    if (IS_LOCAL) {
      var alreadyRunning = await checkServer();
      if (alreadyRunning) {
        log('后端已在运行，直接连接...');
      } else {
        if (!isFrontendBuilt()) {
          log('错误: 前端未构建!');
          dialog.showErrorBox('启动失败',
            '前端文件未找到。\n\n'
            + '请在打包前执行:\n'
            + '  cd frontend\n'
            + '  npm install\n'
            + '  npx vite build\n\n'
            + '然后重新打包应用。');
          app.quit(); return;
        }
        win.loadURL(getSplashHTML('正在启动服务...'));
        await startBackend();
      }
    } else {
      win.loadURL(getSplashHTML('正在连接服务器...'));
      log('正在连接远程服务器: ' + SERVER_URL);
      var retries = 0;
      var maxRetries = 10;
      while (retries < maxRetries) {
        var ok = await checkServer();
        if (ok) break;
        retries++;
        log('连接尝试 ' + retries + '/' + maxRetries + '...');
        await new Promise(function (r) { setTimeout(r, 2000); });
      }
      if (retries >= maxRetries) {
        var choice = dialog.showMessageBoxSync(win, {
          type: 'error', title: '连接失败',
          message: '无法连接到服务器，请检查网络连接和服务器状态。',
          buttons: ['重试', '退出'],
        });
        if (choice === 1) { app.quit(); return; }
        win.loadURL(getSplashHTML('正在重试...'));
      }
    }

    log('正在加载应用...');
    win.loadURL(CONFIG.APP_URL);
    win.webContents.on('did-finish-load', function () { log('应用加载完成'); win.setTitle(APP_NAME); });
    win.webContents.on('did-fail-load', function (ev, code, desc) {
      log('加载失败: ' + desc + '，2秒后重试...');
      setTimeout(function () { if (mainWindow) mainWindow.loadURL(CONFIG.APP_URL); }, 2000);
    });
  } catch (error) {
    log('启动失败: ' + error.message);
    dialog.showErrorBox('启动失败', error.message);
    app.quit();
  }
});

app.on('window-all-closed', function () { if (backendProcess) stopBackend(); app.quit(); });
app.on('before-quit', function () { isQuitting = true; globalShortcut.unregisterAll(); if (backendProcess) stopBackend(); });
app.on('activate', function () {
  if (BrowserWindow.getAllWindows().length === 0) { createWindow(); mainWindow.loadURL(CONFIG.APP_URL); mainWindow.show(); }
});
process.on('uncaughtException', function (err) { log('致命错误: ' + err.message); if (backendProcess) stopBackend(); });
process.on('SIGINT', function () { if (backendProcess) stopBackend(); process.exit(0); });
process.on('SIGTERM', function () { if (backendProcess) stopBackend(); process.exit(0); });
