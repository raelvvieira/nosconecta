import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";
import { montarBaseDeContatos, type ContatoDaBase } from "./base-de-contatos";

/**
 * A base de contatos para disparo.
 *
 * ── O que isto era ──────────────────────────────────────────────────────
 *
 * A lista de contatos do CRM, lida de `/api/v1/contacts` cem por vez, com seis
 * páginas pedidas em paralelo, um teto de cinquenta páginas e um aviso de
 * "truncado" para quando a base não coubesse. A tela levava segundos para se
 * encher e o resultado dependia de um servidor de fora responder.
 *
 * Agora sai do nosso banco, de `wa_contacts`, que é o espelho do WhatsApp. São
 * mais pessoas do que o CRM jamais teve, e chegam de uma vez.
 *
 * ── Quem entra ──────────────────────────────────────────────────────────
 *
 * A decisão mora em `base-de-contatos.ts`, sem I/O e com teste — ver lá por
 * que um id de privacidade do WhatsApp (lid) precisa ficar de fora mesmo
 * quando se parece com um telefone perfeitamente válido.
 */
export type { ContatoDaBase };

/** Mantido: a tela e os filtros ainda chamam o contato por este nome. */
export type CrmContact = ContatoDaBase;

export interface CrmContactList {
  contacts: ContatoDaBase[];
  total: number;
  /** Sempre `false` agora. A lista é a base inteira — não há mais teto de
   *  páginas de onde ela pudesse voltar cortada. Continua no tipo porque a
   *  tela mostra o aviso, e tirá-lo é mexer em tela sem necessidade. */
  truncado: boolean;
}

/**
 * Quantas linhas por leitura.
 *
 * O PostgREST devolve no máximo mil linhas por requisição, e `wa_contacts` tem
 * mais que isso. Pedir "tudo" sem paginar não dá erro — devolve as mil
 * primeiras e cala. Metade da base sumiria da tela de disparo sem nada
 * acusando, que é a mesma forma de falhar que já custou dias neste sistema.
 */
const POR_PAGINA = 1000;

/** Teto de segurança. 4.328 linhas hoje; vinte páginas dão folga de quatro
 *  vezes e impedem um laço infinito se a leitura passar a mentir o tamanho. */
const MAX_PAGINAS = 20;

export const getCrmContacts = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<CrmContactList> => {
    const supabase = context.supabase;
    const linhas: unknown[] = [];

    for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
      const de = pagina * POR_PAGINA;
      const { data, error } = await supabase
        .from("wa_contacts")
        .select("crm_contact_id, name, phone_e164, phone_raw")
        .eq("owner_id", context.ownerId)
        .order("crm_contact_id", { ascending: true })
        .range(de, de + POR_PAGINA - 1);
      // Erro NÃO vira lista vazia. Já aconteceu duas vezes neste sistema de um
      // `const { data }` sem `error` transformar uma consulta quebrada em
      // "nenhum resultado" — e a tela ficar semanas mostrando o fallback.
      if (error) throw new Error(error.message);
      const lote = data ?? [];
      linhas.push(...lote);
      if (lote.length < POR_PAGINA) break;
    }

    const contacts = montarBaseDeContatos(linhas as never);
    return { contacts, total: contacts.length, truncado: false };
  });
