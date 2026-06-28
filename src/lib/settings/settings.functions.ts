/* eslint-disable @typescript-eslint/no-explicit-any -- new configuration tables are added by the accompanying migration */
import { createClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import type { Database } from "@/integrations/supabase/types";

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

const DEMO: SettingsData = {
  professionals: [
    {
      id: "11111111-1111-4111-8111-111111111101",
      name: "Dr. Carlos Mendes",
      specialty: "Implantodontia",
      registrationNumber: "CRO-SP 12345",
      phone: "(11) 98765-1001",
      email: "carlos@nosconecta.com",
      commissionPct: 30,
      color: "#8B5CF6",
      active: true,
    },
    {
      id: "11111111-1111-4111-8111-111111111102",
      name: "Dra. Ana Rocha",
      specialty: "Clínica geral",
      registrationNumber: "CRO-SP 22870",
      phone: "(11) 98765-1002",
      email: "ana@nosconecta.com",
      commissionPct: 25,
      color: "#FF6B57",
      active: true,
    },
    {
      id: "11111111-1111-4111-8111-111111111103",
      name: "Dr. João Freitas",
      specialty: "Ortodontia",
      registrationNumber: "CRO-SP 31892",
      phone: "(11) 98765-1003",
      email: "joao@nosconecta.com",
      commissionPct: 30,
      color: "#0EA5E9",
      active: true,
    },
  ],
  chairs: [
    {
      id: "22222222-2222-4222-8222-222222222201",
      name: "Cadeira 01",
      roomName: "Consultório 1",
      color: "#FF6B57",
      active: true,
      notes: "Clínica geral e prevenção",
    },
    {
      id: "22222222-2222-4222-8222-222222222202",
      name: "Cadeira 02",
      roomName: "Consultório 2",
      color: "#8B5CF6",
      active: true,
      notes: "Ortodontia e estética",
    },
    {
      id: "22222222-2222-4222-8222-222222222203",
      name: "Cadeira cirúrgica",
      roomName: "Sala cirúrgica",
      color: "#0EA5E9",
      active: true,
      notes: "Cirurgias e implantes",
    },
  ],
  procedures: [
    {
      id: "33333333-3333-4333-8333-333333333301",
      name: "Consulta",
      category: "Avaliação",
      durationMinutes: 60,
      price: 200,
      cost: 30,
      active: true,
    },
    {
      id: "33333333-3333-4333-8333-333333333302",
      name: "Limpeza + raspagem",
      category: "Prevenção",
      durationMinutes: 60,
      price: 350,
      cost: 55,
      active: true,
    },
    {
      id: "33333333-3333-4333-8333-333333333303",
      name: "Clareamento",
      category: "Estética",
      durationMinutes: 90,
      price: 850,
      cost: 190,
      active: true,
    },
    {
      id: "33333333-3333-4333-8333-333333333304",
      name: "Implante unitário",
      category: "Implantodontia",
      durationMinutes: 90,
      price: 4500,
      cost: 1800,
      active: true,
    },
  ],
  members: [
    {
      id: "44444444-4444-4444-8444-444444444401",
      name: "Rael Vieira",
      email: "rael@nosconecta.com",
      role: "admin",
      permissions: ["agenda", "patients", "finance", "settings"],
      active: true,
    },
    {
      id: "44444444-4444-4444-8444-444444444402",
      name: "Marina Costa",
      email: "marina@nosconecta.com",
      role: "reception",
      permissions: ["agenda", "patients"],
      active: true,
    },
  ],
};

function client() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  }) as any;
}

const withFallback = <T>(rows: T[] | null | undefined, fallback: T[]) =>
  rows?.length ? rows : fallback;

export const getSettings = createServerFn({ method: "GET" })
  .inputValidator((input: { companyId?: string }) => ({ companyId: input?.companyId ?? "demo" }))
  .handler(async ({ data }): Promise<SettingsData> => {
    const supabase = client();
    const result = await Promise.race([
      Promise.all([
        supabase.from("professionals").select("*").eq("company_id", data.companyId).order("name"),
        supabase.from("clinic_chairs").select("*").eq("company_id", data.companyId).order("name"),
        supabase
          .from("clinic_procedures")
          .select("*")
          .eq("company_id", data.companyId)
          .order("name"),
        supabase.from("clinic_members").select("*").eq("company_id", data.companyId).order("name"),
      ]),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2_500)),
    ]);
    if (!result) return DEMO;
    const [professionals, chairs, procedures, members] = result;

    return {
      professionals: withFallback(professionals.data, DEMO.professionals).map((row: any) => ({
        id: row.id,
        name: row.name,
        specialty: row.specialty ?? "Odontologia",
        registrationNumber: row.registration_number ?? "",
        phone: row.phone ?? "",
        email: row.email ?? "",
        commissionPct: Number(row.commission_pct ?? row.commissionPct ?? 0),
        color: row.color ?? "#8B5CF6",
        active: row.active ?? true,
      })),
      chairs: withFallback(chairs.data, DEMO.chairs).map((row: any) => ({
        id: row.id,
        name: row.name,
        roomName: row.room_name ?? row.roomName ?? "",
        color: row.color ?? "#FF6B57",
        active: row.active ?? true,
        notes: row.notes ?? "",
      })),
      procedures: withFallback(procedures.data, DEMO.procedures).map((row: any) => ({
        id: row.id,
        name: row.name,
        category: row.category ?? "",
        durationMinutes: Number(row.duration_minutes ?? row.durationMinutes ?? 60),
        price: Number(row.price ?? 0),
        cost: Number(row.cost ?? 0),
        active: row.active ?? true,
      })),
      members: withFallback(members.data, DEMO.members).map((row: any) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role ?? "reception",
        permissions: Array.isArray(row.permissions) ? row.permissions : [],
        active: row.active ?? true,
      })),
    };
  });

export const saveSetting = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { section: SettingsSection; item: Record<string, unknown>; companyId?: string }) => ({
      ...input,
      companyId: input.companyId ?? "demo",
    }),
  )
  .handler(async ({ data }) => {
    const supabase = client();
    const item = data.item as any;
    const id = item.id || crypto.randomUUID();
    const common = { id, company_id: data.companyId };
    const definitions = {
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
    } as const;
    const target = definitions[data.section];
    const { error } = await supabase.from(target.table).upsert(target.row);
    if (error)
      throw new Error(
        error.message.includes("schema cache")
          ? "A atualização do banco de dados ainda precisa ser aplicada."
          : error.message,
      );
    return { id };
  });

export const deleteSetting = createServerFn({ method: "POST" })
  .inputValidator((input: { section: SettingsSection; id: string }) => input)
  .handler(async ({ data }) => {
    const supabase = client();
    const tables = {
      professionals: "professionals",
      chairs: "clinic_chairs",
      procedures: "clinic_procedures",
      members: "clinic_members",
    } as const;
    const { error } = await supabase.from(tables[data.section]).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
