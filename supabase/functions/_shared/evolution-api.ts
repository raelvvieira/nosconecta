// A porta para a Evolution própria: credenciais e chamada HTTP, num lugar só.
//
// Nasceu dentro de `wa-conexao/index.ts`, quando só ela falava com a
// Evolution. Agora o envio de mensagem também fala — e duas cópias da mesma
// leitura de segredo divergem em silêncio: uma ganha um timeout novo, a outra
// não; uma trata o erro da Evolution, a outra devolve "[object Object]".
//
// O `supabase` entra sempre como parâmetro, nunca por closure de módulo: este
// arquivo é importado por mais de uma Edge Function e cada uma tem o seu.

import { type EscolhaDaConexao, conexaoQueAtende } from "./evolution-rota.ts";

const BASE = (Deno.env.get("EVOLUTION_API_URL") ?? "").replace(/\/+$/, "");
const CHAVE = Deno.env.get("EVOLUTION_API_KEY") ?? "";

export const FALTA_CONFIGURAR =
  "A conexão própria de WhatsApp ainda não foi configurada. " +
  "Faltam EVOLUTION_API_URL e EVOLUTION_API_KEY nos segredos.";

/** `true` quando os segredos existem — nenhuma chamada é feita. */
export function evolutionConfigurada(): boolean {
  return Boolean(BASE && CHAVE);
}

export async function evolutionFetch(
  caminho: string,
  init: RequestInit = {},
  timeoutMs = 25_000,
): Promise<any> {
  if (!evolutionConfigurada()) throw new Error(FALTA_CONFIGURAR);
  const res = await fetch(`${BASE}${caminho}`, {
    ...init,
    headers: { apikey: CHAVE, "content-type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    // A mensagem da Evolution vem em formatos diferentes conforme o erro.
    const detalhe = json?.response?.message ?? json?.message ?? json?.error ?? `HTTP ${res.status}`;
    const erro = new Error(typeof detalhe === "string" ? detalhe : JSON.stringify(detalhe));
    (erro as any).status = res.status;
    throw erro;
  }
  return json;
}

/**
 * A conexão que atende esta clínica.
 *
 * Pergunta ao ESTADO, não a uma bandeira de configuração: `status` é escrito
 * pelo `wa-webhook` no evento `connection.update` e pela `wa-conexao` a cada
 * consulta. Voltar atrás, se a conexão der problema, é desconectar o número —
 * não um deploy.
 *
 * Traz TODAS as abertas, e não a mais recente: a regra de qual delas atende
 * mora em `evolution-rota.ts`, que é pura e tem teste. Pegar a mais recente
 * aqui seria justamente o engano que aquele arquivo existe para impedir — o
 * chip de teste é, por definição, o que acabou de ser pareado.
 */
export async function conexaoParaEnviar(
  supabase: any,
  ownerId: string,
): Promise<EscolhaDaConexao> {
  if (!evolutionConfigurada()) {
    return { instancia: null, motivo: "nenhuma conexão aberta" };
  }

  const { data, error } = await supabase
    .from("wa_instances")
    .select("instance_name, phone_e164")
    .eq("owner_id", ownerId)
    .eq("status", "open");
  if (error) {
    // Não dá para saber o que está conectado. Tratar como "nenhuma" e não
    // mandar: o erro aparece na fila, com motivo. Chutar aqui mandaria pela
    // instância errada.
    console.warn("[evolution-api] não deu para ler wa_instances:", error.message);
    return { instancia: null, motivo: "nenhuma conexão aberta" };
  }

  return conexaoQueAtende(
    (data ?? []).map((linha: any) => ({
      instancia: String(linha.instance_name ?? ""),
      telefone: linha.phone_e164 ?? null,
    })),
  );
}

/** O nome da instância conectada, ou `null`. Para quem só precisa saber se há
 *  uma — o estado da tela, por exemplo — e não vai enviar nada. */
export async function instanciaConectada(
  supabase: any,
  ownerId: string,
): Promise<string | null> {
  return (await conexaoParaEnviar(supabase, ownerId)).instancia;
}
