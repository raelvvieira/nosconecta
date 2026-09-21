// Para quem a mensagem vai — a decisão, sem nenhuma ida à rede.
//
// ── Por que isto mora sozinho ───────────────────────────────────────────
//
// Esta conta decide se uma pessoa recebe ou não recebe. Ela errando, ninguém
// vê erro nenhum: a automação grava `skipped_no_contact` no log e o paciente
// simplesmente não recebe a confirmação da consulta. Foi exatamente isso que
// aconteceu enquanto o destinatário era resolvido no CRM — e ficou invisível
// porque a decisão estava enterrada no meio de uma função que também fazia
// consultas, chamava outra Edge Function e esperava resposta de fora.
//
// Aqui ela é pura: entra uma ficha, sai um alvo ou `null`. É o que permite
// `tests/alvo-de-envio.ts` exercitar todos os casos sem dublê de servidor.
//
// O tipo `AlvoDeEnvio` mora aqui, e não em `whatsapp-send.ts`, pelo mesmo
// motivo: ele precisa ser visível de um arquivo sem I/O. Quem o consome
// continua importando de `whatsapp-send.ts`, que o reexporta.

/** Para quem a mensagem vai.
 *
 *  Exportado — e não escrito à mão em cada chamador — porque foi exatamente aí
 *  que uma automação silenciosa nasceu: `atendimento-automations` montava o
 *  objeto em camelCase (`contact_id` virava `contactId`), o campo saía
 *  `undefined`, o JSON.stringify descartava e a chamada ia ao CRM sem contato
 *  nenhum. O disparo de campanhas nunca sofreu porque passa a linha de
 *  `whatsapp_broadcast_targets` direto, cujas colunas já têm estes nomes.
 *
 *  As Edge Functions rodam em Deno e ficam fora do `bunx tsc` do projeto, que
 *  cobre só `src/` — então aqui o nome único é a única defesa que existe. */
export interface AlvoDeEnvio {
  conversation_id: string | null;
  /** O contato do CRM, quando existe.
   *
   *  Deixou de ser obrigatório quando o número da clínica saiu do CRM: quem
   *  endereça hoje é o telefone, e exigir um id de contato lá obrigava a
   *  CRIAR um contato no CRM só para poder mandar mensagem pela Evolution —
   *  uma ida à rede que podia falhar, e falhava calada, deixando o paciente
   *  sem o lembrete. Continua aqui porque o caminho do CRM, enquanto existir,
   *  endereça por ele. */
  contact_id?: string | null;
  /** O telefone, quando quem chama já o tem em mãos.
   *
   *  O CRM endereça por id de contato; a Evolution, por número. Passar o
   *  telefone aqui evita uma consulta e, mais importante, evita o caso em que
   *  ela não acha nada — contato que só existe no CRM, sem linha no espelho.
   *  A fila de campanhas já carrega esta coluna. */
  phone?: string | null;
}

/** O que se sabe sobre a pessoa na hora de mandar. */
export interface FichaDoAlvo {
  /** O telefone da ficha do paciente. */
  telefone?: string | null;
  /** O contato do CRM que o evento trouxe — tem precedência sobre o da ficha,
   *  porque é dele que fala a conversa que originou a automação. */
  contatoDoEvento?: string | null;
  /** O contato do CRM gravado na ficha do paciente. */
  contatoDaFicha?: string | null;
}

/**
 * O alvo, ou `null` quando não há para quem mandar.
 *
 * Um dos dois basta:
 *
 * - **Telefone** — a conexão própria entrega direto, e este é o caminho de
 *   quase todo mundo: são 1.156 pacientes com telefone e sem contato no CRM.
 * - **Contato do CRM** — sem telefone na ficha, o `destinoDoAlvo` ainda
 *   procura o número no espelho do WhatsApp e nos pacientes.
 *
 * Sem nenhum dos dois não há endereço nenhum, e devolver `null` aqui é o que
 * faz a automação registrar "sem contato" em vez de tentar mandar para lugar
 * nenhum.
 *
 * Telefone em branco ou só espaços não é telefone: gravá-lo no alvo faria o
 * envio acreditar que tem endereço e pular os degraus que achariam o número
 * de verdade.
 */
export function montarAlvo(ficha: FichaDoAlvo): AlvoDeEnvio | null {
  const telefone = ficha.telefone?.trim() || null;
  const contato = ficha.contatoDoEvento?.trim() || ficha.contatoDaFicha?.trim() || null;
  if (!telefone && !contato) return null;
  return { contact_id: contato, conversation_id: null, phone: telefone };
}
