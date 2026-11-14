import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { validarTokenAutenticacao } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("gm_auth_token")?.value;

    const autenticado = validarTokenAutenticacao(token);

    const db = getDb();
    const config: any = db.prepare("SELECT nome_barbearia FROM configuracoes WHERE id = 'default'").get();

    return NextResponse.json({
      autenticado,
      nome_barbearia: config?.nome_barbearia || "GM Barbershop"
    });
  } catch (error: any) {
    return NextResponse.json({ autenticado: false });
  }
}
