import {
  catalogoDeVagas,
  vagaFechada,
  comoReportarFechamento,
  procedimentoDoTexto,
  SEM_PROCEDIMENTO,
} from "../supabase/functions/_shared/agendamento-da-ia.ts";

let feitas = 0;
function conferir(oQue: string, real: unknown, esperado: unknown) {
  feitas++;
  if (real !== esperado) {
    console.error(`FALHOU ${oQue}: esperava ${String(esperado)}, veio ${String(real)}`);
    process.exit(1);
  }
}

// As vagas da conversa real da Luana, em 07/10/2026.
const vagas = {
  paraOferecer: [
    { date: "2026-10-07", hora: "17:00", unidadeNome: "NÓS Florianópolis" },
    { date: "2026-10-08", hora: "08:00", unidadeNome: "NÓS Florianópolis" },
  ],
  reserva: [
    { date: "2026-10-08", hora: "12:00", unidadeNome: "NÓS Florianópolis" },
    { date: "2026-10-09", hora: "09:00", unidadeNome: "NÓS Florianópolis" },
  ],
};

// ── O catálogo ──────────────────────────────────────────────────────────────

const cat = catalogoDeVagas(vagas);
conferir("quatro vagas no catálogo", cat.length, 4);
conferir("a primeira oferecida é H1", cat[0].codigo, "H1");
conferir("a segunda é H2", cat[1].codigo, "H2");
conferir("a primeira de reserva é R1", cat[2].codigo, "R1");
conferir("a segunda de reserva é R2", cat[3].codigo, "R2");
// A reserva continua numerando do 1: é lista própria, não continuação.
conferir("R1 é a primeira reserva, não a terceira vaga", cat[2].hora, "12:00");

conferir("sem vagas, catálogo vazio", catalogoDeVagas({ paraOferecer: [], reserva: [] }).length, 0);
conferir("nulo não quebra", catalogoDeVagas(null).length, 0);
conferir("indefinido não quebra", catalogoDeVagas(undefined).length, 0);

// Vaga malformada não entra: o código existiria e a criação falharia longe daqui.
const sujo = catalogoDeVagas({
  paraOferecer: [
    { date: "2026-10-08", hora: "08:00", unidadeNome: "X" },
    { date: "", hora: "09:00", unidadeNome: "X" },
    { date: "2026-10-09", hora: "", unidadeNome: "X" },
    { date: "08/10/2026", hora: "08:00", unidadeNome: "X" },
    { date: "2026-10-10", hora: "8h", unidadeNome: "X" },
  ],
  reserva: [],
});
conferir("só a vaga bem formada entra", sujo.length, 1);
conferir("e ela é a primeira", sujo[0].date, "2026-10-08");

// ── O fechamento: o que vale ────────────────────────────────────────────────

conferir("H2 devolve a vaga certa", vagaFechada({ codigo: "H2" }, cat)?.date, "2026-10-08");
conferir("H2 devolve a hora certa", vagaFechada({ codigo: "H2" }, cat)?.hora, "08:00");
conferir("R1 devolve a reserva", vagaFechada({ codigo: "R1" }, cat)?.hora, "12:00");
conferir("H1 é o de hoje à tarde", vagaFechada({ codigo: "H1" }, cat)?.hora, "17:00");

// Variação que o modelo produz e que não muda a intenção.
conferir("minúscula vale", vagaFechada({ codigo: "h2" }, cat)?.hora, "08:00");
conferir("espaço em volta vale", vagaFechada({ codigo: "  H2  " }, cat)?.hora, "08:00");

// ── O fechamento: o que NÃO vale ───────────────────────────────────────────
//
// Este é o lado que importa. Qualquer um destes criando agendamento é uma
// paciente marcada num horário que ninguém ofereceu.

conferir("campo ausente", vagaFechada({}, cat), null);
conferir("objeto nulo", vagaFechada(null, cat), null);
conferir("objeto indefinido", vagaFechada(undefined, cat), null);
conferir("código vazio", vagaFechada({ codigo: "" }, cat), null);
conferir("só espaço", vagaFechada({ codigo: "   " }, cat), null);
conferir("código nulo", vagaFechada({ codigo: null }, cat), null);
conferir("código inventado", vagaFechada({ codigo: "H9" }, cat), null);
conferir("reserva inexistente", vagaFechada({ codigo: "R7" }, cat), null);
conferir("prefixo errado", vagaFechada({ codigo: "X1" }, cat), null);
// O modelo mandar a DATA em vez do código é o erro mais provável, e é o que
// este módulo existe para recusar.
conferir("data no lugar do código", vagaFechada({ codigo: "2026-10-08" }, cat), null);
conferir("data e hora", vagaFechada({ codigo: "2026-10-08 08:00" }, cat), null);
conferir("texto solto", vagaFechada({ codigo: "quinta às 8h" }, cat), null);
// Número não é código: `1` poderia parecer "o primeiro", e adivinhar isso é
// adivinhar qual vaga a pessoa aceitou.
conferir("número", vagaFechada({ codigo: 1 }, cat), null);
conferir("booleano", vagaFechada({ codigo: true }, cat), null);
// Catálogo vazio recusa tudo, inclusive código de forma válida: sem vaga
// oferecida não houve o que aceitar.
conferir("H1 com catálogo vazio", vagaFechada({ codigo: "H1" }, []), null);
conferir("catálogo nulo", vagaFechada({ codigo: "H1" }, null as never), null);

// ── A instrução ────────────────────────────────────────────────────────────

conferir("sem vaga, nada a ensinar", comoReportarFechamento([]).length, 0);
const texto = comoReportarFechamento(cat).join("\n");
conferir("ensina o nome do campo", texto.includes("horarioFechado"), true);
conferir("exige aceite de verdade", texto.includes("ACEITAR"), true);
conferir("proíbe inventar código", texto.includes("não invente código"), true);
conferir("proíbe escrever data", texto.includes("Não escreva data"), true);

// ── Qual procedimento o anúncio vende ──────────────────────────────────────

// O catálogo autorizado, com os nomes reais da clínica.
const procs = [
  {
    id: "p-combo",
    nome: "Combo: clareamento de consultório + limpeza completa",
    preco: 399,
    duracaoMin: 90,
  },
  { id: "p-clar", nome: "Clareamento em Consultório", preco: 250, duracaoMin: 60 },
  { id: "p-limp", nome: "Profilaxia + Polimento Coronário - Limpeza", preco: 250, duracaoMin: 60 },
  { id: "p-botox", nome: "Toxina botulínica (botox)", preco: 1000, duracaoMin: 60 },
];

// O anúncio que trouxe a Luana, palavra por palavra.
const anuncioDaLuana =
  "COMBO ESPECIAL!✨ Limpeza + Clareamento. Procedimento seguro, supervisionado e com resultado visível já na primeira sessão.";

conferir(
  "o anúncio de combo casa o COMBO, não o clareamento solto",
  procedimentoDoTexto(anuncioDaLuana, procs).id,
  "p-combo",
);
conferir("e traz o preço certo", procedimentoDoTexto(anuncioDaLuana, procs).preco, 399);
conferir("e a duração de 90 min", procedimentoDoTexto(anuncioDaLuana, procs).duracaoMin, 90);

// A ordem do catálogo não pode decidir: invertida, o resultado é o mesmo.
conferir(
  "ordem invertida dá o mesmo",
  procedimentoDoTexto(anuncioDaLuana, [...procs].reverse()).id,
  "p-combo",
);

// Acento: o catálogo escreve "consultório", o anúncio às vezes não.
conferir(
  "sem acento no anúncio casa igual",
  procedimentoDoTexto("Combo de clareamento de consultorio com limpeza completa", procs).id,
  "p-combo",
);
conferir(
  "sem acento no catálogo casa igual",
  procedimentoDoTexto("clareamento em consultório", [
    { id: "x", nome: "Clareamento em Consultorio", preco: 1, duracaoMin: 1 },
  ]).id,
  "x",
);

// Anúncio de um procedimento só casa esse procedimento.
conferir(
  "anúncio de botox casa botox (toxina + botulinica)",
  procedimentoDoTexto("Toxina botulínica com a Dra. Mariane", procs).id,
  "p-botox",
);
// Uma palavra só não basta, de propósito: é quase sempre coincidência, e o
// preço errado chega à paciente antes de alguém notar.
conferir(
  "só 'botox' não casa",
  procedimentoDoTexto("Venha fazer botox com a gente", procs).id,
  null,
);
// O caso que a proporção existe para resolver: anúncio só de limpeza NÃO pode
// cair no combo de R$ 399.
conferir(
  "anúncio só de limpeza casa a limpeza, não o combo",
  procedimentoDoTexto("Profilaxia e polimento: limpeza completa a partir de R$ 250", procs).id,
  "p-limp",
);

// ── E o que NÃO deve casar ─────────────────────────────────────────────────
//
// Casar errado aqui marca a paciente num procedimento com outro preço, e ela
// já foi avisada do valor na conversa.

conferir("anúncio vazio", procedimentoDoTexto("", procs).id, null);
conferir("anúncio nulo", procedimentoDoTexto(null, procs).id, null);
conferir("anúncio indefinido", procedimentoDoTexto(undefined, procs).id, null);
conferir("catálogo vazio", procedimentoDoTexto(anuncioDaLuana, []).id, null);
conferir("catálogo nulo", procedimentoDoTexto(anuncioDaLuana, null as never).id, null);
conferir("nada a ver", procedimentoDoTexto("Venha conhecer nossa clínica nova", procs).id, null);
conferir("o padrão é Consulta", procedimentoDoTexto("", procs).nome, "Consulta");
conferir("e sem preço inventado", procedimentoDoTexto("", procs).preco, null);
conferir("a constante é o mesmo objeto de forma", SEM_PROCEDIMENTO.nome, "Consulta");

// Preposição não pode casar sozinha: "em" aparece em quase todo anúncio, e se
// contasse, "Clareamento em Consultório" casaria com qualquer coisa.
conferir("preposição não casa", procedimentoDoTexto("Venha em nossa clínica", procs).id, null);

// Procedimento sem id ou sem nome é descartado em vez de virar agendamento solto.
conferir(
  "procedimento sem id",
  procedimentoDoTexto("limpeza completa", [
    { id: "", nome: "Profilaxia + Polimento Coronário - Limpeza", preco: 1, duracaoMin: 1 },
  ]).id,
  null,
);
conferir(
  "procedimento sem nome",
  procedimentoDoTexto("limpeza", [{ id: "z", nome: "   ", preco: 1, duracaoMin: 1 }]).id,
  null,
);

console.log(`ok — ${feitas} checagens do agendamento pela IA`);
