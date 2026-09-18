// A porta para a Evolution própria: credenciais e chamada HTTP, num lugar só.
//
// Nasceu dentro de `wa-conexao/index.ts`, quando só ela falava com a
// Evolution. Agora o envio de mensagem também fala — e duas cópias da mesma
// leitura de segredo divergem em silêncio: uma ganha um timeout novo, a outra
// não; uma trata o erro da Evolution, a outra devolve "[object Object]".
//
// O `supabase` entra sempre como parâmetro, nunca por closure de módulo: este
// arquivo é importado por mais de uma Edge Function e cada uma tem o seu.

import { type Caminho, caminhoDeEnvio } from "./evolution-rota.ts";

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
 * O nome da instância CONECTADA desta clínica, ou `null`.
 *
 * É esta função que decide por onde uma mensagem sai. E ela pergunta ao
 * ESTADO, não a uma bandeira de configuração: enquanto nenhum número estiver
 * pareado aqui, tudo continua saindo pelo CRM sem ninguém precisar lembrar de
 * desligar nada. E voltar atrás, se a conexão nova der problema, é
 * desconectar o número — não um deploy.
 *
 * `status` é escrito pelo `wa-webhook` no evento `connection.update` e pela
 * `wa-conexao` a cada consulta de estado.
 */
export async function instanciaConectada(
  supabase: any,
  ownerId: string,
): Promise<string | null> {
  if (!evolutionConfigurada()) return null;
  const { data, error } = await supabase
    .from("wa_instances")
    .select("instance_name")
    .eq("owner_id", ownerId)
    .eq("status", "open")
    .order("connected_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    // Não dá para saber se está conectado: segue pelo CRM, que é o caminho
    // que funciona hoje. Falha de leitura não pode virar mensagem não enviada.
    console.warn("[evolution-api] não deu para ler wa_instances:", error.message);
    return null;
  }
  return data?.instance_name ?? null;
}

/**
 * A decisão de por onde a mensagem sai, com as leituras que ela precisa.
 *
 * Mora aqui, e não em `evolution-rota.ts`, porque aquele arquivo é puro de
 * propósito — é ele que a suíte de testes exercita, caso a caso, sem banco.
 * Aqui ficam as consultas; lá fica a regra.
 *
 * Um ponto só de decisão: o chat e o hub de campanhas/automações chamam esta
 * função. Decidir duas vezes na mesma mensagem custaria quatro consultas e
 * criaria a chance de as duas respostas divergirem.
 */
export async function decidirCaminho(
  supabase: any,
  ownerId: string,
): Promise<{ caminho: Caminho; instancia: string | null }> {
  const instancia = await instanciaConectada(supabase, ownerId);
  if (!instancia) return { caminho: "crm", instancia: null };

  const [{ data: cred }, { data: inst }] = await Promise.all([
    supabase
      .from("crm_credentials")
      .select("whatsapp_status, phone_number")
      .eq("owner_id", ownerId)
      .maybeSingle(),
    supabase.from("wa_instances").select("phone_e164").eq("instance_name", instancia).maybeSingle(),
  ]);

  const caminho = caminhoDeEnvio({
    instancia,
    telefoneDaInstancia: inst?.phone_e164 ?? null,
    statusDoCrm: cred?.whatsapp_status ?? null,
    telefoneDoCrm: cred?.phone_number ?? null,
  });
  return { caminho, instancia };
}
