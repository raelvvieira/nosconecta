// Quando a IA fecha um horário, qual horário ela fechou.
//
// ── O problema que este módulo existe para resolver ─────────────────────────
//
// Em 07/10/2026 a Luna fechou o primeiro agendamento sozinha: negociou com a
// Luana, respeitou o horário da escola da filha dela, e combinou "quinta às
// 8h". Depois escreveu "anotei esse horário pra você" — e não anotou, porque
// não havia como. O modelo devolvia texto puro, e texto puro não cria
// agendamento.
//
// A tentação é pedir ao modelo a data: "devolva 2026-10-08 às 08:00". Não.
// Naquela conversa quem traduziu "quinta-feira" para uma data foi o modelo, de
// cabeça, a partir de "amanhã" e do dia da semana. Acertou. Mas um erro dessa
// tradução não é um texto esquisito que alguém relê: é uma paciente marcada no
// dia errado, avisada de que está marcada.
//
// Então o modelo não calcula data nenhuma. Cada vaga que a agenda ofereceu
// entra na instrução com um CÓDIGO (`H1`, `H2`, `R1`…), e o que ele devolve é o
// código. A data sai da tabela, que veio do banco. Código que não está na
// tabela não cria nada.
//
// ── Por que módulo puro ────────────────────────────────────────────────────
//
// É a fronteira entre o que o modelo diz e o que vira registro no banco. Dá
// para exercitar todo jeito de errar — código inventado, código de outra
// conversa, caixa trocada, campo vazio, objeto inteiro ausente — sem chamar
// modelo e sem escrever linha nenhuma.

/** Uma vaga que a agenda ofereceu, já com o código pelo qual a IA a nomeia. */
export interface VagaComCodigo {
  /** `H1`, `H2`… para as oferecidas agora; `R1`, `R2`… para as de reserva. */
  codigo: string;
  /** "AAAA-MM-DD". Vem do banco, nunca do modelo. */
  date: string;
  /** "HH:MM". Vem do banco, nunca do modelo. */
  hora: string;
  unidadeNome: string;
}

/** O que a agenda devolveu, no formato de `instrucao-do-agente.ts`. */
export interface VagasOferecidas {
  paraOferecer: { date: string; hora: string; unidadeNome: string }[];
  reserva: { date: string; hora: string; unidadeNome: string }[];
}

/**
 * A tabela de códigos desta conversa.
 *
 * `H` de "horário oferecido agora", `R` de "reserva". Os dois entram porque a
 * pessoa recusa os dois primeiros e aceita um da reserva — foi o que a Luana
 * fez, e se a reserva não tivesse código o fechamento dela não teria como ser
 * reportado.
 */
export function catalogoDeVagas(vagas: VagasOferecidas | null | undefined): VagaComCodigo[] {
  const saida: VagaComCodigo[] = [];
  const juntar = (lista: VagasOferecidas["paraOferecer"], prefixo: string) => {
    for (const [i, v] of (Array.isArray(lista) ? lista : []).entries()) {
      const date = String(v?.date ?? "").trim();
      const hora = String(v?.hora ?? "").trim();
      // Vaga sem data ou sem hora não é vaga. Entrar no catálogo faria o código
      // existir e a criação do agendamento falhar depois, longe daqui.
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(hora)) continue;
      saida.push({
        codigo: `${prefixo}${i + 1}`,
        date,
        hora,
        unidadeNome: String(v?.unidadeNome ?? "").trim(),
      });
    }
  };
  juntar(vagas?.paraOferecer ?? [], "H");
  juntar(vagas?.reserva ?? [], "R");
  return saida;
}

/** O que o modelo devolve quando fecha um horário. */
export interface FechamentoBruto {
  /** O código da vaga. Qualquer outra coisa é descartada. */
  codigo?: unknown;
}

/**
 * A vaga que a IA diz ter fechado, ou `null`.
 *
 * `null` em todos estes casos, e nenhum deles é erro a reportar — são o estado
 * normal de quase toda resposta:
 *
 *   • a resposta não fala de fechamento (a conversa ainda está começando);
 *   • o código não está no catálogo desta conversa;
 *   • o catálogo está vazio porque não havia vaga.
 *
 * Aceita caixa trocada e espaço em volta (`" h1 "` vira `H1`): são variações
 * que o modelo produz e que não mudam a intenção. Não aceita nada além disso —
 * um código parecido é um código errado.
 */
export function vagaFechada(
  bruto: FechamentoBruto | null | undefined,
  catalogo: VagaComCodigo[],
): VagaComCodigo | null {
  const pedido = String(bruto?.codigo ?? "")
    .trim()
    .toUpperCase();
  if (!pedido) return null;
  return (Array.isArray(catalogo) ? catalogo : []).find((v) => v.codigo === pedido) ?? null;
}

/**
 * As linhas da instrução que ensinam a reportar o fechamento.
 *
 * Mora aqui, junto da regra que valida, para as duas não divergirem: o dia em
 * que o formato mudar, muda num arquivo só.
 */
export function comoReportarFechamento(catalogo: VagaComCodigo[]): string[] {
  if (!catalogo.length) return [];
  return [
    "",
    "## Quando a pessoa aceitar um horário",
    "",
    "Cada horário acima tem um código entre parênteses. Quando a pessoa aceitar",
    "um deles, devolva esse código no campo `horarioFechado` da sua resposta.",
    "É isso que põe a consulta na agenda.",
    "",
    "Só preencha quando ela ACEITAR de verdade — 'pode ser quinta às 8h', 'fecha",
    "esse', 'vou nesse'. Não preencha quando ela só estiver perguntando, pedindo",
    "outro horário ou dizendo que vai pensar.",
    "",
    "O código tem de ser um dos que estão acima, exatamente. Não escreva data",
    "nem hora nesse campo, e não invente código: se o horário que ela aceitou",
    "não estiver na lista, deixe o campo vazio e diga na conversa que vai",
    "confirmar com a equipe.",
  ];
}

/** Um procedimento do catálogo, do jeito que o casamento precisa dele. */
export interface ProcedimentoDoCatalogo {
  id: string;
  nome: string;
  preco: number | null;
  duracaoMin: number | null;
}

/** O que vai para o agendamento quando nada casa. */
export const SEM_PROCEDIMENTO: {
  id: string | null;
  nome: string;
  preco: number | null;
  duracaoMin: number | null;
} = { id: null, nome: "Consulta", preco: null, duracaoMin: null };

const semAcento = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** Quantas palavras do nome precisam aparecer para contar como casamento. */
const MINIMO_DE_PALAVRAS = 2;

/**
 * Qual procedimento o anúncio está vendendo.
 *
 * ── Por que PROPORÇÃO e não "todas as palavras" ───────────────────────────
 *
 * A primeira versão exigia todas as palavras do nome dentro do anúncio. O
 * teste derrubou na hora, com o anúncio real da Luana: "COMBO ESPECIAL!
 * Limpeza + Clareamento" não contém "consultório" nem "completa", que estão no
 * nome "Combo: clareamento de consultório + limpeza completa". Nada casava, e
 * todo agendamento da Luna nasceria como "Consulta" sem valor.
 *
 * Agora conta a FRAÇÃO do nome que o anúncio menciona, e ganha a maior. Isso
 * resolve os dois casos que se contradizem:
 *
 *   • o anúncio de combo diz combo, clareamento e limpeza — 3 de 5 do combo
 *     (0,60) contra 1 de 2 do "Clareamento em Consultório" (0,50). Ganha o
 *     combo, que é o que a pessoa comprou;
 *   • um anúncio que só diz "limpeza" dá 1 de 5 no combo (0,20) contra 1 de 4
 *     na "Profilaxia + Polimento Coronário - Limpeza" (0,25). Ganha a limpeza.
 *
 * Com "nome mais longo primeiro" o segundo caso marcava o combo e a pessoa
 * pagava R$ 399 por uma limpeza de R$ 250.
 *
 * ── Por que um piso de duas palavras ──────────────────────────────────────
 *
 * Uma palavra só casando é quase sempre coincidência ("clínica", "sessão"), e
 * o preço errado chega à paciente antes de alguém notar. Não casar devolve
 * "Consulta" sem valor, que a recepção corrige ao confirmar — erro barato e
 * visível, contra erro caro e silencioso.
 *
 * ── Por que só palavras de cinco letras ou mais ───────────────────────────
 *
 * "de", "em", "com", "+" não distinguem nada. Cinco letras deixa fora
 * preposição e artigo e mantém "limpeza", "combo", "clareamento",
 * "consultorio". Acento sai dos dois lados: o catálogo escreve "consultório" e
 * o anúncio às vezes "consultorio", e essa diferença não é diferença.
 */
export function procedimentoDoTexto(
  textoDoAnuncio: string | null | undefined,
  catalogo: ProcedimentoDoCatalogo[],
): typeof SEM_PROCEDIMENTO {
  const texto = semAcento(String(textoDoAnuncio ?? "").trim());
  if (!texto) return SEM_PROCEDIMENTO;

  let melhor: { p: ProcedimentoDoCatalogo; fracao: number; acertos: number } | null = null;

  for (const p of Array.isArray(catalogo) ? catalogo : []) {
    if (!p?.id || !String(p?.nome ?? "").trim()) continue;
    const palavras = semAcento(p.nome)
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 5);
    if (!palavras.length) continue;

    const acertos = palavras.filter((w) => texto.includes(w)).length;
    if (acertos < MINIMO_DE_PALAVRAS) continue;
    const fracao = acertos / palavras.length;

    // Empate de fração vai para quem acertou mais palavras: entre 2 de 4 e
    // 1 de 2 (os dois 0,50), o de 2 acertos tem mais evidência.
    const ganha =
      !melhor || fracao > melhor.fracao || (fracao === melhor.fracao && acertos > melhor.acertos);
    if (ganha) melhor = { p, fracao, acertos };
  }

  if (!melhor) return SEM_PROCEDIMENTO;
  return {
    id: melhor.p.id,
    nome: melhor.p.nome,
    preco: melhor.p.preco,
    duracaoMin: melhor.p.duracaoMin,
  };
}
