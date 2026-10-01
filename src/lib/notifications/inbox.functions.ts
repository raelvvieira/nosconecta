/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";
import { tipoDoAviso, type TipoDeAviso } from "./tipo-do-aviso";

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
export interface AvisoDoAgendamento {
  appointmentId: string;
  tipo: TipoDeAviso;
}

/**
 * Os agendamentos com aviso em aberto, e O QUE cada aviso é.
 *
 * O `tipo` vem junto desde 01/10. Antes daqui só saía a lista de ids, e a
 * agenda escrevia "pediu remarcar" em cima de qualquer um deles — errando 23
 * de 24 vezes, porque quase todo aviso é "resposta não entendida". A tela não
 * tinha como saber: o dado parava aqui. Ver `tipo-do-aviso.ts`.
 */
export const avisosPorAgendamento = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<AvisoDoAgendamento[]> => {
    const supabase: any = context.supabase;
    const { data, error } = await supabase
      .from("clinic_notifications")
      .select("appointment_id, title, created_at")
      .eq("owner_id", context.ownerId)
      .is("read_at", null)
      .not("appointment_id", "is", null)
      // Do mais novo para o mais velho: quando a mesma consulta tem vários
      // avisos, o que vale é o último — a pessoa respondeu de novo.
      .order("created_at", { ascending: false });
    if (error) {
      if (ausente(error)) return [];
      throw new Error(error.message);
    }

    const porAgendamento = new Map<string, TipoDeAviso>();
    for (const r of (data ?? []) as any[]) {
      const id = String(r.appointment_id);
      const tipo = tipoDoAviso(r.title);
      const jaTem = porAgendamento.get(id);
      // "remarcar" ganha de "resposta" mesmo sendo mais antigo: entre "tem
      // coisa para ler" e "quer desmarcar", o segundo é o que muda a agenda.
      if (!jaTem || (jaTem === "resposta" && tipo === "remarcar")) {
        porAgendamento.set(id, tipo);
      }
    }
    return [...porAgendamento].map(([appointmentId, tipo]) => ({ appointmentId, tipo }));
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
