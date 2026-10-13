// O robô que lê o grupo do financeiro e lança despesa.
//
// ── Onde ele se encaixa ─────────────────────────────────────────────────
//
// Irmão de `agente-no-webhook.ts`: os dois são chamados pelo `wa-webhook`
// depois que a mensagem já está gravada, e nos dois nada pode subir. A Luna
// atende paciente e ignora grupo; este faz o contrário — só olha grupo, e só
// um grupo, o que estiver cadastrado em `financeiro_grupos`.
//
// ── A ordem das perguntas ───────────────────────────────────────────────
//
// De graça para caro, sempre. A primeira pergunta é "este grupo é o do
// financeiro?", que é uma consulta e corta 99% das mensagens do WhatsApp da
// clínica. A última é "o que o modelo acha disto?", que custa dinheiro.
//
// No meio fica a trava de mensagem repetida, e ela vem ANTES do modelo de
// propósito: a Evolution reenvia evento quando o webhook demora, e pagar duas
// vezes pela mesma leitura seria o menor dos problemas — o grande é a despesa
// em dobro.
//
// ── Por que o robô fica calado quando não entende ───────────────────────
//
// Porque o silêncio é a única mensagem que não mente. Se ele responder "não
// entendi" a cada "bom dia", o grupo vira um chat com um robô e as pessoas
// param de ler o que ele escreve — inclusive o recado que importa, que é o
// comprovante do lançamento. Calado significa: nada foi gravado.

import { anotarConsumo } from "./consumo-da-ia.ts";
import { agoraNaClinica } from "./agenda-da-clinica.ts";
import { chamarModelo } from "./modelo-de-atendimento.ts";
import { enviarWhatsapp } from "./whatsapp-send.ts";
import { evolutionFetch, conexaoParaEnviar } from "./evolution-api.ts";
import type { MensagemEspelhada } from "./evolution-mapear.ts";
import { desfazerLancamento, lancarNoFinanceiro } from "./lancar-no-financeiro.ts";
import {
  catalogoDeCategorias,
  catalogoDeContas,
  completarGasto,
  comoLerOGasto,
  ehCancelamento,
  ehConfirmacao,
  gastoLido,
  pareceGasto,
  recadoDoLancamento,
  recadoDoQueFalta,
  recadoParaConferir,
  type ContaComCodigo,
  type GastoConferido,
} from "./gasto-da-conversa.ts";

/**
 * Os começos de mensagem que são do próprio robô.
 *
 * Num grupo, o número da clínica é um participante como outro qualquer: quando
 * a Dra. Mariane escreve pelo aparelho da clínica, a mensagem chega marcada
 * como `fromMe` igual às do robô. Então ignorar todo `fromMe` calaria ela, e
 * não ignorar nada faria o robô ler o próprio recado — que tem valor e data, e
 * portanto parece um gasto — e lançar a mesma despesa de novo.
 *
 * A marca no texto resolve os dois. É a mesma rede que `ehEcoDaPropriaIa` usa
 * para a Luna, e erra do lado seguro: no pior caso alguém cola o texto do robô
 * no grupo e aquilo é ignorado.
 */
const MARCAS_DO_ROBO = [
  "✅ Lançado:",
  "📄 Li o comprovante:",
  "Só conferindo,",
  "Anotei ",
  "🗑️",
  "⚠️",
];

function ehRecadoDoRobo(texto: unknown): boolean {
  const t = String(texto ?? "").trimStart();
  return MARCAS_DO_ROBO.some((m) => t.startsWith(m));
}

/** O grupo cadastrado, quando esta conversa é um deles. */
interface GrupoDoFinanceiro {
  id: string;
  unitId: string;
}

async function grupoCadastrado(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  ownerId: string,
  jid: string,
): Promise<GrupoDoFinanceiro | null> {
  if (!jid.includes("@g.us")) return null;
  try {
    const { data } = await supabase
      .from("financeiro_grupos")
      .select("id, unit_id")
      .eq("owner_id", ownerId)
      .eq("group_jid", jid)
      .eq("ativo", true)
      .maybeSingle();
    return data?.id ? { id: String(data.id), unitId: String(data.unit_id) } : null;
  } catch {
    // Tabela ainda não existe (migration pendente) ou o banco recusou. Em
    // qualquer dos casos: nenhum grupo é do financeiro, e o robô não age. Essa
    // é a falha segura — a outra ponta seria lançar despesa sem saber a
    // unidade.
    return null;
  }
}

/**
 * Reserva a mensagem para este processamento, ou descobre que ela já foi.
 *
 * O índice único de `wa_message_id` é quem decide, e é de banco justamente
 * porque dois eventos da Evolution podem chegar ao mesmo tempo: um "já existe?"
 * feito antes do insert tem uma fresta entre a pergunta e a resposta, e a
 * despesa em dobro nasce nessa fresta.
 *
 * Devolve o id da reserva, ou `null` quando outra execução já pegou esta
 * mensagem.
 */
async function reservarMensagem(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  ownerId: string,
  jid: string,
  messageId: string,
  quem: string | null,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("financeiro_do_grupo")
    .insert({
      owner_id: ownerId,
      group_jid: jid,
      wa_message_id: messageId,
      quem,
      estado: "ignorado",
    })
    .select("id")
    .maybeSingle();
  if (error) return null;
  return data?.id ? String(data.id) : null;
}

// deno-lint-ignore no-explicit-any
async function anotar(supabase: any, id: string, campos: Record<string, unknown>) {
  await supabase
    .from("financeiro_do_grupo")
    .update({ ...campos, updated_at: new Date().toISOString() })
    .eq("id", id);
}

/** O último lançamento do grupo num certo estado, dentro de uma janela. */
async function ultimoDoGrupo(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  ownerId: string,
  jid: string,
  estado: string,
  minutos: number,
  // deno-lint-ignore no-explicit-any
): Promise<any | null> {
  const desde = new Date(Date.now() - minutos * 60_000).toISOString();
  const { data } = await supabase
    .from("financeiro_do_grupo")
    .select("id, estado, proposta, transaction_id")
    .eq("owner_id", ownerId)
    .eq("group_jid", jid)
    .eq("estado", estado)
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(1);
  return (data ?? [])[0] ?? null;
}

/** Responde no grupo. O jid de grupo já é aceito por `destinoDaMensagem`. */
async function falarNoGrupo(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  ownerId: string,
  jid: string,
  texto: string,
): Promise<void> {
  try {
    await enviarWhatsapp(supabase, ownerId, { conversation_id: jid, phone: jid }, texto);
  } catch (e) {
    // A despesa já está gravada; o recado é o comprovante. Falhar aqui é ruim
    // — ninguém fica sabendo — mas levantar seria pior: o webhook devolveria
    // erro, a Evolution reenviaria, e a trava de mensagem única é o que
    // impediria a segunda despesa. Melhor falhar com motivo no log.
    console.error("[robo-financeiro] não deu para responder no grupo:", e);
  }
}

/**
 * Baixa a foto já decifrada.
 *
 * A URL que vem no evento aponta para o arquivo CRIPTOGRAFADO do WhatsApp —
 * baixá-la direto devolve bytes embaralhados. Quem sabe decifrar é a própria
 * Evolution, pela rota `getBase64FromMediaMessage`, que recebe o id da
 * mensagem e devolve o base64 limpo.
 *
 * Devolve `null` em qualquer tropeço. Foto que não desce não vira silêncio: o
 * chamador avisa no grupo, porque alguém mandou um comprovante e está
 * esperando.
 */
async function baixarAFoto(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  ownerId: string,
  messageId: string,
): Promise<{ base64: string; mimetype: string } | null> {
  try {
    const { instancia } = await conexaoParaEnviar(supabase, ownerId);
    if (!instancia) return null;
    const r = await evolutionFetch(
      `/chat/getBase64FromMediaMessage/${encodeURIComponent(instancia)}`,
      { method: "POST", body: JSON.stringify({ message: { key: { id: messageId } } }) },
      30_000,
    );
    const base64 = String(r?.base64 ?? "").trim();
    if (!base64) return null;
    return { base64, mimetype: String(r?.mimetype ?? "image/jpeg") };
  } catch (e) {
    console.error("[robo-financeiro] não deu para baixar a foto:", e);
    return null;
  }
}

/**
 * Lê a mensagem (e a foto, quando há) e devolve o que o modelo entendeu.
 *
 * O catálogo de categorias é montado AQUI e passado para `gastoLido` depois:
 * é a mesma lista que entrou na instrução que confere o código que voltou.
 * Montar duas vezes abriria a chance de a segunda ter outra ordem, e aí `G3`
 * no texto e `G3` na conferência seriam categorias diferentes — o jeito mais
 * silencioso de gravar a despesa na categoria errada.
 */
async function lerAMensagem(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  ownerId: string,
  texto: string,
  foto: { base64: string; mimetype: string } | null,
): Promise<{ gasto: GastoConferido | null; motivo: string; contas: ContaComCodigo[] }> {
  const { data: agente } = await supabase
    .from("ai_agents")
    .select("api_key, model")
    .eq("owner_id", ownerId)
    .maybeSingle();

  const { data: cats } = await supabase
    .from("financial_categories")
    .select("id, name")
    .eq("owner_id", ownerId)
    .eq("type", "expense")
    .order("name");

  const catalogo = catalogoDeCategorias(
    // deno-lint-ignore no-explicit-any
    ((cats ?? []) as any[]).map((c) => ({ id: String(c.id), nome: String(c.name ?? "") })),
  );

  // As contas da clínica, de onde o dinheiro sai. Sem esta lista o modelo não
  // teria código nenhum para devolver e TODA despesa ficaria esperando
  // resposta — o robô viraria um questionário.
  const { data: accs } = await supabase
    .from("financial_accounts")
    .select("id, name")
    .eq("owner_id", ownerId)
    .order("name");
  const contas = catalogoDeContas(
    // deno-lint-ignore no-explicit-any
    ((accs ?? []) as any[]).map((c) => ({ id: String(c.id), nome: String(c.name ?? "") })),
  );

  const hoje = agoraNaClinica().date;
  const pergunta = foto
    ? `Mensagem do grupo: "${texto || "(sem legenda)"}"\n\nA imagem é o comprovante. Leia o valor nela.`
    : `Mensagem do grupo: "${texto}"`;

  const bruto = await chamarModelo({
    chave: agente?.api_key ?? null,
    modelo: agente?.model ?? null,
    instrucao: comoLerOGasto(catalogo, contas, hoje),
    pergunta,
    imagem: foto,
    maxTokens: 500,
    anotarUso: (uso) => void anotarConsumo(supabase, ownerId, "financeiro-do-grupo", uso),
  });

  let json: unknown = null;
  try {
    // O modelo às vezes embrulha em ```json. Pegar do primeiro { ao último } é
    // o que sobrevive aos dois formatos sem precisar adivinhar qual veio.
    const t = String(bruto ?? "");
    const de = t.indexOf("{");
    const ate = t.lastIndexOf("}");
    json = de >= 0 && ate > de ? JSON.parse(t.slice(de, ate + 1)) : null;
  } catch {
    json = null;
  }

  const leitura = gastoLido(json as never, catalogo, contas, hoje);
  return leitura.ok
    ? { gasto: leitura.gasto, motivo: "lido", contas }
    : { gasto: null, motivo: leitura.motivo, contas };
}

/**
 * O robô olha uma mensagem do grupo e decide o que fazer.
 *
 * Nada aqui levanta: a mensagem já está no espelho, e uma falha do robô não
 * pode fazer a Evolution reenviar o evento — reenvio é justamente o caminho da
 * despesa duplicada.
 */
export async function deixarORoboRegistrar(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  ownerId: string,
  m: MensagemEspelhada,
  // deno-lint-ignore no-explicit-any
  evento?: any,
): Promise<void> {
  try {
    const jid = String(m.crmConversationId ?? "");
    const grupo = await grupoCadastrado(supabase, ownerId, jid);
    if (!grupo) return;

    const texto = String(m.body ?? "").trim();
    // O próprio recado do robô voltando. Tem valor e data; sem esta linha ele
    // leria a si mesmo e lançaria a despesa de novo.
    if (m.fromMe && ehRecadoDoRobo(texto)) return;

    const temImagem = Boolean(m.anexo?.tipo === "image");
    const quem = String(evento?.pushName ?? "").trim() || null;

    // A reserva vem antes de qualquer trabalho caro, e é ela que garante que
    // uma mensagem reenviada não vire uma segunda despesa.
    const reserva = await reservarMensagem(supabase, ownerId, jid, m.crmMessageId, quem);
    if (!reserva) {
      console.log(`[robo-financeiro] mensagem ${m.crmMessageId} já tratada`);
      return;
    }

    // ── "sim" ────────────────────────────────────────────────────────────
    if (ehConfirmacao(texto)) {
      const pendente = await ultimoDoGrupo(supabase, ownerId, jid, "pendente", 60);
      if (!pendente) return;
      const gasto = pendente.proposta as GastoConferido;
      const r = await lancarNoFinanceiro(supabase, ownerId, grupo.unitId, gasto, {
        quem,
        mensagem: texto,
      });
      if (!r.ok) {
        await anotar(supabase, pendente.id, { estado: "cancelado" });
        await falarNoGrupo(supabase, ownerId, jid, `⚠️ Não consegui lançar: ${r.motivo}`);
        return;
      }
      await anotar(supabase, pendente.id, { estado: "lancado", transaction_id: r.transactionId });
      await anotar(supabase, reserva, { estado: "ignorado" });
      await falarNoGrupo(supabase, ownerId, jid, recadoDoLancamento(gasto));
      return;
    }

    // ── "apaga" ──────────────────────────────────────────────────────────
    if (ehCancelamento(texto)) {
      // Procura o que foi lançado antes do que está pendente: quem escreve
      // "apaga" quase sempre está olhando o ✅ que acabou de chegar.
      const lancado = await ultimoDoGrupo(supabase, ownerId, jid, "lancado", 24 * 60);
      if (lancado?.transaction_id) {
        const foi = await desfazerLancamento(supabase, ownerId, String(lancado.transaction_id));
        await anotar(supabase, lancado.id, { estado: foi ? "cancelado" : "lancado" });
        await falarNoGrupo(
          supabase,
          ownerId,
          jid,
          foi
            ? "🗑️ Apaguei o último lançamento."
            : "⚠️ Não consegui apagar. Dá para remover em Pagamentos.",
        );
        return;
      }
      const pendente = await ultimoDoGrupo(supabase, ownerId, jid, "pendente", 60);
      if (pendente) {
        await anotar(supabase, pendente.id, { estado: "cancelado" });
        await falarNoGrupo(supabase, ownerId, jid, "🗑️ Esqueci esse. Nada foi lançado.");
      }
      return;
    }

    // ── O resto ──────────────────────────────────────────────────────────
    //
    // Pode ser gasto novo, ou pode ser a resposta à pergunta que o robô fez
    // ("de qual conta saiu?"). A diferença decide tudo: relendo uma resposta
    // curta como gasto novo, o modelo inventaria valor e data.
    const esperando = await ultimoDoGrupo(supabase, ownerId, jid, "pendente", 60);
    const completando = Boolean(
      esperando?.proposta && (esperando.proposta as GastoConferido).faltando?.length,
    );

    if (!pareceGasto(texto, temImagem) && !completando) return;

    const foto = temImagem ? await baixarAFoto(supabase, ownerId, m.crmMessageId) : null;
    if (temImagem && !foto) {
      // Alguém mandou um comprovante e está esperando. Ficar calado aqui
      // pareceria "ele não viu", e a pessoa não lançaria à mão.
      await falarNoGrupo(
        supabase,
        ownerId,
        jid,
        "⚠️ Não consegui abrir essa imagem. Me escreve o valor que eu lanço.",
      );
      return;
    }

    let gasto: GastoConferido | null = null;
    let contas: ContaComCodigo[] = [];
    try {
      const r = await lerAMensagem(supabase, ownerId, texto, foto);
      contas = r.contas;
      gasto = r.gasto;

      if (completando) {
        // A resposta curta só contribui com o que faltava. Valor, data e
        // descrição continuam sendo os da mensagem original — ver
        // `completarGasto`.
        const guardado = esperando.proposta as GastoConferido;
        const junto = completarGasto(guardado, gasto);
        await anotar(supabase, reserva, { estado: "ignorado" });
        if (junto.faltando.length) {
          await anotar(supabase, esperando.id, { proposta: junto });
          await falarNoGrupo(supabase, ownerId, jid, recadoDoQueFalta(junto, contas));
          return;
        }
        const feito = await lancarNoFinanceiro(supabase, ownerId, grupo.unitId, junto, {
          quem,
          mensagem: texto,
        });
        if (!feito.ok) {
          await falarNoGrupo(supabase, ownerId, jid, `⚠️ Não consegui lançar: ${feito.motivo}`);
          return;
        }
        await anotar(supabase, esperando.id, {
          estado: "lancado",
          proposta: junto,
          transaction_id: feito.transactionId,
        });
        await falarNoGrupo(supabase, ownerId, jid, recadoDoLancamento(junto));
        return;
      }

      if (!gasto) {
        await anotar(supabase, reserva, { estado: "ignorado", proposta: { motivo: r.motivo } });
        return;
      }
    } catch (e) {
      const recado = e instanceof Error ? e.message : String(e);
      console.error("[robo-financeiro] falhou ao ler:", recado);
      // Erro de configuração — chave, modelo, modelo sem visão — é consertável
      // por uma pessoa, e some se o robô ficar calado. Com foto a pessoa está
      // esperando; sem foto, calar é o certo, porque a maioria das mensagens
      // não era gasto nenhum.
      if (foto) {
        await falarNoGrupo(supabase, ownerId, jid, `⚠️ Não consegui ler o comprovante: ${recado}`);
      }
      return;
    }

    // Faltou conta ou forma de pagamento: o robô pergunta em vez de chutar.
    // Sem conta a despesa não saiu de lugar nenhum e o saldo mente; sem forma
    // não há como calcular a taxa da maquininha depois. Vem ANTES da
    // conferência porque não adianta perguntar "está correto?" sobre algo
    // incompleto.
    if (gasto.faltando.length) {
      await anotar(supabase, reserva, { estado: "pendente", proposta: gasto });
      await falarNoGrupo(supabase, ownerId, jid, recadoDoQueFalta(gasto, contas));
      return;
    }

    // Foto sempre pergunta: quem leu foi a máquina, e ninguém conferiu o
    // número. Valor alto também: um zero a mais passa despercebido o mês
    // inteiro. Nos dois casos a proposta fica guardada esperando um "sim".
    if (foto || gasto.precisaConferir) {
      await anotar(supabase, reserva, { estado: "pendente", proposta: gasto });
      await falarNoGrupo(supabase, ownerId, jid, recadoParaConferir(gasto, Boolean(foto)));
      return;
    }

    const r = await lancarNoFinanceiro(supabase, ownerId, grupo.unitId, gasto, {
      quem,
      mensagem: texto,
    });
    if (!r.ok) {
      await falarNoGrupo(supabase, ownerId, jid, `⚠️ Não consegui lançar: ${r.motivo}`);
      return;
    }
    await anotar(supabase, reserva, {
      estado: "lancado",
      proposta: gasto,
      transaction_id: r.transactionId,
    });
    await falarNoGrupo(supabase, ownerId, jid, recadoDoLancamento(gasto));
  } catch (e) {
    console.error("[robo-financeiro] falhou:", e instanceof Error ? e.message : e);
  }
}
