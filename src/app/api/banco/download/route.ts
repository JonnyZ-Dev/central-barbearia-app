import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { saveDb } from "@/lib/db";

export async function GET() {
  try {
    saveDb(); // Garante que a versão em memória foi persistida em disco
    const DB_FILE = path.join(process.cwd(), "database", "barbearia.db");

    if (!fs.existsSync(DB_FILE)) {
      return NextResponse.json({ error: "Arquivo de banco de dados não encontrado" }, { status: 404 });
    }

    const fileBuffer = fs.readFileSync(DB_FILE);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Disposition": 'attachment; filename="barbearia.db"',
        "Content-Type": "application/x-sqlite3",
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
