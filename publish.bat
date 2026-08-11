@echo off
echo ==========================================
echo Building and Pushing All Docker Images...
echo ==========================================

echo.
echo [1/4] Building IQ Backend...
docker build -t vaibhav010606/iq-backend:latest ./backend
if %errorlevel% neq 0 exit /b %errorlevel%

echo.
echo [2/4] Building IQ Frontend...
docker build -t vaibhav010606/iq-frontend:latest ./frontend
if %errorlevel% neq 0 exit /b %errorlevel%

echo.
echo [3/4] Building Exam Backend...
docker build -t vaibhav010606/exam-backend:latest ./exam/backend
if %errorlevel% neq 0 exit /b %errorlevel%

echo.
echo [4/4] Building Exam Frontend...
docker build -t vaibhav010606/exam-frontend:latest ./exam/frontend
if %errorlevel% neq 0 exit /b %errorlevel%

echo.
echo ==========================================
echo Pushing Images to Docker Hub...
echo ==========================================

docker push vaibhav010606/iq-backend:latest
docker push vaibhav010606/iq-frontend:latest
docker push vaibhav010606/exam-backend:latest
docker push vaibhav010606/exam-frontend:latest

echo.
echo ==========================================
echo SUCCESS: All images have been uploaded!
echo ==========================================
pause
