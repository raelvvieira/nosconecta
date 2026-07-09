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
