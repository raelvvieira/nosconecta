// Recebe os eventos da Evolution API e grava no espelho.
//
// ── O que isto substitui ────────────────────────────────────────────────
//
// O cron de 5 minutos. O CRM não tem webhook de entrada — "as conversas só
// existem por consulta" —, então até hoje mensagem nova era DESCOBERTA
// comparando contadores de não-lidas entre rodadas. É a causa da lentidão do
// chat. Aqui a mensagem CHEGA.
//
// ── Endpoint público, e por quê ─────────────────────────────────────────
//
// `verify_jwt = false` no config.toml: a Evolution não tem como apresentar um
// JWT do Supabase. A porta é fechada por um segredo compartilhado na
// querystring, mesmo desenho do `whatsapp-inbound-webhook` que já existe.
//
// ── Sempre 200, quase sempre ────────────────────────────────────────────
//
// Evento que não interessa, instância desconhecida, corpo estranho: tudo
// responde 200. A Evolution REENVIA o que não deu 200, e ficar reenviando um
// evento que nunca vai ser aceito enche o log dela e o disco da VPS — o
// mesmo disco que acabou de ser resgatado de 94%.
//
// A exceção é falha ao GRAVAR: aí o 500 é honesto e o reenvio é desejado.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type MensagemEspelhada,
  mensagemDoEvento,
  telefoneDoJid,
} from "../_shared/evolution-mapear.ts";
import { gravarMensagemEspelhada } from "../_shared/espelho-evolution.ts";
import { conexaoParaEnviar, evolutionFetch } from "../_shared/evolution-api.ts";
import { pushToOwner } from "../_shared/push.ts";
import { deixarOAgenteResponder } from "../_shared/agente-no-webhook.ts";
import { deixarORoboRegistrar } from "../_shared/robo-do-financeiro.ts";
import { tratarRespostaDoPaciente } from "../_shared/resposta-do-paciente.ts";
import {
  EVENTOS_DE_CONVERSA,
  ehConversaDoAparelho,
  foiLidaNoCelular,
  leiturasDoEvento,
} from "../_shared/leitura-no-celular.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const SEGREDO = Deno.env.get("WA_WEBHOOK_SECRET") ?? "";

const ok = (corpo: Record<string, unknown> = {}) => Response.json({ ok: true, ...corpo });

/** O dono da instância. Instância que não está na tabela não grava nada. */
async function donoDaInstancia(nome: string): Promise<string | null> {
  const { data } = await supabase
    .from("wa_instances")
    .select("owner_id")
    .eq("instance_name", nome)
    .maybeSingle();
  return data?.owner_id ?? null;
}

async function marcarSinalDeVida(nome: string, extra: Record<string, unknown> = {}) {
  await supabase
    .from("wa_instances")
    .update({
      last_event_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...extra,
    })
    .eq("instance_name", nome);
}

/**
 * O nome de um grupo, pedido à Evolution uma vez só.
 *
 * O evento da mensagem não traz o nome do grupo (só o de quem escreveu).
 * Quando o contato do grupo ainda não tem nome, a Evolution é perguntada
 * (`findGroupInfos`) e o `subject` vira o nome. Com nome gravado, nada a
 * fazer: a pergunta acontece na primeira mensagem do grupo, não em todas.
 */
async function garantirNomeDoGrupo(ownerId: string, jid: string) {
  const { data: contato } = await supabase
    .from("wa_contacts")
    .select("name")
    .eq("owner_id", ownerId)
    .eq("origem", "evolution")
    .eq("crm_contact_id", jid)
    .maybeSingle();
  if (String(contato?.name ?? "").trim()) return;
  const { instancia } = await conexaoParaEnviar(supabase, ownerId);
  if (!instancia) return;
  const info = await evolutionFetch(
    `/group/findGroupInfos/${encodeURIComponent(instancia)}?groupJid=${encodeURIComponent(jid)}`,
    { method: "GET" },
    10_000,
  );
  const nome = String(info?.subject ?? "").trim();
  if (!nome) return;
  await supabase
    .from("wa_contacts")
    .update({ name: nome, synced_at: new Date().toISOString() })
    .eq("owner_id", ownerId)
    .eq("origem", "evolution")
    .eq("crm_contact_id", jid);
}

/**
 * Uma mensagem que chegou pelo webhook.
 *
 * A gravação em si mora em `_shared/espelho-evolution.ts`: o ENVIO também
 * grava, e duas cópias da mesma escrita divergem em silêncio.
 */
async function gravarMensagem(ownerId: string, data: any) {
  const m = mensagemDoEvento(data);
  if (!m) return { ignorado: "evento sem id ou sem conversa" };

  await gravarMensagemEspelhada(supabase, ownerId, m, data);

  await avisar(ownerId, m);

  // "SIM" / "NÃO" ao lembrete de véspera.
  //
  // DEPOIS de gravar e avisar, e blindado: uma falha aqui não pode virar 500,
  // porque 500 faz a Evolution reenviar o evento — e o reenvio gravaria a
  // mensagem de novo. Perder a leitura de uma resposta é ruim; duplicar a
  // mensagem do paciente no espelho é pior.
  //
  // A função decide sozinha se é caso de tratar. A imensa maioria das
  // mensagens não é: sem consulta marcada, sem lembrete recente, grupo, ou
  // mensagem da própria clínica saem todas lá dentro, e o motivo volta no
  // retorno para aparecer no log da Evolution.
  let resposta: unknown = null;
  try {
    resposta = await tratarRespostaDoPaciente(supabase, ownerId, m);
  } catch (e) {
    console.error("[wa-webhook] resposta não foi lida:", e instanceof Error ? e.message : e);
  }

  // O agente de IA, DEPOIS de gravar e avisar, e sem poder derrubar nenhum dos
  // dois. Ele decide sozinho se é caso de responder — desligado, grupo,
  // mensagem da própria clínica e conversa já assumida por uma pessoa saem
  // todos em `filtros-do-agente.ts`. Hoje ele está desligado, então isto é um
  // caminho pronto e parado.
  // ── O agente sai do caminho da resposta ao webhook ────────────────────
  //
  // Ele demora de propósito: espera para agrupar as bolhas da pessoa, chama um
  // modelo, e ainda simula digitação entre os pedaços. Isso passa de vinte
  // segundos — e a Evolution, do outro lado, está esperando o 200 para dar o
  // evento por entregue. Webhook que demora demais é webhook reenviado, e
  // reenvio aqui significa a mesma mensagem gravada duas vezes.
  //
  // `EdgeRuntime.waitUntil` mantém a execução viva depois da resposta HTTP.
  // Onde ele não existir, espera-se como antes: melhor devolver devagar do que
  // não responder ao paciente.
  //
  // O evento cru vai junto: é o único lugar onde o marcador de anúncio
  // (`contextInfo.externalAdReply`) existe, e é por ele que a Luna sabe que
  // esta pessoa clicou num anúncio — hoje o único público que ela atende.
  const doAgente = deixarOAgenteResponder(supabase, ownerId, m, data);

  // ── O robô do financeiro, pelo mesmo caminho e pelo mesmo motivo ──────
  //
  // Ele também chama modelo e também demora, então também sai da resposta ao
  // webhook. Os dois são excludentes na prática — a Luna ignora grupo e o robô
  // só olha grupo cadastrado —, mas dispará-los juntos é mais simples e mais
  // seguro do que um `if` aqui decidindo quem é da vez: o dia em que a regra de
  // um deles mudar, este arquivo não precisa saber.
  //
  // O evento cru vai junto por causa do `pushName`: é de lá que sai quem
  // escreveu a mensagem no grupo, e é esse nome que aparece no histórico do
  // lançamento.
  const doFinanceiro = deixarORoboRegistrar(supabase, ownerId, m, data);

  // O nome do grupo, quando ainda não se sabe. Também fora do caminho da
  // resposta, e sem poder derrubar nada.
  const doNome = m.ehGrupo
    ? garantirNomeDoGrupo(ownerId, m.crmContactId).catch((e) =>
        console.warn("[wa-webhook] nome do grupo:", e instanceof Error ? e.message : e),
      )
    : Promise.resolve();

  // deno-lint-ignore no-explicit-any
  const runtime = (globalThis as any).EdgeRuntime;
  const tudo = Promise.all([doAgente, doFinanceiro, doNome]);
  if (runtime?.waitUntil) runtime.waitUntil(tudo);
  else await tudo;

  return { gravado: m.crmMessageId, telefone: m.phone, grupo: m.ehGrupo, resposta };
}

/**
 * O aviso de "chegou mensagem" no celular de quem atende.
 *
 * ── O que isto substitui ────────────────────────────────────────────────
 *
 * Um cron de 2 em 2 minutos (`push-poll-conversations`) que perguntava ao CRM
 * a lista inteira de conversas e comparava contadores de não-lidas entre
 * rodadas — porque o CRM não tinha webhook. O aviso chegava com até dois
 * minutos de atraso, e só enquanto o CRM atendesse. Aqui ele sai no instante
 * em que a mensagem chega.
 *
 * ── Quem NÃO recebe aviso ───────────────────────────────────────────────
 *
 * A mensagem que a própria clínica mandou: quem a escreveu não precisa ser
 * avisado dela, e ela chega de volta pelo mesmo webhook.
 *
 * Grupo. São 12 na base — "#NÓS Floripa - Gestão", "Grupo de Estudos Dr.
 * Mauro K" —, todos internos e nenhum de paciente. Um grupo ativo faria o
 * celular de todo mundo vibrar o dia inteiro, e o primeiro reflexo de quem
 * recebe aviso demais é desligar o aviso — inclusive o do paciente.
 *
 * ── E por que uma falha aqui não derruba a gravação ─────────────────────
 *
 * A mensagem já está no banco quando esta função roda. Um erro de push não
 * pode virar 500, porque 500 faz a Evolution REENVIAR o evento — e o reenvio
 * grava de novo e avisa de novo. Perder um aviso é ruim; duplicar a mensagem
 * do paciente é pior.
 */
async function avisar(ownerId: string, m: MensagemEspelhada) {
  if (m.fromMe || m.ehGrupo) return;

  try {
    const { data: contato } = await supabase
      .from("wa_contacts")
      .select("name")
      .eq("owner_id", ownerId)
      .eq("origem", "evolution")
      .eq("crm_contact_id", m.crmContactId)
      .limit(1)
      .maybeSingle();

    await pushToOwner(supabase, ownerId, "whatsapp_message", {
      title: contato?.name?.trim() || m.phone || "Contato",
      body: resumo(m),
      url: "/atendimentos/chat",
    });
  } catch (e) {
    console.warn("[wa-webhook] aviso não saiu:", e instanceof Error ? e.message : e);
  }
}

/** O texto do aviso. Sem texto, o que veio — "Foto" é informação; "" não é. */
function resumo(m: MensagemEspelhada): string {
  const texto = m.body?.trim();
  if (texto) return texto.length > 120 ? `${texto.slice(0, 117)}…` : texto;
  // `attachments` é `unknown[]` no tradutor de propósito — ele não impõe
  // forma ao que grava. Aqui a leitura é estreita: só o tipo do primeiro.
  const tipo = (m.attachments[0] as { tipo?: string } | undefined)?.tipo;
  if (tipo === "image") return "📷 Foto";
  if (tipo === "audio") return "🎤 Áudio";
  if (tipo === "video") return "🎬 Vídeo";
  if (tipo) return "📎 Arquivo";
  return "Mandou uma mensagem nova no WhatsApp.";
}

/** Nome e foto de um contato, quando a Evolution os informa à parte. */
async function gravarContato(ownerId: string, data: any) {
  const jid = data?.id ?? data?.remoteJid;
  if (!jid) return { ignorado: "contato sem jid" };

  const linha: Record<string, unknown> = {
    owner_id: ownerId,
    origem: "evolution",
    crm_contact_id: String(jid),
    phone_raw: telefoneDoJid(jid),
    synced_at: new Date().toISOString(),
  };
  const nome = data?.pushName ?? data?.name ?? data?.notify;
  if (typeof nome === "string" && nome.trim()) linha.name = nome.trim();
  if (data?.profilePicUrl) linha.avatar_url = data.profilePicUrl;

  const { error } = await supabase
    .from("wa_contacts")
    .upsert(linha, { onConflict: "owner_id,origem,crm_contact_id" });
  if (error) throw new Error(`contato: ${error.message}`);
  return { gravado: String(jid) };
}

/**
 * Anota que este tipo de evento chegou.
 *
 * ── Por que isto existe ──────────────────────────────────────────────────
 *
 * Porque esta função trata três eventos e descarta o resto sem deixar rastro.
 * Então não havia como responder, olhando o banco, à pergunta "a Evolution
 * manda o evento de leitura?" — e a resposta depende de como a instância foi
 * configurada no servidor, que não é coisa deste repositório.
 *
 * Guarda o NOME do evento, a contagem e as chaves de primeiro nível do corpo.
 * Nunca o conteúdo: nem texto, nem telefone, nem nome. As chaves bastam para
 * ver se `unreadCount` vem junto, e não são dado de paciente.
 *
 * Nunca levanta, e nunca atrasa o que importa: é medição, e medição que
 * derruba a gravação de uma mensagem não vale a informação que ela traz.
 */
async function anotarEvento(
  ownerId: string,
  instancia: string,
  evento: string,
  // `unknown` e não `any`: aqui o corpo é só inspecionado, nunca usado como
  // objeto conhecido — e as duas linhas abaixo estreitam o tipo sozinhas.
  data: unknown,
) {
  try {
    const primeiro = Array.isArray(data) ? data[0] : data;
    const chaves =
      primeiro && typeof primeiro === "object" ? Object.keys(primeiro).slice(0, 40) : [];
    await supabase.rpc("wa_anotar_evento", {
      _owner: ownerId,
      _instancia: instancia,
      _evento: evento,
      _chaves: chaves,
    });
  } catch (e) {
    console.warn("[wa-webhook] não deu para anotar o evento:", e instanceof Error ? e.message : e);
  }
}

/**
 * A conversa foi lida no celular.
 *
 * ── O sinal ──────────────────────────────────────────────────────────────
 *
 * O WhatsApp não diz "fulano leu". O que chega é o ESTADO do chat depois da
 * leitura, com um contador de não lidas — zerou, foi lido no aparelho. Quem lê
 * esse estado é `leitura-no-celular.ts`, que é puro e tem teste; aqui só se
 * grava o resultado.
 *
 * ── O que NÃO acontece aqui ──────────────────────────────────────────────
 *
 * Contador ausente não vira zero, contador maior que zero não mexe em nada, e
 * `read_at` nunca anda para trás. Os três são a mesma precaução: apagar a
 * bolinha de uma conversa que ninguém leu some com a mensagem de um paciente
 * que está esperando, e ninguém descobre.
 */
async function lerNoCelular(ownerId: string, data: unknown) {
  const leituras = leiturasDoEvento({ data });
  const lidas = leituras.filter(
    (l) => foiLidaNoCelular(l) && ehConversaDoAparelho(l.conversationId),
  );
  if (!lidas.length) return { ignorado: "nenhuma conversa zerada neste evento" };

  const zeradas: string[] = [];
  for (const l of lidas) {
    const { error } = await supabase.rpc("wa_marcar_lida_pelo_celular", {
      _owner: ownerId,
      _conversa: l.conversationId,
    });
    if (error) {
      // Coluna ou função pendente de migration, ou banco instável. A bolinha
      // continuar acesa é o pior caso aceitável; derrubar o webhook não é.
      console.warn("[wa-webhook] leitura do celular não gravou:", error.message);
      return { ignorado: `não deu para marcar: ${error.message}` };
    }
    zeradas.push(l.conversationId);
  }
  return { lidasNoCelular: zeradas.length };
}

const ESTADOS: Record<string, "open" | "connecting" | "close"> = {
  open: "open",
  connecting: "connecting",
  close: "close",
};

Deno.serve(async (req) => {
  try {
    // O segredo antes de qualquer trabalho. Sem ele configurado, a função
    // recusa tudo em vez de aceitar tudo — porta sem fechadura é pior que
    // porta trancada com a chave perdida.
    const segredoRecebido = new URL(req.url).searchParams.get("secret") ?? "";
    if (!SEGREDO || segredoRecebido !== SEGREDO) {
      return Response.json({ error: "não autorizado" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body) return ok({ ignorado: "corpo vazio" });

    const evento = String(body?.event ?? "")
      .toLowerCase()
      .replace(/_/g, ".");
    const instancia = String(body?.instance ?? body?.instanceName ?? "");
    if (!instancia) return ok({ ignorado: "evento sem instância" });

    const ownerId = await donoDaInstancia(instancia);
    if (!ownerId) {
      // Não é erro: pode ser uma instância de outro sistema no mesmo
      // servidor. Devolver 500 faria a Evolution reenviar para sempre.
      console.warn(`[wa-webhook] instância desconhecida: ${instancia}`);
      return ok({ ignorado: "instância não cadastrada" });
    }

    // Antes de tudo, e sem esperar: toda passagem por aqui vira uma linha de
    // contagem. É o que responde quais eventos esta instância manda.
    void anotarEvento(ownerId, instancia, evento, body?.data);

    let resultado: unknown = { ignorado: evento };

    if (EVENTOS_DE_CONVERSA.includes(evento as (typeof EVENTOS_DE_CONVERSA)[number])) {
      resultado = { evento, ...(await lerNoCelular(ownerId, body?.data)) };
    } else if (evento === "messages.upsert") {
      // A Evolution manda ora um objeto, ora uma lista.
      const itens = Array.isArray(body?.data) ? body.data : [body?.data];
      const gravados = [];
      for (const item of itens) gravados.push(await gravarMensagem(ownerId, item));
      resultado = { evento, gravados };
    } else if (evento === "contacts.upsert" || evento === "contacts.update") {
      const itens = Array.isArray(body?.data) ? body.data : [body?.data];
      const gravados = [];
      for (const item of itens) gravados.push(await gravarContato(ownerId, item));
      resultado = { evento, gravados };
    } else if (evento === "connection.update") {
      const estado = ESTADOS[String(body?.data?.state ?? "").toLowerCase()];
      const extra: Record<string, unknown> = {};
      if (estado) extra.status = estado;
      if (estado === "open") extra.connected_at = new Date().toISOString();
      const numero = telefoneDoJid(body?.data?.wuid ?? body?.sender);
      if (numero) extra.phone_e164 = numero;
      await marcarSinalDeVida(instancia, extra);
      return ok({ evento, estado: estado ?? "desconhecido" });
    }

    await marcarSinalDeVida(instancia);
    return ok(resultado as Record<string, unknown>);
  } catch (e) {
    // Falha ao gravar É erro, e o 500 faz a Evolution reenviar — que é o
    // comportamento desejado: a mensagem do paciente não pode se perder
    // porque o banco piscou.
    console.error("[wa-webhook]", e);
    return Response.json(
      { error: e instanceof Error ? e.message : "falha ao gravar o evento" },
      { status: 500 },
    );
  }
});
