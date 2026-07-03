import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type CategoryType = "income" | "expense";
const COMPANY_ID = "demo";

export const createCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name: string; type: CategoryType }) => {
    const name = input.name?.trim();
    if (!name) throw new Error("Informe o nome da categoria");
    if (name.length > 60) throw new Error("Nome muito longo (máx. 60)");
    if (input.type !== "income" && input.type !== "expense")
      throw new Error("Tipo de categoria inválido");
    return { name, type: input.type };
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: existing } = await supabase
      .from("financial_categories")
      .select("id")
      .eq("company_id", COMPANY_ID)
      .eq("type", data.type)
      .ilike("name", data.name)
      .maybeSingle();
    if (existing) throw new Error("Já existe uma categoria com esse nome");

    const { data: row, error } = await supabase
      .from("financial_categories")
      .insert({ company_id: COMPANY_ID, name: data.name, type: data.type })
      .select("id, name")
      .single();
    if (error) throw error;
    return row as { id: string; name: string };
  });

export const updateCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; name: string }) => {
    const name = input.name?.trim();
    if (!input.id) throw new Error("Categoria inválida");
    if (!name) throw new Error("Informe o nome da categoria");
    if (name.length > 60) throw new Error("Nome muito longo (máx. 60)");
    return { id: input.id, name };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("financial_categories")
      .update({ name: data.name })
      .eq("id", data.id)
      .eq("company_id", COMPANY_ID);
    if (error) throw error;
    return { id: data.id, name: data.name };
  });

export const deleteCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input.id) throw new Error("Categoria inválida");
    return { id: input.id };
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await supabase
      .from("financial_transactions")
      .update({ category_id: null })
      .eq("company_id", COMPANY_ID)
      .eq("category_id", data.id);

    const { error } = await supabase
      .from("financial_categories")
      .delete()
      .eq("id", data.id)
      .eq("company_id", COMPANY_ID);
    if (error) throw error;
    return { ok: true };
  });
