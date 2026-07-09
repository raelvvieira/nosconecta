// Thin wrappers around the Brevo transactional Email and SMS APIs.
// BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME and BREVO_SMS_SENDER
// are configured as Supabase Edge Function secrets (Lovable → Cloud →
// Secrets), never hardcoded here.

function apiKey(): string {
  const key = Deno.env.get("BREVO_API_KEY");
  if (!key) throw new Error("BREVO_API_KEY não configurada");
  return key;
}

export async function sendBrevoEmail(opts: {
  to: { email: string; name?: string };
  subject: string;
  htmlContent: string;
}): Promise<void> {
  const senderEmail = Deno.env.get("BREVO_SENDER_EMAIL");
  if (!senderEmail) throw new Error("BREVO_SENDER_EMAIL não configurada");
  const senderName = Deno.env.get("BREVO_SENDER_NAME") ?? "NÓS Conecta";

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey(),
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [opts.to],
      subject: opts.subject,
      htmlContent: opts.htmlContent,
    }),
  });
  if (!res.ok) {
    throw new Error(`Brevo email falhou (${res.status}): ${await res.text()}`);
  }
}

export async function sendBrevoSms(opts: { recipient: string; content: string }): Promise<void> {
  const sender = Deno.env.get("BREVO_SMS_SENDER") ?? "NOSConecta";
  const res = await fetch("https://api.brevo.com/v3/transactionalSMS/sms", {
    method: "POST",
    headers: {
      "api-key": apiKey(),
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender,
      recipient: opts.recipient,
      content: opts.content,
      type: "transactional",
    }),
  });
  if (!res.ok) {
    throw new Error(`Brevo SMS falhou (${res.status}): ${await res.text()}`);
  }
}
