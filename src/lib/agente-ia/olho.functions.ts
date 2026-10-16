import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";

/**
 * O Olho de Deus, para a tela.
 *
 * ── Por que um arquivo próprio ──────────────────────────────────────────
 *
 * `agente.functions.ts` já tem 1.100 linhas e cuida da Luna: chave, modo,
 * público, ritmo, lições, consumo. O olho não é a Luna — ele a observa —, e um
 * arquivo que faz as duas coisas é onde alguém daqui a três meses vai procurar
 * a configuração do agente e achar a do relatório.
 *
 * A configuração do olho fica em `ai_agents` do lado da Luna, e é lida pelo
 * `getAtendimento` que já existe: é a mesma clínica, e duas telas de
 * configuração para a mesma linha divergem.
 */

export interface MudancaDoRelatorio {
  secao?: string;
  oQue: string;
  porque: string;
  prioridade: string;
}

export interface PraticaDeFora {
  pratica: string;
  porqueFunciona: string;
  fonte: string;
  oQueTestarAqui: string;
}

/** Uma contagem com rótulo. Gêmea de `Contagem` em
 *  `supabase/functions/_shared/olho-de-deus.ts` — mexeu lá, mexa aqui. */
export interface ContagemNaTela {
  rotulo: string;
  quantas: number;
}

/**
 * Os números do relatório, como a tela os lê.
 *
 * ⚠️ **Gêmea de `NumerosDaSemana`** (`_shared/olho-de-deus.ts`). A duplicação é
 * a mesma de `cota.ts`/`daily-quota.ts` e das outras deste projeto: o Deno não
 * importa de `src/`.
 *
 * Campos explícitos, e não `Record<string, unknown>`: o TanStack confere se o
 * que a server function devolve é serializável, e um índice de `unknown` ele
 * recusa — com razão. Campo que o olho gravou e esta lista não tem fica fora da
 * tela até alguém acrescentá-lo aqui, o que é melhor que um `any` atravessando.
 */
export interface NumerosNaTela {
  conversas?: number;
  conversasAtendidas?: number;
  mensagensRespondidas?: number;
  mensagensIgnoradas?: number;
  respostasComHorario?: number;
  respostasComPreco?: number;
  respostasQueRepassaram?: number;
  duvidasEncaminhadas?: number;
  conversasAssumidas?: number;
  conversasComDuvidaAberta?: number;
  consultasCriadas?: number;
  consultasConcluidas?: number;
  licoes?: number;
  licoesQueFecharam?: number;
  conversaoPorcento?: number | null;
  motivosDoSilencio?: ContagemNaTela[];
  motivosDasLicoes?: ContagemNaTela[];
  sugestoesPorTema?: ContagemNaTela[];
  porAnuncio?: ContagemNaTela[];
}

export interface RelatorioDoOlho {
  id: string;
  de: string;
  ate: string;
  criadoEm: string;
  modelo: string;
  /** O markdown pronto — é o que o botão de baixar entrega. */
  markdown: string;
  gargalo: string;
  oQueMudou: string;
  comoEstaConduzindo: string;
  oQueOSistemaImpede: string;
  observarNaProxima: string;
  confianca: string;
  noManual: MudancaDoRelatorio[];
  noSistema: MudancaDoRelatorio[];
  praticas: PraticaDeFora[];
  motivoSemPraticas: string | null;
  /** Os números contados, para a tela mostrar os principais sem recontá-los. */
  numeros: NumerosNaTela;
}

/** Quantos relatórios a tela lista. Doze semanas é um trimestre: o bastante
 *  para ver tendência, curto o bastante para a consulta não crescer sozinha. */
const QUANTOS = 12;

function texto(v: unknown): string {
  return String(v ?? "").trim();
}

function mudancasDoManual(v: unknown): MudancaDoRelatorio[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((m) => {
      const x = (m ?? {}) as Record<string, unknown>;
      // Duas formas, de propósito: a gravada pelo nosso leitor (`mudanca`) e a
      // que o modelo devolve (`o_que`). O relatório antigo continua abrindo
      // depois de o formato mudar — e um histórico que quebra a cada versão
      // não é histórico.
      return {
        secao: texto(x.secao) || undefined,
        oQue: texto(x.mudanca) || texto(x.oQue) || texto(x.o_que),
        porque: texto(x.porque),
        prioridade: texto(x.prioridade) || "media",
      };
    })
    .filter((m) => m.oQue);
}

/** Lê os números gravados sem confiar neles: relatório de uma versão anterior
 *  pode não ter um campo, e campo ausente é ausente, não zero — zero diria
 *  "medimos e deu nada". */
function numerosNaTela(v: unknown): NumerosNaTela {
  const o = (v ?? {}) as Record<string, unknown>;
  const n = (k: string) => (typeof o[k] === "number" ? (o[k] as number) : undefined);
  const lista = (k: string): ContagemNaTela[] | undefined => {
    if (!Array.isArray(o[k])) return undefined;
    return (o[k] as unknown[])
      .map((i) => {
        const x = (i ?? {}) as Record<string, unknown>;
        return { rotulo: texto(x.rotulo), quantas: Number(x.quantas ?? 0) };
      })
      .filter((i) => i.rotulo);
  };
  return {
    conversas: n("conversas"),
    conversasAtendidas: n("conversasAtendidas"),
    mensagensRespondidas: n("mensagensRespondidas"),
    mensagensIgnoradas: n("mensagensIgnoradas"),
    respostasComHorario: n("respostasComHorario"),
    respostasComPreco: n("respostasComPreco"),
    respostasQueRepassaram: n("respostasQueRepassaram"),
    duvidasEncaminhadas: n("duvidasEncaminhadas"),
    conversasAssumidas: n("conversasAssumidas"),
    conversasComDuvidaAberta: n("conversasComDuvidaAberta"),
    consultasCriadas: n("consultasCriadas"),
    consultasConcluidas: n("consultasConcluidas"),
    licoes: n("licoes"),
    licoesQueFecharam: n("licoesQueFecharam"),
    // `null` é um valor de verdade aqui: quer dizer "não houve conversa
    // atendida", que é diferente de zero por cento.
    conversaoPorcento: o.conversaoPorcento === null ? null : n("conversaoPorcento"),
    motivosDoSilencio: lista("motivosDoSilencio"),
    motivosDasLicoes: lista("motivosDasLicoes"),
    sugestoesPorTema: lista("sugestoesPorTema"),
    porAnuncio: lista("porAnuncio"),
  };
}

export const getRelatoriosDoOlho = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<RelatorioDoOlho[]> => {
    // `: any` como no resto dos arquivos de server function, e aqui é
    // obrigatório: `ai_olho_relatorios` é tabela nova e `types.ts` é gerado
    // pelo Lovable, não se edita à mão.
    const supabase: any = context.supabase;
    const { data, error } = await supabase
      .from("ai_olho_relatorios")
      .select("*")
      .eq("owner_id", context.ownerId)
      .order("ate", { ascending: false })
      .limit(QUANTOS);
    if (error) throw new Error(error.message);

    // `Record<string, unknown>` e não `any[]`: a linha vem de uma tabela que
    // `types.ts` ainda não conhece, então não há tipo gerado para ela — mas
    // "objeto com chaves que eu leio uma por uma" descreve a verdade e mantém
    // a leitura conferida. Cada campo abaixo passa por `texto`, `String` ou
    // `Number`, que é o que de fato protege a tela.
    return ((data ?? []) as Record<string, unknown>[]).map((r) => {
      const rel = (r.relatorio ?? {}) as Record<string, unknown>;
      const pra = (r.praticas ?? null) as { praticas?: unknown[] } | null;
      return {
        id: String(r.id),
        de: String(r.de ?? ""),
        ate: String(r.ate ?? ""),
        criadoEm: String(r.created_at ?? ""),
        modelo: texto(r.modelo),
        markdown: String(r.markdown ?? ""),
        gargalo: texto(rel.gargalo_da_semana),
        oQueMudou: texto(rel.o_que_mudou),
        comoEstaConduzindo: texto(rel.como_ela_esta_conduzindo),
        oQueOSistemaImpede: texto(rel.o_que_o_sistema_impede),
        observarNaProxima: texto(rel.observar_na_proxima),
        confianca: texto(rel.confianca) || "baixa",
        noManual: mudancasDoManual(rel.mudar_no_manual),
        noSistema: mudancasDoManual(rel.mudar_no_sistema),
        praticas: (Array.isArray(pra?.praticas) ? pra!.praticas : []).map((p) => {
          const x = (p ?? {}) as Record<string, unknown>;
          return {
            pratica: texto(x.pratica),
            porqueFunciona: texto(x.porqueFunciona) || texto(x.porque_funciona),
            fonte: texto(x.fonte),
            oQueTestarAqui: texto(x.oQueTestarAqui) || texto(x.o_que_testar_aqui),
          };
        }),
        motivoSemPraticas: texto(r.motivo_sem_praticas) || null,
        numeros: numerosNaTela(r.numeros),
      };
    });
  });

/**
 * Roda o olho agora, para esta clínica.
 *
 * ── Por que ignora o interruptor ────────────────────────────────────────
 *
 * Porque quem clica em "gerar agora" está tentando ver como é ANTES de ligar —
 * a mesma razão de `ignorarInterruptor` na simulação da Luna. Ligar uma coisa
 * nova para descobrir se ela presta é o contrário do que um botão de prévia
 * existe para fazer.
 *
 * O que ele NÃO ignora é o modelo: sem um escolhido, a função devolve o motivo
 * em vez de chutar um nome.
 */
export const gerarRelatorioDoOlho = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { de?: string; ate?: string }) => {
    for (const [campo, valor] of Object.entries(input ?? {})) {
      if (valor && !/^\d{4}-\d{2}-\d{2}$/.test(String(valor))) {
        throw new Error(`A data de ${campo} precisa estar no formato AAAA-MM-DD.`);
      }
    }
    if (input?.de && input?.ate && input.ate < input.de) {
      throw new Error("A semana termina antes de começar. Confira as datas.");
    }
    return input ?? {};
  })
  .handler(async ({ data, context }): Promise<{ ok: boolean; motivo: string | null }> => {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes");

    const res = await fetch(`${url}/functions/v1/olho-de-deus`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ ownerId: context.ownerId, de: data.de, ate: data.ate }),
      // Ler a semana inteira e chamar o modelo duas vezes. O tempo é o da
      // chamada de modelo, não o nosso; cortar curto viraria "erro" numa
      // rodada que ia terminar.
      signal: AbortSignal.timeout(230_000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        (json as { error?: string })?.error ?? `Falha ao rodar o olho (${res.status})`,
      );
    }

    // A função devolve um resultado por clínica; aqui é sempre uma. O `motivo`
    // só existe quando ela NÃO gerou — e é ele que a tela mostra, em vez de um
    // "pronto!" sobre um relatório que não existe.
    const primeiro = ((json as { resultados?: unknown[] })?.resultados ?? [])[0] as
      | { motivo?: string }
      | undefined;
    const motivo = texto(primeiro?.motivo) || null;
    return { ok: !motivo, motivo };
  });
