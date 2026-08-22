/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";

// A caixa de avisos da clínica — o que alimenta o sino, a etiqueta na agenda e
// a linha do bloco "Atenção" na Início.
//
// As três telas leem da MESMA fonte de propósito. Antes disto, "o paciente
// pediu remarcar" só existia como push já entregue: se ninguém tinha push
// ativado, o aviso não existia em lugar nenhum. E com a automação decidindo a
// resposta, nem o webhook sabe mais que foi recusa — quem sabe é a linha que a
// ação "Notificar a equipe" grava.
//
// Fala direto com o Supabase pela RLS de dono, sem Edge Function: não há
// segredo envolvido (mesmo padrão de automations.functions.ts). Quem CRIA
// aviso é sempre a Edge Function com service role.

const TABELA_AUSENTE = "42P01";

function ausente(error: any): boolean {
  return (
    !!error &&
    (error.code === TABELA_AUSENTE || /does not exist/i.test(String(error.message ?? "")))
  );
}

export interface AvisoDaClinica {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  url: string | null;
  appointmentId: string | null;
  patientId: string | null;
  lido: boolean;
  createdAt: string;
}

export interface CaixaDeAvisos {
  avisos: AvisoDaClinica[];
  naoLidos: number;
  /** Migration ainda não aplicada. A tela trata como "nenhum aviso" em vez de
   *  quebrar — mesma convenção das telas de prontuário e arquivos. */
  indisponivel: boolean;
}

const mapear = (row: any): AvisoDaClinica => ({
  id: String(row.id),
  kind: row.kind,
  title: row.title,
  body: row.body ?? null,
  url: row.url ?? null,
  appointmentId: row.appointment_id ?? null,
  patientId: row.patient_id ?? null,
  lido: !!row.read_at,
  createdAt: row.created_at,
});

/** Últimos avisos e quantos estão em aberto.
 *
 *  Traz os lidos junto (limitado a 30) porque um sino que esvazia ao ser aberto
 *  perde a única forma de reencontrar o que se acabou de ler. */
export const listarAvisos = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<CaixaDeAvisos> => {
    const supabase: any = context.supabase;
    const { data, error } = await supabase
      .from("clinic_notifications")
      .select("id, kind, title, body, url, appointment_id, patient_id, read_at, created_at")
      .eq("owner_id", context.ownerId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) {
      if (ausente(error)) return { avisos: [], naoLidos: 0, indisponivel: true };
      throw new Error(error.message);
    }
    const avisos = (data ?? []).map(mapear);
    return {
      avisos,
      naoLidos: avisos.filter((a: AvisoDaClinica) => !a.lido).length,
      indisponivel: false,
    };
  });

/** Ids de agendamento com aviso EM ABERTO.
 *
 *  Devolve só os ids, e não os avisos: a agenda já carregou os agendamentos e
 *  só precisa saber quais marcar. Cruzar no cliente evita refazer a consulta
 *  da agenda, que é a mais pesada da tela. */
export const avisosPorAgendamento = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<string[]> => {
    const supabase: any = context.supabase;
    const { data, error } = await supabase
      .from("clinic_notifications")
      .select("appointment_id")
      .eq("owner_id", context.ownerId)
      .is("read_at", null)
      .not("appointment_id", "is", null);
    if (error) {
      if (ausente(error)) return [];
      throw new Error(error.message);
    }
    const ids = (data ?? []).map((r: any) => String(r.appointment_id)) as string[];
    return [...new Set(ids)];
  });

export const marcarLido = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { ids: string[] }) => input)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    if (!data.ids.length) return { ok: true };
    const supabase: any = context.supabase;
    const { error } = await supabase
      .from("clinic_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("owner_id", context.ownerId)
      .is("read_at", null)
      .in("id", data.ids);
    if (error && !ausente(error)) throw new Error(error.message);
    return { ok: true };
  });

export const marcarTodosLidos = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const supabase: any = context.supabase;
    const { error } = await supabase
      .from("clinic_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("owner_id", context.ownerId)
      .is("read_at", null);
    if (error && !ausente(error)) throw new Error(error.message);
    return { ok: true };
  });
