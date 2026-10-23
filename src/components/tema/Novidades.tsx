import { useEffect, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { proximaNovidade, type Novidade } from "@/lib/novidades";
import { aplicarTema, temaGuardado, temaValido } from "@/lib/tema/temas";
import { EscolhaDeTema } from "./EscolhaDeTema";

/** Telas que não são o sistema: o paciente do Club e quem ainda está entrando
 *  não recebem aviso de atualização da equipe. */
const FORA = ["/club", "/auth", "/convite"];

/**
 * O pop-up de novidades, e a cor da conta aplicada ao entrar.
 *
 * As duas coisas leem a mesma resposta (`getUser`) no mesmo instante — logo
 * depois do login —, por isso moram juntas.
 */
export function Novidades() {
  const { pathname } = useLocation();
  const [novidade, setNovidade] = useState<Novidade | null>(null);
  const fora = FORA.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  // Pinta com a cor guardada no navegador já na primeira passada.
  useEffect(() => {
    aplicarTema(temaGuardado());
  }, []);

  useEffect(() => {
    if (fora) return;
    let vivo = true;

    const conferir = async () => {
      const { data } = await supabase.auth.getUser();
      const usuario = data.user;
      if (!usuario || !vivo) return;
      const meta = usuario.user_metadata ?? {};
      if (meta.tema) aplicarTema(temaValido(meta.tema));

      const vistas: string[] = Array.isArray(meta.novidades_vistas) ? meta.novidades_vistas : [];
      const proxima = proximaNovidade(vistas);
      if (!proxima) return;
      setNovidade(proxima);
      // Marca como vista ao ABRIR, não ao fechar: quem recarrega a página com
      // o pop-up aberto não deve recebê-lo de novo. "Só uma vez" é isso.
      await supabase.auth.updateUser({
        data: { novidades_vistas: [...vistas, proxima.id] },
      });
    };

    conferir();
    const { data: sub } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === "SIGNED_IN") conferir();
    });
    return () => {
      vivo = false;
      sub.subscription.unsubscribe();
    };
  }, [fora]);

  if (fora || !novidade) return null;

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && setNovidade(null)}>
      <DialogContent className="max-w-[440px] gap-0 rounded-[28px] border-0 p-0 shadow-[0_40px_80px_-30px_rgba(20,16,30,0.45)]">
        <div className="px-7 pb-2 pt-9 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gradient-primary text-white shadow-brand">
            <Sparkles className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <p className="mt-5 text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Novidade
          </p>
          <DialogTitle className="mt-1.5 text-[1.375rem] font-semibold tracking-tight">
            {novidade.titulo}
          </DialogTitle>
          <DialogDescription className="mx-auto mt-2 max-w-[320px] text-sm leading-6 text-muted-foreground">
            {novidade.texto}
          </DialogDescription>
        </div>

        {novidade.extra === "temas" && (
          <div className="px-6 pt-4">
            <EscolhaDeTema compacta />
          </div>
        )}

        <div className="px-7 pb-7 pt-5 text-center">
          {novidade.ondeFica && (
            <p className="text-xs leading-5 text-muted-foreground">{novidade.ondeFica}</p>
          )}
          <Button
            variant="premium"
            className="mt-4 h-11 w-full rounded-2xl"
            onClick={() => setNovidade(null)}
          >
            Pronto
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
