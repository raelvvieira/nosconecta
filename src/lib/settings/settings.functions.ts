/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SettingsSection = "professionals" | "chairs" | "procedures" | "members";
export type MemberRole = "admin" | "reception" | "dentist" | "finance";

export interface ProfessionalSetting {
  id: string;
  name: string;
  specialty: string;
  registrationNumber: string;
  phone: string;
  email: string;
  commissionPct: number;
  color: string;
  active: boolean;
}

export interface ChairSetting {
  id: string;
  name: string;
  roomName: string;
  color: string;
  active: boolean;
  notes: string;
}

export interface ProcedureSetting {
  id: string;
  name: string;
  category: string;
  durationMinutes: number;
  price: number;
  cost: number;
  active: boolean;
}

export interface MemberSetting {
  id: string;
  name: string;
  email: string;
  role: MemberRole;
  permissions: string[];
  active: boolean;
}

export interface SettingsData {
  professionals: ProfessionalSetting[];
  chairs: ChairSetting[];
  procedures: ProcedureSetting[];
  members: MemberSetting[];
}

export type SettingsRecord = ProfessionalSetting | ChairSetting | ProcedureSetting | MemberSetting;

export const getSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SettingsData> => {
    const supabase: any = context.supabase;
    const [professionals, chairs, procedures, members] = await Promise.all([
      supabase.from("professionals").select("*").eq("owner_id", context.userId).order("name"),
      supabase.from("clinic_chairs").select("*").eq("owner_id", context.userId).order("name"),
      supabase.from("clinic_procedures").select("*").eq("owner_id", context.userId).order("name"),
      supabase.from("clinic_members").select("*").eq("owner_id", context.userId).order("name"),
    ]);

    return {
      professionals: (professionals.data ?? []).map((row: any) => ({
        id: row.id,
        name: row.name,
        specialty: row.specialty ?? "",
        registrationNumber: row.registration_number ?? "",
        phone: row.phone ?? "",
        email: row.email ?? "",
        commissionPct: Number(row.commission_pct ?? 0),
        color: row.color ?? "#8B5CF6",
        active: row.active ?? true,
      })),
      chairs: (chairs.data ?? []).map((row: any) => ({
        id: row.id,
        name: row.name,
        roomName: row.room_name ?? "",
        color: row.color ?? "#FF6B57",
        active: row.active ?? true,
        notes: row.notes ?? "",
      })),
      procedures: (procedures.data ?? []).map((row: any) => ({
        id: row.id,
        name: row.name,
        category: row.category ?? "",
        durationMinutes: Number(row.duration_minutes ?? 60),
        price: Number(row.price ?? 0),
        cost: Number(row.cost ?? 0),
        active: row.active ?? true,
      })),
      members: (members.data ?? []).map((row: any) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        role: (row.role ?? "reception") as MemberRole,
        permissions: Array.isArray(row.permissions) ? row.permissions : [],
        active: row.active ?? true,
      })),
    };
  });

export const saveSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { section: SettingsSection; item: Record<string, unknown> }) => input)
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const item = data.item as any;
    const id = item.id || crypto.randomUUID();
    const common = { id, owner_id: context.userId };
    const definitions: Record<SettingsSection, { table: string; row: Record<string, unknown> }> = {
      professionals: {
        table: "professionals",
        row: {
          ...common,
          name: item.name,
          specialty: item.specialty || null,
          registration_number: item.registrationNumber || null,
          phone: item.phone || null,
          email: item.email || null,
          commission_pct: Number(item.commissionPct || 0),
          color: item.color || "#8B5CF6",
          active: item.active ?? true,
        },
      },
      chairs: {
        table: "clinic_chairs",
        row: {
          ...common,
          name: item.name,
          room_name: item.roomName || null,
          color: item.color || "#FF6B57",
          active: item.active ?? true,
          notes: item.notes || null,
        },
      },
      procedures: {
        table: "clinic_procedures",
        row: {
          ...common,
          name: item.name,
          category: item.category || null,
          duration_minutes: Number(item.durationMinutes || 60),
          price: Number(item.price || 0),
          cost: Number(item.cost || 0),
          active: item.active ?? true,
        },
      },
      members: {
        table: "clinic_members",
        row: {
          ...common,
          name: item.name,
          email: item.email,
          role: item.role || "reception",
          permissions: item.permissions || [],
          active: item.active ?? true,
        },
      },
    };
    const target = definitions[data.section];
    const { error } = await supabase.from(target.table).upsert(target.row);
    if (error) throw new Error(error.message);
    return { id };
  });

export const deleteSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { section: SettingsSection; id: string }) => input)
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const tables: Record<SettingsSection, string> = {
      professionals: "professionals",
      chairs: "clinic_chairs",
      procedures: "clinic_procedures",
      members: "clinic_members",
    };
    const { error } = await supabase
      .from(tables[data.section])
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
