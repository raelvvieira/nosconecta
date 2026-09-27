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

const CONFIRMA = ["sim", "s", "confirmo", "confirmar", "confirmado", "ok", "okay", "beleza", "1"];
const REMARCA = ["nao", "n", "cancelar", "cancela", "cancelo", "remarcar", "desmarcar", "2"];

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
  const palavras = semAcento(String(texto ?? ""))
    .toLowerCase()
    .split(/[\s,.!?;:]+/)
    .filter(Boolean);
  const confirma = palavras.some((p) => CONFIRMA.includes(p));
  const remarca = palavras.some((p) => REMARCA.includes(p));
  if (confirma && !remarca) return "confirma";
  if (remarca && !confirma) return "remarca";
  return "indefinida";
}

/** O que a mensagem que chegou tem de ter para valer a pena olhar. */
export interface MensagemParaTratar {
  fromMe: boolean;
  ehGrupo: boolean;
  body: string | null;
  phone: string | null;
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
  const decisao = classificarResposta(texto);
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
