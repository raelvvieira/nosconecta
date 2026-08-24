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
 * entrega — confirmado pelo time do CRM em 15/08.
 *
 * A decisão é pelo COMPRIMENTO, e não por "já começa com 55". Um número
 * brasileiro tem 12 ou 13 dígitos com o país (55 + DDD + 8 ou 9) e 10 ou 11
 * sem ele. Logo, 10 ou 11 dígitos significa que falta o país — SEMPRE,
 * inclusive quando começa com 55, porque aí o 55 é o DDD (Santa Maria,
 * Uruguaiana, Santana do Livramento) e não o código do Brasil.
 *
 * Decidir pelo prefixo, como esta função fazia antes, não distingue os dois
 * casos: todo número de DDD 55 salvo sem o país era pulado calado e continuava
 * sem entregar. É o mesmo teste que `toE164BR` (em
 * `supabase/functions/_shared/phone.ts`) já fazia certo desde sempre.
 *
 * Número curto demais para ter DDD é devolvido intocado: sem DDD não há como
 * adivinhar a região, e inventar um "55" na frente só disfarçaria de válido
 * algo que não é.
 */
export function normalizeBrazilianPhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}
