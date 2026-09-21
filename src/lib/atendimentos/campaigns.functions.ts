/* eslint-disable @typescript-eslint/no-explicit-any */
// `any` no client do Supabase, como em `funis.functions.ts` e
// `pipeline.functions.ts`: `src/integrations/supabase/types.ts` é gerado pelo
// Lovable e não pode ser editado à mão, então tabela criada por migration
// nossa ainda não existe para o TypeScript até ele regerar o arquivo.
import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";
import { inicioDoDiaDaClinica } from "./cota";

/**
 * O que sobrou do módulo de campanhas.
 *
 * Este arquivo já teve o CRUD inteiro do motor de campanhas do CRM — criar,
 * listar, executar, estimar destinatários, mover contatos de etapa depois do
 * envio. Aquele motor **nunca enviou nada**: o time do CRM confirmou em 18/08
 * olhando o próprio banco (5 campanhas criadas, 0 executadas), porque o
 * servidor que ele exige não está implantado. Código que não tem como rodar é
 * o que faz a próxima auditoria custar caro, então saiu — o git guarda, se um
 * dia o cenário mudar.
 *
 * Ficaram as duas coisas que servem ao caminho que entrega de verdade (o
 * disparo por seleção de contatos): os modelos de mensagem, usados no chat e
 * na revisão de disparo, e a cota diária, que é o mesmo contador debitado
 * pelos disparos e pelas automações.
 *
 * As duas saíram do CRM. Os modelos viviam em `/api/v1/message_templates` e
 * nunca tiveram uma linha sequer lá; a cota já era nossa por inteiro, só
 * morava atrás de uma Edge Function com nome de CRM.
 */

export interface MessageTemplate {
  id: string;
  name: string;
  content: string;
}

export interface DailyUsage {
  limit: number;
  usedToday: number;
}

function mapTemplate(row: { id: string; name: string | null; content: string | null }) {
  return {
    id: String(row.id),
    name: row.name ?? "Sem nome",
    content: row.content ?? "",
  };
}

export const getMessageTemplates = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<MessageTemplate[]> => {
    const supabase: any = context.supabase;
    const { data, error } = await supabase
      .from("message_templates")
      .select("id, name, content")
      .eq("owner_id", context.ownerId)
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapTemplate);
  });

export const saveMessageTemplate = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { id?: string; name: string; content: string; mediaUrl?: string }) => {
    if (!input.name?.trim()) throw new Error("Dê um nome ao modelo.");
    // Mesma regra que já vale pro disparo por seleção (criarDisparo) — texto
    // ou imagem, nunca os dois vazios. A tela já trava isto antes de chegar
    // aqui; isto é rede de segurança para quem bater direto no endpoint.
    if (!input.content?.trim() && !input.mediaUrl) {
      throw new Error("A mensagem precisa ter texto ou imagem.");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const linha = {
      name: data.name.trim(),
      content: data.content?.trim() ?? "",
      media_url: data.mediaUrl ?? null,
      updated_at: new Date().toISOString(),
    };

    if (data.id) {
      const { data: salvo, error } = await supabase
        .from("message_templates")
        .update(linha)
        .eq("id", data.id)
        .eq("owner_id", context.ownerId)
        .select("id, name, content")
        .maybeSingle();
      if (error) throw new Error(traduzirNomeRepetido(error));
      return { ok: true, template: salvo ? mapTemplate(salvo) : null };
    }

    const { data: salvo, error } = await supabase
      .from("message_templates")
      .insert({ owner_id: context.ownerId, ...linha })
      .select("id, name, content")
      .maybeSingle();
    if (error) throw new Error(traduzirNomeRepetido(error));
    return { ok: true, template: salvo ? mapTemplate(salvo) : null };
  });

/**
 * O erro de nome repetido, em português.
 *
 * O banco recusa dois modelos com o mesmo nome — dois "Retorno de 6 meses" na
 * lista do chat são indistinguíveis para quem escolhe, e escolher o errado
 * manda a mensagem errada ao paciente. Mas a mensagem crua do Postgres fala em
 * "duplicate key value violates unique constraint", que não ajuda ninguém.
 */
function traduzirNomeRepetido(error: { code?: string; message?: string }): string {
  if (error?.code === "23505") return "Já existe um modelo com esse nome.";
  return error?.message ?? "Não foi possível salvar o modelo.";
}

export const deleteMessageTemplate = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const { error } = await supabase
      .from("message_templates")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.ownerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Cota diária de disparo.
 *
 * O mesmo contador é debitado pelo disparo por seleção e pelas automações —
 * é por isso que a tela de Campanhas e o card de prontidão do editor de
 * automações mostram sempre o mesmo número.
 *
 * O dia é o da CLÍNICA, não o do servidor. Edge Function roda em UTC, e a
 * meia-noite de lá são 21h de Brasília: o contador zerava três horas antes da
 * virada, e mensagem enviada às 22h já contava para o dia seguinte. A conta do
 * fuso mora em `cota.ts`, junto da mesma regra do lado Deno.
 */
export const getDailySendUsage = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<DailyUsage> => {
    const supabase: any = context.supabase;

    const [ajuste, envios] = await Promise.all([
      supabase
        .from("whatsapp_send_settings")
        .select("daily_send_limit")
        .eq("owner_id", context.ownerId)
        .maybeSingle(),
      supabase
        .from("crm_campaign_sends")
        .select("recipient_count")
        .eq("owner_id", context.ownerId)
        .gte("executed_at", inicioDoDiaDaClinica().toISOString()),
    ]);
    if (ajuste.error) throw new Error(ajuste.error.message);
    if (envios.error) throw new Error(envios.error.message);

    const usedToday = (envios.data ?? []).reduce(
      (soma: number, linha: any) => soma + (linha.recipient_count ?? 0),
      0,
    );
    return { limit: ajuste.data?.daily_send_limit ?? 200, usedToday };
  });

export const setDailySendLimit = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { limit: number }) => {
    // Limite zero ou negativo travaria todo envio, inclusive o lembrete de
    // consulta — e o sintoma seria mensagem que não sai, sem erro na tela.
    if (!Number.isFinite(input.limit) || input.limit < 1) {
      throw new Error("O limite diário precisa ser de ao menos 1 mensagem.");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const { error } = await supabase.from("whatsapp_send_settings").upsert(
      {
        owner_id: context.ownerId,
        daily_send_limit: Math.floor(data.limit),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
