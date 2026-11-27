/* eslint-disable @typescript-eslint/no-explicit-any -- cliente sem tipos gerados, como nas outras funções. */
import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Só o LOCATÁRIO passa por aqui. É o oposto do `requireClinicMembership`, que
 * barra o locatário: as funções de locação são as únicas que ele pode chamar.
 *
 * Entrega `ownerId` e `unitId` lidos da matrícula (nunca do que veio na
 * requisição) e o login dele — as funções filtram por esses valores e por
 * nenhum outro, porque o banco não deixa o locatário ler nada pelo navegador.
 */
export const exigeLocatario = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const supabase: any = context.supabase;
    const { data: m, error } = await supabase
      .from("clinic_members")
      .select("owner_id, unit_id, role, status, name")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error("Falha ao verificar seu cadastro.");
    if (!m || m.status !== "active" || m.role !== "tenant")
      throw new Error("Esta área é só para locatários.");
    if (!m.unit_id) throw new Error("Seu cadastro não tem unidade. Fale com a clínica.");
    return next({
      context: {
        ownerId: String(m.owner_id),
        unitId: String(m.unit_id),
        tenantNome: String(m.name ?? ""),
      },
    });
  });
