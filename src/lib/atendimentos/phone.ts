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

/**
 * Diferente de `formatWhatsappNumber` (só exibição, nunca corrige nada):
 * esta normaliza de verdade pra gravar — completa o "55" quando falta.
 * Existe porque um telefone de paciente sem o código do país (ex.:
 * "51993351821", DDD 51 sem o 55 na frente) faz o CRM interpretar "51" como
 * código de outro país (Peru) e criar um contato pro qual o WhatsApp nunca
 * entrega — confirmado pelo time do CRM em 15/08. Mesma lógica que já
 * existia só para o número de conexão do WhatsApp da clínica
 * (`crm-whatsapp/normalizeBrazilianPhone`), estendida pra todo telefone de
 * paciente também.
 */
export function normalizeBrazilianPhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (!digits.startsWith("55")) digits = `55${digits}`;
  return digits;
}
