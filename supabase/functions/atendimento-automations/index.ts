// Automações personalizadas: avalia as regras (gatilho -> configurações ->
// ações) configuradas pela clínica sempre que um dos SYSTEM_EVENTS acontece,
// e retoma o que ficou adiado (ação "aguardar tempo" e janela de horário).
//
// Mesma estrutura de meta-capi/index.ts (o gatilho é literalmente o mesmo —
// dispatchAutomationEvent é uma chamada irmã de dispatchMetaCapiEvent nos
// mesmos 6 pontos do código), só trocando "mandar pra Meta" por "executar
// uma lista de ações configuráveis". CRUD das regras mora em
// automations.functions.ts, via RLS direto — regra de automação não guarda
// segredo. Só a EXECUÇÃO passa por aqui, porque as ações reais precisam da
// service role / token do CRM.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enviarWhatsapp } from "../_shared/whatsapp-send.ts";
import { debitDailyUsage, getDailyUsage } from "../_shared/daily-quota.ts";
import { pushToOwner } from "../_shared/push.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/** Quantas execuções adiadas cada tick processa. O cron roda a cada minuto. */
const POR_TICK = 25;

/** Fuso de referência da clínica. A Edge Function roda em UTC, mas a janela
 *  de horário que a clínica configurou é o relógio dela. */
const TZ = "America/Sao_Paulo";

interface DispatchContext {
  entityId?: string | null;
  /** Id "limpo" do card do funil (sem composição tipo "itemId:status") —
   *  só existe quando o evento tem um, usado por "mover etapa" e "observação". */
  itemId?: string | null;
  patientId?: string | null;
  crmContactId?: string | null;
  contactName?: string | null;
  stageId?: string | null;
  status?: string | null;
  dealStatus?: string | null;
  amount?: number | null;
}

type ActionConfig =
  | { type: "send_whatsapp"; message: string }
  | { type: "move_pipeline_stage"; stageId: string }
  | { type: "add_deal_note"; noteBody: string }
  | { type: "send_push"; pushTitle: string; pushBody: string }
  | { type: "webhook"; webhookUrl: string }
  | { type: "wait"; waitMinutes: number };

interface ScheduleWindow {
  enabled?: boolean;
  /** getDay() do JS: 0=domingo ... 6=sábado. */
  days?: number[];
  start?: string;
  end?: string;
  outside?: "defer" | "skip";
}

interface Regra {
  id: string;
  name: string;
  trigger_event: string;
}

// Mesma função de meta-capi/index.ts:381-388, copiada — 6 linhas não
// justificam um módulo compartilhado, e cada consumidor evolui sozinho.
function matchesConditions(conditions: Record<string, unknown>, ctx: DispatchContext) {
  if (conditions?.stageId && String(conditions.stageId) !== String(ctx.stageId ?? "")) return false;
  if (conditions?.status && String(conditions.status) !== String(ctx.status ?? "")) return false;
  if (conditions?.dealStatus && String(conditions.dealStatus) !== String(ctx.dealStatus ?? "")) {
    return false;
  }
  return true;
}

function interpolar(template: string, nome: string | null): string {
  return template.replace(/\{\{\s*nome\s*\}\}/gi, nome?.trim() || "");
}

// ---------- janela de horário ----------

const fmtRelogio = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const fmtData = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const DIAS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function relogioEm(d: Date): { dia: number; minutos: number } {
  const p = fmtRelogio.formatToParts(d);
  const wd = p.find((x) => x.type === "weekday")?.value ?? "Sun";
  const hh = Number(p.find((x) => x.type === "hour")?.value ?? "0");
  const mm = Number(p.find((x) => x.type === "minute")?.value ?? "0");
  return { dia: DIAS[wd] ?? 0, minutos: hh * 60 + mm };
}

function paraMinutos(hhmm: string | undefined, padrao: number): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? "");
  if (!m) return padrao;
  return Number(m[1]) * 60 + Number(m[2]);
}

function janelaAtiva(w: ScheduleWindow | null | undefined): w is ScheduleWindow {
  return Boolean(w?.enabled && Array.isArray(w.days) && w.days.length);
}

function dentroDaJanela(w: ScheduleWindow, agora: Date): boolean {
  const { dia, minutos } = relogioEm(agora);
  if (!(w.days ?? []).includes(dia)) return false;
  const inicio = paraMinutos(w.start, 0);
  const fim = paraMinutos(w.end, 24 * 60);
  return minutos >= inicio && minutos < fim;
}

/** Diferença, em minutos, entre o relógio do fuso e o UTC neste instante.
 *  Calculado a cada chamada (em vez de fixar -03:00) pra não quebrar se o
 *  Brasil voltar a ter horário de verão. */
function offsetMinutos(d: Date): number {
  const p = fmtData.formatToParts(d);
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value ?? "0");
  const comoUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return (comoUtc - Math.floor(d.getTime() / 60000) * 60000) / 60000;
}

/** Instante UTC do próximo início de janela depois de `agora`. */
function proximaAbertura(w: ScheduleWindow, agora: Date): Date {
  const inicio = paraMinutos(w.start, 0);
  for (let salto = 0; salto <= 8; salto++) {
    const candidato = new Date(agora.getTime() + salto * 24 * 60 * 60 * 1000);
    const { dia } = relogioEm(candidato);
    if (!(w.days ?? []).includes(dia)) continue;
    const p = fmtData.formatToParts(candidato);
    const get = (t: string) => Number(p.find((x) => x.type === t)?.value ?? "0");
    // Duas passadas: monta com o offset do instante-base e refina com o
    // offset do instante resultante (importa só se houver troca de fuso
    // entre os dois).
    const parede = Date.UTC(get("year"), get("month") - 1, get("day"), 0, inicio);
    let quando = new Date(parede - offsetMinutos(candidato) * 60000);
    quando = new Date(parede - offsetMinutos(quando) * 60000);
    if (quando.getTime() > agora.getTime()) return quando;
  }
  // Nenhum dia marcado nos próximos 8 dias não deveria acontecer (janelaAtiva
  // exige days não-vazio), mas não trava a fila por isso.
  return new Date(agora.getTime() + 60 * 60 * 1000);
}

// ---------- log e fila ----------

async function logRun(row: {
  owner_id: string;
  rule_id: string | null;
  rule_name: string;
  trigger_event: string;
  action_type: string;
  status: string;
  error?: string | null;
}) {
  await supabase.from("automation_runs").insert(row);
}

async function enfileirar(
  ownerId: string,
  regra: Regra,
  ctx: DispatchContext,
  restantes: ActionConfig[],
  runAfter: Date,
  depth: number,
) {
  await supabase.from("automation_pending_actions").insert({
    owner_id: ownerId,
    rule_id: regra.id,
    rule_name: regra.name,
    trigger_event: regra.trigger_event,
    context: ctx,
    remaining_actions: restantes,
    depth,
    run_after: runAfter.toISOString(),
  });
}

// ---------- ações ----------

/** Resolve um crm_contact_id pra mandar mensagem — reaproveita o mesmo
 *  upsert que garantirContatoCrm já usa (crm-contacts, action "upsert"),
 *  que só funciona com patientId (não aceita crmContactId direto). Sem
 *  patientId nem crmContactId, não tem pra quem mandar. */
async function resolverContatoParaEnvio(
  ownerId: string,
  ctx: DispatchContext,
): Promise<{ contactId: string; conversationId: null } | null> {
  if (ctx.crmContactId) return { contactId: ctx.crmContactId, conversationId: null };
  if (!ctx.patientId) return null;

  const { data: paciente } = await supabase
    .from("patients")
    .select("name, phone, crm_contact_id")
    .eq("id", ctx.patientId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (!paciente) return null;
  if (paciente.crm_contact_id) return { contactId: paciente.crm_contact_id, conversationId: null };
  if (!paciente.phone) return null;

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const res = await fetch(`${url}/functions/v1/crm-contacts`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify({
      ownerId,
      action: "upsert",
      patient: { patientId: ctx.patientId, name: paciente.name, phone: paciente.phone },
    }),
    signal: AbortSignal.timeout(55_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.contactId) return null;
  return { contactId: String(json.contactId), conversationId: null };
}

/** URL de webhook só pode sair pra internet pública por HTTPS — guarda
 *  barata contra apontar a automação pra rede interna. */
function webhookPermitido(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal")) return false;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
  if (h === "[::1]" || h === "::1") return false;
  return true;
}

async function executarAcao(
  ownerId: string,
  action: ActionConfig,
  ctx: DispatchContext,
  regra: Regra,
) {
  const base = {
    owner_id: ownerId,
    rule_id: regra.id,
    rule_name: regra.name,
    trigger_event: regra.trigger_event,
    action_type: action.type,
  };
  const nome = ctx.contactName ?? null;

  if (action.type === "send_whatsapp") {
    const alvo = await resolverContatoParaEnvio(ownerId, ctx);
    if (!alvo) {
      await logRun({ ...base, status: "skipped_no_contact" });
      return;
    }
    // A cota do dia é a MESMA das campanhas e do disparo: sem isto, cada
    // mensagem de automação seria um envio invisível ao contador, vazando
    // pelo mesmo número que a cota existe pra proteger.
    const { limit, usedToday } = await getDailyUsage(supabase, ownerId);
    if (usedToday >= limit) {
      await logRun({
        ...base,
        status: "skipped_daily_limit",
        error: `Limite diário atingido (${usedToday}/${limit}).`,
      });
      return;
    }
    try {
      await enviarWhatsapp(supabase, ownerId, alvo, interpolar(action.message, nome));
      await debitDailyUsage(supabase, ownerId, `automation:${regra.id}`, 1);
      await logRun({ ...base, status: "sent" });
    } catch (e) {
      await logRun({ ...base, status: "failed", error: String(e).slice(0, 500) });
    }
    return;
  }

  if (action.type === "move_pipeline_stage") {
    if (!ctx.itemId) {
      await logRun({ ...base, status: "skipped_no_contact", error: "Evento sem card de funil pra mover." });
      return;
    }
    try {
      // Chama a Edge Function crm-pipeline direto (não o server function
      // movePipelineItem) — é essa escolha que evita o card mover, disparar
      // pipeline.stage_changed de novo e criar um loop. Não mudar isto sem
      // reconsiderar o guardrail (ver comentário em automations.server.ts).
      const url = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const res = await fetch(`${url}/functions/v1/crm-pipeline`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({
          ownerId,
          action: "move-item",
          move: { itemId: ctx.itemId, newStageId: action.stageId },
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error ?? `crm-pipeline respondeu ${res.status}`);
      }
      await logRun({ ...base, status: "sent" });
    } catch (e) {
      await logRun({ ...base, status: "failed", error: String(e).slice(0, 500) });
    }
    return;
  }

  if (action.type === "add_deal_note") {
    if (!ctx.itemId) {
      await logRun({ ...base, status: "skipped_no_contact", error: "Evento sem card de funil." });
      return;
    }
    try {
      // Mesma tabela/formato de logEvent em deals.functions.ts — a observação
      // aparece no histórico do card junto das escritas à mão.
      const { error } = await supabase.from("pipeline_deal_events").insert({
        owner_id: ownerId,
        item_id: ctx.itemId,
        kind: "note",
        body: interpolar(action.noteBody, nome),
        meta: { automation: regra.name },
      });
      if (error) throw new Error(error.message);
      await logRun({ ...base, status: "sent" });
    } catch (e) {
      await logRun({ ...base, status: "failed", error: String(e).slice(0, 500) });
    }
    return;
  }

  if (action.type === "send_push") {
    try {
      await pushToOwner(supabase, ownerId, "automation", {
        title: interpolar(action.pushTitle, nome),
        body: interpolar(action.pushBody, nome),
        url: "/atendimentos/automacoes",
      });
      await logRun({ ...base, status: "sent" });
    } catch (e) {
      await logRun({ ...base, status: "failed", error: String(e).slice(0, 500) });
    }
    return;
  }

  if (action.type === "webhook") {
    if (!webhookPermitido(action.webhookUrl)) {
      await logRun({ ...base, status: "failed", error: "URL de webhook inválida ou não permitida." });
      return;
    }
    try {
      const res = await fetch(action.webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          event: regra.trigger_event,
          rule: { id: regra.id, name: regra.name },
          context: ctx,
          sentAt: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`Webhook respondeu ${res.status}`);
      await logRun({ ...base, status: "sent" });
    } catch (e) {
      await logRun({ ...base, status: "failed", error: String(e).slice(0, 500) });
    }
  }
}

/** Executa a lista em ordem. Ao encontrar um "aguardar", guarda o RESTO na
 *  fila e para — o cron retoma daí. `depth` viaja junto pra que o guardrail
 *  antiloop sobreviva ao adiamento. */
async function executarAcoes(
  ownerId: string,
  acoes: ActionConfig[],
  ctx: DispatchContext,
  regra: Regra,
  depth: number,
) {
  for (let i = 0; i < acoes.length; i++) {
    const acao = acoes[i];
    if (acao.type === "wait") {
      const minutos = Math.max(1, Math.min(Number(acao.waitMinutes ?? 0), 60 * 24 * 30));
      const restantes = acoes.slice(i + 1);
      if (!restantes.length) return; // esperar sem nada depois não faz nada
      await enfileirar(ownerId, regra, ctx, restantes, new Date(Date.now() + minutos * 60000), depth);
      await logRun({
        owner_id: ownerId,
        rule_id: regra.id,
        rule_name: regra.name,
        trigger_event: regra.trigger_event,
        action_type: "wait",
        status: "deferred",
      });
      return;
    }
    await executarAcao(ownerId, acao, ctx, regra);
  }
}

// ---------- entradas ----------

async function handleDispatch(
  ownerId: string,
  systemEvent: string,
  ctx: DispatchContext,
  depth: number,
) {
  // Corta qualquer cadeia entre automações de eventos diferentes antes que
  // vire um ciclo — barato, autocontido, não exige grafo de dependências
  // entre regras (ver plano: guardrail de profundidade).
  if (depth >= 2) {
    return { ok: true, skipped: "profundidade máxima de encadeamento atingida" };
  }

  const { data: regras, error } = await supabase
    .from("automation_rules")
    .select("id, name, trigger_conditions, actions, schedule_window")
    .eq("owner_id", ownerId)
    .eq("trigger_event", systemEvent)
    .eq("active", true);
  if (error) throw new Error(error.message);

  const matching = (regras ?? []).filter((r: any) => matchesConditions(r.trigger_conditions ?? {}, ctx));
  if (!matching.length) return { ok: true, skipped: "nenhuma automação corresponde", executed: 0 };

  const agora = new Date();
  for (const r of matching as any[]) {
    const regra: Regra = { id: r.id, name: r.name, trigger_event: systemEvent };
    const acoes: ActionConfig[] = Array.isArray(r.actions) ? r.actions : [];
    const janela: ScheduleWindow | null = r.schedule_window ?? null;

    if (janelaAtiva(janela) && !dentroDaJanela(janela, agora)) {
      if ((janela.outside ?? "defer") === "skip") {
        await logRun({
          owner_id: ownerId,
          rule_id: regra.id,
          rule_name: regra.name,
          trigger_event: systemEvent,
          action_type: "-",
          status: "skipped_outside_window",
        });
        continue;
      }
      await enfileirar(ownerId, regra, ctx, acoes, proximaAbertura(janela, agora), depth);
      await logRun({
        owner_id: ownerId,
        rule_id: regra.id,
        rule_name: regra.name,
        trigger_event: systemEvent,
        action_type: "-",
        status: "deferred_outside_window",
      });
      continue;
    }

    await executarAcoes(ownerId, acoes, ctx, regra, depth);
  }

  return { ok: true, executed: matching.length };
}

/** Retoma o que estava na fila e já venceu. Stateless e multi-tenant, mesmo
 *  molde do tick do disparo: o cron não manda ownerId. */
async function handleTick() {
  const agora = new Date().toISOString();
  const { data: pendentes } = await supabase
    .from("automation_pending_actions")
    .select("id, owner_id, rule_id, rule_name, trigger_event, context, remaining_actions, depth")
    .eq("status", "pending")
    .lte("run_after", agora)
    .order("run_after", { ascending: true })
    .limit(POR_TICK);

  if (!pendentes?.length) return { ok: true, retomados: 0 };

  let retomados = 0;
  for (const p of pendentes as any[]) {
    // Marca antes de executar: se a função morrer no meio, a linha não volta
    // a ser colhida no minuto seguinte e a mensagem não sai duas vezes.
    await supabase
      .from("automation_pending_actions")
      .update({ status: "done", ran_at: new Date().toISOString() })
      .eq("id", p.id);
    try {
      await executarAcoes(
        p.owner_id,
        Array.isArray(p.remaining_actions) ? p.remaining_actions : [],
        (p.context ?? {}) as DispatchContext,
        { id: p.rule_id, name: p.rule_name ?? "", trigger_event: p.trigger_event },
        Number(p.depth ?? 0),
      );
      retomados++;
    } catch (e) {
      await supabase
        .from("automation_pending_actions")
        .update({ status: "failed", error: String(e).slice(0, 500) })
        .eq("id", p.id);
    }
  }

  return { ok: true, retomados };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  try {
    const body = await req.json().catch(() => ({}));
    const { ownerId, action } = body as { ownerId?: string; action?: string };

    // `tick` vem do cron e varre todos os donos — não tem ownerId.
    if (action === "tick") {
      const result = await handleTick();
      return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
    }

    if (!ownerId || !action) {
      return new Response(JSON.stringify({ error: "ownerId e action são obrigatórios" }), { status: 400 });
    }

    let result: unknown;
    switch (action) {
      case "dispatch":
        result = await handleDispatch(
          ownerId,
          body.systemEvent,
          body.context ?? {},
          Number(body.depth ?? 0),
        );
        break;
      default:
        return new Response(JSON.stringify({ error: `action desconhecida: ${action}` }), { status: 400 });
    }

    return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
  } catch (e) {
    console.error("[atendimento-automations]", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
