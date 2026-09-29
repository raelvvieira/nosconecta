// Checagens do corte das mensagens longas.
//
// ── O defeito que trouxe este arquivo ───────────────────────────────────
//
// Numa conversa de 28/09 a Luna mandou "…o de consultório com limpeza e 2
// sessões é R$ 600, e o combinado fica R$" e, na mensagem seguinte, "990.".
// Por um segundo o preço que a pessoa leu foi "R$", e depois um número solto.
//
// O corte caiu no espaço mais próximo do meio do texto — e o espaço mais
// próximo do meio era logo depois do cifrão. Este módulo é puro e nunca tinha
// teste; é isso que deixou o defeito passar até a conversa real.
//
// Os modos de errar:
//
//   **Deixar palavra pendurada.** "R$", "às", "de": o que vem antes da
//   informação que importa não pode fechar uma mensagem.
//
//   **Cortar no meio da palavra.** Pior ainda, e é o que acontece quando não
//   existe espaço viável.
//
//   **Estourar o limite.** Mensagem partida no lugar estranho é ruim; mensagem
//   que não chega é pior.
//
//   **Deixar fiapo.** Duas palavras soltas depois de um parágrafo não é o que
//   uma pessoa manda.
import {
  RITMO_PADRAO,
  esperaDeDigitacao,
  normalizarRitmo,
  segmentar,
} from "../supabase/functions/_shared/humanizacao.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

const ritmo = (p: Partial<typeof RITMO_PADRAO> = {}) => normalizarRitmo({ ...RITMO_PADRAO, ...p });

// ── O caso real, com o texto real ────────────────────────────────────────
{
  const texto =
    "Oii, aqui é a Luna, auxiliar da Dra. Mariane 😊 O clareamento caseiro personalizado é R$ 790, " +
    "o de consultório com limpeza e 2 sessões é R$ 600, e o combinado fica R$ 990. Também temos o " +
    "combo de clareamento de consultório com limpeza completa por R$ 399. Todos podem ser pagos em " +
    "até 10x no cartão. Você tem preferência por algum deles?";
  const pedacos = segmentar(texto, ritmo({ limite: 300, minimo: 50 }));

  conferir(
    "nenhuma mensagem termina em R$",
    pedacos.some((p) => /R\$$/.test(p.trim())),
    false,
  );
  conferir(
    "nenhuma mensagem começa com número solto",
    pedacos.some((p) => /^\d/.test(p.trim())),
    false,
  );
  conferir(
    "o texto sobrevive inteiro",
    pedacos.join(" ").replace(/\s+/g, " "),
    texto.replace(/\s+/g, " "),
  );
  conferir(
    "todas cabem no limite",
    pedacos.every((p) => p.length <= 300),
    true,
  );
}

// ── A palavra pendurada, em texto de preço ───────────────────────────────
//
// O limite mínimo é 80 (ver `normalizarRitmo`), então o teste usa números que
// a tela também usaria — 80 é o mais apertado que a clínica consegue pedir.
{
  const texto =
    "O combo de limpeza com clareamento em consultório sai por R$ 399 para você hoje, " +
    "e o clareamento caseiro personalizado fica em R$ 790 no total, em até 10x no cartão.";
  const pedacos = segmentar(texto, ritmo({ limite: 80, minimo: 20 }));
  conferir(
    "não fecha em R$",
    pedacos.some((p) => /R\$$/.test(p)),
    false,
  );
  conferir(
    "não fecha em preposição",
    pedacos.some((p) => /\b(de|da|do|em|no|na|para|com|por|às|e|ou|é|até)$/i.test(p.trim())),
    false,
  );
  conferir(
    "nenhum pedaço começa com número solto",
    pedacos.some((p) => /^\d/.test(p)),
    false,
  );
  conferir("o texto sobrevive", pedacos.join(" "), texto);
}

// ── Sem corte quando não precisa ─────────────────────────────────────────
conferir("texto curto vai inteiro", segmentar("Oi, tudo bem?", ritmo()), ["Oi, tudo bem?"]);
conferir("texto vazio não vira mensagem", segmentar("   ", ritmo()), []);
conferir(
  "com segmentação desligada, vai inteiro",
  segmentar("a".repeat(500), ritmo({ segmentar: false })).length,
  1,
);
// O limite tem piso de 80: pedir menos não parte a mensagem em pedacinhos.
conferir("limite abaixo do piso vira o piso", ritmo({ limite: 10 }).limite, 80);

// ── Fim de frase é o corte preferido ─────────────────────────────────────
{
  const texto =
    "Primeira frase bem completa aqui, com folga para passar de oitenta letras. " +
    "Segunda frase também completa aqui.";
  const pedacos = segmentar(texto, ritmo({ limite: 80, minimo: 20 }));
  conferir(
    "corta no ponto final",
    pedacos[0],
    "Primeira frase bem completa aqui, com folga para passar de oitenta letras.",
  );
}

// ── O fiapo ──────────────────────────────────────────────────────────────
{
  const texto =
    "Uma frase longa o suficiente para estourar o limite de oitenta letras e sobrar pouco. Ok";
  const pedacos = segmentar(texto, ritmo({ limite: 80, minimo: 20 }));
  conferir(
    "nenhum pedaço fica abaixo do mínimo",
    pedacos.some((p) => p.length < 20),
    false,
  );
  conferir("e o texto continua inteiro", pedacos.join(" "), texto);
}

// ── A espera de digitação ────────────────────────────────────────────────
conferir(
  "espera proporcional ao tamanho",
  esperaDeDigitacao("12345", ritmo({ msPorCaractere: 50 })),
  250,
);
conferir(
  "espera tem teto de 12s",
  esperaDeDigitacao("a".repeat(10_000), ritmo({ msPorCaractere: 50 })),
  12_000,
);
conferir(
  "sem atraso configurado, não espera",
  esperaDeDigitacao("abc", ritmo({ msPorCaractere: 0 })),
  0,
);

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens da humanização`);
