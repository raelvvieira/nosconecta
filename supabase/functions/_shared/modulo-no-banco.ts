// O módulo Paciente Modelo lido do banco: o que está ligado, a configuração
// e as edições com práticas, ofertas e vagas ocupadas.
//
// Irmão de `plano-no-banco.ts`: as regras moram em
// `modulo-paciente-modelo.ts` (puro, com testes); aqui só a leitura. Tabela
// ausente (migration pendente) = módulo desligado, nunca erro.

import {
  configDoModulo,
  type ConfigDoModulo,
  type EdicaoDoModulo,
  type StatusDaEdicao,
} from "./modulo-paciente-modelo.ts";

export interface ModuloCarregado {
  ativo: boolean;
  config: ConfigDoModulo;
  manual: string | null;
  /** Todas as edições que não estão encerradas, com práticas e ofertas. */
  edicoes: EdicaoDoModulo[];
}

const DESLIGADO: ModuloCarregado = {
  ativo: false,
  config: configDoModulo({}),
  manual: null,
  edicoes: [],
};

function ausente(error: any): boolean {
  return (
    !!error && (error.code === "42P01" || /does not exist/i.test(String(error?.message ?? "")))
  );
}

export async function carregarModuloPacienteModelo(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  ownerId: string,
  agentId: string,
  agora: Date,
): Promise<ModuloCarregado> {
  const { data: mod, error } = await supabase
    .from("agente_modulos")
    .select("ativo, manual, config")
    .eq("owner_id", ownerId)
    .eq("agent_id", agentId)
    .eq("modulo", "paciente_modelo")
    .maybeSingle();
  if (error) {
    if (!ausente(error)) console.warn("[modulo] não deu para ler agente_modulos:", error.message);
    return DESLIGADO;
  }
  if (!mod?.ativo)
    return { ...DESLIGADO, config: configDoModulo(mod?.config), manual: mod?.manual ?? null };
  const config = configDoModulo(mod.config);

  const { data: edicoes, error: e1 } = await supabase
    .from("mentoria_edicoes")
    .select(
      "id, nome, cidade, endereco, inicio, fim, status, observacoes, unit_id, clinic_units(address)",
    )
    .eq("owner_id", ownerId)
    .neq("status", "encerrada")
    .order("inicio", { ascending: true });
  if (e1) {
    console.warn("[modulo] não deu para ler as edições:", e1.message);
    return { ativo: true, config, manual: mod.manual ?? null, edicoes: [] };
  }
  const ids = (edicoes ?? []).map((e: any) => String(e.id));
  if (!ids.length) return { ativo: true, config, manual: mod.manual ?? null, edicoes: [] };

  const [{ data: praticas }, { data: ofertas }, { data: reservas }] = await Promise.all([
    supabase
      .from("mentoria_praticas")
      .select("id, edicao_id, data, hora_inicio, hora_fim, vagas, observacao")
      .in("edicao_id", ids)
      .order("data"),
    supabase
      .from("mentoria_ofertas")
      .select(
        "id, edicao_id, nome, descricao, ml, preco_vista, preco_parcelado, parcelas_max, tipo, destaque, ordem",
      )
      .in("edicao_id", ids)
      .eq("ativo", true)
      .order("ordem"),
    supabase
      .from("mentoria_reservas")
      .select("pratica_id, status, created_at")
      .in("edicao_id", ids)
      .in("status", ["sinal_pendente", "confirmada"]),
  ]);

  // Quem ocupa vaga: confirmada sempre; sinal pendente só dentro do prazo.
  const limite = agora.getTime() - config.sinal.prazoHoras * 3_600_000;
  const ocupadas = new Map<string, number>();
  for (const r of reservas ?? []) {
    if (!r.pratica_id) continue;
    if (r.status === "sinal_pendente" && new Date(r.created_at).getTime() < limite) continue;
    ocupadas.set(String(r.pratica_id), (ocupadas.get(String(r.pratica_id)) ?? 0) + 1);
  }

  const lista: EdicaoDoModulo[] = (edicoes ?? []).map((e: any) => ({
    id: String(e.id),
    nome: String(e.nome ?? ""),
    cidade: e.cidade ?? null,
    // O endereço avulso vence; sem ele, o da unidade escolhida.
    endereco: (e.endereco && String(e.endereco).trim()) || e.clinic_units?.address || null,
    inicio: e.inicio ?? null,
    fim: e.fim ?? null,
    status: (e.status ?? "rascunho") as StatusDaEdicao,
    observacoes: e.observacoes ?? null,
    praticas: (praticas ?? [])
      .filter((p: any) => String(p.edicao_id) === String(e.id))
      .map((p: any) => ({
        id: String(p.id),
        data: String(p.data),
        horaInicio: p.hora_inicio ?? null,
        horaFim: p.hora_fim ?? null,
        vagas: Number(p.vagas ?? 0),
        ocupadas: ocupadas.get(String(p.id)) ?? 0,
        observacao: p.observacao ?? null,
      })),
    ofertas: (ofertas ?? [])
      .filter((o: any) => String(o.edicao_id) === String(e.id))
      .map((o: any) => ({
        id: String(o.id),
        nome: String(o.nome ?? ""),
        descricao: o.descricao ?? null,
        ml: o.ml === null || o.ml === undefined ? null : Number(o.ml),
        precoVista: Number(o.preco_vista ?? 0),
        precoParcelado:
          o.preco_parcelado === null || o.preco_parcelado === undefined
            ? null
            : Number(o.preco_parcelado),
        parcelasMax: o.parcelas_max ?? null,
        tipo: o.tipo === "combo" ? "combo" : "procedimento",
        destaque: o.destaque === true,
      })),
  }));
  return { ativo: true, config, manual: mod.manual ?? null, edicoes: lista };
}
