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
    "Esta conversa parou e você vai retomá-la, seguindo a Parte D do seu manual (Recovery Engine).",
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
    `Mecanismo desta retomada: ${ctx.mecanismo}. ${COMO_E_O_MECANISMO[ctx.mecanismo]}`,
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
    "Se não houver nada útil e novo para dizer nesta etapa, não escreva: responda com pular = true.",
    "O manual diz que só se volta com motivo novo, e uma mensagem vazia é pior que nenhuma.",
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
    required: ["mensagem", "mecanismoUsado", "pular", "casoEnviado"],
    properties: {
      mensagem: {
        type: "string",
        description: "A mensagem para a pessoa. Vazia quando pular for true.",
      },
      mecanismoUsado: {
        type: "string",
        description: "O mecanismo que a mensagem de fato usa, com o nome do manual (OPEN_LOOP…).",
      },
      pular: {
        type: "boolean",
        description: "true quando não há nada útil e novo para dizer nesta etapa.",
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
  casoEnviado: string;
}

/** A resposta do modelo virando retomada. Na dúvida, pula: aqui não há
 *  paciente esperando, e mandar um JSON cru seria pior que não mandar. */
export function lerRetomada(bruto: string): RetomadaEscrita {
  const nada: RetomadaEscrita = { mensagem: "", mecanismoUsado: "", pular: true, casoEnviado: "" };
  try {
    const o = JSON.parse(String(bruto ?? "").trim()) as Record<string, unknown>;
    if (!o || typeof o !== "object") return nada;
    const mensagem = typeof o.mensagem === "string" ? o.mensagem.trim() : "";
    return {
      mensagem,
      mecanismoUsado: typeof o.mecanismoUsado === "string" ? o.mecanismoUsado.trim() : "",
      pular: o.pular === true || !mensagem,
      casoEnviado: typeof o.casoEnviado === "string" ? o.casoEnviado.trim() : "",
    };
  } catch {
    return nada;
  }
}
