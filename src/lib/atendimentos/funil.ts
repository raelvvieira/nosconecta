// De quem é cada card do funil.
//
// ── O que mudou, e por quê ───────────────────────────────────────────────
//
// No CRM o card apontava para UMA conversa. Mas uma pessoa tem várias — é por
// isso que a caixa de entrada abandonou a separação por conversa e passou a
// unir tudo pelo número. O card não tinha acompanhado: a pessoa escrevia de
// novo por outro caminho, abria outra thread, e o funil dizia que ela não
// estava em etapa nenhuma. Quem atende via o card sumir sem nada ter mudado.
//
// Agora a identidade é o telefone. Quem não tem número — grupo, ou os contatos
// que o WhatsApp identifica só por lid — continua preso à conversa, porque é o
// único identificador que existe para eles.
//
// ── Por que isto é um arquivo sozinho ────────────────────────────────────
//
// Errar aqui não dá erro: o card fica órfão na tela ou, pior, gruda na pessoa
// errada — e aí o "Ganho" de alguém entra na negociação de outro. A conta é
// pura para poder ser exercitada por inteiro em `tests/funil.ts`.
import { normalizeBrazilianPhone } from "./phone";

/** O que se sabe de uma pessoa na hora de procurar o card dela. */
export interface PessoaDoFunil {
  /** Id da conversa aberta, quando há uma. */
  conversaId?: string | null;
  telefone?: string | null;
}

/** O card, no mínimo que o casamento precisa enxergar. */
export interface CardDoFunil {
  id: string;
  /** "pessoa" → `itemId` é o telefone. "conversa" → `itemId` é o id da conversa. */
  type: "pessoa" | "conversa";
  itemId: string;
  stageId: string;
  title: string | null;
}

/**
 * A chave de um telefone, ou `null` quando não dá para afirmar que é um.
 *
 * A normalização é por COMPRIMENTO (`normalizeBrazilianPhone`), então
 * "51993351821" e "5551993351821" são a mesma pessoa — é a mesma regra que a
 * caixa de entrada usa para juntar conversas, e usar outra aqui faria o card
 * deixar de casar justamente nos números salvos sem o código do país.
 */
export function chaveDoTelefone(telefone: string | null | undefined): string | null {
  if (!telefone?.trim()) return null;
  const digitos = normalizeBrazilianPhone(telefone);
  // Menos que 55 + DDD + 8 não é telefone. Aceitar qualquer coisa faria dois
  // fragmentos diferentes virarem a mesma chave.
  return digitos.length >= 12 ? digitos : null;
}

/**
 * A chave sob a qual o card desta pessoa é guardado.
 *
 * Telefone primeiro, conversa como reserva. `null` quando não há nem um nem
 * outro — e aí não há card a criar, porque não haveria como reencontrá-lo.
 */
export function chaveDaPessoa(
  pessoa: PessoaDoFunil,
): { type: "pessoa" | "conversa"; itemId: string } | null {
  const telefone = chaveDoTelefone(pessoa.telefone);
  if (telefone) return { type: "pessoa", itemId: telefone };
  const conversa = pessoa.conversaId?.trim();
  if (conversa) return { type: "conversa", itemId: conversa };
  return null;
}

/**
 * O card desta pessoa, entre todos os do funil.
 *
 * Procura pelas DUAS chaves, e não só pela preferida: a pessoa pode ter
 * entrado no funil quando ainda não se sabia o número dela (card de conversa) e
 * ganhado telefone depois. Achar só pela chave nova faria o card antigo
 * desaparecer da tela sem ter sido apagado.
 */
export function cardDaPessoa<T extends CardDoFunil>(cards: T[], pessoa: PessoaDoFunil): T | null {
  const telefone = chaveDoTelefone(pessoa.telefone);
  const conversa = pessoa.conversaId?.trim() || null;

  if (telefone) {
    const porTelefone = cards.find((c) => c.type === "pessoa" && c.itemId === telefone);
    if (porTelefone) return porTelefone;
  }
  if (conversa) {
    const porConversa = cards.find((c) => c.type === "conversa" && c.itemId === conversa);
    if (porConversa) return porConversa;
  }
  return null;
}
