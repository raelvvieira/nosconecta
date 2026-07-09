// Server-only: fires the send-appointment-notification Edge Function using
// the service role key. Must be dynamically imported from inside a handler
// (never at module top-level) from *.functions.ts files, since those ship
// to the client bundle — same rule as src/integrations/supabase/client.server.ts.

export function triggerAppointmentNotification(appointmentId: string, kind: string): void {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("[agenda] SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes; notificação não disparada.");
    return;
  }
  // Fire-and-forget: appointment creation shouldn't wait on Brevo/network,
  // and a Brevo hiccup shouldn't fail the booking itself.
  fetch(`${url}/functions/v1/send-appointment-notification`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ appointmentId, kind }),
  }).catch((e) => console.error("[agenda] falha ao disparar notificação:", e));
}
