import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ success: true, message: "Sessão encerrada!" });
  response.cookies.delete("gm_auth_token");
  return response;
}
