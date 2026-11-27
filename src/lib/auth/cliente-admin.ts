/* eslint-disable @typescript-eslint/no-explicit-any -- cliente sem tipos gerados, como nas outras funções. */
/**
 * Cliente do servidor para as tabelas que o navegador não lê mais direto
 * (financeiro, sinais, recibos). Quem chama já passou pelo middleware de
 * membro e TEM de filtrar por `owner_id` em toda consulta: este cliente
 * ignora as travas do banco.
 */
export async function clienteAdmin(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}
