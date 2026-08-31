import type {
  ContatoSelecionado,
  ContatoUnificado,
} from "@/components/atendimentos/contacts/ContactsTab";
import { normalizeBrazilianPhone } from "./phone";

/**
 * Uma linha por PESSOA — a mesma nunca duas vezes.
 *
 * ── O que aconteceu sem isto ──────────────────────────────────────────────
 *
 * O disparo de 31/08 criou DUAS conversas para várias pessoas, e portanto
 * mandou a mensagem duas vezes e debitou a cota em dobro. Três caminhos
 * levavam ao mesmo lugar, e nenhum tinha rede:
 *
 * 1. A leitura de contatos pedia seis páginas em paralelo sobre uma lista que o
 *    próprio disparo reordena, e juntava com `concat`. O mesmo contato caía no
 *    array duas vezes. (Corrigido na raiz em `useContatosIncremental`, mas a
 *    condição é de corrida e merece rede.)
 * 2. Duas pessoas na tela — uma como contato do CRM, outra como paciente local
 *    — com o mesmo telefone. `ContactsTab` une as duas fontes sem cruzá-las.
 * 3. Dois pacientes locais com o mesmo telefone: o vínculo em lote resolve os
 *    dois para o MESMO `contactId`.
 *
 * ── As chaves ────────────────────────────────────────────────────────────
 *
 * `id` (que é o `contactId` quando a origem é o CRM) e o telefone normalizado.
 * A normalização é por COMPRIMENTO — `normalizeBrazilianPhone` —, então
 * "51993351821" e "5551993351821" são reconhecidos como a mesma pessoa. Sem
 * isso, o par que o próprio sistema sabe que é duplicado no CRM passaria batido.
 *
 * **Quem tem id do CRM ganha.** Ele já está resolvido; o paciente local ainda
 * precisaria de uma ida ao servidor para virar contato — e viraria ESTE mesmo.
 *
 * **Sem telefone não agrupa ninguém.** Duas pessoas diferentes sem número não
 * são a mesma pessoa, e juntá-las faria uma delas deixar de receber calada.
 */
export function pessoasUnicas<T extends ContatoUnificado>(contatos: T[]): T[] {
  const porId = new Set<string>();
  // Telefones que já entraram por um contato do CRM. Um paciente local com o
  // mesmo número é a mesma pessoa e não entra de novo.
  const telefonesDoCrm = new Set<string>();
  for (const c of contatos) {
    if (c.origem !== "crm" || !c.phone) continue;
    telefonesDoCrm.add(normalizeBrazilianPhone(c.phone));
  }

  const telefonesUsados = new Set<string>();
  const unicos: T[] = [];
  for (const c of contatos) {
    const id = String(c.id ?? "");
    if (!id || porId.has(id)) continue;

    const fone = c.phone ? normalizeBrazilianPhone(c.phone) : "";
    if (fone) {
      // O paciente local perde para o contato do CRM do mesmo número, mesmo
      // que venha antes na lista.
      if (c.origem !== "crm" && telefonesDoCrm.has(fone)) continue;
      if (telefonesUsados.has(fone)) continue;
      telefonesUsados.add(fone);
    }

    porId.add(id);
    unicos.push(c);
  }
  return unicos;
}

/** Contato que já tem id no CRM — entra direto na fila. */
export interface AlvoPronto {
  contactId: string;
  conversationId: string | null;
  name: string | null;
  phone: string | null;
}

/** Paciente que ainda não existe no CRM — o servidor resolve em lote. */
export interface AlvoAVincular {
  patientId: string;
  name: string;
  phone: string;
  conversationId: string | null;
}

export interface SelecaoClassificada {
  prontos: AlvoPronto[];
  aVincular: AlvoAVincular[];
  /** Quem não entra de jeito nenhum, com o motivo — para a tela dizer em vez
   *  de a pessoa sumir da conta sem explicação. */
  foraDoDisparo: { nome: string; motivo: string }[];
  /** Quantas linhas saíram por serem a mesma pessoa. Zero quando a tela já
   *  deduplicou — é o normal; diferente de zero indica caminho sem rede. */
  duplicadosIgnorados: number;
}

/**
 * Separar a seleção em "quem já dá para enfileirar", "quem precisa de vínculo"
 * e "quem não pode receber".
 *
 * Isto já foi uma função que FAZIA o vínculo, chamando `garantirContatoCrm`
 * dentro de um laço — uma ida ao servidor por contato, em série, cada uma com
 * duas tentativas e 55 segundos de timeout. Numa seleção de 200 pacientes isso
 * era o "Enfileirando…" que não terminava: até 110 segundos por pessoa, 200
 * vezes, com o navegador segurando tudo.
 *
 * Agora ela não faz I/O nenhum. Só classifica, e o vínculo acontece no servidor
 * em UMA chamada (ver `criarDisparo`), pelo mesmo `resolve_phones` em lote que
 * `handleBackfillLinks` já usa para a base inteira.
 *
 * O ganho de ser pura não é só velocidade: ela passa a ser exercitável em
 * teste sem dublê de servidor, e esta é a conta que decide para quem a mensagem
 * vai.
 */
export function classificarSelecao(contatos: ContatoSelecionado[]): SelecaoClassificada {
  const prontos: AlvoPronto[] = [];
  const aVincular: AlvoAVincular[] = [];
  const foraDoDisparo: { nome: string; motivo: string }[] = [];

  // Rede, e não a defesa principal: as telas já entregam a seleção passada por
  // `pessoasUnicas`. Aqui de novo porque esta é a conta que decide para quem a
  // mensagem vai, e ela não pode depender de todo chamador ter lembrado.
  const unicos = pessoasUnicas(contatos);
  const duplicadosIgnorados = contatos.length - unicos.length;

  for (const c of unicos) {
    // Origem "crm": o contato existe lá, com o telefone que o CRM tem. Nada a
    // resolver.
    if (c.origem === "crm") {
      prontos.push({
        contactId: c.id,
        conversationId: c.conversationId,
        name: c.name,
        phone: c.phone,
      });
      continue;
    }
    // Sem telefone não há como criar contato no CRM, e a fila exige um id.
    if (!c.phone) {
      foraDoDisparo.push({
        nome: c.name,
        motivo: "não tem telefone cadastrado — não dá para disparar.",
      });
      continue;
    }
    if (!c.patientId) {
      foraDoDisparo.push({ nome: c.name, motivo: "não está vinculado a nenhum paciente." });
      continue;
    }
    aVincular.push({
      patientId: c.patientId,
      name: c.name,
      phone: c.phone,
      conversationId: c.conversationId,
    });
  }

  return { prontos, aVincular, foraDoDisparo, duplicadosIgnorados };
}
