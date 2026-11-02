/* eslint-disable @typescript-eslint/no-explicit-any -- leitura simples, mesmo padrão das outras */
import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";
import { exigeConfiguracoes } from "@/lib/auth/area.middleware";

/**
 * O horário de funcionamento de cada unidade, dia a dia da semana.
 *
 * É daqui que a agenda e a assistente tiram os horários que oferecem
 * (`_shared/vagas.ts`). "Sob consulta" = o dia existe, mas a assistente não
 * oferece horário sozinha: diz que vai ver com a equipe.
 */

export type ModoDoDia = "aberto" | "fechado" | "sob_consulta";

export interface DiaDaSemana {
  /** 0 = domingo … 6 = sábado. */
  weekday: number;
  modo: ModoDoDia;
  /** "HH:MM", só quando aberto. */
  abre: string | null;
  fecha: string | null;
}

export interface HorariosDaUnidade {
  unitId: string;
  nome: string;
  dias: DiaDaSemana[];
}

const PADRAO = (weekday: number): DiaDaSemana =>
  weekday >= 1 && weekday <= 5
    ? { weekday, modo: "aberto", abre: "09:00", fecha: "18:00" }
    : { weekday, modo: "fechado", abre: null, fecha: null };

export const getHorarios = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<HorariosDaUnidade[]> => {
    const supabase: any = context.supabase;
    const [{ data: unidades }, { data: horas }] = await Promise.all([
      supabase
        .from("clinic_units")
        .select("id, name, is_default")
        .eq("owner_id", context.ownerId)
        .eq("active", true)
        .order("is_default", { ascending: false }),
      supabase
        .from("clinic_business_hours")
        .select("unit_id, weekday, modo, opens_at, closes_at")
        .eq("owner_id", context.ownerId),
    ]);
    return (unidades ?? []).map((u: any) => ({
      unitId: String(u.id),
      nome: String(u.name ?? ""),
      dias: Array.from({ length: 7 }, (_, d) => {
        const h = (horas ?? []).find(
          (x: any) => String(x.unit_id) === String(u.id) && Number(x.weekday) === d,
        );
        if (!h) return PADRAO(d);
        return {
          weekday: d,
          modo: h.modo as ModoDoDia,
          abre: h.opens_at ? String(h.opens_at).slice(0, 5) : null,
          fecha: h.closes_at ? String(h.closes_at).slice(0, 5) : null,
        };
      }),
    }));
  });

const HORA = /^\d{2}:\d{2}$/;

export const salvarHorarios = createServerFn({ method: "POST" })
  .middleware([exigeConfiguracoes])
  .inputValidator((input: { unitId: string; dias: DiaDaSemana[] }) => {
    if (!input.unitId) throw new Error("Unidade inválida.");
    const dias = (input.dias ?? []).map((d) => {
      const modo: ModoDoDia = ["aberto", "fechado", "sob_consulta"].includes(d.modo)
        ? d.modo
        : "fechado";
      if (modo !== "aberto") return { weekday: d.weekday, modo, abre: null, fecha: null };
      if (!HORA.test(String(d.abre)) || !HORA.test(String(d.fecha)))
        throw new Error("Preencha a hora de abrir e de fechar dos dias abertos.");
      if (String(d.fecha) <= String(d.abre))
        throw new Error("Em algum dia o fechamento está antes da abertura.");
      return { weekday: d.weekday, modo, abre: d.abre, fecha: d.fecha };
    });
    if (dias.length !== 7 || new Set(dias.map((d) => d.weekday)).size !== 7)
      throw new Error("Mande os sete dias da semana.");
    return { unitId: input.unitId, dias };
  })
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const { data: unidade } = await supabase
      .from("clinic_units")
      .select("id")
      .eq("id", data.unitId)
      .eq("owner_id", context.ownerId)
      .maybeSingle();
    if (!unidade) throw new Error("Unidade não encontrada.");
    // Troca a semana inteira: apagar e inserir na mesma ida, já que a tabela
    // não tem chave única por (unidade, dia) para um upsert.
    const { error: e1 } = await supabase
      .from("clinic_business_hours")
      .delete()
      .eq("owner_id", context.ownerId)
      .eq("unit_id", data.unitId);
    if (e1) throw new Error(e1.message);
    const { error: e2 } = await supabase.from("clinic_business_hours").insert(
      data.dias.map((d) => ({
        owner_id: context.ownerId,
        unit_id: data.unitId,
        weekday: d.weekday,
        modo: d.modo,
        opens_at: d.abre,
        closes_at: d.fecha,
      })),
    );
    if (e2) throw new Error(e2.message);
    return { ok: true };
  });
