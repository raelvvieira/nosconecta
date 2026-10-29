// O Olho de Deus rodando: uma semana lida, um relatório escrito.
//
// ── O que roda aqui ─────────────────────────────────────────────────────
//
// Toda segunda de manhã: pega os sete dias anteriores, CONTA tudo (conversas,
// silêncios com motivo, preços contra horários, lições, anúncios, consultas),
// entrega os números prontos ao modelo e guarda o relatório que ele escreve.
// Opcionalmente, numa segunda chamada, busca boas práticas na internet.
//
// ── Por que uma função só para isso ─────────────────────────────────────
//
// Mesma razão de `agente-licoes`: um cron não tem dono, varre todas as
// clínicas, e `ai-playbook` exige `ownerId` porque quem a chama é alguém
// logado. Enfiar isto lá obrigaria a cravar um `ownerId` no agendamento do
// cron — a constante que fica errada no dia em que entrar a segunda clínica.
//
// Mas ela ACEITA um `ownerId` no corpo, e é assim que o botão "gerar agora" da
// tela funciona: a mesma função, a mesma conta, um dono só.
//
// ── O que NÃO acontece aqui ─────────────────────────────────────────────
//
// Nenhuma mensagem é enviada, nenhum manual é sobrescrito, nenhuma
// configuração muda. O relatório é texto para uma pessoa decidir. A Luna
// reescrevendo a própria instrução a partir da leitura que ela fez de si mesma,
// sem ninguém olhando, é o único jeito de este sistema piorar sozinho.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chamarModelo } from "../_shared/modelo-de-atendimento.ts";
import { anotarConsumo } from "../_shared/consumo-da-ia.ts";
import { pushToOwner } from "../_shared/push.ts";
import { agoraNaClinica } from "../_shared/agenda-da-clinica.ts";
import { somarDias } from "../_shared/vagas.ts";
import {
  FORMATO_DAS_BOAS_PRATICAS,
  FORMATO_DO_RELATORIO,
  boasPraticasDoJson,
  markdownDoRelatorio,
  numerosDaSemana,
  promptDasBoasPraticas,
  promptDoOlho,
  relatorioDoJson,
  secoesDoManual,
  type LicaoDaSemana,
  type LinhaDeAuditoria,
  type SessaoDaSemana,
} from "../_shared/olho-de-deus.ts";
import { soOSistema } from "../_shared/so-o-sistema.ts";
import { semIaNoConsultorio } from "../_shared/plano-no-banco.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/** Teto de saída do relatório. Largo: são seis seções de texto mais duas
 *  listas, e um relatório cortado no meio da lista de prioridades é pior que
 *  nenhum — quem lê não sabe que faltou. */
const MAX_TOKENS_DO_RELATORIO = 8000;

/** Teto da busca. Curto: é uma seção de referência no fim. */
const MAX_TOKENS_DAS_PRATICAS = 3000;

/** Quantas lições vão citadas. O prompt corta em `LICOES_CITADAS`; aqui se lê
 *  um pouco mais para ele poder escolher as de maior confiança. */
const LICOES_LIDAS = 60;

/**
 * A janela: os sete dias que terminaram ontem.
 *
 * Em dias de calendário no fuso da clínica, e não "168 horas atrás": o
 * relatório é lido por uma pessoa que pensa em "semana passada", e uma janela
 * que começa às 09:14 de uma terça não é semana nenhuma.
 *
 * Termina ONTEM, não hoje: o dia de hoje está acontecendo, e meia segunda-feira
 * contada como semana inteira faz o número da semana seguinte parecer melhor
 * sem nada ter melhorado.
 */
function janelaDaSemana(agora: Date): { de: string; ate: string } {
  const hoje = agoraNaClinica(agora).date;
  const ate = somarDias(hoje, -1);
  return { de: somarDias(ate, -6), ate };
}

interface Agente {
  id: string;
  owner_id: string;
  name: string | null;
  api_key: string | null;
  model: string | null;
  instrucao_base: string | null;
  olho_ligado: boolean | null;
  olho_modelo: string | null;
  olho_na_web: boolean | null;
}

async function olharClinica(
  agente: Agente,
  janela: { de: string; ate: string },
  forcado: boolean,
): Promise<Record<string, unknown>> {
  const ownerId = agente.owner_id;
  const passo = (motivo: string) => ({ ownerId, motivo });

  // O interruptor vale para o cron, não para o botão: quem clicou em "gerar
  // agora" está justamente tentando ver como é antes de ligar.
  if (!forcado && agente.olho_ligado !== true) return passo("olho desligado");

  const modelo = String(agente.olho_modelo ?? "").trim() || String(agente.model ?? "").trim();
  // Sem modelo não há como ler a semana. Não é erro: é uma clínica que ainda
  // não escolheu um — e o nome não pode ser chutado no código, porque quais
  // existem depende da conta (ver `listarModelosDaIa`).
  if (!modelo) return passo("sem modelo escolhido");

  // ── As leituras ───────────────────────────────────────────────────────
  //
  // Cinco, em paralelo. Todas recortadas pela janela, e nenhuma traz mensagem
  // de paciente inteira: o relatório fala da OPERAÇÃO, e trafegar conversa por
  // conversa por aqui seria passear com dado pessoal sem precisar.
  //
  // A exceção é `content` da auditoria, e ela é necessária: é no texto da
  // RESPOSTA DELA que se conta preço contra horário. São falas da própria
  // clínica, não do paciente.
  const inicio = `${janela.de}T00:00:00`;
  const fim = `${janela.ate}T23:59:59.999`;

  const [licoes, auditoria, sessoes, criadas, concluidas, anterior] = await Promise.all([
    supabase
      .from("ai_agent_licoes")
      .select("desfecho, motivo, confianca, sugestao, o_que_faltou, momento_decisivo, mensagens")
      .eq("owner_id", ownerId)
      .gte("created_at", inicio)
      .lte("created_at", fim)
      .order("created_at", { ascending: false })
      .limit(LICOES_LIDAS),
    supabase
      .from("ai_agent_messages")
      .select("direction, skipped_reason, content")
      .eq("owner_id", ownerId)
      .gte("created_at", inicio)
      .lte("created_at", fim)
      .limit(5000),
    supabase
      .from("ai_agent_sessions")
      .select("anuncio, human_took_over_at, duvida_pendente, last_outbound_at")
      .eq("owner_id", ownerId)
      .gte("created_at", inicio)
      .lte("created_at", fim)
      .limit(2000),
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", ownerId)
      .gte("created_at", inicio)
      .lte("created_at", fim),
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", ownerId)
      .eq("status", "completed")
      .gte("date", janela.de)
      .lte("date", janela.ate),
    // O relatório anterior, para o campo "o que mudou" ser comparação e não
    // recomeço. `lt` e não `neq`: relatório de semana FUTURA não existe, mas
    // uma rodada manual de uma semana antiga não pode se comparar com o que
    // veio depois dela.
    supabase
      .from("ai_olho_relatorios")
      .select("relatorio")
      .eq("owner_id", ownerId)
      .lt("de", janela.de)
      .order("de", { ascending: false })
      .limit(1),
  ]);

  const erro = licoes.error ?? auditoria.error ?? sessoes.error;
  if (erro) return passo(`não deu para ler a semana: ${erro.message}`);

  // deno-lint-ignore no-explicit-any
  const asLicoes: LicaoDaSemana[] = ((licoes.data ?? []) as any[]).map((x) => ({
    desfecho: String(x.desfecho ?? ""),
    motivo: String(x.motivo ?? ""),
    confianca: String(x.confianca ?? "baixa"),
    sugestao: String(x.sugestao ?? ""),
    oQueFaltou: String(x.o_que_faltou ?? ""),
    momentoDecisivo: String(x.momento_decisivo ?? ""),
    mensagens: Number(x.mensagens ?? 0),
  }));

  // deno-lint-ignore no-explicit-any
  const asLinhas: LinhaDeAuditoria[] = ((auditoria.data ?? []) as any[]).map((x) => ({
    direction: String(x.direction ?? ""),
    skippedReason: x.skipped_reason ?? null,
    conteudo: x.content ?? null,
  }));

  // deno-lint-ignore no-explicit-any
  const asSessoes: SessaoDaSemana[] = ((sessoes.data ?? []) as any[]).map((x) => {
    const anuncio = (x.anuncio ?? {}) as Record<string, unknown>;
    return {
      anuncioTitulo: anuncio.titulo ? String(anuncio.titulo) : null,
      anuncioId: anuncio.anuncioId ? String(anuncio.anuncioId) : null,
      humanoAssumiu: !!x.human_took_over_at,
      duvidaPendente: !!x.duvida_pendente,
      lunaFalou: !!x.last_outbound_at,
    };
  });

  const numeros = numerosDaSemana({
    licoes: asLicoes,
    auditoria: asLinhas,
    sessoes: asSessoes,
    consultasCriadas: Number(criadas.count ?? 0),
    consultasConcluidas: Number(concluidas.count ?? 0),
  });

  // Semana sem nada não rende relatório. Gerar um texto sobre zero conversas
  // gastaria chamada de modelo para dizer "não houve movimento", e a tela
  // mostraria uma semana vazia como se fosse análise.
  if (!numeros.conversas && !numeros.mensagensRespondidas && !numeros.licoes) {
    return passo("semana sem movimento");
  }

  // deno-lint-ignore no-explicit-any
  const gargaloAnterior = ((anterior.data ?? [])[0] as any)?.relatorio?.gargalo_da_semana ?? null;

  let texto: string;
  try {
    texto = await chamarModelo({
      chave: agente.api_key,
      modelo,
      pergunta: promptDoOlho({
        de: janela.de,
        ate: janela.ate,
        numeros,
        assistente: agente.name,
        licoes: asLicoes,
        secoesDoManual: secoesDoManual(agente.instrucao_base),
        gargaloAnterior,
      }),
      maxTokens: MAX_TOKENS_DO_RELATORIO,
      formato: FORMATO_DO_RELATORIO,
      nomeDoFormato: "relatorio_do_olho",
      anotarUso: (uso) => void anotarConsumo(supabase, ownerId, "olho", uso),
    });
  } catch (e) {
    // Uma clínica com chave vencida não pode derrubar a rodada das outras.
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[olho] modelo falhou para ${ownerId}:`, msg);
    return passo(`modelo falhou: ${msg.slice(0, 200)}`);
  }

  let relatorio;
  try {
    relatorio = relatorioDoJson(JSON.parse(texto));
  } catch {
    // Texto que não é o JSON pedido não vira relatório em branco na tela.
    return passo("o modelo não devolveu o formato pedido");
  }
  if (!relatorio.gargalo && !relatorio.noManual.length && !relatorio.noSistema.length) {
    return passo("o modelo não encontrou nada para apontar");
  }

  // ── A busca na internet, numa chamada à parte ─────────────────────────
  //
  // Depois do relatório, nunca antes, e com o erro ENGOLIDO de propósito: é a
  // peça com mais como falhar (modelo que não suporta busca, conta sem a função
  // liberada, rede), e a semana inteira não pode se perder por causa dela. O
  // motivo da falha vai para o relatório, onde alguém pode ler e decidir.
  let praticas = null;
  let motivoSemPraticas: string | null = null;
  if (agente.olho_na_web === true) {
    try {
      const bruto = await chamarModelo({
        chave: agente.api_key,
        modelo,
        pergunta: promptDasBoasPraticas(numeros, relatorio.gargalo),
        maxTokens: MAX_TOKENS_DAS_PRATICAS,
        formato: FORMATO_DAS_BOAS_PRATICAS,
        nomeDoFormato: "boas_praticas",
        buscarNaWeb: true,
        anotarUso: (uso) => void anotarConsumo(supabase, ownerId, "olho", uso),
      });
      praticas = boasPraticasDoJson(JSON.parse(bruto));
      if (!praticas.praticas.length) {
        praticas = null;
        motivoSemPraticas = "a busca rodou e não trouxe nada com fonte";
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      motivoSemPraticas = msg.slice(0, 300);
      console.warn(`[olho] busca na web não rolou para ${ownerId}:`, msg);
    }
  }

  const geradoEm = new Date().toISOString();
  const markdown = markdownDoRelatorio({
    de: janela.de,
    ate: janela.ate,
    numeros,
    assistente: agente.name,
    relatorio,
    praticas,
    motivoSemPraticas,
    modelo,
    geradoEm,
  });

  // Uma semana, um relatório: rodar de novo ATUALIZA. Ver o índice único na
  // migration — duas versões da mesma semana fariam a tela mostrar duas
  // verdades.
  const { error: erroAoGravar } = await supabase.from("ai_olho_relatorios").upsert(
    {
      owner_id: ownerId,
      de: janela.de,
      ate: janela.ate,
      numeros,
      // Guardado na forma do MODELO (as chaves com underline), e não na forma
      // lida: é assim que `gargaloAnterior` lê o relatório da semana passada
      // sem depender de o leitor de hoje continuar o mesmo.
      relatorio: {
        gargalo_da_semana: relatorio.gargalo,
        o_que_mudou: relatorio.oQueMudou,
        como_ela_esta_conduzindo: relatorio.comoEstaConduzindo,
        o_que_o_sistema_impede: relatorio.oQueOSistemaImpede,
        mudar_no_manual: relatorio.noManual,
        mudar_no_sistema: relatorio.noSistema,
        observar_na_proxima: relatorio.observarNaProxima,
        confianca: relatorio.confianca,
      },
      praticas,
      motivo_sem_praticas: motivoSemPraticas,
      markdown,
      modelo,
      created_at: geradoEm,
    },
    { onConflict: "owner_id,de,ate" },
  );
  if (erroAoGravar) return passo(`não deu para gravar: ${erroAoGravar.message}`);

  // O aviso, DEPOIS de gravar e sem poder derrubar nada: o relatório já existe,
  // e um push que não sai é um aviso perdido, não uma semana perdida.
  try {
    await pushToOwner(
      supabase,
      ownerId,
      "olho_relatorio",
      {
        title: "Relatório da semana está pronto",
        body: relatorio.gargalo.slice(0, 160) || "O Olho de Deus leu a semana.",
        url: "/agente-ia",
      },
      {},
    );
  } catch (e) {
    console.warn("[olho] aviso não saiu:", e instanceof Error ? e.message : e);
  }

  return {
    ownerId,
    de: janela.de,
    ate: janela.ate,
    conversas: numeros.conversas,
    licoes: numeros.licoes,
    praticas: praticas ? praticas.praticas.length : 0,
    motivoSemPraticas,
  };
}

Deno.serve(async (req) => {
  const barrado = soOSistema(req);
  if (barrado) return barrado;
  try {
    const body = await req.json().catch(() => ({}));
    const pedido = (body ?? {}) as { ownerId?: string; de?: string; ate?: string };

    // A janela do pedido, quando vem, tem de ser data de calendário: uma
    // string estranha chegaria ao Postgres e voltaria um erro que não explica
    // nada a quem está na tela.
    const data = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : null);
    const de = data(pedido.de);
    const ate = data(pedido.ate);
    const janela = de && ate ? { de, ate } : janelaDaSemana(new Date());
    if (janela.ate < janela.de) {
      return Response.json({ error: "a janela termina antes de começar" }, { status: 400 });
    }

    let busca = supabase
      .from("ai_agents")
      .select(
        "id, owner_id, name, api_key, model, instrucao_base, olho_ligado, olho_modelo, olho_na_web",
      );
    if (pedido.ownerId) busca = busca.eq("owner_id", pedido.ownerId);

    const { data: agentes, error } = await busca;
    if (error) throw new Error(error.message);

    const resultados = [];
    for (const agente of (agentes ?? []) as Agente[]) {
      try {
        const semIa = await semIaNoConsultorio(supabase, agente.owner_id, new Date());
        if (semIa) {
          resultados.push({ ownerId: agente.owner_id, motivo: semIa });
          continue;
        }
        resultados.push(await olharClinica(agente, janela, !!pedido.ownerId));
      } catch (e) {
        // Uma clínica não derruba as outras.
        console.error(`[olho] falhou em ${agente.owner_id}:`, e);
        resultados.push({
          ownerId: agente.owner_id,
          motivo: e instanceof Error ? e.message : "falhou",
        });
      }
    }

    return Response.json({ ok: true, janela, resultados });
  } catch (e) {
    console.error("[olho]", e);
    return Response.json(
      { error: e instanceof Error ? e.message : "falhou ao olhar a semana" },
      { status: 500 },
    );
  }
});
