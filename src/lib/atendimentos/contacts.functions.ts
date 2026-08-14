import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";

export interface CrmContact {
  id: string;
  name: string;
  /** Como veio do CRM: dígitos puros, tipo "5548984195309". */
  phone: string | null;
}

export interface CrmContactList {
  contacts: CrmContact[];
  /** Total que o CRM diz ter, mesmo se a lista veio truncada. */
  total: number;
  /** A paginação bateu no teto — a lista não é a base inteira. */
  truncado: boolean;
}

/**
 * DDD de um telefone brasileiro, ou `null` quando não dá para afirmar.
 *
 * **Exige o código do país.** Um número sem o 55 é ambíguo de um jeito que
 * importa: "+1 415 555 2671", dos Estados Unidos, vira `14155552671` — onze
 * dígitos que se parecem com um celular nacional e cairiam no DDD 14, de São
 * José do Rio Preto. Quem filtra por um DDD para disparar não pode receber
 * alguém de outro país junto.
 *
 * Perder pouco: o CRM guarda o telefone com o país na frente, tanto o que nós
 * escrevemos (o `formatWhatsappNumber` também só reconhece `55`) quanto o que
 * vem do WhatsApp, cujo identificador é sempre `55…@s.whatsapp.net`. Quem
 * ficar sem DDD simplesmente não aparece nos recortes por DDD.
 */
export function ddd(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const d = phone.replace(/\D/g, "");
  // 55 + DDD (2) + número (8 fixo, 9 celular).
  return d.match(/^55(\d{2})\d{8,9}$/)?.[1] ?? null;
}

async function callContacts(body: unknown) {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes");
  const res = await fetch(`${url}/functions/v1/crm-contacts`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify(body ?? {}),
    // A função pagina o CRM inteiro do lado de dentro; sem um teto aqui, uma
    // execução travada deixava a tela em "carregando" para sempre em vez de
    // virar um erro que a interface já sabe mostrar.
    signal: AbortSignal.timeout(55_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `Falha ao chamar crm-contacts (${res.status})`);
  return json;
}

/**
 * A base de contatos sincronizada com o CRM.
 *
 * Chamada única e pesada de propósito: o filtro por DDD precisa enxergar a base
 * inteira para saber quais DDDs existem e quantos são cada um. Filtrar no
 * servidor exigiria um parâmetro de busca que o CRM nunca foi testado para
 * aceitar — só `page` e `pageSize` estão confirmados.
 *
 * Mantida por compatibilidade, mas a tela usa `getCrmContactsPage` (abaixo)
 * para poder mostrar o que já chegou em vez de esperar a base inteira — ver
 * `useContatosIncremental.ts`.
 */
export const getCrmContacts = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<CrmContactList> => {
    const json = await callContacts({ ownerId: context.ownerId, action: "list" });
    const contacts: CrmContact[] = (json.contacts ?? [])
      .filter((c: any) => c?.id)
      .map((c: any) => ({
        id: String(c.id),
        name: (c.name ?? "").trim() || "Sem nome",
        phone: c.phone ?? null,
      }));
    return {
      contacts,
      total: Number(json.total ?? contacts.length),
      truncado: Boolean(json.truncado),
    };
  });

export interface CrmContactPage {
  contacts: CrmContact[];
  /** Total que o CRM diz ter — o mesmo em toda página, usado para calcular
   *  quantas páginas ainda faltam pedir. */
  total: number;
}

/**
 * Uma página só da base — sem laço nenhum do lado do servidor. É o que deixa
 * o front pedir várias ao mesmo tempo e mostrar contato assim que ele chega,
 * em vez de ficar com a tela presa em "carregando" até a base inteira voltar.
 */
export const getCrmContactsPage = createServerFn({ method: "GET" })
  .inputValidator((input: { page: number }) => input)
  .middleware([requireClinicMembership])
  .handler(async ({ data, context }): Promise<CrmContactPage> => {
    const json = await callContacts({ ownerId: context.ownerId, action: "list", page: data.page });
    const contacts: CrmContact[] = (json.contacts ?? [])
      .filter((c: any) => c?.id)
      .map((c: any) => ({
        id: String(c.id),
        name: (c.name ?? "").trim() || "Sem nome",
        phone: c.phone ?? null,
      }));
    return { contacts, total: Number(json.total ?? 0) };
  });
