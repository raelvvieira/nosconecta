/** Mensagem de erro que diz o que fazer, e não só o número do problema.
 *
 *  Uma Edge Function que ainda não foi publicada devolve 404 do roteador do
 *  Supabase — `{"code":"NOT_FOUND","message":"Requested function was not
 *  found"}`, sem o campo `error` que as nossas funções usam. O resultado na
 *  tela era "Falha na conexão (404)": um número, para alguém que não tem como
 *  saber que 404 ali quer dizer "falta publicar".
 */
export function erroDaEdgeFunction(nome: string, status: number, json: unknown): Error {
  if (status === 404) {
    return new Error(
      `A função "${nome}" ainda não foi publicada. No Lovable: "Deploy the ${nome} edge function" e depois Publish.`,
    );
  }
  const corpo = (json ?? {}) as { error?: unknown; message?: unknown };
  const detalhe = corpo.error ?? corpo.message;
  return new Error(
    typeof detalhe === "string" && detalhe ? detalhe : `Falha ao chamar ${nome} (${status}).`,
  );
}
