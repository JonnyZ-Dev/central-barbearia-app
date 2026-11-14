@echo off
title Barbearia VIP - Inicializador
color 0E

echo =======================================================
echo          SISTEMA BARBEARIA VIP E CHATBOT
echo =======================================================
echo.

cd /d "%~dp0"

:: Detectar Node.js
set "NODE_CMD=node"
if exist "E:\node.exe" (
    set "NODE_CMD=E:\node.exe"
    set "PATH=C:\Program Files\Git\cmd;E:\;C:\Program Files\nodejs;%PATH%"
) else if exist "C:\Program Files\nodejs\node.exe" (
    set "NODE_CMD=C:\Program Files\nodejs\node.exe"
    set "PATH=C:\Program Files\Git\cmd;C:\Program Files\nodejs;%PATH%"
) else (
    set "PATH=C:\Program Files\Git\cmd;C:\Program Files\nodejs;%PATH%"
)

:: 1. Verificar atualizacoes silenciosamente (se tiver Git e Internet)
where git >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [*] Verificando atualizacoes no GitHub...
    git fetch origin main --quiet >nul 2>&1
    for /f %%i in ('git rev-list --count HEAD..origin/main 2^>nul') do (
        if "%%i" neq "0" (
            if "%%i" neq "" (
                echo.
                echo [+] Atualizando sistema do GitHub...
                git pull origin main
                call "%NODE_CMD%" node_modules\next\dist\bin\next build
                echo [OK] Sistema atualizado!
            )
        )
    )
)

:: 2. Verificar se o servidor ja esta rodando na porta 3000
netstat -ano | findstr :3000 >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] O servidor ja esta em execucao!
) else (
    echo [*] Iniciando servidor de producao local...
    start "Barbearia_Server" /min "%NODE_CMD%" node_modules\next\dist\bin\next start -p 3000 -H 0.0.0.0
    ping 127.0.0.1 -n 4 >nul
)

:: 3. Dispara reconexao automatica do WhatsApp caso haja sessao salva
powershell -NoProfile -Command "try { Invoke-RestMethod -Uri 'http://localhost:3000/api/whatsapp' -Method POST -Body '{\"acao\":\"CONECTAR\"}' -ContentType 'application/json' -TimeoutSec 3 } catch {}" >nul 2>&1

:: 4. Abrir janela do aplicativo em modo nativo
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
