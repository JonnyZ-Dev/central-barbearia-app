@echo off
title Barbearia VIP - Instalador Automatico no Notebook
color 0E

echo =======================================================
echo      INSTALADOR DO SISTEMA BARBEARIA VIP NO NOTEBOOK
echo =======================================================
echo.

:: 1. Verificar se esta rodando como Administrador
net session >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [AVISO] Para configurar o Firewall e Inicializacao com sucesso,
    echo         clique com o BOTAO DIREITO neste arquivo e escolha:
    echo         "EXECUTAR COMO ADMINISTRADOR".
    echo.
    echo Pressione qualquer tecla para tentar continuar mesmo assim...
    pause >nul
)

set "DESTINO=C:\BarbeariaApp"
set "ORIGEM=%~dp0"

echo [*] Pasta de Origem: %ORIGEM%
echo [*] Pasta de Destino no Notebook: %DESTINO%
echo.

:: 2. Se a origem for diferente do destino (ex: instalando do Pen Drive), copia os arquivos
if /i "%ORIGEM:~0,-1%" NEQ "%DESTINO%" (
    echo [*] Copiando arquivos do sistema para o disco local (%DESTINO%)...
    if not exist "%DESTINO%" mkdir "%DESTINO%"
    xcopy "%ORIGEM%*" "%DESTINO%\" /E /I /H /Y /Q /EXCLUDE:%ORIGEM%database\barbearia.db
    echo [OK] Copia concluida!
    cd /d "%DESTINO%"
) else (
    cd /d "%DESTINO%"
)

:: 3. Liberar Porta 3000 no Firewall para acesso via Celular (Wi-Fi)
echo [*] Liberando porta 3000 no Firewall para os barbeiros usarem no celular...
netsh advfirewall firewall delete rule name="BarbeariaApp_3000" >nul 2>&1
netsh advfirewall firewall add rule name="BarbeariaApp_3000" dir=in action=allow protocol=TCP localport=3000 >nul 2>&1
echo [OK] Firewall configurado!

:: 4. Criar Atalho na Area de Trabalho
echo [*] Criando atalho na Area de Trabalho...
powershell -NoProfile -Command "$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\Barbearia VIP.lnk'); $Shortcut.TargetPath = '%DESTINO%\INICIAR_SISTEMA.bat'; $Shortcut.WorkingDirectory = '%DESTINO%'; $Shortcut.WindowStyle = 7; $Shortcut.Save()"
echo [OK] Atalho criado na Area de Trabalho!

:: 5. Configurar Inicializacao Automatica no Windows (Boot / Ligar)
echo [*] Configurando inicializacao automatica ao ligar o notebook...
powershell -NoProfile -Command "$WshShell = New-Object -ComObject WScript.Shell; $StartupPath = [Environment]::GetFolderPath('Startup'); $Shortcut = $WshShell.CreateShortcut($StartupPath + '\BarbeariaVIP_AutoBoot.lnk'); $Shortcut.TargetPath = '%DESTINO%\INICIAR_SISTEMA.bat'; $Shortcut.WorkingDirectory = '%DESTINO%'; $Shortcut.WindowStyle = 7; $Shortcut.Save()"
echo [OK] Sistema configurado para ligar junto com o Windows!

echo.
echo =======================================================
echo          INSTALACAO CONCLUIDA COM SUCESSO!
echo =======================================================
echo.
echo 1. O sistema ja esta configurado para iniciar ao ligar o notebook.
echo 2. Um atalho foi adicionado a Area de Trabalho.
echo 3. O Firewall foi liberado para acesso no Wi-Fi.
echo.
set /p INICIAR="Deseja iniciar o sistema agora? (S/N): "
if /i "%INICIAR%"=="S" (
    start "" "%DESTINO%\INICIAR_SISTEMA.bat"
)
exit
