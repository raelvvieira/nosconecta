/* eslint-disable @typescript-eslint/no-explicit-any --
   `lead_origem` e a view `conversa_origem_automatica` nascem em migração e só
   entram em types.ts quando o Lovable regenerar. */
import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";
import { variantesDoNumero } from "./phone";
import { chaveDaOrigem, resolverOrigem, type OrigemDaConversa } from "./origem-do-lead";

export interface OrigemDoPaciente extends OrigemDaConversa {
  /** O telefone usado (o da ficha, quando só o paciente foi informado). */
  phone: string | null;
}

/**
 * A origem de uma pessoa, vista da AGENDA: o paciente (ou um telefone) em vez
 * de uma conversa.
 *
 * É a mesma conta da lista de conversas: a escolha da recepção vale mais; sem
 * ela, o que o WhatsApp provou (clique em anúncio, frase pronta da página) nas
 * conversas deste número; sem nenhum dos dois, orgânico. O telefone passa pelas
 * duas formas do número (com e sem o nono dígito) para achar a conversa.
 */
export const getOrigemDoPaciente = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { patientId?: string | null; phone?: string | null }) => ({
    patientId: input?.patientId ?? null,
    phone: input?.phone ?? null,
  }))
  .handler(async ({ data, context }): Promise<OrigemDoPaciente> => {
    const supabase = context.supabase as any;
    let phone = data.phone?.trim() || null;
    if (!phone && data.patientId) {
      const { data: paciente } = await supabase
        .from("patients")
        .select("phone")
        .eq("id", data.patientId)
        .maybeSingle();
      phone = paciente?.phone ?? null;
    }
    // Sem telefone, a chave é a do paciente — a mesma que `definirOrigemDoLead`
    // recebe da agenda.
    const chave = chaveDaOrigem(phone, data.patientId ? `paciente:${data.patientId}` : "sem-chave");

    const jids = phone ? variantesDoNumero(phone).map((v) => `${v}@s.whatsapp.net`) : [];
    const [manual, auto] = await Promise.all([
      supabase
        .from("lead_origem")
        .select("origem")
        .eq("owner_id", context.ownerId)
        .eq("chave", chave)
        .maybeSingle(),
      jids.length
        ? supabase
            .from("conversa_origem_automatica")
            .select("origem")
            .eq("owner_id", context.ownerId)
            .in("conversation_id", jids)
        : Promise.resolve({ data: [] }),
    ]);
    // Falha de leitura NÃO derruba o card de agendamento: sem origem, aparece a
    // estimativa "orgânico", que é o estado de antes.
    const semTabela = (e: any) =>
      !!e && /does not exist|schema cache|42P01|PGRST205/i.test(`${e.code} ${e.message}`);
    for (const r of [manual, auto]) {
      if (r.error && !semTabela(r.error)) console.error("[origem do paciente]", r.error.message);
    }
    const sinais = ((auto.data ?? []) as { origem: string }[]).map((a) => a.origem);
    return { ...resolverOrigem(manual.data?.origem, sinais), phone };
  });
