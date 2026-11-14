@echo off
title Barbearia VIP - Liberar Acesso no Wi-Fi
color 0B

echo =======================================================
echo     LIBERAR ACESSO DA BARBEARIA PARA CELULARES (WI-FI)
echo =======================================================
echo.
echo [*] Configurando regra de entrada no Firewall do Windows para a porta 3000...
echo.

:: Executa comando com permissão de administrador
netsh advfirewall firewall delete rule name="BarbeariaApp_3000" >nul 2>&1
netsh advfirewall firewall add rule name="BarbeariaApp_3000" dir=in action=allow protocol=TCP localport=3000

if %ERRORLEVEL% EQU 0 (
    echo =======================================================
    echo  [OK] REGRA APLICADA COM SUCESSO!
    echo  Agora os barbeiros podem abrir o painel pelo celular
    echo  conectados no mesmo Wi-Fi da barbearia!
    echo =======================================================
) else (
    echo [!] Se deu erro, execute este arquivo clicando com o
    echo     BOTAO DIREITO -^> "Executar como Administrador".
)

echo.
pause
