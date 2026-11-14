import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const { tabela, query } = await req.json();
    const db = getDb();

    let sqlQuery = "";
    if (tabela) {
      const cleanTable = tabela.replace(/[^a-zA-Z0-9_]/g, "");
      sqlQuery = `SELECT * FROM ${cleanTable} LIMIT 100`;
    } else if (query) {
      sqlQuery = query;
    } else {
      sqlQuery = "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'";
    }

    const rows: any[] = db.prepare(sqlQuery).all() || [];
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

    return NextResponse.json({ columns, rows, total: rows.length });
  } catch (error: any) {
    console.error("ERRO POST /api/banco/exec:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
