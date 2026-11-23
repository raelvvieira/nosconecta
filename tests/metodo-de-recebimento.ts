import { metodoDeRecebimento } from "../src/lib/finance/metodo-de-recebimento.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (obtido === esperado) ok++;
  else falhas.push(`${nome} — esperado ${esperado}, veio ${obtido}`);
}
conferir("pix", metodoDeRecebimento("pix"), "Pix");
conferir("maiúscula", metodoDeRecebimento("PIX"), "Pix");
conferir("dinheiro", metodoDeRecebimento("cash"), "Dinheiro");
conferir("débito", metodoDeRecebimento("debit"), "Cartão de débito");
conferir("boleto", metodoDeRecebimento("boleto"), "Boleto");
conferir("transferência", metodoDeRecebimento("transfer"), "Transferência");
conferir("crédito à vista", metodoDeRecebimento("credit", 1), "Cartão de crédito");
conferir("crédito sem parcelas", metodoDeRecebimento("credit", null), "Cartão de crédito");
conferir("crédito parcelado", metodoDeRecebimento("credit", 3), "Cartão de crédito em 3x");
conferir("vazio", metodoDeRecebimento(null), null);
conferir("desconhecido", metodoDeRecebimento("outro"), null);
if (falhas.length) {
  console.error(falhas.join("\n"));
  process.exit(1);
}
console.log(`metodo-de-recebimento: ${ok} checagens ok`);
