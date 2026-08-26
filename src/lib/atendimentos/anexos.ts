// Leitura dos arquivos que vêm junto de uma mensagem do CRM.
//
// Mora fora de `atendimentos.functions.ts` porque aquele arquivo importa
// `@tanstack/react-start`, e um módulo de server function não carrega isolado
// num teste. Aqui não há import nenhum — dá para exercitar cada formato de
// resposta de verdade, em vez de reescrever a regra dentro do teste e verificar
// a cópia.

/**
 * Um arquivo que veio junto da mensagem.
 *
 * Nomes do Chatwoot, que é a base deste CRM: `file_type` diz o que é,
 * `data_url` é o arquivo e `thumb_url` a miniatura (só de imagem e vídeo).
 */
export interface MessageAttachment {
  id: string;
  tipo: "image" | "audio" | "video" | "file";
  url: string;
  /** Miniatura, quando existe. Cai para `url` quando não. */
  thumbUrl: string;
}

/** Os quatro tipos que o Chatwoot distingue. Qualquer outro vira `file`, que é
 *  o desenho genérico — melhor um cartão de arquivo do que a mensagem sumir. */
const TIPOS_DE_ANEXO = new Set(["image", "audio", "video", "file"]);

export function mapAttachments(lista: unknown): MessageAttachment[] {
  if (!Array.isArray(lista)) return [];
  const anexos: MessageAttachment[] = [];
  for (const a of lista as any[]) {
    // Sem URL não há o que mostrar, e um cartão vazio confunde mais do que a
    // ausência.
    const url: unknown = a?.data_url ?? a?.file_url ?? a?.url ?? null;
    if (!url) continue;
    const bruto = String(a?.file_type ?? "file");
    anexos.push({
      id: String(a?.id ?? url),
      tipo: (TIPOS_DE_ANEXO.has(bruto) ? bruto : "file") as MessageAttachment["tipo"],
      url: String(url),
      thumbUrl: String(a?.thumb_url ?? url),
    });
  }
  return anexos;
}
