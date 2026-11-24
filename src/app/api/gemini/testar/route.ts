import { NextResponse } from "next/server";
import { testarChaveGemini } from "@/lib/gemini";

export async function POST(req: Request) {
  try {
    const { apiKey } = await req.json();
    const res = await testarChaveGemini(apiKey);
    if (res.success) {
      return NextResponse.json({
        success: true,
        message: `Chave do Google Gemini validada com sucesso! (${res.modelo || "gemini-3.5-flash"}) 🚀`,
        mensagem: `Chave do Google Gemini validada com sucesso! (${res.modelo || "gemini-3.5-flash"}) 🚀`
      });
    } else {
      return NextResponse.json({ success: false, error: res.erro, erro: res.erro }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message, erro: e.message }, { status: 500 });
  }
}
