import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const db = getDb();
    const config: any = db.prepare("SELECT * FROM configuracoes WHERE id = 'default'").get();
    if (config && (!config.horario_funcionamento || config.horario_funcionamento.includes("Segunda: Fechado") || config.horario_funcionamento.includes("Domingo e Segunda") || config.horario_funcionamento.includes("Terça a Sábado"))) {
      const horarioReal = "• Segunda-feira: 10h às 19h\n• Terça a Quinta: 10h às 21h\n• Sexta e Sábado: 09h às 21h\n• Domingo: Fechado";
      db.prepare("UPDATE configuracoes SET horario_funcionamento = ? WHERE id = 'default'").run(horarioReal);
      config.horario_funcionamento = horarioReal;
    }
    return NextResponse.json({ success: true, config });
  } catch (error: any) {
    console.error("ERRO GET /api/configuracoes:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const data = await req.json();
    const db = getDb();

    const {
      nome_barbearia,
      endereco,
      link_google_maps,
      latitude,
      longitude,
      link_booksy,
      chave_pix,
      telefone_principal,
      mensagem_boas_vindas,
      horario_funcionamento,
      senha_admin,
      dias_aviso_renovacao,
      aviso_renovacao_ativo,
      tempo_pausa_humano_minutos,
      gemini_api_key,
      gemini_ativo,
      gemini_prompt_personalizado
    } = data;

    const latVal = (latitude !== undefined && latitude !== null && latitude !== "") ? Number(latitude) : null;
    const lngVal = (longitude !== undefined && longitude !== null && longitude !== "") ? Number(longitude) : null;
    const diasAvisoVal = (dias_aviso_renovacao !== undefined && dias_aviso_renovacao !== null && dias_aviso_renovacao !== "") ? Math.max(1, Number(dias_aviso_renovacao)) : 3;
    const avisoAtivoVal = aviso_renovacao_ativo !== undefined ? (Number(aviso_renovacao_ativo) ? 1 : 0) : 1;
    const pausaMinutosVal = (tempo_pausa_humano_minutos !== undefined && tempo_pausa_humano_minutos !== null && tempo_pausa_humano_minutos !== "") ? Math.max(5, Number(tempo_pausa_humano_minutos)) : 120;
    const geminiAtivoVal = gemini_ativo !== undefined ? (Number(gemini_ativo) ? 1 : 0) : 1;
    const geminiKeyVal = gemini_api_key !== undefined ? String(gemini_api_key || "").trim() : null;
    const geminiPromptVal = gemini_prompt_personalizado !== undefined ? String(gemini_prompt_personalizado || "").trim() : null;

    if (senha_admin && senha_admin.trim().length >= 4) {
      db.prepare(`
        UPDATE configuracoes SET
          nome_barbearia = ?,
          endereco = ?,
          link_google_maps = ?,
          latitude = ?,
          longitude = ?,
          link_booksy = ?,
          chave_pix = ?,
          telefone_principal = ?,
          mensagem_boas_vindas = ?,
          horario_funcionamento = ?,
          dias_aviso_renovacao = ?,
          aviso_renovacao_ativo = ?,
          tempo_pausa_humano_minutos = ?,
          gemini_api_key = COALESCE(?, gemini_api_key),
          gemini_ativo = ?,
          gemini_prompt_personalizado = COALESCE(?, gemini_prompt_personalizado),
          senha_admin = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = 'default'
      `).run(
        nome_barbearia,
        endereco,
        link_google_maps,
        latVal,
        lngVal,
        link_booksy,
        chave_pix,
        telefone_principal,
        mensagem_boas_vindas,
        horario_funcionamento,
        diasAvisoVal,
        avisoAtivoVal,
        pausaMinutosVal,
        geminiKeyVal,
        geminiAtivoVal,
        geminiPromptVal,
        senha_admin.trim()
      );
    } else {
      db.prepare(`
        UPDATE configuracoes SET
          nome_barbearia = ?,
          endereco = ?,
          link_google_maps = ?,
          latitude = ?,
          longitude = ?,
          link_booksy = ?,
          chave_pix = ?,
          telefone_principal = ?,
          mensagem_boas_vindas = ?,
          horario_funcionamento = ?,
          dias_aviso_renovacao = ?,
          aviso_renovacao_ativo = ?,
          tempo_pausa_humano_minutos = ?,
          gemini_api_key = COALESCE(?, gemini_api_key),
          gemini_ativo = ?,
          gemini_prompt_personalizado = COALESCE(?, gemini_prompt_personalizado),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = 'default'
      `).run(
        nome_barbearia,
        endereco,
        link_google_maps,
        latVal,
        lngVal,
        link_booksy,
        chave_pix,
        telefone_principal,
        mensagem_boas_vindas,
        horario_funcionamento,
        diasAvisoVal,
        avisoAtivoVal,
        pausaMinutosVal,
        geminiKeyVal,
        geminiAtivoVal,
        geminiPromptVal
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("ERRO PUT /api/configuracoes:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
