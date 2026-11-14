import { NextResponse } from "next/server";
import { verificarLicencaRemota, iniciarMonitorLicenca } from "@/lib/licenca";

// Iniciar monitor automático em segundo plano
iniciarMonitorLicenca();

export async function GET(req: Request) {
  try {
    // Sempre verifica a licença em tempo real com o Supabase (com fallback offline automático)
    const info = await verificarLicencaRemota();
    return NextResponse.json(info);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const info = await verificarLicencaRemota(body.chave);
    return NextResponse.json(info);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
