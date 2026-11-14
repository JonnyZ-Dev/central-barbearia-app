@echo off
title Gerador de Pacote para Nova Barbearia
color 0B

echo =======================================================
echo     GERADOR DE PACOTE LIMPO PARA NOVA BARBEARIA (SAAS)
echo =======================================================
echo.
echo Este utilitario cria uma copia do sistema 100%% limpa:
echo - Sem clientes ou historico da barbearia anterior
echo - Sem conexao ou QR Code de WhatsApp anterior
echo - Com a chave de licenca exclusiva do novo cliente
echo - Pronto para colocar no Pen Drive e instalar!
echo.

set /p NOME_BARBEARIA="Digite o Nome da Nova Barbearia: "
set /p CHAVE_LICENCA="Digite a Chave de Licenca no Supabase (ex: LIC-NOVO-2026): "
set /p PASTA_SAIDA="Digite a pasta de saida (ex: E:\Pacote_NovaBarbearia ou D:\PenDrive): "

if "%PASTA_SAIDA%"=="" (
    echo [ERRO] Caminho de pasta invalido!
    pause
    exit /b
)

:: Raiz do codigo fonte
set "ROOT=%~dp0\..\.."

echo.
echo [*] Criando pasta de saida em: %PASTA_SAIDA%...
if not exist "%PASTA_SAIDA%" mkdir "%PASTA_SAIDA%"

echo [*] Copiando arquivos do sistema (aguarde 1 minuto)...
robocopy "%ROOT%" "%PASTA_SAIDA%" /E /XD "%ROOT%\database" "%ROOT%\backups" "%ROOT%\scratch" "%ROOT%\.git" "%ROOT%\barbearias" /XF "%ROOT%\database\barbearia.db" "%ROOT%\.env.local" >nul

echo [*] Criando pasta database limpa...
if not exist "%PASTA_SAIDA%\database" mkdir "%PASTA_SAIDA%\database"

echo [*] Configurando chave de licenca exclusiva...
echo CHAVE_LICENCA=%CHAVE_LICENCA% > "%PASTA_SAIDA%\.env.local"

echo.
echo =======================================================
echo   [OK] PACOTE DA NOVA BARBEARIA CRIADO COM SUCESSO!
echo =======================================================
echo Barbearia: %NOME_BARBEARIA%
echo Licenca:   %CHAVE_LICENCA%
echo Pasta:     %PASTA_SAIDA%
echo.
echo PROXIMOS PASSOS:
echo 1. Copie esta pasta para o seu Pen Drive.
echo 2. Conecte o Pen Drive no notebook da barbearia.
echo 3. Clique com o botao direito em "1_INSTALAR_NO_CLIENTE.bat" e selecione
echo    "Executar como Administrador".
echo.
pause
