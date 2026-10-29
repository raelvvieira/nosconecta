// deno-lint-ignore-file no-explicit-any
// O Asaas: as regras puras do pagamento e a chamada à API.
//
// ── Como um pagamento acha o consultório ──────────────────────────────────
//
// Todo checkout leva uma referência (`externalReference`) que diz o que é e
// de quem é: `assinatura:<owner_id>:<plano>:<ciclo>` ou
// `pacote:<owner_id>:<conversas>`. O webhook lê a referência de volta; quando
// ela não vem (as cobranças mensais da assinatura), o consultório é achado
// pelo `asaas_subscription_id` gravado na ficha.
//
// ── Por que o "pago até" sai do vencimento da cobrança ────────────────────
//
// O mesmo pagamento chega em mais de um evento (CHECKOUT_PAID, depois
// PAYMENT_CONFIRMED, depois PAYMENT_RECEIVED). Somar "mais um mês" a cada
// evento daria três meses por um. Calculado do vencimento da cobrança, o
// resultado é o mesmo não importa quantas vezes o evento chegue.

export type Plano = "basico" | "ia";
export type Ciclo = "mensal" | "anual";

export type Referencia =
  | { tipo: "assinatura"; ownerId: string; plano: Plano; ciclo: Ciclo }
  | { tipo: "pacote"; ownerId: string; conversas: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function referenciaDaAssinatura(ownerId: string, plano: Plano, ciclo: Ciclo): string {
  return `assinatura:${ownerId}:${plano}:${ciclo}`;
}

export function referenciaDoPacote(ownerId: string, conversas: number): string {
  return `pacote:${ownerId}:${conversas}`;
}

/** A referência de volta, ou `null` se não é nossa ou veio estragada. */
export function lerReferencia(texto: unknown): Referencia | null {
  const partes = String(texto ?? "").split(":");
  if (partes[0] === "assinatura" && partes.length === 4) {
    const [, ownerId, plano, ciclo] = partes;
    if (!UUID.test(ownerId)) return null;
    if (plano !== "basico" && plano !== "ia") return null;
    if (ciclo !== "mensal" && ciclo !== "anual") return null;
    return { tipo: "assinatura", ownerId, plano, ciclo };
  }
  if (partes[0] === "pacote" && partes.length === 3) {
    const [, ownerId, n] = partes;
    const conversas = Number(n);
    if (!UUID.test(ownerId) || !Number.isInteger(conversas) || conversas <= 0) return null;
    return { tipo: "pacote", ownerId, conversas };
  }
  return null;
}

export function cicloDoAsaas(ciclo: Ciclo): "MONTHLY" | "YEARLY" {
  return ciclo === "anual" ? "YEARLY" : "MONTHLY";
}

/** A chave do preço em `plataforma_precos`. */
export function chaveDoPreco(plano: Plano, ciclo: Ciclo): string {
  return `${plano}_${ciclo}`;
}

/**
 * Até quando fica pago, a partir do vencimento da cobrança ("YYYY-MM-DD").
 *
 * Fim do dia em Brasília (23:59:59, UTC-3) do mesmo dia no mês (ou ano)
 * seguinte. Dia que não existe no mês de chegada (31 de janeiro + 1 mês) cai
 * no último dia dele, não no começo do outro.
 */
export function pagoAteDoVencimento(vencimento: string, ciclo: Ciclo): string {
  const [a, m, d] = vencimento.slice(0, 10).split("-").map(Number);
  const anos = ciclo === "anual" ? 1 : 0;
  const meses = ciclo === "anual" ? 0 : 1;
  let ano = a + anos;
  let mes = m + meses; // 1..13
  if (mes > 12) {
    mes -= 12;
    ano += 1;
  }
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const dia = Math.min(d, ultimo);
  const p = (n: number) => String(n).padStart(2, "0");
  return new Date(`${ano}-${p(mes)}-${p(dia)}T23:59:59-03:00`).toISOString();
}

/** O maior dos dois: um evento atrasado nunca encurta o que já estava pago. */
export function maisTarde(a: string | null | undefined, b: string): string {
  if (!a) return b;
  return new Date(a).getTime() > new Date(b).getTime() ? a : b;
}

/** Hoje em Brasília, "YYYY-MM-DD" — o vencimento da primeira cobrança. */
export function hojeNoBrasil(agora: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}

/** Comparação que não vaza, pelo tempo, quantos caracteres bateram. */
export function tokenConfere(recebido: string | null, esperado: string): boolean {
  const a = String(recebido ?? "");
  if (!esperado || a.length !== esperado.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ esperado.charCodeAt(i);
  return dif === 0;
}

// ── A API ────────────────────────────────────────────────────────────────

/** Sandbox até a plataforma trocar `ASAAS_AMBIENTE` para `producao`. */
export function baseDaApi(ambiente: string | null | undefined): string {
  return ambiente === "producao" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";
}

export async function asaas(
  caminho: string,
  init: { method?: string; body?: unknown } = {},
): Promise<any> {
  const chave = Deno.env.get("ASAAS_API_KEY");
  if (!chave) throw new Error("A chave do Asaas (ASAAS_API_KEY) não está cadastrada.");
  const resposta = await fetch(`${baseDaApi(Deno.env.get("ASAAS_AMBIENTE"))}${caminho}`, {
    method: init.method ?? "GET",
    headers: {
      access_token: chave,
      "content-type": "application/json",
      "user-agent": "NOS Conecta",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(30_000),
  });
  const texto = await resposta.text();
  let json: any = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    json = null;
  }
  if (!resposta.ok) {
    const motivo =
      (json?.errors ?? [])
        .map((e: any) => e?.description)
        .filter(Boolean)
        .join("; ") || `HTTP ${resposta.status}`;
    throw new Error(`Asaas: ${motivo}`);
  }
  return json;
}
