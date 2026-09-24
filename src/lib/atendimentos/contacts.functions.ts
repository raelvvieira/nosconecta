import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";
import { montarBaseDeContatos, type ContatoDaBase } from "./base-de-contatos";
import { variantesDoNumero } from "./phone";

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

/** O que o WhatsApp sabe sobre esta pessoa. */
export interface FotoDoWhatsapp {
  url: string | null;
  /** Por que não há foto. Nulo quando há. Não vai para a tela — serve para
   *  quem for investigar "por que esse paciente não mostra foto". */
  motivo: string | null;
}

/**
 * A foto de perfil do WhatsApp de um paciente.
 *
 * ── Para que serve ──────────────────────────────────────────────────────
 *
 * A dentista abre o agendamento e nem sempre lembra quem é pelo nome. Pela
 * foto ela reconhece na hora. É a mesma foto que já aparece na conversa —
 * trazida para onde a decisão acontece.
 *
 * ── Por que NÃO casa por telefone quando o número é de mais de um ───────
 *
 * Esta é a parte que importa, e ela contraria a intuição.
 *
 * A migration do espelho já tinha medido: dos 203 números que aparecem em
 * mais de uma ficha, **147 têm nomes diferentes** — mãe e filho, responsável
 * e criança, o normal em odontologia. A decisão registrada lá é que o
 * telefone SUGERE, com alguém confirmando, e nunca DECIDE sozinho.
 *
 * Aqui isso é literal: entre os pacientes com agendamento, 5 de 22 dividem o
 * telefone com uma ficha de outro nome. Casar por número traria a foto da mãe
 * na ficha do filho — e o propósito desta foto é justamente reconhecer quem
 * vai sentar na cadeira. Foto errada, mostrada com confiança, é pior que
 * inicial nenhuma: ela faz a dentista cumprimentar a pessoa errada.
 *
 * Então a ordem é: primeiro o identificador do contato, que é exato; depois o
 * telefone, e só quando ele pertence a UMA ficha. Medido: a regra exata sozinha
 * acha 7 dos 23; com o telefone exclusivo, 9; com o telefone solto seriam 10 —
 * uma foto a mais, em troca de até 5 erradas.
 *
 * ── O nono dígito ───────────────────────────────────────────────────────
 *
 * A ficha guarda `5551993967887` e o WhatsApp `555193967887`. `variantesDoNumero`
 * devolve as duas formas, e o `IN` com valores exatos usa o índice
 * `idx_wa_contacts_fone`.
 *
 * ── A URL expira, e é esperado ──────────────────────────────────────────
 *
 * `avatar_url` aponta para `pps.whatsapp.net` e vem assinada com prazo. O
 * espelho a renova a cada evento do contato. Quando vence, `FotoDoContato` cai
 * nas iniciais pelo `onError`. É por isso que a foto NÃO é copiada para o nosso
 * Storage: guardar foto de perfil de paciente sem necessidade é uma
 * responsabilidade que um avatar não justifica.
 */
export const getFotoDoWhatsapp = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { crmContactId?: string | null; phone?: string | null }) => input)
  .handler(async ({ data, context }): Promise<FotoDoWhatsapp> => {
    const buscarAvatar = async (coluna: string, valores: string[]) => {
      const { data: linhas, error } = await context.supabase
        .from("wa_contacts")
        .select("avatar_url, synced_at")
        .eq("owner_id", context.ownerId)
        .in(coluna, valores)
        .not("avatar_url", "is", null)
        // O mesmo número pode ter linha em mais de uma origem. A mais
        // recém-sincronizada é a que tem a URL que ainda vale.
        .order("synced_at", { ascending: false, nullsFirst: false })
        .limit(1);
      // Foto é conforto, não função: um erro aqui mostra as iniciais, como
      // para os outros 14 pacientes que não têm foto nenhuma.
      if (error) {
        console.warn("[foto-whatsapp]", error.message);
        return null;
      }
      return (linhas?.[0]?.avatar_url as string | undefined) ?? null;
    };

    // ── 1. Pelo identificador do contato — exato, sem ambiguidade ────────
    const contato = String(data.crmContactId ?? "").trim();
    if (contato) {
      const url = await buscarAvatar("crm_contact_id", [contato]);
      if (url) return { url, motivo: null };
    }

    // ── 2. Pelo telefone, e só se ele for de uma ficha só ────────────────
    const formas = variantesDoNumero(data.phone);
    if (!formas.length) return { url: null, motivo: "sem telefone" };

    const { data: fichas, error: erroFichas } = await context.supabase
      .from("patients")
      .select("name")
      .eq("owner_id", context.ownerId)
      .in("phone", formas)
      .limit(20);

    // Sem conseguir conferir de quem é o número, não usa o número. Errar aqui
    // é mostrar o rosto de outra pessoa.
    if (erroFichas) {
      console.warn("[foto-whatsapp] não deu para conferir o telefone:", erroFichas.message);
      return { url: null, motivo: "não deu para conferir de quem é o número" };
    }

    const nomes = new Set(
      (fichas ?? []).map((f: { name?: string | null }) =>
        String(f.name ?? "")
          .trim()
          .toLocaleLowerCase("pt-BR"),
      ),
    );
    nomes.delete("");
    if (nomes.size > 1) {
      return { url: null, motivo: "número dividido entre fichas de nomes diferentes" };
    }

    const url = await buscarAvatar("phone_e164", formas);
    return url ? { url, motivo: null } : { url: null, motivo: "contato sem foto no WhatsApp" };
  });
