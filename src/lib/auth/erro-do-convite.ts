export type MotivoDaConta = "email_em_uso" | "senha_fraca" | "falhou";

export function motivoDaConta(error: { code?: string; message?: string } | null | undefined): MotivoDaConta {
  const texto = error?.message ?? "";
  if (error?.code === "weak_password" || /weak|easy to guess|password.*(?:short|least|characters)/i.test(texto)) {
    return "senha_fraca";
  }
  if (error?.code === "email_exists" || error?.code === "user_already_exists" || /already.*registered|email.*exists/i.test(texto)) {
    return "email_em_uso";
  }
  return "falhou";
}