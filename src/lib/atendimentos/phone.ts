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

/**
 * O número está completo o bastante para servir?
 *
 * Existe porque é ele que decide se a conversão vai casar: telefone é o único
 * identificador que este sistema tem da maioria dos pacientes, e um número
 * pela metade é aceito pela Meta, some no hash e nunca vira Lead atribuído.
 *
 * Doze ou treze dígitos depois de normalizado — 55 + DDD + 8 ou 9. Qualquer
 * outra coisa é número incompleto, não um número de outro formato: o cadastro
 * inteiro é brasileiro.
 */
export function telefoneBrasileiroValido(raw: string | null | undefined): boolean {
  if (!raw?.trim()) return false;
  const d = normalizeBrazilianPhone(raw);
  return d.length === 12 || d.length === 13;
}

/**
 * As formas em que o MESMO número aparece — com e sem o nono dígito.
 *
 * ── O problema que isto resolve ─────────────────────────────────────────
 *
 * A ficha do paciente e o WhatsApp guardam o mesmo celular de jeitos
 * diferentes. Medido nesta base:
 *
 *     ficha:    5551993967887   (13 dígitos, com o 9)
 *     WhatsApp:  555193967887   (12 dígitos, sem o 9)
 *
 * Comparar literalmente falha, e falha em silêncio: o paciente simplesmente
 * "não tem contato no WhatsApp". Dos 23 pacientes com agendamento, casar
 * literalmente achava 3; tolerando o nono dígito acha 10.
 *
 * A causa é histórica — os celulares brasileiros ganharam um 9 na frente, e o
 * WhatsApp às vezes reporta o identificador antigo.
 *
 * ── Por que devolver as duas formas, e não uma chave curta ──────────────
 *
 * A tentação é cortar para "DDD + 8 últimos" e comparar por aí. Funciona, mas
 * obriga a calcular isso dos DOIS lados dentro da consulta, o que impede o uso
 * do índice `idx_wa_contacts_fone` e vira varredura da tabela inteira.
 *
 * Devolvendo as duas formas completas, a busca é um `IN` com dois valores
 * exatos — índice, e nada de varredura.
 *
 * ── O 9 só entra em celular ─────────────────────────────────────────────
 *
 * Um fixo também tem 8 dígitos. Acrescentar o 9 a ele geraria um número que
 * não existe; não casaria com nada, mas é lixo na consulta. Celular antigo
 * começa com 6, 7, 8 ou 9 — fixo começa com 2, 3, 4 ou 5.
 */
export function variantesDoNumero(raw: string | null | undefined): string[] {
  const completo = normalizeBrazilianPhone(String(raw ?? ""));
  if (!completo.startsWith("55") || completo.length < 12) return completo ? [completo] : [];

  const ddd = completo.slice(2, 4);
  const resto = completo.slice(4);
  const formas = new Set<string>([completo]);

  if (resto.length === 9 && resto.startsWith("9")) {
    // Com o 9 → acrescenta a forma sem ele.
    formas.add(`55${ddd}${resto.slice(1)}`);
  } else if (resto.length === 8 && /^[6-9]/.test(resto)) {
    // Celular antigo, sem o 9 → acrescenta a forma com ele.
    formas.add(`55${ddd}9${resto}`);
  }

  return [...formas];
}
