import crypto from "node:crypto";
import { getDb } from "./db";

const AUTH_SECRET = "gm-barbershop-secret-salt-2026";

export function obterSenhaCadastrada(): string {
  try {
    const db = getDb();
    const config: any = db.prepare("SELECT senha_admin FROM configuracoes WHERE id = 'default'").get();
    return config?.senha_admin || "admin123";
  } catch (e) {
    return "admin123";
  }
}

export function verificarSenhaAdmin(senha: string): boolean {
  if (!senha) return false;
  const senhaCorreta = obterSenhaCadastrada();
  return senha.trim() === senhaCorreta.trim();
}

export function gerarTokenAutenticacao(): string {
  const data = `admin:${Date.now()}:${AUTH_SECRET}`;
  const hash = crypto.createHmac("sha256", AUTH_SECRET).update(data).digest("hex");
  return Buffer.from(`${data}:${hash}`).toString("base64");
}

export function validarTokenAutenticacao(token: string | null | undefined): boolean {
  if (!token) return false;
  try {
    const decoded = Buffer.from(token, "base64").toString("utf-8");
    const parts = decoded.split(":");
    if (parts.length < 4) return false;
    const [user, timestampStr, secret, signature] = parts;
    const timestamp = parseInt(timestampStr, 10);
    // Token válido por 30 dias
    if (isNaN(timestamp) || Date.now() - timestamp > 30 * 24 * 60 * 60 * 1000) {
      return false;
    }
    const data = `${user}:${timestampStr}:${secret}`;
    const expectedSig = crypto.createHmac("sha256", AUTH_SECRET).update(data).digest("hex");
    return signature === expectedSig;
  } catch (e) {
    return false;
  }
}
