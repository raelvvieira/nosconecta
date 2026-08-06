import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface FunnelStageStat {
  etapa: string;
  conversas: number;
  travadas: number;
}

export interface FunnelGargalo {
  etapa: string;
  travadas: number;
  totalNaEtapa: number;
}

export interface StuckConversation {
  conversaId: string;
  contato: string;
  etapa: string;
  paradaHaDias: number;
  motivo: string | null;
  sugestao: string | null;
}

export interface SalesAssistant {
  // null = análise diária ainda não rodou pra essa conta — tratar como
  // "ainda não analisado", não como erro (confirmado no manual, seção 11).
  geradoEm: string | null;
  totalConversas: number;
  etapas: FunnelStageStat[];
  gargalo: FunnelGargalo | null;
  travadas: StuckConversation[];
}

export interface SalesPlaybook {
  ativo: boolean;
  pronto: boolean;
  vendasAprendidas: number;
  faltamVendas: number;
  etapasDeVenda: string[];
  etapasDisponiveis: string[];
  aprendidoEm: string | null;
}

async function callEdgeFunction(body: unknown) {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes");
  const res = await fetch(`${url}/functions/v1/crm-insights`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `Falha ao chamar crm-insights (${res.status})`);
  return json;
}

function mapSalesAssistant(row: any): SalesAssistant {
  return {
    geradoEm: row?.gerado_em ?? null,
    totalConversas: row?.total_conversas ?? 0,
    etapas: Array.isArray(row?.etapas)
      ? row.etapas.map((e: any) => ({
          etapa: e?.etapa ?? "Sem etapa",
          conversas: e?.conversas ?? 0,
          travadas: e?.travadas ?? 0,
        }))
      : [],
    gargalo: row?.gargalo
      ? {
          etapa: row.gargalo.etapa ?? "Sem etapa",
          travadas: row.gargalo.travadas ?? 0,
          totalNaEtapa: row.gargalo.total_na_etapa ?? 0,
        }
      : null,
    travadas: Array.isArray(row?.travadas)
      ? row.travadas.map((t: any) => ({
          conversaId: String(t?.conversa_id ?? ""),
          contato: t?.contato ?? "Contato",
          etapa: t?.etapa ?? "Sem etapa",
          paradaHaDias: t?.parada_ha_dias ?? 0,
          motivo: t?.motivo ?? null,
          sugestao: t?.sugestao ?? null,
        }))
      : [],
  };
}

function mapSalesPlaybook(row: any): SalesPlaybook {
  return {
    ativo: !!row?.ativo,
    pronto: !!row?.pronto,
    vendasAprendidas: row?.vendas_aprendidas ?? 0,
    faltamVendas: row?.faltam_vendas ?? 0,
    etapasDeVenda: Array.isArray(row?.etapas_de_venda) ? row.etapas_de_venda : [],
    etapasDisponiveis: Array.isArray(row?.etapas_disponiveis) ? row.etapas_disponiveis : [],
    aprendidoEm: row?.aprendido_em ?? null,
  };
}

export const getSalesAssistant = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SalesAssistant> => {
    const json = await callEdgeFunction({ ownerId: context.userId, action: "get-sales-assistant" });
    return mapSalesAssistant(json.assistant ?? {});
  });

export const getSalesPlaybook = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SalesPlaybook> => {
    const json = await callEdgeFunction({ ownerId: context.userId, action: "get-sales-playbook" });
    return mapSalesPlaybook(json.playbook ?? {});
  });
