@echo off
title GM Barbearia VIP - Inicializador
color 0E

echo =======================================================
echo          SISTEMA GM BARBERSHOP VIP & CHATBOT
echo =======================================================
echo.
echo [*] Verificando servico local...

set "PATH=C:\Program Files\Git\cmd;E:\;C:\Program Files\nodejs;%PATH%"
cd /d "E:\ChatBot_MensalistasAPP"

:: Verificar se o servidor ja esta rodando na porta 3000
netstat -ano | findstr :3000 >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] O servidor ja esta em execucao!
) else (
    echo [*] Iniciando servidor de producao ultra-rapido...
    start "GM_Barbershop_Server" /min "E:\node.exe" node_modules\next\dist\bin\next start -p 3000 -H 0.0.0.0
    timeout /t 4 /nobreak >nul
)

:: Dispara reconexao automatica do WhatsApp caso haja sessao salva
powershell -NoProfile -Command "try { Invoke-RestMethod -Uri 'http://localhost:3000/api/whatsapp' -Method POST -Body '{\"acao\":\"CONECTAR\"}' -ContentType 'application/json' -TimeoutSec 3 } catch {}" >nul 2>&1

echo [*] Abrindo o painel em modo aplicativo nativo...
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --app="http://localhost:3000"
) else if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --app="http://localhost:3000"
) else (
    start http://localhost:3000
)

echo.
echo [OK] GM Barbearia VIP aberta com sucesso!
timeout /t 2 /nobreak >nul
exit