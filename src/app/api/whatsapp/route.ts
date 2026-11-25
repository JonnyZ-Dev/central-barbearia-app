import { NextResponse } from "next/server";
import { 
  iniciarWhatsAppBot, 
  getBotStatus, 
  desconectarBot, 
  setRoboPausado, 
  isRoboPausado,
  garantirBotIniciadoSeCredsExistem 
} from "@/lib/whatsapp-bot";

let autoConnectTentado = false;

export async function GET() {
  try {
    await garantirBotIniciadoSeCredsExistem();
    const status = getBotStatus();
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
    setRoboPausado(false);
    const res = await iniciarWhatsAppBot();
    return NextResponse.json(res);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
