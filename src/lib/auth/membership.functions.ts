import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { MemberRole } from "@/lib/auth/clinic-context.middleware";
import type { RecursosDoConsultorio } from "@/lib/auth/niveis-de-acesso";
import {
  consultorioParado,
  lerFichaDoSite,
  recursosDaFicha,
  testeVencido,
} from "@/lib/plataforma/recursos";

export interface MembershipStatus {
  status: "pending" | "active" | "rejected" | "disabled";
  role: MemberRole | null;
  unitId: string | null;
  name: string | null;
  /** O que o plano liga, para a rota respeitar além do nível. */
  recursos: RecursosDoConsultorio | null;
  /** O consultório inteiro parou: o teste venceu ou a plataforma suspendeu.
   *  `null` = funcionando. */
  parado: "teste_vencido" | "suspenso" | null;
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
      .select("status, role, unit_id, name, owner_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error("Falha ao verificar seu cadastro.");
    if (!data) return null;
    const ficha =
      data.status === "active" && data.owner_id
        ? await lerFichaDoSite(supabase, String(data.owner_id))
        : null;
    const agora = new Date();
    return {
      status: data.status as MembershipStatus["status"],
      role: (data.role ?? null) as MemberRole | null,
      unitId: data.unit_id ?? null,
      name: data.name ?? null,
      recursos: data.status === "active" ? recursosDaFicha(ficha, agora) : null,
      parado: !consultorioParado(ficha, agora)
        ? null
        : ficha?.situacao === "suspensa" || !testeVencido(ficha?.teste_ate ?? null, agora)
          ? "suspenso"
          : "teste_vencido",
    };
  });
