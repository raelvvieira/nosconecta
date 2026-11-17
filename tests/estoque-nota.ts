// A leitura de nota por IA: pedido, formato e a resposta virando proposta.
//
// O que não pode acontecer: uma linha que a IA entendeu mal virar saldo (a
// resposta nunca passa direto), uma nota casar com o item errado, o mesmo
// produto ser somado com a embalagem errada, ou a mesma nota ser lançada duas
// vezes sem aviso.
import {
  catalogoDeItens,
  dataDoDocumento,
  diaDoLancamento,
  FORMATO_DA_LEITURA,
  instrucaoDaLeitura,
  lerRespostaDaLeitura,
  marcaDaNota,
  MAXIMO_DE_LINHAS,
  numeroDoModelo,
  pedidoDaLeitura,
  type ItemConhecido,
} from "../src/lib/estoque/nota.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

const conhecidos: ItemConhecido[] = [
  {
    id: "uuid-luva",
    nome: "Luva de procedimento M",
    categoria: "Descartáveis",
    rotuloEmbalagem: "caixa",
    rotuloUnidade: "unidade",
    unidadesPorEmbalagem: 100,
  },
  {
    id: "uuid-anestesico",
    nome: "Articaína 4%",
    categoria: "Anestésicos",
    rotuloEmbalagem: "caixa",
    rotuloUnidade: "tubete",
    unidadesPorEmbalagem: 50,
  },
];
const itens = catalogoDeItens(conhecidos);

// ── O catálogo e o pedido ──────────────────────────────────────────────────
conferir(
  "códigos I1, I2",
  itens.map((i) => i.codigo),
  ["I1", "I2"],
);
conferir(
  "catálogo é cortado em 300",
  catalogoDeItens(Array.from({ length: 350 }, (_, n) => ({ ...conhecidos[0], id: `i${n}` })))
    .length,
  300,
);
const pedido = pedidoDaLeitura({ itens, observacao: "Pedido da Dental Sul", arquivos: 2 });
conferir(
  "pedido lista o item com o código",
  pedido.includes("I1 | Luva de procedimento M | vem em caixa com 100 unidade(s)"),
  true,
);
conferir("pedido traz a observação", pedido.includes("Pedido da Dental Sul"), true);
conferir("pedido diz quantos arquivos", pedido.includes("2 arquivo(s)"), true);
conferir(
  "pedido sem itens avisa",
  pedidoDaLeitura({ itens: [], observacao: "", arquivos: 1 }).includes("nenhum item cadastrado"),
  true,
);
conferir(
  "instrução da nota fala de preço",
  instrucaoDaLeitura("nota").includes("valorTotal"),
  true,
);
conferir(
  "instrução da contagem diz que não há preço",
  instrucaoDaLeitura("contagem").includes("Não há preço"),
  true,
);
conferir("instrução proíbe inventar", instrucaoDaLeitura("nota").includes("Não invente"), true);
conferir(
  "o formato exige todos os campos da linha",
  (FORMATO_DA_LEITURA.schema as any).properties.linhas.items.required.length,
  10,
);

// ── Números e datas ─────────────────────────────────────────────────────────
conferir("número normal", numeroDoModelo(12.5), 12.5);
conferir("vírgula decimal", numeroDoModelo("12,50"), 12.5);
conferir("milhar e vírgula", numeroDoModelo("1.234,56"), 1234.56);
conferir("com R$", numeroDoModelo("R$ 89,90"), 89.9);
conferir("texto vira nulo", numeroDoModelo("abc"), null);
conferir("vazio vira nulo", numeroDoModelo(""), null);
conferir("infinito vira nulo", numeroDoModelo(Infinity), null);
conferir("data certa", dataDoDocumento("2026-11-10"), "2026-11-10");
conferir("data impossível", dataDoDocumento("2026-02-31"), "");
conferir("data em outro formato", dataDoDocumento("10/11/2026"), "");

// ── Uma nota boa ────────────────────────────────────────────────────────────
const resposta = JSON.stringify({
  documento: { fornecedor: "Dental Sul", data: "2026-11-10", numero: "5531", valorTotal: 1020 },
  linhas: [
    // Casa com o item cadastrado: 3 caixas de 100 a R$ 90 cada.
    {
      descricao: "Luva nitrílica M CX C/100",
      codigoDoItem: "I1",
      quantidade: 3,
      medida: "embalagem",
      unidadesPorEmbalagem: 100,
      valorTotal: 270,
      valorUnitario: 90,
      categoria: "",
      confianca: "alta",
      observacao: "",
    },
    // Item novo, só com o preço de cada caixa.
    {
      descricao: "Sugador descartável pct 40",
      codigoDoItem: "",
      quantidade: 5,
      medida: "embalagem",
      unidadesPorEmbalagem: 40,
      valorTotal: null,
      valorUnitario: 12.5,
      categoria: "Descartáveis",
      confianca: "media",
      observacao: "",
    },
    // Peças soltas.
    {
      descricao: "Espelho clínico nº5",
      codigoDoItem: "",
      quantidade: 10,
      medida: "unidade",
      unidadesPorEmbalagem: null,
      valorTotal: 150,
      valorUnitario: null,
      categoria: "",
      confianca: "alta",
      observacao: "",
    },
  ],
  avisos: [],
});
const lida = lerRespostaDaLeitura(resposta, itens, "nota");
conferir("fornecedor", lida.documento.fornecedor, "Dental Sul");
conferir("número da nota", lida.documento.numero, "5531");
conferir("total do documento", lida.documento.valorTotal, 1020);
conferir("três linhas", lida.linhas.length, 3);
const [luva, sugador, espelho] = lida.linhas;
conferir("luva casa com o item cadastrado", luva.itemId, "uuid-luva");
conferir("luva não vira item novo", luva.novoItem, null);
conferir("3 caixas de 100 são 300 unidades", luva.unidades, 300);
conferir("luva em caixas", [luva.caixas, luva.avulsas], [3, 0]);
conferir("luva: valor total", luva.custoTotal, 270);
conferir("sugador é item novo", sugador.itemId, null);
conferir("sugador: 40 por pacote", sugador.novoItem?.unidadesPorEmbalagem, 40);
conferir("sugador: 5 pacotes de 40", sugador.unidades, 200);
conferir("sugador: preço da caixa vezes a quantidade", sugador.custoTotal, 62.5);
conferir("espelho: peças soltas", espelho.unidades, 10);
conferir("espelho: embalagem de 1", espelho.novoItem?.unidadesPorEmbalagem, 1);
conferir("espelho: sem aviso de embalagem (é unidade)", espelho.avisos, []);

// ── A resposta nunca passa direto ───────────────────────────────────────────
const suja = lerRespostaDaLeitura(
  JSON.stringify({
    documento: { fornecedor: "X", data: "ontem", numero: "", valorTotal: "-5" },
    linhas: [
      {
        descricao: "Sem quantidade",
        codigoDoItem: "",
        quantidade: 0,
        medida: "embalagem",
        unidadesPorEmbalagem: null,
        valorTotal: 10,
        valorUnitario: null,
        categoria: "",
        confianca: "alta",
        observacao: "",
      },
      {
        descricao: "Quantidade absurda",
        codigoDoItem: "",
        quantidade: 99999999,
        medida: "unidade",
        unidadesPorEmbalagem: null,
        valorTotal: 10,
        valorUnitario: null,
        categoria: "",
        confianca: "alta",
        observacao: "",
      },
      {
        descricao: "",
        codigoDoItem: "",
        quantidade: 4,
        medida: "unidade",
        unidadesPorEmbalagem: null,
        valorTotal: 1,
        valorUnitario: null,
        categoria: "",
        confianca: "alta",
        observacao: "",
      },
      {
        descricao: "Código que não existe",
        codigoDoItem: "I99",
        quantidade: 2,
        medida: "embalagem",
        unidadesPorEmbalagem: 10,
        valorTotal: -3,
        valorUnitario: null,
        categoria: "",
        confianca: "ótima",
        observacao: "",
      },
    ],
    avisos: ["x"],
  }),
  itens,
  "nota",
);
conferir("data torta vira vazio", suja.documento.data, "");
conferir("total negativo vira nulo", suja.documento.valorTotal, null);
conferir("só a linha válida fica", suja.linhas.length, 1);
conferir("código inexistente não casa com ninguém", suja.linhas[0].itemId, null);
conferir("preço negativo vira nulo", suja.linhas[0].custoTotal, null);
conferir("confiança desconhecida vira média", suja.linhas[0].confianca, "media");
conferir(
  "linhas descartadas deixam aviso",
  suja.avisos.some((a) => a.includes("quantidade ilegível")),
  true,
);

// Embalagem sem "por caixa" na nota: avisa em vez de chutar.
const semPor = lerRespostaDaLeitura(
  JSON.stringify({
    documento: { fornecedor: "", data: "", numero: "", valorTotal: null },
    linhas: [
      {
        descricao: "Resina A2",
        codigoDoItem: "",
        quantidade: 2,
        medida: "embalagem",
        unidadesPorEmbalagem: null,
        valorTotal: null,
        valorUnitario: null,
        categoria: "",
        confianca: "alta",
        observacao: "",
      },
    ],
    avisos: [],
  }),
  itens,
  "nota",
);
conferir(
  "embalagem sem 'por caixa' avisa",
  semPor.linhas[0].avisos.some((a) => a.includes("cada caixa")),
  true,
);
conferir("e usa 1 por embalagem", semPor.linhas[0].novoItem?.unidadesPorEmbalagem, 1);

// A nota discorda do cadastro: manda o cadastro e avisa.
const discorda = lerRespostaDaLeitura(
  JSON.stringify({
    documento: { fornecedor: "", data: "", numero: "", valorTotal: null },
    linhas: [
      {
        descricao: "Luva M",
        codigoDoItem: "I1",
        quantidade: 2,
        medida: "embalagem",
        unidadesPorEmbalagem: 50,
        valorTotal: 100,
        valorUnitario: null,
        categoria: "",
        confianca: "alta",
        observacao: "",
      },
    ],
    avisos: [],
  }),
  itens,
  "nota",
);
conferir("manda o cadastro (100 por caixa)", discorda.linhas[0].unidades, 200);
conferir(
  "avisa a divergência",
  discorda.linhas[0].avisos.some((a) => a.includes("cadastro tem 100")),
  true,
);

// Contagem e produtos: sem preço.
const contagem = lerRespostaDaLeitura(
  JSON.stringify({
    documento: { fornecedor: "", data: "", numero: "", valorTotal: null },
    linhas: [
      {
        descricao: "Articaína",
        codigoDoItem: "I2",
        quantidade: 1.5,
        medida: "embalagem",
        unidadesPorEmbalagem: null,
        valorTotal: 80,
        valorUnitario: 80,
        categoria: "",
        confianca: "alta",
        observacao: "",
      },
    ],
    avisos: [],
  }),
  itens,
  "contagem",
);
conferir("contagem ignora preço", contagem.linhas[0].custoTotal, null);
conferir("1,5 caixa de 50 = 75 unidades", contagem.linhas[0].unidades, 75);
conferir(
  "1,5 caixa em caixas e soltas",
  [contagem.linhas[0].caixas, contagem.linhas[0].avulsas],
  [1, 25],
);

// Respostas ruins não quebram.
conferir("lixo vira aviso", lerRespostaDaLeitura("não sei", itens, "nota").linhas.length, 0);
conferir("lixo explica", lerRespostaDaLeitura("não sei", itens, "nota").avisos.length > 0, true);
conferir(
  "JSON quebrado vira aviso",
  lerRespostaDaLeitura('{"linhas": [', itens, "nota").linhas.length,
  0,
);
conferir(
  "JSON embrulhado em texto ainda lê",
  lerRespostaDaLeitura("```json\n" + resposta + "\n```", itens, "nota").linhas.length,
  3,
);
conferir(
  "vazio avisa que não achou nada",
  lerRespostaDaLeitura('{"documento":{},"linhas":[],"avisos":[]}', itens, "nota").avisos[0],
  "Não encontrei nenhum item nesta imagem.",
);

// Limite de linhas.
const muitas = lerRespostaDaLeitura(
  JSON.stringify({
    documento: { fornecedor: "", data: "", numero: "", valorTotal: null },
    linhas: Array.from({ length: MAXIMO_DE_LINHAS + 20 }, (_, n) => ({
      descricao: `Item ${n}`,
      codigoDoItem: "",
      quantidade: 1,
      medida: "unidade",
      unidadesPorEmbalagem: null,
      valorTotal: 1,
      valorUnitario: null,
      categoria: "",
      confianca: "alta",
      observacao: "",
    })),
    avisos: [],
  }),
  itens,
  "nota",
);
conferir("corta no máximo de linhas", muitas.linhas.length, MAXIMO_DE_LINHAS);
conferir(
  "e avisa do corte",
  muitas.avisos.some((a) => a.includes("só as primeiras")),
  true,
);

// ── O que vai ao histórico ──────────────────────────────────────────────────
conferir("data recente vale", diaDoLancamento("2026-11-10", "2026-11-15"), "2026-11-10");
conferir("data futura não vale", diaDoLancamento("2026-12-01", "2026-11-15"), null);
conferir("data muito antiga não vale", diaDoLancamento("2025-01-01", "2026-11-15"), null);
conferir("sem data", diaDoLancamento("", "2026-11-15"), null);
conferir("marca da nota", marcaDaNota("5531", "Dental Sul"), "Nota 5531 · Dental Sul");
conferir("marca sem fornecedor", marcaDaNota("5531", ""), "Nota 5531");
conferir("sem número não há marca", marcaDaNota("", "Dental Sul"), null);

if (falhas.length) {
  console.error(falhas.join("\n"));
  process.exit(1);
}
console.log(`estoque-nota: ${ok} checagens ok`);
