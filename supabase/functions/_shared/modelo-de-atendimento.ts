// A chamada ao modelo que responde o paciente — hoje a API da OpenAI.
//
// Separada do resto para que `atendimento.ts` não dependa do provedor: quem
// orquestra não precisa saber qual IA responde, e a simulação roda o caminho
// inteiro trocando só esta peça. Foi essa separação que fez a troca de
// provedor caber em três pontos de chamada.
//
// ── Por que `fetch` e não o SDK ─────────────────────────────────────────
//
// O SDK exigiria fixar uma versão de pacote npm dentro do Deno, e a versão
// certa é exatamente o tipo de coisa que envelhece sem avisar. A API de
// `chat/completions` é estável há anos e cabe em vinte linhas de `fetch` — e
// aqui isso vale mais que açúcar de sintaxe.
//
// ── Por que o modelo NÃO tem padrão chutado ─────────────────────────────
//
// O nome do modelo vem da coluna `ai_agents.model`, escolhido numa lista que a
// tela busca na conta da própria clínica. Não há valor de reserva de
// propósito: um padrão chutado erra calado — a chamada falha com "model not
// found" no meio de um atendimento, e quem vê é o paciente esperando. Sem
// modelo escolhido, o erro é explícito e acontece na tela de configuração,
// onde alguém pode agir.

import { usoDaResposta, type UsoDoModelo } from "./consumo-da-ia.ts";

const ENDERECO = "https://api.openai.com/v1/chat/completions";

/**
 * A chave que vai ser usada.
 *
 * A da clínica, gravada na tela do agente, tem precedência. O segredo do
 * ambiente fica como reserva, para quem preferir guardar a chave fora do banco.
 */
export function chaveEmUso(chaveDaClinica?: string | null): string | null {
  return chaveDaClinica?.trim() || Deno.env.get("OPENAI_API_KEY") || null;
}

export function temChave(chaveDaClinica?: string | null): boolean {
  return !!chaveEmUso(chaveDaClinica);
}

/** O formato de resposta como os módulos de prompt o descrevem. */
export interface FormatoPedido {
  type: "json_schema";
  schema: Record<string, unknown>;
}

/**
 * Palavras de JSON Schema que o modo estrito da OpenAI RECUSA.
 *
 * Isto não é zelo: `FORMATO_DAS_SUGESTOES` pede `maxItems: 3` e
 * `FORMATO_DO_MANUAL` pede `minItems: 0`. Mandados como estão, a API devolve
 * 400 e nenhuma das duas telas funciona — o aprendizado e os cards de sugestão
 * morreriam juntos, com um erro que não diz qual palavra ofendeu.
 *
 * O limite de tamanho da lista continua valendo, só não pelo esquema: quem
 * consome corta em `QUANTAS_SUGESTOES`.
 */
const PALAVRAS_RECUSADAS = [
  "minItems",
  "maxItems",
  "minLength",
  "maxLength",
  "pattern",
  "format",
  "default",
  "minimum",
  "maximum",
];

/**
 * Traduz o esquema para o que a OpenAI aceita em modo estrito.
 *
 * Duas coisas acontecem aqui, e as duas são exigência da API:
 *
 *   **As palavras recusadas saem**, recursivamente — ver acima.
 *
 *   **`required` passa a listar TODAS as propriedades.** No modo estrito não
 *   existe campo opcional: a API recusa um objeto cujo `required` não cubra o
 *   `properties` inteiro. Em vez de confiar que quem escreveu o esquema
 *   lembrou disso, esta função completa a lista — assim acrescentar um campo
 *   novo ao manual amanhã não derruba o aprendizado.
 *
 * Pura de propósito: é o que permite conferir a tradução no teste, sem rede.
 */
export function paraModoEstrito(no: unknown): unknown {
  if (Array.isArray(no)) return no.map(paraModoEstrito);
  if (!no || typeof no !== "object") return no;

  const entrada = no as Record<string, unknown>;
  const saida: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(entrada)) {
    if (PALAVRAS_RECUSADAS.includes(chave)) continue;
    saida[chave] = paraModoEstrito(valor);
  }

  if (saida.type === "object" && saida.properties && typeof saida.properties === "object") {
    saida.required = Object.keys(saida.properties as Record<string, unknown>);
    // O modo estrito também exige a recusa explícita de campos extras.
    saida.additionalProperties = false;
  }
  return saida;
}

/** O `response_format` da OpenAI a partir do formato pedido. */
export function formatoDeResposta(formato: FormatoPedido, nome: string) {
  return {
    type: "json_schema" as const,
    json_schema: {
      name: nome,
      strict: true,
      schema: paraModoEstrito(formato.schema) as Record<string, unknown>,
    },
  };
}

/**
 * Este erro é o do teto de tokens ter mudado de nome?
 *
 * Os modelos mais novos recusam `max_tokens` e exigem
 * `max_completion_tokens`; os mais antigos fazem o contrário. Como o modelo é
 * escolhido pela clínica numa lista, os dois casos existem de verdade — e a
 * diferença é um 400 com uma frase, não uma capacidade diferente.
 *
 * Então a primeira tentativa vai no nome novo e, só se a API reclamar DESTE
 * parâmetro, a segunda vai no antigo. Nunca às cegas: repetir toda chamada
 * falha dobraria o custo de um erro de verdade.
 */
export function ehErroDeTetoDeTokens(mensagem: string): boolean {
  const m = String(mensagem ?? "").toLowerCase();
  return (
    (m.includes("max_completion_tokens") || m.includes("max_tokens")) &&
    (m.includes("unsupported") ||
      m.includes("not supported") ||
      m.includes("use ") ||
      m.includes("instead"))
  );
}

/** O texto de uma resposta da OpenAI, ou "" quando ela recusou. */
export function textoDaResposta(json: unknown): string {
  const escolha = (json as { choices?: { message?: { content?: unknown; refusal?: unknown } }[] })
    ?.choices?.[0]?.message;
  // Recusa NUNCA vira mensagem para o paciente. Cair calado é melhor do que
  // mandar um texto de recusa para quem perguntou sobre limpeza.
  if (escolha?.refusal) return "";
  return typeof escolha?.content === "string" ? escolha.content.trim() : "";
}

export interface PedidoAoModelo {
  chave?: string | null;
  /** `ai_agents.model`. Sem ele a função recusa, em vez de chutar. */
  modelo?: string | null;
  /**
   * Vai como `system`: é o que carrega o manual e as regras invioláveis.
   *
   * Opcional porque duas das três chamadas não têm instrução separada — o
   * aprendizado e as sugestões mandam um prompt único, que já se explica. Criar
   * um `system` de enfeite para elas só daria mais um texto para divergir do
   * prompt de verdade.
   */
  instrucao?: string;
  /** Vai como `user`. */
  pergunta: string;
  maxTokens: number;
  formato?: FormatoPedido;
  /** Nome do esquema, exigido pela OpenAI. Só quando há `formato`. */
  nomeDoFormato?: string;
  /**
   * Chamado com o que a chamada gastou, quando ela dá certo.
   *
   * É um aviso, e não um retorno, por um motivo: este arquivo existe para o
   * resto do sistema não precisar saber qual IA responde, e gravar no banco
   * aqui dentro o amarraria ao Supabase. Quem chama já tem o dono e a sessão
   * em mãos e passa `anotarConsumo` — ver `_shared/consumo-da-ia.ts`.
   *
   * Opcional porque a simulação da tela também passa por aqui, e uma prévia
   * que ninguém enviou não devia entrar na conta do mês.
   */
  anotarUso?: (uso: UsoDoModelo) => void;
}

/**
 * Uma chamada ao modelo. Devolve o texto, ou "" se ele recusou.
 *
 * Lança com mensagem legível em tudo que é configuração — sem chave, sem
 * modelo, modelo inexistente —, porque esses erros são consertáveis por uma
 * pessoa numa tela, e engoli-los transformaria "a IA não respondeu" no
 * mistério que o registro de mensagens existe para acabar.
 */
export async function chamarModelo(p: PedidoAoModelo): Promise<string> {
  const chave = chaveEmUso(p.chave);
  if (!chave) {
    throw new Error("A chave da IA não está configurada. Informe-a em Agente de IA → Chave da IA.");
  }
  const modelo = p.modelo?.trim();
  if (!modelo) {
    throw new Error(
      "Nenhum modelo escolhido. Escolha um em Agente de IA → Chave da IA — a lista vem da sua conta OpenAI.",
    );
  }

  const base: Record<string, unknown> = {
    model: modelo,
    messages: [
      ...(p.instrucao?.trim() ? [{ role: "system", content: p.instrucao }] : []),
      { role: "user", content: p.pergunta },
    ],
    ...(p.formato
      ? { response_format: formatoDeResposta(p.formato, p.nomeDoFormato ?? "resposta") }
      : {}),
  };

  // `temperature` não é enviado de propósito: parte dos modelos recusa
  // qualquer valor diferente do padrão, e o padrão é o que se quer aqui.
  let json = await postar(chave, { ...base, max_completion_tokens: p.maxTokens });
  if (json.erro && ehErroDeTetoDeTokens(json.erro)) {
    json = await postar(chave, { ...base, max_tokens: p.maxTokens });
  }
  if (json.erro) throw new Error(`A OpenAI recusou a chamada: ${json.erro}`);

  // Depois do erro e antes do texto: chamada recusada não gasta token, e uma
  // resposta cujo texto não dá para ler gastou do mesmo jeito — a medição não
  // pode depender de o conteúdo ter vindo no formato esperado.
  if (p.anotarUso) {
    const uso = usoDaResposta(json.corpo, modelo);
    if (uso) p.anotarUso(uso);
  }

  return textoDaResposta(json.corpo);
}

async function postar(
  chave: string,
  corpo: Record<string, unknown>,
): Promise<{ corpo?: unknown; erro?: string }> {
  const res = await fetch(ENDERECO, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${chave}` },
    body: JSON.stringify(corpo),
    // Um atendimento preso esperando o modelo é alguém esperando no WhatsApp.
    signal: AbortSignal.timeout(120_000),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (json as { error?: { message?: string } })?.error?.message ?? `HTTP ${res.status}`;
    return { erro: msg };
  }
  return { corpo: json };
}

/** Teto de saída da resposta ao paciente. Curto de propósito: ela vai para o
 *  WhatsApp, e um paredão de texto é o que a segmentação existe para evitar. */
const MAX_TOKENS_DA_RESPOSTA = 2000;

/**
 * O pedido que vai ao modelo: a conversa, o que está sem resposta, e o que não
 * fazer com isso.
 *
 * Separado de `responderPaciente` porque é a parte que decide o comportamento
 * e a única que dá para conferir sem chamar modelo nenhum. O teste exerce esta
 * função; a de baixo só leva o resultado até a API.
 */
export function pedidoDeResposta(historico: string, mensagens: string[]): string {
  const bloco = (mensagens ?? []).map((m) => String(m ?? "").trim()).filter(Boolean);

  // ── Por que o bloco, e não a última bolha ───────────────────────────────
  //
  // No WhatsApp a pessoa pensa em voz alta: "Oii tudo", "Boa tarde", "Nunca
  // fiz", "Aonde fica consultório". São quatro eventos e um pensamento só.
  // Pedir "responda à mensagem que acabou de chegar" fazia o modelo escolher
  // uma delas e tratar as outras como pano de fundo — e como o pano de fundo
  // continha a pergunta do endereço, toda execução respondia o endereço de
  // novo. Em 29/09 saíram três respostas quase idênticas por causa disto.
  //
  // Uma bolha só continua caindo aqui: uma lista de um item é o caso comum, e
  // não precisa de outro caminho no código.
  const pedido =
    bloco.length > 1
      ? [
          "O paciente mandou estas mensagens seguidas, e nenhuma foi respondida ainda:",
          ...bloco.map((m) => `- ${m}`),
          "",
          `Leia as ${bloco.length} juntas: são um pensamento só, partido em várias`,
          "bolhas. Escreva UMA resposta para o conjunto, na ordem que fizer sentido",
          "para a pessoa. Não responda uma por uma.",
        ].join("\n")
      : `Mensagem que acabou de chegar do paciente:\n${bloco[0] ?? ""}`;

  return [
    historico ? `Conversa até agora:\n${historico}` : "Esta é a primeira mensagem da conversa.",
    "",
    pedido,
    "",
    // A conversa acima vem rotulada com VOCÊ, e é dela que sai esta conta: o
    // que está marcado VOCÊ já chegou ao paciente e não precisa chegar de novo.
    "Não repita informação que você já deu nesta conversa. Se o endereço, o",
    "preço ou o horário já estão acima marcados com VOCÊ, a pessoa já leu:",
    "siga de onde parou em vez de recomeçar.",
    "",
    "Responda como a clínica responderia. Só a mensagem, sem aspas e sem",
    "explicar o que você está fazendo.",
  ].join("\n");
}

/**
 * Responde o que o paciente mandou e ainda não foi respondido.
 *
 * A instrução vai em `system` — é ela que carrega o manual e as regras que não
 * podem ser quebradas. O histórico vai como conteúdo do usuário, não como
 * turnos alternados de verdade: remontar turnos a partir do espelho daria
 * margem a inverter quem disse o quê. Rótulo explícito ("VOCÊ" / "PACIENTE") é
 * mais difícil de errar.
 */
/** O que a IA devolve: a fala, e o código do horário quando ela fechou um. */
export interface RespostaAoPaciente {
  texto: string;
  /** `H1`, `R2`… ou vazio. Validado em `agendamento-da-ia.ts`, não aqui. */
  horarioFechado: string;
}

/**
 * O formato da resposta.
 *
 * ── Por que JSON e não um marcador no texto ───────────────────────────────
 *
 * A alternativa era pedir `[AGENDAR: H2]` no fim da fala e recortar com regex.
 * Mais simples de escrever e pior de viver com: o marcador vaza para o
 * WhatsApp no dia em que o recorte falhar, e quem recebe é a paciente. Num
 * campo separado ele não tem como vazar — a fala e o código nunca moram na
 * mesma string.
 *
 * `horarioFechado` é string sempre presente, e vazia quando não houve
 * fechamento, em vez de opcional: o modo estrito da OpenAI exige todo campo no
 * `required`, e "presente e vazio" é mais difícil de errar que "às vezes
 * existe".
 */
const FORMATO_DA_RESPOSTA: FormatoPedido = {
  type: "json_schema",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["resposta", "horarioFechado"],
    properties: {
      resposta: {
        type: "string",
        description: "A mensagem para o paciente, como a clínica escreveria.",
      },
      horarioFechado: {
        type: "string",
        description:
          "O código do horário que a pessoa acabou de aceitar (H1, H2, R1…), exatamente como está na lista. Vazio quando ela não aceitou nenhum.",
      },
    },
  },
};

export async function responderPaciente(
  instrucao: string,
  historico: string,
  mensagens: string[],
  chaveDaClinica?: string | null,
  modelo?: string | null,
  anotarUso?: (uso: UsoDoModelo) => void,
): Promise<RespostaAoPaciente> {
  const bruto = await chamarModelo({
    chave: chaveDaClinica,
    modelo,
    instrucao,
    pergunta: pedidoDeResposta(historico, mensagens),
    maxTokens: MAX_TOKENS_DA_RESPOSTA,
    formato: FORMATO_DA_RESPOSTA,
    nomeDoFormato: "resposta_ao_paciente",
    anotarUso,
  });
  return lerRespostaAoPaciente(bruto);
}

/**
 * O JSON do modelo virando resposta.
 *
 * Tolerante de propósito, e sempre com um texto: se o modelo devolver algo que
 * não é o JSON pedido, o que ele devolveu É a fala. A paciente esperando no
 * WhatsApp não pode ficar sem resposta porque um campo veio com outro nome —
 * perder o agendamento automático é ruim, perder a resposta é pior.
 */
export function lerRespostaAoPaciente(bruto: string): RespostaAoPaciente {
  const cru = String(bruto ?? "").trim();
  if (!cru) return { texto: "", horarioFechado: "" };
  try {
    const obj = JSON.parse(cru) as { resposta?: unknown; horarioFechado?: unknown };
    if (!obj || typeof obj !== "object") return { texto: cru, horarioFechado: "" };
    const texto = typeof obj.resposta === "string" ? obj.resposta.trim() : "";
    const codigo = typeof obj.horarioFechado === "string" ? obj.horarioFechado.trim() : "";
    // JSON válido sem o campo `resposta` não é a resposta: é outro objeto. Cai
    // para o texto cru, que ao menos é algo que alguém escreveu.
    return texto ? { texto, horarioFechado: codigo } : { texto: cru, horarioFechado: "" };
  } catch {
    return { texto: cru, horarioFechado: "" };
  }
}
