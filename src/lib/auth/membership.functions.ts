import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { MemberRole } from "@/lib/auth/clinic-context.middleware";

export interface MembershipStatus {
  status: "pending" | "active" | "rejected" | "disabled";
  role: MemberRole | null;
  unitId: string | null;
  name: string | null;
}

/**
 * Estado da matrícula do usuário logado na clínica.
 *
 * Diferente de `requireClinicMembership`: aqui usamos só `requireSupabaseAuth`
 * de propósito — o trabalho desta função é justamente descobrir se a
 * matrícula existe, então ela precisa funcionar para QUALQUER login válido,
 * inclusive um pendente ou sem linha nenhuma em `clinic_members`. `null`
 * significa "nenhuma linha ainda" (autocadastro em andamento ou conta
 * órfã) — quem decide o que fazer com isso é o `MembershipGate`, não aqui.
 * A segurança de dado real nunca depende deste retorno: é a RLS.
 */
export const getMembershipStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MembershipStatus | null> => {
    const supabase: any = context.supabase;
    const { data, error } = await supabase
      .from("clinic_members")
      .select("status, role, unit_id, name")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error("Falha ao verificar seu cadastro.");
    if (!data) return null;
    return {
      status: data.status as MembershipStatus["status"],
      role: (data.role ?? null) as MemberRole | null,
      unitId: data.unit_id ?? null,
      name: data.name ?? null,
    };
  });

/**
 * Cria a linha pendente em `clinic_members` para o login que acabou de se
 * autenticar — cobre os dois caminhos do autocadastro (ver
 * `cadastro-equipe.tsx`): sessão imediata (confirmação de e-mail desligada,
 * chamada logo após o `signUp`) ou primeiro login (confirmação ligada,
 * chamada pelo `MembershipGate` ao ver `status === null`).
 *
 * Idempotente: se a linha já existe (segunda chamada, corrida entre abas),
 * devolve o estado atual em vez de tentar inserir de novo — o `UNIQUE
 * (user_id)` faria isso falhar mesmo sem essa checagem, mas falhar não é o
 * comportamento certo aqui.
 *
 * `owner_id` vem de `primary_clinic_owner()` (única clínica cadastrada hoje)
 * em vez de fixo no código, porque é a mesma função que a RLS de
 * `clinic_members_self_signup` exige bater — pedir por RPC garante que os
 * dois lados nunca divirjam.
 */
export const registerPendingMembership = createServerFn({ method: "POST" })
  .inputValidator((input: { name: string; email: string; phone?: string | null }) => input)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<MembershipStatus> => {
    const supabase: any = context.supabase;

    const { data: existing, error: existingError } = await supabase
      .from("clinic_members")
      .select("status, role, unit_id, name")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (existingError) throw new Error("Falha ao verificar seu cadastro.");
    if (existing) {
      return {
        status: existing.status as MembershipStatus["status"],
        role: (existing.role ?? null) as MemberRole | null,
        unitId: existing.unit_id ?? null,
        name: existing.name ?? null,
      };
    }

    const { data: ownerId, error: ownerError } = await supabase.rpc("primary_clinic_owner");
    if (ownerError || !ownerId) throw new Error("Não foi possível identificar a clínica.");

    const { error: insertError } = await supabase.from("clinic_members").insert({
      user_id: context.userId,
      owner_id: ownerId,
      name: data.name,
      email: data.email,
      phone: data.phone ?? null,
      status: "pending",
      role: null,
      unit_id: null,
    });
    if (insertError) throw new Error("Não foi possível concluir seu cadastro. Tente novamente.");

    return { status: "pending", role: null, unitId: null, name: data.name };
  });
