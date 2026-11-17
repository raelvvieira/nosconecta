/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { exigeEstoque } from "@/lib/auth/area.middleware";
import { resolveUnitId } from "@/lib/auth/resolve-unit";
import { clinicTodayStr } from "@/lib/date";
import { custoPorUnidade, emUnidades } from "@/lib/estoque/estoque";
import {
  catalogoDeItens,
  diaDoLancamento,
  FORMATO_DA_LEITURA,
  instrucaoDaLeitura,
  lerRespostaDaLeitura,
  marcaDaNota,
  MAXIMO_DE_LINHAS,
  pedidoDaLeitura,
  type ItemConhecido,
  type LeituraDaNota,
  type ModoDaLeitura,
} from "@/lib/estoque/nota";

// Ler uma nota, foto de produtos ou folha de contagem com a IA da clínica.
//
// A chave e o modelo são os MESMOS do Agente de IA (Agente de IA → Chave da
// IA), e o gasto entra no consumo do mês como "estoque-nota". Duas funções:
//   • `lerArquivosDeEstoque` só LÊ e devolve uma proposta. Não grava nada de
//     estoque.
//   • `lancarLeituraDeEstoque` grava o que a pessoa conferiu, numa só
//     gravação: ou entra tudo, ou nada.

const MODOS: ModoDaLeitura[] = ["nota", "produtos", "contagem"];
const TIPOS_ACEITOS = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAXIMO_DE_ARQUIVOS = 6;
/** Em caracteres de base64 (≈ 4,5 MB de arquivo). A tela já reduz as fotos. */
const MAXIMO_POR_ARQUIVO = 6_000_000;
const MAXIMO_NO_TOTAL = 16_000_000;

interface ArquivoEnviado {
  nome: string;
  tipo: string;
  base64: string;
}

const numero = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const texto = (v: unknown, max: number): string =>
  String(v ?? "")
    .trim()
    .slice(0, max);

/** O motivo de a OpenAI ter recusado, em português e sem o jargão da API. */
function explicarErroDaOpenAi(mensagem: string): string {
  if (/no credits|insufficient_quota|exceeded your current quota/i.test(mensagem)) {
    return "A conta da OpenAI está sem créditos. Adicione créditos em platform.openai.com/settings/organization/billing e tente de novo.";
  }
  if (/api key|incorrect api key|invalid_api_key/i.test(mensagem)) {
    return "A chave da OpenAI foi recusada. Confira em Agente de IA → Chave da IA.";
  }
  if (/model.*(not found|does not exist|access)/i.test(mensagem)) {
    return "O modelo escolhido não existe ou não tem acesso a esta conta. Escolha outro em Agente de IA → Chave da IA.";
  }
  if (/image|vision|file|pdf/i.test(mensagem)) {
    return `Este modelo não conseguiu abrir o arquivo (${mensagem.slice(0, 120)}). Tente uma foto em JPG ou PNG, ou escolha um modelo com leitura de imagens.`;
  }
  return `A OpenAI recusou a leitura: ${mensagem.slice(0, 200)}`;
}

async function perguntarAoModelo(args: {
  chave: string;
  modelo: string;
  instrucao: string;
  pergunta: string;
  arquivos: ArquivoEnviado[];
}): Promise<{ texto: string; uso: { entrada: number; cache: number; saida: number } }> {
  const partes: Record<string, unknown>[] = [{ type: "text", text: args.pergunta }];
  for (const a of args.arquivos) {
    if (a.tipo === "application/pdf") {
      partes.push({
        type: "file",
        file: {
          filename: a.nome.slice(0, 80) || "documento.pdf",
          file_data: `data:application/pdf;base64,${a.base64}`,
        },
      });
    } else {
      partes.push({
        type: "image_url",
        image_url: { url: `data:${a.tipo};base64,${a.base64}`, detail: "high" },
      });
    }
  }

  const corpo = (limite: "max_completion_tokens" | "max_tokens") => ({
    model: args.modelo,
    messages: [
      { role: "system", content: args.instrucao },
      { role: "user", content: partes },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "leitura_de_estoque", strict: true, schema: FORMATO_DA_LEITURA.schema },
    },
    [limite]: 4000,
  });

  const postar = async (limite: "max_completion_tokens" | "max_tokens") => {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${args.chave}` },
      body: JSON.stringify(corpo(limite)),
      signal: AbortSignal.timeout(90_000),
    });
    const json: any = await res.json().catch(() => null);
    return { res, json };
  };

  let { res, json } = await postar("max_completion_tokens");
  // Alguns modelos só aceitam um dos dois nomes do limite.
  if (!res.ok && /max_tokens|max_completion_tokens/i.test(String(json?.error?.message ?? ""))) {
    ({ res, json } = await postar("max_tokens"));
  }
  if (!res.ok)
    throw new Error(explicarErroDaOpenAi(String(json?.error?.message ?? `HTTP ${res.status}`)));

  const mensagem = json?.choices?.[0]?.message;
  if (mensagem?.refusal) throw new Error("A IA recusou ler este arquivo. Tente outra imagem.");
  const cache = numero(json?.usage?.prompt_tokens_details?.cached_tokens);
  return {
    texto: String(mensagem?.content ?? ""),
    uso: {
      entrada: Math.max(0, numero(json?.usage?.prompt_tokens) - cache),
      cache,
      saida: numero(json?.usage?.completion_tokens),
    },
  };
}

export const lerArquivosDeEstoque = createServerFn({ method: "POST" })
  .middleware([exigeEstoque])
  .inputValidator(
    (input: { modo: ModoDaLeitura; observacao?: string; arquivos: ArquivoEnviado[] }) => {
      if (!MODOS.includes(input?.modo)) throw new Error("Escolha o que você está enviando.");
      const arquivos = Array.isArray(input.arquivos) ? input.arquivos : [];
      if (!arquivos.length) throw new Error("Envie pelo menos uma foto ou PDF.");
      if (arquivos.length > MAXIMO_DE_ARQUIVOS) {
        throw new Error(`Envie no máximo ${MAXIMO_DE_ARQUIVOS} arquivos por vez.`);
      }
      let total = 0;
      const limpos = arquivos.map((a) => {
        const tipo = String(a?.tipo ?? "");
        if (!TIPOS_ACEITOS.includes(tipo)) {
          throw new Error("Formato não aceito. Envie fotos em JPG, PNG ou WebP, ou um PDF.");
        }
        const base64 = String(a?.base64 ?? "").replace(/^data:[^,]*,/, "");
        if (!base64) throw new Error("Um dos arquivos está vazio.");
        if (base64.length > MAXIMO_POR_ARQUIVO)
          throw new Error("Um dos arquivos é grande demais. Reduza a foto e tente de novo.");
        total += base64.length;
        return { nome: texto(a?.nome, 80), tipo, base64 };
      });
      if (total > MAXIMO_NO_TOTAL)
        throw new Error("Os arquivos juntos são grandes demais. Envie menos fotos por vez.");
      return { modo: input.modo, observacao: texto(input.observacao, 300), arquivos: limpos };
    },
  )
  .handler(async ({ data, context }): Promise<LeituraDaNota> => {
    const supabase: any = context.supabase;

    const { data: agente } = await supabase
      .from("ai_agents")
      .select("api_key, model")
      .eq("owner_id", context.ownerId)
      .maybeSingle();
    // Mesma regra das outras chamadas: a chave da clínica; sem ela, a da plataforma.
    const propria = String(agente?.api_key ?? "").trim();
    const chave = propria || process.env.OPENAI_API_KEY || "";
    const modelo =
      String(agente?.model ?? "").trim() ||
      (propria ? "" : (process.env.OPENAI_MODELO_PADRAO ?? "").trim());
    if (!chave) {
      throw new Error(
        "A chave da IA não está configurada. Informe-a em Agente de IA → Chave da IA.",
      );
    }
    if (!modelo) {
      throw new Error("Nenhum modelo escolhido. Escolha um em Agente de IA → Chave da IA.");
    }

    const { data: itensDb, error } = await supabase
      .from("estoque_itens")
      .select("id, nome, categoria, rotulo_embalagem, rotulo_unidade, unidades_por_embalagem")
      .eq("owner_id", context.ownerId)
      .eq("ativo", true)
      .order("nome");
    if (error) throw new Error(error.message);
    const conhecidos: ItemConhecido[] = ((itensDb ?? []) as Record<string, unknown>[]).map((i) => ({
      id: String(i.id),
      nome: String(i.nome),
      categoria: (i.categoria as string | null) ?? null,
      rotuloEmbalagem: String(i.rotulo_embalagem ?? "caixa"),
      rotuloUnidade: String(i.rotulo_unidade ?? "unidade"),
      unidadesPorEmbalagem: numero(i.unidades_por_embalagem) || 1,
    }));
    const catalogo = catalogoDeItens(conhecidos);

    const resposta = await perguntarAoModelo({
      chave,
      modelo,
      instrucao: instrucaoDaLeitura(data.modo),
      pergunta: pedidoDaLeitura({
        itens: catalogo,
        observacao: data.observacao,
        arquivos: data.arquivos.length,
      }),
      arquivos: data.arquivos,
    });

    // O gasto entra no consumo do mês, como o das outras chamadas. Não derruba a leitura.
    if (resposta.uso.entrada || resposta.uso.cache || resposta.uso.saida) {
      await supabase
        .from("ai_uso")
        .insert({
          owner_id: context.ownerId,
          modelo,
          para: "estoque-nota",
          tokens_entrada: resposta.uso.entrada,
          tokens_cache: resposta.uso.cache,
          tokens_saida: resposta.uso.saida,
        })
        .then(undefined, (e: unknown) => console.error("[estoque-nota] consumo não gravado:", e));
    }

    return lerRespostaDaLeitura(resposta.texto, catalogo, data.modo);
  });

// ── Lançar o que a pessoa conferiu ─────────────────────────────────────────

interface LinhaParaLancar {
  /** Item já cadastrado, ou `null` para criar um novo (`novoItem`). */
  itemId: string | null;
  novoItem: {
    nome: string;
    categoria: string | null;
    rotuloEmbalagem: string;
    rotuloUnidade: string;
    unidadesPorEmbalagem: number;
  } | null;
  caixas: number;
  avulsas: number;
  custoTotal: number | null;
}

export const lancarLeituraDeEstoque = createServerFn({ method: "POST" })
  .middleware([exigeEstoque])
  .inputValidator(
    (input: {
      modo: ModoDaLeitura;
      unitId?: string | null;
      documento: { fornecedor?: string; data?: string; numero?: string };
      linhas: LinhaParaLancar[];
      lancarMesmoRepetida?: boolean;
    }) => {
      if (!MODOS.includes(input?.modo)) throw new Error("Modo inválido.");
      const linhas = Array.isArray(input.linhas) ? input.linhas : [];
      if (!linhas.length) throw new Error("Não há nenhuma linha para lançar.");
      if (linhas.length > MAXIMO_DE_LINHAS)
        throw new Error(`No máximo ${MAXIMO_DE_LINHAS} linhas por vez.`);
      const limpas = linhas.map((l, n) => {
        const caixas = numero(l.caixas);
        const avulsas = numero(l.avulsas);
        if (caixas < 0 || avulsas < 0 || caixas > 100_000 || avulsas > 10_000_000) {
          throw new Error(`Linha ${n + 1}: quantidade inválida.`);
        }
        const custo =
          l.custoTotal == null || String(l.custoTotal) === "" ? null : numero(l.custoTotal);
        if (custo != null && (custo < 0 || custo > 100_000_000))
          throw new Error(`Linha ${n + 1}: valor inválido.`);
        if (l.itemId)
          return { itemId: String(l.itemId), novoItem: null, caixas, avulsas, custoTotal: custo };
        const nome = texto(l.novoItem?.nome, 120);
        const por = numero(l.novoItem?.unidadesPorEmbalagem ?? 1);
        if (!nome) throw new Error(`Linha ${n + 1}: dê um nome ao item novo.`);
        if (!(por > 0) || por > 1_000_000)
          throw new Error(`Linha ${n + 1}: informe quantas unidades vêm em cada caixa.`);
        return {
          itemId: null,
          novoItem: {
            nome,
            categoria: texto(l.novoItem?.categoria, 60) || null,
            rotuloEmbalagem: texto(l.novoItem?.rotuloEmbalagem, 30) || "caixa",
            rotuloUnidade: texto(l.novoItem?.rotuloUnidade, 30) || "unidade",
            unidadesPorEmbalagem: por,
          },
          caixas,
          avulsas,
          custoTotal: custo,
        };
      });
      return {
        modo: input.modo,
        unitId: input.unitId || null,
        documento: {
          fornecedor: texto(input.documento?.fornecedor, 80),
          data: texto(input.documento?.data, 10),
          numero: texto(input.documento?.numero, 40),
        },
        linhas: limpas,
        lancarMesmoRepetida: input.lancarMesmoRepetida === true,
      };
    },
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ lancadas: number; itensNovos: number; ajustes: number; semMudanca: number }> => {
      const supabase: any = context.supabase;
      const unitId = await resolveUnitId(context as any, data.unitId);
      const { data: unidade } = await supabase
        .from("clinic_units")
        .select("id")
        .eq("id", unitId)
        .eq("owner_id", context.ownerId)
        .maybeSingle();
      if (!unidade) throw new Error("Unidade inválida.");

      // A mesma nota duas vezes dobraria o estoque sem ninguém ver.
      const marca =
        data.modo === "nota" ? marcaDaNota(data.documento.numero, data.documento.fornecedor) : null;
      if (marca && !data.lancarMesmoRepetida) {
        const { data: ja } = await supabase
          .from("estoque_movimentos")
          .select("created_at")
          .eq("owner_id", context.ownerId)
          .eq("motivo", marca)
          .limit(1);
        if (ja?.length) {
          const quando = new Date(ja[0].created_at).toLocaleDateString("pt-BR");
          throw new Error(`NOTA_REPETIDA: essa nota já foi lançada em ${quando}.`);
        }
      }

      // Os itens que já existem têm de ser desta clínica.
      const idsExistentes = [
        ...new Set(data.linhas.map((l) => l.itemId).filter((x): x is string => !!x)),
      ];
      const porEmbalagemDoItem = new Map<string, number>();
      if (idsExistentes.length) {
        const { data: achados, error } = await supabase
          .from("estoque_itens")
          .select("id, unidades_por_embalagem")
          .eq("owner_id", context.ownerId)
          .eq("ativo", true)
          .in("id", idsExistentes);
        if (error) throw new Error(error.message);
        for (const i of achados ?? [])
          porEmbalagemDoItem.set(String(i.id), numero(i.unidades_por_embalagem) || 1);
        if (porEmbalagemDoItem.size !== idsExistentes.length)
          throw new Error("Um dos itens não foi encontrado.");
      }

      // Os itens novos: se já existe um com o mesmo nome, usa-o em vez de duplicar.
      const nomesNovos = new Map<string, NonNullable<LinhaParaLancar["novoItem"]>>();
      for (const l of data.linhas)
        if (l.novoItem) nomesNovos.set(l.novoItem.nome.toLowerCase(), l.novoItem);
      const idDoNovo = new Map<string, string>();
      const criadosAgora: string[] = [];
      if (nomesNovos.size) {
        const { data: iguais } = await supabase
          .from("estoque_itens")
          .select("id, nome")
          .eq("owner_id", context.ownerId)
          .eq("ativo", true);
        for (const i of iguais ?? []) {
          const chave = String(i.nome).toLowerCase();
          if (nomesNovos.has(chave)) idDoNovo.set(chave, String(i.id));
        }
        const aCriar = [...nomesNovos.entries()].filter(([k]) => !idDoNovo.has(k));
        if (aCriar.length) {
          const { data: criados, error } = await supabase
            .from("estoque_itens")
            .insert(
              aCriar.map(([, n]) => ({
                owner_id: context.ownerId,
                nome: n.nome,
                categoria: n.categoria,
                rotulo_embalagem: n.rotuloEmbalagem,
                rotulo_unidade: n.rotuloUnidade,
                unidades_por_embalagem: n.unidadesPorEmbalagem,
              })),
            )
            .select("id, nome");
          if (error) throw new Error(error.message);
          for (const c of criados ?? []) {
            idDoNovo.set(String(c.nome).toLowerCase(), String(c.id));
            criadosAgora.push(String(c.id));
          }
        }
      }

      const hoje = clinicTodayStr();
      const dia = diaDoLancamento(data.documento.data, hoje);
      const quando = dia ? `${dia}T12:00:00-03:00` : new Date().toISOString();
      const motivoPadrao =
        data.modo === "nota"
          ? marca
          : data.modo === "produtos"
            ? "Foto de produtos (lida por IA)"
            : "Folha de contagem (lida por IA)";

      // As linhas viram movimentos.
      const linhas = data.linhas.map((l) => {
        const itemId = l.itemId ?? idDoNovo.get(String(l.novoItem?.nome).toLowerCase()) ?? "";
        const por = l.itemId
          ? (porEmbalagemDoItem.get(l.itemId) ?? 1)
          : (l.novoItem?.unidadesPorEmbalagem ?? 1);
        return { itemId, unidades: emUnidades(l.caixas, l.avulsas, por), custoTotal: l.custoTotal };
      });
      if (linhas.some((l) => !l.itemId))
        throw new Error("Não foi possível identificar um dos itens.");

      let movimentos: Record<string, unknown>[] = [];
      let semMudanca = 0;
      if (data.modo === "contagem") {
        // A folha é a verdade: o item repetido vale pela última linha.
        const contado = new Map<string, number>();
        for (const l of linhas) contado.set(l.itemId, l.unidades);
        const { data: saldos } = await supabase
          .from("estoque_saldos")
          .select("item_id, quantidade")
          .eq("owner_id", context.ownerId)
          .eq("unit_id", unitId)
          .in("item_id", [...contado.keys()]);
        const atual = new Map<string, number>(
          ((saldos ?? []) as { item_id: string; quantidade: number }[]).map((s) => [
            String(s.item_id),
            numero(s.quantidade),
          ]),
        );
        for (const [itemId, valor] of contado) {
          const diferenca = Math.round((valor - (atual.get(itemId) ?? 0)) * 1000) / 1000;
          if (diferenca === 0) {
            semMudanca++;
            continue;
          }
          movimentos.push({
            item_id: itemId,
            tipo: "ajuste",
            quantidade: diferenca,
            motivo: motivoPadrao,
          });
        }
      } else {
        movimentos = linhas
          .filter((l) => l.unidades > 0)
          .map((l) => ({
            item_id: l.itemId,
            tipo: "entrada",
            quantidade: l.unidades,
            custo_total: l.custoTotal,
            custo_unitario: l.custoTotal == null ? null : custoPorUnidade(l.custoTotal, l.unidades),
            fornecedor: data.documento.fornecedor || null,
            motivo: motivoPadrao,
          }));
        semMudanca = linhas.length - movimentos.length;
      }

      if (!movimentos.length) {
        // Nada a lançar: os itens novos criados à toa saem de novo.
        if (criadosAgora.length)
          await supabase
            .from("estoque_itens")
            .delete()
            .in("id", criadosAgora)
            .eq("owner_id", context.ownerId);
        return { lancadas: 0, itensNovos: 0, ajustes: 0, semMudanca };
      }

      // Uma gravação só: ou entra tudo ou nada.
      const { error } = await supabase.from("estoque_movimentos").insert(
        movimentos.map((m) => ({
          owner_id: context.ownerId,
          unit_id: unitId,
          ocorreu_em: quando,
          criado_por: (context as any).userId ?? null,
          ...m,
        })),
      );
      if (error) {
        // Não deixa itens novos órfãos de uma leitura que não entrou.
        if (criadosAgora.length)
          await supabase
            .from("estoque_itens")
            .delete()
            .in("id", criadosAgora)
            .eq("owner_id", context.ownerId);
        throw new Error(error.message);
      }
      return {
        lancadas: data.modo === "contagem" ? 0 : movimentos.length,
        itensNovos: criadosAgora.length,
        ajustes: data.modo === "contagem" ? movimentos.length : 0,
        semMudanca,
      };
    },
  );
