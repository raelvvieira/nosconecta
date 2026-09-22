// Checagens do prompt que gera as sugestões de fala.
//
// O que está em jogo: cada sugestão é uma frase PRONTA, que alguém vai colar
// no WhatsApp de um paciente sem reescrever. Se o prompt deixar de dizer uma
// destas coisas, o card passa a oferecer:
//
//   **Preço inventado.** É o pior erro num negócio de serviço — o paciente
//   chega na clínica com um número na cabeça que ninguém combinou. E aqui é
//   pior que no agente: ali a frase ainda passa por um filtro; aqui ela já
//   está escrita, bonita, com um botão "Usar esta" do lado.
//
//   **Uma resposta onde deveria haver uma pessoa.** Dor, pedido de falar com
//   humano, reclamação, pedido de desconto. As regras de repasse existem
//   justamente porque uma conversa boa faz querer contornar esse pedido.
import {
  QUANTAS_SUGESTOES,
  promptDeSugestao,
  type EntradaDeSugestao,
} from "../supabase/functions/_shared/sugestoes-de-fala.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

const BASE: EntradaDeSugestao = {
  clinica: "NÓS Odontologia",
  manual: { tom: "Direto e caloroso, sem emoji demais." },
  procedimentos: [],
  historico: [
    { deQuem: "paciente", texto: "oi, vcs fazem clareamento?" },
    { deQuem: "clinica", texto: "Fazemos sim! Já fez alguma vez?" },
    { deQuem: "paciente", texto: "nunca fiz" },
  ],
  ehPaciente: false,
  nomeDoContato: "Gabi",
};
const prompt = (p: Partial<EntradaDeSugestao> = {}) => promptDeSugestao({ ...BASE, ...p });

// ── A conversa chega ao modelo ───────────────────────────────────────────
{
  const p = prompt();
  conferir("a fala do paciente entra", p.includes("vcs fazem clareamento?"), true);
  conferir("a da clínica também", p.includes("Já fez alguma vez?"), true);
  conferir("com os papéis marcados", p.includes("PESSOA:") && p.includes("CLÍNICA:"), true);
  conferir("o nome entra quando existe", p.includes("Gabi"), true);
  conferir("e o manual aprendido vai junto", p.includes("sem emoji demais"), true);
}
conferir("sem nome não escreve 'null'", prompt({ nomeDoContato: null }).includes("null"), false);

// ── Preço ────────────────────────────────────────────────────────────────
// Sem tabela liberada, o prompt tem que PROIBIR falar valor. Um card que
// sugere "fica uns 800 reais" é um preço que a clínica nunca combinou, escrito
// com a voz dela.
conferir(
  "sem tabela, proíbe falar preço",
  prompt().includes("NÃO tem tabela de preços liberada"),
  true,
);
{
  const comTabela = prompt({
    procedimentos: [{ nome: "Clareamento", preco: 1200, duracaoMinutos: 60, categoria: null }],
  });
  conferir("com tabela, o preço real aparece", comTabela.includes("Clareamento"), true);
  conferir("e o valor também", comTabela.includes("1.200,00"), true);
  conferir(
    "e continua proibido inventar o que não está lá",
    comTabela.includes("Nunca invente preço"),
    true,
  );
}

// ── As regras de repasse ─────────────────────────────────────────────────
// Entram INVERTIDAS: não é "o que fazer", é "quando não sugerir nada e chamar
// alguém". Sem isto o card contornaria um "quero falar com uma pessoa" — e
// contornar esse pedido é exatamente o que o manual não pode ensinar.
{
  const p = prompt();
  conferir("dor chama uma pessoa", p.includes("saúde, dor, sintoma"), true);
  conferir("pedido de humano também", p.includes("falar com uma pessoa"), true);
  conferir("e o prompt diz o que fazer", p.includes("chamar uma pessoa da equipe"), true);
  conferir("nada de conduta clínica", p.includes("Nunca dê orientação clínica"), true);
}

// ── Paciente x lead ──────────────────────────────────────────────────────
// Sugerir "vamos marcar sua avaliação?" para quem está no meio de um
// tratamento é a clínica mostrando que não sabe com quem fala.
conferir(
  "lead: o objetivo é marcar",
  prompt({ ehPaciente: false }).includes("AINDA NÃO É PACIENTE"),
  true,
);
conferir("paciente: o texto muda", prompt({ ehPaciente: true }).includes("JÁ É PACIENTE"), true);
conferir(
  "e paciente não recebe oferta de primeira avaliação",
  prompt({ ehPaciente: true }).includes("não ofereça"),
  true,
);

// ── A forma do pedido ────────────────────────────────────────────────────
// A frase pronta é o ponto. "Explore a dor do paciente" não ajuda ninguém às
// onze da manhã com sete conversas abertas.
{
  const p = prompt();
  conferir("pede texto pronto, não orientação", p.includes("texto PRONTO para enviar"), true);
  conferir("e diz explicitamente para não orientar", p.includes("pergunte sobre a dor"), true);
  conferir("pede a etapa atual", p.includes("ETAPA"), true);
  conferir("e pede falas diferentes entre si", p.includes("DIFERENTES entre si"), true);
  conferir("o número pedido é o da constante", p.includes(String(QUANTAS_SUGESTOES)), true);
}
conferir("são três", QUANTAS_SUGESTOES, 3);

// ── O prompt não vira um bloco só ────────────────────────────────────────
// Uma versão anterior filtrava as linhas vazias para tirar a linha opcional do
// nome, e levava junto TODA quebra de parágrafo.
conferir("tem parágrafos", prompt().includes("\n\n"), true);

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens das sugestões de fala`);
