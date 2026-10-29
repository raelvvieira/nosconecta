// Abre o Checkout do Asaas: a assinatura do sistema ou um pacote de
// conversas. Devolve o link da página de pagamento do Asaas.
//
// ── Por que uma Edge Function ───────────────────────────────────────────
//
// A chave do Asaas é segredo do Supabase (`ASAAS_API_KEY`), como a da
// Evolution. Quem chama é o servidor do site (`pagamento.functions.ts`), com
// a chave de serviço, depois de conferir que a pessoa administra o
// consultório. O preço vem de `plataforma_precos`, nunca do pedido.
//
// Criar o checkout não é receber: quem confirma o pagamento é o webhook
// (`asaas-webhook`), com o evento do Asaas.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  asaas,
  chaveDoPreco,
  cicloDoAsaas,
  hojeNoBrasil,
  referenciaDaAssinatura,
  referenciaDoPacote,
  type Ciclo,
  type Plano,
} from "../_shared/asaas.ts";
import { IMAGEM_DO_ITEM } from "../_shared/asaas-imagem.ts";
import { soOSistema } from "../_shared/so-o-sistema.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const SITE = Deno.env.get("SITE_URL") || "https://login.nosodontoesaude.com.br";

async function preco(
  chave: string,
): Promise<{ nome: string; valor: number; conversas: number | null }> {
  const { data, error } = await supabase
    .from("plataforma_precos")
    .select("nome, valor_centavos, conversas")
    .eq("chave", chave)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Preço "${chave}" não cadastrado.`);
  return {
    nome: String(data.nome),
    valor: Number(data.valor_centavos) / 100,
    conversas: data.conversas === null ? null : Number(data.conversas),
  };
}

/** O nome do item tem no máximo 30 caracteres no Asaas. */
function nomeDoItem(nome: string): string {
  return nome.length > 30 ? `${nome.slice(0, 29)}…` : nome;
}

async function abrirCheckout(e: {
  ownerId: string;
  tipo: "assinatura" | "pacote";
  plano?: Plano;
  ciclo?: Ciclo;
  conversas?: number | null;
  valor: number;
  nome: string;
  referencia: string;
  criadoPor: string | null;
}): Promise<{ link: string }> {
  const recorrente = e.tipo === "assinatura";
  const corpo: Record<string, unknown> = {
    billingTypes: recorrente ? ["CREDIT_CARD"] : ["PIX", "CREDIT_CARD"],
    chargeTypes: [recorrente ? "RECURRENT" : "DETACHED"],
    minutesToExpire: 1440,
    externalReference: e.referencia,
    callback: {
      successUrl: `${SITE}/configuracoes/plano?pago=1`,
      cancelUrl: `${SITE}/configuracoes/plano`,
      expiredUrl: `${SITE}/configuracoes/plano`,
    },
    items: [
      {
        name: nomeDoItem(e.nome),
        description: e.nome.slice(0, 150),
        quantity: 1,
        value: e.valor,
        imageBase64: IMAGEM_DO_ITEM,
      },
    ],
  };
  if (recorrente) {
    corpo.subscription = { cycle: cicloDoAsaas(e.ciclo!), nextDueDate: hojeNoBrasil(new Date()) };
  }
  // Sem `customerData` de propósito: mandando parte dos dados (nome e
  // e-mail), o Asaas exige todos (CPF/CNPJ, telefone, endereço, CEP, bairro)
  // e recusa o checkout — foi o erro do primeiro teste, em 29/10. Sem nada,
  // quem paga preenche os dados na própria página do Asaas.

  const checkout = await asaas("/checkouts", { method: "POST", body: corpo });
  const link = String(checkout?.link ?? "");
  if (!checkout?.id || !link) throw new Error("O Asaas não devolveu o link do pagamento.");

  // Guardado antes de a pessoa pagar: é o que liga o pagamento ao consultório
  // mesmo se o evento do Asaas vier sem a referência.
  const { error } = await supabase.from("asaas_pagamentos").insert({
    owner_id: e.ownerId,
    tipo: e.tipo,
    plano: e.plano ?? null,
    ciclo: e.ciclo ?? null,
    conversas: e.conversas ?? null,
    valor_centavos: Math.round(e.valor * 100),
    checkout_id: String(checkout.id),
    link,
    status: "aberto",
    criado_por: e.criadoPor,
  });
  if (error) console.warn("[asaas-checkout] registro do checkout falhou:", error.message);
  return { link };
}

async function cancelar(ownerId: string) {
  const { data: ficha, error } = await supabase
    .from("clinicas")
    .select("asaas_subscription_id")
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const id = String(ficha?.asaas_subscription_id ?? "");
  if (!id) return { ok: true, motivo: "sem assinatura" };
  await asaas(`/subscriptions/${encodeURIComponent(id)}`, { method: "DELETE" });
  // O que já foi pago continua valendo até `pago_ate`; depois, a regra de
  // atraso fecha o sistema sozinha.
  await supabase
    .from("clinicas")
    .update({ asaas_subscription_id: null, atualizado_em: new Date().toISOString() })
    .eq("owner_id", ownerId);
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  const barrado = soOSistema(req);
  if (barrado) return barrado;
  try {
    const pedido = (await req.json().catch(() => ({}))) as {
      action?: string;
      ownerId?: string;
      plano?: Plano;
      ciclo?: Ciclo;
      criadoPor?: string | null;
    };
    const ownerId = String(pedido.ownerId ?? "");
    if (!ownerId) return Response.json({ error: "ownerId é obrigatório" }, { status: 400 });

    if (pedido.action === "assinar") {
      const plano = pedido.plano === "basico" ? "basico" : pedido.plano === "ia" ? "ia" : null;
      const ciclo =
        pedido.ciclo === "anual" ? "anual" : pedido.ciclo === "mensal" ? "mensal" : null;
      if (!plano || !ciclo)
        return Response.json({ error: "plano ou ciclo inválido" }, { status: 400 });
      const p = await preco(chaveDoPreco(plano, ciclo));
      return Response.json(
        await abrirCheckout({
          ownerId,
          tipo: "assinatura",
          plano,
          ciclo,
          valor: p.valor,
          nome: p.nome,
          referencia: referenciaDaAssinatura(ownerId, plano, ciclo),
          criadoPor: pedido.criadoPor ?? null,
        }),
      );
    }

    if (pedido.action === "pacote") {
      const p = await preco("pacote_conversas");
      const conversas = p.conversas ?? 0;
      if (conversas <= 0) throw new Error("O pacote não diz quantas conversas dá.");
      return Response.json(
        await abrirCheckout({
          ownerId,
          tipo: "pacote",
          conversas,
          valor: p.valor,
          nome: p.nome,
          referencia: referenciaDoPacote(ownerId, conversas),
          criadoPor: pedido.criadoPor ?? null,
        }),
      );
    }

    if (pedido.action === "cancelar") return Response.json(await cancelar(ownerId));

    return Response.json({ error: `action desconhecida: ${pedido.action}` }, { status: 400 });
  } catch (e) {
    console.error("[asaas-checkout]", e);
    return Response.json(
      { error: e instanceof Error ? e.message : "falhou ao falar com o Asaas" },
      { status: 502 },
    );
  }
});
