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
  | "primeira_consulta"
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

/**
 * Condições sobre quem chamou no WhatsApp, para o funil de Leads.
 *
 * A clínica definiu a fronteira em 14/10: lead é quem chamou e ainda não tem
 * atendimento CONFIRMADO. Agendar não basta — "pode ter agendado, mas não
 * confirmou que vinha, não veio". Quem confirma é o botão "Confirmar
 * atendimento realizado", na agenda.
 */
export type CondicaoLead =
  | "agendou_sem_confirmar"
  /** A agenda: horário de hoje em diante. */
  | "tem_horario_marcado"
  /** A agenda: o horário passou e não foi confirmado como realizado. */
  | "nao_compareceu"
  /** A conversa (Inteligência do Lead). Cumulativas: "recebeu proposta" vale
   *  também para quem já recebeu horários, para que desligar uma etapa mande
   *  o lead para a anterior, e não para o fim do funil. */
  | "recebeu_horarios"
  | "recebeu_proposta"
  | "mostrou_interesse"
  | "falou_ha_menos_de_dias"
  | "calado_ha_mais_de_dias"
  | "sempre";

export type Condicao = CondicaoCliente | CondicaoPerdido | CondicaoLead;

/** Rótulo e se a condição pede um número. Alimenta a tela de edição. */
export const CONDICOES: Record<Condicao, { rotulo: string; parametro: string | null }> = {
  primeira_consulta: { rotulo: "Teve só o primeiro atendimento", parametro: null },
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
  agendou_sem_confirmar: { rotulo: "Agendou e falta confirmar", parametro: null },
  falou_ha_menos_de_dias: { rotulo: "Falou há menos de", parametro: "dias" },
  calado_ha_mais_de_dias: { rotulo: "Calado há mais de", parametro: "dias" },
  tem_horario_marcado: { rotulo: "Tem horário marcado (de hoje em diante)", parametro: null },
  nao_compareceu: { rotulo: "O horário passou e não foi confirmado", parametro: null },
  recebeu_horarios: { rotulo: "A clínica ofereceu horários", parametro: null },
  recebeu_proposta: { rotulo: "A clínica falou o valor", parametro: null },
  mostrou_interesse: { rotulo: "Disse o procedimento que quer", parametro: null },
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
    // ⚠️ Esta regra foi INVERTIDA em 14/10, e é a mudança mais fácil de
    // entender errado deste arquivo.
    //
    // Antes, "Novo" era `nunca_teve_consulta` — ou seja, ficha sem atendimento.
    // Com a importação antiga, isso punha 3.227 das 3.268 fichas numa coluna
    // chamada "Novo", que ninguém nunca abriria: a maioria é cadastro herdado
    // de gente que nunca falou com a clínica.
    //
    // A clínica redefiniu: cliente é quem teve atendimento CONFIRMADO, e
    // "Novo" é quem acabou de confirmar o primeiro. Quem ainda não confirmou
    // não é cliente nenhum — é lead, e vive no funil de Leads.
    id: "novo",
    nome: "Novo",
    cor: "#8B5CF6",
    condicao: "primeira_consulta",
    ativa: true,
    explica: "Veio uma vez — acabou de virar cliente",
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

/**
 * O funil de Leads, desde 30/10: o caminho da conversa e o que a agenda diz.
 *
 * A ordem aqui é a da CLASSIFICAÇÃO (a primeira que casar vence), do mais
 * avançado para o começo. O quadro mostra as colunas na ordem inversa, que é
 * a do caminho: Novo Contato → Interessado → Proposta → Horário Oferecido →
 * Agendado → Não Compareceu. Ver `colunasDosLeads`.
 *
 * As três do meio vêm da leitura das conversas (`inteligencia-do-lead`); as
 * duas do fim, só da agenda. Quem sumiu NÃO muda de coluna: fica onde parou,
 * marcado como parado.
 */
export const REGRAS_LEADS_PADRAO: RegraDeFunil[] = [
  {
    id: "nao_compareceu",
    nome: "Não Compareceu",
    cor: "#EF4444",
    condicao: "nao_compareceu",
    ativa: true,
    explica: "O horário passou e o atendimento não foi confirmado",
  },
  {
    id: "agendado",
    nome: "Agendado",
    cor: "#22C55E",
    condicao: "tem_horario_marcado",
    ativa: true,
    explica: "Tem horário marcado de hoje em diante",
  },
  {
    id: "horario_oferecido",
    nome: "Horário Oferecido",
    cor: "#F59E0B",
    condicao: "recebeu_horarios",
    ativa: true,
    explica: "Recebeu horários e ainda não marcou",
  },
  {
    id: "proposta",
    nome: "Proposta",
    cor: "#8B5CF6",
    condicao: "recebeu_proposta",
    ativa: true,
    explica: "A clínica falou o valor",
  },
  {
    id: "interessado",
    nome: "Interessado",
    cor: "#0EA5E9",
    condicao: "mostrou_interesse",
    ativa: true,
    explica: "Disse o procedimento que quer",
  },
  {
    id: "novo_contato",
    nome: "Novo Contato",
    cor: "#94A3B8",
    condicao: "sempre",
    ativa: true,
    explica: "Chamou e ainda não disse o que quer",
  },
];

/** As colunas do quadro de Leads, na ordem do caminho (a inversa da
 *  classificação). Só as ativas. */
export function colunasDosLeads(regras: RegraDeFunil[]): RegraDeFunil[] {
  return [...regras].filter((r) => r.ativa).reverse();
}

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
  /** Quantos atendimentos confirmados. Um só = acabou de virar cliente. */
  consultasConcluidas: number;
  temOrcamentoAberto: boolean;
  temTratamentoPendente: boolean;
  /** `null` para quem nunca foi atendido — que é diferente de "muitos dias". */
  diasSemConsulta: number | null;
}

/** O que o funil de Leads sabe sobre quem chamou. */
export interface SinaisDoLead {
  /** Tem horário na agenda, mas nenhum confirmado como realizado. */
  temAgendamento: boolean;
  /** O que a agenda diz: horário à frente, ou horário que passou sem vir. */
  situacaoNaAgenda?: "agendado" | "nao_compareceu" | null;
  /** O ponto da conversa, lido pela Inteligência do Lead. */
  etapaDaConversa?: "novo" | "interessado" | "proposta" | "horario_oferecido" | null;
  /** `null` quando não há mensagem datada — que é diferente de "há muito". */
  diasEmSilencio: number | null;
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

type Sinais = SinaisDoCliente | SinaisDoPerdido | SinaisDoLead;

function casa(regra: RegraDeFunil, s: Sinais): boolean {
  const cliente = s as SinaisDoCliente;
  const perdido = s as SinaisDoPerdido;
  const lead = s as SinaisDoLead;
  const n = Number(regra.valor ?? 0);

  switch (regra.condicao) {
    case "sempre":
      return true;
    case "primeira_consulta":
      return Number(cliente.consultasConcluidas ?? 0) === 1;
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
    case "agendou_sem_confirmar":
      return !!lead.temAgendamento;
    case "tem_horario_marcado":
      return lead.situacaoNaAgenda === "agendado";
    case "nao_compareceu":
      return lead.situacaoNaAgenda === "nao_compareceu";
    case "recebeu_horarios":
      return lead.etapaDaConversa === "horario_oferecido";
    case "recebeu_proposta":
      return lead.etapaDaConversa === "proposta" || lead.etapaDaConversa === "horario_oferecido";
    case "mostrou_interesse":
      return (
        lead.etapaDaConversa === "interessado" ||
        lead.etapaDaConversa === "proposta" ||
        lead.etapaDaConversa === "horario_oferecido"
      );
    case "falou_ha_menos_de_dias":
      // Sem data de mensagem não casa: `null` é ausência de informação, não um
      // número pequeno. Quem não tem data cai na última regra, que é o resto.
      if (lead.diasEmSilencio === null || lead.diasEmSilencio === undefined) return false;
      return lead.diasEmSilencio <= n;
    case "calado_ha_mais_de_dias":
      if (lead.diasEmSilencio === null || lead.diasEmSilencio === undefined) return false;
      return lead.diasEmSilencio > n;
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
      !!r &&
      typeof r === "object" &&
      typeof (r as any).id === "string" &&
      (r as any).condicao in CONDICOES,
  );
  return validas.length ? validas : padrao;
}
