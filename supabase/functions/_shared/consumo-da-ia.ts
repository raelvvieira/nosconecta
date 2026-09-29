// Quanto a IA consumiu, e quanto isso custa.
//
// ── Por que isto existe ────────────────────────────────────────────────
//
// A OpenAI devolve, em toda resposta, quantos tokens a chamada gastou. Até
// agora esse número era lido e jogado fora: `chamarModelo` pegava só o texto.
// A clínica não tinha como saber o que a Luna custa sem abrir o painel da
// OpenAI, e lá o valor vem sem separar o que é resposta ao paciente, o que é
// aprendizado e o que é card de sugestão no chat.
//
// ── A decisão que molda este arquivo: o preço NÃO é congelado ──────────
//
// O normal, num livro de custo, é congelar o preço no instante do movimento —
// é o que `estoque_movimentos` faria. Aqui é o contrário, de propósito.
//
// O modelo desta clínica se chama `gpt-6-luna`. Não é um modelo de catálogo
// público, então NÃO existe preço que eu possa escrever aqui e garantir. O
// preço vai ter de ser digitado por quem lê a fatura — e vai ser digitado
// DEPOIS de as chamadas já terem acontecido.
//
// Se o custo fosse congelado na gravação, tudo que rodou antes de alguém
// digitar o preço ficaria valendo zero para sempre, e a única saída seria uma
// migração de dados. Guardando só os TOKENS e fazendo a conta na leitura,
// cadastrar o preço hoje acerta o mês inteiro que já passou.
//
// O que se perde: mudar o preço reescreve o histórico. Para uma clínica que
// quer saber quanto a IA custa, acertar o passado vale mais que preservá-lo —
// e a tela diz de qual preço o número saiu.
//
// Consequência para este arquivo: ele grava TOKENS e mais nada. A tabela de
// preços, a conta em dólar e a conversão em reais são leitura, rodam no
// servidor do app e moram em `src/lib/agente-ia/consumo.ts`. Não há cópia da
// mesma conta nos dois runtimes.

/** O que uma chamada gastou. Vem do campo `usage` da resposta da OpenAI. */
export interface UsoDoModelo {
  modelo: string;
  /** Tokens de entrada COBRADOS como novos (já sem os que vieram do cache). */
  entrada: number;
  /** Tokens de entrada servidos do cache. A OpenAI cobra bem menos por eles, e
   *  eles são a maior parte aqui: a instrução da Luna passa de 40 mil letras e
   *  vai inteira em toda chamada. Separá-los é o que permite ver isso. */
  cache: number;
  /** Tokens gerados na resposta. */
  saida: number;
}

/**
 * O `usage` da resposta, lido com cuidado.
 *
 * Duas armadilhas, e as duas já aconteceram com esta API:
 *
 * **`prompt_tokens` INCLUI os do cache.** Somar `prompt_tokens` com
 * `cached_tokens` conta a mesma entrada duas vezes. Aqui a entrada devolvida
 * já vem líquida: o que sobrou depois de tirar o cache.
 *
 * **Campo ausente não é zero.** Um modelo sem cache não manda
 * `prompt_tokens_details`, e uma resposta de erro não manda `usage` nenhum.
 * Sem tratamento, "não veio" viraria "não gastou", e o contador mostraria
 * zero para uma clínica que está pagando.
 */
export function usoDaResposta(corpo: unknown, modelo: string): UsoDoModelo | null {
  const u = (corpo as { usage?: Record<string, unknown> } | null)?.usage;
  if (!u || typeof u !== "object") return null;

  const numero = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  };

  const detalhes = u.prompt_tokens_details as { cached_tokens?: unknown } | undefined;
  const cache = numero(detalhes?.cached_tokens);
  const promptTotal = numero(u.prompt_tokens ?? u.input_tokens);
  const saida = numero(u.completion_tokens ?? u.output_tokens);

  // `Math.max(0, ...)`: se a API um dia mandar cache maior que o total, a
  // subtração daria entrada negativa e o custo cairia. Zero é o pior caso
  // honesto.
  return { modelo, entrada: Math.max(0, promptTotal - cache), cache, saida };
}

/** Para que serviu a chamada. É o que permite à tela dizer QUEM gasta. */
export type ParaQue = "resposta" | "sugestao" | "aprendizado" | "licao" | "leitura" | "teste";

/**
 * Grava o consumo de uma chamada.
 *
 * **Nunca levanta.** Esta função roda no meio de um atendimento: uma falha ao
 * gravar contabilidade não pode engolir a resposta que o paciente está
 * esperando. Falhou, fica o aviso no log e o número do mês sai um pouco menor
 * — que é infinitamente melhor que a pessoa não ser respondida.
 */
export async function anotarConsumo(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  ownerId: string,
  para: ParaQue,
  uso: UsoDoModelo | null,
  sessionId?: string | null,
): Promise<void> {
  if (!uso) return;
  // Chamada que não gastou nada não vira linha: seria ruído numa tabela que só
  // existe para somar.
  if (!uso.entrada && !uso.cache && !uso.saida) return;

  await supabase
    .from("ai_uso")
    .insert({
      owner_id: ownerId,
      modelo: uso.modelo,
      para,
      session_id: sessionId ?? null,
      tokens_entrada: uso.entrada,
      tokens_cache: uso.cache,
      tokens_saida: uso.saida,
    })
    .then(undefined, (e: unknown) => console.error("[consumo-da-ia] não deu para gravar:", e));
}
