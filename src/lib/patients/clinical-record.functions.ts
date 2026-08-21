/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";

// Prontuário clínico: anamnese e evoluções.
//
// As tabelas nascem na migration 20260821120000_patient_clinical_record.sql, que
// só passa a valer quando alguém roda "Apply pending Supabase migrations" no
// Lovable — criar tabela não é coisa que este repositório faça sozinho.
//
// Até lá, o Postgres responde 42P01 (relação não existe). Isso NÃO é erro de
// leitura: é "a funcionalidade ainda não foi ligada". Tratar como erro faria a
// aba inteira do paciente mostrar uma falha vermelha por um passo de
// implantação pendente, o que assusta sem informar.

/** Código do Postgres para "relação não existe". */
const TABELA_AUSENTE = "42P01";

export class TabelaAusente extends Error {
  constructor() {
    super("As tabelas do prontuário ainda não foram criadas no banco.");
    this.name = "TabelaAusente";
  }
}

/** Diferencia "ainda não implantado" de "deu erro de verdade". */
function lancarSeErroReal(error: any): void {
  if (!error) return;
  if (error.code === TABELA_AUSENTE || /does not exist/i.test(String(error.message ?? ""))) {
    throw new TabelaAusente();
  }
  throw new Error(error.message);
}

export interface AnamneseCampo {
  id: string;
  label: string;
  type: "boolean" | "text" | "choice";
  options?: string[];
}

/** O que uma resposta pode ser, conforme os três tipos de campo do modelo.
 *
 *  Era `unknown`, e o validador de serialização do TanStack recusou — com
 *  razão: `unknown` não atravessa a fronteira servidor→cliente, e aqui o
 *  conjunto de valores é conhecido e pequeno. */
export type RespostaDeAnamnese = string | boolean | null;

export interface Anamnese {
  id: string;
  professionalName: string | null;
  template: AnamneseCampo[];
  answers: Record<string, RespostaDeAnamnese>;
  filledAt: string;
}

export interface Evolucao {
  id: string;
  appointmentId: string | null;
  professionalName: string | null;
  body: string;
  createdAt: string;
}

export interface ProntuarioDoPaciente {
  anamneses: Anamnese[];
  evolucoes: Evolucao[];
  /** true quando a migration ainda não foi aplicada. A tela usa isto para
   *  explicar o que falta em vez de mostrar uma lista vazia enganosa. */
  indisponivel: boolean;
}

/**
 * O modelo padrão de anamnese.
 *
 * Fica no código, e não numa tabela de configuração, porque hoje ninguém edita
 * questionário pela interface — e uma tabela sem tela para administrá-la seria
 * complexidade sem uso. Quando a edição existir, este vira só o valor inicial:
 * cada anamnese preenchida guarda o próprio `template`, então mudar isto aqui
 * nunca reescreve o que já foi respondido.
 */
export const MODELO_PADRAO: AnamneseCampo[] = [
  { id: "tratamento_medico", label: "Está em tratamento médico no momento?", type: "boolean" },
  { id: "medicamentos", label: "Toma algum medicamento contínuo? Quais?", type: "text" },
  { id: "alergia", label: "Tem alergia a algum medicamento ou material?", type: "boolean" },
  { id: "alergia_qual", label: "Se sim, qual?", type: "text" },
  { id: "gravidez", label: "Está grávida ou amamentando?", type: "boolean" },
  { id: "pressao", label: "Tem pressão alta?", type: "boolean" },
  { id: "diabetes", label: "Tem diabetes?", type: "boolean" },
  { id: "anestesia", label: "Já teve reação a anestesia odontológica?", type: "boolean" },
  { id: "sangramento", label: "Tem problema de coagulação ou sangramento?", type: "boolean" },
  { id: "fumante", label: "Fuma?", type: "boolean" },
  { id: "observacoes", label: "Outras observações relevantes", type: "text" },
];

const mapAnamnese = (r: any): Anamnese => ({
  id: String(r.id),
  professionalName: r.professional_name ?? null,
  template: Array.isArray(r.template) ? r.template : [],
  answers: r.answers ?? {},
  filledAt: r.filled_at,
});

const mapEvolucao = (r: any): Evolucao => ({
  id: String(r.id),
  appointmentId: r.appointment_id ?? null,
  professionalName: r.professional_name ?? null,
  body: r.body ?? "",
  createdAt: r.created_at,
});

export const getProntuario = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { patientId: string }) => input)
  .handler(async ({ data, context }): Promise<ProntuarioDoPaciente> => {
    const supabase: any = context.supabase;
    // As duas leituras vão juntas: a aba mostra as duas coisas de uma vez, e
    // encadear daria duas idas ao banco para desenhar uma tela só.
    const [anamneseRes, notasRes] = await Promise.all([
      supabase
        .from("patient_anamnesis")
        .select("id, professional_name, template, answers, filled_at")
        .eq("patient_id", data.patientId)
        .order("filled_at", { ascending: false }),
      supabase
        .from("patient_notes")
        .select("id, appointment_id, professional_name, body, created_at")
        .eq("patient_id", data.patientId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    try {
      lancarSeErroReal(anamneseRes.error);
      lancarSeErroReal(notasRes.error);
    } catch (e) {
      if (e instanceof TabelaAusente) {
        return { anamneses: [], evolucoes: [], indisponivel: true };
      }
      throw e;
    }

    return {
      anamneses: (anamneseRes.data ?? []).map(mapAnamnese),
      evolucoes: (notasRes.data ?? []).map(mapEvolucao),
      indisponivel: false,
    };
  });

/** Nome do profissional logado, para carimbar no registro.
 *
 *  Snapshot e não só o id: quem assinou precisa continuar legível mesmo depois
 *  de o profissional sair da clínica e a linha em `professionals` sumir. */
async function autorAtual(supabase: any, ownerId: string): Promise<{ id: string | null; nome: string | null }> {
  const { data } = await supabase
    .from("professionals")
    .select("id, name")
    .eq("owner_id", ownerId)
    .limit(1)
    .maybeSingle();
  return { id: data?.id ?? null, nome: data?.name ?? null };
}

export const salvarAnamnese = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { patientId: string; answers: Record<string, RespostaDeAnamnese> }) => {
    if (!input.patientId) throw new Error("Paciente não informado.");
    return input;
  })
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const supabase: any = context.supabase;
    const autor = await autorAtual(supabase, context.ownerId);
    const { data: row, error } = await supabase
      .from("patient_anamnesis")
      .insert({
        patient_id: data.patientId,
        professional_id: autor.id,
        professional_name: autor.nome,
        // O modelo viaja junto da resposta — ver o comentário da migration.
        template: MODELO_PADRAO,
        answers: data.answers,
      })
      .select("id")
      .single();
    lancarSeErroReal(error);
    return { id: String(row.id) };
  });

export const salvarEvolucao = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { patientId: string; body: string; appointmentId?: string | null }) => {
    if (!input.patientId) throw new Error("Paciente não informado.");
    if (!input.body?.trim()) throw new Error("Escreva a evolução antes de salvar.");
    return input;
  })
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const supabase: any = context.supabase;
    const autor = await autorAtual(supabase, context.ownerId);
    const { data: row, error } = await supabase
      .from("patient_notes")
      .insert({
        patient_id: data.patientId,
        appointment_id: data.appointmentId ?? null,
        professional_id: autor.id,
        professional_name: autor.nome,
        body: data.body.trim(),
      })
      .select("id")
      .single();
    lancarSeErroReal(error);
    return { id: String(row.id) };
  });

export const excluirEvolucao = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const supabase: any = context.supabase;
    // Sem filtro de dono aqui de propósito: a RLS já recusa apagar evolução de
    // paciente de outra clínica, e repetir a checagem no cliente daria a falsa
    // impressão de que ela é a proteção.
    const { error } = await supabase.from("patient_notes").delete().eq("id", data.id);
    lancarSeErroReal(error);
    return { ok: true };
  });
