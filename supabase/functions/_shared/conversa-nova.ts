// "Esta pessoa chegou agora?" — a pergunta que decide se a IA pode atender.
//
// ── O que se quer dizer com "nova" ──────────────────────────────────────
//
// O caso é o contato que veio do anúncio: escreveu pela primeira vez, ninguém
// da clínica conhece, e responder rápido é o que evita perdê-lo. O oposto é o
// lead de três meses atrás, que já trocou mensagem com a recepção e tem
// combinado que a IA não sabe — esse não é contato novo, é lead esquecido, e
// quem fala com ele é gente.
//
// ── A definição que NÃO funciona ────────────────────────────────────────
//
// A tentação é "nunca houve mensagem da clínica nesta conversa". Soa mais
// rigoroso e está errada por dois motivos, os dois medidos nesta base:
//
//   A resposta da própria IA é gravada com `from_me = true`. Na segunda
//   mensagem do lead o critério inverte, e o agente abandonaria a conversa
//   depois de uma frase — o pior comportamento possível, porque é pior que
//   nunca ter respondido.
//
//   Das 63 conversas não-paciente nascidas nos últimos 7 dias, só 7 não têm
//   nenhuma mensagem da clínica. O agente ficaria indistinguível de um agente
//   quebrado.
//
// Fica a idade da conversa: estável do começo ao fim, uma consulta indexada, e
// honesta sobre o que afirma — "chegou há pouco", não "ninguém falou com ela".

/**
 * A conversa nasceu dentro da janela?
 *
 * Pura: é isto que o teste exerce. `primeiraEm` nulo quer dizer que não há
 * mensagem nenhuma registrada — conversa que está nascendo agora, e a resposta
 * é sim.
 */
export function ehConversaNova(
  primeiraEm: string | null,
  agora: Date,
  janelaEmDias: number,
): boolean {
  if (!primeiraEm) return true;

  const nascimento = new Date(primeiraEm);
  // Data ilegível não pode virar "nova" por acidente: seria o agente entrando
  // numa conversa antiga por causa de um campo corrompido.
  if (Number.isNaN(nascimento.getTime())) return false;

  const dias = (agora.getTime() - nascimento.getTime()) / 86_400_000;

  // Data no futuro (relógio torto na origem) conta como nova: a conversa
  // certamente não é velha.
  if (dias < 0) return true;

  return dias < janelaEmDias;
}

/**
 * A conversa continua sendo da IA, mesmo já tendo passado da janela?
 *
 * ── As duas perguntas que `so_para_conversa_nova` estava confundindo ────
 *
 * Uma: **a IA pode ENTRAR nesta conversa?** Essa é a regra de cima, e é
 * conservadora de propósito — contato que chegou agora, que ninguém da clínica
 * conhece. Lead de três meses atrás não é contato novo, e quem fala com ele é
 * gente. A clínica decidiu assim, e isso não muda.
 *
 * Outra: **a IA pode CONTINUAR numa conversa que já é dela?** Essa não tem
 * nada a ver com a idade da conversa. Se a Luna abriu o atendimento no dia 1 e
 * a pessoa foi respondendo no 3, no 6, no 9 e no 12, no dia 12 a conversa tem
 * doze dias — e a regra da janela de sete a calaria no meio de um fechamento
 * que estava andando.
 *
 * Uma regra só respondendo as duas é o defeito. Esta função responde a segunda,
 * e ela mede SILÊNCIO, não idade: a conversa segue da IA enquanto a pessoa
 * continuar voltando dentro da janela. Sumiu por mais que isso e voltou? Então
 * é contato novo de novo, e vale a regra de entrar.
 *
 * ── Honestidade sobre o que isto conserta hoje ──────────────────────────
 *
 * Nenhuma das 52 conversas que o motivo "conversa antiga" barrou entre 28/09 e
 * 15/10 tinha a Luna dentro — em todas as 52 ela nunca havia falado. Então isto
 * não desbloqueia nada que já tenha acontecido. Fecha a porta antes do motor de
 * recuperação da V4, que é o que vai fazer a Luna sustentar conversa por dias —
 * e aí a janela de sete dias cortaria justamente quem está negociando. Em 23
 * daquelas 52 a pessoa voltou à mesma conversa depois de mais de sete dias, e é
 * esse o desenho do problema.
 */
export function aConversaAindaEDaIa(
  fatos: {
    /** A IA já respondeu nesta conversa. Sem isso não há o que continuar. */
    iaJaFalou: boolean;
    /** Dias entre a mensagem que acabou de chegar e a anterior DA PESSOA.
     *  `null` quando não há anterior — primeira mensagem dela. */
    silencioEmDias: number | null;
  },
  janelaEmDias: number,
): boolean {
  if (!fatos.iaJaFalou) return false;
  // Sem mensagem anterior a pessoa está chegando agora, e aí quem responde é a
  // regra de entrar — que já diz "sim". Devolver `true` aqui não mudaria nada e
  // esconderia o caso.
  if (fatos.silencioEmDias === null) return false;
  if (!Number.isFinite(fatos.silencioEmDias)) return false;
  // Relógio torto na origem pode dar silêncio negativo. Negativo é zero: a
  // pessoa certamente não ficou calada.
  const silencio = Math.max(0, fatos.silencioEmDias);
  return silencio < janelaEmDias;
}

/** O ritmo com que esta pessoa fala com a clínica. Os dois fatos que as duas
 *  perguntas acima precisam, lidos de uma vez. */
export interface RitmoDoContato {
  /** Quando a PESSOA falou pela primeira vez, somando as conversas irmãs.
   *  `null` = não há mensagem nenhuma registrada. */
  primeiraEm: string | null;
  /** Dias entre a mensagem que acabou de chegar e a anterior dela. `null`
   *  quando não há anterior, ou quando a conta não pôde ser feita. */
  silencioEmDias: number | null;
}

/**
 * Quando a PESSOA falou pela primeira vez, e quanto tempo ficou calada antes
 * desta mensagem — não a idade da conversa.
 *
 * A diferença importa. Pela Evolution o id da conversa é o número, mas há
 * 1.090 conversas herdadas do CRM com ids próprios: quem escreveu em 2024 pelo
 * CRM e voltou agora abre uma conversa "nascida hoje", e o agente trataria um
 * lead antigo como contato novo.
 *
 * A view `wa_conversas_por_pessoa` já resolve essa união pela coluna `pessoa`
 * — é a mesma ponte que a thread do chat usa para achar as conversas irmãs de
 * um número. Uma consulta a mais, irrisória ao lado de uma chamada de modelo.
 *
 * O silêncio sai da mesma união, e é o que permite a IA continuar numa conversa
 * que já é dela depois de a janela passar. Ver `aConversaAindaEDaIa`.
 */
export async function ritmoDoContato(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  ownerId: string,
  conversationId: string,
): Promise<RitmoDoContato> {
  const { data: minha } = await supabase
    .from("wa_conversas_por_pessoa")
    .select("pessoa")
    .eq("owner_id", ownerId)
    .eq("crm_conversation_id", conversationId)
    .maybeSingle();

  const pessoa = String(minha?.pessoa ?? "");

  // Sem `pessoa` não dá para unir: cai na conversa sozinha, que é o pior caso
  // e ainda assim é melhor que desistir da checagem.
  let ids = [conversationId];
  if (pessoa) {
    const { data: irmas } = await supabase
      .from("wa_conversas_por_pessoa")
      .select("crm_conversation_id")
      .eq("owner_id", ownerId)
      .eq("pessoa", pessoa)
      .limit(20);
    const achadas = (irmas ?? [])
      .map((c: { crm_conversation_id?: string | null }) => String(c.crm_conversation_id ?? ""))
      .filter(Boolean);
    if (achadas.length) ids = achadas;
  }

  // As duas leituras, em paralelo: a primeira mensagem de todas (a idade) e as
  // duas últimas DA PESSOA (o silêncio entre a que chegou agora e a anterior).
  // São duas perguntas diferentes sobre a mesma conversa — ver
  // `aConversaAindaEDaIa` — e nenhum recorte único responde as duas.
  const [primeira, ultimas] = await Promise.all([
    supabase
      .from("wa_messages")
      .select("sent_at")
      .eq("owner_id", ownerId)
      .in("crm_conversation_id", ids)
      .order("sent_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    // Só o que a PESSOA mandou. Mensagem da clínica no meio não mantém a
    // conversa viva: a recepção cobrando um lead que não responde há um mês não
    // transforma esse lead em alguém que está falando com a gente agora.
    supabase
      .from("wa_messages")
      .select("sent_at")
      .eq("owner_id", ownerId)
      .in("crm_conversation_id", ids)
      .eq("from_me", false)
      .order("sent_at", { ascending: false })
      .limit(2),
  ]);

  // Erro de leitura NÃO pode virar "não tem mensagem" — isso diria "conversa
  // nova" e soltaria o agente justamente quando o banco está instável. Uma
  // data antiga fecha a porta, que é o lado seguro de errar. Pelo mesmo motivo
  // o silêncio volta `null`: sem saber, a conversa não "continua" sendo da IA.
  if (primeira.error) {
    console.warn(`[conversa-nova] não deu para ler ${conversationId}:`, primeira.error.message);
    return { primeiraEm: new Date(0).toISOString(), silencioEmDias: null };
  }

  return {
    primeiraEm: primeira.data?.sent_at ? String(primeira.data.sent_at) : null,
    silencioEmDias: silencioEntre(ultimas.error ? [] : (ultimas.data ?? [])),
  };
}

/**
 * Dias entre a última mensagem da pessoa e a anterior.
 *
 * `null` sempre que a conta não pode ser feita — uma mensagem só, data
 * ilegível, leitura que falhou. É o lado seguro: `null` faz
 * `aConversaAindaEDaIa` devolver `false`, e aí quem decide é a regra de entrar.
 */
function silencioEntre(linhas: { sent_at?: string | null }[]): number | null {
  const datas = linhas
    .map((l) => new Date(String(l?.sent_at ?? "")).getTime())
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => b - a);
  if (datas.length < 2) return null;
  return (datas[0] - datas[1]) / 86_400_000;
}
