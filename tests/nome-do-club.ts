// O nome que a pessoa digita no cartão contra o nome que está na ficha.
//
// É metade da prova de identidade da área do paciente — a outra metade é o
// telefone. Frouxo demais, qualquer um com o telefone de alguém vê o crédito
// dessa pessoa; apertado demais, quem tem o cartão na mão é mandado embora
// porque a ficha diz "Ana Paula Souza" e ela digitou "Ana Souza".
import { nomeConfere } from "../src/lib/club/club.functions.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (obtido === esperado) ok++;
  else falhas.push(`${nome} — esperado ${esperado}, veio ${obtido}`);
}

// ── Quem deve passar ────────────────────────────────────────────────────

conferir("igual", nomeConfere("Ana Souza", "Ana Souza"), true);
conferir("sem acento", nomeConfere("Jose da Silva", "José da Silva"), true);
conferir("caixa trocada", nomeConfere("ANA SOUZA", "ana souza"), true);
conferir("espaço sobrando", nomeConfere("  Ana   Souza ", "Ana Souza"), true);
// O caso que faz a regra existir: a ficha tem o nome completo, a pessoa
// digitou do jeito que ela se chama.
conferir("sobrenome do meio faltando", nomeConfere("Ana Souza", "Ana Paula Souza"), true);
conferir("e o contrário", nomeConfere("Ana Paula Souza", "Ana Souza"), true);
conferir("ficha só com o primeiro nome", nomeConfere("Ana Souza", "Ana"), true);
conferir("digitou só o primeiro, ficha completa", nomeConfere("Ana", "Ana Souza"), true);
conferir("ponto no nome", nomeConfere("Dra. Ana Souza", "Dra Ana Souza"), true);

// ── Quem não deve ───────────────────────────────────────────────────────

conferir("primeiro nome diferente", nomeConfere("Bruna Souza", "Ana Souza"), false);
// Duas "Ana" na base: o primeiro nome sozinho não distingue ninguém, e é
// justamente por isso que um sobrenome em comum é exigido quando há um.
conferir("mesmo primeiro nome, outra família", nomeConfere("Ana Lima", "Ana Souza"), false);
conferir("vazio não confere", nomeConfere("", "Ana Souza"), false);
conferir("ficha sem nome", nomeConfere("Ana Souza", ""), false);
conferir("só espaços", nomeConfere("   ", "Ana Souza"), false);
conferir("ordem invertida não basta", nomeConfere("Souza Ana", "Ana Souza"), false);

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens do nome no cartão`);
