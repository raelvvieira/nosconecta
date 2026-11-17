// A leitura de nota, foto de produto e folha de contagem pela IA.
//
// Este arquivo é só a parte que PENSA, sem rede nem banco: o que se pede ao
// modelo, o formato em que ele responde, e como a resposta vira uma proposta
// que a pessoa confere. A IA nunca lança nada sozinha: ela lê, a pessoa vê o
// que foi entendido (e corrige), e só então o sistema grava.
//
// O modelo recebe a lista de itens que a clínica já cadastrou, com um código
// curto (I1, I2…). Assim "Luva nitrílica M cx c/100" na nota casa com o item
// "Luva de procedimento M" já existente, em vez de nascer um item duplicado.
import { emCaixas, emUnidades } from "./estoque";

export type ModoDaLeitura = "nota" | "produtos" | "contagem";

export const MODOS_DA_LEITURA: { valor: ModoDaLeitura; rotulo: string; ajuda: string }[] = [
  {
    valor: "nota",
    rotulo: "Nota fiscal ou pedido de compra",
    ajuda: "Lê os itens, as quantidades e os preços e lança como entrada.",
  },
  {
    valor: "produtos",
    rotulo: "Foto de produtos",
    ajuda: "Reconhece o que está na foto (caixas, rótulos) e dá entrada. O preço fica em branco.",
  },
  {
    valor: "contagem",
    rotulo: "Folha de contagem",
    ajuda: "Lê uma lista do que existe de verdade e ajusta o saldo para bater com ela.",
  },
];

/** O item já cadastrado, como o modelo precisa vê-lo. */
export interface ItemConhecido {
  id: string;
  nome: string;
  categoria: string | null;
  rotuloEmbalagem: string;
  rotuloUnidade: string;
  unidadesPorEmbalagem: number;
}

/** No máximo isto vai ao modelo: uma lista maior estoura o pedido sem ajudar. */
export const MAXIMO_DE_ITENS_NO_PEDIDO = 300;
export const MAXIMO_DE_LINHAS = 80;

export interface ItemComCodigo extends ItemConhecido {
  codigo: string;
}

export function catalogoDeItens(itens: readonly ItemConhecido[]): ItemComCodigo[] {
  return itens.slice(0, MAXIMO_DE_ITENS_NO_PEDIDO).map((i, n) => ({ ...i, codigo: `I${n + 1}` }));
}

// ── O pedido ────────────────────────────────────────────────────────────────

const REGRAS_COMUNS = [
  "Você lê imagens e PDFs para o estoque de uma clínica odontológica e de estética.",
  "Leia SÓ o que está escrito ou visível. Não invente item, quantidade, preço, data nem fornecedor.",
  "Se um dado não está legível, deixe vazio (texto) ou null (número) e explique em `avisos`.",
  "Números no padrão brasileiro: vírgula é decimal e ponto separa milhar. Devolva sempre como número normal (1234.5).",
  "Uma linha para cada produto diferente. Não some produtos diferentes e não repita o mesmo produto.",
  "Se uma linha parece ser frete, imposto, desconto ou total, NÃO a coloque em `linhas`: use `avisos` ou o valor total do documento.",
  "Casamento com o que já está cadastrado: se a linha for claramente o mesmo produto de um item da lista, devolva o código dele em `codigoDoItem` (I1, I2…). Se não houver correspondência segura, devolva vazio. Na dúvida, vazio: criar um item novo é melhor que somar no item errado.",
];

const REGRAS_DO_MODO: Record<ModoDaLeitura, string[]> = {
  nota: [
    "O documento é uma nota fiscal, cupom ou pedido de compra.",
    "`quantidade` é a quantidade COMPRADA da linha. `medida` diz o que ela conta: 'embalagem' (caixas, pacotes, frascos, kits, fardos) ou 'unidade' (peças soltas).",
    "Se a nota diz 'CX c/100' ou 'pacote com 50', a medida é 'embalagem' e `unidadesPorEmbalagem` é 100 ou 50. Se não dá para saber, `unidadesPorEmbalagem` é null.",
    "`valorTotal` é o total pago pela linha (já com a quantidade). `valorUnitario` é o preço de uma ÚNICA medida da linha (de cada embalagem, ou de cada unidade, conforme `medida`). Se a nota traz só um, deixe o outro null.",
  ],
  produtos: [
    "A imagem mostra produtos (caixas, frascos, rótulos), não um documento com preços.",
    "Reconheça o nome comercial e a apresentação escritos no rótulo. Conte as embalagens visíveis em `quantidade` com medida 'embalagem'.",
    "Não há preço: `valorTotal` e `valorUnitario` são null.",
    "Se a quantidade não dá para contar com segurança, use a que você vê e coloque a confiança como 'baixa'.",
  ],
  contagem: [
    "O documento é uma folha de CONTAGEM do estoque (lista do que existe agora, escrita à mão ou impressa).",
    "`quantidade` é quanto existe de verdade daquele item. Use medida 'embalagem' se a folha conta caixas e 'unidade' se conta peças soltas.",
    "Não há preço: `valorTotal` e `valorUnitario` são null.",
  ],
};

export function instrucaoDaLeitura(modo: ModoDaLeitura): string {
  return [...REGRAS_COMUNS, ...REGRAS_DO_MODO[modo]].join("\n");
}

export function pedidoDaLeitura(args: {
  itens: readonly ItemComCodigo[];
  observacao: string;
  arquivos: number;
}): string {
  const lista = args.itens.length
    ? args.itens
        .map(
          (i) =>
            `${i.codigo} | ${i.nome} | vem em ${i.rotuloEmbalagem} com ${i.unidadesPorEmbalagem} ${i.rotuloUnidade}(s)`,
        )
        .join("\n")
    : "(nenhum item cadastrado ainda)";
  return [
    `Há ${args.arquivos} arquivo(s) anexado(s). Leia todos e junte as linhas num resultado só.`,
    args.observacao.trim()
      ? `Observação de quem enviou: ${args.observacao.trim().slice(0, 300)}`
      : "",
    "",
    "Itens já cadastrados na clínica (código | nome | embalagem):",
    lista,
  ]
    .filter((l, i, a) => l !== "" || a[i - 1] !== "")
    .join("\n");
}

/** O formato estrito da resposta: todos os campos presentes, os ausentes como null/vazio. */
export const FORMATO_DA_LEITURA = {
  type: "json_schema" as const,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["documento", "linhas", "avisos"],
    properties: {
      documento: {
        type: "object",
        additionalProperties: false,
        required: ["fornecedor", "data", "numero", "valorTotal"],
        properties: {
          fornecedor: { type: "string", description: "Quem vendeu. Vazio se não aparecer." },
          data: { type: "string", description: "AAAA-MM-DD da emissão. Vazio se não aparecer." },
          numero: {
            type: "string",
            description: "Número da nota ou do pedido. Vazio se não houver.",
          },
          valorTotal: { type: ["number", "null"], description: "Total do documento." },
        },
      },
      linhas: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "descricao",
            "codigoDoItem",
            "quantidade",
            "medida",
            "unidadesPorEmbalagem",
            "valorTotal",
            "valorUnitario",
            "categoria",
            "confianca",
            "observacao",
          ],
          properties: {
            descricao: { type: "string", description: "O nome do produto como está no documento." },
            codigoDoItem: { type: "string", description: "I1, I2… do item cadastrado, ou vazio." },
            quantidade: { type: "number" },
            medida: { type: "string", enum: ["embalagem", "unidade"] },
            unidadesPorEmbalagem: { type: ["number", "null"] },
            valorTotal: { type: ["number", "null"] },
            valorUnitario: { type: ["number", "null"] },
            categoria: {
              type: "string",
              description: "Uma palavra (Descartáveis, Anestésicos…) ou vazio.",
            },
            confianca: { type: "string", enum: ["alta", "media", "baixa"] },
            observacao: { type: "string", description: "Dúvida sobre esta linha, ou vazio." },
          },
        },
      },
      avisos: {
        type: "array",
        items: { type: "string" },
        description: "Tudo que ficou ilegível, estranho ou foi deixado de fora.",
      },
    },
  },
};

// ── A resposta ──────────────────────────────────────────────────────────────

export interface LinhaProposta {
  descricao: string;
  /** O item cadastrado em que a linha casou, ou `null` (item novo). */
  itemId: string | null;
  /** Para item novo: o que dá para dizer dele. */
  novoItem: {
    nome: string;
    categoria: string | null;
    rotuloEmbalagem: string;
    rotuloUnidade: string;
    unidadesPorEmbalagem: number;
  } | null;
  caixas: number;
  avulsas: number;
  /** Total em unidades, já considerando a embalagem do item. */
  unidades: number;
  custoTotal: number | null;
  confianca: "alta" | "media" | "baixa";
  avisos: string[];
}

export interface LeituraDaNota {
  documento: { fornecedor: string; data: string; numero: string; valorTotal: number | null };
  linhas: LinhaProposta[];
  avisos: string[];
}

const arredondar = (n: number, casas: number) => {
  const f = 10 ** casas;
  return Math.round((n + Number.EPSILON) * f) / f;
};

/** Número vindo do modelo: aceita 12.5, "12,50" e "1.234,56"; o resto é nulo. */
export function numeroDoModelo(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const t = v.trim().replace(/[^\d.,-]/g, "");
  if (!t) return null;
  const normal = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Data AAAA-MM-DD válida; qualquer outra coisa vira vazio. */
export function dataDoDocumento(v: unknown): string {
  const t = texto(v, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return "";
  const d = new Date(`${t}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== t ? "" : t;
}

/**
 * A resposta do modelo virando proposta.
 *
 * Na dúvida, descarta a linha (com aviso) em vez de inventar: uma linha que não
 * dá para entender não pode virar saldo. O que o modelo disser nunca passa
 * direto: quantidade, preço e casamento são revalidados aqui.
 */
export function lerRespostaDaLeitura(
  bruto: string,
  itens: readonly ItemComCodigo[],
  modo: ModoDaLeitura,
): LeituraDaNota {
  const vazio: LeituraDaNota = {
    documento: { fornecedor: "", data: "", numero: "", valorTotal: null },
    linhas: [],
    avisos: ["Não consegui entender a resposta da IA. Tente de novo com uma foto mais nítida."],
  };
  let o: Record<string, unknown>;
  try {
    const t = String(bruto ?? "");
    const de = t.indexOf("{");
    const ate = t.lastIndexOf("}");
    if (de < 0 || ate <= de) return vazio;
    o = JSON.parse(t.slice(de, ate + 1)) as Record<string, unknown>;
  } catch {
    return vazio;
  }

  const doc = (o.documento ?? {}) as Record<string, unknown>;
  const documento = {
    fornecedor: texto(doc.fornecedor, 80),
    data: dataDoDocumento(doc.data),
    numero: texto(doc.numero, 40),
    valorTotal: ((n) => (n != null && n >= 0 ? arredondar(n, 2) : null))(
      numeroDoModelo(doc.valorTotal),
    ),
  };

  const porCodigo = new Map(itens.map((i) => [i.codigo.toUpperCase(), i]));
  const avisos: string[] = Array.isArray(o.avisos)
    ? o.avisos
        .map((a) => texto(a, 200))
        .filter(Boolean)
        .slice(0, 10)
    : [];
  const linhas: LinhaProposta[] = [];
  const brutas = Array.isArray(o.linhas) ? (o.linhas as Record<string, unknown>[]) : [];
  if (brutas.length > MAXIMO_DE_LINHAS) {
    avisos.push(
      `A leitura trouxe ${brutas.length} linhas; só as primeiras ${MAXIMO_DE_LINHAS} foram mantidas.`,
    );
  }

  for (const l of brutas.slice(0, MAXIMO_DE_LINHAS)) {
    const descricao = texto(l?.descricao, 120);
    if (!descricao) continue;
    const quantidade = numeroDoModelo(l.quantidade);
    if (quantidade == null || !(quantidade > 0) || quantidade > 1_000_000) {
      avisos.push(`"${descricao}": quantidade ilegível, a linha ficou de fora.`);
      continue;
    }
    const conhecido = porCodigo.get(texto(l.codigoDoItem, 10).toUpperCase()) ?? null;
    const medida = l.medida === "unidade" ? "unidade" : "embalagem";
    const confiancaLida = l.confianca === "alta" || l.confianca === "baixa" ? l.confianca : "media";
    const avisosDaLinha: string[] = [];
    const observacao = texto(l.observacao, 160);
    if (observacao) avisosDaLinha.push(observacao);

    // Quantas peças vêm em cada embalagem: a do item cadastrado manda; sem ele,
    // a que a nota disse; sem nenhuma, 1 (e a pessoa é avisada).
    const dita = numeroDoModelo(l.unidadesPorEmbalagem);
    let por = conhecido
      ? conhecido.unidadesPorEmbalagem
      : dita && dita > 0 && dita <= 1_000_000
        ? dita
        : 1;
    if (!conhecido && medida === "embalagem" && !(dita && dita > 0)) {
      avisosDaLinha.push(
        "Quantas unidades vêm em cada caixa não está na nota: confira antes de lançar.",
      );
    }
    if (conhecido && dita && dita > 0 && Math.abs(dita - conhecido.unidadesPorEmbalagem) > 1e-9) {
      avisosDaLinha.push(
        `A nota diz ${dita} por embalagem, o cadastro tem ${conhecido.unidadesPorEmbalagem}. Vale conferir.`,
      );
    }
    if (!conhecido) por = por > 0 ? por : 1;

    const unidades =
      medida === "embalagem" ? emUnidades(quantidade, 0, por) : emUnidades(0, quantidade, por);
    const { caixas, avulsas } = emCaixas(unidades, por);

    // O preço: o total da linha; senão, o preço de uma medida vezes a quantidade.
    let custoTotal: number | null = null;
    if (modo !== "contagem") {
      const total = numeroDoModelo(l.valorTotal);
      const unitario = numeroDoModelo(l.valorUnitario);
      if (total != null && total >= 0) custoTotal = arredondar(total, 2);
      else if (unitario != null && unitario >= 0) custoTotal = arredondar(unitario * quantidade, 2);
    }

    linhas.push({
      descricao,
      itemId: conhecido?.id ?? null,
      novoItem: conhecido
        ? null
        : {
            nome: descricao,
            categoria: texto(l.categoria, 60) || null,
            rotuloEmbalagem: "caixa",
            rotuloUnidade: "unidade",
            unidadesPorEmbalagem: por,
          },
      caixas,
      avulsas,
      unidades,
      custoTotal,
      confianca: confiancaLida,
      avisos: avisosDaLinha,
    });
  }

  if (!linhas.length && !avisos.length) avisos.push("Não encontrei nenhum item nesta imagem.");
  return { documento, linhas, avisos };
}

// ── O que a pessoa confirma ─────────────────────────────────────────────────

/** A data do documento vale para o histórico só se for recente e não for futura. */
export function diaDoLancamento(
  dataDoDoc: string,
  hoje: string,
  maximoDeDias = 120,
): string | null {
  if (!dataDoDoc || dataDoDoc > hoje) return null;
  const dias = Math.round(
    (Date.parse(`${hoje}T12:00:00Z`) - Date.parse(`${dataDoDoc}T12:00:00Z`)) / 86_400_000,
  );
  return dias <= maximoDeDias ? dataDoDoc : null;
}

/** A marca que impede lançar a mesma nota duas vezes. */
export function marcaDaNota(numero: string, fornecedor: string): string | null {
  const n = numero.trim();
  if (!n) return null;
  const f = fornecedor.trim();
  return f ? `Nota ${n} · ${f}`.slice(0, 160) : `Nota ${n}`;
}
