/**
 * A matemática do NÓS Club: de quantas indicações sai qual nível.
 *
 * ── Por que é um módulo puro ──────────────────────────────────────────────
 *
 * Porque é a conta que decide dinheiro. Um nível a mais libera R$ 1.000 em
 * créditos, e um a menos deixa de liberar — e o erro não aparece na tela de
 * ninguém: aparece numa paciente que indicou dez pessoas e continua vendo
 * "Premium". Aqui dá para exercitar os casos que doem (indicação cancelada,
 * régua reordenada, empate) sem banco e sem liberar crédito nenhum.
 *
 * ── Por que o nível não é guardado ────────────────────────────────────────
 *
 * Nível é consequência da contagem. Guardar os dois cria duas verdades; o dia
 * em que elas discordarem ninguém saberá qual vale. O que é guardado é o
 * EXTRATO — o crédito que já foi liberado —, e é ele que impede o mesmo nível
 * de pagar duas vezes.
 */

export interface NivelDoClub {
  id: string;
  nome: string;
  /** Quantas indicações confirmadas este nível exige. */
  indicacoes: number;
  /** Quanto ele desbloqueia, uma vez. */
  credito: number;
}

export interface SituacaoNoClub {
  /** O nível atual. `null` para quem ainda não chegou ao primeiro. */
  nivel: NivelDoClub | null;
  /** O próximo, quando existe. `null` para quem já está no topo. */
  proximo: NivelDoClub | null;
  /** Quantas faltam para o próximo. Zero quando já está no topo. */
  faltam: number;
  /** De 0 a 1, para a barra de progresso. Cheia no topo. */
  progresso: number;
  confirmadas: number;
}

/** Em ordem de exigência, e sem régua quebrada: nível sem nome ou com
 *  exigência não positiva não entra na conta. */
export function reguaOrdenada(niveis: readonly NivelDoClub[]): NivelDoClub[] {
  return [...niveis]
    .filter((n) => n && String(n.nome ?? "").trim() && Number(n.indicacoes) > 0)
    .sort((a, b) => a.indicacoes - b.indicacoes);
}

/**
 * Onde a pessoa está, dadas as indicações confirmadas.
 *
 * O nível é o MAIS ALTO cuja exigência ela já cumpriu — e não "o próximo que
 * ela alcançou": quem confirma cinco indicações de uma vez (importação, ajuste
 * manual) chega direto ao Premium, sem passar devagar pelo Start.
 */
export function situacaoNoClub(
  confirmadas: number,
  niveis: readonly NivelDoClub[],
): SituacaoNoClub {
  const regua = reguaOrdenada(niveis);
  const quantas = Math.max(0, Math.floor(confirmadas || 0));

  const alcancados = regua.filter((n) => quantas >= n.indicacoes);
  const nivel = alcancados.length ? alcancados[alcancados.length - 1] : null;
  const proximo = regua.find((n) => n.indicacoes > quantas) ?? null;

  if (!proximo) {
    return { nivel, proximo: null, faltam: 0, progresso: 1, confirmadas: quantas };
  }

  // A barra anda DENTRO da faixa atual, não desde o zero: de Gold (10) para
  // Diamond (20), onze indicações são 10% do caminho, não 55%. Mostrar 55%
  // faria a pessoa achar que está quase lá quando faltam nove.
  const piso = nivel?.indicacoes ?? 0;
  const vao = Math.max(1, proximo.indicacoes - piso);
  return {
    nivel,
    proximo,
    faltam: proximo.indicacoes - quantas,
    progresso: Math.min(1, Math.max(0, (quantas - piso) / vao)),
    confirmadas: quantas,
  };
}

/**
 * Os níveis que a pessoa já alcançou e ainda não receberam crédito.
 *
 * É esta lista que vira lançamento no extrato quando uma indicação é
 * confirmada. Ela existe por causa de dois casos que acontecem de verdade:
 *
 *   A pessoa pula níveis — cinco confirmações de uma vez alcançam Start e
 *   Premium no mesmo instante, e os dois créditos são devidos.
 *
 *   A pessoa volta a um nível — chegou ao Gold, uma indicação foi cancelada,
 *   depois confirmou outra. O Gold não pode pagar duas vezes, e quem lembra
 *   disso é o extrato (`jaPagos`), nunca a contagem.
 */
export function niveisAPagar(
  confirmadas: number,
  niveis: readonly NivelDoClub[],
  jaPagos: readonly string[],
): NivelDoClub[] {
  const pagos = new Set(jaPagos);
  return reguaOrdenada(niveis).filter(
    (n) => confirmadas >= n.indicacoes && !pagos.has(n.id) && n.credito > 0,
  );
}

/** O saldo é a soma do extrato. Não existe campo de saldo — ver o comentário
 *  da migration do Club. */
export function saldoDoExtrato(lancamentos: readonly { valor: number }[]): number {
  return lancamentos.reduce((total, l) => total + Number(l.valor || 0), 0);
}
