// O motor de regras dos funis.
//
// A etapa de cada card é calculada, não arrastada — e a regra do cálculo é
// configurável pela clínica: ordem, nome, cor, quais etapas existem e os
// prazos. O que NÃO é configurável é o vocabulário de condições: só existe o
// que o sistema sabe responder sobre um paciente ou uma negociação. É o mesmo
// limite que veio junto de "automático", e ele não some por a regra ficar
// visível na tela.
//
// Um motor só para os dois funis. Antes Clientes classificava em SQL e
// Perdidos em TypeScript, com formatos diferentes de regra — duas
// implementações da mesma ideia é como elas divergem.

// ── Vocabulário ─────────────────────────────────────────────────────────────

/** Condições sobre um paciente, para o funil de Clientes. */
export type CondicaoCliente =
  | "nunca_teve_consulta"
  | "tem_orcamento_aberto"
  | "tem_tratamento_pendente"
  | "sem_consulta_ha_dias"
  | "tratamento_pendente_ha_dias"
  /** O "resto": casa sempre. Só a última regra pode usar. */
  | "sempre";

/** Condições sobre uma negociação perdida, para o funil de Perdidos. */
export type CondicaoPerdido =
  | "motivo_definitivo"
  | "respondeu_apos_disparo"
  | "recebeu_disparo_apos_perda"
  | "perdido_ha_menos_de_dias"
  | "sempre";

export type Condicao = CondicaoCliente | CondicaoPerdido;

/** Rótulo e se a condição pede um número. Alimenta a tela de edição. */
export const CONDICOES: Record<Condicao, { rotulo: string; parametro: string | null }> = {
  nunca_teve_consulta: { rotulo: "Nunca teve consulta concluída", parametro: null },
  tem_orcamento_aberto: { rotulo: "Tem orçamento em aberto", parametro: null },
  tem_tratamento_pendente: { rotulo: "Tem tratamento aprovado pendente", parametro: null },
  sem_consulta_ha_dias: { rotulo: "Sem consulta há mais de", parametro: "dias" },
  tratamento_pendente_ha_dias: {
    rotulo: "Tem tratamento pendente e sem consulta há mais de",
    parametro: "dias",
  },
  motivo_definitivo: { rotulo: "Motivo da perda é definitivo", parametro: null },
  respondeu_apos_disparo: { rotulo: "Respondeu depois do disparo", parametro: null },
  recebeu_disparo_apos_perda: { rotulo: "Recebeu disparo depois da perda", parametro: null },
  perdido_ha_menos_de_dias: { rotulo: "Perdido há menos de", parametro: "dias" },
  sempre: { rotulo: "Todos os demais", parametro: null },
};

export interface RegraDeFunil {
  /** Estável, gravado nas linhas e usado pelos gatilhos — renomear a etapa não
   *  pode mudar a identidade dela. */
  id: string;
  nome: string;
  cor: string;
  condicao: Condicao;
  /** Só quando a condição pede. */
  valor?: number;
  /** Regra desligada é pulada — quem cairia nela desce para a seguinte. */
  ativa: boolean;
  explica: string;
}

// ── Padrões ─────────────────────────────────────────────────────────────────
//
// São EXATAMENTE as regras que estavam fixas no CASE e no `etapaDe()`. Clínica
// sem configuração salva usa estas, então a mudança de motor não muda a coluna
// de ninguém.

export const REGRAS_CLIENTES_PADRAO: RegraDeFunil[] = [
  {
    id: "novo",
    nome: "Novo",
    cor: "#8B5CF6",
    condicao: "nunca_teve_consulta",
    ativa: true,
    explica: "Ainda sem consulta concluída",
  },
  {
    id: "orcamento_aberto",
    nome: "Orçamento aberto",
    cor: "#F59E0B",
    condicao: "tem_orcamento_aberto",
    ativa: true,
    explica: "Apresentado e ainda sem resposta",
  },
  {
    // Vem antes de "Em tratamento" de propósito: é o caso que pede alguém
    // ligando, e ficaria escondido junto de quem está fluindo normalmente.
    id: "tratamento_parado",
    nome: "Tratamento parado",
    cor: "#EF4444",
    condicao: "tratamento_pendente_ha_dias",
    valor: 60,
    ativa: true,
    explica: "Aprovado, mas parado há mais de 60 dias",
  },
  {
    id: "em_tratamento",
    nome: "Em tratamento",
    cor: "#0EA5E9",
    condicao: "tem_tratamento_pendente",
    ativa: true,
    explica: "Aprovado e em andamento",
  },
  {
    id: "inativo",
    nome: "Inativo",
    cor: "#94A3B8",
    condicao: "sem_consulta_ha_dias",
    valor: 183,
    ativa: true,
    explica: "Sem consulta há mais de 6 meses",
  },
  {
    id: "manutencao",
    nome: "Manutenção",
    cor: "#22C55E",
    condicao: "sempre",
    ativa: true,
    explica: "Em dia, sem pendência",
  },
];

export const REGRAS_PERDIDOS_PADRAO: RegraDeFunil[] = [
  {
    id: "nao_perturbar",
    nome: "Não perturbar",
    cor: "#EF4444",
    condicao: "motivo_definitivo",
    ativa: true,
    explica: "Motivo definitivo — fora de qualquer disparo",
  },
  {
    id: "respondeu",
    nome: "Respondeu",
    cor: "#22C55E",
    condicao: "respondeu_apos_disparo",
    ativa: true,
    explica: "Reagiu — alguém precisa falar com essa pessoa",
  },
  {
    id: "enviada",
    nome: "Reativação enviada",
    cor: "#0EA5E9",
    condicao: "recebeu_disparo_apos_perda",
    ativa: true,
    explica: "Recebeu disparo e ainda não respondeu",
  },
  {
    id: "esfriando",
    nome: "Esfriando",
    cor: "#94A3B8",
    condicao: "perdido_ha_menos_de_dias",
    valor: 30,
    ativa: true,
    explica: "Perdido há menos de 30 dias",
  },
  {
    id: "pronto",
    nome: "Pronto para reativar",
    cor: "#F59E0B",
    condicao: "sempre",
    ativa: true,
    explica: "Nenhuma tentativa desde a perda",
  },
];

// ── Avaliação ───────────────────────────────────────────────────────────────

/** O que o funil de Clientes sabe sobre um paciente. Espelha as colunas da
 *  view `patient_funnel_signals`. */
export interface SinaisDoCliente {
  teveConsulta: boolean;
  temOrcamentoAberto: boolean;
  temTratamentoPendente: boolean;
  /** `null` para quem nunca foi atendido — que é diferente de "muitos dias". */
  diasSemConsulta: number | null;
}

/** O que o funil de Perdidos sabe sobre uma negociação. */
export interface SinaisDoPerdido {
  motivoDefinitivo: boolean;
  diasDesdePerda: number | null;
  /** Disparo enviado DEPOIS da perda. Anterior não conta: era a campanha que
   *  talvez tenha originado o contato. */
  recebeuDisparoAposPerda: boolean;
  respondeuAposDisparo: boolean;
}

type Sinais = SinaisDoCliente | SinaisDoPerdido;

function casa(regra: RegraDeFunil, s: Sinais): boolean {
  const cliente = s as SinaisDoCliente;
  const perdido = s as SinaisDoPerdido;
  const n = Number(regra.valor ?? 0);

  switch (regra.condicao) {
    case "sempre":
      return true;
    case "nunca_teve_consulta":
      return !cliente.teveConsulta;
    case "tem_orcamento_aberto":
      return !!cliente.temOrcamentoAberto;
    case "tem_tratamento_pendente":
      return !!cliente.temTratamentoPendente;
    case "sem_consulta_ha_dias":
      // Nunca atendido não casa: `null` é ausência de informação, não um número
      // grande. Quem nunca foi atendido é pego pela regra "Novo".
      if (cliente.diasSemConsulta === null || cliente.diasSemConsulta === undefined) return false;
      return cliente.diasSemConsulta > n;
    // Condição composta e EXPLÍCITA, em vez de um caso especial amarrado ao id
    // da regra. Com id, renomear ou reordenar na tela de edição quebraria a
    // regra sem nenhum sinal — e é justamente essa tela que estamos abrindo.
    case "tratamento_pendente_ha_dias":
      if (!cliente.temTratamentoPendente) return false;
      if (cliente.diasSemConsulta === null || cliente.diasSemConsulta === undefined) return false;
      return cliente.diasSemConsulta > n;
    case "motivo_definitivo":
      return !!perdido.motivoDefinitivo;
    case "respondeu_apos_disparo":
      return !!perdido.respondeuAposDisparo;
    case "recebeu_disparo_apos_perda":
      return !!perdido.recebeuDisparoAposPerda;
    case "perdido_ha_menos_de_dias":
      if (perdido.diasDesdePerda === null || perdido.diasDesdePerda === undefined) return false;
      return perdido.diasDesdePerda < n;
    default:
      return false;
  }
}

/**
 * A etapa de um card: a primeira regra ATIVA que casar vence.
 *
 * Devolve o id da regra. Se nenhuma casar — só acontece se a clínica desligar a
 * regra "todos os demais" —, devolve o id da última, para ninguém ficar sem
 * coluna. Card sem coluna é card invisível.
 */
export function classificar(regras: RegraDeFunil[], sinais: Sinais): string {
  const ativas = regras.filter((r) => r.ativa);
  if (!ativas.length) return regras[regras.length - 1]?.id ?? "";
  for (const regra of ativas) if (casa(regra, sinais)) return regra.id;
  return ativas[ativas.length - 1].id;
}

/** Regras salvas, ou as padrão. Um formato inválido cai no padrão em vez de
 *  quebrar o quadro — funil que não abre é pior que funil com a regra de
 *  fábrica. */
export function regrasOuPadrao(salvas: unknown, padrao: RegraDeFunil[]): RegraDeFunil[] {
  if (!Array.isArray(salvas) || !salvas.length) return padrao;
  const validas = salvas.filter(
    (r): r is RegraDeFunil =>
      !!r && typeof r === "object" && typeof (r as any).id === "string" && (r as any).condicao in CONDICOES,
  );
  return validas.length ? validas : padrao;
}
