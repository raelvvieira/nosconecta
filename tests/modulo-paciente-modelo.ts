// O módulo Paciente Modelo HOF V1: edição vigente, horários, bloqueios e a
// seção que a Luna lê. Os critérios vêm da seção 19 da MD especializada.
import {
  avisoDaChavePix,
  bloqueiosDaCobranca,
  catalogoDaEdicao,
  configDoModulo,
  edicaoVigente,
  horariosDaPratica,
  reservaPedida,
  secaoDoModuloPacienteModelo,
  tipoDaChavePix,
  vagasRestantes,
  type EdicaoDoModulo,
} from "../supabase/functions/_shared/modulo-paciente-modelo.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

const HOJE = "2026-11-01";
const novembro: EdicaoDoModulo = {
  id: "e1",
  nome: "Novembro 2026 · Florianópolis",
  cidade: "Florianópolis",
  endereco: "Núcleo de Odontologia e Saúde, R. José Brognoli, 117, sala 612",
  inicio: "2026-11-20",
  fim: "2026-11-22",
  status: "inscricoes_abertas",
  observacoes: null,
  praticas: [
    {
      id: "p1",
      data: "2026-11-21",
      horaInicio: "09:00",
      horaFim: "12:00",
      duracaoMin: 60,
      vagas: 2,
      ocupadas: { "09:00": 2, "10:00": 1 },
    },
  ],
  ofertas: [
    {
      id: "o1",
      nome: "Harmonização Full Face",
      descricao: null,
      ml: 3,
      precoVista: 1200,
      precoParcelado: 1300,
      parcelasMax: 4,
      tipo: "procedimento",
      destaque: true,
    },
    {
      id: "o2",
      nome: "Preenchimento labial",
      descricao: null,
      ml: null,
      precoVista: 600,
      precoParcelado: 650,
      parcelasMax: 4,
      tipo: "procedimento",
      destaque: false,
    },
  ],
};
const outubro: EdicaoDoModulo = {
  ...novembro,
  id: "e0",
  nome: "Outubro · Porto Alegre",
  cidade: "Porto Alegre",
  status: "encerrada",
  praticas: [{ ...novembro.praticas[0], id: "x", data: "2026-10-25" }],
};
const marco: EdicaoDoModulo = {
  ...novembro,
  id: "e2",
  nome: "Março 2027",
  status: "publicada",
  inicio: "2027-03-06",
  fim: "2027-03-06",
  praticas: [{ ...novembro.praticas[0], id: "y", data: "2027-03-06", ocupadas: {} }],
};

// ── Edição vigente ─────────────────────────────────────────────────────────
conferir(
  "a aberta é a de novembro; a encerrada não entra",
  edicaoVigente([outubro, novembro, marco], HOJE).aberta?.id,
  "e1",
);
conferir(
  "a publicada aparece como próxima",
  edicaoVigente([outubro, novembro, marco], HOJE).publicada?.id,
  "e2",
);
conferir(
  "passou o último dia de prática, fecha",
  edicaoVigente([novembro], "2026-11-22").aberta,
  null,
);
conferir("no dia da prática ainda vale", edicaoVigente([novembro], "2026-11-21").aberta?.id, "e1");
const duas = edicaoVigente([novembro, { ...marco, status: "inscricoes_abertas" }], HOJE);
conferir("duas vendendo: conflito, nenhuma aberta", [duas.aberta, duas.conflito.length], [null, 2]);
conferir(
  "cancelada não vende",
  edicaoVigente([{ ...novembro, status: "cancelada" }], HOJE).aberta,
  null,
);

// ── Horários ───────────────────────────────────────────────────────────────
conferir("horários pelo passo da duração", horariosDaPratica(novembro.praticas[0]), [
  "09:00",
  "10:00",
  "11:00",
]);
conferir("vagas restantes somam os horários", vagasRestantes(novembro.praticas[0]), 3);
const cat = catalogoDaEdicao(novembro, HOJE);
conferir(
  "só horários com vaga, com código",
  cat.horarios.map((h) => [h.codigo, h.hora, h.vagas]),
  [
    ["H1", "10:00", 1],
    ["H2", "11:00", 2],
  ],
);
conferir(
  "esgotada não oferece horário",
  catalogoDaEdicao({ ...novembro, status: "esgotada" }, HOJE).horarios.length,
  0,
);

// ── Reserva ────────────────────────────────────────────────────────────────
const r = reservaPedida({ horario: "h2", oferta: "O2", nome: " Maria da Silva " }, cat);
conferir("reserva válida", [r?.hora, r?.oferta?.id, r?.nome], ["11:00", "o2", "Maria da Silva"]);
conferir("sem oferta vale", reservaPedida({ horario: "H1" }, cat)?.oferta, null);
conferir("horário inventado não reserva", reservaPedida({ horario: "H9" }, cat), null);
conferir("sem horário não reserva", reservaPedida({ horario: "", oferta: "O1" }, cat), null);

// ── Config e bloqueios ─────────────────────────────────────────────────────
conferir(
  "boolean false antigo vira indefinido",
  configDoModulo({ sinal: { abatido: false } }).sinal.abatido,
  "indefinido",
);
conferir("true antigo vira sim", configDoModulo({ sinal: { abatido: true } }).sinal.abatido, "sim");
conferir(
  "cancelamento antigo migra para políticas",
  configDoModulo({ cancelamento: "x" }).politicas.cancelamento,
  "x",
);
conferir(
  "instagram sem http é descartado",
  configDoModulo({
    instagram: [
      { nome: "a", url: "instagram.com/a" },
      { nome: "b", url: "https://instagram.com/b" },
    ],
  }).instagram.length,
  1,
);
conferir(
  "padrão bloqueia a cobrança pelas quatro razões",
  bloqueiosDaCobranca(configDoModulo({})).length,
  4,
);
const pronta = configDoModulo({
  sinal: { valor: 150, abatido: "sim", prazoHoras: 24 },
  pix: { chave: "48 98419-5309", titular: "Mariane Botti" },
  politicas: { contraindicacao: "Devolvido integralmente.", falta: "Devolvido em 50%." },
  instagram: [{ nome: "Dra. Mariane", url: "https://www.instagram.com/marianebotti/" }],
});
conferir("com abatimento, Pix e falta: cobrança liberada", bloqueiosDaCobranca(pronta), []);
conferir(
  "sem nome de quem recebe, trava",
  bloqueiosDaCobranca(configDoModulo({ ...pronta, pix: { chave: "x@y.com", titular: "" } })),
  ["o nome de quem recebe o Pix"],
);
conferir("tipo da chave: celular", tipoDaChavePix("48 98419-5309"), "celular");
conferir("tipo da chave: e-mail", tipoDaChavePix("a@b.com"), "e-mail");
conferir("tipo da chave: CNPJ", tipoDaChavePix("12.345.678/0001-90"), "CNPJ");
conferir("celular sem o 9 avisa", avisoDaChavePix("48 8419-5309") !== null, true);
conferir("celular com o 9 não avisa", avisoDaChavePix("48 98419-5309"), null);

// ── A seção ────────────────────────────────────────────────────────────────
const secao = secaoDoModuloPacienteModelo({
  vigente: edicaoVigente([outubro, novembro, marco], HOJE),
  config: pronta,
  manual: "MANUAL-HOF",
  hoje: HOJE,
  quem: "a Dra. Mariane",
  catalogo: cat,
  responsavel: { nome: "Dra. Mariane Botti", registro: "28463", especialidades: [] },
});
conferir(
  "a MD entra antes dos dados",
  secao.indexOf("MANUAL-HOF") < secao.indexOf("# DADOS ATUAIS DO CRM"),
  true,
);
conferir(
  "horário oferecido com dia da semana",
  secao.includes("sábado, 21/11") && secao.includes("H1: 10:00 — 1 vaga"),
  true,
);
conferir("horário lotado não aparece", secao.includes("09:00 —"), false);
conferir(
  "ml cadastrado e não cadastrado",
  secao.includes("3 ml incluídos") && secao.includes("quantidade incluída NÃO CADASTRADA"),
  true,
);
conferir("abatido", secao.includes("É ABATIDO"), true);
conferir(
  "Pix do cadastro, com tipo e nome",
  secao.includes("Chave Pix (celular): 48 98419-5309") &&
    secao.includes("Em nome de: Mariane Botti") &&
    !secao.includes("COBRANÇA BLOQUEADA"),
  true,
);
conferir("política de falta", secao.includes("Devolvido em 50%"), true);
conferir("endereço da edição", secao.includes("Núcleo de Odontologia e Saúde"), true);
conferir("responsável com registro", secao.includes("Dra. Mariane Botti, registro 28463"), true);
conferir("edição antiga não vaza", secao.includes("Porto Alegre"), false);
conferir("instagram", secao.includes("instagram.com/marianebotti"), true);

const bloqueada = secaoDoModuloPacienteModelo({
  vigente: edicaoVigente([novembro], HOJE),
  config: configDoModulo({}),
  hoje: HOJE,
  quem: "a Dra. Mariane",
  catalogo: cat,
});
conferir(
  "sem política: cobrança bloqueada e motivos",
  bloqueada.includes("COBRANÇA BLOQUEADA") && bloqueada.includes("a chave Pix do sinal"),
  true,
);

const conflito = secaoDoModuloPacienteModelo({
  vigente: duas,
  config: pronta,
  hoje: HOJE,
  quem: "a Dra. Mariane",
  catalogo: catalogoDaEdicao(null, HOJE),
});
conferir(
  "conflito: não escolhe e não cobra",
  conflito.includes("CONFLITO NO CADASTRO") && !conflito.includes("98419-5309"),
  true,
);

const semEdicao = secaoDoModuloPacienteModelo({
  vigente: edicaoVigente([outubro, marco], HOJE),
  config: pronta,
  hoje: HOJE,
  quem: "a Dra. Mariane",
  catalogo: catalogoDaEdicao(null, HOJE),
});
conferir(
  "sem inscrições abertas: cita a publicada, não cobra, oferece lista",
  semEdicao.includes("Março 2027") &&
    semEdicao.includes("NÃO abriram") &&
    semEdicao.includes("entrarNaLista") &&
    !semEdicao.includes("98419-5309"),
  true,
);

if (falhas.length) {
  console.error(falhas.join("\n"));
  process.exit(1);
}
console.log(`modulo-paciente-modelo: ${ok} checagens ok`);
