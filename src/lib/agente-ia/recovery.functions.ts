import { createServerFn } from "@tanstack/react-start";
import { exigeAgenteIa } from "@/lib/auth/area.middleware";
import { configDaTela, normalizarConfig, type ConfigDeRecuperacao } from "./recovery";

/**
 * A configuração do Recovery Engine, como a tela edita.
 *
 * Sem nada salvo, devolve os presets DESLIGADOS: a tela mostra a cadência
 * proposta, e nada roda até alguém ligar.
 */
export const getRecovery = createServerFn({ method: "GET" })
  .middleware([exigeAgenteIa])
  .handler(
    async ({
      context,
    }): Promise<{
      config: ConfigDeRecuperacao;
      followupAntigo: boolean;
      diasAbertos: number[];
    }> => {
      const supabase: any = context.supabase; // eslint-disable-line @typescript-eslint/no-explicit-any
      const { data: agente } = await supabase
        .from("ai_agents")
        .select("recovery_config, followup_ligado")
        .eq("owner_id", context.ownerId)
        .maybeSingle();
      if (!agente) throw new Error("O agente ainda não existe. Abra a página do agente uma vez.");
      // Os dias em que o consultório atende: a prévia da tela calcula o
      // calendário com eles, igual ao motor.
      const { data: jornada } = await supabase
        .from("clinic_business_hours")
        .select("weekday, modo")
        .eq("owner_id", context.ownerId);
      const dias = new Set<number>();
      for (const j of (jornada ?? []) as { weekday: number; modo: string }[]) {
        if (j.modo !== "sob_consulta") dias.add(Number(j.weekday));
      }
      return {
        config: configDaTela(agente.recovery_config),
        followupAntigo: agente.followup_ligado === true,
        diasAbertos: [...dias].sort(),
      };
    },
  );

/**
 * Grava a configuração inteira.
 *
 * Passa pelo mesmo `normalizarConfig` que o motor usa para ler: o que a tela
 * grava é exatamente o que o motor entende, e valor torto (minuto negativo,
 * janela invertida) é corrigido aqui em vez de virar comportamento estranho
 * de madrugada.
 *
 * Ligar marca a hora (`ligadoDesde`): o motor só age em silêncio que começar
 * depois disso, então ligar não acorda conversa antiga. E ligar o motor novo
 * DESLIGA o follow-up antigo: os dois juntos mandariam duas retomadas para a
 * mesma pessoa.
 */
export const salvarRecovery = createServerFn({ method: "POST" })
  .middleware([exigeAgenteIa])
  .inputValidator((input: { config: ConfigDeRecuperacao }) => {
    if (!normalizarConfig(input?.config)) throw new Error("Configuração inválida.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase; // eslint-disable-line @typescript-eslint/no-explicit-any
    const { data: agente } = await supabase
      .from("ai_agents")
      .select("id, recovery_config")
      .eq("owner_id", context.ownerId)
      .maybeSingle();
    if (!agente) throw new Error("O agente ainda não existe.");

    const antes = normalizarConfig(agente.recovery_config);
    const nova = normalizarConfig(data.config)!;
    const ligando = nova.ligado && !antes?.ligado;
    nova.ligadoDesde = nova.ligado
      ? ligando
        ? new Date().toISOString()
        : (antes?.ligadoDesde ?? new Date().toISOString())
      : null;

    const campos: Record<string, unknown> = {
      recovery_config: nova,
      updated_at: new Date().toISOString(),
    };
    if (ligando) {
      campos.followup_ligado = false;
      campos.followup_ligado_desde = null;
    }
    const { error } = await supabase.from("ai_agents").update(campos).eq("id", agente.id);
    if (error) throw new Error(error.message);

    // Desligar acaba com as sequências em andamento: "desligado" tem de calar
    // agora, não daqui a cinco horas, quando a última etapa vencer.
    if (!nova.ligado && antes?.ligado) {
      await supabase
        .from("ai_agent_sessions")
        .update({
          recovery_status: "cancelada",
          recovery_motivo: "recovery desligado",
          recovery_proximo_em: null,
        })
        .eq("agent_id", agente.id)
        .in("recovery_status", ["ativa", "enviando"]);
    }
    return { ok: true };
  });
