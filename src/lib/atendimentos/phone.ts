// O número é guardado como dígitos puros (formato exigido pelo corpo de
// POST /api/v1/evolution/connections, ex.: "5548984195309"). Isso é ruim de
// ler na tela, então formatamos só na exibição.
export function formatWhatsappNumber(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  // 55 + DDD (2) + número (8 ou 9 dígitos)
  const match = digits.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  if (!match) return digits ? `+${digits}` : "";
  return `+55 (${match[1]}) ${match[2]}-${match[3]}`;
}
