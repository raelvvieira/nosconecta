// A mensagem que o membro manda no WhatsApp.
//
// Não é texto de tela: é uma promessa de dinheiro saindo do celular de uma
// paciente para um desconhecido. Se o valor sair errado, a clínica passa a
// dever o que não prometeu — ou a decepcionar quem acreditou.
import { convite } from "../src/lib/club/convite.ts";
import { formatBRL } from "../src/lib/finance/format.ts";

// `formatBRL` separa "R$" do número com espaço NÃO-QUEBRÁVEL (é o que o
// `toLocaleString` do pt-BR faz). Escrever "R$ 100,00" à mão aqui compararia
// com um espaço comum e falharia sem nada estar errado — então o esperado sai
// da mesma função que a mensagem usa.
const cem = formatBRL(100);
const duzentosECinquenta = formatBRL(250);

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (obtido === esperado) ok++;
  else falhas.push(`${nome} — esperado ${esperado}, veio ${obtido}`);
}

const texto = convite({ deQuem: "Mariana", valor: 100, link: "https://app.nos/club" });

// O que a mensagem precisa carregar.
conferir("abre pelo que a pessoa ganha", texto.startsWith(`Você ganhou ${cem}`), true);
conferir("diz quem indicou", texto.includes("Mariana te indicou"), true);
conferir("explica o que é a NÓS", texto.includes("odontologia e estética"), true);
conferir("termina no link", texto.trim().endsWith("https://app.nos/club"), true);
conferir("tem o link uma vez só", texto.split("https://app.nos/club").length - 1, 1);

// O valor vem de fora, sempre: cravar "100" faria a mensagem mentir no dia em
// que a clínica mudasse o crédito.
{
  const outro = convite({ deQuem: "Ana", valor: 250, link: "x" });
  conferir("o valor é o que veio", outro.includes(duzentosECinquenta), true);
  conferir("e não sobra o antigo", outro.includes(cem), false);
  // Aparece duas vezes de propósito: o que ela ganha ao entrar, e o que ganha
  // por cada indicação.
  conferir("o valor aparece três vezes", outro.split(duzentosECinquenta).length - 1, 3);
}

// Quebras de linha de verdade — o WhatsApp mostra "\n" literal se escaparem.
conferir("tem quebras de linha reais", texto.includes("\n"), true);
conferir("sem barra-n escrita", texto.includes("\\n"), false);

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens do convite do Club`);
