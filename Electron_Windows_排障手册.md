# Windows 下 Electron 项目安装/打包卡住排障手册

适用场景：
- `npm install` 卡住
- Electron `postinstall` 卡住
- `npm run build` / `electron-builder` 下载附件卡住
- 想快速判断到底是失败，还是只是看起来卡住

---

## 一、先判断卡在哪一步

先记住这个思路：

- **卡在 `npm install` 前半段**：通常是 npm 依赖下载问题
- **卡在 `electron postinstall`**：通常是 Electron 二进制下载 / 校验 / 解压问题
- **卡在 `electron-builder` 下载附件**：通常是 GitHub 附件下载问题
- **最后出现 `exit 0` / `npm info ok`**：说明其实已经成功了

---

## 二、开始前先开代理，并设置环境变量

先打开代理软件。

建议：
- 有 **TUN 模式**就优先打开
- 没有也至少保证本地代理端口可用

本次可用代理示例：
- 地址：`127.0.0.1`
- 端口：`7897`

打开 **PowerShell**，执行：

```powershell
$env:HTTP_PROXY="http://127.0.0.1:7897"
$env:HTTPS_PROXY="http://127.0.0.1:7897"
$env:http_proxy="http://127.0.0.1:7897"
$env:https_proxy="http://127.0.0.1:7897"

$env:ELECTRON_GET_USE_PROXY="true"
$env:ELECTRON_CACHE="D:\sorryios-test\.electron-cache"
$env:ELECTRON_BUILDER_CACHE="D:\sorryios-test\.electron-builder-cache"
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"

npm config set proxy http://127.0.0.1:7897
npm config set https-proxy http://127.0.0.1:7897
```

这一步的作用：
- 让 npm 走代理
- 让 Electron 下载也走代理
- 把 Electron 缓存放到项目目录，方便查看和清理
- 强制 Electron 优先走镜像源，减少卡住概率

---

## 三、安装依赖的标准步骤

进入项目目录：

```powershell
cd D:\sorryios-test\desktop-client
npm install --verbose
```

为什么要加 `--verbose`：
- 能看到到底卡在哪
- 出问题时更容易判断是 npm、Electron 还是打包附件

---

## 四、如果 `npm install` 看起来卡住，先这样判断

### 情况 1：只是不断出现 `npm http fetch` / `npm http cache`

例如：

```text
npm http fetch ...
npm http cache ...
```

这通常说明还在下载、校验依赖。

处理方法：
- **先别急着中断**
- 只要还有新日志，就说明没死

---

### 情况 2：卡在 Electron 的 postinstall

例如：

```text
npm info run electron@33.3.1 postinstall node_modules/electron node install.js
```

这说明卡在：
- Electron 本体下载
- 校验
- 解压

这一步最容易“看起来像死了”。

处理方法：
- 先不要立刻关闭
- 有时候它后台在下载，但屏幕不继续刷字
- 如果长时间没反应，再按下面的清缓存流程做

---

## 五、Electron 卡住时的固定处理步骤

### 第一步：停止当前命令

```powershell
Ctrl + C
```

### 第二步：清理 Electron 缓存

```powershell
Remove-Item -Recurse -Force D:\sorryios-test\.electron-cache -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force D:\sorryios-test\.electron-builder-cache -ErrorAction SilentlyContinue
```

如果缓存里有坏文件、半截 zip，这一步很有用。

### 第三步：重新设置环境变量

```powershell
$env:HTTP_PROXY="http://127.0.0.1:7897"
$env:HTTPS_PROXY="http://127.0.0.1:7897"
$env:http_proxy="http://127.0.0.1:7897"
$env:https_proxy="http://127.0.0.1:7897"

$env:ELECTRON_GET_USE_PROXY="true"
$env:ELECTRON_CACHE="D:\sorryios-test\.electron-cache"
$env:ELECTRON_BUILDER_CACHE="D:\sorryios-test\.electron-builder-cache"
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
```

### 第四步：重新安装

```powershell
cd D:\sorryios-test\desktop-client
npm install --verbose
```

### 第五步：如果还怀疑 Electron 单独有问题，就单独测试

```powershell
cd D:\sorryios-test\desktop-client
node node_modules/electron/install.js
```

这个命令的作用：
- 把问题缩小到 Electron 自己
- 如果这里卡住，就可以确定不是整个 npm 的问题

---

## 六、怎么看是成功，还是没成功

### 成功信号

看到下面任意一种，通常就说明已经成功：

```text
npm verbose exit 0
npm info ok
```

或者：

```text
npm info run electron@33.3.1 postinstall { code: 0, signal: null }
```

### 不用慌的信号

例如：

```text
attempt 1 failed with ECONNRESET
Above command failed, retrying 3 more times
```

这表示：
- 网络抖了一下
- 工具正在自动重试

只要后面又出现 `downloaded`、`200`、`exit 0`，就算成功。

### 不重要的警告

例如：

```text
npm warn deprecated ...
failed optional dependency ...
```

这些多数不是致命错误。
尤其是在 Windows 上，很多 macOS 相关的 optional dependency 失败很正常。

不要被这些警告吓住。

---

## 七、安装完成后下一步怎么做

先看有哪些脚本：

```powershell
npm run
```

常见会看到：
- `dev`
- `start`
- `build`

然后按情况执行：

### 开发运行

```powershell
npm run dev
```

或者：

```powershell
npm start
```

### 打包

```powershell
npm run build
```

---

## 八、如果打包时卡住，怎么处理

打包时最常见卡点有两个。

### 1）下载 Electron 本体

例如：

```text
downloading electron-vxx-win32-x64.zip
```

这一般靠：
- 代理
- `ELECTRON_MIRROR`

来解决。

### 2）下载 `winCodeSign` / `nsis` 等附件

例如：

```text
downloading winCodeSign-2.6.0.7z
downloading nsis-3.0.4.1.7z
```

这些很多走 GitHub 附件地址，偶尔会出现：
- `EOF`
- `ECONNRESET`

处理方法：
- 先不要急着停止
- 很多时候它会自动重试
- 只要最后继续往下执行并生成产物，就说明已经成功

只要最终出现类似：

```text
building target=nsis ...
building block map ...
```

通常就说明安装包已经打好了。

---

## 九、如何确认安装包真的打出来了

进入 release 目录：

```powershell
cd D:\sorryios-test\release
dir
```

如果看到类似：
- `AI智能课堂笔记 Setup 1.0.0.exe`
- `win-unpacked`

就说明打包成功。

### 直接运行测试

#### 测试免安装版

```powershell
D:\sorryios-test\release\win-unpacked\AI智能课堂笔记.exe
```

#### 测试安装包

```powershell
D:\sorryios-test\release\AI智能课堂笔记 Setup 1.0.0.exe
```

---

## 十、如果 Windows 提示“未知发布者”

如果看到：
- SmartScreen
- 未知发布者
- Windows 保护了你的电脑

通常不是包坏了，而是：

- **没有配置代码签名证书**

处理方法：
1. 点 **更多信息**
2. 再点 **仍要运行**

本地测试阶段这是正常现象。

---

## 十一、下次最推荐直接照抄的完整流程

### 1）打开代理

确保代理软件已连接。
有 TUN 就开 TUN。

### 2）PowerShell 里执行

```powershell
$env:HTTP_PROXY="http://127.0.0.1:7897"
$env:HTTPS_PROXY="http://127.0.0.1:7897"
$env:http_proxy="http://127.0.0.1:7897"
$env:https_proxy="http://127.0.0.1:7897"

$env:ELECTRON_GET_USE_PROXY="true"
$env:ELECTRON_CACHE="D:\sorryios-test\.electron-cache"
$env:ELECTRON_BUILDER_CACHE="D:\sorryios-test\.electron-builder-cache"
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"

npm config set proxy http://127.0.0.1:7897
npm config set https-proxy http://127.0.0.1:7897
```

### 3）安装

```powershell
cd D:\sorryios-test\desktop-client
npm install --verbose
```

### 4）如果卡在 Electron，清缓存再来

```powershell
Remove-Item -Recurse -Force D:\sorryios-test\.electron-cache -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force D:\sorryios-test\.electron-builder-cache -ErrorAction SilentlyContinue
```

然后重新执行安装。

### 5）构建

```powershell
npm run build
```

### 6）检查产物

```powershell
cd D:\sorryios-test\release
dir
```

### 7）运行测试

```powershell
D:\sorryios-test\release\win-unpacked\AI智能课堂笔记.exe
```

或者：

```powershell
D:\sorryios-test\release\AI智能课堂笔记 Setup 1.0.0.exe
```

---

## 十二、快速判断口诀

- 看到 `npm warn deprecated`：通常不是失败
- 看到 `failed optional dependency`：通常不是失败
- 卡在 `electron postinstall`：优先怀疑 Electron 下载，不是 npm 坏了
- 看到 `ECONNRESET` / `EOF`：先看它会不会自动重试成功
- 看到 `exit 0` / `npm info ok`：说明已经成功
- 看到 `Setup xxx.exe`：说明安装包已经打出来了

---

## 十三、这次问题的核心经验

你这次真正的问题不是 npm 本身坏了，而是：

- 代理最开始没有正确传递给 npm / Electron / electron-builder
- 导致 Electron 安装或打包附件下载看起来像“卡死”

真正有效的解决办法是：
- 手动设置 `HTTP_PROXY` / `HTTPS_PROXY`
- 设置 `ELECTRON_GET_USE_PROXY`
- 设置 `ELECTRON_CACHE`
- 设置 `ELECTRON_BUILDER_CACHE`
- 设置 `ELECTRON_MIRROR`
- 卡住时清缓存后重试

按这套流程走，后面大多数类似问题都能比较快定位和解决。
