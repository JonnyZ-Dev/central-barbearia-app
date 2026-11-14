import { NextResponse } from "next/server";
import { 
  listarAtendimentosHumanos, 
  removerPausaAtendimentoHumano, 
  ativarPausaAtendimentoHumano 
} from "@/lib/whatsapp-bot";

export async function GET() {
  try {
    const lista = listarAtendimentosHumanos();
    return NextResponse.json({ success: true, atendimentos: lista });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { remoteJid, acao } = await req.json();
    if (!remoteJid) {
      return NextResponse.json({ error: "remoteJid é obrigatório" }, { status: 400 });
    }

    if (acao === "REATIVAR") {
      removerPausaAtendimentoHumano(remoteJid);
      return NextResponse.json({ success: true, mensagem: "Robô reativado para esta conversa!" });
    }

    if (acao === "PAUSAR") {
      ativarPausaAtendimentoHumano(remoteJid, "Pausa manual ativada pelo painel");
      return NextResponse.json({ success: true, mensagem: "Robô pausado para esta conversa!" });
    }

    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
