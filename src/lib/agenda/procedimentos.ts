/**
 * Vários procedimentos num agendamento.
 *
 * ── Por que módulo puro ──────────────────────────────────────────────────
 *
 * Escolher procedimentos decide três coisas de uma vez: o que aparece na
 * agenda, quanto a sessão vale e quanto ela dura. Errar qualquer uma não
 * levanta exceção — produz um horário que atropela o próximo paciente, ou um
 * valor que ninguém confere até a hora de cobrar.
 */

export interface ProcedimentoDoAgendamento {
  /** Referência ao catálogo. Nulo quando o procedimento foi apagado de lá. */
  procedureId: string | null;
  name: string;
  /** Preço de tabela no momento do agendamento. */
  price: number;
  /** Em minutos. */
  duration: number;
}

/**
 * O nome que vai para a coluna `procedure_name` e, com ela, para o card do
 * calendário, o lembrete de WhatsApp e as automações.
 *
 * ── Por que a coluna continua existindo ─────────────────────────────────
 *
 * `procedure_name` é lida em vinte arquivos, cinco deles Edge Functions.
 * Mantê-la como RESUMO — os nomes unidos — faz todos continuarem funcionando
 * sem uma linha de mudança, e o lembrete passa a dizer "sua consulta de Limpeza
 * + Restauração" sozinho.
 *
 * ── Por que " + " e não "e mais 2" ──────────────────────────────────────
 *
 * Um resumo que esconde itens mente para quem lê a mensagem no WhatsApp. Os
 * lugares apertados (o card do calendário) já cortam com reticências por CSS —
 * cortar é problema de largura, não de conteúdo.
 */
export function nomeDosProcedimentos(
  procedimentos: ProcedimentoDoAgendamento[],
  padrao = "Consulta",
): string {
  const nomes = procedimentos.map((p) => p.name?.trim()).filter(Boolean);
  return nomes.length ? nomes.join(" + ") : padrao;
}

/** Quanto a sessão vale — o que vira `expected_revenue`. */
export function valorDosProcedimentos(procedimentos: ProcedimentoDoAgendamento[]): number {
  const centavos = procedimentos.reduce((soma, p) => soma + Math.round((p.price || 0) * 100), 0);
  return centavos / 100;
}

/**
 * Quanto a sessão dura, em minutos.
 *
 * Zero quando não há procedimento: quem chama decide o que fazer com isso —
 * o formulário mantém a duração que já estava, em vez de encolher o
 * agendamento para nada.
 */
export function duracaoDosProcedimentos(procedimentos: ProcedimentoDoAgendamento[]): number {
  return procedimentos.reduce((soma, p) => soma + Math.max(0, Math.trunc(p.duration || 0)), 0);
}

/**
 * "30min", "1h", "1h30" — a duração como se fala, não como se calcula.
 *
 * "90min" está certo e ninguém pensa assim; quem agenda pensa em "uma hora e
 * meia". O zero à esquerda dos minutos ("1h05") existe para a coluna não
 * dançar entre "1h5" e "1h15" numa lista.
 */
export function duracaoEmTexto(minutos: number): string {
  const m = Math.max(0, Math.trunc(minutos));
  if (m === 0) return "0min";
  const horas = Math.floor(m / 60);
  const resto = m % 60;
  if (horas === 0) return `${resto}min`;
  if (resto === 0) return `${horas}h`;
  return `${horas}h${String(resto).padStart(2, "0")}`;
}

/**
 * Tira repetidos pelo id do catálogo.
 *
 * Duas limpezas no mesmo agendamento quase sempre é clique duplo, não intenção
 * — e aceitar dobraria o valor e a duração em silêncio. Procedimento sem id
 * (apagado do catálogo, ou digitado livre) não é agrupado: sem identidade, não
 * há como afirmar que são o mesmo.
 */
export function semRepetidos(
  procedimentos: ProcedimentoDoAgendamento[],
): ProcedimentoDoAgendamento[] {
  const vistos = new Set<string>();
  return procedimentos.filter((p) => {
    if (!p.procedureId) return true;
    if (vistos.has(p.procedureId)) return false;
    vistos.add(p.procedureId);
    return true;
  });
}

/** O resumo que o cabeçalho da seção mostra: "R$ 480,00 · 1h30". */
export function resumoDosProcedimentos(procedimentos: ProcedimentoDoAgendamento[]): {
  nome: string;
  valor: number;
  duracao: number;
  duracaoTexto: string;
} {
  const duracao = duracaoDosProcedimentos(procedimentos);
  return {
    nome: nomeDosProcedimentos(procedimentos),
    valor: valorDosProcedimentos(procedimentos),
    duracao,
    duracaoTexto: duracaoEmTexto(duracao),
  };
}
