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
import {
  debitDailyUsage,
  diaDaClinica,
  getDailyUsage,
  janelaDoDiaDaClinica,
} from "../_shared/daily-quota.ts";
import { planoDeDias, type PlanoDeDias } from "../_shared/plano-de-dias.ts";
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
  /** Quando a fila deve COMEÇAR a sair. Sem isto, agora.
   *
   *  É o que faz a mensagem agendada do chat caber aqui: ela é uma fila de uma
   *  pessoa só, marcada para o futuro. Reaproveitar esta fila em vez de criar
   *  outra significa que o agendamento herda o que ela já sabe fazer —
   *  cancelar, registrar falha, respeitar a cota e sair pelo mesmo caminho. */
  iniciarEm: string | null = null,
  /** Quem criou aprovou espalhar a fila por mais de um dia quando não couber
   *  em um. Ausente = não: um cliente antigo continua recebendo a recusa de
   *  antes, em vez de uma campanha espalhada por uma semana que ninguém viu. */
  dividirEmDias = false,
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

  // ── Em quantos dias isto cabe ──────────────────────────────────────────
  //
  // Confere ANTES de enfileirar: enfileirar e recusar depois deixaria metade
  // das mensagens saindo antes de alguém perceber.
  //
  // O dia é o do INÍCIO pedido, não o de hoje: uma campanha marcada para o dia
  // 20 ocupa a cota do dia 20. Sem isso, deixar o mês inteiro programado
  // gastaria a cota de hoje quatro vezes e a segunda campanha seria recusada.
  const inicioPedido = iniciarEm ? new Date(iniciarEm).getTime() : NaN;
  const inicio = Number.isFinite(inicioPedido) ? Math.max(inicioPedido, Date.now()) : Date.now();
  const diaInicial = diaDaClinica(new Date(inicio));

  const { limit } = await getDailyUsage(supabase, ownerId, diaInicial);
  const reservadoPorDia = await reservasAPartirDe(ownerId, diaInicial);
  const plano = planoDeDias({
    total: alvos.length,
    limitePorDia: limit,
    reservadoPorDia,
    diaInicial,
  });

  if (!plano.dias.length) {
    const usado = reservadoPorDia[diaInicial] ?? 0;
    throw new Error(
      `Limite diário excedido (${usado}/${limit} contatos no dia ${diaInicial}, esta seleção tem ${alvos.length}). Ajuste o limite ou escolha outro dia.`,
    );
  }
  // Mais de um dia só acontece quando quem criou pediu. Um cliente antigo, que
  // não sabe desta opção, continua recebendo a mesma recusa de antes — e não
  // uma campanha espalhada por uma semana que ninguém aprovou.
  if (plano.dias.length > 1 && !dividirEmDias) {
    const cabeHoje = plano.dias[0].quantos;
    throw new Error(
      `Esta seleção tem ${alvos.length} contatos e só cabem ${cabeHoje} no dia ${diaInicial} (limite ${limit}). Divida em dias ou escolha outro dia.`,
    );
  }
  if (!plano.cobreTudo) {
    throw new Error(
      `Esta seleção não cabe nem dividida: sobrariam ${plano.sobraram} contatos depois de ${plano.dias.length} dias. Suba o limite diário ou reduza a seleção.`,
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

  // ── O plano vira fila ──────────────────────────────────────────────────
  //
  // O ritmo mora em cada alvo: ele nasce com o horário em que deve sair, então
  // a fila é previsível e o cron não guarda estado nenhum. Dividido em dias, a
  // única diferença é que o relógio recomeça no mesmo horário do dia seguinte
  // em vez de continuar correndo pela madrugada.
  const relogio = horaDoDia(inicio);
  const linhas: Record<string, unknown>[] = [];
  let ultimo = inicio;
  let lidos = 0;

  for (const [i, dia] of plano.dias.entries()) {
    // O primeiro dia começa no instante pedido; os seguintes, no MESMO horário
    // do relógio. Somar 24h ao anterior pareceria igual e não é: a fila do dia
    // 20 termina às 9h40, e o dia 21 começaria às 9h40 também, andando um
    // pouco a cada dia até cair fora do horário comercial.
    const comeco = i === 0 ? inicio : instanteNoDia(dia.dia, relogio);
    const horarios = horariosDaFila(dia.quantos, ritmo, comeco);
    for (let k = 0; k < dia.quantos; k++) {
      const a = alvos[lidos + k];
      linhas.push({
        broadcast_id: lote.id,
        owner_id: ownerId,
        contact_id: a.contactId,
        conversation_id: a.conversationId ?? null,
        contact_name: a.name ?? null,
        phone: a.phone ?? null,
        scheduled_for: new Date(horarios[k]).toISOString(),
      });
    }
    lidos += dia.quantos;
    ultimo = Math.max(ultimo, horarios[horarios.length - 1] ?? comeco);
  }

  const { error: erroAlvos } = await supabase.from("whatsapp_broadcast_targets").insert(linhas);
  if (erroAlvos) throw new Error(erroAlvos.message);

  // Debita a cota de CADA dia no próprio dia. É isto que faz a divisão
  // funcionar de verdade: a próxima campanha enxerga o dia 21 já comprometido
  // e não marca nada em cima.
  //
  // Debitado na criação e não no envio, como o disparo sempre fez: cancelar no
  // meio não devolve o que já saiu. O que o cancelamento devolve são os dias
  // que ainda não começaram — ver `handleCancel`.
  for (const dia of plano.dias) {
    await debitDailyUsage(supabase, ownerId, `broadcast:${lote.id}`, dia.quantos, dia.dia);
  }

  return {
    ok: true,
    broadcastId: lote.id,
    total: alvos.length,
    terminaEm: new Date(ultimo).toISOString(),
    dias: plano.dias,
  };
}

/** O relógio da clínica (ms desde a meia-noite dela) de um instante. */
function horaDoDia(instante: number): number {
  const dia = diaDaClinica(new Date(instante));
  const janela = janelaDoDiaDaClinica(dia);
  return janela ? instante - janela.de.getTime() : 0;
}

/** O instante que é `relogio` ms depois da meia-noite de `dia` na clínica. */
function instanteNoDia(dia: string, relogio: number): number {
  const janela = janelaDoDiaDaClinica(dia);
  // Sem janela o dia não existe, e marcar para agora é melhor do que marcar
  // para 1970 — que sairia inteiro no próximo tique.
  return janela ? janela.de.getTime() + relogio : Date.now();
}

/**
 * Quanto cada dia, a partir de `desde`, já tem reservado por outras campanhas.
 *
 * Lê o mesmo livro que a cota usa (`crm_campaign_sends`), agrupando por dia da
 * clínica. É o que impede a campanha nova de ocupar um dia que já está cheio —
 * e sem isso a divisão em dias marcaria duas campanhas no mesmo dia 21.
 */
async function reservasAPartirDe(ownerId: string, desde: string): Promise<Record<string, number>> {
  const janela = janelaDoDiaDaClinica(desde);
  if (!janela) return {};
  const { data } = await supabase
    .from("crm_campaign_sends")
    .select("recipient_count, executed_at")
    .eq("owner_id", ownerId)
    .gte("executed_at", janela.de.toISOString());
  const porDia: Record<string, number> = {};
  for (const linha of data ?? []) {
    const dia = diaDaClinica(new Date(String(linha.executed_at)));
    porDia[dia] = (porDia[dia] ?? 0) + Number(linha.recipient_count ?? 0);
  }
  return porDia;
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
    // `phone` entra na lista: a coluna sempre existiu e sempre foi preenchida,
    // mas não era lida — e sem ela cada alvo chegava ao envio sem número, o que
    // obrigava `destinoDoAlvo` a procurá-lo em duas ou três tabelas, uma vez
    // por pessoa da fila. Agora a fila já sai com o endereço na mão.
    .select("id, owner_id, broadcast_id, contact_id, conversation_id, contact_name, phone")
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

  // ── A cota dos dias que não chegaram volta ─────────────────────────────
  //
  // "Quem já recebeu, recebeu" continua valendo para o dia em curso: aquela
  // reserva fica. O que volta é a dos dias FUTUROS, que nunca viraram
  // mensagem — e segurá-los bloquearia o calendário de uma campanha que foi
  // cancelada justamente para liberar a agenda.
  //
  // Apaga por dia, e não a etiqueta inteira: a leva de hoje pode já ter saído
  // pela metade, e devolvê-la deixaria o limite do dia ser estourado pelo que
  // viesse depois.
  const hoje = diaDaClinica();
  const janela = janelaDoDiaDaClinica(hoje);
  if (janela) {
    const { data: devolvidas } = await supabase
      .from("crm_campaign_sends")
      .delete()
      .eq("owner_id", ownerId)
      .eq("campaign_id", `broadcast:${broadcastId}`)
      .gte("executed_at", janela.ate.toISOString())
      .select("recipient_count");
    if (devolvidas?.length) {
      console.log(`[whatsapp-broadcast] cancelamento devolveu ${devolvidas.length} dia(s) de cota`);
    }
  }

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
      return new Response(JSON.stringify(result), {
        headers: { "content-type": "application/json" },
      });
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
          body.iniciarEm ?? null,
          body.dividirEmDias === true,
        );
        break;
      case "cancel":
        result = await handleCancel(ownerId, body.broadcastId);
        break;
      default:
        return new Response(JSON.stringify({ error: `action desconhecida: ${action}` }), {
          status: 400,
        });
    }

    return new Response(JSON.stringify(result), {
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    console.error("[whatsapp-broadcast]", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
