@echo off
title Barbearia VIP - Inicializador
color 0E

echo =======================================================
echo          SISTEMA BARBEARIA VIP E CHATBOT
echo =======================================================
echo.

cd /d "%~dp0"

:: 1. Detectar Node.js
set "NODE_CMD=node"
if exist "C:\Program Files\nodejs\node.exe" (
    set "NODE_CMD=C:\Program Files\nodejs\node.exe"
    set "PATH=C:\Program Files\Git\cmd;C:\Program Files\nodejs;%PATH%"
) else (
    set "PATH=C:\Program Files\Git\cmd;C:\Program Files\nodejs;%PATH%"
)

:: 2. Verificar atualizacoes silenciosamente (se tiver Git e Internet)
where git >nul 2>&1
if %ERRORLEVEL% NEQ 0 goto verificar_servidor

echo [*] Verificando atualizacoes no GitHub...
if not exist ".git" (
    echo [*] Conectando este notebook a central de atualizacoes...
    git init >nul 2>&1
    git remote remove origin >nul 2>&1
    git remote add origin https://github.com/JonnyZ-Dev/central-barbearia-app.git >nul 2>&1
    git fetch origin main --quiet >nul 2>&1
    git branch -M main >nul 2>&1
    git reset --hard origin/main >nul 2>&1
)

:: Configurar autor caso nao exista
git config user.name >nul 2>&1
if %ERRORLEVEL% NEQ 0 git config user.name "Barbearia VIP Cliente"
git config user.email >nul 2>&1
if %ERRORLEVEL% NEQ 0 git config user.email "cliente@barbeariavip.local"

:: Garante que o HEAD exista
git rev-parse --verify HEAD >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    git fetch origin main --quiet >nul 2>&1
    git branch -M main >nul 2>&1
    git reset --hard origin/main >nul 2>&1
)

git fetch origin main --quiet >nul 2>&1
set COMMITS_PENDENTES=0
for /f %%i in ('git rev-list --count HEAD..origin/main 2^>nul') do set COMMITS_PENDENTES=%%i

if "%COMMITS_PENDENTES%"=="0" goto verificar_servidor
if "%COMMITS_PENDENTES%"=="" goto verificar_servidor

echo.
echo [+] Atualizando sistema do GitHub: %COMMITS_PENDENTES% novas melhorias...
for /f "tokens=5" %%p in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do taskkill /F /PID %%p >nul 2>&1

:: Cria script temporario desacoplado para compilar sem corrupcao de byte-offset no cmd.exe
> "%~dp0_executar_update.bat" echo @echo off
>> "%~dp0_executar_update.bat" echo title Atualizando Sistema...
>> "%~dp0_executar_update.bat" echo cd /d "%~dp0"
>> "%~dp0_executar_update.bat" echo git reset --hard origin/main
>> "%~dp0_executar_update.bat" echo call "%NODE_CMD%" node_modules\next\dist\bin\next build
>> "%~dp0_executar_update.bat" echo start "" "%~f0"
>> "%~dp0_executar_update.bat" echo del /f /q "%~dp0_executar_update.bat"
>> "%~dp0_executar_update.bat" echo exit

start "Atualizador" "%~dp0_executar_update.bat"
exit /b

:verificar_servidor
:: 3. Verificar se o servidor ja esta rodando na porta 3000 (ouvindo conexoes)
netstat -ano | findstr :3000 | findstr LISTENING >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] O servidor ja esta em execucao!
    goto abrir_aplicativo
)

echo [*] Iniciando servidor de producao local...
start "Barbearia_Server" /min "%NODE_CMD%" node_modules\next\dist\bin\next start -p 3000 -H 0.0.0.0
echo [*] Aguardando servidor carregar na memoria...

set WAIT_COUNT=0
:loop_esperar_porta
set /a WAIT_COUNT+=1
ping 127.0.0.1 -n 2 >nul
netstat -ano | findstr :3000 | findstr LISTENING >nul 2>&1
if %ERRORLEVEL% EQU 0 goto servidor_pronto
if %WAIT_COUNT% LSS 20 goto loop_esperar_porta

:servidor_pronto
echo [OK] Servidor ativo e respondendo na porta 3000!

:abrir_aplicativo
:: 4. Dispara reconexao automatica do WhatsApp caso haja sessao salva
powershell -NoProfile -Command "try { Invoke-RestMethod -Uri 'http://localhost:3000/api/whatsapp' -Method POST -Body '{\"acao\":\"CONECTAR\"}' -ContentType 'application/json' -TimeoutSec 3 } catch {}" >nul 2>&1

:: 5. Abrir janela do aplicativo em modo nativo
echo [*] Abrindo o painel em modo aplicativo nativo...
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --app="http://localhost:3000"
) else if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --app="http://localhost:3000"
) else (
    start http://localhost:3000
)

echo.
echo [OK] Barbearia VIP aberta com sucesso!
ping 127.0.0.1 -n 2 >nul
exit
