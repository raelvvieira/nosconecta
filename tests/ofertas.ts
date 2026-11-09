// As ofertas do consultório e o bloco "O que está valendo agora".
import {
  LIMITE_DAS_INSTRUCOES,
  ofertaDeCampanha,
  ofertaDoBanco,
  ofertasValendo,
  secaoOQueEstaValendo,
} from "../supabase/functions/_shared/mapa-de-ofertas.ts";
import { campanhaDoBanco } from "../supabase/functions/_shared/condicoes-do-consultorio.ts";
import { montarInstrucao } from "../supabase/functions/_shared/instrucao-do-agente.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

const HOJE = "2026-11-10";
const promocao = (extra: Record<string, unknown> = {}) =>
  ofertaDoBanco({
    id: "p1",
    tipo: "promocao",
    nome: "Black Estética",
    estado: "ligado",
    inicio: "2026-11-01",
    fim: "2026-11-30",
    para_quem: "paciente",
    itens: [{ nome: "Toxina botulínica", precoVista: 950, parcelas: 6, valorParcela: 179 }],
    ...extra,
  });
const modelo = (extra: Record<string, unknown> = {}) =>
  ofertaDoBanco({
    id: "e1",
    tipo: "edicao",
    nome: "Paciente Modelo HOF",
    estado: "ligado",
    para_quem: "paciente",
    como_reconhecer: "paciente modelo, atendimento feito por aluno",
    modulo: "paciente_modelo",
    ...extra,
  });
const mentoria = (extra: Record<string, unknown> = {}) =>
  ofertaDoBanco({
    id: "e2",
    tipo: "edicao",
    nome: "Mentoria para profissionais",
    estado: "ligado",
    para_quem: "profissional",
    modulo: "mentoria",
    ...extra,
  });

// ── Quais valem ────────────────────────────────────────────────────────────
conferir("promoção no período vale", ofertasValendo([promocao()], HOJE).length, 1);
conferir("promoção vencida não vale", ofertasValendo([promocao()], "2026-12-01").length, 0);
conferir(
  "promoção que ainda não começou não vale",
  ofertasValendo([promocao()], "2026-10-31").length,
  0,
);
conferir("rascunho não vale", ofertasValendo([promocao({ estado: "rascunho" })], HOJE).length, 0);
conferir("encerrada não vale", ofertasValendo([promocao({ estado: "encerrada" })], HOJE).length, 0);
conferir("promoção sem itens não vale", ofertasValendo([promocao({ itens: [] })], HOJE).length, 0);
conferir(
  "em teste só vale na simulação",
  [
    ofertasValendo([promocao({ estado: "teste" })], HOJE).length,
    ofertasValendo([promocao({ estado: "teste" })], HOJE, { simulacao: true }).length,
  ],
  [0, 1],
);
conferir(
  "paciente modelo só vale quando o módulo vale",
  [
    ofertasValendo([modelo()], HOJE).length,
    ofertasValendo([modelo()], HOJE, { moduloPacienteModeloVale: true }).length,
  ],
  [0, 1],
);
conferir(
  "paciente modelo segue o módulo, não o estado da oferta",
  [
    ofertasValendo([modelo({ estado: "rascunho" })], HOJE, { moduloPacienteModeloVale: true })
      .length,
    ofertasValendo([modelo({ estado: "encerrada" })], HOJE, { moduloPacienteModeloVale: true })
      .length,
  ],
  [1, 0],
);
conferir("mentoria ligada aparece", ofertasValendo([mentoria()], HOJE).length, 1);
conferir("oferta sem nome é ignorada", ofertasValendo([promocao({ nome: "  " })], HOJE).length, 0);

// ── Leitura do banco ───────────────────────────────────────────────────────
conferir("estado inválido vira rascunho", promocao({ estado: "xyz" }).estado, "rascunho");
conferir("para_quem inválido vira todos", promocao({ para_quem: "zzz" }).paraQuem, "todos");
conferir(
  "instruções passam do limite e são cortadas",
  promocao({ instrucoes_comerciais: "a".repeat(LIMITE_DAS_INSTRUCOES + 500) }).instrucoes?.length,
  LIMITE_DAS_INSTRUCOES,
);
conferir(
  "campanha antiga vista como oferta",
  ofertaDeCampanha(
    campanhaDoBanco({
      id: "c1",
      nome: "Black",
      inicio: "2026-11-01",
      fim: "2026-11-30",
      ativo: true,
      itens: [{ nome: "X", precoVista: 100 }],
    }),
  ).tipo,
  "promocao",
);

// ── O bloco ────────────────────────────────────────────────────────────────
conferir("nada aberto: bloco vazio", secaoOQueEstaValendo([], HOJE), []);
const dois = secaoOQueEstaValendo([promocao(), mentoria()], HOJE).join("\n").replace(/\s+/g, " ");
conferir("tem o título", dois.includes("## O que está valendo agora"), true);
conferir(
  "lista o nome da promoção e o preço",
  /Black Estética \(promoção, de 01\/11 a 30\/11\)/.test(dois) && dois.includes("R$ 950"),
  true,
);
conferir("diz para quem é", dois.includes("profissionais") && dois.includes("pacientes"), true);
conferir("mentoria sem dados não inventa", dois.includes("não estão cadastrados aqui"), true);
conferir("o que a pessoa diz manda", dois.includes("O que a pessoa diz agora manda"), true);
conferir("anúncio é só pista", dois.includes("só uma pista"), true);
conferir("mensagem vaga: uma pergunta", dois.includes("faça uma única pergunta"), true);
conferir("oferta encerrada: honestidade", dois.includes("diga isso com honestidade"), true);
conferir("não inventa data, vaga ou preço", dois.includes("Nunca invente data, vaga, preço"), true);
conferir("dado cadastrado vence instrução", dois.includes("vale o dado cadastrado"), true);
conferir(
  "promoção: não vale para paciente modelo",
  dois.includes("Não vale para paciente modelo"),
  true,
);
const soMentoria = secaoOQueEstaValendo([mentoria()], HOJE).join("\n");
conferir("sem promoção, sem a regra de promoção", soMentoria.includes("por cima da tabela"), false);
const comInstrucao = secaoOQueEstaValendo(
  [promocao({ instrucoes_comerciais: "Apresente a promoção só depois do valor normal." })],
  HOJE,
).join("\n");
conferir(
  "instruções da oferta aparecem",
  comInstrucao.includes("Como conduzir esta oferta: Apresente a promoção"),
  true,
);
const pm = secaoOQueEstaValendo([modelo()], HOJE, { moduloPacienteModeloVale: true }).join("\n");
conferir("paciente modelo remete à seção própria", pm.includes("seção de paciente modelo"), true);
conferir("não escreve preço nem data de paciente modelo", /R\$/.test(pm), false);
conferir("sem travessão nem emoji no bloco", /—|[\u{1F300}-\u{1FAFF}]/u.test(dois), false);

// ── Na instrução inteira ───────────────────────────────────────────────────
const base = {
  clinica: "Sorriso Centro",
  manual: {},
  procedimentos: [],
  assistente: "Bia",
  responsavel: "Dr. Paulo",
  hoje: HOJE,
};
const com = montarInstrucao({ ...base, ofertas: [promocao()] } as never);
const semOfertas = montarInstrucao({ ...base, ofertas: [] } as never);
const antiga = montarInstrucao({
  ...base,
  campanhas: [
    campanhaDoBanco({
      id: "c1",
      nome: "Black Estética",
      inicio: "2026-11-01",
      fim: "2026-11-30",
      ativo: true,
      itens: [{ nome: "Toxina botulínica", precoVista: 950 }],
    }),
  ],
} as never);
conferir("com oferta: bloco novo na instrução", com.includes("## O que está valendo agora"), true);
conferir(
  "com oferta: some 'Campanhas valendo agora'",
  com.includes("Campanhas valendo agora"),
  false,
);
conferir(
  "ofertas vazias: nenhum dos dois blocos",
  semOfertas.includes("O que está valendo agora") || semOfertas.includes("Campanhas valendo agora"),
  false,
);
conferir(
  "sem a tabela de ofertas: campanhas como antes",
  antiga.includes("## Campanhas valendo agora"),
  true,
);
conferir(
  "o bloco vem antes das regras invioláveis",
  com.indexOf("## O que está valendo agora") < com.indexOf("REGRAS QUE VOCÊ NUNCA PODE QUEBRAR"),
  true,
);
conferir(
  "as regras fixas continuam por último",
  com.indexOf("REGRAS QUE VOCÊ NUNCA PODE QUEBRAR") > com.indexOf("Como conduzir esta") ||
    !com.includes("Como conduzir esta"),
  true,
);

if (falhas.length) {
  console.error(falhas.join("\n"));
  process.exit(1);
}
console.log(`ofertas: ${ok} checagens ok`);
