// Checagens de vários procedimentos num agendamento.
import {
  duracaoDosProcedimentos,
  duracaoEmTexto,
  nomeDosProcedimentos,
  resumoDosProcedimentos,
  semRepetidos,
  valorDosProcedimentos,
  type ProcedimentoDoAgendamento,
} from "../src/lib/agenda/procedimentos.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

const p = (
  name: string,
  price: number,
  duration: number,
  procedureId: string | null = name,
): ProcedimentoDoAgendamento => ({ procedureId, name, price, duration });

const limpeza = p("Limpeza", 180, 30);
const restauracao = p("Restauração", 300, 60);
const clareamento = p("Clareamento", 850, 45);

// ── O nome que vai para a agenda e para o WhatsApp ───────────────────────
conferir("um procedimento não ganha separador", nomeDosProcedimentos([limpeza]), "Limpeza");
conferir(
  "dois se unem com mais",
  nomeDosProcedimentos([limpeza, restauracao]),
  "Limpeza + Restauração",
);
conferir(
  "três se unem igual — resumo que esconde item mente no WhatsApp",
  nomeDosProcedimentos([limpeza, restauracao, clareamento]),
  "Limpeza + Restauração + Clareamento",
);
// Sem procedimento o agendamento continua válido: é o mesmo padrão que
// `agenda.functions.ts:298` já gravava.
conferir("lista vazia vira o padrão", nomeDosProcedimentos([]), "Consulta");
conferir("padrão pode ser outro", nomeDosProcedimentos([], "Retorno"), "Retorno");
conferir("nome em branco não vira separador solto", nomeDosProcedimentos([p("  ", 0, 0)]), "Consulta");
conferir(
  "nome em branco no meio some",
  nomeDosProcedimentos([limpeza, p("", 0, 0, "x"), restauracao]),
  "Limpeza + Restauração",
);
conferir("a ordem é a da lista", nomeDosProcedimentos([restauracao, limpeza]), "Restauração + Limpeza");

// ── O valor ──────────────────────────────────────────────────────────────
conferir("soma simples", valorDosProcedimentos([limpeza, restauracao]), 480);
conferir("lista vazia vale zero", valorDosProcedimentos([]), 0);
conferir("um só", valorDosProcedimentos([clareamento]), 850);
// Somar em centavos, e não em reais, evita o 0.1+0.2 do ponto flutuante.
conferir(
  "centavos não escorregam",
  valorDosProcedimentos([p("a", 0.1, 0, "a"), p("b", 0.2, 0, "b")]),
  0.3,
);
conferir(
  "três valores quebrados fecham exato",
  valorDosProcedimentos([p("a", 33.33, 0, "a"), p("b", 33.33, 0, "b"), p("c", 33.34, 0, "c")]),
  100,
);
conferir("preço ausente conta como zero", valorDosProcedimentos([p("x", NaN as number, 0, "x")]), 0);

// ── A duração ────────────────────────────────────────────────────────────
conferir("soma de minutos", duracaoDosProcedimentos([limpeza, restauracao]), 90);
conferir("lista vazia dura zero", duracaoDosProcedimentos([]), 0);
// Duração negativa no catálogo não pode encolher a sessão.
conferir("negativo não subtrai", duracaoDosProcedimentos([limpeza, p("x", 0, -30, "x")]), 30);
conferir("fracionado é truncado", duracaoDosProcedimentos([p("x", 0, 30.9, "x")]), 30);

// ── A duração como se fala ───────────────────────────────────────────────
conferir("menos de uma hora", duracaoEmTexto(30), "30min");
conferir("uma hora redonda", duracaoEmTexto(60), "1h");
conferir("uma hora e meia", duracaoEmTexto(90), "1h30");
// Zero à esquerda para a coluna não dançar entre "1h5" e "1h15".
conferir("cinco minutos ganham zero à esquerda", duracaoEmTexto(65), "1h05");
conferir("duas horas", duracaoEmTexto(120), "2h");
conferir("três horas e quinze", duracaoEmTexto(195), "3h15");
conferir("zero", duracaoEmTexto(0), "0min");
conferir("negativo vira zero", duracaoEmTexto(-10), "0min");

// ── Repetidos ────────────────────────────────────────────────────────────
// Duas limpezas é quase sempre clique duplo, e aceitar dobraria valor e
// duração sem ninguém ver.
conferir(
  "o mesmo procedimento não entra duas vezes",
  semRepetidos([limpeza, restauracao, limpeza]).map((x) => x.name),
  ["Limpeza", "Restauração"],
);
conferir(
  "sem id não se agrupa — não há como afirmar que são o mesmo",
  semRepetidos([p("Avulso", 10, 10, null), p("Avulso", 10, 10, null)]).length,
  2,
);
conferir("lista vazia continua vazia", semRepetidos([]), []);
conferir(
  "a primeira ocorrência é a que fica",
  semRepetidos([p("Limpeza", 180, 30, "L"), p("Limpeza cara", 999, 30, "L")]).map((x) => x.name),
  ["Limpeza"],
);

// ── O resumo do cabeçalho ────────────────────────────────────────────────
conferir("resumo de dois", resumoDosProcedimentos([limpeza, restauracao]), {
  nome: "Limpeza + Restauração",
  valor: 480,
  duracao: 90,
  duracaoTexto: "1h30",
});
conferir("resumo vazio não mente", resumoDosProcedimentos([]), {
  nome: "Consulta",
  valor: 0,
  duracao: 0,
  duracaoTexto: "0min",
});

if (falhas.length) {
  console.error(`FALHOU (${falhas.length}):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens de procedimentos do agendamento`);
