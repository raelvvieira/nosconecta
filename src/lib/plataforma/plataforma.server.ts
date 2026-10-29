// Só servidor: quem administra a plataforma. Ver `plataforma.functions.ts`.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** A pessoa está em `plataforma_admins`? A tabela é fechada para quem está
 *  logado, então a leitura é com a chave de serviço. */
export async function souDaPlataformaNoServidor(userId: string): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabela nova, fora do types.ts do Lovable
  const { data, error } = await (supabaseAdmin as any)
    .from("plataforma_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Falha ao verificar seu acesso.");
  return !!data;
}
