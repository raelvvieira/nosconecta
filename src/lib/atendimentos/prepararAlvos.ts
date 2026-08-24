import type { ContatoSelecionado } from "@/components/atendimentos/contacts/ContactsTab";

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
}

export function classificarSelecao(contatos: ContatoSelecionado[]): SelecaoClassificada {
  const prontos: AlvoPronto[] = [];
  const aVincular: AlvoAVincular[] = [];
  const foraDoDisparo: { nome: string; motivo: string }[] = [];

  for (const c of contatos) {
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

  return { prontos, aVincular, foraDoDisparo };
}
