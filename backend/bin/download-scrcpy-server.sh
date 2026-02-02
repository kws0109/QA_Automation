#!/bin/bash
# scrcpy-server 다운로드 스크립트
# 사용법: bash download-scrcpy-server.sh

SCRCPY_VERSION="2.4"
DOWNLOAD_URL="https://github.com/Genymobile/scrcpy/releases/download/v${SCRCPY_VERSION}/scrcpy-server-v${SCRCPY_VERSION}"
OUTPUT_FILE="scrcpy-server"

echo "scrcpy-server v${SCRCPY_VERSION} 다운로드 중..."

# curl 또는 wget으로 다운로드
if command -v curl &> /dev/null; then
    curl -L -o "$OUTPUT_FILE" "$DOWNLOAD_URL"
elif command -v wget &> /dev/null; then
    wget -O "$OUTPUT_FILE" "$DOWNLOAD_URL"
else
    echo "Error: curl 또는 wget이 필요합니다."
    exit 1
fi

if [ -f "$OUTPUT_FILE" ]; then
    echo "다운로드 완료: $OUTPUT_FILE"
    echo "파일 크기: $(ls -lh $OUTPUT_FILE | awk '{print $5}')"
else
    echo "다운로드 실패"
    exit 1
fi
