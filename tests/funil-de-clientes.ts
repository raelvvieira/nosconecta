// O quadro de Clientes por tempo: a escada de etapas e a ordem em que casam.
import {
  classificar,
  REGRAS_CLIENTES_PADRAO,
  type SinaisDoCliente,
} from "../src/lib/atendimentos/funnelRules.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

const sinais = (dias: number | null, extra: Partial<SinaisDoCliente> = {}): SinaisDoCliente => ({
  teveConsulta: dias !== null,
  consultasConcluidas: dias === null ? 0 : 1,
  temOrcamentoAberto: false,
  temTratamentoPendente: false,
  diasSemConsulta: dias,
  temConsultaFutura: false,
  ...extra,
});
const etapa = (s: SinaisDoCliente) => classificar(REGRAS_CLIENTES_PADRAO, s);

conferir(
  "ids e ordem das etapas",
  REGRAS_CLIENTES_PADRAO.map((r) => r.id),
  [
    "retorno_marcado",
    "recem_atendido",
    "em_acompanhamento",
    "hora_de_voltar",
    "em_risco",
    "inativo",
  ],
);
conferir(
  "não existe coluna de não compareceu",
  REGRAS_CLIENTES_PADRAO.some((r) => r.id === "nao_compareceu"),
  false,
);

// Fronteiras da escada (dias desde a última consulta concluída).
conferir("hoje", etapa(sinais(0)), "recem_atendido");
conferir("30 dias", etapa(sinais(30)), "recem_atendido");
conferir("31 dias", etapa(sinais(31)), "em_acompanhamento");
conferir("90 dias", etapa(sinais(90)), "em_acompanhamento");
conferir("91 dias", etapa(sinais(91)), "hora_de_voltar");
conferir("180 dias", etapa(sinais(180)), "hora_de_voltar");
conferir("181 dias", etapa(sinais(181)), "em_risco");
conferir("365 dias", etapa(sinais(365)), "em_risco");
conferir("366 dias", etapa(sinais(366)), "inativo");
conferir("muito tempo", etapa(sinais(2000)), "inativo");

// Consulta marcada vale mais que o tempo, em qualquer faixa.
conferir(
  "retorno marcado, recém",
  etapa(sinais(5, { temConsultaFutura: true })),
  "retorno_marcado",
);
conferir(
  "retorno marcado, inativo",
  etapa(sinais(900, { temConsultaFutura: true })),
  "retorno_marcado",
);

// Plano de tratamento não move a pessoa de coluna: virou etiqueta.
conferir(
  "plano em aberto não muda a etapa",
  etapa(sinais(45, { temOrcamentoAberto: true, temTratamentoPendente: true })),
  "em_acompanhamento",
);
conferir(
  "muitas consultas não mudam a etapa",
  etapa(sinais(10, { consultasConcluidas: 7 })),
  "recem_atendido",
);

// Sem data da última consulta (não deveria chegar aqui, o quadro só traz quem
// tem consulta concluída): cai no resto, nunca numa faixa de tempo.
conferir("sem data cai no resto", etapa(sinais(null)), "inativo");

// Etapa desligada: quem cairia nela desce para a seguinte.
const semRecem = REGRAS_CLIENTES_PADRAO.map((r) =>
  r.id === "recem_atendido" ? { ...r, ativa: false } : r,
);
conferir(
  "etapa desligada passa para a seguinte",
  classificar(semRecem, sinais(10)),
  "em_acompanhamento",
);

// Prazo editado vale.
const prazoCurto = REGRAS_CLIENTES_PADRAO.map((r) =>
  r.id === "recem_atendido" ? { ...r, valor: 14 } : r,
);
conferir("prazo editado", classificar(prazoCurto, sinais(20)), "em_acompanhamento");

if (falhas.length) {
  console.error(falhas.join("\n"));
  process.exit(1);
}
console.log(`funil-de-clientes: ${ok} checagens ok`);
