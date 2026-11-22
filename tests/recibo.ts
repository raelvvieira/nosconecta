// O recibo em PDF: valor por extenso, data, número, texto seguro e o PDF em si.
import {
  dataPorExtenso,
  montarReciboPdf,
  numeroDoRecibo,
  textoSeguro,
  valorPorExtenso,
} from "../src/lib/agenda/recibo.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

conferir("zero", valorPorExtenso(0), "zero real");
conferir("um real", valorPorExtenso(1), "um real");
conferir("centavos", valorPorExtenso(0.5), "cinquenta centavos");
conferir("um centavo", valorPorExtenso(0.01), "um centavo");
conferir("cem", valorPorExtenso(100), "cem reais");
conferir("cento e um", valorPorExtenso(101), "cento e um reais");
conferir("320,50", valorPorExtenso(320.5), "trezentos e vinte reais e cinquenta centavos");
conferir("mil", valorPorExtenso(1000), "mil reais");
conferir("mil e quinhentos", valorPorExtenso(1500), "mil e quinhentos reais");
conferir("mil e vinte", valorPorExtenso(1020), "mil e vinte reais");
conferir("mil duzentos e trinta", valorPorExtenso(1230), "mil duzentos e trinta reais");
conferir("2 mil e 450", valorPorExtenso(2450), "dois mil quatrocentos e cinquenta reais");
conferir("3 mil", valorPorExtenso(3000), "três mil reais");
conferir("12.345", valorPorExtenso(12345), "doze mil trezentos e quarenta e cinco reais");
conferir("um milhão", valorPorExtenso(1_000_000), "um milhão de reais");
conferir("arredonda centavos", valorPorExtenso(19.999), "vinte reais");
conferir("negativo vira zero", valorPorExtenso(-5), "zero real");

conferir("data", dataPorExtenso("2026-11-21"), "21 de novembro de 2026");
conferir("data inválida volta como veio", dataPorExtenso("xx"), "xx");

conferir(
  "número estável",
  numeroDoRecibo("2026-11-21", "a1b2c3d4-0000-4000-8000-00000000abcd"),
  "20261121-00ABCD",
);
conferir(
  "número é o mesmo sempre",
  numeroDoRecibo("2026-11-21", "a1b2c3d4-0000-4000-8000-00000000abcd"),
  numeroDoRecibo("2026-11-21", "a1b2c3d4-0000-4000-8000-00000000abcd"),
);

conferir("travessão e aspas", textoSeguro("Limpeza – “completa”…"), 'Limpeza - "completa"...');
conferir("acentos ficam", textoSeguro("Avaliação nº 1 — Ação"), "Avaliação nº 1 - Ação");
conferir("emoji sai", textoSeguro("ok 😀 feito"), "ok  feito");

const pdf = await montarReciboPdf({
  numero: "20261121-00ABCD",
  clinica: "NÓS Odontologia",
  local: "Rua Exemplo, 100 – Centro, Florianópolis",
  paciente: "Maria da Conceição Silva",
  procedimento: "Limpeza + Clareamento – sessão “1”",
  profissional: "Dra. Mariane",
  data: "2026-11-21",
  valor: 1320.5,
  formaDePagamento: "Cartão em 3x",
  emitidoEm: "2026-11-21",
});
conferir("PDF começa com %PDF", new TextDecoder().decode(pdf.slice(0, 5)), "%PDF-");
conferir("PDF termina em %%EOF", new TextDecoder().decode(pdf.slice(-6)).trim(), "%%EOF");
conferir("PDF tem corpo", pdf.length > 8_000, true);
const semLocal = await montarReciboPdf({
  numero: "X",
  clinica: "NÓS",
  local: null,
  paciente: "Fulano",
  procedimento: null,
  profissional: null,
  data: "2026-11-21",
  valor: 0,
  formaDePagamento: null,
  emitidoEm: "2026-11-21",
});
conferir("PDF sem dados opcionais", new TextDecoder().decode(semLocal.slice(0, 5)), "%PDF-");

const base = {
  numero: "20261121-00ABCD",
  clinica: "NÓS Odontologia",
  local: "Rua Exemplo, 100 - Centro, Florianópolis",
  paciente: "Maria da Conceição Silva",
  procedimento: "Bioestimulador de colágeno",
  profissional: "Dra. Mariane",
  data: "2026-11-21",
  emitidoEm: "2026-11-21",
};
const comItens = await montarReciboPdf({
  ...base,
  valor: 1390,
  formaDePagamento: "Pix",
  itens: [
    { nome: "Bioestimulador de colágeno", quantidade: "2 ml" },
    { nome: "Preenchimento de mento", quantidade: "1,5 ml" },
    { nome: "Toxina botulínica", quantidade: null },
  ],
});
conferir("PDF com itens e quantidades", new TextDecoder().decode(comItens.slice(0, 5)), "%PDF-");
const duasFormas = await montarReciboPdf({
  ...base,
  valor: 1390,
  formaDePagamento: "Pix",
  itens: [{ nome: "Bioestimulador de colágeno", quantidade: "2 ml" }],
  sinais: [{ valor: 150, data: "2026-11-14", forma: "Pix" }],
  pagamentos: [
    { valor: 600, forma: "Pix" },
    { valor: 640, forma: "Cartão em 3x" },
  ],
});
conferir("PDF com duas formas", new TextDecoder().decode(duasFormas.slice(0, 5)), "%PDF-");
const completoComSinal = await montarReciboPdf({
  ...base,
  valor: 1390,
  formaDePagamento: "Pix",
  sinais: [{ valor: 150, data: "2026-11-14", forma: "Pix" }],
});
const sinalSo = await montarReciboPdf({
  ...base,
  numero: "20261121-00ABCD-S",
  tipo: "sinal",
  valor: 150,
  formaDePagamento: "Pix",
  sinais: [],
});
conferir("PDF completo com sinal", new TextDecoder().decode(completoComSinal.slice(0, 5)), "%PDF-");
conferir("PDF de sinal", new TextDecoder().decode(sinalSo.slice(0, 5)), "%PDF-");
const S = process.env.SAIDA_PDF;
if (S) {
  await Bun.write(`${S}/completo-sinal.pdf`, completoComSinal);
  await Bun.write(`${S}/sinal.pdf`, sinalSo);
  await Bun.write(`${S}/itens.pdf`, comItens);
  await Bun.write(`${S}/duas.pdf`, duasFormas);
}

if (falhas.length) {
  console.error(falhas.join("\n"));
  process.exit(1);
}
console.log(`recibo: ${ok} checagens ok`);
