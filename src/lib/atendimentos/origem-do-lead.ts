// De onde veio o lead — as regras, sem banco e sem tela.
//
// Duas fontes: a AUTOMÁTICA (o que o WhatsApp prova: clique em anúncio, ou a
// frase pronta que o anúncio e o site mandam) e a MANUAL (a recepção escolhe). A manual
// sempre vale mais. Sem nenhuma das duas, a pessoa é orgânica: chegou no
// WhatsApp sem rastro de campanha.
import { normalizeBrazilianPhone } from "./phone";

export type OrigemDoLead =
  | "meta_ads"
  | "google_ads"
  | "google"
  | "chatgpt"
  | "instagram"
  | "indicacao"
  | "site"
  | "organico"
  | "outro";

export const ORIGENS: { id: OrigemDoLead; rotulo: string }[] = [
  { id: "meta_ads", rotulo: "Meta Ads" },
  { id: "google_ads", rotulo: "Google Ads" },
  { id: "google", rotulo: "Google" },
  { id: "chatgpt", rotulo: "ChatGPT" },
  { id: "site", rotulo: "Site" },
  { id: "indicacao", rotulo: "Indicação" },
  { id: "instagram", rotulo: "Instagram" },
  { id: "organico", rotulo: "Orgânico" },
  { id: "outro", rotulo: "Outro" },
];

export function ehOrigem(v: unknown): v is OrigemDoLead {
  return typeof v === "string" && ORIGENS.some((o) => o.id === v);
}

export function rotuloDaOrigem(origem: OrigemDoLead): string {
  return ORIGENS.find((o) => o.id === origem)?.rotulo ?? "Outro";
}

/** O que a tela recebe por conversa. */
export interface OrigemDaConversa {
  tipo: OrigemDoLead;
  /** `true` = alguém escolheu; `false` = estimada pelo que o WhatsApp mostrou. */
  manual: boolean;
}

/**
 * O telefone da pessoa na forma canônica: com o 55 e SEM o nono dígito de
 * celular. Gêmea de `foneCanonico` (supabase/functions/_shared) — e precisa ser,
 * porque a ficha do paciente guarda "5548996266217" e o WhatsApp "554896266217":
 * sem tratar o nono dígito, a origem escolhida na agenda não apareceria no chat
 * (nem o contrário), por serem "duas pessoas" diferentes.
 */
function foneDaPessoa(telefone: string | null | undefined): string | null {
  if (!telefone?.trim()) return null;
  const d = normalizeBrazilianPhone(telefone);
  if (d.length === 13 && /^9[6-9]$/.test(d.slice(4, 6))) return d.slice(0, 4) + d.slice(5);
  return d.length === 12 || d.length === 13 ? d : null;
}

/**
 * A chave sob a qual a escolha manual é guardada: o telefone da pessoa, para
 * valer em todas as conversas do mesmo número e na agenda; sem telefone, a
 * própria conversa (ou "paciente:<id>", vindo da agenda).
 */
export function chaveDaOrigem(telefone: string | null | undefined, conversationId: string) {
  return foneDaPessoa(telefone) ?? `conv:${conversationId}`;
}

/** Entre os sinais automáticos de uma conversa, o mais forte. */
function sinalMaisForte(sinais: readonly string[]): OrigemDoLead | null {
  if (sinais.includes("meta_ads")) return "meta_ads";
  if (sinais.includes("site")) return "site";
  return null;
}

/**
 * A origem de uma conversa.
 *
 * `manual` — a escolha da recepção para a pessoa, se houver.
 * `automaticos` — os sinais das conversas do MESMO número (a pessoa pode ter
 * clicado no anúncio numa conversa e continuado em outra).
 */
export function resolverOrigem(
  manual: string | null | undefined,
  automaticos: readonly string[],
): OrigemDaConversa {
  if (ehOrigem(manual)) return { tipo: manual, manual: true };
  return { tipo: sinalMaisForte(automaticos) ?? "organico", manual: false };
}
