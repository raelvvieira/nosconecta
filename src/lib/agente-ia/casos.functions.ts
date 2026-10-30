import { createServerFn } from "@tanstack/react-start";
import { exigeAgenteIa } from "@/lib/auth/area.middleware";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";

/**
 * A biblioteca de casos de antes e depois.
 *
 * O arquivo mora no bucket `crm-campaign-media` — o mesmo da imagem do
 * disparo, reusado porque criar bucket é passo manual no Lovable e o caminho
 * de download já está provado em produção. O caminho começa com o id do dono,
 * que é o prefixo que a policy do bucket usa para separar uma clínica da
 * outra: `CampoDeImagem` já o monta assim.
 *
 * A coluna guarda o CAMINHO, nunca uma URL assinada: assinada vence, e uma
 * biblioteca cheia de link morto só se descobre quando a Luna tenta mandar.
 */

export interface CasoDaBiblioteca {
  id: string;
  titulo: string;
  mediaPath: string;
  /**
   * "quando o assunto for limpeza ou clareamento".
   *
   * É o ÚNICO sinal que a Luna tem para decidir se o caso serve, desde que o
   * procedimento saiu do cadastro: amarrar a foto a um item do catálogo a
   * deixava presa àquele item — um caso de clareamento com limpeza junto não
   * servia para quem só falou de clareamento, e a clínica tinha de cadastrar a
   * mesma foto de novo. Uma frase de assunto cobre as duas conversas.
   */
  quandoUsar: string | null;
  ativo: boolean;
}

const MAX_TITULO = 80;
const MAX_QUANDO = 200;

function validar(input: {
  titulo: string;
  mediaPath: string;
  quandoUsar?: string | null;
  ativo?: boolean;
}) {
  const titulo = input.titulo?.trim();
  if (!titulo) throw new Error("Dê um título ao caso — é por ele que a assistente o reconhece.");
  if (titulo.length > MAX_TITULO) throw new Error(`Título muito longo (máx. ${MAX_TITULO}).`);
  const mediaPath = input.mediaPath?.trim();
  if (!mediaPath) throw new Error("Envie a imagem do caso.");
  const quandoUsar = input.quandoUsar?.trim() || null;
  if (quandoUsar && quandoUsar.length > MAX_QUANDO) {
    throw new Error(`"Quando usar" muito longo (máx. ${MAX_QUANDO}).`);
  }
  return { titulo, mediaPath, quandoUsar, ativo: input.ativo !== false };
}

export const listarCasos = createServerFn({ method: "GET" })
  .middleware([exigeAgenteIa])
  .handler(async ({ context }): Promise<CasoDaBiblioteca[]> => {
    // types.ts só conhece a tabela depois que o Lovable regenerar a partir da
    // migration — mesmo escape que o resto do projeto já usa até lá.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = context.supabase;
    const { data, error } = await supabase
      .from("ai_agent_casos")
      .select("id, titulo, media_path, quando_usar, ativo")
      .eq("owner_id", context.ownerId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((data ?? []) as any[]).map((r) => ({
      id: String(r.id),
      titulo: String(r.titulo),
      mediaPath: String(r.media_path),
      quandoUsar: r.quando_usar ?? null,
      ativo: r.ativo !== false,
    }));
  });

export const salvarCaso = createServerFn({ method: "POST" })
  .middleware([exigeAgenteIa])
  .inputValidator(
    (input: {
      id?: string | null;
      titulo: string;
      mediaPath: string;
      quandoUsar?: string | null;
      ativo?: boolean;
    }) => ({ id: input.id?.trim() || null, ...validar(input) }),
  )
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = context.supabase;
    const campos = {
      titulo: data.titulo,
      media_path: data.mediaPath,
      quando_usar: data.quandoUsar,
      ativo: data.ativo,
      updated_at: new Date().toISOString(),
    };

    const { error } = data.id
      ? await supabase
          .from("ai_agent_casos")
          .update(campos)
          .eq("id", data.id)
          .eq("owner_id", context.ownerId)
      : await supabase.from("ai_agent_casos").insert({ ...campos, owner_id: context.ownerId });

    if (error) {
      // O índice único de arquivo existe para a mesma imagem não virar dois
      // códigos. Quem cadastrou duas vezes não fez nada de errado e não pode
      // ver "duplicate key value violates unique constraint".
      const { ehChaveDuplicada } = await import("@/lib/finance/erro-do-banco");
      if (ehChaveDuplicada(error)) {
        throw new Error("Essa imagem já está na biblioteca.");
      }
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const excluirCaso = createServerFn({ method: "POST" })
  .middleware([exigeAgenteIa])
  .inputValidator((input: { id: string }) => {
    if (!input.id?.trim()) throw new Error("Caso inválido");
    return { id: input.id.trim() };
  })
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = context.supabase;
    // A linha sai; o arquivo fica no bucket. Apagar o arquivo junto parece
    // limpeza e é risco: se duas linhas apontarem para a mesma imagem por um
    // engano de cadastro, a segunda vira um caso sem foto, e a Luna tentaria
    // mandar um arquivo que não existe mais no meio de uma conversa.
    const { error } = await supabase
      .from("ai_agent_casos")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.ownerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export interface CasoParaEnviar {
  id: string;
  titulo: string;
  quandoUsar: string | null;
  /** URL assinada, curta: serve para a miniatura e para baixar a foto na
   *  hora de anexar. */
  url: string | null;
}

/**
 * Os casos ativos, para a equipe anexar na conversa à mão (menu "+").
 *
 * Fora de `exigeAgenteIa` de propósito: quem atende no chat nem sempre tem
 * acesso à área do agente, e mandar um antes e depois é coisa de quem
 * atende. Só lê; cadastrar e apagar continuam lá.
 */
export const listarCasosParaEnviar = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<CasoParaEnviar[]> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = context.supabase;
    const { data, error } = await supabase
      .from("ai_agent_casos")
      .select("id, titulo, media_path, quando_usar")
      .eq("owner_id", context.ownerId)
      .eq("ativo", true)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const linhas = (data ?? []) as any[];
    if (!linhas.length) return [];
    const { data: assinadas } = await supabase.storage.from("crm-campaign-media").createSignedUrls(
      linhas.map((r) => String(r.media_path)),
      60 * 30,
    );
    const porCaminho = new Map<string, string>(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((assinadas ?? []) as any[])
        .filter((a) => a?.signedUrl && a?.path)
        .map((a) => [String(a.path), String(a.signedUrl)]),
    );
    return linhas.map((r) => ({
      id: String(r.id),
      titulo: String(r.titulo),
      quandoUsar: r.quando_usar ?? null,
      url: porCaminho.get(String(r.media_path)) ?? null,
    }));
  });
