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
        .upsert([...porContato.values()], { onConflict: "owner_id,crm_contact_id" });
      if (error) throw new Error(`contatos: ${error.message}`);
      contatos += porContato.size;
    }

    const linhasDeConversa = linhas
      .filter((l: any) => l?.id)
      .map((l: any) => ({
        owner_id: ownerId,
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
        .upsert(linhasDeConversa, { onConflict: "owner_id,crm_conversation_id" });
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
          .upsert(paraGravar, { onConflict: "owner_id,crm_message_id" });
        if (error) throw new Error(error.message);
        mensagens += paraGravar.length;
      }

      // Só depois de gravar: marcar antes faria uma conversa cuja gravação
      // falhou sair da fila como se tivesse sido copiada.
      await supabase
        .from("wa_conversations")
        .update({ messages_synced_at: new Date().toISOString() })
        .eq("owner_id", ownerId)
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
  };
}

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const ownerId = String(body?.ownerId ?? "");
    const action = String(body?.action ?? "");
    if (!ownerId || !action) {
      return Response.json({ error: "ownerId e action são obrigatórios" }, { status: 400 });
    }

    let resultado: unknown;
    if (action === "sync-conversas") resultado = await sincronizarConversas(ownerId);
    else if (action === "sync-mensagens") {
      resultado = await sincronizarMensagens(ownerId, Number(body?.quantas) || undefined);
    } else if (action === "status") resultado = await situacao(ownerId);
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
