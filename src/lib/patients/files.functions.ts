/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";

// Arquivos do paciente — imagens e documentos.
//
// O upload em si acontece no cliente, direto no Storage. O que passa por aqui é o
// REGISTRO: qual paciente, que tipo, onde ficou guardado. Separar assim evita
// mandar o binário para o servidor de aplicação só para ele reenviar ao
// Storage.

export const BUCKET_ARQUIVOS = "patient-files";

/** Validade da URL de leitura.
 *
 *  Curta de propósito: raio-x e termo assinado são dado de saúde, e uma URL
 *  assinada é um link que funciona sem login para quem o tiver. Uma hora cobre
 *  uma consulta inteira e limita o estrago de um link vazado. */
export const VALIDADE_URL_SEGUNDOS = 60 * 60;

const TABELA_AUSENTE = "42P01";

export class ArquivosIndisponiveis extends Error {
  constructor() {
    super("A tabela de arquivos ainda não foi criada no banco.");
    this.name = "ArquivosIndisponiveis";
  }
}

function lancarSeErroReal(error: any): void {
  if (!error) return;
  if (error.code === TABELA_AUSENTE || /does not exist/i.test(String(error.message ?? ""))) {
    throw new ArquivosIndisponiveis();
  }
  throw new Error(error.message);
}

export type TipoDeArquivo = "image" | "document";

export interface ArquivoDoPaciente {
  id: string;
  kind: TipoDeArquivo;
  title: string;
  mime: string | null;
  sizeBytes: number | null;
  professionalName: string | null;
  createdAt: string;
  /** Gerada na leitura, nunca guardada. Null quando o bucket ainda não existe
   *  ou a assinatura falhou — a tela mostra o item sem miniatura em vez de
   *  sumir com ele, porque o registro existe mesmo que o link não abra. */
  url: string | null;
}

export interface ArquivosDoPaciente {
  arquivos: ArquivoDoPaciente[];
  indisponivel: boolean;
}

export const getArquivos = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { patientId: string }) => input)
  .handler(async ({ data, context }): Promise<ArquivosDoPaciente> => {
    const supabase: any = context.supabase;
    const { data: rows, error } = await supabase
      .from("patient_files")
      .select("id, kind, title, storage_path, mime, size_bytes, professional_name, created_at")
      .eq("patient_id", data.patientId)
      .order("created_at", { ascending: false });

    try {
      lancarSeErroReal(error);
    } catch (e) {
      if (e instanceof ArquivosIndisponiveis) return { arquivos: [], indisponivel: true };
      throw e;
    }

    const lista = rows ?? [];
    if (!lista.length) return { arquivos: [], indisponivel: false };

    // Uma chamada para todos os caminhos em vez de uma por arquivo: uma ficha
    // com trinta radiografias faria trinta idas ao Storage só para desenhar a
    // grade.
    const caminhos = lista.map((r: any) => r.storage_path);
    const { data: assinadas } = await supabase.storage
      .from(BUCKET_ARQUIVOS)
      .createSignedUrls(caminhos, VALIDADE_URL_SEGUNDOS);

    const porCaminho = new Map<string, string>();
    for (const a of assinadas ?? []) {
      if (a?.path && a?.signedUrl) porCaminho.set(a.path, a.signedUrl);
    }

    return {
      indisponivel: false,
      arquivos: lista.map((r: any) => ({
        id: String(r.id),
        kind: r.kind as TipoDeArquivo,
        title: r.title,
        mime: r.mime ?? null,
        sizeBytes: r.size_bytes ?? null,
        professionalName: r.professional_name ?? null,
        createdAt: r.created_at,
        url: porCaminho.get(r.storage_path) ?? null,
      })),
    };
  });

export const registrarArquivo = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator(
    (input: {
      patientId: string;
      kind: TipoDeArquivo;
      title: string;
      storagePath: string;
      mime?: string | null;
      sizeBytes?: number | null;
    }) => {
      if (!input.patientId) throw new Error("Paciente não informado.");
      if (!input.storagePath) throw new Error("Arquivo não informado.");
      if (!input.title?.trim()) throw new Error("Dê um nome ao arquivo.");
      return input;
    },
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const supabase: any = context.supabase;
    const { data: prof } = await supabase
      .from("professionals")
      .select("name")
      .eq("owner_id", context.ownerId)
      .limit(1)
      .maybeSingle();

    const { data: row, error } = await supabase
      .from("patient_files")
      .insert({
        patient_id: data.patientId,
        kind: data.kind,
        title: data.title.trim(),
        storage_path: data.storagePath,
        mime: data.mime ?? null,
        size_bytes: data.sizeBytes ?? null,
        professional_name: prof?.name ?? null,
      })
      .select("id")
      .single();
    lancarSeErroReal(error);
    return { id: String(row.id) };
  });

export const excluirArquivo = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const supabase: any = context.supabase;
    // Lê o caminho ANTES de apagar a linha: sem ele o binário ficaria órfão no
    // bucket, ocupando espaço e — pior — continuando acessível a quem tivesse
    // guardado uma URL assinada ainda válida.
    const { data: row } = await supabase
      .from("patient_files")
      .select("storage_path")
      .eq("id", data.id)
      .maybeSingle();

    const { error } = await supabase.from("patient_files").delete().eq("id", data.id);
    lancarSeErroReal(error);

    if (row?.storage_path) {
      // Falha aqui não desfaz a exclusão do registro: o arquivo sumiu da ficha,
      // que é o que a pessoa pediu. Sobra lixo no bucket, e isso é melhor do
      // que um registro que reaparece porque o Storage estava fora do ar.
      await supabase.storage.from(BUCKET_ARQUIVOS).remove([row.storage_path]);
    }
    return { ok: true };
  });
