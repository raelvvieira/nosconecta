// O mês como unidade de leitura do financeiro.
//
// Tudo aqui é aritmética de calendário, e é o tipo de conta que erra em
// silêncio: um intervalo errado não dá erro em lugar nenhum, só enche a tela de
// números errados que ninguém desconfia. Por isso os casos que doem são a
// virada do ano, fevereiro e o ano bissexto.
import {
  diasNoMes,
  intervaloDoMes,
  mesCheioDe,
  mesCorrente,
  mesDoDia,
  mesesEmVolta,
  rotuloDoMes,
  somarMeses,
} from "../src/lib/finance/mes";

let feitas = 0;
function conferir(oQue: string, real: unknown, esperado: unknown) {
  feitas++;
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a !== b) {
    console.error(`FALHOU ${oQue}: esperava ${b}, veio ${a}`);
    process.exit(1);
  }
}

// ── Quantos dias tem o mês ──────────────────────────────────────────────────

conferir("janeiro", diasNoMes(2026, 1), 31);
conferir("abril", diasNoMes(2026, 4), 30);
conferir("fevereiro comum", diasNoMes(2026, 2), 28);
conferir("fevereiro bissexto", diasNoMes(2028, 2), 29);
// A regra completa, não o "divisível por 4": 1900 não foi bissexto, 2000 foi.
conferir("1900 não é bissexto", diasNoMes(1900, 2), 28);
conferir("2000 é bissexto", diasNoMes(2000, 2), 29);
conferir("2100 não é bissexto", diasNoMes(2100, 2), 28);

// ── O intervalo do mês ──────────────────────────────────────────────────────

conferir("outubro de 2026", intervaloDoMes("2026-10"), { de: "2026-10-01", ate: "2026-10-31" });
conferir("setembro tem 30", intervaloDoMes("2026-09"), { de: "2026-09-01", ate: "2026-09-30" });
conferir("fevereiro comum", intervaloDoMes("2026-02"), { de: "2026-02-01", ate: "2026-02-28" });
conferir("fevereiro bissexto", intervaloDoMes("2028-02"), { de: "2028-02-01", ate: "2028-02-29" });
conferir("dezembro", intervaloDoMes("2026-12"), { de: "2026-12-01", ate: "2026-12-31" });

// Chave inválida devolve null, nunca um intervalo chutado: um intervalo errado
// vira tela cheia de números errados e ninguém desconfia do filtro.
conferir("mês 13", intervaloDoMes("2026-13"), null);
conferir("mês 00", intervaloDoMes("2026-00"), null);
conferir("texto solto", intervaloDoMes("outubro"), null);
conferir("dia completo não é mês", intervaloDoMes("2026-10-11"), null);
conferir("vazio", intervaloDoMes(""), null);
conferir("nulo não quebra", intervaloDoMes(null as never), null);

// ── O mês de um dia ─────────────────────────────────────────────────────────

conferir("dia comum", mesDoDia("2026-10-11"), "2026-10");
conferir("primeiro dia", mesDoDia("2026-10-01"), "2026-10");
// O último dia do mês continua sendo daquele mês. Passando por `Date` em UTC,
// 31/12 às 00:00 no Brasil ainda é 31/12 — mas 01/01 vira 31/12 do ano anterior,
// e era esse o risco de usar Date aqui.
conferir("último dia do ano", mesDoDia("2026-12-31"), "2026-12");
conferir("primeiro dia do ano", mesDoDia("2027-01-01"), "2027-01");
conferir("formato errado", mesDoDia("11/10/2026"), "");
conferir("vazio", mesDoDia(""), "");

// ── Somar meses ─────────────────────────────────────────────────────────────

conferir("mais um", somarMeses("2026-10", 1), "2026-11");
conferir("menos um", somarMeses("2026-10", -1), "2026-09");
conferir("zero", somarMeses("2026-10", 0), "2026-10");
// A virada do ano nos dois sentidos — é onde a versão com `if` encadeado erra.
conferir("dezembro + 1 vira janeiro", somarMeses("2026-12", 1), "2027-01");
conferir("janeiro − 1 vira dezembro", somarMeses("2026-01", -1), "2025-12");
conferir("salto de um ano", somarMeses("2026-10", 12), "2027-10");
conferir("salto para trás", somarMeses("2026-03", -15), "2024-12");
conferir("salto grande", somarMeses("2026-01", -13), "2024-12");
conferir("chave inválida", somarMeses("2026-13", 1), "");

// ── O rótulo ────────────────────────────────────────────────────────────────

const HOJE = "2026-10-11";
conferir("mês do ano corrente, sem ano", rotuloDoMes("2026-10", HOJE), "outubro");
conferir("janeiro do mesmo ano", rotuloDoMes("2026-01", HOJE), "janeiro");
// O ano só aparece quando muda a resposta: numa barra em que todos os meses são
// de 2026, escrever o ano em todos empurra os outros para fora da tela.
conferir("ano passado leva o ano", rotuloDoMes("2025-12", HOJE), "dezembro de 2025");
conferir("ano que vem leva o ano", rotuloDoMes("2027-01", HOJE), "janeiro de 2027");
conferir("março com acento", rotuloDoMes("2026-03", HOJE), "março");
conferir("inválido vira vazio", rotuloDoMes("2026-99", HOJE), "");

// ── Reconhecer um mês cheio vindo da URL ────────────────────────────────────
//
// Sem isto, abrir um link com from/to de um mês deixaria todas as pílulas
// apagadas: a tela mostrando outubro e nada dizendo que é outubro.

conferir("mês exato", mesCheioDe("2026-10-01", "2026-10-31"), "2026-10");
conferir("setembro exato", mesCheioDe("2026-09-01", "2026-09-30"), "2026-09");
conferir("fevereiro bissexto", mesCheioDe("2028-02-01", "2028-02-29"), "2028-02");
// Um dia a menos não é o mês: é um intervalo solto, e a barra tem de mostrar
// "período exato" em vez de acender outubro.
conferir("falta o último dia", mesCheioDe("2026-10-01", "2026-10-30"), null);
conferir("começa no dia 2", mesCheioDe("2026-10-02", "2026-10-31"), null);
conferir("atravessa dois meses", mesCheioDe("2026-09-12", "2026-10-11"), null);
conferir("setembro com 31", mesCheioDe("2026-09-01", "2026-09-31"), null);
conferir("sem nada", mesCheioDe(undefined, undefined), null);
conferir("só o começo", mesCheioDe("2026-10-01", undefined), null);

// ── A barra de meses ────────────────────────────────────────────────────────

const barra = mesesEmVolta(HOJE);
conferir("dois atrás e um à frente, mais o atual", barra.length, 4);
conferir("começa em agosto", barra[0].chave, "2026-08");
conferir("termina em novembro", barra[3].chave, "2026-11");
conferir("outubro é o atual", barra[2].atual, true);
conferir("agosto não é o atual", barra[0].atual, false);
conferir("o intervalo vem junto", barra[2].de, "2026-10-01");
conferir("e o fim também", barra[2].ate, "2026-10-31");
conferir("com rótulo pronto", barra[3].rotulo, "novembro");

// A barra atravessa o ano sem buraco: é o caso que mais aparece em produção,
// uma vez por ano, e o mais fácil de não testar.
const virada = mesesEmVolta("2027-01-15");
conferir("janeiro: a barra tem quatro meses", virada.length, 4);
conferir("começa em novembro do ano anterior", virada[0].chave, "2026-11");
conferir("e leva o ano no rótulo", virada[0].rotulo, "novembro de 2026");
conferir("janeiro é o atual", virada[2].atual, true);
conferir("fevereiro fecha", virada[3].chave, "2027-02");

// Quantos meses mostrar é escolha de quem chama.
conferir("mais meses atrás", mesesEmVolta(HOJE, 5, 0).length, 6);
conferir("só o atual", mesesEmVolta(HOJE, 0, 0).length, 1);
conferir("dia inválido devolve nada", mesesEmVolta("hoje").length, 0);

// ── O padrão quando a URL não traz nada ─────────────────────────────────────
//
// Mês corrente INTEIRO, incluindo os dias que ainda não aconteceram: é o que
// faz "a pagar" e "a receber" mostrarem o resto do mês, que é a parte acionável.

conferir("mês cheio, não os últimos 30 dias", mesCorrente(HOJE), {
  de: "2026-10-01",
  ate: "2026-10-31",
});
conferir("no primeiro dia do mês", mesCorrente("2026-10-01"), {
  de: "2026-10-01",
  ate: "2026-10-31",
});
conferir("no último dia do mês", mesCorrente("2026-10-31"), {
  de: "2026-10-01",
  ate: "2026-10-31",
});
conferir("fevereiro", mesCorrente("2026-02-15"), { de: "2026-02-01", ate: "2026-02-28" });

console.log(`ok — ${feitas} checagens do mês`);
