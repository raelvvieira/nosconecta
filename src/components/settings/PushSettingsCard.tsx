import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Send, Share, Smartphone, SquarePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { InstallPrompt } from "@/components/settings/InstallPrompt";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { usePushNotifications } from "@/lib/pwa/usePushNotifications";
import {
  deletePushSubscription,
  getPushPreferences,
  listPushDevices,
  savePushPreferences,
  sendTestPush,
  PUSH_TYPES,
  PUSH_TYPE_LABEL,
  type PushPreferences,
  type PushType,
} from "@/lib/notifications/push.functions";

export function PushSettingsCard() {
  const queryClient = useQueryClient();
  const fetchPreferences = useServerFn(getPushPreferences);
  const fetchDevices = useServerFn(listPushDevices);
  const savePreferences = useServerFn(savePushPreferences);
  const removeDevice = useServerFn(deletePushSubscription);
  const test = useServerFn(sendTestPush);

  const push = usePushNotifications();

  const preferences = useQuery({
    queryKey: ["push-preferences"],
    queryFn: () => fetchPreferences(),
    staleTime: 15_000,
  });
  const devices = useQuery({
    queryKey: ["push-devices"],
    queryFn: () => fetchDevices(),
    staleTime: 15_000,
  });

  const toggle = useMutation({
    mutationFn: (patch: Partial<PushPreferences>) => savePreferences({ data: patch }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["push-preferences"] }),
    onError: (error: Error) => toast.error(error.message),
  });

  const forget = useMutation({
    mutationFn: (id: string) => removeDevice({ data: { id } }),
    onSuccess: () => {
      toast.success("Aparelho removido");
      queryClient.invalidateQueries({ queryKey: ["push-devices"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const testMutation = useMutation({
    mutationFn: () => test({}),
    onSuccess: () => toast.success("Enviada — confira o celular."),
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">Notificações no celular</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Avisos para a equipe da clínica, direto no aparelho — diferente dos canais acima, que vão
        para o paciente.
      </p>

      <InstallPrompt />

      <div className="surface-card mt-4 p-5 sm:p-6">
        {/* iPhone: sem o app na tela de início a API de push nem existe.
            Explicar o caminho é a única coisa útil a fazer aqui. */}
        {push.needsInstallFirst ? (
          <div className="flex gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-coral-soft text-coral">
              <Smartphone className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h3 className="font-semibold">Instale o app primeiro</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                No iPhone, notificações só funcionam com o NÓS Conecta na tela de início.
              </p>
              <ol className="mt-3 space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <Share className="h-4 w-4 shrink-0 text-pink" />
                  Toque em <strong>Compartilhar</strong> na barra do Safari
                </li>
                <li className="flex items-center gap-2">
                  <SquarePlus className="h-4 w-4 shrink-0 text-pink" />
                  Escolha <strong>Adicionar à Tela de Início</strong>
                </li>
                <li className="flex items-center gap-2">
                  <BellRing className="h-4 w-4 shrink-0 text-pink" />
                  Abra o app pelo ícone e volte aqui para ativar
                </li>
              </ol>
            </div>
          </div>
        ) : push.permission === "unsupported" ? (
          <p className="text-sm text-muted-foreground">
            Este navegador não suporta notificações. Abra o app no celular para ativar.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold">
                  {push.subscribed ? "Ativado neste aparelho" : "Ativar neste aparelho"}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {push.permission === "denied"
                    ? "Permissão bloqueada — libere as notificações nos ajustes do navegador."
                    : push.subscribed
                      ? "Você recebe os avisos marcados abaixo."
                      : "O navegador vai pedir permissão."}
                </p>
              </div>
              <div className="flex gap-2">
                {push.subscribed ? (
                  <>
                    <Button
                      variant="outline"
                      className="gap-2"
                      disabled={testMutation.isPending}
                      onClick={() => testMutation.mutate()}
                    >
                      <Send className="h-4 w-4" />
                      Testar
                    </Button>
                    <Button variant="outline" disabled={push.busy} onClick={push.unsubscribe}>
                      Desativar
                    </Button>
                  </>
                ) : (
                  <Button
                    className="gap-2 bg-gradient-primary text-white"
                    disabled={push.busy || push.permission === "denied" || !push.hasServerKeys}
                    onClick={push.subscribe}
                  >
                    <BellRing className="h-4 w-4" />
                    Ativar
                  </Button>
                )}
              </div>
            </div>

            {!push.hasServerKeys && (
              <p className="mt-3 rounded-2xl bg-coral-soft px-4 py-3 text-xs text-foreground/80">
                As chaves VAPID ainda não foram cadastradas no servidor. Sem elas o navegador não
                consegue criar a inscrição.
              </p>
            )}
          </>
        )}
      </div>

      {/* Preferências valem para a clínica inteira, não só para este
          aparelho — por isso ficam fora do bloco acima. */}
      <div className="surface-card mt-4 divide-y divide-border overflow-hidden">
        {PUSH_TYPES.map((type: PushType) => {
          const meta = PUSH_TYPE_LABEL[type];
          const enabled = preferences.data?.[type] ?? true;
          return (
            <label
              key={type}
              className="flex cursor-pointer items-center justify-between gap-4 px-4 py-4 sm:px-5"
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium">{meta.title}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {meta.description}
                </span>
              </span>
              <Switch
                checked={enabled}
                disabled={toggle.isPending}
                onCheckedChange={(checked) => toggle.mutate({ [type]: checked })}
              />
            </label>
          );
        })}
      </div>

      {Boolean(devices.data?.length) && (
        <div className="surface-card mt-4 divide-y divide-border overflow-hidden">
          {(devices.data ?? []).map((device) => (
            <div key={device.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <Smartphone className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{describeDevice(device.userAgent)}</p>
                <p className="text-2xs text-muted-foreground">
                  Ativo desde {new Date(device.createdAt).toLocaleDateString("pt-BR")}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className={cn("h-8 w-8 text-danger")}
                aria-label="Remover aparelho"
                onClick={() => forget.mutate(device.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** User agent cru não diz nada a ninguém; isso vira "iPhone", "Android"... */
function describeDevice(userAgent: string | null) {
  if (!userAgent) return "Aparelho";
  if (/iphone/i.test(userAgent)) return "iPhone";
  if (/ipad/i.test(userAgent)) return "iPad";
  if (/android/i.test(userAgent)) return "Android";
  if (/macintosh/i.test(userAgent)) return "Mac";
  if (/windows/i.test(userAgent)) return "Windows";
  return "Aparelho";
}
