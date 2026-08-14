/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership, type MemberRole } from "@/lib/auth/clinic-context.middleware";

export interface PendingMember {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  requestedAt: string;
}

export interface ActiveMember {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: MemberRole;
  unitId: string | null;
  permissions: string[];
  status: "active" | "disabled";
}

function assertAdmin(context: { isAdmin: boolean }) {
  if (!context.isAdmin) throw new Error("Apenas administradores podem gerenciar a equipe.");
}

/**
 * Impede um admin de mexer na própria linha por aqui: desativar ou trocar o
 * próprio papel via este fluxo pode zerar `current_owner_id()`/`is_clinic_admin()`
 * na hora — sem outro admin, ninguém mais consegue desfazer. Editar a si
 * mesmo continua possível, só não por este caminho de aprovação/gestão.
 */
async function assertNotSelf(supabase: any, id: string, ownerId: string, actingUserId: string) {
  const { data, error } = await supabase
    .from("clinic_members")
    .select("user_id")
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data?.user_id === actingUserId) {
    throw new Error("Você não pode alterar seu próprio acesso por aqui.");
  }
}

export const getPendingMembers = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<PendingMember[]> => {
    assertAdmin(context);
    const supabase: any = context.supabase;
    const { data, error } = await supabase
      .from("clinic_members")
      .select("id, name, email, phone, requested_at")
      .eq("owner_id", context.ownerId)
      .eq("status", "pending")
      .order("requested_at", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as any[]).map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone ?? null,
      requestedAt: row.requested_at,
    }));
  });

export const getActiveMembers = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<ActiveMember[]> => {
    assertAdmin(context);
    const supabase: any = context.supabase;
    const { data, error } = await supabase
      .from("clinic_members")
      .select("id, name, email, phone, role, unit_id, permissions, status")
      .eq("owner_id", context.ownerId)
      .in("status", ["active", "disabled"])
      .order("name");
    if (error) throw new Error(error.message);
    return ((data ?? []) as any[]).map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone ?? null,
      role: (row.role ?? "reception") as MemberRole,
      unitId: row.unit_id ?? null,
      permissions: Array.isArray(row.permissions) ? row.permissions : [],
      status: row.status as "active" | "disabled",
    }));
  });

/** Aprovar é o único jeito de um pendente virar ativo — é aqui que papel e
 *  unidade nascem, nunca escolhidos pela própria pessoa no autocadastro. */
export const approveMember = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { id: string; role: MemberRole; unitId: string | null; permissions: string[] }) => input,
  )
  .middleware([requireClinicMembership])
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const supabase: any = context.supabase;
    const { error } = await supabase
      .from("clinic_members")
      .update({
        role: data.role,
        unit_id: data.unitId,
        permissions: data.permissions,
        status: "active",
        approved_at: new Date().toISOString(),
        approved_by: context.userId,
      })
      .eq("id", data.id)
      .eq("owner_id", context.ownerId)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const rejectMember = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string; reason?: string }) => input)
  .middleware([requireClinicMembership])
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const supabase: any = context.supabase;
    const { error } = await supabase
      .from("clinic_members")
      .update({ status: "rejected", rejected_reason: data.reason || null })
      .eq("id", data.id)
      .eq("owner_id", context.ownerId)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateMember = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { id: string; role: MemberRole; unitId: string | null; permissions: string[] }) => input,
  )
  .middleware([requireClinicMembership])
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const supabase: any = context.supabase;
    await assertNotSelf(supabase, data.id, context.ownerId, context.userId);
    const { error } = await supabase
      .from("clinic_members")
      .update({ role: data.role, unit_id: data.unitId, permissions: data.permissions })
      .eq("id", data.id)
      .eq("owner_id", context.ownerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setMemberDisabled = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string; disabled: boolean }) => input)
  .middleware([requireClinicMembership])
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const supabase: any = context.supabase;
    await assertNotSelf(supabase, data.id, context.ownerId, context.userId);
    const { error } = await supabase
      .from("clinic_members")
      .update({ status: data.disabled ? "disabled" : "active" })
      .eq("id", data.id)
      .eq("owner_id", context.ownerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
