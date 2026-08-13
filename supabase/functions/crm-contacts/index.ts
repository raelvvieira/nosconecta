// Contatos do CRM. Duas mãos, agora:
//
// `upsert` empurra o paciente (fonte da verdade) como contato — chamada só
// internamente por src/lib/patients/patients.functions.ts, nunca por uma tela.
//
// `list` lê a base de contatos inteira, paginada. Existe porque não havia
// nenhuma forma de ver quem está sincronizado: `/api/v1/contacts` era chamado
// uma única vez no sistema todo, com `pageSize=1`, só para ler o total em
// `meta.pagination.total` (crm-campaigns/index.ts). Nada é espelhado em tabela
// local — o cache é o do TanStack Query no front, como no resto do módulo.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crmFetch } from "../_shared/crm-auth.ts";
import { unwrap } from "../_shared/crm-client.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function handleUpsert(
  ownerId: string,
  patient: { patientId: string; name: string; phone?: string | null },
) {
  const { data: row, error } = await supabase
    .from("patients")
    .select("crm_contact_id")
    .eq("id", patient.patientId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const body = { name: patient.name, phone_number: patient.phone || undefined };

  if (row?.crm_contact_id) {
    await crmFetch(supabase, ownerId, `/api/v1/contacts/${row.crm_contact_id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    return { ok: true, contactId: row.crm_contact_id };
  }

  const res = await crmFetch(supabase, ownerId, "/api/v1/contacts", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const contactId = unwrap(res)?.id ?? null;
  if (contactId) {
    await supabase
      .from("patients")
      .update({ crm_contact_id: String(contactId) })
      .eq("id", patient.patientId)
      .eq("owner_id", ownerId);
  }
  return { ok: true, contactId };
}

// 100 por página é o meio-termo entre número de requisições e tamanho de
// resposta. O teto de páginas é rede de segurança contra uma paginação que não
// termina: 50 × 100 = 5000 contatos, acima disso a tela avisa que truncou.
const PAGE_SIZE = 100;
const MAX_PAGES = 50;
// Buscar uma página de cada vez, esperando cada resposta antes de pedir a
// próxima, fazia uma base de ~4.500 contatos (45 páginas) levar dezenas de
// idas e vindas sequenciais ao CRM — a tela ficava presa em "carregando" por
// tempo suficiente para parecer travada. Pedir várias páginas ao mesmo tempo
// é o que torna isso rápido de verdade.
const CONCORRENCIA = 6;
// Teto de tempo total: melhor devolver o que já tem, marcado como truncado,
// do que deixar a função rodando até o Supabase matar a execução — aí a tela
// nunca saberia por quê.
const PRAZO_MS = 45_000;

interface CrmContact {
  id: string;
  name: string | null;
  phone: string | null;
  /** Caixa do contato, quando o CRM informar. Nome do campo não confirmado. */
  inboxId: string | null;
}

async function buscarPagina(ownerId: string, page: number) {
  // Sem `unwrap` na resposta crua: ele devolve `data` e descarta o `meta`,
  // que é onde a paginação vive.
  return crmFetch(supabase, ownerId, `/api/v1/contacts?page=${page}&pageSize=${PAGE_SIZE}`);
}

async function handleList(ownerId: string) {
  const inicio = Date.now();
  const contatos: CrmContact[] = [];
  let total = 0;
  let truncado = false;
  // Só os NOMES dos campos do primeiro contato, nunca os valores: serve para a
  // tela dizer o que o CRM devolve quando não achamos caixa nenhuma, sem
  // trafegar dado pessoal para diagnóstico.
  let camposDisponiveis: string[] = [];

  const registrar = (res: any): number => {
    total = Number(res?.meta?.pagination?.total ?? total);
    const lote = unwrap(res);
    if (!Array.isArray(lote)) return 0;
    for (const row of lote) {
      if (!camposDisponiveis.length && row && typeof row === "object") {
        camposDisponiveis = Object.keys(row);
      }
      const inbox = row?.inbox_id ?? row?.inboxId ?? row?.inbox?.id ?? null;
      contatos.push({
        id: String(row?.id ?? ""),
        name: row?.name ?? null,
        // O CRM guarda o telefone em `phone_number` — mesmo campo que o
        // handleUpsert escreve e que vem embutido em cada conversa.
        phone: row?.phone_number ?? row?.phone ?? null,
        inboxId: inbox ? String(inbox) : null,
      });
    }
    return lote.length;
  };

  // A primeira página sozinha: é dela que sai o total, que decide quantas
  // páginas ainda faltam pedir.
  const primeiraQtd = registrar(await buscarPagina(ownerId, 1));
  if (primeiraQtd === 0) {
    return { ok: true, contacts: contatos, total, truncado, camposDisponiveis };
  }
  if (primeiraQtd < PAGE_SIZE) {
    return { ok: true, contacts: contatos, total, truncado, camposDisponiveis };
  }

  let totalPaginas = Math.min(Math.ceil((total || 0) / PAGE_SIZE), MAX_PAGES);
  // O total do `meta` já foi tratado como confiável em outro lugar do sistema
  // (a estimativa de campanha lê só ele). Mas se vier ausente ou menor que uma
  // página já cheia, não dá pra confiar nele pra decidir quando parar —
  // melhor paginar até achar o fim (ou o teto) do que truncar por engano.
  if (totalPaginas <= 1) totalPaginas = MAX_PAGES;
  if (totalPaginas === MAX_PAGES) truncado = true;

  const pendentes: number[] = [];
  for (let p = 2; p <= totalPaginas; p++) pendentes.push(p);

  while (pendentes.length > 0) {
    if (Date.now() - inicio > PRAZO_MS) {
      truncado = true;
      break;
    }
    const lote = pendentes.splice(0, CONCORRENCIA);
    const respostas = await Promise.all(lote.map((p) => buscarPagina(ownerId, p)));
    let algumaVazia = false;
    for (const r of respostas) {
      if (registrar(r) < PAGE_SIZE) algumaVazia = true;
    }
    // Uma página que voltou incompleta é o fim real da base — mesmo que o
    // `meta.total` tivesse sugerido mais páginas.
    if (algumaVazia) break;
  }

  return { ok: true, contacts: contatos, total, truncado, camposDisponiveis };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  try {
    const { ownerId, action, patient } = (await req.json()) as {
      ownerId?: string;
      action?: string;
      patient?: { patientId: string; name: string; phone?: string | null };
    };
    if (!ownerId || !action) {
      return new Response(JSON.stringify({ error: "ownerId e action são obrigatórios" }), { status: 400 });
    }
    let result: unknown;
    if (action === "list") {
      result = await handleList(ownerId);
    } else if (action === "upsert" && patient) {
      result = await handleUpsert(ownerId, patient);
    } else {
      return new Response(JSON.stringify({ error: "action/patient inválidos" }), { status: 400 });
    }

    return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
  } catch (e) {
    console.error("[crm-contacts]", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
