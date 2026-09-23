/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";
import { BUCKET_ARQUIVOS, VALIDADE_URL_SEGUNDOS } from "./files.functions";

// A foto do rosto do paciente.
//
// Guardamos o CAMINHO no bucket privado, e assinamos na leitura. Uma URL
// assinada salva no banco venceria em silêncio e a ficha apareceria sem rosto
// sem ninguém entender por quê.

export interface FotoDoPaciente {
  /** URL assinada para mostrar agora. Null = não há foto (ou o link falhou). */
  url: string | null;
  /** Caminho guardado — a tela usa só para saber se existe foto. */
  path: string | null;
  /** A coluna `photo_path` ainda não existe no banco. */
  indisponivel: boolean;
}

const COLUNA_AUSENTE = (error: any) =>
  !!error &&
  (error.code === "42703" ||
    error.code === "42P01" ||
    /does not exist|column/i.test(String(error.message ?? "")));

export const getFotoDoPaciente = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { patientId: string }) => input)
  .handler(async ({ data, context }): Promise<FotoDoPaciente> => {
    const supabase: any = context.supabase;
    const { data: row, error } = await supabase
      .from("patients")
      .select("photo_path")
      .eq("id", data.patientId)
      .maybeSingle();

    if (COLUNA_AUSENTE(error)) return { url: null, path: null, indisponivel: true };
    if (error) throw new Error(error.message);

    const path: string | null = row?.photo_path ?? null;
    if (!path) return { url: null, path: null, indisponivel: false };

    const { data: assinada } = await supabase.storage
      .from(BUCKET_ARQUIVOS)
      .createSignedUrl(path, VALIDADE_URL_SEGUNDOS);

    return { url: assinada?.signedUrl ?? null, path, indisponivel: false };
  });

export const salvarFotoDoPaciente = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { patientId: string; storagePath: string | null }) => {
    if (!input.patientId) throw new Error("Paciente não informado.");
    return input;
  })
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const supabase: any = context.supabase;

    // Lê a anterior antes de trocar: sem isso a foto antiga fica órfã no bucket
    // e continua acessível a quem tiver guardado um link ainda válido.
    const { data: row } = await supabase
      .from("patients")
      .select("photo_path")
      .eq("id", data.patientId)
      .maybeSingle();

    const { error } = await supabase
      .from("patients")
      .update({ photo_path: data.storagePath })
      .eq("id", data.patientId);
    if (error) throw new Error(error.message);

    const anterior: string | null = row?.photo_path ?? null;
    if (anterior && anterior !== data.storagePath) {
      await supabase.storage.from(BUCKET_ARQUIVOS).remove([anterior]);
    }
    return { ok: true };
  });
