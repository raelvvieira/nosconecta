import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AccountType = "bank" | "cash" | "pix" | "credit";
const COMPANY_ID = "demo";

export const createAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name: string; type?: AccountType; last_digits?: string | null }) => {
    const name = input.name?.trim();
    if (!name) throw new Error("Informe o nome da conta");
    if (name.length > 60) throw new Error("Nome muito longo (máx. 60)");
    const type: AccountType =
      input.type && ["bank", "cash", "pix", "credit"].includes(input.type) ? input.type : "bank";
    return { name, type, last_digits: input.last_digits?.trim() || null };
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: existing } = await supabase
      .from("financial_accounts")
      .select("id")
      .eq("company_id", COMPANY_ID)
      .ilike("name", data.name)
      .maybeSingle();
    if (existing) throw new Error("Já existe uma conta com esse nome");

    const { data: row, error } = await supabase
      .from("financial_accounts")
      .insert({ company_id: COMPANY_ID, name: data.name, type: data.type, last_digits: data.last_digits })
      .select("id, name, type")
      .single();
    if (error) throw error;
    return row as { id: string; name: string; type: string };
  });

export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input.id) throw new Error("Conta inválida");
    return { id: input.id };
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // Desvincula transações que usam a conta antes de remover (evita erro de FK)
    await supabase
      .from("financial_transactions")
      .update({ account_id: null })
      .eq("company_id", COMPANY_ID)
      .eq("account_id", data.id);

    const { error } = await supabase
      .from("financial_accounts")
      .delete()
      .eq("id", data.id)
      .eq("company_id", COMPANY_ID);
    if (error) throw error;
    return { ok: true };
  });
