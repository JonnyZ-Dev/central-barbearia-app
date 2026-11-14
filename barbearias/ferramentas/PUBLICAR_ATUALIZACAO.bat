@echo off
title Barbearia VIP - Publicar Atualizacao para os Clientes
color 0A

echo =======================================================
echo    PUBLICAR ATUALIZACAO DO SISTEMA PARA OS CLIENTES
echo =======================================================
echo.
echo Toda alteracao que voce enviar aqui sera recebida
echo automaticamente por todos os notebooks das barbearias!
echo.

:: Vai para a raiz do codigo fonte (E:\ChatBot_MensalistasAPP)
cd /d "%~dp0\..\.."
set "PATH=C:\Program Files\Git\cmd;E:\;C:\Program Files\nodejs;" + %PATH%

set /p DESCRICAO="Descreva o que foi alterado (ou aperte Enter para padrao): "
if "%DESCRICAO%"=="" set "DESCRICAO=melhorias gerais no sistema"

echo.
echo [*] Adicionando arquivos modificados no codigo fonte...
git add .

echo [*] Criando versao da atualizacao...
git commit -m "update: %DESCRICAO%"

echo [*] Enviando atualizacao para o GitHub...
git push origin main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo =======================================================
    echo  [OK] ATUALIZACAO PUBLICADA COM SUCESSO NO GITHUB!
    echo =======================================================
    echo Agora, quando os notebooks dos clientes ligarem ou
    echo quando clicarem em 'Buscar Atualizacoes', eles vao
    echo baixar essa novidade automaticamente!
) else (
    echo.
    echo [ERRO] Falha ao enviar para o GitHub. Verifique sua conexao.
)

echo.
pause
