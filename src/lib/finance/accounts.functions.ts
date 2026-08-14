import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";
import { resolveUnitId } from "@/lib/auth/resolve-unit";

type AccountType = "bank" | "cash" | "pix" | "credit";

export const listAccounts = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { unitId?: string } | undefined) => ({ unitId: input?.unitId ?? null }))
  .handler(async ({ data, context }) => {
    // Conta bancária é por unidade — não-admin nunca escolhe, sempre a
    // própria; admin sem escolha nenhuma vê todas.
    const unitFilter = context.isAdmin ? data.unitId : context.unitId;
    // types.ts ainda não conhece unit_id (Lovable regenera depois da
    // migration) — mesmo escape que patients.functions.ts já usa.
    const supabase: any = context.supabase;
    let query = supabase
      .from("financial_accounts")
      .select("id, name, type, last_digits, unit_id")
      .eq("owner_id", context.ownerId)
      .order("name");
    if (unitFilter) query = query.eq("unit_id", unitFilter);
    const { data: rows, error } = await query;
    if (error) throw error;
    return (rows ?? []) as { id: string; name: string; type: string; last_digits: string | null; unit_id: string }[];
  });

export const createAccount = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { name: string; type?: AccountType; last_digits?: string | null; unitId?: string }) => {
    const name = input.name?.trim();
    if (!name) throw new Error("Informe o nome da conta");
    if (name.length > 60) throw new Error("Nome muito longo (máx. 60)");
    const type: AccountType =
      input.type && ["bank", "cash", "pix", "credit"].includes(input.type) ? input.type : "bank";
    return { name, type, last_digits: input.last_digits?.trim() || null, unitId: input.unitId };
  })
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const unitId = await resolveUnitId(context, data.unitId);

    const { data: existing } = await supabase
      .from("financial_accounts")
      .select("id")
      .eq("owner_id", context.ownerId)
      .eq("unit_id", unitId)
      .ilike("name", data.name)
      .maybeSingle();
    if (existing) throw new Error("Já existe uma conta com esse nome nesta unidade");

    const { data: row, error } = await supabase
      .from("financial_accounts")
      .insert({
        owner_id: context.ownerId,
        unit_id: unitId,
        name: data.name,
        type: data.type,
        last_digits: data.last_digits,
      })
      .select("id, name, type")
      .single();
    if (error) throw error;
    return row as { id: string; name: string; type: string };
  });

export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
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
      .eq("owner_id", context.ownerId)
      .eq("account_id", data.id);

    const { error } = await supabase
      .from("financial_accounts")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.ownerId);
    if (error) throw error;
    return { ok: true };
  });
