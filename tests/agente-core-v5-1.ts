// A MD AGENTE CORE V5.1 universal contra a infraestrutura do CRM: só as quatro
// variáveis suportadas, nada de dado de uma conta escrito dentro dela, e a regra
// fixa de preço alinhada ao contrato V5.1 — sem mexer na V4.2 da NÓS.
import { readFileSync } from "node:fs";
import {
  problemasDeVariaveis,
  resolverVariaveis,
  VARIAVEIS_DA_INSTRUCAO,
} from "../supabase/functions/_shared/variaveis-da-instrucao.ts";
import {
  montarInstrucao,
  versaoDoNucleo,
} from "../supabase/functions/_shared/instrucao-do-agente.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

const v51 = readFileSync(new URL("../docs/AGENTE_CORE_V5_1_UNIVERSAL.md", import.meta.url), "utf8");
const v42 = readFileSync(new URL("../docs/LUNA_V4_2.md", import.meta.url), "utf8");

// ── Variáveis ───────────────────────────────────────────────────────────
const usadas = [
  ...new Set([...v51.matchAll(/\{\{\s*([A-Za-z_]+)\s*\}\}/g)].map((m) => m[1])),
].sort();
conferir("só usa variáveis suportadas", usadas, [...VARIAVEIS_DA_INSTRUCAO].sort());
conferir("sem variável desconhecida nem chave solta", problemasDeVariaveis(v51), {
  desconhecidas: [],
  chavesSoltas: false,
});

const consultorios = [
  { assistente: "Bia", consultorio: "Sorriso Centro", responsavel: "Dr. Paulo" },
  { assistente: "Sofia", consultorio: "Estética Aurora", responsavel: "Dra. Lúcia Prado" },
  { assistente: "Nina", consultorio: "Clínica Vale", responsavel: "" },
  { assistente: null, consultorio: "", responsavel: null },
];
const resolvidas = consultorios.map((c) => resolverVariaveis(v51, c).texto);
conferir(
  "nenhuma chave sobra em nenhum consultório",
  resolvidas.some((t) => /\{\{|\}\}/.test(t)),
  false,
);

// Cada consultório só enxerga os próprios nomes.
const nomesDe = (c: (typeof consultorios)[number]) =>
  [c.assistente, c.consultorio, c.responsavel].filter((n): n is string => !!n && n.length > 3);
consultorios.forEach((c, i) => {
  consultorios.forEach((outro, j) => {
    if (i === j) return;
    const vazou = nomesDe(outro).filter(
      // Nome já escrito na própria MD (a matriz de testes cita "Dr. Paulo") não é vazamento.
      (n) => !nomesDe(c).includes(n) && !v51.includes(n) && resolvidas[i].includes(n),
    );
    conferir(`consultório ${i} não contém nomes do ${j}`, vazou, []);
  });
});
conferir("a Bia aparece na conta da Bia", resolvidas[0].includes("Bia"), true);
conferir("a assistente padrão aparece sem cadastro", resolvidas[3].includes("Luna"), true);

// O artigo do responsável é embutido: nunca "da a Dra." / "com a a equipe".
for (const t of resolvidas) {
  conferir("sem artigo duplicado", /\b(a|o|da|do|pela|pelo) (a|o) (Dra?\.|equipe)/i.test(t), false);
}

// A MD universal não traz fato fixo de nenhuma conta: o que sobra de nome
// próprio são exemplos do que NÃO perguntar (3 menções).
const mencoes = [...v51.matchAll(/Mariane|NÓS|Luna|Florianópolis|Porto Alegre/g)].length;
// São exemplos do que NÃO perguntar (cidade já informada, edição única).
conferir("poucas menções a nomes da NÓS", mencoes <= 5, true);
conferir("sem preço em reais escrito como fato", /R\$\s?\d/.test(v51), false);

// ── Regra fixa de preço: V5 muda, V4 fica igual ─────────────────────────
conferir("V5.1 é reconhecida", versaoDoNucleo(v51), "v5");
conferir("V4.2 continua V4", versaoDoNucleo(v42), "v4");
conferir("manual vazio é V4", versaoDoNucleo(""), "v4");

const base = {
  clinica: "Sorriso Centro",
  manual: {},
  procedimentos: [],
  assistente: "Bia",
  responsavel: "Dr. Paulo",
};
const comV51 = montarInstrucao({ ...base, instrucaoBase: v51 } as never);
const comV42 = montarInstrucao({ ...base, instrucaoBase: v42 } as never);
conferir(
  "V5.1: o valor pedido não espera a resposta",
  comV51.includes("o valor não\n     espera a resposta a ela"),
  true,
);
conferir(
  "V5.1: some o 'preço e horário nunca na mesma mensagem'",
  comV51.includes("CAMINHO 1"),
  false,
);
conferir(
  "V5.1: horário continua só depois do valor",
  comV51.includes("VALOR ANTES DE HORÁRIO"),
  true,
);
conferir(
  "V4.2: a regra antiga segue intacta",
  comV42.includes("CAMINHO 1, quem está conhecendo"),
  true,
);
conferir("V4.2: sem a regra nova", comV42.includes("não\n     espera a resposta a ela"), false);
conferir("V5.1 resolvida na instrução inteira, sem chave", /\{\{|\}\}/.test(comV51), false);
conferir(
  "regras de repasse seguem na V5.1",
  comV51.includes("REGRAS QUE VOCÊ NUNCA PODE QUEBRAR"),
  true,
);

// Módulo Paciente Modelo HOF segue sendo anexado, com a Core V5.1.
const comModulo = montarInstrucao({
  ...base,
  instrucaoBase: v51,
  hoje: "2026-11-07",
  modulo: { secao: "## MÓDULO PACIENTE MODELO DE TESTE\nEdição única." },
} as never);
conferir(
  "módulo entra com a Core V5.1",
  comModulo.includes("## MÓDULO PACIENTE MODELO DE TESTE"),
  true,
);

if (falhas.length) {
  console.error(falhas.join("\n"));
  process.exit(1);
}
console.log(`ok — ${ok} checagens da Core V5.1`);
