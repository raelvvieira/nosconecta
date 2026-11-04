// Como os números do painel de Atendimento aparecem na tela.

/** "42 s", "7 min", "1 h 20" — o tempo de resposta lido de relance. */
export function duracao(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const resto = min % 60;
  return resto ? `${h} h ${String(resto).padStart(2, "0")}` : `${h} h`;
}

/** Minutos de espera: "12 min", "2 h 05". */
export function esperaEmMin(min: number | null | undefined): string {
  return duracao(min === null || min === undefined ? null : min * 60_000);
}

export const DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export const DIAS_LONGOS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
