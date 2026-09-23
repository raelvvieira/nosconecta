import { supabase } from "@/integrations/supabase/client";
import { BUCKET_ARQUIVOS } from "./files.functions";

/**
 * Sobe um arquivo para o bucket privado e devolve o CAMINHO.
 *
 * O prefixo com o id do dono é o que permite a policy do storage separar uma
 * clínica da outra dentro do mesmo balde — por isso ele não é opcional.
 */
export async function enviarParaBucket(file: File, pasta?: string): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  const ownerId = userData.user?.id;
  if (!ownerId) throw new Error("Sessão expirada — recarregue a página.");

  const nomeSeguro = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const caminho = [ownerId, pasta, `${crypto.randomUUID()}-${nomeSeguro}`]
    .filter(Boolean)
    .join("/");

  const { error } = await supabase.storage
    .from(BUCKET_ARQUIVOS)
    .upload(caminho, file, { cacheControl: "3600", upsert: false });
  if (error) throw error;
  return caminho;
}
