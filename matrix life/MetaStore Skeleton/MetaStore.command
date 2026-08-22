#!/bin/bash
# ============================================================================
# MetaStore Skeleton · 一键启动器（macOS .command）
# ----------------------------------------------------------------------------
# 双击本文件即可：
#   1. 首次运行自动安装依赖（npm install）
#   2. 启动 Vite 开发服务器 → http://localhost:5173
#   3. 自动打开默认浏览器
#   4. 若服务器已在运行，则仅打开浏览器（不重复启动）
#
# 用法：
#   双击运行（默认端口 5173）
#   终端运行可指定端口：./MetaStore.command 8080
# ============================================================================

# 定位到脚本所在目录（.command 双击时工作目录是用户主目录，必须显式切换）
cd "$(dirname "$0")" || { echo "❌ 无法进入项目目录"; exit 1; }

# 端口可经命令行参数覆盖，默认 5173（与 vite.config.js 的 server.port 一致）
PORT="${1:-5173}"
URL="http://localhost:${PORT}"

echo "=============================================="
echo "  MetaStore · 元宇宙线上商店骨架"
echo "  URL : ${URL}"
echo "=============================================="

# ---------- 1. 依赖检查（首次运行自动安装） ----------
if [ ! -d node_modules ]; then
  echo "📦 首次运行：安装依赖（约 30 秒，请稍候）..."
  npm install || { echo "❌ 依赖安装失败，请检查网络后重试"; read -r -p "按回车键关闭…"; exit 1; }
  echo "✅ 依赖安装完成"
fi

# ---------- 2. 启动 / 复用开发服务器 ----------
SERVER_PID=""
if curl -s -o /dev/null --max-time 1 "${URL}"; then
  echo "✅ 开发服务器已在运行"
else
  echo "🚀 启动 Vite 开发服务器 ..."
  npm run dev &
  SERVER_PID=$!

  # 轮询等待服务就绪（最多 30 秒）
  READY=0
  for _ in $(seq 1 30); do
    if curl -s -o /dev/null --max-time 1 "${URL}"; then
      READY=1
      break
    fi
    sleep 1
  done

  if [ "${READY}" -ne 1 ]; then
    echo "❌ 服务器启动超时，请查看上方日志输出"
    read -r -p "按回车键关闭…"
    exit 1
  fi
  echo "✅ 开发服务器已就绪"
fi

# ---------- 3. 打开默认浏览器 ----------
open "${URL}"
echo "🌐 已在浏览器中打开 ${URL}"
echo "💡 按 Ctrl+C 停止服务器；关闭本窗口也会终止由本脚本启动的服务"

# 前台等待服务器进程结束，保持终端窗口可见
if [ -n "${SERVER_PID}" ]; then
  wait "${SERVER_PID}"
fi
