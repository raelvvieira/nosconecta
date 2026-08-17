// Converts a Brazilian phone number as stored in the app
// (e.g. "(51) 99687-9727") into E.164 for the Brevo SMS API
// (e.g. "+5551996879727"). Returns null when the number doesn't look valid.
export function toE164BR(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return `+${digits}`;
  }
  if (digits.length === 10 || digits.length === 11) {
    return `+55${digits}`;
  }
  return null;
}

// Same normalization as toE164BR, but without the leading "+" — the format
// Brevo's WhatsApp API expects for senderNumber/contactNumbers.
export function toWhatsappBR(phone: string | null | undefined): string | null {
  const e164 = toE164BR(phone);
  return e164 ? e164.slice(1) : null;
}

// Extraída de crm-whatsapp/index.ts (onde nasceu, só pro número de conexão
// do WhatsApp da clínica) — movida pra cá porque crm-contacts também passou
// a precisar dela: pacientes cadastrados sem o "55" do Brasil (ex.:
// "51993351821", DDD 51 sem código do país) faziam o CRM interpretar "51"
// como código de outro país e criar um contato errado, pro qual o disparo
// nunca entrega.
//
// Diferente de toE164BR/toWhatsappBR acima (que também completam o "55",
// mas exigem exatamente 10-11 dígitos e devolvem `null` fora disso): esta
// nunca devolve `null` — sempre completa o "55" quando o que sobrar não
// começar com ele, sem julgar se o resto é um telefone válido. É o formato
// exigido pelo corpo de POST /api/v1/evolution/connections
// ("5548984195309") e o mesmo que POST /api/v1/contacts espera em
// `phone_number`.
export function normalizeBrazilianPhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (!digits.startsWith("55")) digits = `55${digits}`;
  return digits;
}
