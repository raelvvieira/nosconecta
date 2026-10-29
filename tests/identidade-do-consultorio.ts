// Cada consultório com a própria assistente: o nome dela e quem faz a
// avaliação vêm da ficha, não do código (etapa 4, 29/10).
//
// O que não pode acontecer: a assistente de outro consultório falar da "Dra.
// Mariane" ou se chamar "Luna" sem ter escolhido; a NÓS perder o texto de hoje.
import {
  montarInstrucao,
  nomeDaAssistente,
  quemAvalia,
  secaoDeHorarios,
  secaoDePacienteModelo,
} from "../supabase/functions/_shared/instrucao-do-agente.ts";
import { promptDaLicao } from "../supabase/functions/_shared/licoes-do-atendimento.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

conferir("Dra. com artigo a", quemAvalia("Dra. Mariane"), "a Dra. Mariane");
conferir("Dr. com artigo o", quemAvalia("Dr. Paulo"), "o Dr. Paulo");
conferir("sem ponto também", quemAvalia("Dra Ana"), "a Dra Ana");
conferir("nome sem título, sem artigo", quemAvalia("Ana Souza"), "Ana Souza");
conferir("ninguém cadastrado", quemAvalia(null), "a equipe");
conferir("assistente sem nome", nomeDaAssistente("  "), "Luna");
conferir("assistente com nome", nomeDaAssistente("Bia"), "Bia");

const HOJE = "2026-10-30";
const aberta = { ate: "2026-11-15", texto: "Mentoria de harmonização, R$ 150 de reserva." };
const daNos = secaoDePacienteModelo(aberta, HOJE, "Dra. Mariane");
conferir("NÓS: avaliação com a Dra. Mariane", daNos.includes("avaliação com a Dra. Mariane"), true);
conferir(
  "NÓS: quem confirma é a Dra. Mariane",
  daNos.includes("quem confirma é a Dra. Mariane"),
  true,
);
const deOutro = secaoDePacienteModelo(aberta, HOJE, "Dr. Paulo");
conferir("outro consultório não fala da Mariane", deOutro.includes("Mariane"), false);
conferir(
  "outro consultório fala do Dr. Paulo",
  deOutro.includes("o Dr. Paulo entra em contato"),
  true,
);
conferir(
  "sem responsável, a equipe",
  secaoDePacienteModelo(aberta, HOJE).includes("avaliação com a equipe"),
  true,
);

const horarios = {
  paraOferecer: [],
  reserva: [],
  faixa: null,
  diasSobConsulta: ["2026-11-01"],
};
conferir(
  "dias sob consulta com quem avalia",
  secaoDeHorarios(horarios, "Dr. Paulo").includes("SOB CONSULTA com o Dr. Paulo"),
  true,
);

const instr = montarInstrucao({
  clinica: "Sorriso Centro",
  manual: {},
  procedimentos: [],
  responsavel: "Dra. Ana",
  assistente: "Bia",
});
conferir("instrução sem Mariane", instr.includes("Mariane"), false);
conferir("instrução sem R$ 399", instr.includes("399"), false);
conferir("exemplo usa o nome da assistente", instr.includes("aqui é a Bia"), true);
conferir("instrução sem Luna quando ela se chama Bia", instr.includes("Luna"), false);

const licao = promptDaLicao({
  desfecho: "agendou",
  assistente: "Bia",
  nomeDoContato: null,
  anuncio: null,
  transcricao: "",
  manual: null,
  // deno-lint-ignore no-explicit-any
} as any);
conferir("lição na voz da Bia", licao.startsWith("Você é a Bia,"), true);

if (falhas.length) {
  console.error(`identidade-do-consultorio: ${falhas.length} falha(s)\n` + falhas.join("\n"));
  process.exit(1);
}
console.log(`identidade-do-consultorio: ${ok} checagens ok`);
