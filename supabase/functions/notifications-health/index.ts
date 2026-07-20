// Reports which Brevo channels have their required secrets configured.
// Never returns the secret values themselves — booleans only. Called from
// the TanStack server (with the service role key) for the Notificações
// admin page, same protected pattern as send-appointment-notification.
Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok");

  const hasApiKey = !!Deno.env.get("BREVO_API_KEY");
  const email = hasApiKey && !!Deno.env.get("BREVO_SENDER_EMAIL");
  const sms = hasApiKey && !!Deno.env.get("BREVO_SMS_SENDER");
  const whatsapp =
    hasApiKey &&
    !!Deno.env.get("BREVO_WHATSAPP_SENDER_NUMBER") &&
    !!Deno.env.get("BREVO_WHATSAPP_TEMPLATE_CONFIRMATION") &&
    !!Deno.env.get("BREVO_WHATSAPP_TEMPLATE_REMINDER_DAY_BEFORE") &&
    !!Deno.env.get("BREVO_WHATSAPP_TEMPLATE_REMINDER_DAY_OF");
  const whatsappInboundWebhook = !!Deno.env.get("WHATSAPP_WEBHOOK_SECRET");

  return new Response(JSON.stringify({ email, sms, whatsapp, whatsappInboundWebhook }), {
    headers: { "content-type": "application/json" },
  });
});
