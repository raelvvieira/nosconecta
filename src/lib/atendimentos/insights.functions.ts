/* eslint-disable @typescript-eslint/no-explicit-any */
// `any` no client do Supabase, como em `funis.functions.ts` e
// `pipeline.functions.ts`: `src/integrations/supabase/types.ts` é gerado pelo
// Lovable e não pode ser editado à mão.
import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";
import { analisarFunil, type PessoaNoFunil, type SalesAssistant } from "./assistente-de-vendas";
import { chaveDoTelefone } from "./funil";

/**
 * O assistente de vendas.
 *
 * ── O que isto era ──────────────────────────────────────────────────────
 *
 * Um proxy para `GET /api/v1/sales_assistant` e `/sales_playbook` na conta do
 * CRM. A primeira era uma análise que rodava **uma vez por dia, às 4h**: quem
 * abrisse o Dashboard às 15h via o retrato da madrugada, e antes da primeira
 * rodada via "ainda não analisado".
 *
 * Agora a conta sai aqui, na hora da pergunta, e a conta em si mora em
 * `assistente-de-vendas.ts`, com teste.
 */

export type {
  FunnelStageStat,
  FunnelGargalo,
  StuckConversation,
  SalesAssistant,
} from "./assistente-de-vendas";

export interface SalesPlaybook {
  ativo: boolean;
  pronto: boolean;
  vendasAprendidas: number;
  faltamVendas: number;
  etapasDeVenda: string[];
  etapasDisponiveis: string[];
  aprendidoEm: string | null;
}

/** Quantas vendas o playbook precisa aprender antes de servir para alguma
 *  coisa. Mesmo número que o CRM usava — três exemplos são o mínimo para um
 *  padrão existir em vez de um caso isolado virar regra. */
const VENDAS_PARA_FICAR_PRONTO = 3;

export const getSalesAssistant = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<SalesAssistant> => {
    const supabase: any = context.supabase;

    const [cards, etapas] = await Promise.all([
      supabase
        .from("funnel_cards")
        .select("id, stage_id, phone, conversation_id, title")
        .eq("owner_id", context.ownerId),
      supabase.from("funnel_stages").select("id, name").eq("owner_id", context.ownerId),
    ]);
    if (cards.error) throw new Error(cards.error.message);
    if (etapas.error) throw new Error(etapas.error.message);

    const nomeDaEtapa = new Map<string, string>(
      (etapas.data ?? []).map((e: any) => [String(e.id), e.name ?? "Sem etapa"]),
    );
    const linhas = cards.data ?? [];
    if (!linhas.length) return analisarFunil([]);

    // As conversas de quem está no funil. A view já junta conversa e contato e
    // entrega o telefone normalizado — é a mesma ponte que a thread usa.
    const { data: conversas, error: erroConversas } = await supabase
      .from("wa_conversas_por_pessoa")
      .select("crm_conversation_id, phone_e164, contact_name, last_message_at")
      .eq("owner_id", context.ownerId);
    if (erroConversas) throw new Error(erroConversas.message);

    const porTelefone = new Map<string, any>();
    const porConversa = new Map<string, any>();
    for (const c of conversas ?? []) {
      porConversa.set(String(c.crm_conversation_id), c);
      const chave = chaveDoTelefone(c.phone_e164);
      // A mais recente de cada número ganha: é a conversa viva da pessoa.
      const atual = chave ? porTelefone.get(chave) : null;
      if (chave && (!atual || (c.last_message_at ?? "") > (atual.last_message_at ?? ""))) {
        porTelefone.set(chave, c);
      }
    }

    /** A conversa por trás de um card — pela mesma chave que o funil usa. */
    const conversaDoCard = (linha: any) => {
      const chave = chaveDoTelefone(linha.phone);
      if (chave) return porTelefone.get(chave);
      return linha.conversation_id ? porConversa.get(String(linha.conversation_id)) : undefined;
    };

    // Quem falou por último em cada conversa. Uma consulta para todas, e o
    // pareamento em JS: são as conversas de quem está no funil, dezenas, não a
    // caixa inteira.
    const idsDeConversa = [
      ...new Set(
        linhas
          .map((l: any) => conversaDoCard(l)?.crm_conversation_id)
          .filter((id: unknown): id is string => typeof id === "string" && !!id),
      ),
    ];

    const ultimaDe = new Map<string, boolean>();
    if (idsDeConversa.length) {
      const { data: mensagens, error: erroMensagens } = await supabase
        .from("wa_messages")
        .select("crm_conversation_id, from_me, sent_at")
        .eq("owner_id", context.ownerId)
        .in("crm_conversation_id", idsDeConversa)
        .order("sent_at", { ascending: false });
      // Erro NÃO vira mapa vazio calado: sem isto, toda conversa passaria a
      // dizer "sem nenhuma mensagem trocada" e ninguém saberia por quê.
      if (erroMensagens) throw new Error(erroMensagens.message);
      for (const m of mensagens ?? []) {
        const id = String(m.crm_conversation_id);
        // A primeira de cada conversa é a mais recente: a lista veio ordenada.
        if (!ultimaDe.has(id)) ultimaDe.set(id, !!m.from_me);
      }
    }

    const pessoas: PessoaNoFunil[] = linhas.map((linha: any) => {
      const conversa = conversaDoCard(linha);
      const conversaId = conversa?.crm_conversation_id ?? linha.conversation_id ?? "";
      return {
        conversaId: String(conversaId),
        contato: linha.title ?? conversa?.contact_name ?? null,
        etapa: nomeDaEtapa.get(String(linha.stage_id)) ?? "Sem etapa",
        ultimaMensagemEm: conversa?.last_message_at ?? null,
        ultimaFoiDaClinica: ultimaDe.has(String(conversaId))
          ? ultimaDe.get(String(conversaId))!
          : null,
      };
    });

    return analisarFunil(pessoas);
  });

/**
 * O estado do agente de vendas.
 *
 * Lia `/api/v1/sales_playbook` no CRM — o agente DELE. O nosso é outro, e já
 * mora aqui: `ai_agents` diz se está ligado, `ai_playbook_sources` guarda as
 * vendas que ele aprendeu.
 */
export const getSalesPlaybook = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<SalesPlaybook> => {
    const supabase: any = context.supabase;

    const [agente, fontes, etapas] = await Promise.all([
      supabase.from("ai_agents").select("enabled").eq("owner_id", context.ownerId).maybeSingle(),
      supabase
        .from("ai_playbook_sources")
        .select("id, created_at")
        .eq("owner_id", context.ownerId)
        .order("created_at", { ascending: false }),
      supabase.from("funnel_stages").select("name").eq("owner_id", context.ownerId),
    ]);
    if (agente.error) throw new Error(agente.error.message);
    if (fontes.error) throw new Error(fontes.error.message);
    if (etapas.error) throw new Error(etapas.error.message);

    const aprendidas = fontes.data ?? [];
    return {
      ativo: !!agente.data?.enabled,
      pronto: aprendidas.length >= VENDAS_PARA_FICAR_PRONTO,
      vendasAprendidas: aprendidas.length,
      faltamVendas: Math.max(0, VENDAS_PARA_FICAR_PRONTO - aprendidas.length),
      // Quais etapas contam como venda é configuração do agente, não deste
      // retrato — ele mostra só o que existe para escolher.
      etapasDeVenda: [],
      etapasDisponiveis: (etapas.data ?? []).map((e: any) => e.name ?? "Sem nome"),
      aprendidoEm: aprendidas[0]?.created_at ?? null,
    };
  });
