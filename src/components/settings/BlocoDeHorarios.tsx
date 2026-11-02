import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { HorariosDaSemana } from "@/components/settings/HorariosDaSemana";
import {
  getHorarios,
  salvarHorarios,
  type HorariosDaUnidade,
} from "@/lib/settings/horarios.functions";

/** O horário de cada unidade ativa, com um botão de salvar por unidade. */
export function BlocoDeHorarios({ semBotao = false }: { semBotao?: boolean }) {
  const buscar = useServerFn(getHorarios);
  const query = useQuery({ queryKey: ["horarios-das-unidades"], queryFn: () => buscar() });
  if (!query.data) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (!query.data.length)
    return <p className="text-sm text-muted-foreground">Cadastre uma unidade primeiro.</p>;
  return (
    <div className="grid gap-5">
      {query.data.map((u) => (
        <UnidadeDaSemana
          key={u.unitId}
          u={u}
          mostrarNome={query.data.length > 1}
          semBotao={semBotao}
        />
      ))}
    </div>
  );
}

function UnidadeDaSemana({
  u,
  mostrarNome,
  semBotao,
}: {
  u: HorariosDaUnidade;
  mostrarNome: boolean;
  semBotao: boolean;
}) {
  const queryClient = useQueryClient();
  const salvar = useServerFn(salvarHorarios);
  const [dias, setDias] = useState(u.dias);
  const [mudou, setMudou] = useState(false);
  useEffect(() => setDias(u.dias), [u.dias]);
  const gravar = useMutation({
    mutationFn: () => salvar({ data: { unitId: u.unitId, dias } }),
    onSuccess: () => {
      setMudou(false);
      queryClient.invalidateQueries({ queryKey: ["horarios-das-unidades"] });
      if (!semBotao) toast.success(`Horários de ${u.nome} salvos.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  // No onboarding o "Continuar" grava; aqui a semana se salva sozinha ao mudar.
  useEffect(() => {
    if (!semBotao || !mudou) return;
    const t = setTimeout(() => gravar.mutate(), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dias, mudou, semBotao]);
  return (
    <div className="grid gap-2">
      {mostrarNome && <p className="text-sm font-semibold">{u.nome}</p>}
      <HorariosDaSemana
        dias={dias}
        onMudar={(d) => {
          setDias(d);
          setMudou(true);
        }}
      />
      {!semBotao && (
        <Button
          variant="outline"
          size="sm"
          className="justify-self-end"
          disabled={!mudou || gravar.isPending}
          onClick={() => gravar.mutate()}
        >
          Salvar horários
        </Button>
      )}
    </div>
  );
}
