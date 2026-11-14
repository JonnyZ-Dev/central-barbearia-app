// Utilitários de Máscara e Validação à prova de erros

export function formatarTelefoneBR(valor: string): string {
  if (!valor) return "";
  // Remover tudo que não for número
  const apenasNumeros = valor.replace(/\D/g, "").slice(0, 11);

  if (apenasNumeros.length === 0) return "";
  if (apenasNumeros.length <= 2) return `(${apenasNumeros}`;
  if (apenasNumeros.length <= 6) return `(${apenasNumeros.slice(0, 2)}) ${apenasNumeros.slice(2)}`;
  if (apenasNumeros.length <= 10) {
    return `(${apenasNumeros.slice(0, 2)}) ${apenasNumeros.slice(2, 6)}-${apenasNumeros.slice(6)}`;
  }
  return `(${apenasNumeros.slice(0, 2)}) ${apenasNumeros.slice(2, 7)}-${apenasNumeros.slice(7, 11)}`;
}

export function validarTelefoneBR(valor: string): boolean {
  if (!valor) return false;
  const digitos = valor.replace(/\D/g, "");
  // Telefone celular no Brasil tem 11 dígitos (DDD + 9 dígitos), fixo tem 10 (DDD + 8 dígitos)
  if (digitos.length !== 10 && digitos.length !== 11) return false;
  // Bloquear sequências repetidas óbvias como 11111111111 ou 00000000000
  if (/^(\d)\1+$/.test(digitos)) return false;
  return true;
}

export function limparTelefone(valor: string): string {
  return valor.replace(/\D/g, "");
}
