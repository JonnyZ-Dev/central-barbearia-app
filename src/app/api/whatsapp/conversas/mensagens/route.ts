import { NextResponse } from "next/server";
import { buscarHistoricoMensagens } from "@/lib/whatsapp-bot";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const remoteJid = searchParams.get("remoteJid");
    const numero = searchParams.get("numero") || "";

    if (!remoteJid) {
      return NextResponse.json({ success: false, error: "remoteJid é obrigatório." }, { status: 400 });
    }

    const mensagens = buscarHistoricoMensagens(remoteJid, numero);

    return NextResponse.json({
      success: true,
      remoteJid,
      numero,
      total: mensagens.length,
      mensagens
    });
  } catch (err: any) {
    console.error("ERRO GET /api/whatsapp/conversas/mensagens:", err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
