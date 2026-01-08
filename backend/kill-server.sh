#!/bin/bash
echo "========================================"
echo "  Backend Server Kill Script"
echo "========================================"
echo ""

# 포트 3001 사용 중인 프로세스 종료
echo "[1] 포트 3001 점유 프로세스 확인 중..."
PIDS=$(netstat -ano 2>/dev/null | grep ":3001" | grep "LISTENING" | awk '{print $5}' | sort -u)

if [ -n "$PIDS" ]; then
    for PID in $PIDS; do
        echo "    PID $PID 종료 중..."
        taskkill //F //PID $PID 2>/dev/null
    done
else
    echo "    포트 3001을 사용 중인 프로세스 없음"
fi

# nodemon 프로세스 종료
echo ""
echo "[2] nodemon 프로세스 종료 중..."
taskkill //F //IM nodemon.cmd 2>/dev/null
taskkill //F //IM nodemon 2>/dev/null

# node 프로세스 중 backend 관련만 종료 (선택적)
echo ""
echo "[3] 백엔드 관련 node 프로세스 확인..."

echo ""
echo "========================================"
echo "  완료!"
echo "========================================"

# 최종 확인
if netstat -ano 2>/dev/null | grep ":3001" | grep "LISTENING" > /dev/null; then
    echo "[경고] 아직 포트 3001을 사용 중인 프로세스가 있습니다"
    netstat -ano | grep ":3001" | grep "LISTENING"
else
    echo "[확인] 포트 3001이 사용 가능합니다"
fi
