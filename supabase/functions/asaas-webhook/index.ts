// deno-lint-ignore-file no-explicit-any
// Os avisos do Asaas: pagou, renovou, venceu, cancelou.
//
// ── A porta ─────────────────────────────────────────────────────────────
//
// Pública (`verify_jwt = false` em `supabase/config.toml`): o Asaas não tem
// como apresentar um JWT do Supabase. Quem passa é quem traz, no cabeçalho
// `asaas-access-token`, o segredo `ASAAS_WEBHOOK_TOKEN` — o mesmo cadastrado
// no webhook do painel do Asaas. Sem ele, 401.
//
// ── Uma vez só ──────────────────────────────────────────────────────────
//
// O Asaas entrega "pelo menos uma vez". O `id` do evento vai para
// `asaas_eventos_vistos`; o segundo igual é respondido 200 e ignorado. Além
// disso, o pacote só soma conversas na passagem do checkout de "aberto" para
// "pago" (com trava), e o "pago até" sai do vencimento da cobrança — então
// nem dois eventos diferentes do mesmo pagamento contam duas vezes.
//
// Responder 2xx importa: 15 falhas seguidas e o Asaas para a fila. Evento que
// não é nosso, ou que não dá para ligar a um consultório, responde 200 com o
// motivo no log. Só um erro nosso de verdade (banco fora, por exemplo)
// responde 500 e libera o id, para o Asaas entregar de novo.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  asaas,
  hojeNoBrasil,
  lerReferencia,
  maisTarde,
  pagoAteDoVencimento,
  tokenConfere,
  type Ciclo,
  type Referencia,
} from "../_shared/asaas.ts";
import { pushToOwner } from "../_shared/push.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function idDe(v: any): string {
  if (!v) return "";
  return typeof v === "string" ? v : String(v.id ?? "");
}

async function jaVisto(id: string, evento: string): Promise<boolean> {
  if (!id) return false;
  const { data, error } = await supabase
    .from("asaas_eventos_vistos")
    .upsert({ id, evento }, { onConflict: "id", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(error.message);
  return !(data ?? []).length;
}

/** A linha do checkout aberto, se a referência não veio no evento. */
async function linhaDoCheckout(checkoutId: string): Promise<any | null> {
  if (!checkoutId) return null;
  const { data } = await supabase
    .from("asaas_pagamentos")
    .select("*")
    .eq("checkout_id", checkoutId)
    .maybeSingle();
  return data ?? null;
}

function referenciaDaLinha(l: any): Referencia | null {
  if (!l) return null;
  if (l.tipo === "pacote" && Number(l.conversas) > 0) {
    return { tipo: "pacote", ownerId: String(l.owner_id), conversas: Number(l.conversas) };
  }
  if (l.tipo === "assinatura" && l.plano && l.ciclo) {
    return { tipo: "assinatura", ownerId: String(l.owner_id), plano: l.plano, ciclo: l.ciclo };
  }
  return null;
}

/** Soma o pacote uma vez só: só quem passa a linha de "aberto" para "pago". */
async function creditarPacote(checkoutId: string, ref: Extract<Referencia, { tipo: "pacote" }>) {
  const { data: virou } = await supabase
    .from("asaas_pagamentos")
    .update({ status: "pago", atualizado_em: new Date().toISOString() })
    .eq("checkout_id", checkoutId)
    .eq("status", "aberto")
    .select("valor_centavos");
  if (!(virou ?? []).length) return { motivo: "pacote já creditado ou checkout desconhecido" };
  const { error } = await supabase.rpc("somar_conversas_extras", {
    _owner: ref.ownerId,
    _conversas: ref.conversas,
  });
  if (error) throw new Error(`não somou o pacote: ${error.message}`);
  await supabase.from("clinica_pacotes").insert({
    owner_id: ref.ownerId,
    conversas: ref.conversas,
    valor_centavos: virou![0].valor_centavos ?? null,
    observacao: `Asaas ${checkoutId}`,
  });
  return { creditado: ref.conversas };
}

/** Assinatura paga até `vencimento + ciclo`. Nunca encurta o que já havia. */
async function renovar(
  ownerId: string,
  ciclo: Ciclo,
  vencimento: string,
  extra: Record<string, unknown> = {},
) {
  const { data: ficha } = await supabase
    .from("clinicas")
    .select("pago_ate, asaas_subscription_id")
    .eq("owner_id", ownerId)
    .maybeSingle();
  const pagoAte = maisTarde(ficha?.pago_ate ?? null, pagoAteDoVencimento(vencimento, ciclo));

  // Trocou de plano: a assinatura nova entrou, a antiga não pode continuar
  // cobrando. Cancela a anterior no Asaas (o período pago dela não se perde:
  // o "pago até" é o maior dos dois).
  const nova = String(extra.asaas_subscription_id ?? "");
  const antiga = String(ficha?.asaas_subscription_id ?? "");
  if (nova && antiga && nova !== antiga) {
    try {
      await asaas(`/subscriptions/${encodeURIComponent(antiga)}`, { method: "DELETE" });
    } catch (e) {
      console.warn("[asaas-webhook] assinatura antiga não cancelada:", antiga, e);
    }
  }
  const { error } = await supabase
    .from("clinicas")
    .update({
      situacao: "ativa",
      ciclo,
      pago_ate: pagoAte,
      atualizado_em: new Date().toISOString(),
      ...extra,
    })
    .eq("owner_id", ownerId);
  if (error) throw new Error(error.message);
  return { pagoAte };
}

/** De quem é esta assinatura: pela ficha, ou perguntando ao Asaas a
 *  referência dela (a primeira cobrança chega antes de a ficha saber o id). */
async function donoDaAssinatura(
  subscriptionId: string,
): Promise<{ ownerId: string; ciclo: Ciclo | null; plano: string | null } | null> {
  const { data: ficha } = await supabase
    .from("clinicas")
    .select("owner_id, ciclo, plano")
    .eq("asaas_subscription_id", subscriptionId)
    .maybeSingle();
  if (ficha) return { ownerId: String(ficha.owner_id), ciclo: ficha.ciclo, plano: ficha.plano };
  try {
    const sub = await asaas(`/subscriptions/${encodeURIComponent(subscriptionId)}`);
    const ref = lerReferencia(sub?.externalReference);
    if (ref?.tipo === "assinatura") {
      return { ownerId: ref.ownerId, ciclo: ref.ciclo, plano: ref.plano };
    }
  } catch (e) {
    console.warn("[asaas-webhook] assinatura não consultada:", e);
  }
  return null;
}

async function tratar(corpo: any): Promise<unknown> {
  const evento = String(corpo?.event ?? "");

  if (evento === "CHECKOUT_PAID") {
    const ck = corpo.checkout ?? {};
    const checkoutId = idDe(ck);
    const linha = await linhaDoCheckout(checkoutId);
    const ref = lerReferencia(ck.externalReference) ?? referenciaDaLinha(linha);
    if (!ref) return { ignorado: "checkout sem referência nossa" };
    if (ref.tipo === "pacote") return creditarPacote(checkoutId, ref);

    await supabase
      .from("asaas_pagamentos")
      .update({ status: "pago", atualizado_em: new Date().toISOString() })
      .eq("checkout_id", checkoutId);
    const subscriptionId = idDe(ck.subscription);
    return renovar(ref.ownerId, ref.ciclo, hojeNoBrasil(new Date()), {
      plano: ref.plano,
      ...(subscriptionId ? { asaas_subscription_id: subscriptionId } : {}),
    });
  }

  if (evento === "PAYMENT_CONFIRMED" || evento === "PAYMENT_RECEIVED") {
    const p = corpo.payment ?? {};
    const subscriptionId = idDe(p.subscription);
    if (!subscriptionId) {
      // Cobrança avulsa: o pacote. Quem credita é o CHECKOUT_PAID; aqui só
      // se ele não vier, pela sessão do checkout.
      const checkoutId = idDe(p.checkoutSession);
      const ref =
        lerReferencia(p.externalReference) ?? referenciaDaLinha(await linhaDoCheckout(checkoutId));
      if (ref?.tipo === "pacote" && checkoutId) return creditarPacote(checkoutId, ref);
      return { ignorado: "cobrança avulsa sem pacote conhecido" };
    }
    const dono = await donoDaAssinatura(subscriptionId);
    if (!dono) return { ignorado: `assinatura ${subscriptionId} sem consultório` };
    const ciclo: Ciclo = dono.ciclo === "anual" ? "anual" : "mensal";
    await supabase.from("asaas_pagamentos").upsert(
      {
        owner_id: dono.ownerId,
        tipo: "assinatura",
        plano: dono.plano,
        ciclo,
        valor_centavos: Math.round(Number(p.value ?? 0) * 100) || null,
        payment_id: idDe(p),
        subscription_id: subscriptionId,
        status: "pago",
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "payment_id" },
    );
    const vencimento = String(p.dueDate ?? hojeNoBrasil(new Date()));
    return renovar(dono.ownerId, ciclo, vencimento, { asaas_subscription_id: subscriptionId });
  }

  if (evento === "PAYMENT_OVERDUE") {
    const p = corpo.payment ?? {};
    const subscriptionId = idDe(p.subscription);
    if (!subscriptionId) return { ignorado: "vencida avulsa" };
    const dono = await donoDaAssinatura(subscriptionId);
    if (!dono) return { ignorado: "assinatura sem consultório" };
    try {
      await pushToOwner(
        supabase,
        dono.ownerId,
        "automation",
        {
          title: "O pagamento do plano venceu",
          body: "Confira o cartão em Configurações → Plano. O sistema segue funcionando por 7 dias depois do vencimento.",
          url: "/configuracoes/plano",
        },
        {},
      );
    } catch (e) {
      console.warn("[asaas-webhook] aviso de vencimento falhou:", e);
    }
    return { avisado: dono.ownerId };
  }

  if (
    evento === "PAYMENT_REFUNDED" ||
    evento === "PAYMENT_CHARGEBACK_REQUESTED" ||
    evento === "PAYMENT_DELETED"
  ) {
    const p = corpo.payment ?? {};
    const status =
      evento === "PAYMENT_REFUNDED"
        ? "estornado"
        : evento === "PAYMENT_DELETED"
          ? "removido"
          : "contestado";
    await supabase
      .from("asaas_pagamentos")
      .update({ status, atualizado_em: new Date().toISOString() })
      .eq("payment_id", idDe(p));
    return { registrado: status };
  }

  if (evento === "SUBSCRIPTION_DELETED" || evento === "SUBSCRIPTION_INACTIVATED") {
    const subscriptionId = idDe(corpo.subscription);
    // O que já foi pago vale até `pago_ate`; depois a regra de atraso fecha.
    await supabase
      .from("clinicas")
      .update({ asaas_subscription_id: null, atualizado_em: new Date().toISOString() })
      .eq("asaas_subscription_id", subscriptionId);
    return { encerrada: subscriptionId };
  }

  return { ignorado: evento || "sem evento" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  if (
    !tokenConfere(req.headers.get("asaas-access-token"), Deno.env.get("ASAAS_WEBHOOK_TOKEN") ?? "")
  ) {
    return Response.json({ error: "não autorizado" }, { status: 401 });
  }
  let corpo: any = null;
  try {
    corpo = await req.json();
  } catch {
    return Response.json({ ok: true, ignorado: "corpo inválido" });
  }
  try {
    if (await jaVisto(String(corpo?.id ?? ""), String(corpo?.event ?? ""))) {
      return Response.json({ ok: true, repetido: true });
    }
    const resultado = await tratar(corpo);
    console.log("[asaas-webhook]", corpo?.event, JSON.stringify(resultado));
    return Response.json({ ok: true, resultado });
  } catch (e) {
    console.error("[asaas-webhook]", corpo?.event, e);
    // Libera o id para o Asaas tentar de novo: o erro foi nosso.
    await supabase
      .from("asaas_eventos_vistos")
      .delete()
      .eq("id", String(corpo?.id ?? ""));
    return Response.json(
      { ok: false, erro: e instanceof Error ? e.message : "falhou" },
      { status: 500 },
    );
  }
});
