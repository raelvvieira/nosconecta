/* eslint-disable @typescript-eslint/no-explicit-any --
   `retornos_a_agendar` nasce numa migração e só entra em types.ts quando o
   Lovable regenerar; até lá o cliente tipado não a conhece (mesmo escape de
   estoque.functions.ts). */
import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";
import { ordenarRetornos, type RetornoAAgendar } from "./retornos";

export type RetornoDaLista = RetornoAAgendar & {
  unit_id: string | null;
  professional_id: string | null;
  hora_sugerida: string | null;
  hora_fim_sugerida: string | null;
  origem_appointment_id: string | null;
  phone: string | null;
};

const semTabela = (e: any) =>
  !!e &&
  (e.code === "42P01" ||
    e.code === "PGRST205" ||
    /does not exist|schema cache/i.test(String(e.message ?? "")));

/** Quem aguarda ser chamado, do mais antigo ao mais distante. */
export const listarRetornosAAgendar = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { unitId?: string } | undefined) => ({ unitId: input?.unitId ?? null }))
  .handler(async ({ data, context }): Promise<RetornoDaLista[]> => {
    const supabase = context.supabase as any;
    const unitFilter = context.isAdmin ? data.unitId : context.unitId;
    let q = supabase
      .from("retornos_a_agendar")
      .select("*")
      .eq("owner_id", context.ownerId)
      .eq("situacao", "aguardando")
      .order("data_prevista", { ascending: true })
      .limit(500);
    if (unitFilter) q = q.eq("unit_id", unitFilter);
    const { data: rows, error } = await q;
    if (error) {
      if (semTabela(error)) return [];
      throw new Error(error.message);
    }

    // O telefone vem da ficha, para o botão de WhatsApp. Sem ficha, sem botão.
    const ids = [...new Set((rows ?? []).map((r: any) => r.patient_id).filter(Boolean))];
    const telefones = new Map<string, string>();
    if (ids.length) {
      const { data: pacientes } = await supabase
        .from("patients")
        .select("id, phone")
        .eq("owner_id", context.ownerId)
        .in("id", ids);
      for (const p of pacientes ?? []) if (p.phone) telefones.set(p.id, p.phone);
    }

    return ordenarRetornos(
      (rows ?? []).map((r: any) => ({
        id: r.id,
        patient_id: r.patient_id,
        patient_name: r.patient_name,
        procedure_name: r.procedure_name,
        professional_id: r.professional_id,
        professional_name: r.professional_name,
        hora_sugerida: r.hora_sugerida ? String(r.hora_sugerida).slice(0, 5) : null,
        hora_fim_sugerida: r.hora_fim_sugerida ? String(r.hora_fim_sugerida).slice(0, 5) : null,
        data_prevista: r.data_prevista,
        observacao: r.observacao,
        unit_id: r.unit_id,
        origem_appointment_id: r.origem_appointment_id,
        phone: r.patient_id ? (telefones.get(r.patient_id) ?? null) : null,
      })),
    );
  });

/** "Não vai voltar" ou "já resolvi por fora": sai da lista, sem apagar o registro. */
export const dispensarRetorno = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("Retorno inválido");
    return { id: input.id };
  })
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .from("retornos_a_agendar")
      .update({
        situacao: "dispensado",
        resolvido_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("owner_id", context.ownerId)
      .eq("situacao", "aguardando");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** A consulta de retorno foi marcada de verdade: o lembrete se encerra apontando para ela. */
export const vincularRetornoAoAgendamento = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { id: string; appointmentId: string }) => {
    if (!input?.id || !input?.appointmentId) throw new Error("Retorno inválido");
    return { id: input.id, appointmentId: input.appointmentId };
  })
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .from("retornos_a_agendar")
      .update({
        situacao: "agendado",
        agendado_appointment_id: data.appointmentId,
        resolvido_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("owner_id", context.ownerId)
      .eq("situacao", "aguardando");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
