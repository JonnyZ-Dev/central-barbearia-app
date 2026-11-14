import { NextResponse } from "next/server";
import { verificarSenhaAdmin, gerarTokenAutenticacao } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const { senha } = await req.json();

    if (!verificarSenhaAdmin(senha)) {
      return NextResponse.json({ error: "Senha incorreta. Tente novamente!" }, { status: 401 });
    }

    const token = gerarTokenAutenticacao();
    const response = NextResponse.json({ success: true, message: "Login realizado com sucesso!" });

    // Definir cookie seguro de autenticação (válido por 30 dias)
    response.cookies.set("gm_auth_token", token, {
      httpOnly: true,
      secure: false, // para localhost / rede local
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60, // 30 dias
      path: "/"
    });

    return response;
  } catch (error: any) {
    console.error("ERRO POST /api/auth/login:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
