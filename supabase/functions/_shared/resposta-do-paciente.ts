// "SIM" / "NÃO" — a resposta do paciente ao lembrete de véspera.
//
// ── O buraco que isto fecha ─────────────────────────────────────────────
//
// O lembrete de 1 dia antes termina com "Responda SIM para confirmar ou NÃO
// se precisar remarcar". A regra que lê essa resposta existe e está ativa
// desde 22/08, e **nunca rodou**: ela é acordada pelo
// `whatsapp-inbound-webhook`, que ouve o Brevo — e as mensagens passaram a
// sair pela Evolution. O paciente respondia, a mensagem entrava na conversa, e
// a agenda continuava "Pendente".
//
// Medido em 27/09: `appointment_notification_replies` com zero linhas,
// `automation_runs` com zero execuções de `whatsapp.reply_received`.
//
// ── Por que não é "toda mensagem de paciente" ───────────────────────────
//
// Esta é a parte perigosa, e é o motivo de a janela existir.
//
// A regra da clínica usa `contains` em cima do texto: "sim" em qualquer lugar
// da frase confirma. "Assim que puder eu te falo" **contém** "sim". Se
// qualquer mensagem de quem tem consulta marcada fosse tratada como resposta,
// uma conversa comum de terça marcaria a consulta de sábado como confirmada —
// e ninguém saberia de onde veio.
//
// Então só conta como resposta a mensagem que chega DEPOIS de um lembrete que
// a clínica mandou, dentro de `JANELA_DE_RESPOSTA_EM_HORAS`. Fora da janela é
// conversa, e conversa não mexe na agenda.
//
// ── Falha fechada ───────────────────────────────────────────────────────
//
// Erro em qualquer passo devolve "não tratei" e NÃO mexe em nada. O espelho já
// gravou a mensagem quando isto roda; o pior resultado aceitável é a resposta
// não ser lida, nunca a consulta errada mudar de estado.
import { variantesDoNumero } from "./phone-match.ts";
import { chamarModelo } from "./modelo-de-atendimento.ts";
import { anotarConsumo } from "./consumo-da-ia.ts";

/**
 * Quanto tempo depois do lembrete uma mensagem ainda é "a resposta".
 *
 * 36 horas, e não 24: o lembrete sai às 08:00 da véspera, e quem responde na
 * manhã seguinte — já no dia da consulta — está respondendo àquilo. 24 horas
 * cravadas cortariam exatamente essas pessoas. Mais que isso começa a pegar
 * conversa de outro assunto.
 */
export const JANELA_DE_RESPOSTA_EM_HORAS = 36;

/** Os avisos que pedem resposta. Só eles abrem a janela. */
export const LEMBRETES_QUE_PEDEM_RESPOSTA = [
  "automation_reminder_d1",
  "automation_reminder_d0",
  "reminder_day_before",
  "reminder_day_of",
];

export type Classificacao = "confirma" | "remarca" | "indefinida";

/**
 * As palavras soltas que já decidem.
 *
 * ── Por que a lista cresceu ──────────────────────────────────────────────
 *
 * O lembrete pede "responda SIM ou NÃO", e as pessoas respondem como pessoas.
 * Em 29/09, das duas respostas que chegaram, NENHUMA era "sim": uma foi
 * "confirmo" e a outra "Olá, bom dia! Tudo bem? Presença confirmada 😊".
 *
 * Cada palavra aqui é uma que, sozinha, não deixa dúvida. "Pode" ficou DE
 * FORA de propósito: "pode remarcar?" é o contrário de confirmar.
 */
const CONFIRMA = [
  "sim",
  "s",
  "confirmo",
  "confirmado",
  "confirmada",
  "confirmar",
  "confirmando",
  "confirmamos",
  "ok",
  "okay",
  "okey",
  "blz",
  "beleza",
  "isso",
  "certo",
  "claro",
  "combinado",
  "positivo",
  "perfeito",
  "estarei",
  "1",
];

/**
 * Emoji que confirma sozinho.
 *
 * Lista SEPARADA das palavras, e a razão é um defeito que os testes antigos
 * pegaram na hora: emoji não sobrevive ao corte por pontuação, então precisa de
 * busca por pedaço de texto — e busca por pedaço aplicada às PALAVRAS faz o "s"
 * de "sim" casar dentro de "preci-s-o remarcar". A resposta "preciso remarcar"
 * virava "confirma e remarca ao mesmo tempo", ou seja, indefinida.
 */
const EMOJI_CONFIRMA = ["👍", "👌", "✅", "🙌", "🙏"];

const REMARCA = [
  "nao",
  "n",
  "cancelar",
  "cancela",
  "cancelo",
  "cancelado",
  "remarcar",
  "remarca",
  "remarcando",
  "desmarcar",
  "desmarca",
  "desmarcando",
  "adiar",
  "2",
];

/**
 * As expressões, para o que uma palavra sozinha não resolve.
 *
 * "Não vou poder" tem "nao" e já cairia certo; "tô indo" e "pode deixar" não
 * têm palavra nenhuma das listas acima. São frases inteiras porque o sentido
 * está na frase: "pode" sozinho não diz nada, "pode confirmar" diz tudo.
 */
const FRASES_CONFIRMA = [
  "pode confirmar",
  "pode deixar",
  "presenca confirmada",
  "presença confirmada",
  "estarei la",
  "estarei ai",
  "estarei presente",
  "vou estar",
  "to indo",
  "tou indo",
  "estou indo",
  "eu vou",
  "vou sim",
  "tudo certo",
  "ta certo",
  "esta certo",
  "confirmo presenca",
  "sem problema",
];

const FRASES_REMARCA = [
  "nao vou poder",
  "nao posso",
  "nao consigo",
  "nao vai dar",
  "nao da",
  "nao dara",
  "preciso remarcar",
  "quero remarcar",
  "gostaria de remarcar",
  "tem como remarcar",
  "vou precisar remarcar",
  "preciso desmarcar",
  "outro dia",
  "outro horario",
  "outra data",
  "mudar o horario",
  "mudar a data",
  "transferir a consulta",
];

function semAcento(valor: string): string {
  return valor.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * O que o paciente quis dizer.
 *
 * Compara PALAVRAS inteiras, não pedaços: "assim" não é "sim", e "não vou
 * poder" não é "ok". É a diferença entre esta função e o `contains` que a
 * regra da clínica usa — e o motivo de a janela acima existir mesmo assim,
 * porque quem decide, quando há regra ativa, é a regra.
 *
 * As duas palavras juntas ("sim, mas não nesse horário") dão `indefinida`: é
 * o caso em que adivinhar custa mais do que perguntar.
 */
export function classificarResposta(texto: string): Classificacao {
  const cru = String(texto ?? "");
  const normalizado = semAcento(cru).toLowerCase();
  const palavras = normalizado.split(/[\s,.!?;:]+/).filter(Boolean);

  const confirma =
    palavras.some((p) => CONFIRMA.includes(p)) ||
    // Muita gente responde só com o polegar. Emoji é procurado no texto cru
    // porque o corte por pontuação não o preserva em toda plataforma.
    EMOJI_CONFIRMA.some((e) => cru.includes(e)) ||
    FRASES_CONFIRMA.some((f) => normalizado.includes(semAcento(f).toLowerCase()));
  const remarca =
    palavras.some((p) => REMARCA.includes(p)) ||
    FRASES_REMARCA.some((f) => normalizado.includes(semAcento(f).toLowerCase()));

  if (confirma && !remarca) return "confirma";
  if (remarca && !confirma) return "remarca";
  return "indefinida";
}

/** O formato exigido quando a IA desempata. Três valores, e nada mais. */
export const FORMATO_DA_LEITURA = {
  type: "json_schema" as const,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["intencao", "porque"],
    properties: {
      intencao: { type: "string", enum: ["confirma", "remarca", "indefinida"] },
      /** Uma frase, para quem ler o aviso entender de onde veio a conclusão. */
      porque: { type: "string" },
    },
  },
};

/** O prompt do desempate. Puro: mesma entrada, mesmo texto. */
/**
 * O que a clínica perguntou, para a resposta poder ser lida.
 *
 * ── Por que isto existe ────────────────────────────────────────────────
 *
 * O prompt antigo trazia um lembrete INVENTADO, sempre o mesmo, e a resposta
 * do paciente solta embaixo. Em 01/10 o Daniel Costa respondeu "Tudo bem, pode
 * ser" e a IA devolveu "indefinida" — corretamente, porque lida no vácuo essa
 * frase responde "sim" tanto quanto responde "tanto faz".
 *
 * Com a pergunta de verdade junto, a mesma frase deixa de ser ambígua.
 */
export interface ContextoDaPergunta {
  /** A última mensagem que a clínica mandou antes da resposta, como ela saiu.
   *  Nula quando o espelho não tem — e aí o prompt volta ao texto genérico. */
  perguntaDaClinica: string | null;
  /** A consulta de que se fala, por extenso. */
  quando: string | null;
  procedimento: string | null;
}

/** Quanto da mensagem da clínica entra no prompt. Lembrete costuma caber;
 *  o teto existe para um modelo de mensagem gigante não virar o prompt
 *  inteiro e empurrar a resposta do paciente para o fim, onde ela pesa menos. */
const MAX_DA_PERGUNTA = 600;

/**
 * "2026-10-01" e "15:00" viram "quinta-feira, 1 de outubro, às 15:00".
 *
 * `T12:00:00` e não `T00:00:00`: `new Date("2026-10-01")` é meia-noite UTC,
 * que no Brasil é 21h do dia 30 — a consulta de quinta viraria quarta no
 * prompt. Meio-dia sobrevive a qualquer fuso.
 *
 * Nulo quando não há data: a frase some do prompt em vez de virar "Invalid
 * Date", que o modelo leria como informação.
 */
export function consultaPorExtenso(data: string | null, hora: string | null): string | null {
  if (!data) return null;
  const d = new Date(`${data}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const dia = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(d);
  const h = String(hora ?? "").slice(0, 5);
  return h ? `${dia}, às ${h}` : dia;
}

/**
 * O pedido que vai ao modelo.
 *
 * Com `contexto`, ele recebe a pergunta DE VERDADE que a clínica mandou. Sem,
 * cai no texto genérico de antes — que continua existindo porque o espelho
 * pode não ter a mensagem (clínica que mandou o lembrete por outro canal, ou
 * conversa que começou antes do espelho).
 */
export function promptDaLeitura(resposta: string, contexto?: ContextoDaPergunta): string {
  const pergunta = String(contexto?.perguntaDaClinica ?? "").trim();

  const cabecalho = pergunta
    ? [
        "Uma clínica odontológica mandou esta mensagem para um paciente:",
        "",
        `> ${pergunta.slice(0, MAX_DA_PERGUNTA).replace(/\n/g, "\n> ")}`,
      ]
    : [
        "Uma clínica odontológica mandou este lembrete para um paciente:",
        "",
        '> "Sua consulta é amanhã. Você confirma sua presença? Responda SIM para',
        '> confirmar ou NÃO se precisar remarcar."',
      ];

  // A consulta entra DEPOIS da pergunta e antes da resposta: é o que permite
  // ao modelo entender "pode ser" como "pode ser esse horário".
  const sobreAConsulta: string[] = [];
  if (contexto?.quando || contexto?.procedimento) {
    const partes = [contexto.procedimento, contexto.quando].filter(Boolean).join(" — ");
    sobreAConsulta.push("", `A consulta de que se fala: ${partes}.`);
  }

  return [
    ...cabecalho,
    ...sobreAConsulta,
    "",
    "O paciente respondeu:",
    "",
    `> ${resposta.replace(/\n/g, "\n> ")}`,
    "",
    "O que ele quis dizer?",
    "",
    '- "confirma" = vai comparecer.',
    '- "remarca" = não vai poder, quer outro dia ou horário, ou quer cancelar.',
    '- "indefinida" = qualquer outra coisa, inclusive pergunta, assunto',
    "  diferente, ou resposta que dá para ler dos dois jeitos.",
    "",
    'Leia a resposta COMO RESPOSTA À MENSAGEM ACIMA. Um "pode ser" ou "tudo',
    'bem" solto não quer dizer nada; respondendo a um pedido de confirmação,',
    "quer dizer que ele confirma.",
    "",
    'Na dúvida, responda "indefinida". Aqui, errar move a consulta de uma',
    "pessoa de verdade na agenda; não saber só faz alguém da equipe ler a",
    "mensagem e decidir.",
  ].join("\n");
}

/** O que a mensagem que chegou tem de ter para valer a pena olhar. */
export interface MensagemParaTratar {
  fromMe: boolean;
  ehGrupo: boolean;
  body: string | null;
  phone: string | null;
  /** A conversa no espelho, para achar a pergunta que a clínica fez. Opcional
   *  porque nem todo chamador tem; sem ela a leitura cai no texto genérico.
   *  O nome é o mesmo que `mensagemDoEvento` já devolve, então o webhook não
   *  precisou mudar nada. */
  crmConversationId?: string | null;
}

export interface ResultadoDaResposta {
  tratada: boolean;
  motivo?: string;
  acao?: string;
  appointmentId?: string;
}

/**
 * Trata a mensagem como possível resposta a um lembrete.
 *
 * Devolve `tratada: false` com um motivo legível para tudo que não é resposta
 * — que é a maioria absoluta das mensagens — em vez de lançar. O webhook
 * registra o motivo no retorno e segue; o espelho não pode depender disto.
 */
export async function tratarRespostaDoPaciente(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  ownerId: string,
  m: MensagemParaTratar,
  agora: Date = new Date(),
): Promise<ResultadoDaResposta> {
  if (m.fromMe) return { tratada: false, motivo: "mensagem da própria clínica" };
  if (m.ehGrupo) return { tratada: false, motivo: "grupo" };

  const texto = (m.body ?? "").trim();
  if (!texto) return { tratada: false, motivo: "sem texto" };

  const variantes = variantesDoNumero(m.phone);
  if (!variantes.length) return { tratada: false, motivo: "sem telefone" };

  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);

  const { data: candidatos, error: erroBusca } = await supabase.rpc("agendamento_por_telefone", {
    _owner: ownerId,
    _variantes: variantes,
    _hoje: hoje,
  });
  if (erroBusca) {
    console.warn("[resposta-do-paciente] busca falhou:", erroBusca.message);
    return { tratada: false, motivo: "busca falhou" };
  }
  // deno-lint-ignore no-explicit-any
  const linhas = (candidatos ?? []) as any[];
  if (!linhas.length) return { tratada: false, motivo: "sem consulta marcada" };

  // Mãe e filho no mesmo celular, os dois com consulta marcada: 207 números
  // nesta base são compartilhados por 447 fichas. Escolher um seria confirmar
  // a consulta de quem não respondeu.
  if (linhas.length > 1) {
    await registrarResposta(supabase, {
      ownerId,
      appointmentId: null,
      patientId: null,
      telefone: m.phone ?? "",
      texto,
      acao: "ambiguo",
    });
    await avisar(supabase, ownerId, {
      titulo: "Resposta de quem tem duas consultas",
      corpo: `${linhas.length} fichas com este número têm consulta marcada. Confira na agenda.`,
    });
    return { tratada: true, acao: "ambiguo" };
  }

  const ap = linhas[0];

  // ── A janela ──────────────────────────────────────────────────────────
  // Sem lembrete recente, isto é conversa comum, e conversa comum não mexe na
  // agenda. Ver o comentário longo no topo.
  const desde = new Date(agora.getTime() - JANELA_DE_RESPOSTA_EM_HORAS * 3600_000).toISOString();
  const { data: lembretes, error: erroLembrete } = await supabase
    .from("appointment_notifications")
    .select("kind")
    .eq("appointment_id", ap.appointment_id)
    .in("kind", LEMBRETES_QUE_PEDEM_RESPOSTA)
    .gte("created_at", desde)
    .limit(1);
  if (erroLembrete) {
    console.warn("[resposta-do-paciente] janela não conferida:", erroLembrete.message);
    return { tratada: false, motivo: "janela não conferida" };
  }
  if (!lembretes?.length) return { tratada: false, motivo: "nenhum lembrete recente" };

  // ── A leitura da resposta ─────────────────────────────────────────────
  //
  // Primeiro a lista de palavras e frases: é instantânea, não custa nada e
  // resolve a imensa maioria. O que sobra vai para a IA — e só o que sobra,
  // porque uma chamada de modelo por resposta seria gasto e lentidão para
  // decidir um "sim".
  let decisao = classificarResposta(texto);
  if (decisao === "indefinida") {
    // ── A pergunta, junto da resposta ───────────────────────────────────
    //
    // Só quando a lista de palavras não resolveu, porque é o único caso em que
    // a IA roda — e a leitura do espelho é uma consulta a mais que não faz
    // sentido pagar nas respostas que já saíram por "sim".
    //
    // Em 01/10 o Daniel respondeu "Tudo bem, pode ser" e a IA devolveu
    // "indefinida", corretamente: lida no vácuo, essa frase responde "sim"
    // tanto quanto responde "tanto faz". Faltava a pergunta.
    decisao = await lerComIa(supabase, ownerId, texto, {
      perguntaDaClinica: await ultimaPerguntaDaClinica(
        supabase,
        ownerId,
        m.crmConversationId ?? null,
        agora,
      ),
      quando: consultaPorExtenso(ap.data ?? null, ap.hora ?? null),
      procedimento: ap.procedure_name ?? null,
    });
  }

  // ── Quem decide ───────────────────────────────────────────────────────
  // Com regra ativa, o fluxo da clínica decide — é o que permite escrever as
  // próprias palavras ("blz", "tô indo") em vez de depender da lista fixa
  // acima. Aplicar as duas faria a mesma resposta ser tratada duas vezes, e a
  // clínica não teria como desligar o comportamento embutido.
  const { data: regra } = await supabase
    .from("automation_rules")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("trigger_event", "whatsapp.reply_received")
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (regra?.id) {
    await despacharParaAutomacao(ownerId, {
      entityId: ap.appointment_id,
      appointmentId: ap.appointment_id,
      patientId: ap.patient_id,
      contactName: ap.patient_name ?? null,
      status: ap.status ?? null,
      replyText: texto,
      // A leitura já feita. Sem isto o fluxo da clínica teria de adivinhar
      // vocabulário de conversa dentro de um campo de texto da tela.
      replyIntent: decisao,
      appointment: {
        date: ap.data ?? null,
        startTime: ap.hora ?? null,
        procedureName: ap.procedure_name ?? null,
        professionalName: ap.professional_name ?? null,
        unitId: ap.unit_id ?? null,
      },
    });
    await registrarResposta(supabase, {
      ownerId,
      appointmentId: ap.appointment_id,
      patientId: ap.patient_id,
      telefone: m.phone ?? "",
      texto,
      acao: "automation",
    });
    return { tratada: true, acao: "automation", appointmentId: ap.appointment_id };
  }

  // Sem regra: o comportamento embutido, igual ao que o caminho do Brevo fazia.
  let acao = "unmatched";
  if (decisao === "confirma") {
    const { error } = await supabase
      .from("appointments")
      .update({ status: "confirmed" })
      .eq("id", ap.appointment_id)
      .eq("owner_id", ownerId);
    acao = error ? "unmatched" : "confirmed";
  } else if (decisao === "remarca") {
    // Nunca cancelar por mensagem de texto. Quem cancela é uma pessoa, na
    // agenda, depois de falar com o paciente.
    acao = "declined";
  }

  await registrarResposta(supabase, {
    ownerId,
    appointmentId: ap.appointment_id,
    patientId: ap.patient_id,
    telefone: m.phone ?? "",
    texto,
    acao,
  });

  if (acao === "confirmed" || acao === "declined") {
    await avisar(supabase, ownerId, {
      titulo: acao === "confirmed" ? "Agendamento confirmado" : "Paciente quer remarcar",
      corpo:
        acao === "confirmed"
          ? `${ap.patient_name ?? "O paciente"} confirmou o agendamento.`
          : `${ap.patient_name ?? "O paciente"} respondeu pedindo para cancelar ou remarcar.`,
      appointmentId: ap.appointment_id,
      patientId: ap.patient_id,
    });
  }

  return { tratada: true, acao, appointmentId: ap.appointment_id };
}

/**
 * A última coisa que a clínica escreveu nesta conversa antes da resposta.
 *
 * É o que transforma "pode ser" de ambíguo em confirmação. Vem do espelho, e
 * não de `appointment_notifications`, porque lá só fica o TIPO do lembrete
 * ("24h antes") — o texto que a pessoa leu não é guardado em lugar nenhum
 * além do espelho.
 *
 * **Nunca levanta e nunca bloqueia.** Sem a pergunta, `promptDaLeitura` volta
 * ao texto genérico, que é como funcionava antes. Uma falha de leitura aqui
 * não pode impedir a resposta do paciente de ser classificada.
 */
async function ultimaPerguntaDaClinica(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  ownerId: string,
  conversationId: string | null,
  agora: Date,
): Promise<string | null> {
  if (!conversationId) return null;
  try {
    const { data, error } = await supabase
      .from("wa_messages")
      .select("body")
      .eq("owner_id", ownerId)
      .eq("crm_conversation_id", conversationId)
      .eq("from_me", true)
      .eq("is_private", false)
      .not("body", "is", null)
      // Teto no instante da resposta: sem ele, uma mensagem que a recepção
      // mandou DEPOIS entraria como "a pergunta", e o modelo leria a resposta
      // contra algo que o paciente ainda não tinha visto.
      .lte("sent_at", agora.toISOString())
      .order("sent_at", { ascending: false })
      .limit(1);
    if (error) {
      console.warn("[resposta-do-paciente] pergunta não lida:", error.message);
      return null;
    }
    const texto = String((data ?? [])[0]?.body ?? "").trim();
    return texto || null;
  } catch (e) {
    console.warn("[resposta-do-paciente] pergunta não lida:", e);
    return null;
  }
}

async function registrarResposta(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  r: {
    ownerId: string;
    appointmentId: string | null;
    patientId: string | null;
    telefone: string;
    texto: string;
    acao: string;
  },
): Promise<void> {
  const { error } = await supabase.from("appointment_notification_replies").insert({
    owner_id: r.ownerId,
    appointment_id: r.appointmentId,
    patient_id: r.patientId,
    channel: "whatsapp",
    from_phone: r.telefone || "(desconhecido)",
    message_text: r.texto,
    action: r.acao,
  });
  // Registro é para a tela de Notificações; perdê-lo não pode derrubar a
  // decisão que já foi tomada no agendamento.
  if (error) console.warn("[resposta-do-paciente] não registrou a resposta:", error.message);
}

async function avisar(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  ownerId: string,
  aviso: { titulo: string; corpo: string; appointmentId?: string; patientId?: string },
): Promise<void> {
  try {
    const { pushToOwner } = await import("./push.ts");
    // A caixa vai SEMPRE, com nulos explícitos quando não há agendamento: é o
    // registro durável, e `pushToOwner` retorna cedo sem VAPID ou sem aparelho
    // inscrito — era exatamente aí que o aviso sumia (ver o comentário em
    // `gravarNaCaixa`). `undefined` numa chave viraria coluna omitida no
    // insert; `null` é o que a coluna aceita.
    await pushToOwner(
      supabase,
      ownerId,
      "appointment_reply",
      { title: aviso.titulo, body: aviso.corpo, url: "/agenda" },
      { appointmentId: aviso.appointmentId ?? null, patientId: aviso.patientId ?? null },
    );
  } catch (e) {
    console.warn("[resposta-do-paciente] push não saiu:", e instanceof Error ? e.message : e);
  }
}

/**
 * Manda a resposta para o motor de automações.
 *
 * Falha engolida de propósito, igual aos outros pontos de dispatch do app:
 * automação quebrada não pode impedir o registro da resposta.
 */
/**
 * O desempate pela IA, para a resposta que a lista não resolveu.
 *
 * Fecha em "indefinida" em TODO caminho de erro: sem chave, sem modelo, chamada
 * que falhou, resposta ilegível, valor fora dos três esperados. Indefinida não
 * mexe na agenda — manda alguém da equipe ler a mensagem. É o único lado
 * seguro: aqui, errar move a consulta de uma pessoa de verdade.
 */
async function lerComIa(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  ownerId: string,
  texto: string,
  contexto: ContextoDaPergunta | undefined,
): Promise<Classificacao> {
  try {
    const { data: agente } = await supabase
      .from("ai_agents")
      .select("api_key, model")
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (!agente?.model) return "indefinida";

    const resposta = await chamarModelo({
      chave: agente.api_key ?? null,
      modelo: agente.model,
      pergunta: promptDaLeitura(texto, contexto),
      maxTokens: 300,
      formato: FORMATO_DA_LEITURA,
      nomeDoFormato: "leitura_da_resposta",
      anotarUso: (uso) => void anotarConsumo(supabase, ownerId, "leitura", uso),
    });
    if (!resposta) return "indefinida";

    const lido = JSON.parse(resposta) as { intencao?: string };
    const intencao = String(lido?.intencao ?? "");
    return intencao === "confirma" || intencao === "remarca" ? intencao : "indefinida";
  } catch (e) {
    console.warn("[resposta-do-paciente] IA não leu:", e instanceof Error ? e.message : e);
    return "indefinida";
  }
}

async function despacharParaAutomacao(
  ownerId: string,
  context: Record<string, unknown>,
): Promise<void> {
  try {
    // A leitura do ambiente fica DENTRO do try junto do fetch. Fora dele, um
    // ambiente sem as variáveis lançaria antes de alguém poder engolir o erro
    // — e este ponto é chamado de dentro do webhook, onde exceção vira 500 e
    // 500 faz a Evolution reenviar a mensagem.
    const url = Deno.env.get("SUPABASE_URL")!;
    const chave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    await fetch(`${url}/functions/v1/atendimento-automations`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${chave}` },
      body: JSON.stringify({
        ownerId,
        action: "dispatch",
        systemEvent: "whatsapp.reply_received",
        context,
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    console.error("[resposta-do-paciente] dispatch falhou:", e instanceof Error ? e.message : e);
  }
}
