/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";

/**
 * Tags de contato.
 *
 * Duas coisas separadas moram aqui: o VOCABULÁRIO (quais tags existem, geridas
 * em Configurações) e as ATRIBUIÇÕES (quem tem qual tag).
 *
 * ── A única parte difícil ───────────────────────────────────────────────────
 *
 * A mesma pessoa pode ser vista de dois jeitos: como PACIENTE (linha em
 * `patients`) ou como CONTATO DO WHATSAPP (id que mora no CRM externo, sem
 * linha aqui). Marcar a Bianca na conversa e a ficha dela não mostrar a tag é a
 * divergência que faria a funcionalidade parecer quebrada.
 *
 * `patients.crm_contact_id` é o elo, e ele é usado nos dois sentidos:
 *
 *   ESCRITA  — contato do CRM que já tem paciente vinculado grava em
 *              `patient_id`. Os dados nascem arrumados, e a leitura do lado do
 *              paciente nem precisa procurar.
 *   LEITURA  — as tags de um paciente incluem também as gravadas sob o
 *              `crm_contact_id` dele. Cobre o que foi marcado antes de o
 *              vínculo existir.
 *
 * O que NÃO acontece: marcar um contato do WhatsApp nunca cria paciente. Um
 * fornecedor etiquetado no chat não pode virar linha em `patients`, que é a
 * base do funil de Clientes e dos indicadores da clínica.
 */

export interface Tag {
  id: string;
  name: string;
  color: string;
  /** Quantos contatos usam — só vem preenchido em `listarTags`. */
  usos?: number;
}

/** Como a tela se refere a uma pessoa. Um dos dois vem preenchido; quando os
 *  dois vêm (o chat sabe os dois), a escrita prefere o paciente. */
export interface AlvoDaTag {
  patientId?: string | null;
  crmContactId?: string | null;
}

function mapTag(row: any): Tag {
  return { id: String(row.id), name: row.name, color: row.color ?? "cinza" };
}

/** As duas chaves de uma pessoa, já resolvidas. */
export interface ChavesDaPessoa {
  patientId: string | null;
  crmContactId: string | null;
}

/**
 * Onde gravar a tag.
 *
 * Prefere o paciente sempre que ele existe — a tag fica presa à pessoa e morre
 * junto com o cadastro (é o `ON DELETE CASCADE`). Só cai no id do CRM quando não
 * há paciente nenhum, e nesse caso NÃO criamos um: etiquetar um fornecedor no
 * WhatsApp não pode inventar linha em `patients`, que é a base do funil de
 * Clientes e dos indicadores.
 *
 * Exportada por causa do teste — errar aqui espalha a mesma pessoa por duas
 * linhas e faz a tag sumir quando se troca de tela.
 * @internal
 */
export function destinoDaTag({ patientId, crmContactId }: ChavesDaPessoa) {
  return patientId
    ? { patient_id: patientId, crm_contact_id: null }
    : { patient_id: null, crm_contact_id: crmContactId };
}

/**
 * O filtro de leitura: as DUAS chaves, sempre.
 *
 * Ler só pela chave que a tela tem em mãos é o que faria a tag marcada na
 * conversa não aparecer na ficha — a divergência que deixaria a funcionalidade
 * com cara de quebrada.
 * @internal
 */
export function filtroDasDuasChaves({ patientId, crmContactId }: ChavesDaPessoa): string | null {
  const condicoes: string[] = [];
  if (patientId) condicoes.push(`patient_id.eq.${patientId}`);
  if (crmContactId) condicoes.push(`crm_contact_id.eq.${crmContactId}`);
  return condicoes.length ? condicoes.join(",") : null;
}

/**
 * As duas chaves que identificam a mesma pessoa.
 *
 * Devolve o `patient_id` e o `crm_contact_id` que apontam para ela, consultando
 * `patients` para completar o que faltar. É o que faz tag marcada na conversa
 * aparecer na ficha e vice-versa.
 */
async function chavesDaPessoa(
  supabase: any,
  ownerId: string,
  alvo: AlvoDaTag,
): Promise<{ patientId: string | null; crmContactId: string | null }> {
  let patientId = alvo.patientId ?? null;
  let crmContactId = alvo.crmContactId ?? null;

  if (patientId && !crmContactId) {
    const { data } = await supabase
      .from("patients")
      .select("crm_contact_id")
      .eq("id", patientId)
      .eq("owner_id", ownerId)
      .maybeSingle();
    crmContactId = data?.crm_contact_id ?? null;
  } else if (crmContactId && !patientId) {
    const { data } = await supabase
      .from("patients")
      .select("id")
      .eq("crm_contact_id", crmContactId)
      .eq("owner_id", ownerId)
      .maybeSingle();
    patientId = data?.id ?? null;
  }

  return { patientId, crmContactId };
}

// ── Vocabulário ────────────────────────────────────────────────────────────

export const listarTags = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<Tag[]> => {
    const supabase: any = context.supabase;
    const { data, error } = await supabase
      .from("clinic_tags")
      .select("id, name, color")
      .eq("owner_id", context.ownerId)
      .order("name");
    if (error) throw new Error(error.message);

    // A contagem sai de uma consulta só, agrupada no cliente — uma consulta por
    // tag seria N idas ao banco para desenhar uma lista de dez linhas.
    const { data: usos } = await supabase
      .from("contact_tags")
      .select("tag_id")
      .eq("owner_id", context.ownerId);
    const porTag = new Map<string, number>();
    for (const u of (usos ?? []) as any[]) {
      porTag.set(String(u.tag_id), (porTag.get(String(u.tag_id)) ?? 0) + 1);
    }

    return (data ?? []).map((row: any) => ({ ...mapTag(row), usos: porTag.get(String(row.id)) ?? 0 }));
  });

export const salvarTag = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { id?: string | null; name: string; color: string }) => {
    if (!input.name?.trim()) throw new Error("Dê um nome para a tag.");
    if (input.name.trim().length > 32) throw new Error("O nome da tag passa de 32 caracteres.");
    return input;
  })
  .handler(async ({ data, context }): Promise<Tag> => {
    const supabase: any = context.supabase;
    const linha = { name: data.name.trim(), color: data.color };

    const query = data.id
      ? supabase.from("clinic_tags").update(linha).eq("id", data.id).eq("owner_id", context.ownerId)
      : supabase.from("clinic_tags").insert({ ...linha, owner_id: context.ownerId });

    const { data: salva, error } = await query.select("id, name, color").single();
    if (error) {
      // O índice único por `lower(name)` é o que impede "Clareamento" e
      // "clareamento" coexistirem. Traduzido, senão a pessoa vê um erro de
      // Postgres no lugar de saber que já existe uma tag com esse nome.
      if (String(error.code) === "23505") {
        throw new Error(`Já existe uma tag chamada "${data.name.trim()}".`);
      }
      throw new Error(error.message);
    }
    return mapTag(salva);
  });

export const excluirTag = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    // As atribuições somem pelo CASCADE da FK; contamos antes só para a tela
    // poder dizer o tamanho do estrago depois de feito.
    const { count } = await supabase
      .from("contact_tags")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", context.ownerId)
      .eq("tag_id", data.id);

    const { error } = await supabase
      .from("clinic_tags")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.ownerId);
    if (error) throw new Error(error.message);
    return { ok: true, contatosAfetados: count ?? 0 };
  });

// ── Atribuições ────────────────────────────────────────────────────────────

export const tagsDoContato = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .inputValidator((input: AlvoDaTag) => input)
  .handler(async ({ data, context }): Promise<Tag[]> => {
    const supabase: any = context.supabase;
    const { patientId, crmContactId } = await chavesDaPessoa(supabase, context.ownerId, data);
    if (!patientId && !crmContactId) return [];

    // As duas chaves numa consulta só. Marcada como paciente OU como contato do
    // CRM, a tag aparece — é isto que faz a ficha e a conversa mostrarem a mesma
    // coisa.
    const filtro = filtroDasDuasChaves({ patientId, crmContactId });
    if (!filtro) return [];

    const { data: linhas, error } = await supabase
      .from("contact_tags")
      .select("tag_id, clinic_tags(id, name, color)")
      .eq("owner_id", context.ownerId)
      .or(filtro);
    if (error) throw new Error(error.message);

    // A mesma tag pode vir pelas duas chaves (marcada nos dois lugares antes de
    // o vínculo existir): uma por id.
    const unicas = new Map<string, Tag>();
    for (const l of (linhas ?? []) as any[]) {
      if (l.clinic_tags) unicas.set(String(l.clinic_tags.id), mapTag(l.clinic_tags));
    }
    return [...unicas.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  });

export const marcarTag = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: AlvoDaTag & { tagId: string }) => {
    if (!input.patientId && !input.crmContactId) {
      throw new Error("Sem paciente nem contato para marcar.");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const { patientId, crmContactId } = await chavesDaPessoa(supabase, context.ownerId, data);

    const destino = destinoDaTag({ patientId, crmContactId });

    const { error } = await supabase
      .from("contact_tags")
      .insert({ owner_id: context.ownerId, tag_id: data.tagId, ...destino });
    // Marcar de novo o que já está marcado não é erro — é o mesmo estado final.
    if (error && String(error.code) !== "23505") throw new Error(error.message);
    return { ok: true };
  });

export const desmarcarTag = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: AlvoDaTag & { tagId: string }) => input)
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const { patientId, crmContactId } = await chavesDaPessoa(supabase, context.ownerId, data);

    // Apaga pelas DUAS chaves: a tag pode ter sido gravada sob o id do CRM antes
    // de o paciente existir, e desmarcar só pelo `patient_id` deixaria a linha
    // antiga viva — a tag voltaria a aparecer no próximo carregamento.
    const filtro = filtroDasDuasChaves({ patientId, crmContactId });
    if (!filtro) return { ok: true };

    const { error } = await supabase
      .from("contact_tags")
      .delete()
      .eq("owner_id", context.ownerId)
      .eq("tag_id", data.tagId)
      .or(filtro);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Todas as atribuições da clínica, para filtrar listas grandes.
 *
 * Devolve as duas chaves cruas em vez de resolver pessoa a pessoa: a tela de
 * seleção de contatos tem mais de mil linhas, e resolver o vínculo de cada uma
 * seria uma consulta por linha. Quem monta o mapa é o cliente, que já tem os
 * contatos em mãos.
 */
export const todasAsAtribuicoes = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(
    async ({
      context,
    }): Promise<{ tagId: string; patientId: string | null; crmContactId: string | null }[]> => {
      const supabase: any = context.supabase;
      const { data, error } = await supabase
        .from("contact_tags")
        .select("tag_id, patient_id, crm_contact_id")
        .eq("owner_id", context.ownerId);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r: any) => ({
        tagId: String(r.tag_id),
        patientId: r.patient_id ?? null,
        crmContactId: r.crm_contact_id ?? null,
      }));
    },
  );
