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
import { enviarWhatsapp, type AlvoDeEnvio } from "../_shared/whatsapp-send.ts";
import { crmFetch } from "../_shared/crm-auth.ts";
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

/** Versão do motor de automações.
 *
 *  Existe para o editor conseguir responder uma pergunta que hoje não tem
 *  resposta em lugar nenhum: "esta função está publicada?". Sem ela, uma
 *  automação bem montada e um deploy que nunca aconteceu produzem exatamente
 *  o mesmo sintoma — nada acontece e o histórico fica vazio.
 *
 *  A ausência é informativa nos dois sentidos: função não publicada devolve
 *  404, e versão anterior a esta devolve "action desconhecida". São três
 *  respostas distintas para três situações distintas.
 *
 *  Subir este número quando o executor mudar de forma que o app precise saber. */
const VERSAO_MOTOR = 5;

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
  /** Agendamento que o evento diz respeito — a ação de mudar status precisa
   *  dele, e `entityId` nem sempre é o id limpo. */
  appointmentId?: string | null;
  /** Quantos dias faltam para a consulta (3, 1, 0). Só no lembrete diário. */
  daysUntil?: number | null;
  /** O que o paciente escreveu. Só em whatsapp.reply_received. */
  replyText?: string | null;
  /** Dados do agendamento congelados no disparo — ver automations.server.ts. */
  appointment?: {
    date?: string | null;
    startTime?: string | null;
    procedureName?: string | null;
    professionalName?: string | null;
    unitId?: string | null;
  } | null;
}

type ActionConfig =
  | { type: "send_whatsapp"; message: string }
  | { type: "move_pipeline_stage"; stageId: string }
  | { type: "add_deal_note"; noteBody: string }
  | { type: "send_push"; pushTitle: string; pushBody: string }
  | { type: "webhook"; webhookUrl: string }
  | { type: "wait"; waitMinutes: number }
  | { type: "set_appointment_status"; appointmentStatus: string };

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

type NodeType = "trigger" | "action" | "condition" | "randomizer";

interface GrafoNode {
  id: string;
  type: NodeType;
  data: {
    action?: ActionConfig;
    field?:
      | "amount"
      | "hasContact"
      | "status"
      | "stageId"
      | "dealStatus"
      | "unitId"
      | "daysUntil"
      | "replyText";
    operator?: "gt" | "lt" | "eq" | "contains" | "not_contains";
    value?: string;
    weights?: Record<string, number>;
  };
}

interface GrafoEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
}

interface Grafo {
  nodes: GrafoNode[];
  edges: GrafoEdge[];
}

/** Automação salva antes do canvas livre tem `nodes` vazio e a lista em
 *  `actions`. A síntese mora AQUI, e não só na tela: uma regra antiga que
 *  ninguém reabriu tem que continuar rodando. Mesma cadeia linear que o
 *  `sintetizarNodes` do front desenha. */
function grafoDaRegra(row: any): Grafo {
  const nodes: GrafoNode[] = Array.isArray(row.nodes) ? row.nodes : [];
  if (nodes.length) {
    return { nodes, edges: Array.isArray(row.edges) ? row.edges : [] };
  }
  const acoes: ActionConfig[] = Array.isArray(row.actions) ? row.actions : [];
  return {
    nodes: [
      { id: "trigger", type: "trigger", data: {} },
      ...acoes.map((action, i) => ({ id: `a${i}`, type: "action" as const, data: { action } })),
    ],
    edges: acoes.map((_, i) => ({
      id: `e${i}`,
      source: i === 0 ? "trigger" : `a${i - 1}`,
      target: `a${i}`,
      sourceHandle: null,
    })),
  };
}

/** Texto comparável: sem acento, sem caixa, sem espaço sobrando.
 *
 *  Em português isto não é refinamento, é requisito: "Não", "nao" e "NÃO" são
 *  a MESMA resposta, e comparar cru mandaria as três para ramos diferentes. O
 *  `classifyReply` do webhook de entrada já minúscula pelo mesmo motivo; aqui
 *  vai um passo além e tira o acento, porque quem digita no celular
 *  frequentemente não acentua.
 *
 *  NFD separa a letra do acento; o range \u0300-\u036f remove só os
 *  diacríticos, preservando ç → c e qualquer outro caractere. */
function comparavel(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/** "contém" quer dizer contém a PALAVRA, não a sequência de letras.
 *
 *  Sem isto, `contém "sim"` casa com "as-sim" — e a resposta "não, assim não
 *  posso" confirmaria a consulta. O `classifyReply` do webhook de entrada já
 *  compara por token pelo mesmo motivo; aqui a fronteira é feita por regex
 *  porque o alvo pode ter mais de uma palavra ("pode sim").
 *
 *  O texto já vem sem acento de `comparavel`, então sobra só [a-z0-9] como
 *  "caractere de palavra" — pontuação, espaço e início/fim contam como
 *  fronteira. */
function contemPalavra(texto: string, alvo: string): boolean {
  const escapado = alvo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escapado}([^a-z0-9]|$)`).test(texto);
}

/** Avalia uma condição só com o que já veio no contexto do disparo.
 *  Valor ausente cai sempre no ramo "não" — `patient.created` e
 *  `pipeline.stage_changed` não carregam valor, e isso tem que ser
 *  previsível em vez de virar erro. */
function avaliarCondicao(node: GrafoNode, ctx: DispatchContext): boolean {
  const { field, operator, value } = node.data;
  if (field === "hasContact") return Boolean(ctx.patientId || ctx.crmContactId);
  if (field === "amount") {
    if (ctx.amount === null || ctx.amount === undefined) return false;
    const alvo = Number(String(value ?? "").replace(",", "."));
    if (!Number.isFinite(alvo)) return false;
    if (operator === "gt") return Number(ctx.amount) > alvo;
    if (operator === "lt") return Number(ctx.amount) < alvo;
    return Number(ctx.amount) === alvo;
  }
  // Quantos dias faltam para a consulta. Mesma comparação numérica de `amount`,
  // e o mesmo cuidado: ausente cai no ramo "não" em vez de virar 0 — 0 é "é
  // hoje", que é um valor legítimo e não pode ser confundido com "não sei".
  if (field === "daysUntil") {
    if (ctx.daysUntil === null || ctx.daysUntil === undefined) return false;
    const alvo = Number(String(value ?? "").trim());
    if (!Number.isFinite(alvo)) return false;
    if (operator === "gt") return Number(ctx.daysUntil) > alvo;
    if (operator === "lt") return Number(ctx.daysUntil) < alvo;
    return Number(ctx.daysUntil) === alvo;
  }
  // O que o paciente respondeu.
  if (field === "replyText") {
    const texto = comparavel(ctx.replyText);
    const alvo = comparavel(value);
    if (!alvo) return false;
    // Sem resposta nenhuma: "não contém" seria tecnicamente verdadeiro, mas
    // dizer que uma mensagem inexistente "não contém não" e seguir pelo ramo
    // Sim é o tipo de acerto por acidente que vira mensagem errada.
    if (!texto) return false;
    if (operator === "contains") return contemPalavra(texto, alvo);
    if (operator === "not_contains") return !contemPalavra(texto, alvo);
    return texto === alvo;
  }
  // Unidade do agendamento. Compara ID e não nome: renomear a unidade em
  // Configurações não pode mudar para onde uma automação salva manda mensagem.
  // `appointments.unit_id` é NOT NULL, então em gatilho de agenda este lado
  // nunca é vazio — e o save recusa esta condição nos outros gatilhos, onde
  // `ctx.appointment` é nulo e ela cairia sempre no "não".
  if (field === "unitId") {
    return String(value ?? "") === String(ctx.appointment?.unitId ?? "");
  }
  // Igualdades usam a mesma coerção de matchesConditions, senão a condição do
  // gatilho e a do card se comportariam diferente pro mesmo valor.
  const doCtx =
    field === "status" ? ctx.status : field === "stageId" ? ctx.stageId : ctx.dealStatus;
  return String(value ?? "") === String(doCtx ?? "");
}

/** Sorteia entre as saídas CONECTADAS, normalizando os pesos só sobre elas —
 *  sortear um handle solto viraria um "não fez nada" aleatório. */
function sortearSaida(node: GrafoNode, saidas: GrafoEdge[]): GrafoEdge | null {
  if (!saidas.length) return null;
  const pesos = saidas.map((e) => Math.max(0, Number(node.data.weights?.[e.sourceHandle ?? "a"] ?? 1)));
  const total = pesos.reduce((a, b) => a + b, 0);
  if (total <= 0) return saidas[0];
  let sorte = Math.random() * total;
  for (let i = 0; i < saidas.length; i++) {
    sorte -= pesos[i];
    if (sorte <= 0) return saidas[i];
  }
  return saidas[saidas.length - 1];
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

// ---------- variáveis da mensagem ----------
//
// Cópia deliberada de src/lib/atendimentos/automation-vars.ts: são dois
// runtimes e Deno não importa de `src/`. Lá a lista serve pra oferecer as
// variáveis na tela e recusar no save as que o gatilho não preenche; aqui ela
// substitui. Mudou lá, muda aqui.

const PADRAO_VAR = /\{\{\s*([a-zA-Z_]+)\s*\}\}/g;

/** "2026-09-18" -> "18/09/2026". Sem `new Date`: a string já é a data local do
 *  agendamento, e passar por Date em UTC devolveria o dia anterior. */
function dataBR(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

function moedaBR(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Busca nome/endereço da unidade só quando o texto pede — a consulta não vale
 *  o custo numa mensagem que não usa {{unidade}} nem {{endereco}}. */
async function valoresDasVariaveis(
  ownerId: string,
  ctx: DispatchContext,
  precisaUnidade: boolean,
): Promise<Record<string, string>> {
  const ap = ctx.appointment ?? null;
  const valores: Record<string, string> = {
    nome: ctx.contactName?.trim() ?? "",
    data: dataBR(ap?.date),
    hora: String(ap?.startTime ?? "").slice(0, 5),
    procedimento: ap?.procedureName?.trim() ?? "",
    profissional: ap?.professionalName?.trim() ?? "",
    valor: moedaBR(ctx.amount),
    unidade: "",
    endereco: "",
    resposta: ctx.replyText?.trim() ?? "",
  };

  if (precisaUnidade && ap?.unitId) {
    const { data } = await supabase
      .from("clinic_units")
      .select("name, address")
      .eq("id", ap.unitId)
      .eq("owner_id", ownerId)
      .maybeSingle();
    valores.unidade = data?.name ?? "";
    valores.endereco = data?.address ?? "";
  }
  return valores;
}

/** Substitui as variáveis e diz quais ficaram sem valor.
 *
 *  Quem chama decide o que fazer com `faltando`: numa mensagem de WhatsApp,
 *  mandar "confirmado para o dia  às " é pior do que não mandar. */
async function interpolar(
  template: string,
  ownerId: string,
  ctx: DispatchContext,
): Promise<{ texto: string; faltando: string[] }> {
  const usadas = new Set<string>();
  for (const m of template.matchAll(PADRAO_VAR)) usadas.add(m[1].toLowerCase());
  if (!usadas.size) return { texto: template, faltando: [] };

  const valores = await valoresDasVariaveis(
    ownerId,
    ctx,
    usadas.has("unidade") || usadas.has("endereco"),
  );
  const faltando: string[] = [];
  const texto = template.replace(PADRAO_VAR, (_todo, chave: string) => {
    const k = String(chave).toLowerCase();
    const v = valores[k];
    if (!v) {
      faltando.push(k);
      return "";
    }
    return v;
  });
  return { texto, faltando };
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
  run_id?: string | null;
}) {
  await supabase.from("automation_runs").insert(row);
}

/** Guarda "continue a partir deste nó", junto com o grafo congelado.
 *
 *  O snapshot é o que mantém a linha autossuficiente: sem ele, editar o fluxo
 *  durante uma espera de 3 dias deixaria o pendente apontando pra um nó que
 *  não existe mais. */
async function enfileirar(
  ownerId: string,
  regra: Regra,
  ctx: DispatchContext,
  grafo: Grafo,
  resumeNodeId: string,
  runAfter: Date,
  depth: number,
) {
  await supabase.from("automation_pending_actions").insert({
    owner_id: ownerId,
    rule_id: regra.id,
    rule_name: regra.name,
    trigger_event: regra.trigger_event,
    context: ctx,
    remaining_actions: [],
    graph_snapshot: grafo,
    resume_node_id: resumeNodeId,
    depth,
    run_after: runAfter.toISOString(),
  });
}

// ---------- ações ----------

/** Resolve um crm_contact_id pra mandar mensagem — reaproveita o mesmo
 *  upsert que garantirContatoCrm já usa (crm-contacts, action "upsert"),
 *  que só funciona com patientId (não aceita crmContactId direto). Sem
 *  patientId nem crmContactId, não tem pra quem mandar. */
/** A conversa que este contato já tem, se tiver.
 *
 *  Sem isto, toda mensagem de automação entra pelo caminho "criar conversa" —
 *  e quem já conversa com a clínica recebe o aviso numa thread nova, separada
 *  do histórico. A aba Contatos já faz esse mesmo casamento por `contact.id`
 *  para decidir por onde o disparo sai (ContactsTab.tsx, `conversaPorContato`);
 *  aqui é a mesma ideia, só que consultada na hora do envio. */
async function conversaDoContato(ownerId: string, contactId: string): Promise<string | null> {
  try {
    const res = await crmFetch(supabase, ownerId, "/api/v1/conversations");
    const lista = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
    const achada = lista.find((c: any) => String(c?.contact?.id ?? "") === String(contactId));
    return achada?.id ? String(achada.id) : null;
  } catch {
    // Falhar aqui não pode impedir o envio: sem conversa conhecida, o caminho
    // de criar conversa continua valendo, que é o comportamento de antes.
    return null;
  }
}

// O tipo do alvo vem de `_shared/whatsapp-send.ts`, junto da função que o
// consome — ver lá por que ele deixou de ser escrito à mão aqui.
async function resolverContatoParaEnvio(
  ownerId: string,
  ctx: DispatchContext,
): Promise<AlvoDeEnvio | null> {
  if (ctx.crmContactId) {
    return {
      contact_id: ctx.crmContactId,
      conversation_id: await conversaDoContato(ownerId, ctx.crmContactId),
    };
  }
  if (!ctx.patientId) return null;

  const { data: paciente } = await supabase
    .from("patients")
    .select("name, phone, crm_contact_id")
    .eq("id", ctx.patientId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (!paciente) return null;
  if (paciente.crm_contact_id) {
    return {
      contact_id: paciente.crm_contact_id,
      conversation_id: await conversaDoContato(ownerId, paciente.crm_contact_id),
    };
  }
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
  // Contato acabou de ser criado no CRM: não existe conversa anterior para
  // reaproveitar, e o caminho de criar conversa é o certo aqui.
  return { contact_id: String(json.contactId), conversation_id: null };
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
  runId: string,
) {
  const base = {
    owner_id: ownerId,
    rule_id: regra.id,
    rule_name: regra.name,
    trigger_event: regra.trigger_event,
    action_type: action.type,
    run_id: runId,
  };
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
    // Variável sem valor NÃO vira texto vazio no WhatsApp do paciente:
    // "confirmado para o dia  às " é pior do que não mandar. O save já recusa
    // variável incompatível com o gatilho, então chegar aqui significa dado
    // faltando no evento — vira registro, não mensagem torta.
    const { texto, faltando } = await interpolar(action.message, ownerId, ctx);
    if (faltando.length) {
      await logRun({
        ...base,
        status: "skipped_missing_var",
        error: `Sem valor para ${faltando.map((f) => `{{${f}}}`).join(", ")}.`,
      });
      return;
    }
    try {
      await enviarWhatsapp(supabase, ownerId, alvo, texto);
      await debitDailyUsage(supabase, ownerId, `automation:${regra.id}`, 1);
      await logRun({ ...base, status: "sent" });
    } catch (e) {
      await logRun({ ...base, status: "failed", error: String(e).slice(0, 500) });
    }
    return;
  }

  if (action.type === "set_appointment_status") {
    if (!ctx.appointmentId) {
      await logRun({ ...base, status: "skipped_no_contact", error: "Evento sem agendamento." });
      return;
    }
    // Escreve DIRETO na tabela, e não pela server function de agendamento.
    // Mesmo motivo pelo qual `move_pipeline_stage` chama a Edge Function do
    // funil direto: passar pelo caminho normal re-dispararia
    // `appointment.status_changed`, e uma automação que muda status ouvindo
    // mudança de status é um laço que queima cota até o teto diário.
    try {
      const { error } = await supabase
        .from("appointments")
        .update({ status: action.appointmentStatus })
        .eq("id", ctx.appointmentId)
        .eq("owner_id", ownerId);
      if (error) throw new Error(error.message);
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
        body: (await interpolar(action.noteBody, ownerId, ctx)).texto,
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
        // Diferente do WhatsApp: estes textos são internos, então variável
        // sem valor sai como vazio em vez de cancelar o aviso à equipe.
        title: (await interpolar(action.pushTitle, ownerId, ctx)).texto,
        body: (await interpolar(action.pushBody, ownerId, ctx)).texto,
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

/** Anda pelo fluxo a partir de um nó, seguindo as ligações.
 *
 *  Card de ação executa e segue sua saída; condição avalia e segue "sim" ou
 *  "não"; randomizador sorteia entre as saídas conectadas. Ao encontrar um
 *  "aguardar", guarda ONDE parou (não o resto de uma lista — num grafo não
 *  existe "resto") e para; o cron retoma daquele nó.
 *
 *  O teto de passos é rede de segurança: ciclo é recusado no save
 *  (`saveAutomation`), mas um grafo gravado por outro caminho não pode rodar
 *  pra sempre. */
async function percorrerGrafo(
  ownerId: string,
  grafo: Grafo,
  inicialId: string,
  ctx: DispatchContext,
  regra: Regra,
  depth: number,
  runId: string,
) {
  const porId = new Map(grafo.nodes.map((n) => [n.id, n]));
  const saidasDe = (id: string) => grafo.edges.filter((e) => e.source === id);

  let atualId: string | null = inicialId;
  let passos = 0;

  while (atualId && passos < 50) {
    passos++;
    const node = porId.get(atualId);
    if (!node) return; // ligação apontando pro vazio: fim de ramo, sem exceção

    if (node.type === "trigger") {
      atualId = saidasDe(node.id)[0]?.target ?? null;
      continue;
    }

    if (node.type === "condition") {
      const passou = avaliarCondicao(node, ctx);
      await logRun({
        owner_id: ownerId,
        rule_id: regra.id,
        rule_name: regra.name,
        trigger_event: regra.trigger_event,
        action_type: "condition",
        status: passou ? "branch_sim" : "branch_nao",
        run_id: runId,
      });
      const handle = passou ? "sim" : "nao";
      atualId = saidasDe(node.id).find((e) => e.sourceHandle === handle)?.target ?? null;
      // Decidir e não ter para onde ir é o fim mais confuso que existe: do lado
      // de fora parece que a automação simplesmente não rodou. Fica registrado
      // qual ramo ficou solto, que é o conserto a fazer no editor.
      if (!atualId) {
        await logRun({
          owner_id: ownerId,
          rule_id: regra.id,
          rule_name: regra.name,
          trigger_event: regra.trigger_event,
          action_type: "condition",
          status: "branch_dead_end",
          error: `O ramo "${passou ? "Sim" : "Não"}" não está ligado a nenhum card.`,
          run_id: runId,
        });
      }
      continue;
    }

    if (node.type === "randomizer") {
      const escolhida = sortearSaida(node, saidasDe(node.id));
      await logRun({
        owner_id: ownerId,
        rule_id: regra.id,
        rule_name: regra.name,
        trigger_event: regra.trigger_event,
        action_type: "randomizer",
        status: `branch_${escolhida?.sourceHandle ?? "nenhum"}`,
        run_id: runId,
      });
      atualId = escolhida?.target ?? null;
      if (!atualId) {
        await logRun({
          owner_id: ownerId,
          rule_id: regra.id,
          rule_name: regra.name,
          trigger_event: regra.trigger_event,
          action_type: "randomizer",
          status: "branch_dead_end",
          error: "A saída sorteada não está ligada a nenhum card.",
          run_id: runId,
        });
      }
      continue;
    }

    const acao = node.data.action;
    if (!acao) {
      atualId = saidasDe(node.id)[0]?.target ?? null;
      continue;
    }

    if (acao.type === "wait") {
      const proximo = saidasDe(node.id)[0]?.target;
      if (!proximo) return; // esperar sem nada depois não faz nada
      const minutos = Math.max(1, Math.min(Number(acao.waitMinutes ?? 0), 60 * 24 * 30));
      await enfileirar(
        ownerId,
        regra,
        ctx,
        grafo,
        proximo,
        new Date(Date.now() + minutos * 60000),
        depth,
      );
      await logRun({
        owner_id: ownerId,
        rule_id: regra.id,
        rule_name: regra.name,
        trigger_event: regra.trigger_event,
        action_type: "wait",
        status: "deferred",
        run_id: runId,
      });
      return;
    }

    await executarAcao(ownerId, acao, ctx, regra, runId);
    atualId = saidasDe(node.id)[0]?.target ?? null;
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
    .select("id, name, trigger_conditions, actions, nodes, edges, schedule_window")
    .eq("owner_id", ownerId)
    .eq("trigger_event", systemEvent)
    .eq("active", true);
  if (error) {
    // Quem chama (dispatchAutomationEvent) engole erro de propósito, pra que
    // uma automação fora do ar nunca derrube o cadastro que a originou. O
    // efeito colateral é que coluna faltando (migration não aplicada) fica
    // indistinguível de "não havia regra". Esta linha é o que torna isso
    // visível no histórico em vez de silencioso.
    await logRun({
      owner_id: ownerId,
      rule_id: null,
      rule_name: "-",
      trigger_event: systemEvent,
      action_type: "-",
      status: "failed",
      error: `Falha ao ler as automações: ${error.message}`,
    }).catch(() => null);
    throw new Error(error.message);
  }

  const matching = (regras ?? []).filter((r: any) => matchesConditions(r.trigger_conditions ?? {}, ctx));
  if (!matching.length) {
    // Só registra quando EXISTE regra ativa pra este gatilho e o filtro barrou.
    // Clínica sem automação nenhuma não pode ganhar uma linha a cada
    // agendamento — viraria ruído e o histórico deixaria de servir pra nada.
    if ((regras ?? []).length) {
      await logRun({
        owner_id: ownerId,
        rule_id: null,
        rule_name: "-",
        trigger_event: systemEvent,
        action_type: "-",
        status: "skipped_no_rule",
        error: "O evento aconteceu, mas o filtro do acionamento não bateu com ele.",
      }).catch(() => null);
    }
    return { ok: true, skipped: "nenhuma automação corresponde", executed: 0 };
  }

  const agora = new Date();
  for (const r of matching as any[]) {
    const regra: Regra = { id: r.id, name: r.name, trigger_event: systemEvent };
    const grafo = grafoDaRegra(r);
    const raiz = grafo.nodes.find((n) => n.type === "trigger");
    const primeiro = grafo.edges.find((e) => e.source === (raiz?.id ?? "trigger"))?.target;
    if (!primeiro) {
      // Gatilho sem nada ligado nele. Do lado de fora é idêntico a "não rodou",
      // e é um erro fácil de cometer: basta apagar a linha e salvar.
      await logRun({
        owner_id: ownerId,
        rule_id: regra.id,
        rule_name: regra.name,
        trigger_event: systemEvent,
        action_type: "-",
        status: "skipped_no_flow",
        error: "O acionamento não está ligado a nenhum card.",
      }).catch(() => null);
      continue;
    }
    const janela: ScheduleWindow | null = r.schedule_window ?? null;
    const runId = crypto.randomUUID();

    if (janelaAtiva(janela) && !dentroDaJanela(janela, agora)) {
      if ((janela.outside ?? "defer") === "skip") {
        await logRun({
          owner_id: ownerId,
          rule_id: regra.id,
          rule_name: regra.name,
          trigger_event: systemEvent,
          action_type: "-",
          status: "skipped_outside_window",
          run_id: runId,
        });
        continue;
      }
      await enfileirar(ownerId, regra, ctx, grafo, primeiro, proximaAbertura(janela, agora), depth);
      await logRun({
        owner_id: ownerId,
        rule_id: regra.id,
        rule_name: regra.name,
        trigger_event: systemEvent,
        action_type: "-",
        status: "deferred_outside_window",
        run_id: runId,
      });
      continue;
    }

    await percorrerGrafo(ownerId, grafo, primeiro, ctx, regra, depth, runId);
  }

  return { ok: true, executed: matching.length };
}

/** Retoma o que estava na fila e já venceu. Stateless e multi-tenant, mesmo
 *  molde do tick do disparo: o cron não manda ownerId. */
async function handleTick() {
  const agora = new Date();

  // Claim atômico: marca e colhe na MESMA operação. Com select-depois-update,
  // dois ticks sobrepostos (a função ficou mais lenta com o grafo) colhiam as
  // mesmas linhas e mandavam a mensagem duas vezes.
  const { data: pendentes, error } = await supabase
    .from("automation_pending_actions")
    .update({ status: "done", ran_at: agora.toISOString() })
    .eq("status", "pending")
    .lte("run_after", agora.toISOString())
    .select(
      "id, owner_id, rule_id, rule_name, trigger_event, context, graph_snapshot, resume_node_id, remaining_actions, depth",
    )
    .limit(POR_TICK);
  if (error) throw new Error(error.message);
  if (!pendentes?.length) return { ok: true, retomados: 0 };

  let retomados = 0;
  for (const p of pendentes as any[]) {
    const regra: Regra = {
      id: p.rule_id,
      name: p.rule_name ?? "",
      trigger_event: p.trigger_event,
    };
    const ctx = (p.context ?? {}) as DispatchContext;
    const runId = crypto.randomUUID();

    try {
      // A janela é re-checada na retomada: uma espera de 3 dias acordando às
      // 3h da manhã e mandando WhatsApp é exatamente o que a janela existe
      // pra impedir. Se estiver fora, reenfileira pra próxima abertura.
      const { data: regraViva } = await supabase
        .from("automation_rules")
        .select("active, schedule_window")
        .eq("id", p.rule_id)
        .maybeSingle();
      if (regraViva && regraViva.active === false) continue; // pausada durante a espera

      const grafo: Grafo = p.graph_snapshot?.nodes?.length
        ? p.graph_snapshot
        : grafoDaRegra({ actions: p.remaining_actions });
      const inicial: string =
        p.resume_node_id ?? grafo.edges.find((e: GrafoEdge) => e.source === "trigger")?.target ?? "";
      if (!inicial) continue;

      const janela: ScheduleWindow | null = regraViva?.schedule_window ?? null;
      if (janelaAtiva(janela) && !dentroDaJanela(janela, agora)) {
        await enfileirar(
          p.owner_id,
          regra,
          ctx,
          grafo,
          inicial,
          proximaAbertura(janela, agora),
          Number(p.depth ?? 0),
        );
        continue;
      }

      await percorrerGrafo(p.owner_id, grafo, inicial, ctx, regra, Number(p.depth ?? 0), runId);
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

    // `version` não depende de dono nem toca no banco: é só a prova de vida.
    if (action === "version") {
      return new Response(JSON.stringify({ ok: true, version: VERSAO_MOTOR }), {
        headers: { "content-type": "application/json" },
      });
    }

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
