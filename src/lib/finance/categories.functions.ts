import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type CategoryType = "income" | "expense";

function sb() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, storage: undefined } },
  );
}

export const createCategory = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { companyId?: string; name: string; type: CategoryType }) => {
      const name = input.name?.trim();
      if (!name) throw new Error("Informe o nome da categoria");
      if (name.length > 60) throw new Error("Nome muito longo (máx. 60)");
      if (input.type !== "income" && input.type !== "expense")
        throw new Error("Tipo de categoria inválido");
      return { companyId: input.companyId ?? "demo", name, type: input.type };
    },
  )
  .handler(async ({ data }) => {
    const supabase = sb();

    // Evita duplicadas (mesmo nome + tipo na empresa)
    const { data: existing } = await supabase
      .from("financial_categories")
      .select("id")
      .eq("company_id", data.companyId)
      .eq("type", data.type)
      .ilike("name", data.name)
      .maybeSingle();
    if (existing) throw new Error("Já existe uma categoria com esse nome");

    const { data: row, error } = await supabase
      .from("financial_categories")
      .insert({ company_id: data.companyId, name: data.name, type: data.type })
      .select("id, name")
      .single();
    if (error) throw error;
    return row as { id: string; name: string };
  });

export const updateCategory = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { companyId?: string; id: string; name: string }) => {
      const name = input.name?.trim();
      if (!input.id) throw new Error("Categoria inválida");
      if (!name) throw new Error("Informe o nome da categoria");
      if (name.length > 60) throw new Error("Nome muito longo (máx. 60)");
      return { companyId: input.companyId ?? "demo", id: input.id, name };
    },
  )
  .handler(async ({ data }) => {
    const supabase = sb();
    const { error } = await supabase
      .from("financial_categories")
      .update({ name: data.name })
      .eq("id", data.id)
      .eq("company_id", data.companyId);
    if (error) throw error;
    return { id: data.id, name: data.name };
  });

export const deleteCategory = createServerFn({ method: "POST" })
  .inputValidator((input: { companyId?: string; id: string }) => {
    if (!input.id) throw new Error("Categoria inválida");
    return { companyId: input.companyId ?? "demo", id: input.id };
  })
  .handler(async ({ data }) => {
    const supabase = sb();

    // Desvincula transações que usam a categoria antes de remover (evita erro de FK)
    await supabase
      .from("financial_transactions")
      .update({ category_id: null })
      .eq("company_id", data.companyId)
      .eq("category_id", data.id);

    const { error } = await supabase
      .from("financial_categories")
      .delete()
      .eq("id", data.id)
      .eq("company_id", data.companyId);
    if (error) throw error;
    return { ok: true };
  });
