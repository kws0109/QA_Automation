@echo off
chcp 65001 >nul
echo ========================================
echo   Backend Server Kill Script
echo ========================================
echo.

REM 포트 3001 사용 중인 프로세스 종료
echo [1] 포트 3001 점유 프로세스 확인 중...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001 ^| findstr LISTENING') do (
    echo     PID %%a 종료 중...
    taskkill /F /PID %%a >nul 2>&1
    if !errorlevel! == 0 (
        echo     성공: PID %%a 종료됨
    )
)

REM nodemon 프로세스 종료
echo.
echo [2] nodemon 프로세스 종료 중...
taskkill /F /IM nodemon.cmd >nul 2>&1
taskkill /F /IM nodemon >nul 2>&1

REM ts-node 관련 node 프로세스 확인 및 종료
echo.
echo [3] ts-node/node 프로세스 확인 중...
wmic process where "commandline like '%%ts-node%%' and commandline like '%%index.ts%%'" get processid 2>nul | findstr /r "[0-9]" >nul
if %errorlevel% == 0 (
    for /f "skip=1" %%p in ('wmic process where "commandline like '%%ts-node%%' and commandline like '%%index.ts%%'" get processid 2^>nul') do (
        if not "%%p"=="" (
            echo     PID %%p 종료 중...
            taskkill /F /PID %%p >nul 2>&1
        )
    )
)

echo.
echo ========================================
echo   완료! 포트 3001이 해제되었습니다.
echo ========================================
echo.

REM 포트 확인
netstat -ano | findstr :3001 | findstr LISTENING >nul 2>&1
if %errorlevel% == 0 (
    echo [경고] 아직 포트 3001을 사용 중인 프로세스가 있습니다:
    netstat -ano | findstr :3001 | findstr LISTENING
) else (
    echo [확인] 포트 3001이 사용 가능합니다.
)

pause
