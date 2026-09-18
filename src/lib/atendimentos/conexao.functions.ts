import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";
import { erroDaEdgeFunction } from "@/lib/atendimentos/erro-de-edge-function";

/**
 * A conexão de WhatsApp na Evolution própria.
 *
 * Separado de `atendimentos.functions.ts` de propósito: aquele arquivo fala
 * com o CRM, este fala com a nossa Evolution. Enquanto a virada não acontece
 * os dois existem lado a lado, e misturá-los faria uma tela mostrar o estado
 * de uma conexão achando que é o da outra.
 */

export interface ConexaoPropria {
  instancia: string;
  /** `open` conectado, `connecting` esperando o QR, `close` desconectado. */
  estado: "open" | "connecting" | "close";
  telefone: string | null;
  conectadoEm: string | null;
  /** Último evento recebido — o sinal de vida da conexão. */
  ultimoEvento: string | null;
}

export interface QrDaConexao {
  instancia: string;
  estado: string;
  /** Já pronto para a tag `img`, com o prefixo `data:` quando necessário. */
  qr: string | null;
  /** Código de pareamento, para quem prefere digitar a escanear. */
  codigo?: string | null;
}

async function chamar(ownerId: string, action: string): Promise<any> {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes");

  const res = await fetch(`${url}/functions/v1/wa-conexao`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify({ ownerId, action }),
    signal: AbortSignal.timeout(30_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw erroDaEdgeFunction("wa-conexao", res.status, json);
  return json;
}

export const getConexaoPropria = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<ConexaoPropria | null> => {
    // Consulta de estado é informativa: se a Evolution estiver fora do ar,
    // devolvemos nulo e a tela mostra "não foi possível verificar" em vez de
    // apagar a página inteira com um erro.
    try {
      const json = await chamar(context.ownerId, "status");
      return {
        instancia: json.instancia,
        estado: json.estado,
        telefone: json.telefone ?? null,
        conectadoEm: json.conectadoEm ?? null,
        ultimoEvento: json.ultimoEvento ?? null,
      };
    } catch (e) {
      console.warn("[getConexaoPropria] indisponível:", e);
      return null;
    }
  });

export const gerarQrDaConexao = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<QrDaConexao> => {
    const json = await chamar(context.ownerId, "qrcode");
    return {
      instancia: json.instancia,
      estado: json.estado,
      qr: json.qr ?? null,
      codigo: json.codigo ?? null,
    };
  });

export const desconectarConexaoPropria = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }) => {
    await chamar(context.ownerId, "desconectar");
    return { ok: true };
  });
