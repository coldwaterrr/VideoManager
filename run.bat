@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo 正在启动 videosort...
echo.

REM 检查 Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo 错误: 未找到 Node.js
    echo 请从 https://nodejs.org 下载并安装 Node.js LTS 版本
    pause
    exit /b 1
)

REM 检查 npm
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo 错误: 未找到 npm
    pause
    exit /b 1
)

REM 检查 node_modules
if not exist "node_modules" (
    echo 首次运行，正在下载依赖...
    call npm install
    if !errorlevel! neq 0 (
        echo 依赖安装失败
        pause
        exit /b 1
    )
)

REM 启动开发服务器
echo.
echo ========================================
echo 应用启动中...
echo 如果浏览器未自动打开，请访问: http://localhost:5173
echo 按 Ctrl+C 停止服务
echo ========================================
echo.

call npm run dev
pause
