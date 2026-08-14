import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";

/**
 * Lista os fornecedores já utilizados (nomes distintos em pagamentos).
 * Leitura autenticada — consistente com a escrita das transações.
 *
 * Sem filtro de unidade de propósito: é só uma lista de autocompletar, e a
 * RLS já restringe as linhas de `financial_transactions` que um não-admin
 * enxerga à própria unidade — não precisa de precisão extra aqui.
 */
export const listSuppliers = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .inputValidator((_: unknown) => ({}))
  .handler(async ({ context }) => {
    const { data: rows, error } = await context.supabase
      .from("financial_transactions")
      .select("supplier_name")
      .eq("owner_id", context.ownerId)
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
