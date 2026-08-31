// Disparo próprio para uma lista escolhida a dedo.
//
// Por que existe: o motor de campanhas do Wavy só manda para TODOS. O manual de
// integração v2 (seção 14) confirma que `contactIds` é ignorado, e toda campanha
// vai `sendToAll: true` — não há como recortar "só o DDD 48" por lá. Aqui a
// mensagem sai uma a uma, pelo mesmo endpoint que o chat usa.
//
// A cota do dia é a MESMA das campanhas (`crm_campaign_sends`): o WhatsApp é um
// só, e dois contadores separados deixariam o número exposto ao dobro do que a
// clínica escolheu como limite.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enviarWhatsapp, type MidiaDeEnvio } from "../_shared/whatsapp-send.ts";
import { debitDailyUsage, getDailyUsage } from "../_shared/daily-quota.ts";
import { horariosDaFila, normalizarRitmo, type Ritmo } from "../_shared/ritmo.ts";
import { aplicarVariaveis } from "../_shared/variaveis-disparo.ts";
import { inserirTolerandoColunaAusente } from "../_shared/coluna-ausente.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/** Quantos alvos vencidos cada tick processa. O cron roda a cada minuto, e o
 *  teto existe para a função não estourar o tempo com uma fila represada. */
const POR_TICK = 40;

interface AlvoEntrada {
  contactId: string;
  conversationId?: string | null;
  name?: string | null;
  phone?: string | null;
}

async function handleCreate(
  ownerId: string,
  message: string,
  ritmoBruto: Partial<Ritmo> | null,
  alvosEntrada: AlvoEntrada[],
  mediaPath: string | null,
  nome: string | null,
) {
  if (!message?.trim()) throw new Error("Escreva a mensagem antes de disparar.");
  if (!alvosEntrada?.length) throw new Error("Selecione ao menos um contato.");

  // ── Um alvo por contato ────────────────────────────────────────────────
  //
  // Última rede antes do banco, e a que vale para qualquer tela — presente ou
  // futura. O front já deduplica (`pessoasUnicas`), mas foi justamente a falta
  // de rede aqui que deixou o disparo de 31/08 criar DUAS conversas para a
  // mesma pessoa: dois alvos com o mesmo `contact_id` viram duas mensagens,
  // duas conversas no CRM e cota debitada em dobro.
  //
  // Vem ANTES da conferência de cota de propósito: cobrar por uma linha que
  // não vai virar mensagem é o mesmo erro, só que no dinheiro.
  //
  // Entre repetidos, ganha o que JÁ TEM conversa: mandar numa conversa que
  // existe é o caminho confirmado; o outro abriria uma nova sem precisar.
  const porContato = new Map<string, AlvoEntrada>();
  for (const a of alvosEntrada) {
    const chave = String(a?.contactId ?? "");
    if (!chave) continue;
    const atual = porContato.get(chave);
    if (!atual || (!atual.conversationId && a.conversationId)) porContato.set(chave, a);
  }
  const alvos = [...porContato.values()];
  if (!alvos.length) throw new Error("Selecione ao menos um contato.");
  if (alvos.length < alvosEntrada.length) {
    console.warn(
      `[whatsapp-broadcast] ${alvosEntrada.length - alvos.length} alvo(s) repetido(s) descartado(s)`,
    );
  }

  // Confere ANTES de enfileirar: enfileirar e recusar depois deixaria metade
  // das mensagens saindo antes de alguém perceber.
  const { limit, usedToday } = await getDailyUsage(supabase, ownerId);
  if (usedToday + alvos.length > limit) {
    throw new Error(
      `Limite diário excedido (${usedToday}/${limit} contatos hoje, esta seleção tem ${alvos.length}). Ajuste o limite ou aguarde amanhã.`,
    );
  }

  const ritmo = normalizarRitmo(ritmoBruto);
  // As colunas abaixo entraram em migrations recentes. Migration e deploy são
  // dois passos manuais no Lovable, sem ordem garantida entre eles — então o
  // insert tolera que uma delas ainda não exista, tirando-a e tentando de novo,
  // em vez de derrubar o disparo com "column ... does not exist".
  const OPCIONAIS = [
    "name",
    "interval_min_seconds",
    "interval_max_seconds",
    "pause_after",
    "resume_after_minutes",
    "media_path",
  ];
  const { data: lote, removidas } = await inserirTolerandoColunaAusente(
    (linha) => supabase.from("whatsapp_broadcasts").insert(linha).select("id").single(),
    {
      owner_id: ownerId,
      name: nome?.trim() || null,
      message: message.trim(),
      // Mantido para os disparos antigos e como valor de leitura de reserva.
      interval_seconds: ritmo.minSegundos,
      interval_min_seconds: ritmo.minSegundos,
      interval_max_seconds: ritmo.maxSegundos,
      pause_after: ritmo.pausarACada,
      resume_after_minutes: ritmo.retomarEmMinutos,
      media_path: mediaPath,
      total: alvos.length,
    },
    OPCIONAIS,
  );
  if (removidas.length) {
    // Fica no log da função: o disparo saiu, mas com menos informação gravada
    // do que deveria, e a migration pendente é a explicação.
    console.warn("[whatsapp-broadcast] colunas ausentes, migration pendente:", removidas);
  }

  // O ritmo mora aqui: cada alvo nasce com o horário em que deve sair, então a
  // fila é previsível e o cron não guarda estado nenhum.
  const inicio = Date.now();
  const horarios = horariosDaFila(alvos.length, ritmo, inicio);
  const linhas = alvos.map((a, i) => ({
    broadcast_id: lote.id,
    owner_id: ownerId,
    contact_id: a.contactId,
    conversation_id: a.conversationId ?? null,
    contact_name: a.name ?? null,
    phone: a.phone ?? null,
    scheduled_for: new Date(horarios[i]).toISOString(),
  }));
  const { error: erroAlvos } = await supabase.from("whatsapp_broadcast_targets").insert(linhas);
  if (erroAlvos) throw new Error(erroAlvos.message);

  // Debita a cota inteira agora, como o disparo de campanha já faz: cancelar no
  // meio não devolve, porque o que já saiu não volta.
  await debitDailyUsage(supabase, ownerId, `broadcast:${lote.id}`, alvos.length);

  return {
    ok: true,
    broadcastId: lote.id,
    total: alvos.length,
    terminaEm: new Date(horarios[horarios.length - 1]).toISOString(),
  };
}

/** A imagem do lote, baixada UMA vez por tick e reaproveitada por todos os
 *  alvos daquele lote — baixar por alvo seria 40 downloads do mesmo arquivo a
 *  cada minuto. */
async function baixarMidia(path: string | null): Promise<MidiaDeEnvio | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from("crm-campaign-media").download(path);
  if (error || !data) return null;
  return {
    nome: path.split("/").pop() || "imagem",
    tipo: data.type || "image/jpeg",
    bytes: new Uint8Array(await data.arrayBuffer()),
  };
}

async function handleTick() {
  const agora = new Date().toISOString();
  const { data: alvos } = await supabase
    .from("whatsapp_broadcast_targets")
    .select("id, owner_id, broadcast_id, contact_id, conversation_id, contact_name")
    .eq("status", "pending")
    .lte("scheduled_for", agora)
    .order("scheduled_for", { ascending: true })
    .limit(POR_TICK);

  if (!alvos?.length) return { ok: true, enviados: 0, falhas: 0 };

  // A mensagem, o status e a imagem do lote são lidos uma vez por lote, não por
  // alvo — inclusive o download da imagem, que é o mais caro dos três.
  const lotes = new Map<string, { message: string; status: string; midia: MidiaDeEnvio | null }>();
  for (const id of new Set(alvos.map((a: any) => a.broadcast_id))) {
    const { data } = await supabase
      .from("whatsapp_broadcasts")
      // `*` e não a lista de colunas: `media_path` veio de migration recente, e
      // pedi-la por nome quebraria o tick inteiro num banco que ainda não a
      // tem — parando TODAS as filas, não só a com imagem.
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (data) {
      lotes.set(String(id), {
        message: data.message,
        status: data.status,
        midia: data.status === "running" ? await baixarMidia(data.media_path) : null,
      });
    }
  }

  let enviados = 0;
  let falhas = 0;

  for (const alvo of alvos as any[]) {
    const lote = lotes.get(alvo.broadcast_id);
    // Lote cancelado entre o agendamento e agora: o alvo não sai.
    if (!lote || lote.status !== "running") {
      await supabase
        .from("whatsapp_broadcast_targets")
        .update({ status: "skipped", error: "Lote cancelado" })
        .eq("id", alvo.id);
      continue;
    }

    try {
      // As variáveis são resolvidas POR ALVO, aqui e não na criação: gravar o
      // texto já personalizado em cada linha da fila duplicaria a mensagem
      // inteira 200 vezes no banco, e impediria corrigir o texto de um lote em
      // andamento.
      const texto = aplicarVariaveis(lote.message, { nome: alvo.contact_name });
      const { via, midiaIgnorada } = await enviarWhatsapp(
        supabase,
        alvo.owner_id,
        alvo,
        texto,
        lote.midia,
      );
      await supabase
        .from("whatsapp_broadcast_targets")
        .update({
          status: "sent",
          sent_via: via,
          sent_at: new Date().toISOString(),
          error: null,
          media_skipped_reason: midiaIgnorada ?? null,
        })
        .eq("id", alvo.id);
      enviados++;
    } catch (e) {
      // Uma falha não para a fila: o resto da lista não tem culpa.
      await supabase
        .from("whatsapp_broadcast_targets")
        .update({ status: "failed", error: String(e).slice(0, 500) })
        .eq("id", alvo.id);
      falhas++;
    }
  }

  // Lote sem nenhum pendente vira concluído.
  for (const id of lotes.keys()) {
    const { count } = await supabase
      .from("whatsapp_broadcast_targets")
      .select("id", { count: "exact", head: true })
      .eq("broadcast_id", id)
      .eq("status", "pending");
    if ((count ?? 0) === 0) {
      await supabase
        .from("whatsapp_broadcasts")
        .update({ status: "done", updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("status", "running");
    }
  }

  return { ok: true, enviados, falhas };
}

async function handleCancel(ownerId: string, broadcastId: string) {
  await supabase
    .from("whatsapp_broadcasts")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", broadcastId)
    .eq("owner_id", ownerId);
  const { count } = await supabase
    .from("whatsapp_broadcast_targets")
    .update({ status: "skipped", error: "Lote cancelado" }, { count: "exact" })
    .eq("broadcast_id", broadcastId)
    .eq("owner_id", ownerId)
    .eq("status", "pending");
  // A cota já debitada não é devolvida: quem já recebeu, recebeu.
  return { ok: true, cancelados: count ?? 0 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  try {
    const body = await req.json().catch(() => ({}));
    const { ownerId, action } = body as { ownerId?: string; action?: string };

    // `tick` vem do cron e varre todos os donos — não tem ownerId.
    if (action === "tick" || !action) {
      const result = await handleTick();
      return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
    }

    if (!ownerId) {
      return new Response(JSON.stringify({ error: "ownerId é obrigatório" }), { status: 400 });
    }

    let result: unknown;
    switch (action) {
      case "create":
        result = await handleCreate(
          ownerId,
          body.message,
          // `intervalSeconds` continua aceito: um cliente antigo que só sabe
          // mandar o valor único vira uma faixa degenerada (min = max), com o
          // mesmo comportamento de antes.
          body.ritmo ??
            (body.intervalSeconds
              ? {
                  minSegundos: Number(body.intervalSeconds),
                  maxSegundos: Number(body.intervalSeconds),
                  pausarACada: 0,
                  retomarEmMinutos: 0,
                }
              : null),
          body.targets ?? [],
          body.mediaPath ?? null,
          body.name ?? null,
        );
        break;
      case "cancel":
        result = await handleCancel(ownerId, body.broadcastId);
        break;
      default:
        return new Response(JSON.stringify({ error: `action desconhecida: ${action}` }), { status: 400 });
    }

    return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
  } catch (e) {
    console.error("[whatsapp-broadcast]", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
