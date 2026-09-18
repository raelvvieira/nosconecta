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
  /**
   * O arquivo. Pode ser `null`.
   *
   * O CRM sempre manda a URL. A Evolution NÃO: ela guarda a mídia dela mesma
   * e às vezes só avisa que veio uma foto, deixando para entregar o arquivo
   * quando for pedido. Descartar o anexo nesse caso — que era o que o leitor
   * do CRM fazia — transforma "o paciente mandou uma foto" em uma bolha
   * vazia, que é o pior dos dois: some a informação E some o aviso de que
   * algo sumiu.
   */
  url: string | null;
  /** Miniatura, quando existe. Cai para `url` quando não. */
  thumbUrl: string | null;
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

/**
 * Os anexos como o ESPELHO os guarda.
 *
 * Forma diferente da do CRM, e é por isso que existe uma segunda função em vez
 * de um `??` a mais na primeira: aqui os campos são `tipo`/`url`/`thumbUrl`
 * (o que `_shared/wa-mapear.ts` e `_shared/evolution-mapear.ts` gravam), e lá
 * são `file_type`/`data_url`/`thumb_url` (os nomes do Chatwoot). Misturar as
 * duas leituras numa função só faria cada campo aceitar quatro nomes, e o
 * primeiro que casasse venceria — inclusive o errado.
 */
export function anexosDoEspelho(lista: unknown): MessageAttachment[] {
  if (!Array.isArray(lista)) return [];
  const anexos: MessageAttachment[] = [];
  for (const a of lista as Record<string, unknown>[]) {
    if (!a || typeof a !== "object") continue;
    const bruto = String(a.tipo ?? "file");
    const url = a.url ? String(a.url) : null;
    const nome = a.nome ? String(a.nome) : null;
    anexos.push({
      id: String(a.id ?? url ?? anexos.length),
      tipo: (TIPOS_DE_ANEXO.has(bruto) ? bruto : "file") as MessageAttachment["tipo"],
      url,
      thumbUrl: a.thumbUrl ? String(a.thumbUrl) : url,
      nome: nome || (url ? nomeDoArquivo(url) : null),
    });
  }
  return anexos;
}
