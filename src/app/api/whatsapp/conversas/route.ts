import { NextResponse } from "next/server";
import { 
  listarConversasCompletas, 
  ativarPausaAtendimentoHumano, 
  removerPausaAtendimentoHumano,
  garantirBotIniciadoSeCredsExistem
} from "@/lib/whatsapp-bot";

export async function GET() {
  try {
    // Garante que o bot seja reconectado automaticamente se tiver credenciais salvas
    await garantirBotIniciadoSeCredsExistem();

    const conversas = listarConversasCompletas();
    const totalIa = conversas.filter(c => c.status === "IA").length;
    const totalHumano = conversas.filter(c => c.status === "HUMANO").length;

    return NextResponse.json({
      success: true,
      conversas,
      total: conversas.length,
      totalIa,
      totalHumano
    });
  } catch (error: any) {
    console.error("ERRO GET /api/whatsapp/conversas:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { acao, remoteJid, nome, numero } = body;

    if (!remoteJid) {
      return NextResponse.json({ success: false, error: "remoteJid é obrigatório." }, { status: 400 });
    }

    if (acao === "ASSUMIR") {
      ativarPausaAtendimentoHumano(
        remoteJid,
        "Atendimento assumido pelo atendente no painel",
        nome,
        numero
      );
      return NextResponse.json({
        success: true,
        message: "Atendimento humano assumido com sucesso! O robô não responderá esta conversa.",
        status: "HUMANO"
      });
    }

    if (acao === "PASSAR_PARA_IA" || acao === "REATIVAR") {
      removerPausaAtendimentoHumano(remoteJid);
      return NextResponse.json({
        success: true,
        message: "Conversa devolvida para a Elaine.IA com sucesso!",
        status: "IA"
      });
    }

    return NextResponse.json({ success: false, error: "Ação inválida." }, { status: 400 });
  } catch (error: any) {
    console.error("ERRO POST /api/whatsapp/conversas:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
