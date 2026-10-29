// Só o próprio sistema chama estas rotinas.
//
// ── A brecha ────────────────────────────────────────────────────────────
//
// As Edge Functions nasceram com a verificação padrão do Supabase, que deixa
// passar qualquer chave do projeto, INCLUSIVE a pública (a "anon", que vai
// dentro do site para o navegador usar). E quase todas pegam o consultório do
// corpo do pedido (`ownerId`). Com um consultório só, isso não abria nada. Com
// vários, qualquer pessoa com a chave pública podia mandar WhatsApp, ler mídia
// ou desligar a conexão de OUTRO consultório, só trocando o `ownerId`.
//
// ── A regra ─────────────────────────────────────────────────────────────
//
// Quem chama de verdade é sempre o próprio sistema, com a chave de serviço: as
// server functions do site (`callEdgeFunction` e irmãs, que só rodam no
// servidor), o cron (`chamar_rotina`, que lê a chave do cofre do banco) e uma
// Edge Function chamando outra. Então só passa a chave de serviço.
//
// Os webhooks (`wa-webhook`, `whatsapp-inbound-webhook`) ficam de fora: quem
// os chama é a Evolution, com o segredo próprio deles.

function papelDoJwt(token: string): string | null {
  const partes = token.split(".");
  if (partes.length !== 3) return null;
  try {
    const json = atob(partes[1].replace(/-/g, "+").replace(/_/g, "/"));
    const papel = (JSON.parse(json) as { role?: unknown }).role;
    return typeof papel === "string" ? papel : null;
  } catch {
    return null;
  }
}

/** Comparação que não vaza, pelo tempo, quantos caracteres bateram. */
function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

/**
 * A chamada veio do próprio sistema?
 *
 * Duas formas de provar, porque o Supabase tem dois formatos de chave: a
 * mesma chave de serviço que esta função conhece, ou um JWT com papel
 * `service_role`. O JWT só chega aqui depois de o próprio Supabase conferir a
 * assinatura (`verify_jwt`, ligado em todas estas funções), então ler o papel
 * dele é seguro.
 */
export function chamadaDoSistema(autorizacao: string | null, chaveDeServico: string): boolean {
  const token = String(autorizacao ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!token) return false;
  if (chaveDeServico && iguais(token, chaveDeServico)) return true;
  return papelDoJwt(token) === "service_role";
}

/**
 * `null` quando pode seguir; uma resposta 401 quando não.
 *
 * Uso, no começo do `Deno.serve`, depois do OPTIONS:
 *
 *   const barrado = soOSistema(req);
 *   if (barrado) return barrado;
 */
export function soOSistema(req: Request): Response | null {
  if (
    chamadaDoSistema(
      req.headers.get("authorization"),
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    )
  ) {
    return null;
  }
  return new Response(JSON.stringify({ error: "não autorizado" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}
