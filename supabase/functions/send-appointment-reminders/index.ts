// Cron entry point, scheduled daily via pg_cron + pg_net
// (see 20260709210000_appointment_reminders_cron.sql). The cron job
// authenticates with the project's anon key, so this function stays
// JWT-protected like every other one (no verify_jwt override needed). It
// finds tomorrow's and today's appointments and forwards each to
// send-appointment-notification using the service role key from its own
// Edge Function environment.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { pushToOwner } from "../_shared/push.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ATENÇÃO ao mexer no cron desta função. `toISOString` devolve a data em UTC,
// e isto só coincide com a data de Brasília porque o agendamento é
// '0 11 * * *' — 11:00 UTC, 08:00 BRT, mesmo dia nos dois fusos. Rodar antes
// das 03:00 UTC faria "amanhã" virar "hoje" e os lembretes de véspera sairiam
// com um dia de atraso. Se o horário mudar, trocar por Intl.DateTimeFormat
// com timeZone "America/Sao_Paulo", como em whatsapp-inbound-webhook.
function dateStr(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

async function notify(appointmentId: string, kind: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-appointment-notification`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ appointmentId, kind }),
  });
  if (!res.ok) {
    console.error(`[send-appointment-reminders] falha em ${appointmentId} (${kind}): ${await res.text()}`);
  }
}

Deno.serve(async (_req) => {
  const tomorrow = dateStr(1);
  const today = dateStr(0);

  const [{ data: tomorrowAppts, error: tErr }, { data: todayAppts, error: yErr }] = await Promise.all([
    supabase.from("appointments").select("id").eq("date", tomorrow).neq("status", "cancelled"),
    // owner_id e horário entram por causa do resumo por push abaixo — os
    // lembretes em si só precisam do id.
    supabase
      .from("appointments")
      .select("id, owner_id, start_time")
      .eq("date", today)
      .neq("status", "cancelled"),
  ]);
  if (tErr || yErr) {
    console.error("[send-appointment-reminders]", tErr ?? yErr);
    return new Response(JSON.stringify({ error: String(tErr ?? yErr) }), { status: 500 });
  }

  await Promise.all([
    ...(tomorrowAppts ?? []).map((a) => notify(a.id, "reminder_day_before")),
    ...(todayAppts ?? []).map((a: any) => notify(a.id, "reminder_day_of")),
  ]);

  // Resumo do dia para a EQUIPE. Os lembretes acima vão para o paciente;
  // até agora ninguém da clínica era avisado de nada por aqui.
  const byOwner = new Map<string, string[]>();
  for (const appointment of (todayAppts ?? []) as any[]) {
    if (!appointment.owner_id) continue;
    const list = byOwner.get(appointment.owner_id) ?? [];
    list.push(String(appointment.start_time ?? "").slice(0, 5));
    byOwner.set(appointment.owner_id, list);
  }
  await Promise.all(
    [...byOwner.entries()].map(([ownerId, times]) => {
      const sorted = times.filter(Boolean).sort();
      const first = sorted[0];
      return pushToOwner(supabase, ownerId, "daily_agenda", {
        title: `${sorted.length} ${sorted.length === 1 ? "atendimento" : "atendimentos"} hoje`,
        body: first ? `O primeiro é às ${first}.` : "Confira a agenda do dia.",
        url: "/agenda",
      }).catch((e) => console.error("[send-appointment-reminders] push falhou:", e));
    }),
  );

  return new Response(
    JSON.stringify({
      ok: true,
      reminderDayBefore: tomorrowAppts?.length ?? 0,
      reminderDayOf: todayAppts?.length ?? 0,
    }),
    { headers: { "content-type": "application/json" } },
  );
});
