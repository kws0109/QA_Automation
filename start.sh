#!/bin/bash

echo "🎮 Game Automation Tool 시작..."
echo ""

# 프로젝트 루트 경로
PROJECT_DIR=~/game-automation-tool

# Appium 서버
echo "📱 Appium 서버 시작..."
appium &
APPIUM_PID=$!
sleep 3

# 백엔드 서버
echo "🖥️ 백엔드 서버 시작..."
cd "$PROJECT_DIR/backend" && npm run dev &
BACKEND_PID=$!
sleep 2

# 프론트엔드 서버
echo "🌐 프론트엔드 서버 시작..."
cd "$PROJECT_DIR/frontend" && npm run dev &
FRONTEND_PID=$!

echo ""
echo "========================================="
echo "✅ 모든 서버가 시작되었습니다!"
echo ""
echo "📱 Appium:     http://localhost:4723"
echo "🖥️ 백엔드:     http://localhost:3001"
echo "🌐 프론트엔드: http://localhost:5173"
echo ""
echo "종료하려면 Ctrl+C를 누르세요"
echo "========================================="

cleanup() {
  echo ""
  echo "🛑 서버 종료 중..."
  kill $APPIUM_PID $BACKEND_PID $FRONTEND_PID 2>/dev/null
  echo "✅ 모든 서버가 종료되었습니다."
  exit 0
}

trap cleanup SIGINT SIGTERM
wait