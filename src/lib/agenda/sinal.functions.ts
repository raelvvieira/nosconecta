/* eslint-disable @typescript-eslint/no-explicit-any --
   `atendimento_sinais` nasce numa migração e só entra em types.ts quando o
   Lovable regenerar (mesmo escape das outras funções da agenda). */
import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";
import { comoGravar, ehForma } from "./forma-de-pagamento";
import { recusaDoSinal, saldoAReceber } from "./sinal";

export interface SinalDoAtendimento {
  id: string;
  valor: number;
  pagoEm: string;
  forma: string | null;
  parcelas: number | null;
}

const semTabela = (e: any) =>
  !!e &&
  (e.code === "42P01" ||
    e.code === "PGRST205" ||
    /does not exist|schema cache/i.test(String(e.message ?? "")));

async function lerSinais(supabase: any, ownerId: string, appointmentId: string) {
  const { data, error } = await supabase
    .from("atendimento_sinais")
    .select("id, valor, pago_em, forma, parcelas, transaction_id")
    .eq("owner_id", ownerId)
    .eq("appointment_id", appointmentId)
    .order("pago_em", { ascending: true });
  if (error) {
    if (semTabela(error)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as any[];
}

const paraSinal = (r: any): SinalDoAtendimento => ({
  id: r.id,
  valor: Number(r.valor),
  pagoEm: r.pago_em,
  forma: r.forma ?? null,
  parcelas: r.parcelas ?? null,
});

/** Os sinais pagos deste atendimento. */
export const listarSinais = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { appointmentId: string }) => {
    if (!input?.appointmentId) throw new Error("Atendimento inválido.");
    return { appointmentId: input.appointmentId };
  })
  .handler(async ({ data, context }): Promise<SinalDoAtendimento[]> => {
    const linhas = await lerSinais(context.supabase as any, context.ownerId, data.appointmentId);
    return linhas.map(paraSinal);
  });

/**
 * Depois de mexer nos sinais de um atendimento JÁ confirmado, o recebimento do
 * atendimento passa a valer o saldo (total menos sinais). Antes de confirmar não
 * há o que acertar: o recebimento nasce já com o saldo.
 */
async function acertarRecebimentoDoAtendimento(
  supabase: any,
  ownerId: string,
  appt: any,
  sinais: { valor: number }[],
) {
  if (appt.status !== "completed") return;
  const saldo = saldoAReceber(Number(appt.actual_revenue ?? 0), sinais);
  const { data: principal } = await supabase
    .from("financial_transactions")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("source_type", "agendamento")
    .eq("source_id", String(appt.id))
    .maybeSingle();
  if (!principal?.id) return;
  const patch: Record<string, unknown> =
    saldo > 0 ? { amount: saldo } : { amount: 0.01, status: "cancelled" };
  const { error } = await supabase
    .from("financial_transactions")
    .update(patch)
    .eq("id", principal.id)
    .eq("owner_id", ownerId);
  if (error) throw new Error(error.message);
}

const SELECT_ATENDIMENTO =
  "id, unit_id, patient_id, patient_name, procedure_name, professional_id, status, expected_revenue, actual_revenue";

export const registrarSinal = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator(
    (input: {
      appointmentId: string;
      valor: number;
      pagoEm: string;
      forma?: string | null;
      parcelas?: number | null;
    }) => {
      if (!input?.appointmentId) throw new Error("Atendimento inválido.");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.pagoEm ?? "")))
        throw new Error("Informe a data em que o sinal foi pago.");
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { data: a, error } = await supabase
      .from("appointments")
      .select(SELECT_ATENDIMENTO)
      .eq("id", data.appointmentId)
      .eq("owner_id", context.ownerId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!a) throw new Error("Atendimento não encontrado.");
    if (a.status === "cancelled") throw new Error("Este atendimento foi cancelado.");

    const jaRegistrados = await lerSinais(supabase, context.ownerId, a.id);
    const total = Number(
      a.status === "completed" ? (a.actual_revenue ?? 0) : (a.expected_revenue ?? 0),
    );
    const valor = Math.round(Number(data.valor) * 100) / 100;
    const recusa = recusaDoSinal({ valor, total, jaRegistrado: jaRegistrados.map(paraSinal) });
    if (recusa) throw new Error(recusa);

    const forma = ehForma(data.forma) ? data.forma : null;
    const pagamento = comoGravar(forma, data.parcelas ?? null);

    // 1) a linha do sinal; 2) o recebimento no financeiro, na data do pagamento;
    // 3) o vínculo. Se o financeiro falhar, a linha do sinal sai — nunca fica um
    // sinal registrado sem a receita correspondente.
    const { data: criado, error: erroSinal } = await supabase
      .from("atendimento_sinais")
      .insert({
        owner_id: context.ownerId,
        unit_id: a.unit_id ?? null,
        appointment_id: a.id,
        valor,
        pago_em: data.pagoEm,
        forma,
        parcelas:
          pagamento.installment_total && forma === "cartao_parcelado"
            ? pagamento.installment_total
            : null,
        criado_por: context.userId,
      })
      .select("id")
      .single();
    if (erroSinal) {
      if (semTabela(erroSinal))
        throw new Error("Falta aplicar a atualização do banco para registrar o sinal.");
      throw new Error(erroSinal.message);
    }
    try {
      if (a.unit_id) {
        const { createAppointmentReceivable } = await import("@/lib/finance/receivables.functions");
        const transacao = await createAppointmentReceivable(supabase, context.ownerId, a.unit_id, {
          amount: valor,
          description: `Sinal · ${a.procedure_name || "Atendimento"} · ${a.patient_name}`,
          dueDate: data.pagoEm,
          patientId: a.patient_id,
          professionalId: a.professional_id ?? null,
          paidOn: data.pagoEm,
          origem: { source_type: "agendamento_sinal", source_id: String(criado.id) },
          pagamento,
        });
        if (transacao)
          await supabase
            .from("atendimento_sinais")
            .update({ transaction_id: transacao })
            .eq("id", criado.id);
      }
      await acertarRecebimentoDoAtendimento(supabase, context.ownerId, a, [
        ...jaRegistrados.map(paraSinal),
        { valor },
      ]);
    } catch (e) {
      await supabase.from("atendimento_sinais").delete().eq("id", criado.id);
      throw e;
    }
    return { ok: true as const, id: String(criado.id) };
  });

export const removerSinal = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("Sinal inválido.");
    return { id: input.id };
  })
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { data: s } = await supabase
      .from("atendimento_sinais")
      .select("id, appointment_id, transaction_id")
      .eq("id", data.id)
      .eq("owner_id", context.ownerId)
      .maybeSingle();
    if (!s) throw new Error("Sinal não encontrado.");
    if (s.transaction_id)
      await supabase
        .from("financial_transactions")
        .delete()
        .eq("id", s.transaction_id)
        .eq("owner_id", context.ownerId);
    const { error } = await supabase
      .from("atendimento_sinais")
      .delete()
      .eq("id", s.id)
      .eq("owner_id", context.ownerId);
    if (error) throw new Error(error.message);

    const { data: a } = await supabase
      .from("appointments")
      .select(SELECT_ATENDIMENTO)
      .eq("id", s.appointment_id)
      .eq("owner_id", context.ownerId)
      .maybeSingle();
    if (a) {
      const restantes = await lerSinais(supabase, context.ownerId, a.id);
      await acertarRecebimentoDoAtendimento(supabase, context.ownerId, a, restantes.map(paraSinal));
    }
    return { ok: true as const };
  });
