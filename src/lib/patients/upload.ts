import { supabase } from "@/integrations/supabase/client";
import { BUCKET_ARQUIVOS } from "./files.functions";

/**
 * Sobe um arquivo para o bucket privado e devolve o CAMINHO.
 *
 * O prefixo com o id do dono é o que permite a policy do storage separar uma
 * clínica da outra dentro do mesmo balde — por isso ele não é opcional.
 *
 * ── Por que a CLÍNICA, e não quem está logado ──────────────────────────
 *
 * O prefixo era `auth.uid()`, o id de quem enviou. Parece a mesma coisa e não
 * é: esta clínica tem duas contas. Com o id pessoal no caminho, a foto que a
 * recepção sobe cai numa pasta que o dentista não alcança — cada um passaria a
 * ver metade da ficha do mesmo paciente, sem erro nenhum na tela.
 *
 * `current_owner_id()` devolve o dono da clínica de quem está logado — é a
 * mesma função por trás de `can_access_row`, que já rege todas as outras
 * tabelas. Assim a pasta é uma por clínica, e a policy do Storage pode usar
 * exatamente a mesma regra do resto do sistema.
 */
export async function enviarParaBucket(file: File, pasta?: string): Promise<string> {
  const { data: ownerId, error: erroDono } = await supabase.rpc("current_owner_id");
  if (erroDono || !ownerId) throw new Error("Sessão expirada — recarregue a página.");

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
