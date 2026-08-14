/* eslint-disable @typescript-eslint/no-explicit-any */

export interface UnitResolutionContext {
  supabase: any;
  ownerId: string;
  isAdmin: boolean;
  /** `context.unitId` do `requireClinicMembership` — null só pra admin. */
  unitId: string | null;
}

/**
 * Decide a unidade de um registro que está nascendo (paciente, agendamento,
 * transação, conta...). Quem não é admin nunca escolhe — usa sempre a
 * própria unidade, ignorando qualquer valor vindo do payload.
 *
 * Admin pode escolher (`requestedUnitId`, vindo do formulário). Sem escolha
 * e com só uma unidade ativa na clínica, usa essa sozinho — é o caso comum
 * logo depois da migração (uma clínica, uma unidade), antes do seletor de
 * unidade existir em todo formulário de criação. Com duas ou mais unidades
 * cadastradas, admin precisa escolher explicitamente — não há como adivinhar
 * qual das duas é a certa.
 */
export async function resolveUnitId(ctx: UnitResolutionContext, requestedUnitId?: string | null): Promise<string> {
  if (!ctx.isAdmin) {
    if (!ctx.unitId) throw new Error("Sua conta não está associada a uma unidade. Fale com o administrador.");
    return ctx.unitId;
  }
  if (requestedUnitId) return requestedUnitId;

  const { data, error } = await ctx.supabase
    .from("clinic_units")
    .select("id")
    .eq("owner_id", ctx.ownerId)
    .eq("active", true);
  if (error) throw new Error("Não foi possível identificar a unidade.");
  const units = (data ?? []) as { id: string }[];
  if (units.length === 1) return units[0].id;
  throw new Error("Selecione a unidade.");
}
