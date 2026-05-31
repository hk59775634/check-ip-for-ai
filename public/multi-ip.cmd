@echo off
setlocal enabledelayedexpansion
set "IPS="

for /f "tokens=2 delims==" %%A in ('curl.exe -4 -s https://4.ipcheck.ing/cdn-cgi/trace 2^>nul ^| findstr /B "ip="') do call :append %%A
for /f "tokens=2 delims==" %%A in ('curl.exe -6 -s https://6.ipcheck.ing/cdn-cgi/trace 2^>nul ^| findstr /B "ip="') do call :append %%A
for /L %%N in (1,1,8) do for /f "tokens=2 delims==" %%A in ('curl.exe -s https://ptest-%%N.ipcheck.ing/cdn-cgi/trace 2^>nul ^| findstr /B "ip="') do call :append %%A

if not defined IPS (
  echo No egress IP found.
  exit /b 1
)

curl.exe -s -A curl "https://hk59775634.github.io/check-ip-for-ai/?ips=!IPS:~1!"
exit /b 0

:append
echo ,%IPS%, | findstr /C:",%1," >nul && exit /b 0
set "IPS=!IPS!,%1"
exit /b 0
