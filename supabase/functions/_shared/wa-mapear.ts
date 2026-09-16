// As regras de leitura do CRM, sem nada do Deno em volta.
//
// Mora fora de `wa-espelho/index.ts` pelo mesmo motivo que `anexos.ts` mora
// fora de `atendimentos.functions.ts`: aquele arquivo abre servidor e cria
// cliente do Supabase no topo, e não carrega isolado num teste. Aqui não há
// import nenhum — dá para exercitar cada formato de resposta de verdade, em
// vez de reescrever a regra dentro do teste e conferir a cópia.
//
// São as três regras que erram CALADAS: uma data mal lida põe a conversa no
// lugar errado da lista, um anexo mal lido some do chat, e um `message_type`
// mal lido põe a fala da clínica do lado do paciente.

/** Epoch em segundos, em milissegundos, ou data em texto — o CRM usa os três. */
export function paraIso(valor: unknown): string | null {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor === "string") {
    // Texto só de dígitos é epoch em texto, não uma data para o `Date.parse`.
    // Parece rebuscado e não é: este CRM já mandou `message_type` como STRING
    // onde a documentação dizia número, e aquilo pôs a fala da clínica do lado
    // do paciente. Aqui o estrago seria pior — `Date.parse("1757851200")` é
    // NaN, a data viraria "agora", e a mensagem saltaria para o topo da
    // conversa como se tivesse acabado de chegar.
    if (!/^\d+$/.test(valor.trim())) {
      const t = Date.parse(valor);
      return Number.isNaN(t) ? null : new Date(t).toISOString();
    }
  }
  const n = Number(valor);
  if (!n || !Number.isFinite(n)) return null;
  // Abaixo de 10 bilhões é segundo; acima, milissegundo. A fronteira cai em
  // 2286 para segundos e em 1970 para milissegundos — não há data real de
  // conversa dos dois lados dela.
  return new Date(n < 10_000_000_000 ? n * 1000 : n).toISOString();
}

export interface AnexoEspelhado {
  id: string;
  tipo: "image" | "audio" | "video" | "file";
  url: string | null;
  thumbUrl: string | null;
}

/**
 * Anexos, com os nomes do Chatwoot: `file_type` diz o que é, `data_url` é o
 * arquivo e `thumb_url` a miniatura (só de imagem e vídeo).
 *
 * Tipo desconhecido vira "file" em vez de ser descartado: um documento que o
 * paciente mandou não pode sumir do histórico porque o CRM chamou o formato
 * de um nome que não estava na lista.
 */
export function mapearAnexos(brutos: unknown): AnexoEspelhado[] {
  if (!Array.isArray(brutos)) return [];
  return brutos.map((a: any) => {
    const tipo = String(a?.file_type ?? "").toLowerCase();
    const url = a?.data_url ?? a?.url ?? null;
    return {
      id: String(a?.id ?? ""),
      tipo: (["image", "audio", "video"].includes(tipo) ? tipo : "file") as AnexoEspelhado["tipo"],
      url,
      thumbUrl: a?.thumb_url ?? url,
    };
  });
}

/**
 * `message_type` 0 = do contato, 1 = da clínica.
 *
 * Aceita número E string porque o valor chegou como string em teste real —
 * com a comparação estrita em número, TODA mensagem caía como recebida e as
 * respostas da clínica apareciam do lado errado da conversa.
 */
export function saiuDaClinica(tipo: unknown): boolean {
  return tipo === 1 || tipo === "1" || tipo === "outgoing";
}

/** A situação da conversa, restrita ao que a tabela aceita. */
export function situacaoDaConversa(bruto: unknown): "open" | "resolved" | "pending" {
  return bruto === "resolved" ? "resolved" : bruto === "pending" ? "pending" : "open";
}

/** A caixa por onde a conversa entrou. O nome do campo nunca foi confirmado
 *  com o Wavy: as três formas plausíveis, e nulo em vez de inventar uma caixa. */
export function caixaDaConversa(linha: any): string | null {
  const bruto = linha?.inbox_id ?? linha?.inboxId ?? linha?.inbox?.id ?? null;
  const texto = bruto === null || bruto === undefined ? "" : String(bruto);
  return texto.trim() || null;
}
