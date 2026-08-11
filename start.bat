@echo off
echo ==========================================
echo Starting IQ Platform...
echo ==========================================

REM Check if .env file exists
IF NOT EXIST .env (
    echo [INFO] .env file not found. Creating one from .env.example...
    copy .env.example .env
    echo [IMPORTANT] Please open the .env file and fill in your Supabase credentials!
    echo Pause for 5 seconds...
    timeout /t 5 /nobreak
)

echo [INFO] Building and starting Docker containers...
docker compose up --build

pause
