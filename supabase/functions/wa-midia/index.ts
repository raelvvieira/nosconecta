// Abre a foto, o áudio ou o documento que chegou pelo WhatsApp.
//
// ── Por que existe ──────────────────────────────────────────────────────
//
// O evento da Evolution traz a mídia como um link `mmg.whatsapp.net/….enc`:
// o arquivo CRIPTOGRAFADO, que só o aparelho abre com a `mediaKey`. O espelho
// guardava esse link, o navegador tentava abrir, e o chat mostrava "Não foi
// possível carregar o arquivo" em toda foto e todo áudio desde que o WhatsApp
// passou a ser a conexão própria.
//
// A Evolution sabe decifrar: `getBase64FromMediaMessage` recebe a mensagem
// original (com a chave) e devolve o arquivo aberto. Esta função faz isso UMA
// vez por mensagem, guarda o arquivo no depósito `wa-midia` e anota o caminho
// no anexo. Da segunda vez em diante é só assinar o link, sem falar com a
// Evolution.
//
// ── Por que sob demanda, e não no webhook ───────────────────────────────
//
// O webhook precisa responder rápido para a Evolution não reenviar o evento, e
// a maior parte das mídias nunca é aberta. Baixar quando alguém olha custa uma
// espera de um ou dois segundos na primeira vez, e nada nas outras.
//
// A chave da Evolution é segredo do Supabase, por isso uma Edge Function, como
// `wa-enviar` e `wa-lida`.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { conexaoParaEnviar, evolutionFetch } from "../_shared/evolution-api.ts";
import { soOSistema } from "../_shared/so-o-sistema.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const DEPOSITO = "wa-midia";
/** Uma hora: quem abre a conversa ouve o áudio agora, não amanhã. */
const VALIDADE_DO_LINK = 60 * 60;

const EXTENSAO: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "application/pdf": "pdf",
};

function extensaoDe(mimetype: string): string {
  const base = mimetype.split(";")[0].trim().toLowerCase();
  return EXTENSAO[base] ?? (base.split("/")[1] || "bin").replace(/[^a-z0-9]/g, "").slice(0, 8);
}

function bytesDe(base64: string): Uint8Array {
  const bin = atob(base64.replace(/^data:[^,]*,/, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function assinar(caminho: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(DEPOSITO)
    .createSignedUrl(caminho, VALIDADE_DO_LINK);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? "não deu para assinar o link");
  return data.signedUrl;
}

async function abrir(ownerId: string, messageId: string) {
  const { data: linha, error } = await supabase
    .from("wa_messages")
    .select("id, payload, attachments")
    .eq("owner_id", ownerId)
    .eq("crm_message_id", messageId)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`não deu para ler a mensagem: ${error.message}`);
  if (!linha) return { erro: "mensagem não encontrada" };

  const anexos = Array.isArray(linha.attachments)
    ? (linha.attachments as Record<string, unknown>[])
    : [];
  const guardado = anexos.find((a) => typeof a?.path === "string" && a.path);
  if (guardado) {
    return { url: await assinar(String(guardado.path)), mimetype: guardado.mimetype ?? null };
  }

  const payload = (linha.payload ?? {}) as Record<string, unknown>;
  if (!payload.key || !payload.message) return { erro: "a mensagem não tem a mídia original" };

  const { instancia, motivo } = await conexaoParaEnviar(supabase, ownerId);
  if (!instancia) return { erro: motivo };

  const resposta = await evolutionFetch(
    `/chat/getBase64FromMediaMessage/${encodeURIComponent(instancia)}`,
    {
      method: "POST",
      body: JSON.stringify({
        message: { key: payload.key, message: payload.message },
        convertToMp4: false,
      }),
    },
    45_000,
  );
  const base64 = String(resposta?.base64 ?? "");
  if (!base64) return { erro: "a Evolution não devolveu o arquivo" };
  const mimetype = String(resposta?.mimetype ?? "application/octet-stream");

  const caminho = `${ownerId}/recebidas/${messageId.replace(/[^A-Za-z0-9_-]/g, "")}.${extensaoDe(mimetype)}`;
  const { error: erroAoGuardar } = await supabase.storage
    .from(DEPOSITO)
    .upload(caminho, bytesDe(base64), { contentType: mimetype.split(";")[0], upsert: true });
  if (erroAoGuardar) throw new Error(`não deu para guardar o arquivo: ${erroAoGuardar.message}`);

  // Anota o caminho no anexo: da próxima vez, nada de Evolution.
  const atualizados = anexos.length
    ? anexos.map((a, i) => (i === 0 ? { ...a, path: caminho, mimetype } : a))
    : [{ id: messageId, path: caminho, mimetype }];
  await supabase.from("wa_messages").update({ attachments: atualizados }).eq("id", linha.id);

  return { url: await assinar(caminho), mimetype };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  const barrado = soOSistema(req);
  if (barrado) return barrado;
  try {
    const body = await req.json().catch(() => ({}));
    const { ownerId, messageId } = (body ?? {}) as { ownerId?: string; messageId?: string };
    if (!ownerId || !messageId) {
      return Response.json({ error: "ownerId e messageId são obrigatórios" }, { status: 400 });
    }
    return Response.json(await abrir(ownerId, String(messageId)));
  } catch (e) {
    // 200 com o motivo: quem chama é uma bolha do chat, e ela mostra o aviso
    // de "não carregou" em vez de derrubar a conversa.
    console.warn("[wa-midia]", e instanceof Error ? e.message : e);
    return Response.json({ erro: e instanceof Error ? e.message : "falhou" });
  }
});
