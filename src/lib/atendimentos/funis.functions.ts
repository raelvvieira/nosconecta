/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";

// O funil de Clientes.
//
// Diferente do funil de Leads, que vive no CRM externo e tem etapas
// arrastáveis, este é calculado: a etapa sai da view `patient_funnel_stage`, a
// partir de orçamento, tratamento e última consulta. Não há o que arrastar —
// e é essa a troca, feita de propósito: o quadro nunca envelhece parado.

const TABELA_AUSENTE = "42P01";

function ausente(error: any): boolean {
  return (
    !!error &&
    (error.code === TABELA_AUSENTE || /does not exist/i.test(String(error.message ?? "")))
  );
}

/** As colunas, na ordem em que aparecem — que é a mesma ordem de precedência da
 *  view. Manter as duas listas alinhadas é o que faz o quadro contar a mesma
 *  história que o banco. */
export const ETAPAS_DO_CLIENTE = [
  "novo",
  "orcamento_aberto",
  "tratamento_parado",
  "em_tratamento",
  "inativo",
  "manutencao",
] as const;

export type EtapaDoCliente = (typeof ETAPAS_DO_CLIENTE)[number];

export interface ClienteNoFunil {
  patientId: string;
  name: string;
  phone: string | null;
  crmContactId: string | null;
  ultimaConsulta: string | null;
  stage: EtapaDoCliente;
}

/** Quantos cards cada coluna traz de uma vez. A base inteira entra neste funil,
 *  então despejar tudo travaria a pintura — o resto vem por "ver mais". */
export const POR_COLUNA = 20;

const mapear = (row: any): ClienteNoFunil => ({
  patientId: String(row.patient_id),
  name: row.name ?? "",
  phone: row.phone ?? null,
  crmContactId: row.crm_contact_id ?? null,
  ultimaConsulta: row.ultima_concluida ?? null,
  stage: row.stage as EtapaDoCliente,
});

function comEscopo(query: any, context: any) {
  // Mesmo recorte por unidade das outras telas: admin com "todas" vê tudo, e
  // quem está numa unidade só vê a dela.
  const q = query.eq("owner_id", context.ownerId);
  return context.unitId ? q.eq("unit_id", context.unitId) : q;
}

/**
 * Quantos clientes há em cada coluna.
 *
 * Sai de uma view que já agrupa, e não de contar linhas trazidas para cá: o
 * PostgREST devolve no máximo 1000 linhas por padrão, então contar no cliente
 * daria números MENORES que a realidade assim que a clínica passasse de mil
 * pacientes — errado, e sem erro nenhum para denunciar.
 *
 * A busca não passa por aqui de propósito: com busca ativa a contagem por
 * coluna vem do que cada coluna carregou, e o quadro mostra o que achou em vez
 * de um total que não corresponde ao que está na tela.
 */
export const getContagemDoFunil = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<{ contagem: Record<string, number>; indisponivel: boolean }> => {
    const supabase: any = context.supabase;
    const { data: linhas, error } = await comEscopo(
      supabase.from("patient_funnel_counts").select("stage, total"),
      context,
    );
    if (error) {
      if (ausente(error)) return { contagem: {}, indisponivel: true };
      throw new Error(error.message);
    }
    const contagem: Record<string, number> = {};
    for (const row of linhas ?? []) {
      // Somado, e não atribuído: sem unidade escolhida a view devolve uma linha
      // por unidade para a mesma etapa.
      contagem[row.stage] = (contagem[row.stage] ?? 0) + Number(row.total ?? 0);
    }
    return { contagem, indisponivel: false };
  });

/** Uma coluna inteira, para o "ver mais". */
export const getColunaDoFunil = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { stage: EtapaDoCliente; q?: string; offset: number }) => input)
  .handler(async ({ data, context }): Promise<ClienteNoFunil[]> => {
    const supabase: any = context.supabase;
    const busca = (data.q ?? "").trim();

    let query = comEscopo(
      supabase
        .from("patient_funnel_stage")
        .select("patient_id, name, phone, crm_contact_id, ultima_concluida, stage")
        .eq("stage", data.stage),
      context,
    );
    if (busca) query = query.or(`name.ilike.%${busca}%,phone.ilike.%${busca}%`);

    const { data: linhas, error } = await query
      .order("name", { ascending: true })
      .range(data.offset, data.offset + POR_COLUNA - 1);
    if (error) {
      if (ausente(error)) return [];
      throw new Error(error.message);
    }
    return (linhas ?? []).map(mapear);
  });
