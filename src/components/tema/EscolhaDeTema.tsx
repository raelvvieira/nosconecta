import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { TEMAS, aplicarTema, temaGuardado, temaValido, type TemaId } from "@/lib/tema/temas";

/**
 * A grade de temas. A mesma peça na tela Aparência e no pop-up de novidades:
 * duas grades parecidas divergem na primeira vez que alguém mexe numa só.
 *
 * Trocar é imediato — a página muda de cor no toque, sem botão de salvar — e
 * a escolha vai para a conta em seguida. Se a gravação falhar, a cor fica
 * neste aparelho e a pessoa é avisada; não volta atrás sozinha.
 */
export function EscolhaDeTema({ compacta = false }: { compacta?: boolean }) {
  const [atual, setAtual] = useState<TemaId>(() => temaGuardado());

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const daConta = data.user?.user_metadata?.tema;
      if (daConta) setAtual(temaValido(daConta));
    });
  }, []);

  const escolher = async (id: TemaId) => {
    setAtual(id);
    aplicarTema(id);
    const { error } = await supabase.auth.updateUser({ data: { tema: id } });
    if (error) toast.error("O tema ficou só neste aparelho. Tente de novo para salvar na conta.");
  };

  return (
    <div className={cn("grid gap-2.5", compacta ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-3")}>
      {TEMAS.map((t) => {
        const ativo = t.id === atual;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => escolher(t.id)}
            aria-pressed={ativo}
            className={cn(
              "group flex flex-col items-center gap-2 rounded-2xl border bg-white px-2 py-3.5 text-center transition-[transform,box-shadow,border-color] duration-200 active:scale-[0.97]",
              ativo
                ? "border-transparent shadow-[0_0_0_2px_var(--foreground)]"
                : "border-border hover:shadow-2",
            )}
          >
            <span
              className="relative grid h-11 w-11 place-items-center rounded-full shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
              style={{
                background: `linear-gradient(135deg, ${t.degrade[0]} 0%, ${t.degrade[1]} 50%, ${t.degrade[2]} 100%)`,
              }}
            >
              {ativo && <Check className="h-4 w-4 text-white" strokeWidth={2.5} />}
            </span>
            <span className="text-sm font-semibold leading-none text-foreground">{t.nome}</span>
            {!compacta && (
              <span className="text-2xs leading-4 text-muted-foreground">{t.sobre}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
