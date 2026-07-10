// Server-only: fires the send-appointment-notification Edge Function using
// the service role key. Must be dynamically imported from inside a handler
// (never at module top-level) from *.functions.ts files, since those ship
// to the client bundle — same rule as src/integrations/supabase/client.server.ts.

export async function triggerAppointmentNotification(appointmentId: string, kind: string): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("[agenda] SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes; notificação não disparada.");
    return;
  }
  // Awaited (not fire-and-forget): on Cloudflare Workers, promises still
  // pending after the response is sent get killed, so an un-awaited fetch
  // here silently never completes. A Brevo hiccup still can't fail the
  // booking itself, since we catch and swallow the error.
  try {
    await fetch(`${url}/functions/v1/send-appointment-notification`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ appointmentId, kind }),
    });
  } catch (e) {
    console.error("[agenda] falha ao disparar notificação:", e);
  }
}
