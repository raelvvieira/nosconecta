/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";
import { resolveUnitId } from "@/lib/auth/resolve-unit";

// "members" saiu daqui — virou aprovação de verdade em
// src/lib/settings/members.functions.ts (papel/unidade nascem só na
// aprovação, não dá pra "criar membro" de improviso mais). "units" entrou:
// é um CRUD simples como os outros três, cabe no mesmo mecanismo genérico.
export type SettingsSection = "professionals" | "chairs" | "procedures" | "units";

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
  /** Unidade principal do profissional — ver simplificação no plano: um
   *  profissional que atende nas duas unidades continua funcionando na
   *  agenda (cada `appointment` tem sua própria unidade), só o cadastro
   *  dele é que fica preso a uma unidade só. */
  unitId: string | null;
}

export interface ChairSetting {
  id: string;
  name: string;
  roomName: string;
  color: string;
  active: boolean;
  notes: string;
  unitId: string | null;
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

export interface UnitSetting {
  id: string;
  name: string;
  address: string;
  active: boolean;
  isDefault: boolean;
}

export interface SettingsData {
  professionals: ProfessionalSetting[];
  chairs: ChairSetting[];
  procedures: ProcedureSetting[];
  units: UnitSetting[];
  /** A tela usa isto para mostrar o seletor de unidade nos formulários de
   *  profissional/cadeira e a seção de Unidades só para quem administra —
   *  quem não é admin nem vê essas opções, mas o servidor também nunca
   *  confia só nisso (ver resolveUnitId/assertAdmin nos handlers). */
  isAdmin: boolean;
}

export type SettingsRecord = ProfessionalSetting | ChairSetting | ProcedureSetting | UnitSetting;

export const getSettings = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<SettingsData> => {
    const supabase: any = context.supabase;
    // Quem não é admin nunca escolhe: sempre a própria unidade. Admin vê a
    // clínica inteira aqui — o seletor de unidade nos formulários é a
    // próxima tarefa; por ora ele escolhe a unidade dentro do próprio
    // formulário de profissional/cadeira (ver resolveUnitId abaixo).
    const unitFilter = context.isAdmin ? null : context.unitId;
    const cu = (q: any) => (unitFilter ? q.eq("unit_id", unitFilter) : q);

    const [professionals, chairs, procedures, units] = await Promise.all([
      cu(supabase.from("professionals").select("*").eq("owner_id", context.ownerId)).order("name"),
      cu(supabase.from("clinic_chairs").select("*").eq("owner_id", context.ownerId)).order("name"),
      supabase.from("clinic_procedures").select("*").eq("owner_id", context.ownerId).order("name"),
      supabase.from("clinic_units").select("*").eq("owner_id", context.ownerId).order("name"),
    ]);

    return {
      professionals: ((professionals.data ?? []) as any[]).map((row) => ({
        id: row.id,
        name: row.name,
        specialty: row.specialty ?? "",
        registrationNumber: row.registration_number ?? "",
        phone: row.phone ?? "",
        email: row.email ?? "",
        commissionPct: Number(row.commission_pct ?? 0),
        color: row.color ?? "#8B5CF6",
        active: row.active ?? true,
        unitId: row.unit_id ?? null,
      })),
      chairs: ((chairs.data ?? []) as any[]).map((row) => ({
        id: row.id,
        name: row.name,
        roomName: row.room_name ?? "",
        color: row.color ?? "#FF7A59",
        active: row.active ?? true,
        notes: row.notes ?? "",
        unitId: row.unit_id ?? null,
      })),
      procedures: ((procedures.data ?? []) as any[]).map((row) => ({
        id: row.id,
        name: row.name,
        category: row.category ?? "",
        durationMinutes: Number(row.duration_minutes ?? 60),
        price: Number(row.price ?? 0),
        cost: Number(row.cost ?? 0),
        active: row.active ?? true,
      })),
      units: ((units.data ?? []) as any[]).map((row) => ({
        id: row.id,
        name: row.name,
        address: row.address ?? "",
        active: row.active ?? true,
        isDefault: row.is_default ?? false,
      })),
      isAdmin: context.isAdmin,
    };
  });

export const saveSetting = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { section: SettingsSection; item: Record<string, unknown> }) => input)
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const item = data.item as any;
    const id = item.id || crypto.randomUUID();
    const common = { id, owner_id: context.ownerId };

    // Cada branch resolve só o que precisa — resolver `unitId` sempre, pra
    // todas as seções, faria uma tentativa de salvar "procedimento" (que não
    // tem unidade) falhar caso a clínica já tenha 2+ unidades sem escolha.
    let table: string;
    let row: Record<string, unknown>;

    if (data.section === "units") {
      if (!context.isAdmin) throw new Error("Apenas administradores podem gerenciar unidades.");
      table = "clinic_units";
      row = { ...common, name: item.name, address: item.address || null, active: item.active ?? true };
    } else if (data.section === "professionals") {
      table = "professionals";
      row = {
        ...common,
        unit_id: await resolveUnitId(context, item.unitId ?? null),
        name: item.name,
        specialty: item.specialty || null,
        registration_number: item.registrationNumber || null,
        phone: item.phone || null,
        email: item.email || null,
        commission_pct: Number(item.commissionPct || 0),
        color: item.color || "#8B5CF6",
        active: item.active ?? true,
      };
    } else if (data.section === "chairs") {
      table = "clinic_chairs";
      row = {
        ...common,
        unit_id: await resolveUnitId(context, item.unitId ?? null),
        name: item.name,
        room_name: item.roomName || null,
        color: item.color || "#FF7A59",
        active: item.active ?? true,
        notes: item.notes || null,
      };
    } else {
      table = "clinic_procedures";
      row = {
        ...common,
        name: item.name,
        category: item.category || null,
        duration_minutes: Number(item.durationMinutes || 60),
        price: Number(item.price || 0),
        cost: Number(item.cost || 0),
        active: item.active ?? true,
      };
    }

    const { error } = await supabase.from(table).upsert(row);
    if (error) throw new Error(error.message);
    return { id };
  });

export const deleteSetting = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { section: SettingsSection; id: string }) => input)
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    if (data.section === "units" && !context.isAdmin) {
      throw new Error("Apenas administradores podem gerenciar unidades.");
    }
    const tables: Record<SettingsSection, string> = {
      professionals: "professionals",
      chairs: "clinic_chairs",
      procedures: "clinic_procedures",
      units: "clinic_units",
    };
    const { error } = await supabase
      .from(tables[data.section])
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.ownerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
