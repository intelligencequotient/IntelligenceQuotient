#!/bin/bash
echo "=========================================="
echo "Starting IQ Platform..."
echo "=========================================="

# Check if .env file exists
if [ ! -f .env ]; then
    echo "[INFO] .env file not found. Creating one from .env.example..."
    cp .env.example .env
    echo "[IMPORTANT] Please open the .env file and fill in your Supabase credentials!"
    sleep 3
fi

echo "[INFO] Building and starting Docker containers..."
docker compose up --build
