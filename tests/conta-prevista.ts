// O comprovante que paga uma conta já prevista (o aluguel de 30/10).
//
// O que não pode acontecer: lançar despesa nova para uma conta que já estava
// prevista (o aluguel apareceria duas vezes); dar baixa sem passar por um
// "sim"; aceitar um código de conta prevista que não está na lista; dar baixa
// numa conta "a vencer".
import {
  catalogoDePrevistas,
  comoLerOGasto,
  gastoLido,
  recadoDaBaixa,
  recadoDaPrevista,
  recadoDoQueFalta,
  TETO_SEM_CONFERIR,
} from "../supabase/functions/_shared/gasto-da-conversa.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

const HOJE = "2026-10-30";
const cat = [{ codigo: "G1", id: "cat-aluguel", nome: "Aluguel" }];
const contas = [{ codigo: "C1", id: "conta-inter", nome: "Inter Rael (pessoal)" }];
const previstas = catalogoDePrevistas([
  {
    id: "t-aluguel",
    descricao: "Aluguel da Sala",
    valor: 1708.4,
    vencimento: "2026-10-31",
    fornecedor: null,
  },
  { id: "t-luz", descricao: "Energia", valor: 320, vencimento: "2026-11-05", fornecedor: "Celesc" },
  { id: "", descricao: "sem id", valor: 1, vencimento: "2026-11-01", fornecedor: null },
  { id: "x", descricao: "data ruim", valor: 1, vencimento: "amanhã", fornecedor: null },
]);
conferir(
  "só entram as válidas, com código",
  previstas.map((p) => p.codigo + ":" + p.id),
  ["P1:t-aluguel", "P2:t-luz"],
);

const comprovante = {
  ehGasto: true,
  valor: "1.488,03",
  categoria: "G1",
  conta: "C1",
  forma: "pix",
  quando: "hoje",
  descricao: "Aluguel",
  fornecedor: "AZEVEDO FILHOS NEG IMOB LTDA",
  prevista: "P1",
};
const r = gastoLido(comprovante, cat, contas, HOJE, TETO_SEM_CONFERIR, previstas);
conferir("leu", r.ok, true);
if (r.ok) {
  conferir("reconheceu o aluguel previsto", r.gasto.prevista, {
    id: "t-aluguel",
    descricao: "Aluguel da Sala",
    valorPrevisto: 1708.4,
    vencimento: "2026-10-31",
  });
  conferir("valor é o do comprovante", r.gasto.valor, 1488.03);
  conferir("baixa sempre pede o sim", r.gasto.precisaConferir, true);
  const pergunta = recadoDaPrevista(r.gasto, true);
  conferir("pergunta cita a conta", pergunta.includes("Aluguel da Sala"), true);
  conferir("pergunta avisa a troca de valor", pergunta.includes("passa de R$"), true);
  conferir("pergunta pede sim", pergunta.includes('"sim"'), true);
  const feito = recadoDaBaixa(r.gasto);
  conferir("recado da baixa", feito.startsWith("✅ Baixa dada: Aluguel da Sala"), true);
  conferir("recado diz como desfazer", feito.includes('"apaga"'), true);
}

const semPrevista = gastoLido(
  { ...comprovante, prevista: "" },
  cat,
  contas,
  HOJE,
  TETO_SEM_CONFERIR,
  previstas,
);
conferir("sem código, despesa nova", semPrevista.ok && semPrevista.gasto.prevista, null);
const inventada = gastoLido(
  { ...comprovante, prevista: "P9" },
  cat,
  contas,
  HOJE,
  TETO_SEM_CONFERIR,
  previstas,
);
conferir("código fora da lista não vira baixa", inventada.ok && inventada.gasto.prevista, null);
const aVencer = gastoLido(
  { ...comprovante, pago: false },
  cat,
  contas,
  HOJE,
  TETO_SEM_CONFERIR,
  previstas,
);
conferir("conta a vencer não dá baixa", aVencer.ok && aVencer.gasto.prevista, null);

const faltaConta = gastoLido(
  { ...comprovante, conta: "" },
  cat,
  contas,
  HOJE,
  TETO_SEM_CONFERIR,
  previstas,
);
if (faltaConta.ok) {
  conferir(
    "pergunta o que falta e já diz qual conta vai baixar",
    recadoDoQueFalta(faltaConta.gasto, contas).includes("Vou dar baixa em: Aluguel da Sala"),
    true,
  );
}

const instrucao = comoLerOGasto(cat, contas, HOJE, previstas);
conferir("instrução lista as previstas", instrucao.includes("P1 · Aluguel da Sala"), true);
conferir("instrução pede o campo prevista", instrucao.includes('"prevista"'), true);
conferir(
  "sem previstas, a lista some",
  comoLerOGasto(cat, contas, HOJE).includes("já previstas"),
  false,
);

if (falhas.length) {
  console.error(`conta-prevista: ${falhas.length} falha(s)\n` + falhas.join("\n"));
  process.exit(1);
}
console.log(`conta-prevista: ${ok} checagens ok`);
