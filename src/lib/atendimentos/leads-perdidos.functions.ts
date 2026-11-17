/* eslint-disable @typescript-eslint/no-explicit-any --
   `leads_perdidos` nasce numa migração e só entra em types.ts quando o Lovable
   regenerar (mesmo escape de estoque.functions.ts). */
import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";
import { foneCanonico } from "../../../supabase/functions/_shared/inteligencia-do-lead.ts";
import { LOSS_REASONS } from "@/lib/atendimentos/deals.functions";

export interface LeadPerdido {
  id: string;
  fone: string;
  crmContactId: string | null;
  conversationId: string | null;
  name: string;
  motivo: string;
  observacao: string | null;
  valor: number | null;
  perdidoEm: string;
}

const semTabela = (e: any) =>
  !!e &&
  (e.code === "42P01" ||
    e.code === "PGRST205" ||
    /does not exist|schema cache/i.test(String(e.message ?? "")));

export const listarLeadsPerdidos = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<LeadPerdido[]> => {
    const { data, error } = await (context.supabase as any)
      .from("leads_perdidos")
      .select("*")
      .eq("owner_id", context.ownerId)
      .order("perdido_em", { ascending: false })
      .limit(1000);
    if (error) {
      if (semTabela(error)) return [];
      throw new Error(error.message);
    }
    return (data ?? []).map((r: any) => ({
      id: r.id,
      fone: r.fone,
      crmContactId: r.crm_contact_id,
      conversationId: r.conversation_id,
      name: r.name || "Sem nome",
      motivo: r.motivo,
      observacao: r.observacao,
      valor: r.valor == null ? null : Number(r.valor),
      perdidoEm: r.perdido_em,
    }));
  });

export const marcarLeadPerdido = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator(
    (input: {
      fone: string;
      motivo: string;
      observacao?: string;
      name?: string;
      crmContactId?: string | null;
      conversationId?: string | null;
      valor?: number | null;
    }) => {
      const fone = foneCanonico(input?.fone);
      if (!fone) throw new Error("Telefone inválido.");
      if (!LOSS_REASONS.includes(input.motivo)) throw new Error("Escolha um dos motivos.");
      return { ...input, fone };
    },
  )
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).from("leads_perdidos").upsert(
      {
        owner_id: context.ownerId,
        fone: data.fone,
        crm_contact_id: data.crmContactId ?? null,
        conversation_id: data.conversationId ?? null,
        name: data.name ?? "",
        motivo: data.motivo,
        observacao: data.observacao?.trim() || null,
        valor: data.valor ?? null,
        perdido_por: context.userId,
        perdido_em: new Date().toISOString(),
      },
      { onConflict: "owner_id,fone" },
    );
    if (error) {
      if (semTabela(error))
        throw new Error("Falta aplicar a atualização do banco para marcar perdidos.");
      throw new Error(error.message);
    }
    return { ok: true };
  });

/** Voltou a ser lead: a linha sai e o funil o recalcula sozinho. */
export const reabrirLeadPerdido = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { fone: string }) => {
    const fone = foneCanonico(input?.fone);
    if (!fone) throw new Error("Telefone inválido.");
    return { fone };
  })
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .from("leads_perdidos")
      .delete()
      .eq("owner_id", context.ownerId)
      .eq("fone", data.fone);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
