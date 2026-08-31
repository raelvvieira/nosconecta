// O manual aprendido vira a instrução que o agente recebe ao atender.
//
// ── A decisão mais importante deste arquivo ────────────────────────────────
//
// As regras de repasse para humano NÃO vêm do manual. São fixas, moram em
// código e não são editáveis por ninguém — nem pela IA, nem pela tela.
//
// O manual ensina COMO vender. Estas regras definem QUANDO parar de vender.
// São eixos diferentes e precisam de origens diferentes: se as regras de
// repasse saíssem do manual aprendido, bastaria UMA conversa em que a
// vendedora contornou um pedido de "quero falar com uma pessoa" e fechou
// mesmo assim para a IA aprender que dá para ignorar o pedido.
//
// Numa clínica odontológica a regra de saúde é a mais crítica das quatro. Um
// agente que responde sobre dor em vez de chamar alguém não é um detalhe de
// produto — é risco real para uma pessoa.
//
// ── Por que mora só aqui ───────────────────────────────────────────────────
//
// Este arquivo não é espelhado em `src/`, ao contrário de `phone.ts` e
// `variaveis-disparo.ts`. A tela mostra a instrução pedindo a PREVIEW a esta
// função, e não montando um texto próprio: uma cópia em `src/` poderia divergir
// da que de fato é enviada, e aí a tela mostraria regras de segurança que não
// são as que estão valendo. Melhor uma ida ao servidor do que essa mentira.

/** Os sete campos que o aprendizado extrai. */
export interface ManualDeVendas {
  tom?: string | null;
  saudacao?: string | null;
  descoberta?: string | null;
  apresentacao_preco?: string | null;
  objecoes?: { objecao?: string | null; resposta?: string | null }[] | null;
  fechamento?: string | null;
  observacoes?: string | null;
}

export const CAMPOS_DO_MANUAL = [
  "tom",
  "saudacao",
  "descoberta",
  "apresentacao_preco",
  "objecoes",
  "fechamento",
  "observacoes",
] as const;

/**
 * Quando o agente para de vender e chama uma pessoa. Não negociável.
 *
 * A ordem não é alfabética nem histórica: saúde vem primeiro porque é a que
 * tem consequência física, e quem lê a lista de cima para baixo — inclusive um
 * modelo de linguagem — dá mais peso ao primeiro item.
 */
export const REGRAS_DE_REPASSE = [
  "O assunto envolver saúde, dor, sintoma, sangramento, inchaço, urgência ou emergência — mesmo que a pessoa pareça estar só perguntando.",
  "O cliente pedir para falar com uma pessoa, atendente ou humano, ou pedir que liguem para ele.",
  "O cliente demonstrar irritação, reclamação, insatisfação ou ameaçar cancelar.",
  "O assunto envolver dinheiro fora do padrão: pedido de desconto, negociação, cobrança ou reembolso.",
] as const;

/** Um procedimento que o agente pode citar e precificar. */
export interface ProcedimentoDoAgente {
  nome: string;
  preco: number | null;
  duracaoMinutos?: number | null;
  categoria?: string | null;
}

export interface EntradaDaInstrucao {
  clinica: string;
  manual: ManualDeVendas;
  procedimentos: ProcedimentoDoAgente[];
}

const AUSENTE = "(a IA ainda não aprendeu isso — seja natural e, na dúvida, pergunte.)";

function presente(valor: string | null | undefined): string {
  const t = String(valor ?? "").trim();
  return t || AUSENTE;
}

function listaDeObjecoes(lista: ManualDeVendas["objecoes"]): string {
  const linhas = (lista ?? [])
    .filter((o) => String(o?.objecao ?? "").trim())
    .map((o) => `- Quando o cliente disser algo como "${String(o.objecao).trim()}":\n  ${String(o.resposta ?? "").trim()}`);
  return linhas.length ? linhas.join("\n") : "(nenhuma objeção aprendida ainda.)";
}

function precoEmReais(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return "sob consulta";
  return `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * A tabela de preços que o agente pode citar.
 *
 * Lista vazia NÃO vira seção vazia: vira uma proibição explícita de falar
 * preço. Um agente sem tabela que encontra a pergunta "quanto custa?" inventa
 * um número, e num negócio de serviço esse é o pior erro possível — o paciente
 * chega na clínica com um preço na cabeça que ninguém combinou.
 */
function tabelaDePrecos(procedimentos: ProcedimentoDoAgente[]): string {
  if (!procedimentos.length) {
    return [
      "## Preços",
      "Você NÃO tem tabela de preços liberada. Se perguntarem valor de qualquer",
      "coisa, diga que vai confirmar e passe a conversa para uma pessoa. Nunca",
      "estime, nunca dê faixa, nunca diga 'em torno de'.",
    ].join("\n");
  }
  const linhas = procedimentos.map((p) => {
    const dur = p.duracaoMinutos ? ` · ${p.duracaoMinutos} min` : "";
    return `- ${p.nome}: ${precoEmReais(p.preco)}${dur}`;
  });
  return [
    "## Preços que você pode informar",
    "Estes, e somente estes. Perguntaram de algo que não está na lista? Diga que",
    "vai confirmar e passe para uma pessoa.",
    "",
    ...linhas,
  ].join("\n");
}

/**
 * Monta a instrução completa. Função pura: mesma entrada, mesmo texto — é o
 * que permite exercitá-la sem servidor, sem modelo e sem enviar nada a
 * ninguém.
 */
export function montarInstrucao({ clinica, manual, procedimentos }: EntradaDaInstrucao): string {
  const partes = [
    `Você atende pacientes por WhatsApp em nome de ${clinica}.`,
    "",
    "Você aprendeu a atender lendo as conversas reais que fecharam venda nesta",
    "clínica. Siga o método abaixo — ele é o jeito desta clínica atender, não um",
    "roteiro genérico de vendas.",
    "",
    "## Como falar",
    presente(manual.tom),
    "",
    "## Como começar a conversa",
    presente(manual.saudacao),
    "",
    "## O que descobrir antes de oferecer",
    presente(manual.descoberta),
    "",
    "## Quando e como falar de preço",
    presente(manual.apresentacao_preco),
    "",
    "## Como responder às dúvidas mais comuns",
    listaDeObjecoes(manual.objecoes),
    "",
    "## Como conduzir para a decisão",
    presente(manual.fechamento),
  ];

  const obs = String(manual.observacoes ?? "").trim();
  if (obs) partes.push("", "## Outros pontos importantes", obs);

  partes.push("", tabelaDePrecos(procedimentos));

  partes.push(
    "",
    "## REGRAS QUE VOCÊ NUNCA PODE QUEBRAR",
    "",
    "1. Passe a conversa para uma pessoa IMEDIATAMENTE se qualquer uma destas",
    "   situações acontecer:",
    ...REGRAS_DE_REPASSE.map((r) => `   - ${r}`),
    "",
    "2. Nunca invente informação. Se não souber preço, horário, disponibilidade,",
    "   endereço, nome de profissional ou qualquer dado que não esteja acima,",
    "   diga que vai confirmar e passe para uma pessoa.",
    "",
    "3. Nunca dê orientação clínica, diagnóstico, nome de remédio ou conduta —",
    "   nem para tranquilizar. Isso vale mesmo que a pergunta pareça simples.",
    "",
    "4. Nunca prometa prazo, desconto, resultado ou condição que não apareça",
    "   explicitamente no método acima.",
    "",
    "5. Nunca discuta com o paciente e nunca insista depois de um \"não\".",
    "",
    "6. Escreva como alguém daqui escreveria: mensagens curtas, em português do",
    "   Brasil, sem parecer robô e sem se identificar como inteligência",
    "   artificial a menos que perguntem diretamente.",
  );

  return partes.join("\n");
}

/**
 * O manual como a tela mostra: aprendido, com as correções por cima.
 *
 * `overrides` só sobrepõe onde de fato tem conteúdo. Um campo vazio no
 * override significa "não corrigi este", não "apague o que a IA aprendeu" —
 * sem esta checagem, abrir a tela de correção e salvar sem digitar nada
 * zeraria o manual inteiro.
 */
export function manualEfetivo(
  learned: ManualDeVendas | null | undefined,
  overrides: ManualDeVendas | null | undefined,
): ManualDeVendas {
  const base: Record<string, unknown> = { ...(learned ?? {}) };
  for (const [chave, valor] of Object.entries(overrides ?? {})) {
    if (valor === null || valor === undefined) continue;
    if (typeof valor === "string" && !valor.trim()) continue;
    if (Array.isArray(valor) && valor.length === 0) continue;
    base[chave] = valor;
  }
  return base as ManualDeVendas;
}
