/**
 * Entrega os ARQUIVOS do Lovable para a migração. Roda no projeto do Lovable,
 * e só se a pessoa autorizar publicar ("Deploy the migracao-exportar edge
 * function").
 *
 * ── Por que só arquivos ───────────────────────────────────────────────────
 *
 * Os dados das tabelas e os logins saem pelo próprio banco (pg_net →
 * `migracao-receber`). Arquivo não: o conteúdo mora no armazenamento, fora do
 * banco, e baixá-lo exige a chave de serviço — que só as funções do Lovable
 * têm. Esta função usa a chave lá dentro e devolve LINKS que expiram em 10
 * minutos; a chave em si nunca sai.
 *
 * ── A porta ───────────────────────────────────────────────────────────────
 *
 * Aqui está só a IMPRESSÃO DIGITAL (SHA-256) da chave; a chave mesma fica num
 * arquivo fora do git (`scripts/migracao/.exportacao`), na máquina que roda a
 * cópia. Assim a pessoa não precisa criar nem colar segredo nenhum no Lovable
 * — e quem lê este código não consegue abrir a porta. Pedido sem a chave
 * certa: 404. Apagar a função depois da virada.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DEPOSITOS = new Set(["crm-campaign-media", "wa-midia", "patient-files"]);
const VALIDADE_SEGUNDOS = 600;

function admin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}

/** Todos os arquivos do depósito, descendo nas pastas. */
async function listar(deposito: string) {
  const storage = admin().storage.from(deposito);
  const arquivos: { nome: string; tamanho: number; tipo: string | null }[] = [];
  const pastas = [""];
  while (pastas.length) {
    const pasta = pastas.shift()!;
    for (let pagina = 0; ; pagina += 1) {
      const { data, error } = await storage.list(pasta, { limit: 1000, offset: pagina * 1000 });
      if (error) throw error;
      for (const item of data ?? []) {
        const caminho = pasta ? `${pasta}/${item.name}` : item.name;
        // Pasta não tem id: é só um prefixo.
        if (item.id === null) pastas.push(caminho);
        else
          arquivos.push({
            nome: caminho,
            tamanho: Number(item.metadata?.size ?? 0),
            tipo: (item.metadata?.mimetype as string | undefined) ?? null,
          });
      }
      if ((data ?? []).length < 1000) break;
    }
  }
  return arquivos;
}

const IMPRESSAO_DA_CHAVE = "d43d4be27cc7a41dd2716bdf3a77ccf7831062a1093bcfeb76743b7181975b5e";

async function impressao(texto: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const chave = req.headers.get("x-migracao") ?? "";
  if (req.method !== "POST" || !chave || (await impressao(chave)) !== IMPRESSAO_DA_CHAVE) {
    return new Response("Not found", { status: 404 });
  }
  try {
    const { acao, deposito, nomes } = await req.json();
    if (!DEPOSITOS.has(deposito))
      return Response.json({ erro: "depósito inválido" }, { status: 400 });

    if (acao === "listar") return Response.json({ arquivos: await listar(deposito) });

    if (acao === "assinar") {
      const lista = (Array.isArray(nomes) ? nomes : []).slice(0, 100).map(String);
      const { data, error } = await admin()
        .storage.from(deposito)
        .createSignedUrls(lista, VALIDADE_SEGUNDOS);
      if (error) throw error;
      return Response.json({ links: data.map((d) => ({ nome: d.path, url: d.signedUrl })) });
    }
    return Response.json({ erro: "ação inválida" }, { status: 400 });
  } catch (erro) {
    return Response.json({ erro: (erro as Error).message }, { status: 500 });
  }
});
