// Shared by both WhatsApp integrations (Brevo inbound replies and the
// Evolution API mirror) for matching an inbound phone number against
// patients.phone, which is stored as freeform formatted text (e.g.
// "(51) 99999-9999"), not E.164.
export function onlyDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

// Compares by the last 10 digits so formatting differences (with/without
// country code, leading 9, etc.) don't cause false negatives.
export function phoneMatches(a: string, b: string): boolean {
  if (!a || !b) return false;
  const tailLen = 10;
  return a.slice(-tailLen) === b.slice(-tailLen);
}
