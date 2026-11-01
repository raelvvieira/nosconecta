// O módulo Paciente Modelo: a edição aberta, os códigos e a seção gerada.
import {
  catalogoDaEdicao,
  configDoModulo,
  edicaoAberta,
  praticasOferiveis,
  reservaPedida,
  secaoDoModuloPacienteModelo,
  type EdicaoDoModulo,
} from "../supabase/functions/_shared/modulo-paciente-modelo.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

const edicao: EdicaoDoModulo = {
  id: "e1",
  nome: "Dezembro 2026 · Porto Alegre",
  cidade: "Porto Alegre",
  endereco: "MedPlex Santana, sala 913",
  inicio: "2026-12-12",
  fim: "2026-12-14",
  status: "inscricoes_abertas",
  observacoes: null,
  praticas: [
    { id: "p1", data: "2026-12-13", horaInicio: "09:00", horaFim: "18:00", vagas: 6, ocupadas: 6 },
    { id: "p2", data: "2026-12-14", horaInicio: "09:00", horaFim: "18:00", vagas: 6, ocupadas: 2 },
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
      ml: 1,
      precoVista: 600,
      precoParcelado: 650,
      parcelasMax: 4,
      tipo: "procedimento",
      destaque: false,
    },
  ],
};
const encerrada: EdicaoDoModulo = {
  ...edicao,
  id: "e0",
  nome: "Outubro",
  status: "encerrada",
  praticas: [
    { id: "x", data: "2026-10-25", horaInicio: null, horaFim: null, vagas: 0, ocupadas: 0 },
  ],
};
const rascunho: EdicaoDoModulo = {
  ...edicao,
  id: "e2",
  nome: "Março",
  status: "rascunho",
  inicio: "2027-03-05",
  fim: "2027-03-07",
  praticas: [
    { id: "y", data: "2027-03-06", horaInicio: null, horaFim: null, vagas: 4, ocupadas: 0 },
  ],
};

conferir(
  "aberta é a de dezembro",
  edicaoAberta([encerrada, edicao, rascunho], "2026-11-01")?.id,
  "e1",
);
conferir("passou o último dia de prática, fecha", edicaoAberta([edicao], "2026-12-15"), null);
conferir("no último dia ainda vale", edicaoAberta([edicao], "2026-12-14")?.id, "e1");
conferir("rascunho não abre", edicaoAberta([rascunho], "2026-11-01"), null);
conferir(
  "esgotada ainda é a aberta (para dizer que lotou)",
  edicaoAberta([{ ...edicao, status: "esgotada" }], "2026-11-01")?.id,
  "e1",
);

conferir(
  "só dias com vaga",
  praticasOferiveis(edicao, "2026-11-01").map((p) => p.id),
  ["p2"],
);
conferir(
  "dia que passou não entra",
  praticasOferiveis(edicao, "2026-12-14").map((p) => p.id),
  ["p2"],
);

const cat = catalogoDaEdicao(edicao, "2026-11-01");
conferir(
  "códigos",
  [cat.praticas.map((p) => p.codigo), cat.ofertas.map((o) => o.codigo)],
  [["P1"], ["O1", "O2"]],
);
conferir(
  "reserva válida",
  reservaPedida({ dia: "p1", oferta: "O2", nome: " Maria da Silva " }, cat)?.oferta?.id,
  "o2",
);
conferir(
  "reserva sem oferta vale",
  reservaPedida({ dia: "P1", oferta: "", nome: "Ana" }, cat)?.pratica.id,
  "p2",
);
conferir(
  "código de dia inventado não reserva",
  reservaPedida({ dia: "P9", oferta: "O1", nome: "Ana" }, cat),
  null,
);
conferir("sem dia não reserva", reservaPedida({ dia: "", oferta: "O1", nome: "Ana" }, cat), null);
const lotado = catalogoDaEdicao(
  { ...edicao, praticas: [{ ...edicao.praticas[1], ocupadas: 6 }] },
  "2026-11-01",
);
conferir("lotou, sem código", lotado.praticas.length, 0);

const cfg = configDoModulo({
  sinal: { valor: "150", abatido: "true" },
  faq: [
    { pergunta: "Dói?", resposta: "Pouco." },
    { pergunta: "", resposta: "x" },
  ],
});
conferir(
  "config normalizada",
  [cfg.sinal.valor, cfg.sinal.abatido, cfg.sinal.prazoHoras, cfg.faq.length, cfg.listaDeInteresse],
  [150, false, 24, 1, true],
);

const secao = secaoDoModuloPacienteModelo({
  edicao,
  config: configDoModulo({
    sinal: { valor: 150, chavePix: "chave-teste", titular: "Dra." },
    credenciais: "CRO 123",
  }),
  hoje: "2026-11-01",
  quem: "a Dra. Mariane",
  catalogo: cat,
});
conferir(
  "lista só o dia com vaga",
  secao.includes("P1: segunda, 14/12") && !secao.includes("13/12 —"),
  true,
);
conferir("curso separado da prática", secao.includes("vai de 12/12 a 14/12"), true);
conferir(
  "ml na oferta",
  secao.includes("Preenchimento labial (1 ml): R$ 600 à vista ou R$ 650 em até 4x"),
  true,
);
conferir("sinal não abatido", secao.includes("NÃO é abatido"), true);
conferir("chave pix entra", secao.includes("chave-teste"), true);
conferir("credenciais entram", secao.includes("CRO 123"), true);
conferir("endereço da edição", secao.includes("MedPlex Santana"), true);

const fechada = secaoDoModuloPacienteModelo({
  edicao: null,
  proxima: rascunho,
  config: configDoModulo({}),
  hoje: "2026-11-01",
  quem: "a Dra. Mariane",
  catalogo: catalogoDaEdicao(null, "2026-11-01"),
});
conferir(
  "sem edição: não cita valores e oferece a lista",
  fechada.includes("NÃO cite valores") &&
    fechada.includes("entrarNaLista") &&
    fechada.includes("Março"),
  true,
);

if (falhas.length) {
  console.error(falhas.join("\n"));
  process.exit(1);
}
console.log(`modulo-paciente-modelo: ${ok} checagens ok`);
