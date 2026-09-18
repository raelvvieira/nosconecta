// Conectar e desconectar o WhatsApp na Evolution própria.
//
// ── O que isto tira da frente de quem usa ───────────────────────────────
//
// Sem esta função, conectar exige abrir o painel da Evolution e digitar a API
// key — uma chave de 64 caracteres que dá controle total do WhatsApp da
// clínica. Pedir isso a quem só quer ligar o telefone é errado por dois
// motivos: é difícil, e espalha a chave por telas e áreas de transferência.
//
// Aqui a chave mora no ambiente do Supabase e nunca sai dele. A tela chama
// esta função; esta função chama a Evolution.
//
// ── E o campo de número também some ─────────────────────────────────────
//
// O caminho antigo, pelo CRM, pedia o número antes de gerar o QR. A Evolution
// não precisa: quem escaneia É o número, e ela descobre qual é na conexão.
// Um campo a menos para errar.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { evolutionFetch } from "../_shared/evolution-api.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
// A leitura dos segredos e a chamada em si moram em `_shared/evolution-api.ts`:
// o envio de mensagem também fala com a Evolution, e duas cópias da mesma
// coisa divergem em silêncio.
const evolution = evolutionFetch;

/**
 * A instância desta clínica — criando uma se ainda não houver.
 *
 * O nome sai do id do dono, não de um campo na tela: nome de instância é
 * detalhe de infraestrutura, e pedir para alguém inventar um só criaria
 * chance de duas clínicas escolherem o mesmo.
 */
async function instanciaDoDono(ownerId: string): Promise<string> {
  const { data } = await supabase
    .from("wa_instances")
    .select("instance_name")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (data?.instance_name) return data.instance_name;

  const nome = `nos-${ownerId.slice(0, 8)}`;
  await evolution("/instance/create", {
    method: "POST",
    body: JSON.stringify({ instanceName: nome, integration: "WHATSAPP-BAILEYS", qrcode: true }),
  }).catch((e) => {
    // "already in use" não é erro aqui: significa que a instância existe na
    // Evolution mas não estava registrada deste lado. Registrar resolve.
    if (!/already|exists|in use/i.test(String(e?.message ?? ""))) throw e;
  });

  await supabase
    .from("wa_instances")
    .upsert(
      { owner_id: ownerId, instance_name: nome, status: "connecting" },
      { onConflict: "instance_name" },
    );
  return nome;
}

const ESTADOS: Record<string, "open" | "connecting" | "close"> = {
  open: "open",
  connecting: "connecting",
  close: "close",
};

async function situacao(ownerId: string) {
  const nome = await instanciaDoDono(ownerId);
  const json = await evolution(`/instance/connectionState/${encodeURIComponent(nome)}`).catch(
    () => null,
  );
  const bruto = String(json?.instance?.state ?? json?.state ?? "").toLowerCase();
  const estado = ESTADOS[bruto] ?? "close";

  const { data: linha } = await supabase
    .from("wa_instances")
    .select("phone_e164, connected_at, last_event_at")
    .eq("instance_name", nome)
    .maybeSingle();

  // A tabela é atualizada pelo webhook; aqui a Evolution é a fonte da hora.
  // Divergir por alguns segundos é normal, e o estado que vale é o dela.
  await supabase
    .from("wa_instances")
    .update({ status: estado, updated_at: new Date().toISOString() })
    .eq("instance_name", nome);

  return {
    ok: true,
    instancia: nome,
    estado,
    telefone: linha?.phone_e164 ?? null,
    conectadoEm: linha?.connected_at ?? null,
    ultimoEvento: linha?.last_event_at ?? null,
  };
}

/**
 * O QR para escanear.
 *
 * O QR da Evolution expira em cerca de 40 segundos, e ela gera um novo a cada
 * chamada — por isso a tela repete esta chamada enquanto espera. Não há estado
 * a guardar deste lado.
 */
async function qrcode(ownerId: string) {
  const nome = await instanciaDoDono(ownerId);

  const estadoAtual = await evolution(
    `/instance/connectionState/${encodeURIComponent(nome)}`,
  ).catch(() => null);
  const bruto = String(estadoAtual?.instance?.state ?? "").toLowerCase();
  // Já conectado não gera QR: pedir um faria a Evolution derrubar a sessão
  // que está funcionando para começar outra.
  if (ESTADOS[bruto] === "open") return { ok: true, estado: "open", qr: null, instancia: nome };

  const json = await evolution(`/instance/connect/${encodeURIComponent(nome)}`);
  const base64 = json?.base64 ?? json?.qrcode?.base64 ?? null;
  return {
    ok: true,
    estado: "connecting",
    instancia: nome,
    // Já no formato que a tag <img> aceita, para a tela não ter que adivinhar
    // se veio com ou sem o prefixo.
    qr: base64 ? (String(base64).startsWith("data:") ? base64 : `data:image/png;base64,${base64}`) : null,
    // O código de pareamento, para quem prefere digitar a escanear.
    codigo: json?.pairingCode ?? null,
  };
}

async function desconectar(ownerId: string) {
  const nome = await instanciaDoDono(ownerId);
  await evolution(`/instance/logout/${encodeURIComponent(nome)}`, { method: "DELETE" });
  await supabase
    .from("wa_instances")
    .update({ status: "close", updated_at: new Date().toISOString() })
    .eq("instance_name", nome);
  return { ok: true, estado: "close" };
}

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const ownerId = String(body?.ownerId ?? "");
    const action = String(body?.action ?? "");
    if (!ownerId || !action) {
      return Response.json({ error: "ownerId e action são obrigatórios" }, { status: 400 });
    }

    if (action === "status") return Response.json(await situacao(ownerId));
    if (action === "qrcode") return Response.json(await qrcode(ownerId));
    if (action === "desconectar") return Response.json(await desconectar(ownerId));
    return Response.json({ error: `ação desconhecida: ${action}` }, { status: 400 });
  } catch (e) {
    console.error("[wa-conexao]", e);
    return Response.json(
      { error: e instanceof Error ? e.message : "Falha ao falar com a Evolution." },
      { status: 500 },
    );
  }
});
