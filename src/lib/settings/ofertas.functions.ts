/* eslint-disable @typescript-eslint/no-explicit-any -- tabela nova, fora do types.ts do Lovable */
import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";
import { exigeConfiguracoes } from "@/lib/auth/area.middleware";
import {
  LIMITE_DAS_INSTRUCOES,
  ofertaDoBanco,
  type EstadoDaOferta,
  type Oferta,
  type ParaQuem,
} from "../../../supabase/functions/_shared/mapa-de-ofertas.ts";
import type { ItemDeCampanha } from "../../../supabase/functions/_shared/condicoes-do-consultorio.ts";

/**
 * Ofertas: o que a clínica oferece de especial (promoções de preço, Paciente
 * Modelo, Mentoria). A assistente lê as abertas hoje no bloco "O que está
 * valendo agora" (ver `_shared/mapa-de-ofertas.ts`). Tudo por `owner_id`.
 */

export { LIMITE_DAS_INSTRUCOES };
export type { EstadoDaOferta, ItemDeCampanha, Oferta, ParaQuem };

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export const listarOfertas = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<Oferta[]> => {
    const supabase: any = context.supabase;
    const { data, error } = await supabase
      .from("ofertas")
      .select("*")
      .eq("owner_id", context.ownerId)
      .order("tipo", { ascending: true })
      .order("fim", { ascending: false, nullsFirst: true });
    if (error) {
      // Migration ainda não rodou: nada a listar.
      if (/does not exist|42P01/.test(String(error.message) + error.code)) return [];
      throw new Error(error.message);
    }
    return (data ?? []).map(ofertaDoBanco);
  });

export type EntradaDaOferta = {
  id?: string | null;
  tipo: "promocao" | "edicao";
  nome: string;
  estado: EstadoDaOferta;
  inicio: string | null;
  fim: string | null;
  paraQuem: ParaQuem;
  comoReconhecer: string | null;
  instrucoes: string | null;
  itens: ItemDeCampanha[];
  observacoes: string | null;
};

export const salvarOferta = createServerFn({ method: "POST" })
  .middleware([exigeConfiguracoes])
  .inputValidator((input: EntradaDaOferta) => {
    const nome = String(input.nome ?? "")
      .trim()
      .slice(0, 80);
    if (!nome) throw new Error("Dê um nome à oferta.");
    const tipo = input.tipo === "edicao" ? "edicao" : "promocao";
    const estado: EstadoDaOferta = ["rascunho", "teste", "ligado", "encerrada"].includes(
      input.estado,
    )
      ? input.estado
      : "rascunho";
    const paraQuem: ParaQuem = ["paciente", "profissional", "todos"].includes(input.paraQuem)
      ? input.paraQuem
      : "todos";
    const dia = /^\d{4}-\d{2}-\d{2}$/;
    const inicio = input.inicio && dia.test(input.inicio) ? input.inicio : null;
    const fim = input.fim && dia.test(input.fim) ? input.fim : null;
    if (inicio && fim && fim < inicio) throw new Error("O fim vem antes do início.");
    const itens = (input.itens ?? [])
      .map((i) => ({
        nome: String(i.nome ?? "")
          .trim()
          .slice(0, 120),
        precoVista: num(i.precoVista),
        parcelas: num(i.parcelas),
        valorParcela: num(i.valorParcela),
      }))
      .filter((i) => i.nome);
    if (tipo === "promocao") {
      if (!inicio || !fim) throw new Error("Uma promoção precisa de início e fim.");
      if (!itens.length) throw new Error("Coloque ao menos um procedimento com preço.");
    }
    return {
      id: input.id || null,
      tipo,
      nome,
      estado,
      inicio,
      fim,
      paraQuem,
      comoReconhecer:
        String(input.comoReconhecer ?? "")
          .trim()
          .slice(0, 400) || null,
      instrucoes:
        String(input.instrucoes ?? "")
          .trim()
          .slice(0, LIMITE_DAS_INSTRUCOES) || null,
      itens: tipo === "promocao" ? itens : [],
      observacoes:
        String(input.observacoes ?? "")
          .trim()
          .slice(0, 600) || null,
    };
  })
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const row = {
      nome: data.nome,
      estado: data.estado,
      inicio: data.inicio,
      fim: data.fim,
      para_quem: data.paraQuem,
      como_reconhecer: data.comoReconhecer,
      instrucoes_comerciais: data.instrucoes,
      itens: data.itens,
      observacoes: data.observacoes,
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      // O tipo e o módulo de uma oferta existente não mudam por aqui.
      const { error } = await supabase
        .from("ofertas")
        .update(row)
        .eq("id", data.id)
        .eq("owner_id", context.ownerId);
      if (error) throw new Error(error.message);
    } else {
      // Oferta nova pela tela é sempre promoção; edições nascem do módulo.
      const { error } = await supabase
        .from("ofertas")
        .insert({ ...row, tipo: "promocao", owner_id: context.ownerId });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const excluirOferta = createServerFn({ method: "POST" })
  .middleware([exigeConfiguracoes])
  .inputValidator((input: { id: string }) => {
    if (!input.id) throw new Error("Oferta inválida.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    // Só promoção sai daqui: Paciente Modelo e Mentoria têm cadastro próprio.
    const { error } = await supabase
      .from("ofertas")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.ownerId)
      .eq("tipo", "promocao");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
