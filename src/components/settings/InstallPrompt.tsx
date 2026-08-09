import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isIos, isStandalone } from "@/lib/pwa/service-worker";

// O evento não está nos tipos padrão do DOM — é uma extensão do Chromium.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Botão nativo de instalar. Só existe no Chromium (Android e desktop): o
 * Safari não dispara `beforeinstallprompt`, e no iPhone o caminho é manual —
 * por isso o passo a passo do iOS mora no PushSettingsCard, não aqui.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      return;
    }

    const onPrompt = (event: Event) => {
      // Sem o preventDefault o Chrome mostra o próprio banner e o evento se
      // perde — guardá-lo é o que permite oferecer a instalação no momento
      // certo, aqui dentro das configurações.
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Instalado, ou iPhone (onde o passo a passo já é mostrado no card de
  // push), ou navegador que não oferece instalação: nada a mostrar.
  if (installed || isIos() || !deferred) return null;

  return (
    <div className="surface-card mt-4 flex flex-wrap items-center justify-between gap-3 p-5">
      <div className="min-w-0">
        <h3 className="font-semibold">Instalar o app</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Abre em tela cheia, sem barra do navegador, e fica com ícone próprio no celular.
        </p>
      </div>
      <Button
        className="gap-2 bg-gradient-primary text-white"
        onClick={async () => {
          await deferred.prompt();
          const { outcome } = await deferred.userChoice;
          // O evento é de uso único: depois de disparado, o navegador só
          // manda outro numa visita futura.
          if (outcome === "accepted") setInstalled(true);
          setDeferred(null);
        }}
      >
        <Download className="h-4 w-4" />
        Instalar
      </Button>
    </div>
  );
}
