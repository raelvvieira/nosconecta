// Ligar a venda ao anúncio que trouxe a pessoa.
//
// ── O que estava acontecendo ───────────────────────────────────────────
//
// Medido em 01/10: o `Purchase` de R$ 990 do Juliano saiu, a Meta respondeu
// `events_received: 1`, sem erro, e a qualidade de correspondência do conjunto
// é 4,8 com telefone em 100% de cobertura. Ou seja, a Meta recebe e RECONHECE
// a pessoa.
//
// E mesmo assim: zero compras atribuídas em todas as campanhas da conta, desde
// fevereiro. Todos os campos de compra vêm nulos.
//
// ── Por que reconhecer a pessoa não basta ──────────────────────────────
//
// São duas perguntas diferentes:
//
//   O telefone responde **quem comprou**.
//   O identificador do clique responde **qual anúncio trouxe essa pessoa**.
//
// Num site, quem faz o segundo trabalho é o cookie `_fbc`. Numa conversa de
// WhatsApp não existe cookie — o `ctwa_clid` é o equivalente exato, e a Meta o
// lista como campo normal de `user_data`, sem hash.
//
// Sem ele, a Meta fica com "esta pessoa comprou R$ 990" e precisa adivinhar,
// por modelagem, se foi o anúncio. Com ele, a ligação é determinística.
//
// ── O dado já estava aqui ──────────────────────────────────────────────
//
// O `ctwa_clid` viaja DENTRO da mensagem do WhatsApp, não pela API — por isso
// a Evolution o entrega igual. O do Juliano tem 138 caracteres, começa com
// `Afg`, e está guardado em `ai_agent_sessions.anuncio` desde 28/09 às 00:03,
// 54 minutos antes de o agendamento nascer. Ver `veio-de-anuncio.ts`.

/** O que a Meta precisa saber para tratar isto como conversão de conversa. */
export interface ConversaoPorMensagem {
  action_source: "business_messaging";
  messaging_channel: "whatsapp";
}

/**
 * Os campos que transformam o evento numa conversão de mensageria.
 *
 * Precisa das DUAS coisas, e a segunda custou um reenvio para descobrir.
 *
 * ── O que a Meta respondeu ─────────────────────────────────────────────
 *
 * 01/10, reenvio da venda do Juliano já com o clique e com
 * `business_messaging`:
 *
 *   "Seu evento Purchase com a fonte da ação business_messaging do canal
 *    whatsapp não tem page_id nem whatsapp_business_account_id. Um desses
 *    parâmetros é necessário em user_data." (código 100, subcode 2804116)
 *
 * **Um DESSES** — e é a boa notícia da mensagem: `page_id` é a Página do
 * Facebook, que qualquer anunciante tem. A conta de WhatsApp Business da API
 * oficial NÃO é obrigatória, e era exatamente a dúvida que travava este
 * conserto.
 *
 * ── Por que `null` quando falta qualquer um dos dois ───────────────────
 *
 * Sem clique, `business_messaging` seria afirmação falsa sobre a origem.
 *
 * Sem a Página, a Meta RECUSA o evento inteiro — e recusar é pior que mandar
 * sem a marcação, porque aí a conversão SOME em vez de sair cega.
 *
 * Então, faltando um dos dois, o evento volta a sair como saía antes. É a
 * garantia de que esquecer de preencher a Página não derruba as conversões que
 * já funcionavam.
 */
export function camposDeMensageria(
  clickId: string | null | undefined,
  pageId: string | null | undefined,
): ConversaoPorMensagem | null {
  if (!validoComoClickId(clickId)) return null;
  if (!validoComoPageId(pageId)) return null;
  return { action_source: "business_messaging", messaging_channel: "whatsapp" };
}

/** O id da Página é numérico. Checagem frouxa, só para não marcar mensageria
 *  por causa de um campo preenchido com texto colado errado — quem valida o
 *  resto é a Meta, e ela diz o que está errado. */
export function validoComoPageId(valor: string | null | undefined): boolean {
  return /^\d{5,}$/.test(String(valor ?? "").trim());
}

/**
 * Isto parece um `ctwa_clid` de verdade?
 *
 * A Meta valida o valor do lado dela e recusa o que for inventado, então esta
 * checagem não é de segurança — é para não sujar o evento com lixo que veio de
 * uma coluna mal preenchida, e para não marcar `business_messaging` por causa
 * de uma string vazia.
 *
 * O critério é frouxo de propósito (comprimento mínimo e nada de espaço): o
 * formato é da Meta e pode mudar, e uma validação apertada demais passaria a
 * descartar cliques bons no dia em que ela mexesse. Os que vimos têm 138
 * caracteres.
 */
export function validoComoClickId(valor: string | null | undefined): boolean {
  const v = String(valor ?? "").trim();
  return v.length >= 20 && !/\s/.test(v);
}

/**
 * Qual clique vale para uma conversão que aconteceu agora.
 *
 * Recebe os cliques conhecidos da pessoa (pode ter mais de um: ela clicou num
 * anúncio em agosto e noutro em setembro) e devolve o MAIS RECENTE que ainda
 * está dentro da janela.
 *
 * **Por que o mais recente e não o primeiro:** é a mesma regra da Meta para
 * atribuição de clique — o último toque antes da conversão é quem leva o
 * crédito. Mandar o primeiro daria crédito a um anúncio que a pessoa já tinha
 * esquecido.
 *
 * **Por que existe janela:** um clique de seis meses atrás não causou a compra
 * de hoje. A Meta tem a própria janela e descartaria de qualquer jeito, mas
 * mandar assim mesmo marcaria o evento como `business_messaging` — e aí ele
 * sairia da contagem normal sem entrar em contagem nenhuma. Pior que não
 * marcar.
 */
export function cliqueQueVale(
  cliques: { clickId: string | null; quando: string }[],
  agora: Date,
  diasDeJanela = 90,
): string | null {
  const limite = agora.getTime() - diasDeJanela * 86_400_000;

  const validos = (cliques ?? [])
    .filter((c) => validoComoClickId(c.clickId))
    .map((c) => ({ clickId: String(c.clickId).trim(), em: new Date(c.quando).getTime() }))
    .filter((c) => Number.isFinite(c.em) && c.em >= limite && c.em <= agora.getTime());

  if (!validos.length) return null;
  validos.sort((a, b) => b.em - a.em);
  return validos[0].clickId;
}
