/* eslint-disable @typescript-eslint/no-explicit-any --
   Mesmo escape das outras funções da agenda: o cliente tipado não conhece
   todas as colunas, e o Supabase devolve `any` aqui. */
import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";
import { callEdgeFunction } from "@/lib/atendimentos/atendimentos.functions";
import { clinicTodayStr } from "@/lib/date";
import { rotuloDoPagamento } from "./forma-de-pagamento";
import { quantidadeEmTexto } from "./procedimentos";
import { ORIGEM_DA_SEGUNDA_PARTE } from "./pagamento-dividido";
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
  .inputValidator((input: { appointmentId: string; tipo?: "sinal" | "completo" }) => {
    if (!input?.appointmentId) throw new Error("Atendimento inválido.");
    return {
      appointmentId: input.appointmentId,
      tipo: input.tipo === "sinal" ? "sinal" : "completo",
    } as {
      appointmentId: string;
      tipo: "sinal" | "completo";
    };
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
    const ehSinal = data.tipo === "sinal";

    // Os sinais pagos: o recibo completo os discrimina; o de sinal é só deles.
    const { data: linhasSinais } = await supabase
      .from("atendimento_sinais")
      .select("valor, pago_em, forma, parcelas")
      .eq("owner_id", context.ownerId)
      .eq("appointment_id", a.id)
      .order("pago_em", { ascending: true });
    const sinais = (linhasSinais ?? []).map((s: any) => ({
      valor: Number(s.valor),
      data: String(s.pago_em),
      forma: rotuloDoPagamento(s.forma, s.parcelas) || null,
    }));

    // O que foi feito, item a item. Sem a tabela (ou sem as colunas de
    // quantidade) cai no resumo do atendimento.
    const { data: linhasItens } = await supabase
      .from("appointment_procedures")
      .select("procedure_name, quantity, unit, position")
      .eq("owner_id", context.ownerId)
      .eq("appointment_id", a.id)
      .order("position", { ascending: true });
    const itens = (linhasItens ?? []).map((p: any) => ({
      nome: String(p.procedure_name ?? ""),
      quantidade: quantidadeEmTexto(p.quantity == null ? null : Number(p.quantity), p.unit) || null,
    }));

    let valor: number;
    if (ehSinal) {
      if (sinais.length === 0) throw new Error("Este atendimento não tem sinal registrado.");
      valor = sinais.reduce((acc: number, s: any) => acc + Math.round(s.valor * 100), 0) / 100;
    } else {
      if (a.status !== "completed")
        throw new Error(
          "O recibo completo só sai depois de confirmar que o atendimento aconteceu.",
        );
      valor = Number(a.actual_revenue ?? 0);
      if (!(valor > 0)) throw new Error("Atendimento sem valor cobrado — não há o que recibar.");
    }

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
        .select("amount, status, payment_method, installment_total")
        .eq("owner_id", context.ownerId)
        .eq("source_type", "agendamento")
        .eq("source_id", String(a.id))
        .limit(1)
        .maybeSingle(),
    ]);
    // A segunda forma de pagamento, quando o atendimento foi pago em duas.
    const { data: parte2 } = await supabase
      .from("financial_transactions")
      .select("amount, status, payment_method, installment_total")
      .eq("owner_id", context.ownerId)
      .eq("source_type", ORIGEM_DA_SEGUNDA_PARTE)
      .eq("source_id", String(a.id))
      .limit(1)
      .maybeSingle();
    const pagamentos =
      !ehSinal && parte2 && parte2.status !== "cancelled" && lancamento
        ? [lancamento, parte2].map((t: any) => ({
            valor: Number(t.amount ?? 0),
            forma: rotuloDoMetodo(t.payment_method, t.installment_total),
          }))
        : [];

    const nomeDaClinica = clinica?.nome || "NÓS Odontologia";
    const local = unidade?.address
      ? `${unidade.address}`
      : unidade?.name
        ? `${nomeDaClinica} - ${unidade.name}`
        : null;

    const pdf = await montarReciboPdf({
      numero: `${numeroDoRecibo(String(a.date), String(a.id))}${ehSinal ? "-S" : ""}`,
      tipo: data.tipo,
      itens,
      pagamentos,
      sinais: ehSinal ? [] : sinais,
      clinica: nomeDaClinica,
      local,
      paciente: a.patient_name,
      procedimento: a.procedure_name || null,
      profissional: a.professional_name || null,
      data: String(a.date),
      valor,
      formaDePagamento: ehSinal
        ? [...new Set(sinais.map((s: any) => s.forma).filter(Boolean))].join(" / ") || null
        : rotuloDoMetodo(lancamento?.payment_method, lancamento?.installment_total),
      emitidoEm: clinicTodayStr(),
    });

    const nomeDoArquivo = `${ehSinal ? "Recibo de sinal" : "Recibo"} ${textoSeguro(String(a.patient_name)).trim() || "atendimento"} - ${String(a.date).split("-").reverse().join("-")}.pdf`;
    // O id da conversa do WhatsApp É o jid do número; o `wa-enviar` entende.
    await callEdgeFunction("wa-enviar", {
      ownerId: context.ownerId,
      conversationId: `${fone}@s.whatsapp.net`,
      content: ehSinal
        ? `Olá, ${String(a.patient_name).split(" ")[0]}! Segue o recibo do sinal que você pagou. Qualquer dúvida, é só chamar.`
        : `Olá, ${String(a.patient_name).split(" ")[0]}! Segue o recibo do seu atendimento. Qualquer dúvida, é só chamar.`,
      attachments: [{ name: nomeDoArquivo, type: "application/pdf", data: paraBase64(pdf) }],
      // Mensagem automática do sistema: não tira a conversa da assistente.
      assumir: false,
    });
    // O registro do envio. Falhar aqui não desfaz o envio que já saiu: só deixa
    // a tela sem o "enviado em…". Sem a tabela (migração ainda não aplicada),
    // segue sem registrar.
    const { error: erroRegistro } = await supabase.from("recibos_enviados").insert({
      owner_id: context.ownerId,
      appointment_id: a.id,
      numero: numeroDoRecibo(String(a.date), String(a.id)),
      valor,
      tipo: data.tipo,
      enviado_por: context.userId,
    });
    if (erroRegistro) console.warn("[recibo] não registrei o envio:", erroRegistro.message);
    return { ok: true as const };
  });

export interface SituacaoDoRecibo {
  /** Quantas vezes o recibo já foi enviado. */
  vezes: number;
  /** O último envio, ISO. */
  ultimoEm: string | null;
}

/** Já mandei o recibo deste atendimento? Para mostrar "enviado em…" e "enviar novamente". */
export const situacaoDoRecibo = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { appointmentId: string; tipo?: "sinal" | "completo" }) => {
    if (!input?.appointmentId) throw new Error("Atendimento inválido.");
    return {
      appointmentId: input.appointmentId,
      tipo: input.tipo === "sinal" ? "sinal" : "completo",
    } as {
      appointmentId: string;
      tipo: "sinal" | "completo";
    };
  })
  .handler(async ({ data, context }): Promise<SituacaoDoRecibo> => {
    const { data: linhas, error } = await (context.supabase as any)
      .from("recibos_enviados")
      .select("enviado_em")
      .eq("owner_id", context.ownerId)
      .eq("appointment_id", data.appointmentId)
      .eq("tipo", data.tipo)
      .order("enviado_em", { ascending: false })
      .limit(50);
    // Sem a tabela ainda, ou qualquer falha de leitura: trata como "nunca
    // enviado" — o botão continua funcionando.
    if (error) return { vezes: 0, ultimoEm: null };
    return { vezes: (linhas ?? []).length, ultimoEm: linhas?.[0]?.enviado_em ?? null };
  });
