#!/bin/bash

# 사용 중인 포트 종료 스크립트
# Windows용 (Git Bash)

echo "🔍 포트 사용 프로세스 확인 중..."

# 종료할 포트 목록
PORTS=(3001 5173 4723)

for PORT in "${PORTS[@]}"; do
  echo ""
  echo "📍 포트 $PORT 확인..."
  
  # Windows netstat으로 PID 찾기
  PID=$(netstat -ano 2>/dev/null | grep ":$PORT " | grep "LISTENING" | awk '{print $5}' | head -1)
  
  if [ -n "$PID" ] && [ "$PID" != "0" ]; then
    echo "  ⚠️  포트 $PORT 사용 중 (PID: $PID)"
    taskkill //F //PID "$PID" 2>/dev/null
    if [ $? -eq 0 ]; then
      echo "  ✅ 프로세스 종료됨"
    else
      echo "  ❌ 종료 실패 (관리자 권한 필요할 수 있음)"
    fi
  else
    echo "  ✅ 사용 중 아님"
  fi
done

echo ""
echo "🎉 완료!"