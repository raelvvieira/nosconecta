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
  /**
   * Nome do arquivo, quando dá para saber.
   *
   * A resposta não traz um campo de nome, mas o CRM guarda os anexos no
   * ActiveStorage do Rails e a URL termina no nome original. Sem isto, três
   * documentos seguidos na conversa apareceriam como "Abrir arquivo",
   * "Abrir arquivo", "Abrir arquivo" — e quem atende teria que baixar os três
   * para achar o orçamento.
   */
  nome: string | null;
}

/**
 * O nome do arquivo dentro da URL, ou `null`.
 *
 * Descarta a query ANTES do último `/`: as URLs do CRM são assinadas, e a
 * assinatura vai na query — sem tirá-la, o "nome" viria com a assinatura
 * inteira grudada. Só aceita o que tem extensão, porque um último segmento sem
 * ponto costuma ser um id opaco, e mostrar um id no lugar do nome é pior do que
 * não mostrar nome nenhum.
 */
export function nomeDoArquivo(url: string): string | null {
  const semQuery = url.split("?")[0].split("#")[0];
  const ultimo = semQuery.split("/").filter(Boolean).pop();
  if (!ultimo || !/\.[a-z0-9]{1,8}$/i.test(ultimo)) return null;
  try {
    return decodeURIComponent(ultimo);
  } catch {
    return ultimo; // percent-encoding quebrado não justifica perder o nome
  }
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
      // Se o CRM um dia mandar um nome de verdade, ele ganha da dedução.
      nome: (a?.file_name ?? a?.filename ?? null) || nomeDoArquivo(String(url)),
    });
  }
  return anexos;
}
