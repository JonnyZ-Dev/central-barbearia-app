import { NextResponse } from "next/server";
import { testarChaveGemini } from "@/lib/gemini";

export async function POST(req: Request) {
  try {
    const { apiKey } = await req.json();
    const res = await testarChaveGemini(apiKey);
    if (res.success) {
      return NextResponse.json({ success: true, mensagem: "Chave do Google Gemini validada com sucesso! 🚀" });
    } else {
      return NextResponse.json({ success: false, erro: res.erro }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ success: false, erro: e.message }, { status: 500 });
  }
}
