// Cron entry point — meant to be scheduled via Supabase's native Cron Jobs
// (Dashboard → Edge Functions → send-appointment-reminders → Cron), which
// authenticates the invocation for us so this function stays JWT-protected
// like every other one (no verify_jwt override needed). It finds tomorrow's
// and today's appointments and forwards each to send-appointment-notification
// using the service role key from its own Edge Function environment.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

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
    supabase.from("appointments").select("id").eq("date", today).neq("status", "cancelled"),
  ]);
  if (tErr || yErr) {
    console.error("[send-appointment-reminders]", tErr ?? yErr);
    return new Response(JSON.stringify({ error: String(tErr ?? yErr) }), { status: 500 });
  }

  await Promise.all([
    ...(tomorrowAppts ?? []).map((a) => notify(a.id, "reminder_day_before")),
    ...(todayAppts ?? []).map((a) => notify(a.id, "reminder_day_of")),
  ]);

  return new Response(
    JSON.stringify({
      ok: true,
      reminderDayBefore: tomorrowAppts?.length ?? 0,
      reminderDayOf: todayAppts?.length ?? 0,
    }),
    { headers: { "content-type": "application/json" } },
  );
});
