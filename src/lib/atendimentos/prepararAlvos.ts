import type { BroadcastAlvo } from "@/lib/atendimentos/broadcast.functions";
import type { ContatoSelecionado } from "@/components/atendimentos/contacts/ContactsTab";

// Transformar contato escolhido em alvo de disparo.
//
// Parece mecânico e não é: contato de origem `"paciente"` **ainda não existe no
// CRM**. Ele foi cadastrado aqui e nunca teve conversa, então não tem
// `contact_id` — e a fila de disparo exige um. Sem passar por
// `garantirContatoCrm` antes, o alvo entra na fila e nunca é alcançado.
//
// Isto vivia inline dentro da mutation de NewCampaignSheet. Saiu de lá quando o
// Pipeline passou a disparar por coluna: duas cópias desta regra significariam
// dois caminhos divergindo, e a divergência aqui é um disparo que falha calado.

export interface AlvosPreparados {
  alvos: BroadcastAlvo[];
  /** Quem não pôde entrar, com o motivo — para a tela dizer em vez de sumir. */
  foraDoDisparo: { nome: string; motivo: string }[];
}

type GarantirContato = (args: {
  data: { patientId: string; name: string; phone: string };
}) => Promise<{ contactId: string | null }>;

/**
 * @param tolerante quando `true`, quem não pode receber é SEPARADO em vez de
 *   derrubar tudo. É o modo do disparo por coluna, onde a lista não foi
 *   escolhida uma a uma e um paciente sem telefone não pode impedir o envio
 *   para os outros catorze. A criação manual de campanha continua exigente: lá
 *   a pessoa escolheu cada contato, e falhar em silêncio seria pior.
 */
export async function prepararAlvos(
  contatos: ContatoSelecionado[],
  garantirContato: GarantirContato,
  tolerante = false,
): Promise<AlvosPreparados> {
  const alvos: BroadcastAlvo[] = [];
  const foraDoDisparo: { nome: string; motivo: string }[] = [];

  const recusar = (nome: string, motivo: string) => {
    if (!tolerante) throw new Error(`${nome} ${motivo}`);
    foraDoDisparo.push({ nome, motivo });
  };

  for (const c of contatos) {
    if (c.origem === "crm") {
      alvos.push({
        contactId: c.id,
        conversationId: c.conversationId,
        name: c.name,
        phone: c.phone,
      });
      continue;
    }
    if (!c.phone) {
      recusar(c.name, "não tem telefone cadastrado — não dá para disparar.");
      continue;
    }
    try {
      const { contactId } = await garantirContato({
        data: { patientId: c.patientId!, name: c.name, phone: c.phone },
      });
      if (!contactId) {
        recusar(c.name, "não pôde ser vinculado ao CRM antes de disparar.");
        continue;
      }
      alvos.push({ contactId, conversationId: null, name: c.name, phone: c.phone });
    } catch (e) {
      if (!tolerante) throw e;
      foraDoDisparo.push({ nome: c.name, motivo: "falhou ao vincular ao CRM." });
    }
  }

  return { alvos, foraDoDisparo };
}
