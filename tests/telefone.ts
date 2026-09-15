// Checagens do telefone que decide se a conversão casa na Meta.
//
// Este é o único identificador que o sistema tem da maioria dos pacientes.
// Número pela metade é aceito pela Meta, some no hash e nunca vira Lead
// atribuído — erro que não levanta exceção nenhuma e só aparece semanas
// depois, como um anúncio que "não trouxe ninguém".
import {
  normalizeBrazilianPhone,
  telefoneBrasileiroValido,
} from "../src/lib/atendimentos/phone.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
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

if (falhas.length) {
  console.error(`FALHOU (${falhas.length}):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens de telefone`);
