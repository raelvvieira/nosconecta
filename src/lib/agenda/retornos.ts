// Retornos a agendar: a lista de quem a recepção precisa chamar para voltar.
//
// Regras puras (sem banco, sem tela) para a lista ficar previsível: ordem por
// data, urgência (atrasado / esta semana / este mês / depois) e agrupamento por
// mês. O que não pode acontecer: um retorno atrasado ficar escondido no fim da
// lista, dois retornos do mesmo dia trocarem de lugar a cada abertura, ou a data
// ser lida com fuso e cair um dia antes.

export type RetornoAAgendar = {
  id: string;
  patient_id: string | null;
  patient_name: string;
  procedure_name: string | null;
  professional_name: string | null;
  data_prevista: string; // AAAA-MM-DD
  observacao: string | null;
};

export type Urgencia = "atrasado" | "semana" | "mes" | "depois";

/** Dias entre duas datas AAAA-MM-DD, sem fuso (meio-dia UTC evita virada de dia). */
export function diasEntre(de: string, ate: string): number {
  const a = Date.parse(`${de}T12:00:00Z`);
  const b = Date.parse(`${ate}T12:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

export function urgenciaDoRetorno(dataPrevista: string, hoje: string): Urgencia {
  const dias = diasEntre(hoje, dataPrevista);
  if (dias < 0) return "atrasado";
  if (dias <= 7) return "semana";
  if (dias <= 31) return "mes";
  return "depois";
}

/** Mais antigo primeiro (os atrasados sobem); empate pelo nome, depois pelo id. */
export function ordenarRetornos<
  T extends Pick<RetornoAAgendar, "data_prevista" | "patient_name" | "id">,
>(lista: T[]): T[] {
  return [...lista].sort(
    (x, y) =>
      x.data_prevista.localeCompare(y.data_prevista) ||
      x.patient_name.localeCompare(y.patient_name, "pt-BR") ||
      x.id.localeCompare(y.id),
  );
}

export type GrupoDeRetornos<T> = { chave: string; titulo: string; itens: T[] };

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** "Atrasados" primeiro, depois um grupo por mês ("Dezembro de 2026"). */
export function agruparRetornos<T extends RetornoAAgendar>(
  lista: T[],
  hoje: string,
): GrupoDeRetornos<T>[] {
  const grupos: GrupoDeRetornos<T>[] = [];
  for (const item of ordenarRetornos(lista)) {
    const atrasado = item.data_prevista < hoje;
    const chave = atrasado ? "atrasados" : item.data_prevista.slice(0, 7);
    let g = grupos[grupos.length - 1];
    if (!g || g.chave !== chave) {
      const [ano, mes] = item.data_prevista.split("-");
      const titulo = atrasado
        ? "Atrasados"
        : `${MESES[Number(mes) - 1] ?? mes} de ${ano}`.replace(/^./, (c) => c.toUpperCase());
      g = { chave, titulo, itens: [] };
      grupos.push(g);
    }
    g.itens.push(item);
  }
  return grupos;
}

/** "Hoje", "amanhã", "em 12 dias", "há 3 dias" — o que a recepção lê de relance. */
export function prazoPorExtenso(dataPrevista: string, hoje: string): string {
  const d = diasEntre(hoje, dataPrevista);
  if (d === 0) return "hoje";
  if (d === 1) return "amanhã";
  if (d === -1) return "ontem";
  if (d < 0) return `há ${-d} dias`;
  if (d < 60) return `em ${d} dias`;
  return `em ${Math.round(d / 30)} meses`;
}

/** Soma meses mantendo o dia (31/01 + 1 mês = 28/02), em AAAA-MM-DD. */
export function somarMeses(data: string, meses: number): string {
  const [a, m, d] = data.split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1, 12));
  const ultimo = new Date(
    Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0, 12),
  ).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}
