// Ler uma tabela inteira do PostgREST, sem mentir sobre o que veio.
//
// ── O erro que isto existe para não cometer ─────────────────────────────
//
// O PostgREST devolve no máximo mil linhas por requisição. Pedir "tudo" sem
// paginar **não dá erro** — devolve as mil primeiras e cala. `wa_messages` tem
// 5.251 linhas e `patients` tem 3.236: um `select` direto traria um quinto do
// espelho e três quintos dos pacientes, e tudo pareceria funcionar.
//
// Já custou caro neste projeto antes, e o comentário em
// `src/lib/atendimentos/contacts.functions.ts` conta a história do lado do
// navegador. Esta é a versão para as Edge Functions.
//
// ── Por que a ordem é obrigatória ───────────────────────────────────────
//
// `.range()` é um recorte por posição, e posição só quer dizer alguma coisa se
// houver ordem. Sem `order`, o Postgres pode devolver as linhas em ordens
// diferentes entre uma página e a seguinte — e aí a paginação repete umas
// linhas e pula outras, calada. Por isso `ordenarPor` não é opcional, e por
// isso ele deve ser único ou quase (uma chave primária, ou um par
// data + id).

const POR_PAGINA = 1000;

/**
 * Teto de segurança: 200 mil linhas.
 *
 * Não é um limite de produto, é um freio. Um filtro escrito errado que casa
 * com a tabela inteira deve parar de rodar em algum momento, e não consumir a
 * Edge Function até o tempo acabar.
 */
const MAX_PAGINAS = 200;

/**
 * Lê tudo o que o filtro casar.
 *
 * `montarConsulta` recebe a consulta já com `.range()` aplicado — o chamador
 * monta o `select` e os filtros, e esta função cuida só da paginação.
 *
 * Erro **sobe**. Erro de leitura tratado como "acabou" transformaria uma falha
 * de rede em "a clínica não tem conversa nenhuma", e quem estivesse lendo o
 * resultado não teria como saber a diferença.
 */
export async function lerTudo<T>(
  montarConsulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  rotulo: string,
): Promise<T[]> {
  const linhas: T[] = [];

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const de = pagina * POR_PAGINA;
    const { data, error } = await montarConsulta(de, de + POR_PAGINA - 1);
    if (error) throw new Error(`${rotulo}: ${error.message}`);

    const lote = data ?? [];
    linhas.push(...lote);

    // Página incompleta é o fim de verdade. Parar por contagem esperada seria
    // um palpite; esta é a única condição que o banco confirma.
    if (lote.length < POR_PAGINA) return linhas;
  }

  // Chegar aqui significa que o freio pegou. Avisa alto: o resultado está
  // truncado e quem chamou acha que é a tabela inteira.
  console.warn(`[ler-paginado] ${rotulo}: parou em ${MAX_PAGINAS} páginas — resultado truncado.`);
  return linhas;
}
