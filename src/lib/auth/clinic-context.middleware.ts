import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MemberRole = "admin" | "reception" | "dentist" | "finance";

/**
 * Resolve, a partir de quem logou (`context.userId`, o `auth.uid()` puro),
 * a qual clínica essa pessoa pertence e com que papel/unidade.
 *
 * Não edita `auth-middleware.ts` (proibido pelo projeto) — compõe com ele.
 * `context.userId`/`context.supabase`/`context.claims` continuam disponíveis
 * depois deste middleware; ele só ACRESCENTA `ownerId`/`memberRole`/
 * `permissions`/`unitId`/`isAdmin`.
 *
 * Todo server function que hoje faz `.eq("owner_id", context.userId)` deve
 * trocar `requireSupabaseAuth` por este middleware e usar `context.ownerId`
 * no lugar — `context.userId` continua sendo "quem é essa pessoa", nunca
 * mais "de quem são os dados".
 *
 * O `throw` abaixo é rede de segurança pra quem bater direto no endpoint com
 * um token de conta pendente/recusada — a barreira real é a RLS (uma conta
 * sem linha `active` em `clinic_members` nunca bate `current_owner_id()` em
 * nenhuma política, então toda leitura/escrita já volta vazia mesmo que
 * algum server function novo esqueça de usar este middleware).
 */
export const requireClinicMembership = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const supabase: any = context.supabase;
    const { data: member, error } = await supabase
      .from("clinic_members")
      .select("owner_id, unit_id, role, status, permissions")
      .eq("user_id", context.userId)
      .maybeSingle();

    if (error) throw new Error("Falha ao verificar associação da conta à clínica.");
    if (!member || member.status !== "active") {
      throw new Error("ACCOUNT_NOT_APPROVED");
    }

    return next({
      context: {
        ownerId: member.owner_id as string,
        memberRole: (member.role ?? null) as MemberRole | null,
        permissions: (member.permissions ?? []) as string[],
        // null = admin, enxerga todas as unidades da clínica.
        unitId: (member.unit_id ?? null) as string | null,
        isAdmin: member.role === "admin",
      },
    });
  });
