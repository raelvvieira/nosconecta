// O que a Luna recebe para escrever uma retomada, e como a resposta é lida.
//
// O manual inteiro continua indo como instrução (`instrucaoDaLuna`), igual ao
// atendimento: é dele que sai o jeito de falar. Este pedido só acrescenta o
// porquê DESTE toque, num bloco estruturado que o backend preenche: trilha,
// etapa, mecanismo, o que já foi tentado e o que ficou em aberto.
//
// ── O que tem de sair daqui ─────────────────────────────────────────────
//
// Uma mensagem que continua a conversa, no tom que a pessoa usou, com um motivo
// novo para ela responder. "Ainda tem interesse?" mandado quatro vezes com
// palavras diferentes é o que este pedido existe para impedir.
import type { FormatoPedido } from "./modelo-de-atendimento.ts";
import type { Intensidade, Mecanismo, Trilha } from "./recuperacao.ts";

/** O mecanismo em português, como o manual o descreve (Parte D, D4). */
export const COMO_E_O_MECANISMO: Record<Mecanismo, string> = {
  PRESENCE_CHECK:
    "Chamar a atenção de leve. Curtíssimo, pelo nome se você souber, como uma pessoa faria.",
  PATTERN_INTERRUPT:
    "Quebrar o padrão com algo leve e simpático que não pareça cobrança. Sem pressão nenhuma.",
  OPEN_LOOP:
    "Retomar a pergunta importante que ficou aberta, de um jeito que mostre que você lembra do que ela disse.",
  SOCIAL_PROOF:
    "Mostrar um caso real do catálogo de casos, pertinente ao procedimento de interesse. Nunca inventar depoimento, resultado ou paciente.",
  USEFUL_INFORMATION:
    "Contar um detalhe verdadeiro do procedimento que ajude a pessoa a decidir. Sem fingir que conhece uma queixa que ela não contou.",
  OBJECTION_ISOLATION:
    "Descobrir com delicadeza o que travou: valor, forma de pagamento, medo, tempo ou agenda. Uma pergunta só.",
  FRICTION_REDUCTION:
    "Simplificar a decisão. Por exemplo, perguntar só se é melhor de manhã, à tarde ou no fim do dia.",
  SCHEDULE_OPPORTUNITY:
    "Oferecer um horário real da lista de horários, só se houver motivo novo para isso.",
  SOCIAL_ACCOUNTABILITY: "Lembrar com leveza um combinado que a própria pessoa fez, sem culpa.",
  BREAKUP:
    "Despedida curta e gentil: tirar a pressão, dizer que vai parar de chamar e deixar a porta aberta. Sem cobrança e sem culpa.",
};

/**
 * As estratégias que o Motor de Recuperação V2 (Parte D6 da MD) acrescentou
 * às dez que o sistema já planejava. O sistema continua escolhendo QUANDO e
 * QUANTAS (o plano), e sugere um mecanismo; o Motor pode trocar pela estratégia
 * que o diagnóstico da conversa pedir, e a que ele de fato usou é a que fica
 * registrada. Cada uma com a função, em uma linha, para o pedido.
 */
export const ESTRATEGIAS_DO_MOTOR: Record<string, string> = {
  RELATIONAL_CHECK_IN:
    "saber como a situação evoluiu, sem exigir compra (só com vínculo e conversa anterior)",
  CONTEXTUAL_REMEMBRANCE: "retomar um interesse que a pessoa disse com as próprias palavras",
  UNRESOLVED_QUESTION: "oferecer a resposta a uma dúvida real que ficou em aberto",
  RELEVANT_ALTERNATIVE:
    "apresentar outra modalidade, só quando a original não encaixou e a alternativa existe",
  EXPERIENCE_PREVIEW:
    "explicar como será ser atendida, quando não conhecer a experiência é o obstáculo",
  TIMELY_CONTEXT: "ligar a retomada a um momento real e autêntico, nunca a uma data artificial",
  VERIFIED_AVAILABILITY_CHANGE:
    "avisar uma novidade concreta e verificável (vaga, nova turma), nunca inventada",
  SERVICE_RECOVERY: "corrigir um atendimento que deixou dúvida, informação ou promessa sem retorno",
  HUMAN_TRUST_BRIDGE: "sugerir o contato real do responsável (vira sugestão interna, não promessa)",
  CONTRAST: "saber se a necessidade foi resolvida em outro lugar, em contato antigo com vínculo",
  GRACEFUL_CLOSE:
    "encerrar sem cobrança, só quando a sequência esgotou (é o BREAKUP, com outro nome)",
};

/** O nome que fica registrado: GRACEFUL_CLOSE e BREAKUP são a mesma coisa, e a
 *  medição antiga (BREAKUP) não pode ganhar uma segunda coluna. */
export function nomeRegistrado(
  usado: string,
  planejado: string,
  planejados: readonly string[],
): string {
  const nome = String(usado ?? "")
    .trim()
    .toUpperCase();
  if (nome === "GRACEFUL_CLOSE") return "BREAKUP";
  if (planejados.includes(nome) || nome in ESTRATEGIAS_DO_MOTOR) return nome;
  return planejado;
}

/** O que cada trilha pede de cuidado, além do mecanismo. */
const CUIDADO_DA_TRILHA: Partial<Record<Trilha, string>> = {
  INITIAL_NO_RESPONSE:
    "A pessoa ainda não respondeu nada a você. Não finja intimidade nem cite queixa que ela não disse.",
  ACTIVE_CONVERSATION_DROP:
    "Vocês estavam conversando. Continue de onde parou, como quem lembra da conversa.",
  PRICE_SILENCE: "Ela já recebeu o preço. Não repita o valor nem o parcelamento.",
  SCHEDULE_IGNORED:
    "Ela já recebeu horários e não escolheu. Não ofereça horários de novo, a menos que o mecanismo seja SCHEDULE_OPPORTUNITY.",
  SAID_WILL_THINK: "Ela pediu tempo para pensar. Respeite: nada de pressa nem de pressão.",
  PROMISED_CALLBACK: "Hoje é o dia que vocês combinaram de retomar. Retome o combinado.",
  AWAITING_DATA:
    "Ela já escolheu e falta só um dado para concluir. Peça só o que falta, sem recomeçar a venda.",
  AWAITING_RESERVATION:
    "Ela demonstrou interesse na reserva. Facilite concluir essa etapa, sem pressionar pagamento.",
};

export interface ContextoDaRetomada {
  trilha: Trilha;
  intensidade: Intensidade;
  etapa: number;
  totalDeEtapas: number;
  mecanismo: Mecanismo;
  mecanismosAnteriores: Mecanismo[];
  perguntaAberta: string;
  pessoaJaRespondeu: boolean;
  minutosDeSilencio: number;
  /** Se esta retomada substitui as que a noite engoliu. */
  depoisDaNoite: boolean;
  temCasos: boolean;
}

/** O pedido que vai ao modelo. Puro, para o teste conferir o que vai nele. */
export function pedidoDaRetomada(ctx: ContextoDaRetomada, historico: string): string {
  const contexto = {
    recovery_track: ctx.trilha,
    recovery_intensity: ctx.intensidade,
    followup_step: ctx.etapa,
    followup_steps_total: ctx.totalDeEtapas,
    suggested_mechanism: ctx.mecanismo,
    previous_mechanisms: ctx.mecanismosAnteriores,
    last_open_loop: ctx.perguntaAberta || null,
    lead_has_replied: ctx.pessoaJaRespondeu,
    minutes_of_silence: Math.round(ctx.minutosDeSilencio),
  };
  const silencio =
    ctx.minutosDeSilencio < 90
      ? `${Math.round(ctx.minutosDeSilencio)} minutos`
      : `cerca de ${Math.round(ctx.minutosDeSilencio / 60)} horas`;

  return [
    "Esta conversa parou e você vai decidir se vale retomá-la e, se valer, como. Siga a Parte D do seu manual (Motor de Recuperação).",
    "",
    `Conversa até agora:\n${historico}`,
    "",
    `A pessoa não responde faz ${silencio}.`,
    ctx.depoisDaNoite ? "É a primeira mensagem do dia depois da noite. Não comente o horário." : "",
    "",
    "Estado da recuperação, calculado pelo sistema:",
    "```json",
    JSON.stringify(contexto, null, 2),
    "```",
    "",
    `Mecanismo que o sistema sugere para esta etapa: ${ctx.mecanismo}. ${COMO_E_O_MECANISMO[ctx.mecanismo]}`,
    "É uma sugestão: se o diagnóstico da conversa pedir outra estratégia da Parte D, escolha-a e diga qual em mecanismoUsado. Estas também valem:",
    ...Object.entries(ESTRATEGIAS_DO_MOTOR).map(([nome, funcao]) => `- ${nome}: ${funcao}.`),
    CUIDADO_DA_TRILHA[ctx.trilha] ?? "",
    ctx.mecanismosAnteriores.length
      ? `Já usados nesta sequência: ${ctx.mecanismosAnteriores.join(", ")}. Não repita a mesma abordagem com outras palavras.`
      : "",
    ctx.mecanismo === "SOCIAL_PROOF" && ctx.temCasos
      ? "Se um caso do catálogo combinar com o procedimento dela, ponha o código dele em casoEnviado."
      : "",
    "",
    "Como escrever:",
    "- Continue a conversa, não recomece e não se apresente de novo.",
    "- Acompanhe o tom que a pessoa usou: se ela escreveu curto e informal, você também.",
    "- Uma ou duas frases, do tamanho do que alguém digita no celular.",
    "- Emoji só se fizer sentido, e no máximo um.",
    "- Proibido: 'ainda tem interesse?', 'só passando para…', 'você sumiu', 'não recebi resposta', e dizer que é mensagem automática.",
    "- Não repita o que já está acima marcado com VOCÊ. Não invente preço, horário, endereço ou caso.",
    "",
    "Não enviar é uma decisão válida (NO_MESSAGE no manual). Se não houver razão nova, verdadeira e diferente da última tentativa, ou se algo impedir o contato, responda com pular = true e diga o motivo em motivoDePular, com um código curto como no_valid_reason, user_requested_pause, already_converted, human_owner, offer_expired ou sensitive_context.",
    "Uma mensagem vazia é pior que nenhuma. Não prometa ação que só o sistema pode fazer (agendar, gravar vídeo, criar tarefa).",
  ]
    .filter((linha, i, todas) => linha !== "" || todas[i - 1] !== "")
    .join("\n");
}

/** O formato da resposta da retomada. Mesmo modo estrito do atendimento. */
export const FORMATO_DA_RETOMADA: FormatoPedido = {
  type: "json_schema",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["mensagem", "mecanismoUsado", "pular", "motivoDePular", "casoEnviado"],
    properties: {
      mensagem: {
        type: "string",
        description: "A mensagem para a pessoa. Vazia quando pular for true.",
      },
      mecanismoUsado: {
        type: "string",
        description:
          "A estratégia que a mensagem de fato usa, com o nome do manual (OPEN_LOOP, UNRESOLVED_QUESTION…). Vazio quando pular for true.",
      },
      pular: {
        type: "boolean",
        description: "true quando não há nada útil e novo para dizer nesta etapa.",
      },
      motivoDePular: {
        type: "string",
        description:
          "Quando pular for true, o código curto do motivo (no_valid_reason, human_owner…). Vazio quando a mensagem vai.",
      },
      casoEnviado: {
        type: "string",
        description: "O código do caso (C1, C2…) a mandar junto, ou vazio. Vazio é o normal.",
      },
    },
  },
};

export interface RetomadaEscrita {
  mensagem: string;
  mecanismoUsado: string;
  pular: boolean;
  /** Por que a Luna decidiu não enviar (vazio quando enviou). */
  motivoDePular: string;
  casoEnviado: string;
}

/** A resposta do modelo virando retomada. Na dúvida, pula: aqui não há
 *  paciente esperando, e mandar um JSON cru seria pior que não mandar. */
export function lerRetomada(bruto: string): RetomadaEscrita {
  const nada: RetomadaEscrita = {
    mensagem: "",
    mecanismoUsado: "",
    pular: true,
    motivoDePular: "",
    casoEnviado: "",
  };
  try {
    const o = JSON.parse(String(bruto ?? "").trim()) as Record<string, unknown>;
    if (!o || typeof o !== "object") return nada;
    const mensagem = typeof o.mensagem === "string" ? o.mensagem.trim() : "";
    return {
      mensagem,
      mecanismoUsado: typeof o.mecanismoUsado === "string" ? o.mecanismoUsado.trim() : "",
      pular: o.pular === true || !mensagem,
      // Só o código curto: vai para o registro, que não é lugar de texto livre.
      motivoDePular:
        typeof o.motivoDePular === "string"
          ? o.motivoDePular
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9_]/g, "_")
              .slice(0, 40)
          : "",
      casoEnviado: typeof o.casoEnviado === "string" ? o.casoEnviado.trim() : "",
    };
  } catch {
    return nada;
  }
}
