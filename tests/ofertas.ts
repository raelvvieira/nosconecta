// As ofertas do consultório e o bloco "O que está valendo agora".
import {
  LIMITE_DAS_INSTRUCOES,
  LIMITE_DO_BLOCO,
  LIMITE_DO_CONHECIMENTO,
  catalogoDeOfertas,
  conhecimentoDoBanco,
  focoEscolhido,
  ofertaDeCampanha,
  ofertaDoBanco,
  ofertaEmFocoDoContato,
  ofertasValendo,
  secaoDeConhecimento,
  secaoOQueEstaValendo,
} from "../supabase/functions/_shared/mapa-de-ofertas.ts";
import { lerRespostaAoPaciente } from "../supabase/functions/_shared/modelo-de-atendimento.ts";
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

// ── Códigos, resumo e a oferta em foco ─────────────────────────────────────
const catalogo = catalogoDeOfertas([promocao(), mentoria()], HOJE);
conferir(
  "catálogo numera F1, F2",
  catalogo.map((c) => c.codigo),
  ["F1", "F2"],
);
conferir(
  "o bloco mostra o código",
  secaoOQueEstaValendo([promocao()], HOJE).join("\n").includes("### F1 · Black Estética"),
  true,
);
conferir(
  "o resumo aparece no bloco",
  secaoOQueEstaValendo(
    [promocao({ resumo: "Preços de Black Friday em três procedimentos." })],
    HOJE,
  )
    .join("\n")
    .includes("Resumo: Preços de Black Friday em três procedimentos."),
  true,
);
conferir(
  "o bloco ensina o campo ofertaEmFoco",
  secaoOQueEstaValendo([promocao()], HOJE).join("\n").includes("ofertaEmFoco"),
  true,
);
conferir(
  "resumo passa do limite e é cortado",
  promocao({ resumo: "x".repeat(900) }).resumo?.length,
  600,
);
conferir("foco: código válido vira o id", focoEscolhido("f2", catalogo), {
  id: "e2",
  limpar: false,
});
conferir("foco: NENHUMA limpa", focoEscolhido("nenhuma", catalogo), { id: null, limpar: true });
conferir("foco: vazio não muda", focoEscolhido("", catalogo), null);
conferir("foco: código inventado não muda", focoEscolhido("F9", catalogo), null);

const duas = catalogoDeOfertas(
  [
    promocao({ como_reconhecer: "black friday, toxina" }),
    mentoria({ como_reconhecer: "mentoria, quero ser aluna" }),
  ],
  HOJE,
);
conferir(
  "foco pelo que a pessoa escreveu",
  ofertaEmFocoDoContato({ catalogo: duas, mensagens: ["Oi, quero ser aluna!"] }),
  "e2",
);
conferir(
  "foco pelo nome da oferta",
  ofertaEmFocoDoContato({ catalogo: duas, mensagens: ["queria saber da Black Estética"] }),
  "p1",
);
conferir(
  "sem combinação nas mensagens, vale o anúncio",
  ofertaEmFocoDoContato({
    catalogo: duas,
    mensagens: ["vi o anúncio"],
    anuncio: "Black Friday: toxina com preço especial",
  }),
  "p1",
);
conferir(
  "a mensagem vence o anúncio",
  ofertaEmFocoDoContato({
    catalogo: duas,
    mensagens: ["quero ser aluna"],
    anuncio: "Black Friday: toxina com preço especial",
  }),
  "e2",
);
conferir(
  "mensagem que cita as duas não decide (o anúncio não desempata)",
  ofertaEmFocoDoContato({
    catalogo: duas,
    mensagens: ["quero ser aluna ou a toxina da black friday?"],
    anuncio: "Black Friday",
  }),
  null,
);
conferir(
  "sem pista nenhuma: nada",
  ofertaEmFocoDoContato({ catalogo: duas, mensagens: ["oi"] }),
  null,
);
conferir(
  "sem ofertas: nada",
  ofertaEmFocoDoContato({ catalogo: [], mensagens: ["black friday"] }),
  null,
);

// ── Conhecimento ───────────────────────────────────────────────────────────
const bloco = (extra: Record<string, unknown> = {}) =>
  conhecimentoDoBanco({
    id: "k1",
    oferta_id: "e1",
    titulo: "Quem aplica",
    quando_usar: "Quando perguntarem quem faz o procedimento",
    texto: "Alunas da mentoria, com supervisão da profissional responsável.",
    ordem: 1,
    ativo: true,
    ...extra,
  });
conferir("sem blocos: seção vazia", secaoDeConhecimento(modelo(), []), []);
conferir("bloco desligado não entra", secaoDeConhecimento(modelo(), [bloco({ ativo: false })]), []);
conferir("bloco sem texto não entra", secaoDeConhecimento(modelo(), [bloco({ texto: "  " })]), []);
const secao = secaoDeConhecimento(modelo(), [
  bloco(),
  bloco({ id: "k2", titulo: "FAQ", ordem: 0, texto: "Sim, há supervisão." }),
]).join("\n");
conferir(
  "seção com o nome da oferta",
  secao.includes("## Conhecimento sobre Paciente Modelo HOF"),
  true,
);
conferir("traz o quando usar", secao.includes("Quando usar: Quando perguntarem quem faz"), true);
conferir(
  "respeita a ordem do cadastro",
  secao.indexOf("### FAQ") < secao.indexOf("### Quem aplica"),
  true,
);
conferir(
  "dado cadastrado vence o conhecimento",
  secao.replace(/\s+/g, " ").includes("vale o cadastrado"),
  true,
);
conferir(
  "bloco acima do limite é cortado",
  bloco({ texto: "a".repeat(LIMITE_DO_BLOCO + 900) }).texto.length,
  LIMITE_DO_BLOCO,
);
const cheios = [1, 2, 3, 4].map((n) =>
  bloco({ id: `k${n}`, titulo: `Tema ${n}`, ordem: n, texto: "§".repeat(LIMITE_DO_BLOCO) }),
);
const cortada = secaoDeConhecimento(modelo(), cheios).join("\n");
conferir("o total tem teto e a seção avisa", cortada.includes("não couberam"), true);
conferir(
  "o teto vale em caracteres de texto",
  (cortada.match(/§/g) ?? []).length <= LIMITE_DO_CONHECIMENTO,
  true,
);

// ── A resposta da assistente traz o campo ──────────────────────────────────
const resposta = (extra: Record<string, unknown>) =>
  lerRespostaAoPaciente(JSON.stringify({ bolhas: ["Oi!"], ...extra }));
conferir("resposta sem o campo: vazio", resposta({}).ofertaEmFoco, "");
conferir(
  "resposta com o campo: maiúsculo e curto",
  resposta({ ofertaEmFoco: " f1 " }).ofertaEmFoco,
  "F1",
);
conferir(
  "campo gigante é cortado",
  resposta({ ofertaEmFoco: "x".repeat(50) }).ofertaEmFoco.length,
  10,
);

if (falhas.length) {
  console.error(falhas.join("\n"));
  process.exit(1);
}
console.log(`ofertas: ${ok} checagens ok`);
