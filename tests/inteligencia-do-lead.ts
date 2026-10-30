// A Inteligência do Lead: o modelo lê, o código confere e dá a nota.
//
// O erro caro aqui é o funil mentir para cima: um lead em "Proposta" que
// nunca recebeu valor, ou um preço que ninguém disse somando no topo da
// coluna. Os testes são sobre isso.
import {
  catalogoDeProcedimentos,
  faixaDaNota,
  foneCanonico,
  leituraConferida,
  leituraGuardada,
  notaDoLead,
  reaisDoTexto,
  riscoDoLead,
  ritmoDaConversa,
  TETO_FORA_DA_REGIAO,
  type MensagemDaConversa,
} from "../supabase/functions/_shared/inteligencia-do-lead.ts";
import {
  classificar,
  colunasDosLeads,
  REGRAS_LEADS_PADRAO,
} from "../src/lib/atendimentos/funnelRules.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

// ── O telefone, gêmeo do SQL ────────────────────────────────────────────────
conferir("celular com 9 perde o 9", foneCanonico("+55 48 99999-1111"), "554899991111");
conferir("sem país ganha 55", foneCanonico("4899991111"), "554899991111");
conferir("13 dígitos com 9 seguido de 2 a 5 ficam", foneCanonico("5548925551111"), "5548925551111");
conferir("curto demais", foneCanonico("12345"), null);

// ── Dinheiro ────────────────────────────────────────────────────────────────
conferir("1.500", reaisDoTexto("1.500"), 1500);
conferir("R$ 399,90", reaisDoTexto("R$ 399,90"), 399.9);
conferir("2.490,00", reaisDoTexto("2.490,00"), 2490);
conferir("vazio", reaisDoTexto(""), null);
conferir("texto", reaisDoTexto("caro"), null);

// ── A conversa ──────────────────────────────────────────────────────────────
const catalogo = catalogoDeProcedimentos([
  { id: "p-clareamento", nome: "Clareamento", preco: 990, aPartirDe: false },
  { id: "p-lente", nome: "Lente de contato", preco: 1500, aPartirDe: true },
  { id: "", nome: "sem id", preco: 1, aPartirDe: false },
]);
conferir(
  "catálogo com código",
  catalogo.map((c) => c.codigo + ":" + c.id),
  ["PR1:p-clareamento", "PR2:p-lente"],
);

const m = (n: number, daClinica: boolean, texto: string, em = `2026-10-29T1${n}:00:00Z`) =>
  ({ id: `m${n}`, daClinica, texto, em }) as MensagemDaConversa;

const conversa = [
  m(1, false, "Oi, quanto custa o clareamento? Vocês atendem em Florianópolis?"),
  m(2, true, "Oi! Atendemos sim. O clareamento fica R$ 890,00 à vista."),
  m(3, false, "Ótimo, quero fazer. Tem horário sexta?"),
  m(4, true, "Tenho sexta às 14h ou às 16h30, qual prefere?"),
];

const bruto = {
  etapa: "horario_oferecido",
  procedimento: "PR1",
  valor: "890,00",
  intencao: "acao",
  urgencia: "imediata",
  objecao: "nenhuma",
  objecao_resolvida: false,
  cidade: "atendida",
  porque: "Pediu horário para sexta depois de receber o valor.",
  proxima_acao: "Confirmar o horário de sexta",
  evidencias: [
    { fato: "Valor informado", mensagem: 2 },
    { fato: "Horários oferecidos", mensagem: 4 },
    { fato: "inventada", mensagem: 99 },
  ],
};
const lida = leituraConferida(bruto, conversa, catalogo, null);
conferir("etapa comprovada", lida.etapa, "horario_oferecido");
conferir("procedimento do catálogo", lida.procedimentoNome, "Clareamento");
conferir("valor dito na conversa vence a tabela", [lida.valor, lida.valorFonte], [890, "conversa"]);
conferir(
  "evidência fora da conversa sai",
  lida.evidencias.map((e) => e.mensagemId),
  ["m2", "m4"],
);

// O modelo inventa um valor: cai para a tabela.
const inventado = leituraConferida({ ...bruto, valor: "1.200" }, conversa, catalogo, null);
conferir(
  "valor que ninguém disse não vale",
  [inventado.valor, inventado.valorFonte],
  [990, "tabela"],
);

// O modelo diz "horário oferecido" sem a clínica ter mandado horário.
const semHorario = conversa.slice(0, 3);
conferir(
  "horário sem prova vira proposta",
  leituraConferida(bruto, semHorario, catalogo, null).etapa,
  "proposta",
);
// E "proposta" sem a clínica ter falado valor.
conferir(
  "proposta sem prova vira interessado",
  leituraConferida({ ...bruto, etapa: "proposta", valor: "" }, conversa.slice(0, 1), catalogo, null)
    .etapa,
  "interessado",
);
// "O valor sai na avaliação" é proposta.
conferir(
  "valor na avaliação é proposta",
  leituraConferida(
    { ...bruto, etapa: "proposta", valor: "" },
    [conversa[0], m(2, true, "O valor depende da avaliação, que é gratuita.")],
    catalogo,
    null,
  ).etapa,
  "proposta",
);
// Código fora do catálogo.
conferir(
  "código inventado não vira procedimento",
  leituraConferida({ ...bruto, procedimento: "PR9" }, conversa, catalogo, null).procedimentoId,
  null,
);

// A etapa não recua, e o valor provado não se perde quando a mensagem sai da
// janela.
const depois = leituraConferida(
  { ...bruto, etapa: "interessado", valor: "", procedimento: "" },
  [m(5, false, "Vou ver com meu marido e te falo")],
  catalogo,
  lida,
);
conferir("etapa não recua", depois.etapa, "horario_oferecido");
conferir("valor provado fica", [depois.valor, depois.procedimentoNome], [890, "Clareamento"]);

// Lixo do modelo não quebra.
const lixo = leituraConferida("não sei", [m(1, false, "oi")], catalogo, null);
conferir("lixo vira novo", [lixo.etapa, lixo.intencao, lixo.valor], ["novo", "desconhecida", null]);

// Ida e volta pelo banco.
conferir("guardada volta igual", leituraGuardada(JSON.parse(JSON.stringify(lida))), lida);
conferir("guardada estragada", leituraGuardada({ etapa: "xyz" }), null);

// ── A nota ──────────────────────────────────────────────────────────────────
const ritmo = ritmoDaConversa(conversa);
conferir(
  "ritmo",
  [ritmo.daPessoa, ritmo.perguntasDaPessoa, ritmo.ultimaFoiDaPessoa],
  [2, 2, false],
);
const nota = notaDoLead(lida, ritmo, null);
conferir("lead quente", [nota.total, faixaDaNota(nota.total)], [89, "quente"]);
conferir("motivos", nota.motivos.slice(0, 2), ["Quer Clareamento", "Pediu horário"]);
conferir("agendado leva o avanço inteiro", notaDoLead(lida, ritmo, "agendado").partes.avanco, 25);
conferir(
  "fora da região tem teto",
  notaDoLead({ ...lida, cidade: "fora" }, ritmo, null).total <= TETO_FORA_DA_REGIAO,
  true,
);
// O que não se sabe não tira ponto: um "oi" fica no meio-baixo, não em zero.
const oi = notaDoLead(null, ritmoDaConversa([m(1, false, "oi")]), null);
conferir("só oi", [oi.total, faixaDaNota(oi.total)], [25, "frio"]);

// ── O risco ─────────────────────────────────────────────────────────────────
const agora = new Date("2026-10-30T12:00:00Z");
const esperando = ritmoDaConversa([
  ...conversa,
  m(5, false, "Pode ser às 14h", "2026-10-30T08:00:00Z"),
]);
conferir("pessoa esperando a clínica", riscoDoLead(lida, esperando, null, agora), {
  nivel: "alto",
  motivo: "Esperando resposta da clínica há 4h",
});
conferir(
  "sumiu depois dos horários",
  riscoDoLead(
    lida,
    ritmoDaConversa(conversa.map((x) => ({ ...x, em: "2026-10-27T10:00:00Z" }))),
    null,
    agora,
  ).motivo,
  "Sumiu depois dos horários",
);
conferir(
  "objeção aberta",
  riscoDoLead({ ...lida, objecao: "preco" }, ritmo, null, new Date("2026-10-29T15:00:00Z")).motivo,
  "Objeção de preço sem resposta",
);
conferir("agendado sem risco", riscoDoLead(lida, esperando, "agendado", agora).nivel, "baixo");
conferir(
  "parado há mais de 7 dias não é alerta",
  riscoDoLead(lida, { ...esperando, ultimaEm: "2026-10-01T10:00:00Z" }, null, agora).nivel,
  "baixo",
);

// ── O funil de 6 etapas ─────────────────────────────────────────────────────
conferir(
  "colunas na ordem do caminho",
  colunasDosLeads(REGRAS_LEADS_PADRAO).map((r) => r.nome),
  ["Novo Contato", "Interessado", "Proposta", "Horário Oferecido", "Agendado", "Não Compareceu"],
);
const etapa = (
  etapaDaConversa: "novo" | "interessado" | "proposta" | "horario_oferecido" | null,
  situacaoNaAgenda: "agendado" | "nao_compareceu" | null = null,
) =>
  classificar(REGRAS_LEADS_PADRAO, {
    temAgendamento: !!situacaoNaAgenda,
    diasEmSilencio: 1,
    etapaDaConversa,
    situacaoNaAgenda,
  });
conferir("sem leitura", etapa(null), "novo_contato");
conferir("interessado", etapa("interessado"), "interessado");
conferir("proposta", etapa("proposta"), "proposta");
conferir("horário", etapa("horario_oferecido"), "horario_oferecido");
conferir("a agenda vence a conversa", etapa("interessado", "agendado"), "agendado");
conferir("faltou", etapa("horario_oferecido", "nao_compareceu"), "nao_compareceu");
// Desligar "Proposta" manda quem estava lá para Interessado, não para o fim.
const semProposta = REGRAS_LEADS_PADRAO.map((r) =>
  r.id === "proposta" ? { ...r, ativa: false } : r,
);
conferir(
  "etapa desligada cai na anterior",
  classificar(semProposta, {
    temAgendamento: false,
    diasEmSilencio: 1,
    etapaDaConversa: "proposta",
    situacaoNaAgenda: null,
  }),
  "interessado",
);

if (falhas.length) {
  console.error(falhas.join("\n"));
  process.exit(1);
}
console.log(`inteligencia-do-lead: ${ok} checagens ok`);
