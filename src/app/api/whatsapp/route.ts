import { NextResponse } from "next/server";
import { iniciarWhatsAppBot, getBotStatus, desconectarBot, setRoboPausado, isRoboPausado } from "@/lib/whatsapp-bot";
import fs from "fs";
import path from "path";

let autoConnectTentado = false;

export async function GET() {
  try {
    const status = getBotStatus();

    // Se o bot estiver desconectado e tiver credenciais salvas no banco, reconecta automaticamente no boot
    const credsPath = path.join(process.cwd(), "database", "auth_info_baileys", "creds.json");
    if (status.status === "DESCONECTADO" && !autoConnectTentado && fs.existsSync(credsPath)) {
      autoConnectTentado = true;
      iniciarWhatsAppBot().catch((e) => {
        console.error("[AUTO-CONNECT] Erro ao reconectar bot:", e);
        autoConnectTentado = false;
      });
    }

    return NextResponse.json(status);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { acao, pausado } = await req.json().catch(() => ({ acao: "CONECTAR" }));
    
    if (acao === "PAUSAR") {
      setRoboPausado(true);
      return NextResponse.json({ success: true, pausado: true, status: getBotStatus() });
    }

    if (acao === "RETOMAR") {
      setRoboPausado(false);
      return NextResponse.json({ success: true, pausado: false, status: getBotStatus() });
    }

    if (acao === "ALTERNAR_PAUSA") {
      const novo = setRoboPausado(pausado !== undefined ? Boolean(pausado) : !isRoboPausado());
      return NextResponse.json({ success: true, pausado: novo, status: getBotStatus() });
    }

    if (acao === "DESCONECTAR") {
      autoConnectTentado = true; // Impede auto-reconexão se o usuário desconectou manualmente
      const res = await desconectarBot();
      return NextResponse.json(res);
    }

    autoConnectTentado = true;
    const res = await iniciarWhatsAppBot();
    return NextResponse.json(res);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
