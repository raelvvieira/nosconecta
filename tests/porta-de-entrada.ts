// Checagens das portas de entrada sem marcador de anúncio.
//
// O erro que importa é o de cá: tratar "Olá" de fornecedor ou de amigo como
// lead, e a Luna sair respondendo quem o filtro de anúncio existe para calar.
import { portaDeEntrada } from "../supabase/functions/_shared/porta-de-entrada.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

// ── As mensagens prontas, como chegaram de verdade ──────────────────────
conferir(
  "botão do site",
  portaDeEntrada("Olá! Vim pelo site e gostaria de mais informações..."),
  "site",
);
conferir(
  "botão do site, outra página",
  portaDeEntrada("Olá! Vim pelo site e gostaria de mais informações sobre profilaxia"),
  "site",
);
conferir(
  "saudação padrão do anúncio",
  portaDeEntrada("Olá! Posso ter mais informações sobre isso?"),
  "anuncio sem marcador",
);
conferir(
  "saudação do anúncio com link antes",
  portaDeEntrada("Link:\n\n\nOlá! Posso ter mais informações sobre isso?"),
  "anuncio sem marcador",
);
conferir("sem acento e minúsculo", portaDeEntrada("ola vim pelo site"), "site");

// ── O que continua de fora ──────────────────────────────────────────────
for (const texto of [
  "Olá! Tudo bem?",
  "Boa tarde",
  "Oiee Mari, tudo certo por aí?",
  "Dra. Mariane, tudo bem? Me chamo Guilherme, da Inova Tech.",
  "Olá, no momento estamos fora do horário de atendimento.",
  "Vi no site de vocês uma promoção",
  "",
]) {
  conferir(`fica de fora: ${JSON.stringify(texto)}`, portaDeEntrada(texto), null);
}
conferir("nulo", portaDeEntrada(null), null);

if (falhas.length) {
  console.error(`porta-de-entrada: ${falhas.length} falha(s)\n` + falhas.join("\n"));
  process.exit(1);
}
console.log(`porta-de-entrada: ${ok} checagens ok`);
