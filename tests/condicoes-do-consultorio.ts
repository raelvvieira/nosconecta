// O que cada consultório configura: avaliação, parcelamento, campanhas com
// validade e o manual-base de quem ainda não tem manual.
import {
  CONDICOES_PADRAO,
  campanhaDoBanco,
  campanhasValidas,
  comManualPadrao,
  condicoesDoBanco,
  fraseDaAvaliacao,
  fraseDoParcelamento,
  secaoDeCampanhas,
  secaoDeCondicoes,
} from "../supabase/functions/_shared/condicoes-do-consultorio.ts";
import { montarInstrucao } from "../supabase/functions/_shared/instrucao-do-agente.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

// ── Avaliação ──────────────────────────────────────────────────────────────
conferir(
  "padrão: avaliação sem custo (o que a NÓS fazia)",
  fraseDaAvaliacao(CONDICOES_PADRAO).includes("sem custo"),
  true,
);
conferir(
  "avaliação paga que abate",
  fraseDaAvaliacao({
    ...CONDICOES_PADRAO,
    avaliacaoGratuita: false,
    avaliacaoValor: 150,
    avaliacaoAbate: true,
  }),
  "A avaliação custa R$ 150, e esse valor é descontado se a pessoa fizer o tratamento.",
);
conferir(
  "avaliação paga sem valor: não inventa",
  fraseDaAvaliacao({ ...CONDICOES_PADRAO, avaliacaoGratuita: false }).includes("vai confirmar"),
  true,
);

// ── Parcelamento ───────────────────────────────────────────────────────────
conferir("sem parcelas cadastradas: nada", fraseDoParcelamento(CONDICOES_PADRAO), null);
conferir(
  "12x sem juros",
  fraseDoParcelamento({ ...CONDICOES_PADRAO, parcelasMax: 12 }),
  "No cartão, em até 12x sem juros.",
);
conferir(
  "juros a partir de 7x",
  fraseDoParcelamento({ ...CONDICOES_PADRAO, parcelasMax: 12, jurosAPartir: 7 }),
  "No cartão, em até 12x, sem juros até 6x e com juros a partir de 7x.",
);
conferir(
  "sem cartão, sem parcelamento",
  fraseDoParcelamento({ ...CONDICOES_PADRAO, formas: ["pix"], parcelasMax: 12 }),
  null,
);
const texto = secaoDeCondicoes(CONDICOES_PADRAO, "em até 12x no cartão").join("\n");
conferir(
  "texto livre antigo vale até cadastrar parcelas",
  texto.includes("em até 12x no cartão"),
  true,
);
conferir("banco vazio cai no padrão", condicoesDoBanco(null).avaliacaoGratuita, true);
conferir(
  "forma inválida é descartada",
  condicoesDoBanco({ formas_pagamento: ["pix", "cheque"] }).formas,
  ["pix"],
);

// ── Campanhas ──────────────────────────────────────────────────────────────
const black = campanhaDoBanco({
  id: "c1",
  nome: "Black Estética",
  inicio: "2026-11-01",
  fim: "2026-11-30",
  ativo: true,
  itens: [
    { nome: "Toxina botulínica", precoVista: 950, parcelas: 6, valorParcela: 179 },
    { nome: "" },
  ],
});
conferir("item sem nome sai", black.itens.length, 1);
conferir("vale dentro do período", campanhasValidas([black], "2026-11-15").length, 1);
conferir("não vale depois do fim", campanhasValidas([black], "2026-12-01").length, 0);
conferir("não vale antes do início", campanhasValidas([black], "2026-10-31").length, 0);
conferir(
  "desligada não vale",
  campanhasValidas([{ ...black, ativo: false }], "2026-11-15").length,
  0,
);
const sec = secaoDeCampanhas([black], "2026-11-15").join("\n");
conferir(
  "seção com preço, parcelas e total",
  sec.includes("Toxina botulínica: R$ 950 à vista ou 6x de R$ 179 (total R$ 1.074)"),
  true,
);
conferir("fora do período, seção vazia", secaoDeCampanhas([black], "2026-12-01").length, 0);

// ── Manual-base ────────────────────────────────────────────────────────────
const m = comManualPadrao({ tom: "Do nosso jeito" });
conferir("campo preenchido vence o padrão", m.tom, "Do nosso jeito");
conferir("campo vazio recebe o padrão", (m.saudacao ?? "").includes("não dê preço"), true);

// ── Na instrução ───────────────────────────────────────────────────────────
const base = {
  clinica: "Clínica Teste",
  manual: {},
  procedimentos: [],
  horarios: { paraOferecer: [], reserva: [], faixa: null, diasSobConsulta: [] },
  hoje: "2026-11-15",
};
const semManual = montarInstrucao(base as never);
conferir(
  "consultório novo não recebe 'ainda não aprendeu'",
  semManual.includes("ainda não aprendeu"),
  false,
);
conferir(
  "consultório novo recebe o manual-base",
  semManual.includes("recepcionista experiente"),
  true,
);
const paga = montarInstrucao({
  ...base,
  condicoes: { ...CONDICOES_PADRAO, avaliacaoGratuita: false, avaliacaoValor: 200 },
  campanhas: [black],
} as never);
conferir("avaliação paga não diz 'sem custo'", paga.includes("avaliação é sem custo"), false);
conferir("avaliação paga com valor", paga.includes("A avaliação custa R$ 200"), true);
conferir("campanha válida entra", paga.includes("Black Estética"), true);
const comPreco = montarInstrucao({
  ...base,
  condicoes: { ...CONDICOES_PADRAO, precoHarmonizacao: true },
} as never);
conferir("harmonização com preço liberado", comPreco.includes("NUNCA dá valor por aqui"), false);
conferir("harmonização padrão segue fechada", semManual.includes("NUNCA dá valor por aqui"), true);

if (falhas.length) {
  console.error(falhas.join("\n"));
  process.exit(1);
}
console.log(`condicoes-do-consultorio: ${ok} checagens ok`);
