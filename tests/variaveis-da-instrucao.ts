// As variáveis de identidade da MD: trocar certo, nunca vazar `{{...}}` para a
// IA, não alterar a MD da NÓS (sem variáveis) e nunca misturar consultórios.
import { readFileSync } from "node:fs";
import { resolverVariaveis } from "../supabase/functions/_shared/variaveis-da-instrucao.ts";
import { montarInstrucao } from "../supabase/functions/_shared/instrucao-do-agente.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}
const r = (texto: string, id: Parameters<typeof resolverVariaveis>[1]) =>
  resolverVariaveis(texto, id).texto;

// ── Troca básica, por consultório ───────────────────────────────────────
const nos = { assistente: "Luna", consultorio: "NÓS Odontologia", responsavel: "Dra. Mariane" };
const sorriso = { assistente: "Bia", consultorio: "Sorriso Centro", responsavel: "Dr. Paulo" };
const modelo =
  "Oi, aqui é {{ASSISTENTE}}, de {{CONSULTORIO}}. Avaliação com {{RESPONSAVEL}} ({{RESPONSAVEL_NOME}}).";
conferir(
  "NÓS",
  r(modelo, nos),
  "Oi, aqui é Luna, de NÓS Odontologia. Avaliação com a Dra. Mariane (Dra. Mariane).",
);
conferir(
  "outro consultório",
  r(modelo, sorriso),
  "Oi, aqui é Bia, de Sorriso Centro. Avaliação com o Dr. Paulo (Dr. Paulo).",
);
conferir("assistente com outro nome", r("{{ASSISTENTE}}", { assistente: "Sofia" }), "Sofia");
conferir(
  "responsável sem título",
  r("com {{RESPONSAVEL}}", { responsavel: "Marcos Lima" }),
  "com Marcos Lima",
);
conferir(
  "tolera espaço e minúsculas",
  r("{{ assistente }} e {{Consultorio}}", sorriso),
  "Bia e Sorriso Centro",
);
conferir("variável repetida", r("{{ASSISTENTE}}, {{ASSISTENTE}}", sorriso), "Bia, Bia");

// ── Começo de frase ─────────────────────────────────────────────────────
conferir("começo do texto", r("{{RESPONSAVEL}} atende.", nos), "A Dra. Mariane atende.");
conferir(
  "depois de ponto",
  r("Tudo certo. {{RESPONSAVEL}} atende.", nos),
  "Tudo certo. A Dra. Mariane atende.",
);
conferir("depois de linha nova", r("Oi\n{{RESPONSAVEL}} atende", nos), "Oi\nA Dra. Mariane atende");
conferir("em citação", r("> {{RESPONSAVEL}} atende", nos), "> A Dra. Mariane atende");
conferir(
  "no meio da frase fica minúscula",
  r("Fale com {{RESPONSAVEL}}.", nos),
  "Fale com a Dra. Mariane.",
);

// ── Configuração incompleta: nunca aparece `{{` ─────────────────────────
const vazio = { assistente: null, consultorio: "", responsavel: undefined };
conferir("assistente ausente vira Luna", r("{{ASSISTENTE}}", vazio), "Luna");
conferir("consultório ausente", r("de {{CONSULTORIO}}", vazio), "de o consultório");
conferir("responsável ausente", r("com {{RESPONSAVEL}}", vazio), "com a equipe");
conferir(
  "responsável ausente, começo de frase",
  r("{{RESPONSAVEL}} confirma", vazio),
  "A equipe confirma",
);
conferir("nome do responsável ausente", r("com {{RESPONSAVEL_NOME}}", vazio), "com a equipe");
conferir("só espaços", r("{{ASSISTENTE}}", { assistente: "   " }), "Luna");
const desc = resolverVariaveis("Oi {{NOME_DO_PACIENTE}} da {{CONSULTORIO}}", sorriso);
conferir("variável desconhecida some", desc.texto, "Oi  da Sorriso Centro");
conferir("e é anotada", desc.desconhecidas, ["NOME_DO_PACIENTE"]);
conferir("chaves soltas somem", r("a {{ASSISTENTE e }} b", sorriso).includes("{"), false);
conferir("texto vazio", r("", nos), "");
conferir("texto nulo", resolverVariaveis(null, nos).texto, "");

// ── Compatibilidade: a V4.2 real da NÓS passa idêntica ──────────────────
const v42 = readFileSync(new URL("../docs/LUNA_V4_2.md", import.meta.url), "utf8");
conferir("V4.2 sem variáveis passa byte a byte", r(v42, nos) === v42, true);
conferir("e com a identidade vazia também", r(v42, vazio) === v42, true);

// ── Na instrução inteira ────────────────────────────────────────────────
const base = (
  clinica: string,
  id: { assistente?: string; responsavel?: string },
  md: string | null,
) => montarInstrucao({ clinica, manual: {}, procedimentos: [], instrucaoBase: md, ...id } as never);
const mdUniversal =
  "Você é {{ASSISTENTE}}, auxiliar de {{CONSULTORIO}}. A avaliação é com {{RESPONSAVEL}}.";
const iNos = base(
  "NÓS Odontologia",
  { assistente: "Luna", responsavel: "Dra. Mariane" },
  mdUniversal,
);
const iSorriso = base(
  "Sorriso Centro",
  { assistente: "Bia", responsavel: "Dr. Paulo" },
  mdUniversal,
);
conferir(
  "instrução NÓS",
  iNos.includes("Você é Luna, auxiliar de NÓS Odontologia. A avaliação é com a Dra. Mariane."),
  true,
);
conferir(
  "instrução de outro consultório",
  iSorriso.includes("Você é Bia, auxiliar de Sorriso Centro. A avaliação é com o Dr. Paulo."),
  true,
);
conferir("nenhuma chave na instrução", iNos.includes("{{") || iSorriso.includes("{{"), false);

// Sem vazamento: um consultório nunca contém dado de outro, em qualquer ordem
// e com chamadas intercaladas.
conferir("NÓS não vê o outro", /Bia|Sorriso|Dr\. Paulo/.test(iNos), false);
conferir(
  "outro não vê a NÓS",
  /Luna|NÓS Odontologia|Mariane/.test(iSorriso.replace(/Luna/g, "")) &&
    /NÓS Odontologia|Mariane/.test(iSorriso),
  false,
);
const intercaladas = await Promise.all(
  Array.from({ length: 20 }, (_, i) =>
    Promise.resolve(
      i % 2
        ? base("Sorriso Centro", { assistente: "Bia", responsavel: "Dr. Paulo" }, mdUniversal)
        : base("NÓS Odontologia", { assistente: "Luna", responsavel: "Dra. Mariane" }, mdUniversal),
    ),
  ),
);
conferir(
  "20 chamadas intercaladas, sem mistura",
  intercaladas.every((t, i) => (i % 2 ? t === iSorriso : t === iNos)),
  true,
);

// {{CONSULTORIO}} é o consultório, não a unidade da conversa.
const comUnidade = montarInstrucao({
  clinica: "NÓS Florianópolis",
  consultorio: "NÓS Odontologia",
  manual: {},
  procedimentos: [],
  instrucaoBase: "Aqui é {{CONSULTORIO}}.",
} as never);
conferir("variável usa o consultório", comUnidade.includes("Aqui é NÓS Odontologia."), true);
conferir(
  "a abertura segue usando a unidade, como sempre",
  comUnidade.includes("em nome de NÓS Florianópolis."),
  true,
);

// MD da NÓS (V4.2) continua entrando intacta na instrução.
const comV42 = base("NÓS Odontologia", { assistente: "Luna", responsavel: "Dra. Mariane" }, v42);
conferir("V4.2 entra inteira na instrução", comV42.includes(v42.trim()), true);

// Configuração incompleta na instrução inteira.
const incompleta = base("", {}, mdUniversal);
conferir("incompleta: sem placeholders", incompleta.includes("{{"), false);
conferir(
  "incompleta: usa os neutros",
  incompleta.includes("Você é Luna, auxiliar de o consultório. A avaliação é com a equipe."),
  true,
);

// Sem MD própria (consultório novo): continua usando o método padrão.
const semMd = base("Sorriso Centro", { assistente: "Bia" }, null);
conferir("sem MD usa o método padrão", semMd.includes("Você aprendeu a atender"), true);

// ── Módulos opcionais continuam intactos ────────────────────────────────
const comModulo = montarInstrucao({
  clinica: "Sorriso Centro",
  manual: {},
  procedimentos: [],
  instrucaoBase: mdUniversal,
  assistente: "Bia",
  responsavel: "Dr. Paulo",
  hoje: "2026-11-06",
  modulo: { secao: "## MÓDULO DE TESTE\nEdição {{ASSISTENTE}} literal do cadastro." },
} as never);
conferir("módulo entra", comModulo.includes("## MÓDULO DE TESTE"), true);
conferir(
  "módulo não é reescrito pelo resolvedor",
  comModulo.includes("Edição {{ASSISTENTE}} literal"),
  true,
);
const semModulo = base("Sorriso Centro", { assistente: "Bia" }, mdUniversal);
conferir(
  "sem módulo vale a proibição de sempre",
  semModulo.includes("Esta conversa NÃO é de paciente modelo"),
  true,
);

if (falhas.length) {
  console.error(falhas.join("\n"));
  process.exit(1);
}
console.log(`ok — ${ok} checagens das variáveis da instrução`);
