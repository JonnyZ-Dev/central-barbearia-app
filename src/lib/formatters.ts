// Utilitários de Máscara e Validação à prova de erros para Telefones Brasileiros e WhatsApp

export function formatarTelefoneBR(valor: string): string {
  if (!valor) return "";
  let limpo = valor.replace(/\D/g, "");

  // Se o número tiver DDI 55 (Brasil) no início (12 ou 13 dígitos, ex: 5511978235873 ou 551178235873)
  if (limpo.startsWith("55") && limpo.length >= 12) {
    limpo = limpo.slice(2);
  }

  // Se for celular brasileiro com 8 dígitos sem o 9º dígito (ex: DDD 11 + 78235873), insere o 9º dígito
  if (limpo.length === 10 && ["6", "7", "8", "9"].includes(limpo.charAt(2))) {
    limpo = limpo.slice(0, 2) + "9" + limpo.slice(2);
  }

  // Limita ao máximo de 11 dígitos nacionais (DDD + 9 dígitos)
  limpo = limpo.slice(0, 11);

  if (limpo.length === 0) return "";
  if (limpo.length <= 2) return `+55 (${limpo}`;
  if (limpo.length <= 6) return `+55 (${limpo.slice(0, 2)}) ${limpo.slice(2)}`;
  if (limpo.length <= 10) {
    return `+55 (${limpo.slice(0, 2)}) ${limpo.slice(2, 6)}-${limpo.slice(6)}`;
  }

  // 11 dígitos: DDD (2) + 9 (1) + 4 dígitos + 4 dígitos
  // Padrão visual elegante e oficial: +55 (11) 9 7823-5873
  const ddd = limpo.slice(0, 2);
  const nono = limpo.charAt(2);
  const parte1 = limpo.slice(3, 7);
  const parte2 = limpo.slice(7, 11);

  if (nono === "9") {
    return `+55 (${ddd}) 9 ${parte1}-${parte2}`;
  } else {
    return `+55 (${ddd}) ${limpo.slice(2, 7)}-${limpo.slice(7, 11)}`;
  }
}

export function validarTelefoneBR(valor: string): boolean {
  if (!valor) return false;
  let digitos = valor.replace(/\D/g, "");
  if (digitos.startsWith("55") && digitos.length >= 12) {
    digitos = digitos.slice(2);
  }
  // Telefone celular no Brasil tem 11 dígitos (DDD + 9 dígitos), fixo tem 10 (DDD + 8 dígitos)
  if (digitos.length !== 10 && digitos.length !== 11) return false;
  // Bloquear sequências repetidas óbvias como 11111111111 ou 00000000000
  if (/^(\d)\1+$/.test(digitos)) return false;
  return true;
}

export function limparTelefone(valor: string): string {
  if (!valor) return "";
  let limpo = valor.replace(/\D/g, "");
  if (limpo.startsWith("55") && limpo.length >= 12) {
    limpo = limpo.slice(2);
  }
  return limpo;
}
