// A pessoa chegou por uma porta de captação, mesmo sem o marcador do anúncio?
//
// ── O buraco que isto fecha ─────────────────────────────────────────────
//
// Com "só quem vem de anúncio" ligado, a Luna só fala com quem traz
// `ctwaClid` na primeira mensagem (`veio-de-anuncio.ts`). Só que há leads que
// chegam sem ele:
//
//   - o botão de WhatsApp do site, que manda pronto "Olá! Vim pelo site e
//     gostaria de mais informações...";
//   - o anúncio cujo clique perde o marcador no caminho (status do WhatsApp,
//     WhatsApp Web), que chega só com a saudação padrão da Meta, "Olá! Posso
//     ter mais informações sobre isso?".
//
// De 15 a 28/10 foram 8 conversas assim ignoradas com "não veio de anúncio",
// gente que pediu informação e não teve resposta de ninguém.
//
// ── Por que frases exatas, e não "parece interessado" ───────────────────
//
// O filtro de anúncio existe para a Luna NÃO falar com fornecedor, amigo,
// paciente antigo e resposta automática de outras empresas, e todos eles
// também mandam "Olá" e "Boa tarde". Estas frases são as mensagens PRONTAS das
// portas de entrada: ninguém digita "vim pelo site e gostaria de mais
// informações" por acaso. Lista curta de propósito; uma porta nova entra aqui.

export type PortaDeEntrada = "site" | "anuncio sem marcador";

/** Sem acento, minúsculo, pontuação virando espaço. */
function normalizar(texto: string): string {
  return ` ${texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
}

const PORTAS: { porta: PortaDeEntrada; frase: string }[] = [
  // O botão de WhatsApp do site.
  { porta: "site", frase: "vim pelo site" },
  // A saudação padrão de anúncio de clique para WhatsApp, em português.
  { porta: "anuncio sem marcador", frase: "posso ter mais informacoes sobre isso" },
];

/** A porta por onde a mensagem chegou, ou `null` se ela não é uma mensagem pronta. */
export function portaDeEntrada(texto: string | null | undefined): PortaDeEntrada | null {
  if (!texto) return null;
  const n = normalizar(texto);
  return PORTAS.find((p) => n.includes(` ${p.frase} `))?.porta ?? null;
}
