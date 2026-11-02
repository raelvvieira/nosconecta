// O que cada consultório configura para a assistente atender do jeito dele:
// como o paciente paga, se a avaliação tem custo, as políticas de falta e
// cancelamento, as campanhas com validade e o manual-base de quem ainda não
// tem um manual próprio.
//
// Puro (sem banco), com testes em `tests/condicoes-do-consultorio.ts`. Os
// padrões reproduzem o que a NÓS já fazia, para nada mudar no atendimento
// dela: avaliação sem custo e nada de preço de harmonização fora da tabela.

import type { ManualDeVendas } from "./instrucao-do-agente.ts";

export type FormaDePagamento = "pix" | "cartao" | "dinheiro" | "boleto" | "transferencia";

export const FORMAS_DE_PAGAMENTO: { id: FormaDePagamento; rotulo: string }[] = [
  { id: "pix", rotulo: "Pix" },
  { id: "cartao", rotulo: "Cartão de crédito" },
  { id: "dinheiro", rotulo: "Dinheiro" },
  { id: "boleto", rotulo: "Boleto" },
  { id: "transferencia", rotulo: "Transferência" },
];

export interface CondicoesDoConsultorio {
  formas: FormaDePagamento[];
  /** Parcelas máximas no cartão. `null` = não cadastrado. */
  parcelasMax: number | null;
  /** `null` = sem juros; N = tem juros a partir de N parcelas. */
  jurosAPartir: number | null;
  parcelaMinima: number | null;
  avaliacaoGratuita: boolean;
  avaliacaoValor: number | null;
  /** O valor pago na avaliação é descontado do tratamento? */
  avaliacaoAbate: boolean;
  politicaFalta: string;
  politicaCancelamento: string;
  /** A assistente pode informar preço de harmonização que esteja na tabela? */
  precoHarmonizacao: boolean;
}

/** O padrão do sistema enquanto o consultório não escreve a sua. */
export const POLITICA_FALTA_PADRAO =
  "Se não puder vir, pedimos que avise com pelo menos 24h de antecedência, para liberar o horário para outro paciente.";
export const POLITICA_CANCELAMENTO_PADRAO =
  "Dá para remarcar avisando com pelo menos 24h de antecedência.";

export const CONDICOES_PADRAO: CondicoesDoConsultorio = {
  formas: ["pix", "cartao", "dinheiro"],
  parcelasMax: null,
  jurosAPartir: null,
  parcelaMinima: null,
  avaliacaoGratuita: true,
  avaliacaoValor: null,
  avaliacaoAbate: false,
  politicaFalta: "",
  politicaCancelamento: "",
  precoHarmonizacao: false,
};

function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// deno-lint-ignore no-explicit-any
export function condicoesDoBanco(row: any): CondicoesDoConsultorio {
  if (!row) return { ...CONDICOES_PADRAO };
  const validas = new Set(FORMAS_DE_PAGAMENTO.map((f) => f.id));
  const formas = Array.isArray(row.formas_pagamento)
    ? (row.formas_pagamento as unknown[])
        .map(String)
        .filter((f): f is FormaDePagamento => validas.has(f as FormaDePagamento))
    : CONDICOES_PADRAO.formas;
  return {
    formas,
    parcelasMax: numero(row.parcelas_max),
    jurosAPartir: numero(row.juros_a_partir),
    parcelaMinima: numero(row.parcela_minima),
    avaliacaoGratuita: row.avaliacao_gratuita !== false,
    avaliacaoValor: numero(row.avaliacao_valor),
    avaliacaoAbate: row.avaliacao_abate === true,
    politicaFalta: String(row.politica_falta ?? "").trim(),
    politicaCancelamento: String(row.politica_cancelamento ?? "").trim(),
    precoHarmonizacao: row.preco_harmonizacao === true,
  };
}

/** "R$ 1.074" ou "R$ 179,90", com espaço comum (o de `style: currency` é
 *  um espaço especial que a IA copia e o WhatsApp mostra estranho). */
export function reais(v: number): string {
  const n = v.toLocaleString("pt-BR", {
    minimumFractionDigits: Number.isInteger(v) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `R$ ${n}`;
}

/** A frase sobre a avaliação, do jeito que a assistente deve dizer. */
export function fraseDaAvaliacao(c: CondicoesDoConsultorio): string {
  if (c.avaliacaoGratuita) return "A avaliação é sem custo; o procedimento é pago.";
  if (c.avaliacaoValor === null) {
    return "A avaliação tem custo, mas o valor não está cadastrado: diga que vai confirmar.";
  }
  return (
    `A avaliação custa ${reais(c.avaliacaoValor)}` +
    (c.avaliacaoAbate ? ", e esse valor é descontado se a pessoa fizer o tratamento." : ".")
  );
}

/** Como parcela, numa frase. `null` quando não há nada estruturado. */
export function fraseDoParcelamento(c: CondicoesDoConsultorio): string | null {
  if (!c.formas.includes("cartao") || !c.parcelasMax) return null;
  if (c.parcelasMax === 1) return "No cartão, só à vista.";
  let t = `No cartão, em até ${c.parcelasMax}x`;
  if (c.jurosAPartir === null || c.jurosAPartir > c.parcelasMax) t += " sem juros";
  else if (c.jurosAPartir <= 2) t += " com juros";
  else t += `, sem juros até ${c.jurosAPartir - 1}x e com juros a partir de ${c.jurosAPartir}x`;
  if (c.parcelaMinima) t += `, parcela mínima de ${reais(c.parcelaMinima)}`;
  return t + ".";
}

/**
 * A seção de condições comerciais da instrução. O texto livre antigo de
 * parcelamento (`ai_agents.parcelamento`) vale enquanto o consultório não
 * cadastrar as parcelas.
 */
export function secaoDeCondicoes(
  c: CondicoesDoConsultorio,
  parcelamentoLivre?: string | null,
): string[] {
  const rotulos = c.formas
    .map((f) => FORMAS_DE_PAGAMENTO.find((x) => x.id === f)?.rotulo)
    .filter(Boolean) as string[];
  const linhas = ["## Condições de pagamento e políticas", ""];
  linhas.push(`- ${fraseDaAvaliacao(c)}`);
  if (rotulos.length) linhas.push(`- Formas de pagamento: ${rotulos.join(", ")}.`);
  const parcelas = fraseDoParcelamento(c) ?? String(parcelamentoLivre ?? "").trim();
  if (parcelas) linhas.push(`- Parcelamento: ${parcelas}`);
  linhas.push(`- Falta: ${c.politicaFalta || POLITICA_FALTA_PADRAO}`);
  linhas.push(
    `- Cancelamento e remarcação: ${c.politicaCancelamento || POLITICA_CANCELAMENTO_PADRAO}`,
  );
  linhas.push(
    "",
    "Use só o que está aqui. O que não estiver (juros, desconto, outra forma de",
    "pagamento), diga que vai confirmar com a equipe.",
  );
  return linhas;
}

// ── Campanhas ─────────────────────────────────────────────────────────────

export interface ItemDeCampanha {
  nome: string;
  precoVista: number | null;
  parcelas: number | null;
  valorParcela: number | null;
}

export interface Campanha {
  id: string;
  nome: string;
  inicio: string;
  fim: string;
  ativo: boolean;
  itens: ItemDeCampanha[];
  observacoes: string | null;
}

// deno-lint-ignore no-explicit-any
export function campanhaDoBanco(r: any): Campanha {
  const itens = Array.isArray(r?.itens) ? r.itens : [];
  return {
    id: String(r.id),
    nome: String(r.nome ?? "").trim(),
    inicio: String(r.inicio).slice(0, 10),
    fim: String(r.fim).slice(0, 10),
    ativo: r.ativo !== false,
    // deno-lint-ignore no-explicit-any
    itens: itens
      .map((i: any) => ({
        nome: String(i?.nome ?? "").trim(),
        precoVista: numero(i?.precoVista),
        parcelas: numero(i?.parcelas),
        valorParcela: numero(i?.valorParcela),
      }))
      .filter((i: ItemDeCampanha) => i.nome),
    observacoes: String(r.observacoes ?? "").trim() || null,
  };
}

/** Só as ativas e dentro do período (`hoje` = "YYYY-MM-DD" no fuso da clínica). */
export function campanhasValidas(lista: Campanha[], hoje: string): Campanha[] {
  return lista.filter((c) => c.ativo && c.itens.length && c.inicio <= hoje && hoje <= c.fim);
}

function diaMes(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

export function secaoDeCampanhas(lista: Campanha[], hoje: string): string[] {
  const validas = campanhasValidas(lista, hoje);
  if (!validas.length) return [];
  const linhas = ["## Campanhas valendo agora", ""];
  for (const c of validas) {
    linhas.push(`### ${c.nome} (de ${diaMes(c.inicio)} a ${diaMes(c.fim)})`, "");
    for (const i of c.itens) {
      const partes: string[] = [];
      if (i.precoVista !== null) partes.push(`${reais(i.precoVista)} à vista`);
      if (i.parcelas && i.valorParcela !== null) {
        partes.push(
          `${i.parcelas}x de ${reais(i.valorParcela)} (total ${reais(i.parcelas * i.valorParcela)})`,
        );
      }
      linhas.push(`- ${i.nome}: ${partes.join(" ou ") || "valor não cadastrado"}`);
    }
    if (c.observacoes) linhas.push("", c.observacoes);
    linhas.push("");
  }
  linhas.push(
    "Estes valores valem por cima da tabela e da regra de harmonização, só",
    "durante o período. Diga que é condição da campanha, com o nome dela, sem",
    'inventar urgência ("últimas vagas"). O que a campanha não define (regiões,',
    "ml, sessões), diga que é definido na avaliação. Não some itens nem crie",
    "desconto extra. Não vale para paciente modelo.",
  );
  return linhas;
}

// ── O manual-base de quem ainda não tem manual próprio ─────────────────────

/**
 * O jeito de atender de um consultório novo, que ainda não tem conversas para
 * a assistente aprender nem um manual escrito. Tirado dos princípios da Luna
 * V4.2 sem nada da NÓS: acolher, entender, informar, conduzir.
 */
export const MANUAL_PADRAO: Required<ManualDeVendas> = {
  tom:
    "Acolhedora, natural e objetiva, como uma recepcionista experiente no WhatsApp. " +
    "Frases curtas, linguagem do dia a dia, no máximo um emoji quando combinar. Reaja ao " +
    'que a pessoa contou ("Ah, entendi!", "Claro!") antes de seguir, sem bordão repetido ' +
    "e sem elogio exagerado.",
  saudacao:
    "Cumprimente, diga seu nome e que é da equipe do consultório, e responda ao que a pessoa " +
    "perguntou. Na primeira mensagem não dê preço nem horário: primeiro entenda o que ela procura.",
  etapas: [
    {
      nome: "Acolher e entender",
      sinais: "Primeiro contato, pergunta genérica ou vinda de anúncio.",
      objetivo: "Saber o que a pessoa procura, com uma pergunta curta.",
      proximo_passo: "Explicar o procedimento ou responder a dúvida.",
    },
    {
      nome: "Explicar e gerar confiança",
      sinais: "A pessoa disse o que quer ou fez uma dúvida.",
      objetivo: "Explicar de forma simples como funciona e o que a avaliação define.",
      proximo_passo: "Informar o valor da tabela, se houver.",
    },
    {
      nome: "Valor e condições",
      sinais: "Interesse claro ou pergunta de preço.",
      objetivo: "Dar o valor e as condições cadastradas, sem cardápio.",
      proximo_passo: "Oferecer dois horários reais.",
    },
    {
      nome: "Agendar",
      sinais: "A pessoa quer marcar ou aceitou o valor.",
      objetivo: "Oferecer dois horários da lista e confirmar o escolhido.",
      proximo_passo: "Confirmar dia, horário e endereço.",
    },
  ],
  descoberta:
    "Uma pergunta por vez, curta, numa mensagem própria. Pergunte só o que muda a resposta: " +
    "o que a pessoa procura e, se fizer diferença, se já fez antes. Nunca repita o que ela já disse.",
  duvidas_de_procedimento:
    "Explique em poucas frases, sem termos técnicos e sem prometer resultado. A indicação é " +
    "sempre da avaliação. Dor, sintoma ou urgência: oriente procurar a equipe e não diagnostique.",
  apresentacao_preco:
    "Quando a pessoa perguntar ou o interesse estiver claro, informe o valor da tabela e as " +
    "condições de pagamento cadastradas, de uma vez, sem esconder. Uma oferta pertinente basta. " +
    "Sem valor na tabela, diga que depende da avaliação.",
  objecoes: [
    {
      objecao: "Está caro",
      resposta:
        "Reconheça, explique o que está incluído e as formas de pagamento. Não dê desconto que não está cadastrado.",
    },
    {
      objecao: "Vou pensar",
      resposta: "Respeite, deixe a porta aberta e ofereça tirar alguma dúvida que tenha ficado.",
    },
    {
      objecao: "Tenho medo de doer ou de ficar artificial",
      resposta:
        "Acolha o receio, explique que a avaliação existe para alinhar expectativa e que o planejamento é individual.",
    },
  ],
  agendamento:
    "Ofereça dois horários reais da lista, em dias diferentes quando der. Quando a pessoa escolher, " +
    "confirme dia, horário e endereço. Nunca invente horário.",
  fechamento:
    "Conduza com leveza para o próximo passo concreto (avaliação ou horário), sem pressão e sem " +
    "urgência inventada. Se a pessoa sumir, não insista na mesma mensagem.",
  observacoes:
    'Nunca diga "anotei" ou "registrado": continue a conversa com uma informação útil. Não ' +
    "encaminhe para a equipe o que você consegue responder com o que está nesta instrução.",
};

function vazio(v: unknown): boolean {
  if (Array.isArray(v)) return v.length === 0;
  return !String(v ?? "").trim();
}

/** O manual do consultório, com o padrão em cada campo que ainda está vazio. */
export function comManualPadrao(manual: ManualDeVendas | null | undefined): ManualDeVendas {
  const m: ManualDeVendas = { ...(manual ?? {}) };
  for (const k of Object.keys(MANUAL_PADRAO) as (keyof ManualDeVendas)[]) {
    // deno-lint-ignore no-explicit-any
    if (vazio(m[k])) (m as any)[k] = MANUAL_PADRAO[k];
  }
  return m;
}
