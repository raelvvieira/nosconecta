// Checagens do telefone que decide se a conversão casa na Meta.
//
// Este é o único identificador que o sistema tem da maioria dos pacientes.
// Número pela metade é aceito pela Meta, some no hash e nunca vira Lead
// atribuído — erro que não levanta exceção nenhuma e só aparece semanas
// depois, como um anúncio que "não trouxe ninguém".
import {
  normalizeBrazilianPhone,
  telefoneBrasileiroValido,
  variantesDoNumero,
} from "../src/lib/atendimentos/phone.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

// ── Completos ────────────────────────────────────────────────────────────
conferir("celular com DDD, como se digita", telefoneBrasileiroValido("(48) 98419-5309"), true);
conferir("celular só dígitos", telefoneBrasileiroValido("48984195309"), true);
conferir("fixo de 8 dígitos", telefoneBrasileiroValido("4832221100"), true);
conferir("já com o 55 na frente", telefoneBrasileiroValido("5548984195309"), true);
conferir("com +55 e espaços", telefoneBrasileiroValido("+55 48 98419 5309"), true);
// DDD 55 (Santa Maria) sem país: 11 dígitos, ganha o 55 e fica com 13.
conferir("DDD 55 não se confunde com o país", telefoneBrasileiroValido("55984195309"), true);

// ── Incompletos ──────────────────────────────────────────────────────────
conferir("sem DDD", telefoneBrasileiroValido("984195309"), false);
conferir("só o DDD", telefoneBrasileiroValido("48"), false);
conferir("vazio", telefoneBrasileiroValido(""), false);
conferir("só espaços", telefoneBrasileiroValido("   "), false);
conferir("nulo", telefoneBrasileiroValido(null), false);
conferir("indefinido", telefoneBrasileiroValido(undefined), false);
conferir("só pontuação", telefoneBrasileiroValido("() -"), false);
conferir("dígitos demais", telefoneBrasileiroValido("5548984195309999"), false);
// Texto não é telefone, por mais que tenha algarismos dentro.
conferir("nome com número", telefoneBrasileiroValido("Julio 2"), false);

// ── A normalização por trás ──────────────────────────────────────────────
conferir("completa o país", normalizeBrazilianPhone("48984195309"), "5548984195309");
conferir("não duplica o país", normalizeBrazilianPhone("5548984195309"), "5548984195309");
conferir("tira o zero à esquerda", normalizeBrazilianPhone("048984195309"), "5548984195309");

// ── As duas formas do mesmo número ───────────────────────────────────────
//
// A ficha guarda "5551993967887" e o WhatsApp "555193967887". Comparar
// literalmente falha em SILÊNCIO: o paciente só "não tem contato". Foi isso
// que fazia a foto do WhatsApp aparecer para 3 pacientes em vez de 10.
conferir("celular com 9 ganha a forma sem 9", variantesDoNumero("5551993967887").sort(), [
  "555193967887",
  "5551993967887",
]);
conferir("celular sem 9 ganha a forma com 9", variantesDoNumero("555193967887").sort(), [
  "555193967887",
  "5551993967887",
]);
// As duas entradas produzem o MESMO conjunto — é isso que faz a ponte casar
// venha o número de onde vier.
conferir(
  "os dois lados chegam no mesmo conjunto",
  JSON.stringify(variantesDoNumero("5548992006921").sort()) ===
    JSON.stringify(variantesDoNumero("554892006921").sort()),
  true,
);

// Fixo NÃO ganha um nono dígito: 55 48 3227-5240 com um 9 na frente é um
// número que não existe. Não casaria com nada, mas é lixo na consulta.
conferir("fixo fica sozinho", variantesDoNumero("554832275240"), ["554832275240"]);

// Telefone formatado, como a ficha grava.
conferir("aceita o número formatado da ficha", variantesDoNumero("+55 (51) 99396-7887").sort(), [
  "555193967887",
  "5551993967887",
]);

// Entradas que não dão para usar não podem virar uma lista com lixo dentro:
// um `IN` com string vazia casaria com quem tem telefone vazio.
conferir("vazio não vira variante", variantesDoNumero(""), []);
conferir("nulo não vira variante", variantesDoNumero(null), []);
conferir("número curto demais fica como está", variantesDoNumero("1234"), ["1234"]);

if (falhas.length) {
  console.error(`FALHOU (${falhas.length}):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens de telefone`);
