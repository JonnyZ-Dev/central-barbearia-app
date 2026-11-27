import { NextResponse } from "next/server";
import { sincronizarServicosBooksy } from "@/lib/booksy-sync";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const resultado = await sincronizarServicosBooksy(true);
    return NextResponse.json(resultado);
  } catch (err: any) {
    return NextResponse.json(
      { success: false, erro: err.message },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const resultado = await sincronizarServicosBooksy(false);
    return NextResponse.json(resultado);
  } catch (err: any) {
    return NextResponse.json(
      { success: false, erro: err.message },
      { status: 500 }
    );
  }
}
