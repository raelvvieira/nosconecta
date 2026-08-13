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

interface CrmContact {
  id: string;
  name: string | null;
  phone: string | null;
}

async function handleList(ownerId: string) {
  const contatos: CrmContact[] = [];
  let total = 0;
  let truncado = false;

  for (let page = 1; page <= MAX_PAGES; page++) {
    // Sem `unwrap` na resposta crua: ele devolve `data` e descarta o `meta`,
    // que é onde a paginação vive.
    const res = await crmFetch(
      supabase,
      ownerId,
      `/api/v1/contacts?page=${page}&pageSize=${PAGE_SIZE}`,
    );
    total = Number(res?.meta?.pagination?.total ?? total);
    const lote = unwrap(res);
    if (!Array.isArray(lote) || lote.length === 0) break;

    for (const row of lote) {
      contatos.push({
        id: String(row?.id ?? ""),
        name: row?.name ?? null,
        // O CRM guarda o telefone em `phone_number` — mesmo campo que o
        // handleUpsert escreve e que vem embutido em cada conversa.
        phone: row?.phone_number ?? row?.phone ?? null,
      });
    }

    if (lote.length < PAGE_SIZE) break;
    if (page === MAX_PAGES) truncado = true;
  }

  return { ok: true, contacts: contatos, total, truncado };
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
