/**
 * Ajudantes de runtime do disparo.
 *
 * Moram fora de `broadcast.functions.ts` porque o divisor de server functions
 * apaga os irmãos de módulo ao gerar o arquivo `?tss-serverfn-split` — era isso
 * que fazia `resolverEmLote` estourar `ReferenceError` em produção e no dev.
 * Arquivo de servidor por nome (`*.server.ts`), então nunca entra no bundle do
 * navegador.
 */
import type { BroadcastAlvo } from "./broadcast.types";

/**
 * Quantos dias para trás a consulta de "quem já foi tratado" enxerga.
 */
export const JANELA_DIAS = 30;

/**
 * Traduz o erro de uma Edge Function que ainda não foi publicada com a
 * capacidade que o app acabou de passar a usar.
 */
export function erroDeFuncaoDesatualizada(
  funcao: string,
  status: number,
  erro: string,
): string | null {
  const desconhecida = /action.*inv[áa]lid|action desconhecida|invalid action/i.test(erro);
  if (status !== 400 || !desconhecida) return null;
  return (
    `A função ${funcao} ainda não foi publicada com esta capacidade. ` +
    `No Lovable: "Deploy the ${funcao} edge function", depois Publish.`
  );
}

export async function callBroadcast(body: unknown): Promise<any> {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes");
  const res = await fetch(`${url}/functions/v1/whatsapp-broadcast`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const desatualizada = erroDeFuncaoDesatualizada(
      "whatsapp-broadcast",
      res.status,
      String(json?.error ?? ""),
    );
    throw new Error(
      desatualizada ?? json?.error ?? `Falha ao chamar whatsapp-broadcast (${res.status})`,
    );
  }
  return json;
}

/** Um paciente selecionado para o disparo que ainda não tem id de contato. */
export interface AlvoAVincular {
  patientId: string;
  name: string;
  phone: string;
  conversationId: string | null;
}

/**
 * O identificador de cada paciente na fila de disparo.
 *
 * ── O que isto era ──────────────────────────────────────────────────────
 *
 * Uma chamada ao CRM que criava um contato lá para cada paciente selecionado,
 * só para a fila ter um id que o CRM aceitasse — com até 110 segundos de
 * espera e um erro em vermelho quando ele demorava. Era a etapa "Vinculando
 * contatos ao CRM" que o cartão de preparação mostrava.
 *
 * O envio não precisa mais disso: ele endereça pelo NÚMERO. Então o id de
 * cada linha da fila passa a ser o do próprio paciente, que é nosso, já existe
 * e não depende de ninguém responder. A etapa continua existindo no cartão
 * porque a tela é a mesma — só que agora ela é instantânea.
 *
 * Quem não tem telefone fica de fora do mapa, e quem chama já nomeia essa
 * pessoa em `foraDoDisparo` em vez de deixá-la sumir calada.
 *
 * O "já recebeu" da tela de contatos continua valendo: ele casa por id **ou**
 * por telefone normalizado (`ContactsTab.tsx`), e o telefone vai gravado em
 * toda linha da fila.
 */
export function resolverEmLote(pacientes: AlvoAVincular[]): Record<string, string> {
  const mapa: Record<string, string> = {};
  for (const p of pacientes) {
    if (!p.patientId || !p.phone?.trim()) continue;
    mapa[p.patientId] = p.patientId;
  }
  return mapa;
}

/**
 * Quando a fila termina, calculado a partir do ritmo gravado no lote.
 */
export function previsaoDeTermino(l: any): string | null {
  const total = Number(l.total ?? 0);
  if (total <= 1) return null;
  const min = Number(l.interval_min_seconds ?? l.interval_seconds ?? 8);
  const max = Number(l.interval_max_seconds ?? min);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  const intervalos = total - 1;
  const pausarACada = Number(l.pause_after ?? 0);
  const pausas = pausarACada > 0 ? Math.floor(intervalos / pausarACada) : 0;
  const segundos =
    intervalos * ((min + max) / 2) + pausas * Number(l.resume_after_minutes ?? 0) * 60;
  return new Date(new Date(l.created_at).getTime() + segundos * 1000).toISOString();
}

/** Mantém o tipo em uso aqui alinhado com o das server functions. */
export type { BroadcastAlvo };
