# AI智能课堂笔记 - 打包发布完整手册

> 每次修改代码后，按照以下步骤操作，即可生成新的 `.exe` 安装包。
> 包含常见卡住问题的排障方法。

---

## 前提条件

- 电脑已安装 **Node.js**（`node -v` 能看到版本号）
- 电脑已安装 **npm**（`npm -v` 能看到版本号）
- 代理软件已打开（有 TUN 模式优先开 TUN）

---

## 第一步：打开 PowerShell，设置环境变量

按 `Win + X`，选择「终端」或「Windows PowerShell」，执行以下全部命令：

```powershell
# Electron 使用本地缓存（避免重复下载 80MB 的 Electron）
$env:ELECTRON_CACHE="D:\sorryios-test"

# 代理设置（根据你的代理端口修改，以下以 7897 为例）
$env:HTTP_PROXY="http://127.0.0.1:7897"
$env:HTTPS_PROXY="http://127.0.0.1:7897"
$env:ELECTRON_GET_USE_PROXY="true"
$env:ELECTRON_BUILDER_CACHE="D:\sorryios-test\.electron-builder-cache"
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"

npm config set proxy http://127.0.0.1:7897
npm config set https-proxy http://127.0.0.1:7897
```

> ⚠️ 这些命令只在当前终端窗口有效，关闭终端后需要重新执行。
> ⚠️ 如果你没有代理，可以只保留第一行 `ELECTRON_CACHE` 那行，其余代理相关的跳过。

---

## 第二步：构建前端

```powershell
cd D:\sorryios-test\frontend
npm install
npx vite build
```

**成功标志：** 看到 `✓ built in x.xxs`

> 这一步把前端 React 代码编译到 `backend/public/app/` 目录下。

---

## 第三步：安装后端依赖

```powershell
cd D:\sorryios-test\backend
npm install --omit=dev
```

**成功标志：** 看到 `audited xxx packages`

> 如果之前装过且没改 `package.json`，会显示 `up to date`，很快完成。

---

## 第四步：打包生成 .exe

```powershell
cd D:\sorryios-test\desktop-client
npm install
npm run build
```

**成功标志：** 看到 `building block map  blockMapFile=D:\sorryios-test\release\...`

---

## 第五步：获取安装包

```powershell
cd D:\sorryios-test\release
dir
```

看到 `AI智能课堂笔记 Setup x.x.x.exe` 就说明打包成功。

- **安装版：** 双击 `AI智能课堂笔记 Setup x.x.x.exe`
- **免安装版：** 直接运行 `release\win-unpacked\AI智能课堂笔记.exe`

---

## 快速复制版（一次性粘贴执行）

打开 PowerShell，直接粘贴：

```powershell
# 环境变量
$env:ELECTRON_CACHE="D:\sorryios-test"
$env:HTTP_PROXY="http://127.0.0.1:7897"
$env:HTTPS_PROXY="http://127.0.0.1:7897"
$env:ELECTRON_GET_USE_PROXY="true"
$env:ELECTRON_BUILDER_CACHE="D:\sorryios-test\.electron-builder-cache"
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
npm config set proxy http://127.0.0.1:7897
npm config set https-proxy http://127.0.0.1:7897

# 构建前端
cd D:\sorryios-test\frontend
npm install
npx vite build

# 安装后端依赖
cd D:\sorryios-test\backend
npm install --omit=dev

# 打包
cd D:\sorryios-test\desktop-client
npm install
npm run build
```

等待执行完毕，去 `D:\sorryios-test\release\` 拿安装包。

---

## 排障指南：卡住了怎么办

### 怎么判断卡在哪

| 现象 | 原因 | 处理 |
|------|------|------|
| 卡在 `npm install` 前半段 | npm 依赖下载慢 | 检查代理是否生效 |
| 卡在 `electron postinstall` | Electron 二进制下载/校验/解压 | 看下方「Electron 卡住处理」 |
| 卡在 `downloading winCodeSign` / `nsis` | GitHub 附件下载慢 | 先等，通常会自动重试 |
| 出现 `exit 0` / `npm info ok` | 其实已经成功了 | 不用管，继续下一步 |

### 不用慌的信号

- `npm warn deprecated ...` → 不是错误，正常警告
- `failed optional dependency ...` → 不是错误，Windows 上跳过 macOS 依赖很正常
- `ECONNRESET` / `EOF` + `retrying` → 网络抖动，工具在自动重试
- `exit 0` / `npm info ok` → 已经成功

### Electron 卡住的固定处理步骤

**第 1 步：** 按 `Ctrl + C` 中断

**第 2 步：** 清理缓存

```powershell
Remove-Item -Recurse -Force D:\sorryios-test\.electron-builder-cache -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force D:\sorryios-test\desktop-client\node_modules\electron -ErrorAction SilentlyContinue
```

**第 3 步：** 重新设置环境变量（从第一步复制粘贴即可）

**第 4 步：** 重新安装（加 `--verbose` 可以看到更详细的进度）

```powershell
cd D:\sorryios-test\desktop-client
npm install --verbose
```

**第 5 步：** 如果还是卡，单独测试 Electron 安装

```powershell
node D:\sorryios-test\desktop-client\node_modules\electron\install.js
```

如果这里卡住，说明问题在 Electron 下载，不是 npm 的问题。

### 打包时卡在下载 winCodeSign / nsis

- 先不要中断，通常会自动重试成功
- 如果超过 5 分钟没动静，`Ctrl + C` 后清缓存重试：

```powershell
Remove-Item -Recurse -Force D:\sorryios-test\.electron-builder-cache -ErrorAction SilentlyContinue
npm run build
```

---

## 定制指南：改名字 / 图标 / 启动界面

### 修改软件名称（需改 3 处）

| 文件 | 字段 | 作用 |
|------|------|------|
| `desktop-client\config.json` | `"appName"` | 窗口标题、启动界面、托盘名称 |
| `desktop-client\package.json` | `"productName"` | exe 文件名、安装程序标题 |
| `desktop-client\package.json` | `"build.nsis.shortcutName"` | 桌面快捷方式名称 |

### 修改图标

用 `.ico` 格式图标（建议 256×256），命名为 `app.ico`，放到 `desktop-client\` 覆盖原文件。

> PNG 转 ICO 工具：https://convertio.co/png-ico/

### 修改启动界面

编辑 `desktop-client\main.js`，搜索 `getSplashHTML` 函数，可改：
- Logo emoji（搜索 `\uD83D\uDCDA`）
- 副标题（搜索 `智能学习 · 高效笔记`）
- 背景渐变色（搜索 `linear-gradient`）

### 修改版本号

编辑 `desktop-client\package.json`，修改 `"version": "1.0.0"`。

### 修改服务器地址

编辑 `desktop-client\config.json`，修改 `"server"` 字段。
- `localhost` → 本地模式（自动启动后端）
- 其他地址 → 远程模式（直接连接）

---

## 编码注意事项

`package.json` 和 `config.json` 中如果包含中文，**必须保存为 UTF-8 编码**。

用 VS Code 打开文件，看右下角编码显示：
- 如果是 `UTF-8` → 正常
- 如果不是 → 点击编码名称，选「通过编码保存」→ 选 `UTF-8`

如果不确定，可以在 PowerShell 中验证：

```powershell
Get-Content D:\sorryios-test\desktop-client\package.json | Select-String "productName"
```

输出中文正常显示就没问题，如果是乱码就需要用 VS Code 重新保存。

---

## Windows SmartScreen 提示「未知发布者」

安装时如果 Windows 弹出保护提示，这不是包坏了，是因为没有代码签名证书。

处理：点「更多信息」→「仍要运行」。本地测试阶段属于正常现象。

---

## 文件结构速查

```
D:\sorryios-test\
├── frontend\                  ← 前端源码（React）
├── backend\                   ← 后端源码（Node.js）
├── desktop-client\            ← Electron 桌面壳
│   ├── main.js                ← 主程序逻辑、启动界面
│   ├── config.json            ← 应用名称、服务器地址
│   ├── package.json           ← 打包配置、软件名称、图标、版本号
│   └── app.ico                ← 应用图标
├── release\                   ← 打包输出目录
│   ├── AI智能课堂笔记 Setup x.x.x.exe  ← 安装包
│   └── win-unpacked\          ← 免安装版
├── electron-v33.3.1-win32-x64.zip      ← Electron 本地缓存（不要删）
└── .electron-builder-cache\   ← 打包工具缓存
```

---

## 快速判断口诀

- 看到 `npm warn deprecated` → 不是失败
- 看到 `failed optional dependency` → 不是失败
- 卡在 `electron postinstall` → 先等 2 分钟，不行就清缓存重试
- 看到 `ECONNRESET` / `EOF` → 先看会不会自动重试
- 看到 `exit 0` / `npm info ok` → 已经成功
- 看到 `building block map` → 打包已完成
- 在 `release\` 里看到 `.exe` → 大功告成
