// Copia conversas, contatos e mensagens do CRM para o banco da NÓS.
//
// ── O que isto é, e o que não é ──────────────────────────────────────────
//
// É uma CÓPIA. O Wavy continua sendo quem envia, quem recebe e quem manda na
// conexão do WhatsApp; nada aqui escreve lá. Enquanto esta função roda, a
// clínica não percebe diferença nenhuma — é justamente esse o ponto.
//
// O que ela compra: o histórico (~17 mil mensagens, ~4,5 mil contatos) deixa
// de existir só do lado de fora. Depois disso, trocar de fornecedor é uma
// decisão de transporte, não uma aposta com o histórico do consultório.
//
// ── Por que em duas ações, e não numa ────────────────────────────────────
//
// A lista de conversas é uma chamada paginada; as mensagens são UMA CHAMADA
// POR CONVERSA. Com milhares de conversas isso não cabe numa execução de Edge
// Function, então `sync-mensagens` é uma fila: cada rodada pega as conversas
// com a cópia mais antiga (nunca copiadas primeiro) e avança até o prazo.
// Cair no meio custa uma rodada, não a carga inteira.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crmFetch } from "../_shared/crm-auth.ts";
import { unwrap } from "../_shared/crm-client.ts";
import {
  caixaDaConversa,
  mapearAnexos,
  paraIso,
  saiuDaClinica,
  situacaoDaConversa,
} from "../_shared/wa-mapear.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const POR_PAGINA = 50;
const MAX_PAGINAS = 200;
// Folga contra o teto de execução: melhor parar por conta própria e retomar
// na rodada seguinte do que ser cortado no meio de uma gravação.
const PRAZO_MS = 100_000;
// Quantas conversas por rodada. Cada uma é uma ida ao CRM.
const CONVERSAS_POR_RODADA = 40;
// Quantas mensagens com anexo por rodada. Cada anexo é um download + upload.
const MENSAGENS_DE_MIDIA_POR_RODADA = 25;
// Onde as mídias ficam. O balde é criado pelo Lovable (Cloud → Storage), não
// por migration — regra do projeto.
const BALDE = "wa-midia";
// Acima disto o arquivo é pulado e o motivo fica gravado no próprio anexo.
// A Edge Function carrega o arquivo na memória para repassar: um vídeo de
// 100 MB derrubaria a rodada inteira, e com ela as outras 24 mensagens.
const TAMANHO_MAXIMO = 25 * 1024 * 1024;

async function sincronizarConversas(ownerId: string) {
  const limite = Date.now() + PRAZO_MS;
  let pagina = 1;
  let conversas = 0;
  let contatos = 0;
  let truncado = false;

  while (pagina <= MAX_PAGINAS) {
    if (Date.now() > limite) {
      truncado = true;
      break;
    }
    const res = await crmFetch(
      supabase,
      ownerId,
      `/api/v1/conversations?page=${pagina}&per_page=${POR_PAGINA}&status=all`,
    );
    const linhas = unwrap(res);
    if (!Array.isArray(linhas) || linhas.length === 0) break;

    // Contatos primeiro: a conversa referencia `crm_contact_id`, e gravar na
    // ordem inversa deixaria uma janela com conversa apontando para contato
    // que ainda não existe no espelho.
    const porContato = new Map<string, any>();
    for (const linha of linhas) {
      const c = linha?.contact ?? {};
      if (!c?.id) continue;
      porContato.set(String(c.id), {
        owner_id: ownerId,
        // Tudo que sai desta função vem do Wavy. A coluna existe porque a
        // Evolution própria vai gravar aqui também, com ids próprios que
        // podem colidir numericamente com os do Chatwoot.
        origem: "wavy",
        crm_contact_id: String(c.id),
        name: c?.name ?? null,
        phone_raw: c?.phone_number ?? null,
        avatar_url: c?.thumbnail || c?.avatar_url || null,
        crm_created_at: paraIso(c?.created_at),
        payload: c,
        synced_at: new Date().toISOString(),
      });
    }
    if (porContato.size) {
      // `patient_id` fica de fora do upsert de propósito: ele é o vínculo com
      // a ficha, feito do lado de cá, e uma recarga não pode desfazê-lo.
      const { error } = await supabase
        .from("wa_contacts")
        .upsert([...porContato.values()], { onConflict: "owner_id,origem,crm_contact_id" });
      if (error) throw new Error(`contatos: ${error.message}`);
      contatos += porContato.size;
    }

    const linhasDeConversa = linhas
      .filter((l: any) => l?.id)
      .map((l: any) => ({
        owner_id: ownerId,
        origem: "wavy",
        crm_conversation_id: String(l.id),
        crm_contact_id: l?.contact?.id ? String(l.contact.id) : null,
        inbox_id: caixaDaConversa(l),
        status: situacaoDaConversa(l?.status),
        unread_count: Number(l?.unread_count ?? 0),
        crm_created_at: paraIso(l?.created_at),
        payload: l,
        synced_at: new Date().toISOString(),
      }));

    if (linhasDeConversa.length) {
      // `last_message_at`, `last_message_preview` e `messages_synced_at` não
      // entram aqui: os dois primeiros são do gatilho (o CRM não traz a última
      // mensagem na listagem — é por isso que a tela mostra "—" em todas), e o
      // terceiro é da fila. Mandá-los zeraria o progresso a cada rodada.
      const { error } = await supabase
        .from("wa_conversations")
        .upsert(linhasDeConversa, { onConflict: "owner_id,origem,crm_conversation_id" });
      if (error) throw new Error(`conversas: ${error.message}`);
      conversas += linhasDeConversa.length;
    }

    if (linhas.length < POR_PAGINA) break;
    pagina++;
  }

  const { data: vinculados } = await supabase.rpc("wa_vincular_por_crm_contact", {
    p_owner: ownerId,
  });

  return { ok: true, conversas, contatos, vinculados: vinculados ?? 0, truncado };
}

async function sincronizarMensagens(ownerId: string, quantas = CONVERSAS_POR_RODADA) {
  const limite = Date.now() + PRAZO_MS;

  const { data: fila, error: erroFila } = await supabase
    .from("wa_conversations")
    .select("crm_conversation_id, messages_synced_at")
    .eq("owner_id", ownerId)
    // Só o que veio do Wavy: a fila desta função busca no CRM, e uma conversa
    // da Evolution seria pedida a uma API que nunca ouviu falar dela.
    .eq("origem", "wavy")
    .order("messages_synced_at", { ascending: true, nullsFirst: true })
    .limit(quantas);
  if (erroFila) throw new Error(`fila: ${erroFila.message}`);

  let conversasFeitas = 0;
  let mensagens = 0;
  const falhas: string[] = [];

  for (const conversa of fila ?? []) {
    if (Date.now() > limite) break;
    const id = conversa.crm_conversation_id;
    try {
      const res = await crmFetch(supabase, ownerId, `/api/v1/conversations/${id}/messages`);
      const linhas = unwrap(res);
      const paraGravar = (Array.isArray(linhas) ? linhas : [])
        .filter((m: any) => m?.id)
        .map((m: any) => ({
          owner_id: ownerId,
          origem: "wavy",
          crm_message_id: String(m.id),
          crm_conversation_id: id,
          from_me: saiuDaClinica(m?.message_type),
          body: m?.content ?? null,
          is_private: m?.private === true || m?.private === "true",
          attachments: mapearAnexos(m?.attachments),
          sent_at: paraIso(m?.created_at) ?? new Date().toISOString(),
          payload: m,
          synced_at: new Date().toISOString(),
        }));

      if (paraGravar.length) {
        const { error } = await supabase
          .from("wa_messages")
          .upsert(paraGravar, { onConflict: "owner_id,origem,crm_message_id" });
        if (error) throw new Error(error.message);
        mensagens += paraGravar.length;
      }

      // Só depois de gravar: marcar antes faria uma conversa cuja gravação
      // falhou sair da fila como se tivesse sido copiada.
      await supabase
        .from("wa_conversations")
        .update({ messages_synced_at: new Date().toISOString() })
        .eq("owner_id", ownerId)
        .eq("origem", "wavy")
        .eq("crm_conversation_id", id);
      conversasFeitas++;
    } catch (e) {
      // Uma conversa que falha não pode parar a fila — ela continua com a
      // marca antiga e volta a ser escolhida na próxima rodada.
      falhas.push(`${id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { ok: true, conversasFeitas, mensagens, falhas: falhas.slice(0, 5), restantes: null };
}

/**
 * Baixa os anexos do CRM e guarda no Storage.
 *
 * ── Por que isto não é detalhe ──────────────────────────────────────────
 *
 * As URLs dos anexos são ASSINADAS e servidas pelo ActiveStorage do Rails do
 * CRM. Copiar a mensagem copia o ENDEREÇO, não o arquivo. No dia em que o
 * Wavy sair do ar, toda foto, áudio e PDF que os pacientes mandaram morre
 * junto — com o histórico de texto inteiro salvo aqui do lado, intacto e
 * cheio de links quebrados.
 *
 * Por isso é uma ação própria, e não um pedaço do `sync-mensagens`: ela é
 * lenta e cara em memória, e precisa rodar no seu ritmo sem segurar a cópia
 * do texto, que é o que interessa primeiro.
 */
async function sincronizarMidia(ownerId: string, quantas = MENSAGENS_DE_MIDIA_POR_RODADA) {
  const limite = Date.now() + PRAZO_MS;

  const { data: pendentes, error } = await supabase
    .from("wa_messages")
    .select("crm_message_id, crm_conversation_id, attachments")
    .eq("owner_id", ownerId)
    .eq("origem", "wavy")
    .is("media_path", null)
    .eq("tem_anexo", true)
    // Mais recentes primeiro: se a cópia for interrompida no meio do
    // histórico, o que ficou de fora é o mais antigo, não o desta semana.
    .order("sent_at", { ascending: false })
    .limit(quantas);
  if (error) throw new Error(`fila de mídia: ${error.message}`);

  let mensagens = 0;
  let arquivos = 0;
  let pulados = 0;
  const falhas: string[] = [];
  // Balde ausente não é falha de um arquivo: é falha de TODOS, e a rodada
  // inteira vira desperdício — baixa cada anexo do CRM para descobrir, um a
  // um, que não há onde guardar. Vale interromper na primeira vez e dizer o
  // que fazer, em vez de repetir o mesmo erro 25 vezes a cada 5 minutos.
  let semBalde = false;

  for (const msg of pendentes ?? []) {
    if (Date.now() > limite || semBalde) break;
    const pasta = `${ownerId}/${msg.crm_conversation_id}/${msg.crm_message_id}`;
    const anexos = Array.isArray(msg.attachments) ? msg.attachments : [];
    // A nossa cópia vai para `media`, ao lado — nunca dentro de `attachments`,
    // que é o espelho fiel do CRM e é reescrita a cada leitura da conversa.
    const copias: unknown[] = [];
    let algumErro = false;

    for (const bruto of anexos) {
      if (semBalde) break;
      const anexo = bruto as Record<string, unknown>;
      const url = anexo?.url;
      if (!url) {
        copias.push({ id: anexo.id ?? null, path: null, erro: "sem url" });
        pulados++;
        continue;
      }
      try {
        const res = await fetch(String(url), { signal: AbortSignal.timeout(30_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const anunciado = Number(res.headers.get("content-length") ?? 0);
        if (anunciado > TAMANHO_MAXIMO) {
          copias.push({ id: anexo.id ?? null, path: null, erro: `grande demais (${anunciado} bytes)` });
          pulados++;
          continue;
        }
        const bytes = new Uint8Array(await res.arrayBuffer());
        // Conferido de novo depois de baixar: `content-length` pode não vir.
        if (bytes.byteLength > TAMANHO_MAXIMO) {
          copias.push({
            id: anexo.id ?? null,
            path: null,
            erro: `grande demais (${bytes.byteLength} bytes)`,
          });
          pulados++;
          continue;
        }
        // A extensão sai da URL ANTES da query: as URLs são assinadas, e a
        // assinatura vai na query — sem tirá-la, a "extensão" viria com ela
        // grudada. Mesma regra do `nomeDoArquivo` do app.
        const limpa = String(url).split("?")[0].split("#")[0];
        const ext = /\.([a-z0-9]{1,8})$/i.exec(limpa)?.[1]?.toLowerCase() ?? "bin";
        const caminho = `${pasta}/${anexo.id || arquivos}.${ext}`;

        const { error: erroUpload } = await supabase.storage.from(BALDE).upload(caminho, bytes, {
          contentType: res.headers.get("content-type") ?? "application/octet-stream",
          // Reexecutar não pode falhar por "já existe": a rodada anterior pode
          // ter subido o arquivo e caído antes de marcar a mensagem.
          upsert: true,
        });
        if (erroUpload) {
          if (/bucket not found/i.test(erroUpload.message)) semBalde = true;
          throw new Error(erroUpload.message);
        }

        copias.push({ id: anexo.id ?? null, path: caminho, erro: null });
        arquivos++;
      } catch (e) {
        algumErro = true;
        copias.push({
          id: anexo.id ?? null,
          path: null,
          erro: e instanceof Error ? e.message : String(e),
        });
        falhas.push(`${msg.crm_message_id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // `media_path` só é gravada quando nenhum anexo FALHOU — a mensagem
    // continua na fila e tenta de novo na próxima rodada.
    //
    // Anexo pulado por tamanho não conta como falha: tentar de novo daria o
    // mesmo resultado, e deixar a mensagem na fila para sempre esconderia as
    // que ainda têm conserto. O motivo fica gravado no anexo.
    const { error: erroMarca } = await supabase
      .from("wa_messages")
      .update({ media: copias, media_path: algumErro ? null : pasta })
      .eq("owner_id", ownerId)
      .eq("origem", "wavy")
      .eq("crm_message_id", msg.crm_message_id);
    if (erroMarca) falhas.push(`${msg.crm_message_id}: marca: ${erroMarca.message}`);
    else mensagens++;
  }

  return {
    ok: true,
    mensagens,
    arquivos,
    pulados,
    falhas: falhas.slice(0, 5),
    // Dito em português e no topo do resultado: sem isto o motivo fica
    // enterrado numa lista de falhas repetidas, e a cópia parece "lenta"
    // quando na verdade está parada.
    ...(semBalde
      ? {
          bloqueado: `O balde "${BALDE}" não existe no Storage. Crie-o em Cloud → Storage ` +
            `(privado) — nenhuma mídia é copiada até lá, e as mensagens continuam na fila.`,
        }
      : {}),
  };
}

async function situacao(ownerId: string) {
  const conta = async (tabela: string, filtro?: (q: any) => any) => {
    let q = supabase.from(tabela).select("*", { count: "exact", head: true }).eq("owner_id", ownerId);
    if (filtro) q = filtro(q);
    const { count } = await q;
    return count ?? 0;
  };
  return {
    ok: true,
    contatos: await conta("wa_contacts"),
    conversas: await conta("wa_conversations"),
    mensagens: await conta("wa_messages"),
    conversasSemMensagensCopiadas: await conta("wa_conversations", (q) =>
      q.is("messages_synced_at", null),
    ),
    contatosComFicha: await conta("wa_contacts", (q) => q.not("patient_id", "is", null)),
    mensagensComMidiaPendente: await conta("wa_messages", (q) =>
      q.is("media_path", null).eq("tem_anexo", true),
    ),
  };
}

/**
 * Uma rodada completa para um dono: conversas, depois mensagens, depois mídia.
 *
 * A ordem não é arbitrária. Conversa nova precisa existir antes de a fila de
 * mensagens poder escolhê-la, e a mensagem precisa existir antes de a mídia
 * dela ter onde ser pendurada. Rodar fora de ordem só custaria uma rodada,
 * mas custaria toda vez.
 */
async function rodada(ownerId: string) {
  const conversas = await sincronizarConversas(ownerId);
  const mensagens = await sincronizarMensagens(ownerId);
  const midia = await sincronizarMidia(ownerId);
  return { ownerId, conversas, mensagens, midia };
}

/**
 * Sem `ownerId` no corpo, a chamada veio do cron: roda para todas as clínicas
 * que têm credencial do CRM.
 *
 * Em sequência, e não em paralelo: são as mesmas credenciais batendo na mesma
 * API do CRM, e disparar todas de uma vez trocaria uma espera por um 429.
 */
async function rodadaDeTodos() {
  const { data, error } = await supabase.from("crm_credentials").select("owner_id");
  if (error) throw new Error(`donos: ${error.message}`);
  const donos = [...new Set((data ?? []).map((r: any) => r.owner_id))];

  const resultados = [];
  for (const dono of donos) {
    try {
      resultados.push(await rodada(dono as string));
    } catch (e) {
      // Uma clínica com credencial vencida não pode parar as outras.
      resultados.push({ ownerId: dono, erro: e instanceof Error ? e.message : String(e) });
    }
  }
  return { ok: true, donos: donos.length, resultados };
}

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const ownerId = String(body?.ownerId ?? "");
    const action = String(body?.action ?? "");

    // Corpo vazio = cron. É como `push-poll-conversations` já é chamada.
    if (!ownerId && !action) return Response.json(await rodadaDeTodos());

    if (!ownerId || !action) {
      return Response.json({ error: "ownerId e action são obrigatórios" }, { status: 400 });
    }

    let resultado: unknown;
    if (action === "sync-conversas") resultado = await sincronizarConversas(ownerId);
    else if (action === "sync-mensagens") {
      resultado = await sincronizarMensagens(ownerId, Number(body?.quantas) || undefined);
    } else if (action === "sync-midia") {
      resultado = await sincronizarMidia(ownerId, Number(body?.quantas) || undefined);
    } else if (action === "rodada") resultado = await rodada(ownerId);
    else if (action === "status") resultado = await situacao(ownerId);
    else return Response.json({ error: `ação desconhecida: ${action}` }, { status: 400 });

    return Response.json(resultado);
  } catch (e) {
    console.error("[wa-espelho]", e);
    return Response.json(
      { error: e instanceof Error ? e.message : "Falha ao espelhar." },
      { status: 500 },
    );
  }
});
