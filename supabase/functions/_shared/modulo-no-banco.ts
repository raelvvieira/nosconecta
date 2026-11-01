// O módulo Paciente Modelo lido do banco: o estado, a configuração, a MD e
// as edições com horários, ofertas e ocupação.
//
// Irmão de `plano-no-banco.ts`: as regras moram em
// `modulo-paciente-modelo.ts` (puro, com testes); aqui só a leitura. Tabela
// ou coluna ausente (migration pendente) = módulo desligado, nunca erro.

import {
  configDoModulo,
  type ConfigDoModulo,
  type EdicaoDoModulo,
  type EstadoDoModulo,
  type ProfissionalDaEdicao,
  type StatusDaEdicao,
} from "./modulo-paciente-modelo.ts";

export interface ModuloCarregado {
  estado: EstadoDoModulo;
  config: ConfigDoModulo;
  manual: string | null;
  /** As edições que não estão encerradas nem canceladas. */
  edicoes: EdicaoDoModulo[];
}

const DESLIGADO: ModuloCarregado = {
  estado: "desligado",
  config: configDoModulo({}),
  manual: null,
  edicoes: [],
};

function ausente(error: any): boolean {
  return (
    !!error &&
    (error.code === "42P01" ||
      error.code === "42703" ||
      /does not exist/i.test(String(error?.message ?? "")))
  );
}

/** O módulo vale nesta conversa? Ligado sempre; "só no teste" só na tela Testar. */
export function moduloValeAqui(estado: EstadoDoModulo, simulacao: boolean): boolean {
  return estado === "ligado" || (estado === "teste" && simulacao);
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
    .select("estado, manual, config")
    .eq("owner_id", ownerId)
    .eq("agent_id", agentId)
    .eq("modulo", "paciente_modelo")
    .maybeSingle();
  if (error) {
    if (!ausente(error)) console.warn("[modulo] não deu para ler agente_modulos:", error.message);
    return DESLIGADO;
  }
  const estado: EstadoDoModulo =
    mod?.estado === "ligado" || mod?.estado === "teste" ? mod.estado : "desligado";
  const config = configDoModulo(mod?.config);
  if (estado === "desligado") return { ...DESLIGADO, config, manual: mod?.manual ?? null };

  const { data: edicoes, error: e1 } = await supabase
    .from("mentoria_edicoes")
    .select(
      "id, nome, cidade, endereco, inicio, fim, status, observacoes, orientacoes_chegada, unit_id, clinic_units(address)",
    )
    .eq("owner_id", ownerId)
    .not("status", "in", "(encerrada,cancelada,rascunho)")
    .order("inicio", { ascending: true });
  if (e1) {
    console.warn("[modulo] não deu para ler as edições:", e1.message);
    return { estado, config, manual: mod?.manual ?? null, edicoes: [] };
  }
  const ids = (edicoes ?? []).map((e: any) => String(e.id));
  if (!ids.length) return { estado, config, manual: mod?.manual ?? null, edicoes: [] };

  const [{ data: praticas }, { data: ofertas }, { data: reservas }] = await Promise.all([
    supabase
      .from("mentoria_praticas")
      .select("id, edicao_id, data, hora_inicio, hora_fim, duracao_min, vagas, observacao")
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
      .select("pratica_id, hora, status, created_at")
      .in("edicao_id", ids)
      .in("status", ["sinal_pendente", "pagamento_em_analise", "confirmada"]),
  ]);

  // Quem ocupa vaga: confirmada e em análise sempre; sinal pendente só
  // dentro do prazo do sinal (é o "hold" da MD, com expiração).
  const limite = agora.getTime() - config.sinal.prazoHoras * 3_600_000;
  const ocupadas = new Map<string, Record<string, number>>();
  for (const r of reservas ?? []) {
    if (!r.pratica_id) continue;
    if (r.status === "sinal_pendente" && new Date(r.created_at).getTime() < limite) continue;
    const mapa = ocupadas.get(String(r.pratica_id)) ?? {};
    const hora = r.hora ? String(r.hora).slice(0, 5) : "";
    mapa[hora] = (mapa[hora] ?? 0) + 1;
    ocupadas.set(String(r.pratica_id), mapa);
  }

  const lista: EdicaoDoModulo[] = (edicoes ?? []).map((e: any) => ({
    id: String(e.id),
    nome: String(e.nome ?? ""),
    cidade: e.cidade ?? null,
    // O endereço escrito vence; sem ele, o da unidade escolhida.
    endereco: (e.endereco && String(e.endereco).trim()) || e.clinic_units?.address || null,
    inicio: e.inicio ?? null,
    fim: e.fim ?? null,
    status: (e.status ?? "rascunho") as StatusDaEdicao,
    observacoes: e.observacoes ?? null,
    orientacoesChegada: e.orientacoes_chegada ?? null,
    praticas: (praticas ?? [])
      .filter((p: any) => String(p.edicao_id) === String(e.id))
      .map((p: any) => ({
        id: String(p.id),
        data: String(p.data),
        horaInicio: p.hora_inicio ? String(p.hora_inicio).slice(0, 5) : null,
        horaFim: p.hora_fim ? String(p.hora_fim).slice(0, 5) : null,
        duracaoMin: Number(p.duracao_min ?? 60),
        vagas: Number(p.vagas ?? 0),
        ocupadas: ocupadas.get(String(p.id)) ?? {},
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
  return { estado, config, manual: mod?.manual ?? null, edicoes: lista };
}

/**
 * A responsável pela avaliação, do cadastro de profissionais, pelo nome que
 * a clínica cadastrou ("Dra. Mariane" acha "Dra. Mariane Botti").
 */
export async function responsavelDoCadastro(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  ownerId: string,
  nome: string | null | undefined,
): Promise<ProfissionalDaEdicao | null> {
  const chave = String(nome ?? "")
    .replace(/^(dra?\.?|dr\.?)\s+/i, "")
    .trim()
    .split(/\s+/)[0];
  if (!chave) return null;
  const { data, error } = await supabase
    .from("professionals")
    .select("name, registration_number, specialties, specialty")
    .eq("owner_id", ownerId)
    .eq("active", true)
    .ilike("name", `%${chave}%`)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const esp = Array.isArray(data.specialties) ? data.specialties.map(String).filter(Boolean) : [];
  if (!esp.length && data.specialty) esp.push(String(data.specialty));
  return {
    nome: String(data.name),
    registro: data.registration_number ? String(data.registration_number) : null,
    especialidades: esp,
  };
}
