/* eslint-disable @typescript-eslint/no-explicit-any --
   Mesmo escape das outras funções da agenda: o cliente tipado não conhece
   todas as colunas, e o Supabase devolve `any` aqui. */
import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";
import { callEdgeFunction } from "@/lib/atendimentos/atendimentos.functions";
import { clinicTodayStr } from "@/lib/date";
import { foneCanonico } from "../../../supabase/functions/_shared/inteligencia-do-lead.ts";
import { montarReciboPdf, numeroDoRecibo, rotuloDoMetodo, textoSeguro } from "./recibo";

function paraBase64(bytes: Uint8Array): string {
  let bin = "";
  const passo = 0x8000;
  for (let i = 0; i < bytes.length; i += passo)
    bin += String.fromCharCode(...bytes.subarray(i, i + passo));
  return btoa(bin);
}

/**
 * Gera o recibo em PDF de um atendimento concluído e manda na conversa de
 * WhatsApp com o paciente.
 *
 * O destino é o telefone da ficha: a conversa do WhatsApp É o número, e o
 * envio por JID cai na mesma conversa em que a pessoa já fala com a clínica.
 * Sem telefone, ou sem conexão de WhatsApp, devolve um erro legível — nunca um
 * "enviado" que não chegou.
 */
export const enviarReciboDoAtendimento = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { appointmentId: string }) => {
    if (!input?.appointmentId) throw new Error("Atendimento inválido.");
    return { appointmentId: input.appointmentId };
  })
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { data: a, error } = await supabase
      .from("appointments")
      .select(
        "id, patient_id, patient_name, procedure_name, professional_name, date, status, actual_revenue, unit_id",
      )
      .eq("id", data.appointmentId)
      .eq("owner_id", context.ownerId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!a) throw new Error("Atendimento não encontrado.");
    if (a.status !== "completed")
      throw new Error("O recibo só sai depois de confirmar que o atendimento aconteceu.");
    const valor = Number(a.actual_revenue ?? 0);
    if (!(valor > 0)) throw new Error("Atendimento sem valor cobrado — não há o que recibar.");

    const { data: paciente } = a.patient_id
      ? await supabase
          .from("patients")
          .select("phone")
          .eq("id", a.patient_id)
          .eq("owner_id", context.ownerId)
          .maybeSingle()
      : { data: null };
    const fone = foneCanonico(paciente?.phone);
    if (!fone)
      throw new Error("O paciente não tem telefone de WhatsApp cadastrado para receber o recibo.");

    const [{ data: clinica }, { data: unidade }, { data: lancamento }] = await Promise.all([
      supabase.from("clinicas").select("nome").eq("owner_id", context.ownerId).maybeSingle(),
      a.unit_id
        ? supabase
            .from("clinic_units")
            .select("name, address")
            .eq("id", a.unit_id)
            .eq("owner_id", context.ownerId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("financial_transactions")
        .select("payment_method, installment_total")
        .eq("owner_id", context.ownerId)
        .eq("source_type", "agendamento")
        .eq("source_id", String(a.id))
        .limit(1)
        .maybeSingle(),
    ]);

    const nomeDaClinica = clinica?.nome || "NÓS Odontologia";
    const local = unidade?.address
      ? `${unidade.address}`
      : unidade?.name
        ? `${nomeDaClinica} - ${unidade.name}`
        : null;

    const pdf = await montarReciboPdf({
      numero: numeroDoRecibo(String(a.date), String(a.id)),
      clinica: nomeDaClinica,
      local,
      paciente: a.patient_name,
      procedimento: a.procedure_name || null,
      profissional: a.professional_name || null,
      data: String(a.date),
      valor,
      formaDePagamento: rotuloDoMetodo(lancamento?.payment_method, lancamento?.installment_total),
      emitidoEm: clinicTodayStr(),
    });

    const nomeDoArquivo = `Recibo ${textoSeguro(String(a.patient_name)).trim() || "atendimento"} - ${String(a.date).split("-").reverse().join("-")}.pdf`;
    // O id da conversa do WhatsApp É o jid do número; o `wa-enviar` entende.
    await callEdgeFunction("wa-enviar", {
      ownerId: context.ownerId,
      conversationId: `${fone}@s.whatsapp.net`,
      content: `Olá, ${String(a.patient_name).split(" ")[0]}! Segue o recibo do seu atendimento. Qualquer dúvida, é só chamar.`,
      attachments: [{ name: nomeDoArquivo, type: "application/pdf", data: paraBase64(pdf) }],
      // Mensagem automática do sistema: não tira a conversa da assistente.
      assumir: false,
    });
    return { ok: true as const };
  });
