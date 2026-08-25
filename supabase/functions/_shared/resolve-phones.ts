// Leitura da resposta de `POST /api/v1/audiences/resolve_phones`.
//
// ── Por que isto é um arquivo separado ───────────────────────────────────────
//
// Porque errar aqui não dá erro: dá a PESSOA ERRADA. O contato vinculado vira o
// destino de um disparo e o dono de uma conversa de WhatsApp — se o id de um
// paciente for parar em outro, a clínica manda mensagem de tratamento para
// quem não é.
//
// Foi exatamente esse o risco enquanto a resposta trazia só `contact_ids` e
// `nao_encontrados`, duas listas soltas: casar por posição parece funcionar até
// aparecer um não-encontrado no meio, e a partir dali tudo desloca em silêncio.
// O time do CRM confirmou em 25/08 que a ordem nem era garantida (vinha do
// banco, não da lista enviada) e passou a devolver `results` já pareado.
//
// Mora em `_shared/` e não dentro de `crm-contacts/index.ts` porque aquele
// arquivo importa o cliente do Supabase de `esm.sh`, e um import de rede no
// topo do módulo torna o arquivo inteiro impossível de carregar num teste.
// Aqui não há import nenhum — dá para exercitar cada caso de verdade.

/** Uma linha de `results`. `contact_id` nulo = o CRM não conhece esse número. */
export interface LinhaResolvida {
  phone?: string | null;
  /** A forma como o CRM normalizou o número que mandamos. */
  normalized?: string | null;
  contact_id?: string | number | null;
}

/**
 * Telefone → id do contato, a partir do corpo já desembrulhado da resposta.
 *
 * Devolve `null` — e não um mapa vazio — quando `results` não veio. Os dois
 * casos são diferentes e quem chama precisa distingui-los: mapa vazio significa
 * "perguntei e o CRM não conhece nenhum destes"; `null` significa "esta
 * resposta não pode ser pareada, resolva um a um". Se `null` virasse mapa
 * vazio, um CRM na versão antiga faria todo mundo parecer desconhecido e o
 * sistema criaria contato novo para gente que já existe.
 *
 * NÃO existe caminho de reserva lendo `contact_ids`/`nao_encontrados`: era essa
 * leitura que trocava as pessoas, e mantê-la como "melhor que nada" traria o
 * defeito de volta pela porta dos fundos.
 */
export function parearResolvePhones(corpo: unknown): Map<string, string> | null {
  const results = (corpo as any)?.results;
  if (!Array.isArray(results)) return null;

  const mapa = new Map<string, string>();
  for (const linha of results as LinhaResolvida[]) {
    if (!linha || typeof linha !== "object") continue;
    const id = linha.contact_id;
    // `0` e `""` não são id — e `!id` sozinho também descartaria o número 0,
    // que é o comportamento certo aqui: id de contato nunca é zero.
    if (id === null || id === undefined || id === "") continue;

    // Indexado pelas DUAS chaves. Mandamos o telefone já normalizado, mas o
    // CRM devolve também a forma dele em `normalized`, e quem chama pode ter o
    // número em qualquer uma das duas formas na mão.
    if (linha.phone) mapa.set(String(linha.phone), String(id));
    if (linha.normalized) mapa.set(String(linha.normalized), String(id));
  }
  return mapa;
}
