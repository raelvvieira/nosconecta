import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const COMPANY_ID = "demo";

/**
 * Lista os fornecedores já utilizados (nomes distintos em pagamentos).
 * Leitura autenticada — consistente com a escrita das transações.
 */
export const listSuppliers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((_: unknown) => ({}))
  .handler(async ({ context }) => {
    const { data: rows, error } = await context.supabase
      .from("financial_transactions")
      .select("supplier_name")
      .eq("company_id", COMPANY_ID)
      .eq("type", "payable")
      .not("supplier_name", "is", null);
    if (error) throw error;
    const set = new Set<string>();
    for (const r of rows ?? []) {
      const name = (r as { supplier_name: string | null }).supplier_name;
      if (name) set.add(name);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  });
