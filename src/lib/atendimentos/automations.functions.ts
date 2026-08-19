import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";
import { SYSTEM_EVENTS, type SystemEvent } from "@/lib/integrations/meta-capi.functions";
import { varsIncompativeis } from "@/lib/atendimentos/automation-vars";

export type AutomationActionType =
  | "send_whatsapp"
  | "move_pipeline_stage"
  | "add_deal_note"
  | "send_push"
  | "webhook"
  | "wait";

export interface AutomationAction {
  type: AutomationActionType;
  /** Só em send_whatsapp — texto da mensagem, aceita as variáveis de
   *  automation-vars.ts ({{nome}}, {{data}}, {{hora}}, {{unidade}}…). */
  message?: string;
  /** Só em move_pipeline_stage — etapa de destino. */
  stageId?: string;
  /** Só em add_deal_note — texto da observação, aceita as mesmas variáveis. */
  noteBody?: string;
  /** Só em send_push. */
  pushTitle?: string;
  pushBody?: string;
  /** Só em webhook — precisa ser https e host público. */
  webhookUrl?: string;
  /** Só em wait — 1 minuto a 30 dias. */
  waitMinutes?: number;
}

/** Janela em que a automação pode agir, no relógio da clínica
 *  (America/Sao_Paulo). Fora dela, `outside` decide entre adiar para a
 *  próxima abertura ou simplesmente não executar. */
export interface AutomationScheduleWindow {
  enabled?: boolean;
  /** getDay() do JS: 0=domingo ... 6=sábado. */
  days?: number[];
  start?: string;
  end?: string;
  outside?: "defer" | "skip";
}

export interface AutomationCanvasPosition {
  x: number;
  y: number;
}

export type AutomationNodeType = "trigger" | "action" | "condition" | "randomizer";

/** Campo do evento que uma condição pode testar — só o que já chega no
 *  contexto do disparo, sem consulta extra ao banco ou ao CRM. */
export type ConditionField = "amount" | "hasContact" | "status" | "stageId" | "dealStatus";
export type ConditionOperator = "gt" | "lt" | "eq";

export interface AutomationNodeData {
  /** action: a ação em si (mesma forma de sempre). */
  action?: AutomationAction;
  /** condition. */
  field?: ConditionField;
  operator?: ConditionOperator;
  value?: string;
  /** randomizer: peso por saída, em %. As chaves são os handles ("a","b",…). */
  weights?: Record<string, number>;
}

export interface AutomationNode {
  id: string;
  type: AutomationNodeType;
  position: AutomationCanvasPosition;
  data: AutomationNodeData;
}

export interface AutomationEdge {
  id: string;
  source: string;
  target: string;
  /** "sim"/"nao" numa condição, "a"/"b"/… num randomizador, null numa ação. */
  sourceHandle?: string | null;
}

export interface AutomationCanvasLayout {
  acionamento?: AutomationCanvasPosition;
  configuracoes?: AutomationCanvasPosition;
  acoes?: AutomationCanvasPosition;
}

export interface AutomationRule {
  id: string;
  name: string;
  active: boolean;
  triggerEvent: SystemEvent | null;
  triggerConditions: { stageId?: string; status?: string; dealStatus?: string };
  /** Espelho derivado do grafo, mantido por um release — a lista usa pro
   *  resumo. O executor lê `nodes`. */
  actions: AutomationAction[];
  nodes: AutomationNode[];
  edges: AutomationEdge[];
  scheduleWindow: AutomationScheduleWindow;
  canvasLayout: AutomationCanvasLayout;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationRunLogRow {
  id: string;
  ruleName: string | null;
  triggerEvent: string;
  actionType: string;
  status: string;
  error: string | null;
  ranAt: string;
}

/** Automação salva antes do canvas livre tem `nodes` vazio e a lista de
 *  ações em `actions`. Desenha ela como a cadeia linear que sempre foi:
 *  gatilho -> ação1 -> ação2 -> … O executor faz a MESMA síntese, pra que
 *  uma regra antiga continue rodando sem ninguém precisar reabrir e salvar. */
const TIPOS_DE_NO: AutomationNodeType[] = ["trigger", "action", "condition", "randomizer"];

/** Um nó só entra no canvas se for utilizável: id, tipo conhecido e posição
 *  numérica. Não é paranoia — a coluna `nodes` já recebeu escrita de fora
 *  deste código (uma migration de conversão gravou nós sem `position` e de um
 *  tipo `config` que não existe aqui), e o React Flow lê `position.x` sem
 *  checar: um nó torto derruba a tela inteira do editor. */
function noUtilizavel(n: any): n is AutomationNode {
  return (
    !!n &&
    typeof n.id === "string" &&
    n.id.length > 0 &&
    TIPOS_DE_NO.includes(n.type) &&
    Number.isFinite(n?.position?.x) &&
    Number.isFinite(n?.position?.y)
  );
}

/** Grafo gravado que sobrevive ao saneamento — ou `null`, e aí a leitura cai
 *  na síntese a partir de `actions`, que continua íntegra na sua coluna. */
function grafoGravado(row: { nodes?: unknown; edges?: unknown }): {
  nodes: AutomationNode[];
  edges: AutomationEdge[];
} | null {
  if (!Array.isArray(row.nodes) || !row.nodes.length) return null;
  const nodes = (row.nodes as any[]).filter(noUtilizavel);
  // Sem gatilho não há por onde o fluxo começar: melhor remontar do zero a
  // partir de `actions` do que abrir um canvas órfão.
  if (!nodes.some((n) => n.type === "trigger")) return null;
  const ids = new Set(nodes.map((n) => n.id));
  const edges = (Array.isArray(row.edges) ? (row.edges as any[]) : [])
    .filter((e) => e && typeof e.id === "string" && ids.has(e.source) && ids.has(e.target))
    .map((e) => ({
      id: String(e.id),
      source: String(e.source),
      target: String(e.target),
      sourceHandle: e.sourceHandle ?? null,
    }));
  return { nodes, edges };
}

export function sintetizarNodes(row: {
  nodes?: unknown;
  edges?: unknown;
  actions?: unknown;
  canvas_layout?: any;
}): AutomationNode[] {
  const gravado = grafoGravado(row);
  if (gravado) return gravado.nodes;
  const acoes: AutomationAction[] = Array.isArray(row.actions) ? row.actions : [];
  const x0 = row.canvas_layout?.acionamento?.x ?? 0;
  const y0 = row.canvas_layout?.acionamento?.y ?? 40;
  const nodes: AutomationNode[] = [
    { id: "trigger", type: "trigger", position: { x: x0, y: y0 }, data: {} },
  ];
  acoes.forEach((action, i) => {
    nodes.push({
      id: `a${i}`,
      type: "action",
      position: { x: x0 + 360 * (i + 1), y: y0 },
      data: { action },
    });
  });
  return nodes;
}

export function sintetizarEdges(row: { nodes?: unknown; edges?: unknown; actions?: unknown }): AutomationEdge[] {
  const gravado = grafoGravado(row);
  if (gravado) return gravado.edges;
  const acoes: AutomationAction[] = Array.isArray(row.actions) ? row.actions : [];
  return acoes.map((_, i) => ({
    id: `e${i}`,
    source: i === 0 ? "trigger" : `a${i - 1}`,
    target: `a${i}`,
    sourceHandle: null,
  }));
}

function mapRule(row: any): AutomationRule {
  return {
    id: String(row.id),
    name: row.name ?? "",
    active: row.active ?? true,
    triggerEvent: (row.trigger_event as SystemEvent) ?? null,
    triggerConditions: (row.trigger_conditions ?? {}) as AutomationRule["triggerConditions"],
    actions: Array.isArray(row.actions) ? row.actions : [],
    nodes: sintetizarNodes(row),
    edges: sintetizarEdges(row),
    scheduleWindow: (row.schedule_window ?? {}) as AutomationScheduleWindow,
    canvasLayout: (row.canvas_layout ?? {}) as AutomationCanvasLayout,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Regras não guardam segredo, então falam direto com o Supabase pela RLS de
// dono — sem passar pela Edge Function (mesmo padrão de meta-capi.functions.ts
// pros gatilhos da Meta CAPI). Só a execução (atendimento-automations) precisa
// de service role, por causa do token do CRM.
export const listAutomations = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<AutomationRule[]> => {
    const supabase: any = context.supabase;
    const { data, error } = await supabase
      .from("automation_rules")
      .select("*")
      .eq("owner_id", context.ownerId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapRule);
  });

export const getAutomation = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }): Promise<AutomationRule | null> => {
    const supabase: any = context.supabase;
    const { data: row, error } = await supabase
      .from("automation_rules")
      .select("*")
      .eq("id", data.id)
      .eq("owner_id", context.ownerId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row ? mapRule(row) : null;
  });

export const saveAutomation = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: Partial<AutomationRule> & { name: string }) => {
    if (!input.name?.trim()) throw new Error("Dê um nome à automação.");
    if (!input.triggerEvent || !SYSTEM_EVENTS.includes(input.triggerEvent)) {
      throw new Error("Escolha quando a automação dispara.");
    }
    const nodes = input.nodes ?? [];
    const edges = input.edges ?? [];
    const acoesDoGrafo = nodes.filter((n) => n.type === "action");
    if (!acoesDoGrafo.length) throw new Error("Adicione ao menos uma ação ao fluxo.");
    if (nodes.length > 100 || edges.length > 200) throw new Error("O fluxo ficou grande demais.");

    const porId = new Map(nodes.map((n) => [n.id, n]));
    const raiz = nodes.find((n) => n.type === "trigger");
    if (!raiz) throw new Error("O fluxo precisa do card de acionamento.");

    // Ligações: apontam para cards que existem, não voltam pro próprio card,
    // e respeitam uma saída por handle / uma entrada por card. Essas duas
    // últimas mantêm o fluxo em árvore — sem elas, dois caminhos chegando no
    // mesmo card fariam ele rodar duas vezes (mensagem duplicada).
    const saidasUsadas = new Set<string>();
    const entradasUsadas = new Set<string>();
    for (const e of edges) {
      if (!porId.has(e.source) || !porId.has(e.target)) {
        throw new Error("Há uma ligação solta no fluxo. Refaça as conexões.");
      }
      if (e.source === e.target) throw new Error("Um card não pode se ligar a ele mesmo.");
      const chaveSaida = `${e.source}:${e.sourceHandle ?? ""}`;
      if (saidasUsadas.has(chaveSaida)) {
        throw new Error("Cada saída de card pode ter só uma ligação.");
      }
      saidasUsadas.add(chaveSaida);
      if (entradasUsadas.has(e.target)) {
        throw new Error("Cada card pode receber só uma ligação de entrada.");
      }
      entradasUsadas.add(e.target);
    }
    if (!edges.some((e) => e.source === raiz.id)) {
      throw new Error("Ligue o card de acionamento ao primeiro passo do fluxo.");
    }

    // Ciclo: é a única falha que custa dinheiro de verdade (envio, cota,
    // fila crescendo sem fim), então é recusada aqui em vez de tratada em
    // runtime — o `depth` do executor não protege nada (ver automations.server.ts).
    const saidas = new Map<string, string[]>();
    for (const e of edges) saidas.set(e.source, [...(saidas.get(e.source) ?? []), e.target]);
    const estado = new Map<string, 1 | 2>();
    const temCiclo = (id: string): boolean => {
      if (estado.get(id) === 1) return true;
      if (estado.get(id) === 2) return false;
      estado.set(id, 1);
      for (const alvo of saidas.get(id) ?? []) if (temCiclo(alvo)) return true;
      estado.set(id, 2);
      return false;
    };
    for (const n of nodes) if (temCiclo(n.id)) throw new Error("O fluxo tem um ciclo — um caminho que volta pra trás. Desfaça a ligação de volta.");

    // Validação por card, portada da lista de ações.
    for (const n of nodes) {
      if (n.type === "condition") {
        if (!n.data.field) throw new Error("Escolha o que a condição testa.");
        if (n.data.field !== "hasContact" && !String(n.data.value ?? "").trim()) {
          throw new Error("Informe o valor de comparação da condição.");
        }
        continue;
      }
      if (n.type !== "action") continue;
      const acao = n.data.action;
      if (!acao) throw new Error("Há um card de ação vazio no fluxo.");
      if (acao.type === "send_whatsapp" && !acao.message?.trim()) {
        throw new Error("Escreva a mensagem da ação de WhatsApp.");
      }
      // Variável que este gatilho não sabe preencher é recusada AQUI, e não no
      // envio: barrar na hora de salvar é o único momento em que dá pra
      // explicar o problema pra quem escreveu. Em runtime o executor só pula.
      for (const [campo, texto] of [
        ["mensagem", acao.message],
        ["observação", acao.noteBody],
        ["título da notificação", acao.pushTitle],
        ["texto da notificação", acao.pushBody],
      ] as const) {
        if (!texto) continue;
        const invalidas = varsIncompativeis(texto, input.triggerEvent);
        if (invalidas.length) {
          throw new Error(
            `O gatilho escolhido não preenche ${invalidas.map((v) => `{{${v}}}`).join(", ")} — ` +
              `tire ${invalidas.length > 1 ? "essas variáveis" : "essa variável"} da ${campo} ou troque o gatilho.`,
          );
        }
      }
      if (acao.type === "move_pipeline_stage" && !acao.stageId) {
        throw new Error("Escolha a etapa de destino da ação de mover no funil.");
      }
      if (acao.type === "add_deal_note" && !acao.noteBody?.trim()) {
        throw new Error("Escreva o texto da observação.");
      }
      if (acao.type === "send_push" && (!acao.pushTitle?.trim() || !acao.pushBody?.trim())) {
        throw new Error("Preencha título e texto da notificação.");
      }
      if (acao.type === "webhook" && !/^https:\/\//i.test(acao.webhookUrl?.trim() ?? "")) {
        throw new Error("A URL do webhook precisa começar com https://.");
      }
      if (acao.type === "wait") {
        const min = Number(acao.waitMinutes ?? 0);
        if (!(min >= 1) || min > 60 * 24 * 30) {
          throw new Error("O tempo de espera precisa ficar entre 1 minuto e 30 dias.");
        }
        // Esperar sem nada depois não faz nada — melhor recusar do que salvar
        // uma automação que parece fazer algo e não faz.
        if (!edges.some((e) => e.source === n.id)) {
          throw new Error('"Aguardar tempo" não pode terminar o fluxo — ligue o que vem depois da espera.');
        }
      }
    }

    const janela = input.scheduleWindow;
    if (janela?.enabled) {
      if (!janela.days?.length) throw new Error("Escolha ao menos um dia da semana na janela de horário.");
      const min = (v?: string) => {
        const m = /^(\d{1,2}):(\d{2})$/.exec(v ?? "");
        return m ? Number(m[1]) * 60 + Number(m[2]) : null;
      };
      const ini = min(janela.start);
      const fim = min(janela.end);
      if (ini === null || fim === null) throw new Error("Informe início e fim da janela de horário.");
      // Janela que vira o dia (ex.: 22:00-06:00) não é suportada — o
      // avaliador no servidor compara minutos no mesmo dia.
      if (ini >= fim) throw new Error("O fim da janela precisa ser depois do início.");
    }

    // Guardrail de loop, portado da lista para o grafo: mover etapa não pode
    // estar em NENHUM card de uma automação que já dispara ao mudar de etapa.
    // Como o `depth` do executor é inerte, este check é a proteção real.
    if (
      input.triggerEvent === "pipeline.stage_changed" &&
      acoesDoGrafo.some((n) => n.data.action?.type === "move_pipeline_stage")
    ) {
      throw new Error(
        'Automações que disparam quando "o card muda de etapa" não podem ter "mover para etapa" como ação — isso criaria um loop.',
      );
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const row = {
      id: data.id || crypto.randomUUID(),
      owner_id: context.ownerId,
      name: data.name.trim(),
      active: data.active ?? true,
      trigger_event: data.triggerEvent,
      trigger_conditions: data.triggerConditions ?? {},
      // Espelho derivado, mantido por um release (a lista usa pro resumo).
      actions: (data.nodes ?? [])
        .filter((n) => n.type === "action" && n.data.action)
        .map((n) => n.data.action!),
      nodes: data.nodes ?? [],
      edges: data.edges ?? [],
      schedule_window: data.scheduleWindow ?? {},
      canvas_layout: data.canvasLayout ?? {},
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("automation_rules").upsert(row);
    if (error) throw new Error(error.message);
    return { ok: true, id: row.id };
  });

/** Liga/desliga sem passar pelo save completo.
 *
 *  `saveAutomation` monta a linha inteira e grava `?? {}` no que não vier no
 *  input — então usá-lo pra um toggle apagava silenciosamente tudo que a tela
 *  da lista não carrega (a janela de horário, e agora o grafo). Um update de
 *  uma coluna só não tem como fazer isso.
 */
export const setAutomationActive = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { id: string; active: boolean }) => input)
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const { error } = await supabase
      .from("automation_rules")
      .update({ active: data.active, updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("owner_id", context.ownerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAutomation = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const { error } = await supabase
      .from("automation_rules")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.ownerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getAutomationRuns = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { ruleId?: string } = {}) => input)
  .handler(async ({ data, context }): Promise<AutomationRunLogRow[]> => {
    const supabase: any = context.supabase;
    let query = supabase
      .from("automation_runs")
      .select("id, rule_name, trigger_event, action_type, status, error, ran_at")
      .eq("owner_id", context.ownerId)
      .order("ran_at", { ascending: false })
      .limit(20);
    if (data.ruleId) query = query.eq("rule_id", data.ruleId);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => ({
      id: String(r.id),
      ruleName: r.rule_name,
      triggerEvent: r.trigger_event,
      actionType: r.action_type,
      status: r.status,
      error: r.error,
      ranAt: r.ran_at,
    }));
  });
