// Varredura diária que transforma "o tempo passou" num evento de automação.
//
// Toda automação até aqui era reativa: alguém criava um agendamento, pagava um
// recebimento, movia um card. Metade do que uma clínica quer automatizar não é
// assim — "avise 3 dias antes", "cobre quem sumiu há 6 meses" — e não havia
// gatilho nenhum para isso.
//
// Esta função NÃO inventa mecanismo. Ela varre situações e despacha o mesmo
// `dispatch` que `atendimento-automations` já recebe dos 6 pontos do app, com
// o mesmo formato de contexto. Condições, ações, espera, janela de horário,
// cota diária e o painel de Execuções continuam valendo sem tocar em nada.
//
// Cron diário às 08:00 BRT (ver a migration irmã). O horário importa: é o
// mesmo de `send-appointment-reminders`, e mandar lembrete de madrugada é
// exatamente o que a janela de horário das automações existe para evitar.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { soOSistema } from "../_shared/so-o-sistema.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const TZ = "America/Sao_Paulo";

/** Quantos dias antes da consulta esta varredura avisa.
 *
 *  São dias EXATOS, não intervalos — e é isso que faz cada agendamento entrar
 *  uma vez só em cada momento, sem precisar de tabela de controle: o dia passa
 *  e ele não se qualifica mais. */
const ANTECEDENCIAS = [3, 1, 0] as const;

/** Data no fuso da clínica, deslocada em N dias.
 *
 *  `en-CA` porque seu formato já é YYYY-MM-DD, e `Intl` em vez de aritmética
 *  de offset porque o horário de verão quebraria a conta — mesma técnica de
 *  `whatsapp-inbound-webhook` e de `src/lib/date.ts`. Somar os dias ANTES de
 *  formatar (e não depois) mantém a soma no calendário local.
 */
function dataDaClinica(offsetDias: number): string {
  const agora = new Date();
  const local = new Date(agora.getTime() + offsetDias * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(local);
}

async function despachar(ownerId: string, systemEvent: string, context: unknown): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/atendimento-automations`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ ownerId, action: "dispatch", systemEvent, context }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`dispatch respondeu ${res.status}: ${await res.text()}`);
}

/**
 * Marca que este agendamento já foi tratado neste momento, e diz se é a
 * primeira vez.
 *
 * Reaproveita `appointment_notifications`, que já tem
 * `UNIQUE (appointment_id, kind, channel)` — o banco recusa a segunda tentativa
 * sozinho. Sem isso, um cron que rodasse duas vezes (retry da plataforma, ou
 * alguém chamando a função na mão para testar) mandaria o lembrete duplicado.
 *
 * `channel: "automation"` separa do que as notificações por e-mail/SMS já
 * gravam ali, para os dois caminhos não se confundirem.
 */
async function primeiraVez(appointmentId: string, ownerId: string, kind: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("appointment_notifications")
    .insert({
      appointment_id: appointmentId,
      owner_id: ownerId,
      kind,
      channel: "automation",
      status: "sent",
      sent_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();
  // Violação de unicidade é o caminho ESPERADO na segunda passada — não é erro
  // a registrar, é a resposta "alguém já cuidou disto".
  if (error) return false;
  return !!data;
}

// ── "A consulta terminou" ────────────────────────────────────────────────
//
// Varredura de CADA MINUTO (cron `automation-encerradas`), no mesmo arquivo
// porque o despacho, a trava contra repetição e o contexto são os mesmos da
// diária. Emite `appointment.ended` quando o horário FINAL de uma consulta
// confirmada (ou já concluída) passa — e a espera até a mensagem ("10 minutos
// depois") é um card da própria automação, editável na tela.
//
// Duas travas contra o que seria um desastre no primeiro minuto de vida:
//  - só olha consultas de ontem e hoje que terminaram há MENOS de seis horas:
//    sem isso, a primeira rodada avisaria todo paciente confirmado do passado;
//  - cada consulta entra UMA vez (`appointment_notifications`, mesmo padrão).
// "Pendente" não conta — a pessoa não confirmou — mas uma consulta que a
// recepção confirmar ou concluir depois do fim, ainda dentro das seis horas,
// entra na rodada seguinte.
const JANELA_DAS_ENCERRADAS_MIN = 6 * 60;
const KIND_ENCERRADA = "automation_encerrada";

/** O instante, em UTC, de "data + hora" no relógio da clínica. */
function instanteDaClinica(data: string, hora: string): Date | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hora ?? ""));
  if (!m || !/^\d{4}-\d{2}-\d{2}$/.test(String(data ?? ""))) return null;
  const comoUtc = new Date(`${data}T${m[1].padStart(2, "0")}:${m[2]}:00Z`);
  if (Number.isNaN(comoUtc.getTime())) return null;
  // O deslocamento do fuso NAQUELE dia ("GMT-03:00"), e não uma constante: se o
  // horário de verão voltar, a conta continua certa.
  const nome = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "longOffset" })
    .formatToParts(comoUtc)
    .find((p) => p.type === "timeZoneName")?.value;
  const d = /GMT([+-])(\d{2}):(\d{2})/.exec(nome ?? "");
  const minutos = d ? (d[1] === "-" ? -1 : 1) * (Number(d[2]) * 60 + Number(d[3])) : 0;
  return new Date(comoUtc.getTime() - minutos * 60_000);
}

async function varrerEncerradas(): Promise<Record<string, number>> {
  const resultado: Record<string, number> = { despachados: 0, repetidos: 0, falhas: 0 };
  const { data: agendamentos, error } = await supabase
    .from("appointments")
    .select(
      "id, owner_id, patient_id, date, start_time, end_time, procedure_name, professional_name, unit_id, status",
    )
    .in("date", [dataDaClinica(-1), dataDaClinica(0)])
    .in("status", ["confirmed", "completed"]);
  if (error) {
    console.error("[automation-scheduled] falha ao buscar as encerradas:", error);
    resultado.falhas++;
    return resultado;
  }

  const agora = Date.now();
  const terminadas = ((agendamentos ?? []) as any[]).filter((ap) => {
    if (!ap.owner_id) return false;
    const fim = instanteDaClinica(ap.date, ap.end_time);
    if (!fim) return false;
    const passou = agora - fim.getTime();
    return passou >= 0 && passou <= JANELA_DAS_ENCERRADAS_MIN * 60_000;
  });
  if (!terminadas.length) return resultado;

  // Quem já foi tratado, numa consulta só — evita uma tentativa de insert por
  // consulta a cada minuto durante seis horas.
  const { data: jaTratadas } = await supabase
    .from("appointment_notifications")
    .select("appointment_id")
    .eq("kind", KIND_ENCERRADA)
    .eq("channel", "automation")
    .in(
      "appointment_id",
      terminadas.map((a) => a.id),
    );
  const tratadas = new Set((jaTratadas ?? []).map((n: any) => n.appointment_id));

  for (const ap of terminadas) {
    if (tratadas.has(ap.id)) continue;
    if (!(await primeiraVez(ap.id, ap.owner_id, KIND_ENCERRADA))) {
      resultado.repetidos++;
      continue;
    }
    const { data: paciente } = await supabase
      .from("patients")
      .select("name, crm_contact_id")
      .eq("id", ap.patient_id ?? "")
      .maybeSingle();
    try {
      await despachar(ap.owner_id, "appointment.ended", {
        entityId: ap.id,
        appointmentId: ap.id,
        patientId: ap.patient_id ?? null,
        crmContactId: paciente?.crm_contact_id ?? null,
        contactName: paciente?.name ?? null,
        status: ap.status ?? null,
        appointment: {
          date: ap.date ?? null,
          startTime: ap.start_time ?? null,
          procedureName: ap.procedure_name ?? null,
          professionalName: ap.professional_name ?? null,
          unitId: ap.unit_id ?? null,
        },
      });
      resultado.despachados++;
    } catch (e) {
      console.error(`[automation-scheduled] encerrada falhou em ${ap.id}:`, e);
      resultado.falhas++;
      // Solta a marca: a próxima rodada tenta de novo, dentro da janela.
      await supabase
        .from("appointment_notifications")
        .delete()
        .eq("appointment_id", ap.id)
        .eq("kind", KIND_ENCERRADA)
        .eq("channel", "automation");
    }
  }
  return resultado;
}

Deno.serve(async (_req) => {
  const barrado = soOSistema(_req);
  if (barrado) return barrado;
  const corpo = await _req.json().catch(() => ({}));
  if (corpo?.modo === "encerradas") {
    return new Response(JSON.stringify({ ok: true, ...(await varrerEncerradas()) }), {
      headers: { "content-type": "application/json" },
    });
  }
  const resultado: Record<string, number> = { despachados: 0, repetidos: 0, falhas: 0 };

  for (const dias of ANTECEDENCIAS) {
    const data = dataDaClinica(dias);
    const { data: agendamentos, error } = await supabase
      .from("appointments")
      .select(
        "id, owner_id, patient_id, date, start_time, procedure_name, professional_name, unit_id, status",
      )
      .eq("date", data)
      .neq("status", "cancelled");
    if (error) {
      console.error(`[automation-scheduled] falha ao buscar D-${dias}:`, error);
      resultado.falhas++;
      continue;
    }

    for (const ap of (agendamentos ?? []) as any[]) {
      if (!ap.owner_id) continue;
      const kind = `automation_reminder_d${dias}`;
      if (!(await primeiraVez(ap.id, ap.owner_id, kind))) {
        resultado.repetidos++;
        continue;
      }

      // Nome do paciente para {{nome}}: uma consulta por agendamento, e só
      // para os que passaram pelo dedup acima.
      const { data: paciente } = await supabase
        .from("patients")
        .select("name, crm_contact_id")
        .eq("id", ap.patient_id ?? "")
        .maybeSingle();

      try {
        await despachar(ap.owner_id, "appointment.reminder_due", {
          entityId: ap.id,
          appointmentId: ap.id,
          patientId: ap.patient_id ?? null,
          crmContactId: paciente?.crm_contact_id ?? null,
          contactName: paciente?.name ?? null,
          status: ap.status ?? null,
          daysUntil: dias,
          appointment: {
            date: ap.date ?? null,
            startTime: ap.start_time ?? null,
            procedureName: ap.procedure_name ?? null,
            professionalName: ap.professional_name ?? null,
            unitId: ap.unit_id ?? null,
          },
        });
        resultado.despachados++;
      } catch (e) {
        console.error(`[automation-scheduled] dispatch falhou em ${ap.id}:`, e);
        resultado.falhas++;
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, ...resultado }), {
    headers: { "content-type": "application/json" },
  });
});
