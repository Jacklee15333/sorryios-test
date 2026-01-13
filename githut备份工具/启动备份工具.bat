@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

REM ====== 这个 BAT 所在目录 ======
set "HERE=%~dp0"
cd /d "%HERE%"

REM ====== 你的 Python 脚本文件名（与 bat 同目录）======
set "SCRIPT=%HERE%github_backup_gui_easy.py"

if not exist "%SCRIPT%" (
  echo [错误] 找不到脚本：%SCRIPT%
  echo 请确认 github_backup_gui_easy.py 与本 bat 放在同一文件夹。
  pause
  exit /b 1
)

REM ====== 找 Python ======
set "PY=python"
%PY% -V >nul 2>&1
if errorlevel 1 (
  set "PY=py"
  %PY% -3 -V >nul 2>&1
  if errorlevel 1 (
    echo [错误] 没检测到 Python。
    echo 请先安装 Python 3，并勾选 Add Python to PATH。
    pause
    exit /b 1
  ) else (
    set "PY=py -3"
  )
)

echo [OK] 使用 Python：%PY%

REM ====== 可选：自动安装拖拽依赖 tkinterdnd2（装不上也不影响使用）======
echo [提示] 尝试安装拖拽支持库 tkinterdnd2（失败可忽略）...
%PY% -m pip install --user -q tkinterdnd2 >nul 2>&1

REM ====== 启动 GUI ======
echo [启动] 正在打开备份工具...
%PY% "%SCRIPT%"

endlocal
