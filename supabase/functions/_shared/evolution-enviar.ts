// Monta o que vai para a Evolution API quando o sistema MANDA uma mensagem.
//
// É o par de `evolution-mapear.ts`, na direção contrária: lá a Evolution fala
// e a gente traduz; aqui a gente fala e precisa acertar a língua dela.
//
// ── Por que um módulo sem import nenhum ────────────────────────────────
//
// Pelo mesmo motivo do tradutor: errar aqui não levanta exceção. Um número
// montado errado não dá erro — a Evolution aceita, responde 200, e a mensagem
// simplesmente não chega em ninguém. O paciente fica sem resposta e ninguém
// fica sabendo. Um módulo puro é o que permite exercitar cada formato de
// número de verdade, em `tests/evolution-enviar.ts`.
//
// ── Sobre o nono dígito ────────────────────────────────────────────────
//
// No Brasil, celular tem 9 dígitos desde 2012, mas MUITA conta de WhatsApp
// antiga ainda está registrada com 8. Mandar para o número errado dos dois é
// mandar para o vazio.
//
// A escolha aqui é NÃO adivinhar: a gente manda os dígitos como estão e deixa
// a Evolution resolver o JID, porque o Baileys tem a regra brasileira embutida
// e consulta o servidor do WhatsApp para saber qual das duas formas existe.
// Qualquer heurística nossa seria um palpite pior, feito sem acesso a essa
// informação.

/** Um número pronto para a Evolution, ou `null` quando não dá para mandar. */
export function numeroParaEnvio(bruto: unknown): string | null {
  const digitos = String(bruto ?? "").replace(/\D/g, "");
  if (!digitos) return null;

  // Já veio com país (10 a 15 dígitos é a faixa do E.164 útil): usa como está.
  if (digitos.length >= 12 && digitos.length <= 15) return digitos;

  // 10 ou 11 dígitos é número brasileiro sem o país — DDD + 8 ou 9 dígitos.
  // Prefixar 55 é o único completamento seguro: é o único país que este
  // sistema atende, e sem ele a Evolution mandaria para o DDD como se fosse
  // código de país.
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`;

  // Qualquer outra coisa — ramal, número truncado, campo com lixo — não vira
  // envio. Recusar é o certo: o erro aparece na fila, e não como uma mensagem
  // que ninguém recebeu.
  return null;
}

/** Grupo: a identidade é o id do grupo, não um telefone. */
export function ehJidDeGrupo(valor: unknown): boolean {
  return String(valor ?? "").includes("@g.us");
}

/** O destino, aceitando tanto telefone solto quanto o `remoteJid` do espelho. */
export function destinoDaMensagem(bruto: unknown): string | null {
  const texto = String(bruto ?? "");
  // Grupo vai inteiro: a Evolution espera o próprio id.
  if (ehJidDeGrupo(texto)) return texto;
  // JID de pessoa ("5548...@s.whatsapp.net") — fica só o número.
  const antes = texto.includes("@") ? texto.split("@")[0].split(":")[0] : texto;
  return numeroParaEnvio(antes);
}

export interface MidiaParaEnvio {
  nome: string;
  tipo: string;
  /** Conteúdo já em base64, SEM o prefixo `data:`. */
  base64: string;
}

/** `POST /message/sendText/{instancia}` */
export function corpoDeTexto(destino: string, texto: string): Record<string, unknown> {
  return { number: destino, text: texto };
}

/**
 * `POST /message/sendMedia/{instancia}`
 *
 * O texto vai em `caption`, na MESMA requisição — é assim que sai uma
 * mensagem só, com a foto legendada, e não duas seguidas. Vale a mesma razão
 * que já valia no caminho do CRM.
 */
export function corpoDeMidia(
  destino: string,
  midia: MidiaParaEnvio,
  legenda?: string | null,
): Record<string, unknown> {
  return {
    number: destino,
    mediatype: tipoDeMidia(midia.tipo),
    mimetype: midia.tipo || "application/octet-stream",
    media: midia.base64,
    fileName: midia.nome,
    ...(legenda ? { caption: legenda } : {}),
  };
}

/** A gaveta da Evolution: `image`, `video`, `audio` ou `document`. */
export function tipoDeMidia(mime: unknown): "image" | "video" | "audio" | "document" {
  const t = String(mime ?? "").toLowerCase();
  if (t.startsWith("image/")) return "image";
  if (t.startsWith("video/")) return "video";
  if (t.startsWith("audio/")) return "audio";
  return "document";
}

/** Bytes → base64, sem estourar a pilha com arquivo grande.
 *
 *  `String.fromCharCode(...bytes)` de uma vez passa o array inteiro como
 *  argumentos e estoura em arquivo de poucos MB — o anexo de campanha cabe
 *  nesse tamanho. Em pedaços, não estoura. */
export function paraBase64(bytes: Uint8Array): string {
  let binario = "";
  const pedaco = 0x8000;
  for (let i = 0; i < bytes.length; i += pedaco) {
    binario += String.fromCharCode(...bytes.subarray(i, i + pedaco));
  }
  return btoa(binario);
}

/** O caminho da chamada, para a instância dada. */
export function rota(acao: "sendText" | "sendMedia", instancia: string): string {
  return `/message/${acao}/${encodeURIComponent(instancia)}`;
}
