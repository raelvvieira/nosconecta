import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Loader2, LogOut, ShieldAlert, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { getMembershipStatus, registerPendingMembership } from "@/lib/auth/membership.functions";

/**
 * Rotas que existem antes/fora de ter uma matrícula aprovada — nunca passam
 * pelo gate, mesmo autenticadas. `/auth` já é tratada pelo `AuthGate`; esta
 * lista cobre as que também precisam ficar de fora do `MembershipGate`.
 */
const MEMBERSHIP_EXEMPT_PREFIXES = ["/auth", "/cadastro-equipe"];

export function MembershipGate({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const exempt = MEMBERSHIP_EXEMPT_PREFIXES.some((p) => pathname.startsWith(p));

  if (exempt) return <>{children}</>;
  return <MembershipCheck>{children}</MembershipCheck>;
}

function MembershipCheck({ children }: { children: ReactNode }) {
  const fetchStatus = useServerFn(getMembershipStatus);
  const registerPending = useServerFn(registerPendingMembership);
  const [autoRegisterFailed, setAutoRegisterFailed] = useState(false);
  const attemptedAutoRegister = useRef(false);

  const query = useQuery({
    queryKey: ["membership-status"],
    queryFn: () => fetchStatus(),
    // Uma conta pendente pode virar aprovada a qualquer momento — sem
    // recarregar a página o usuário ficaria preso na tela de espera mesmo
    // depois de aprovado.
    refetchInterval: 15_000,
    retry: false,
  });

  // Confirmação de e-mail ligada: a sessão só chega no primeiro login, não
  // logo após o cadastro. É aqui, vendo `status === null` pela primeira vez,
  // que criamos a linha pendente que o `cadastro-equipe.tsx` não conseguiu
  // criar na hora — usando os dados que o próprio `signUp` guardou em
  // `user_metadata`.
  useEffect(() => {
    if (query.data !== null || query.isLoading || attemptedAutoRegister.current) return;
    attemptedAutoRegister.current = true;

    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const meta = userData.user?.user_metadata as
        | { full_name?: string; phone?: string; signup_source?: string }
        | undefined;
      if (meta?.signup_source !== "cadastro-equipe" || !userData.user?.email) {
        setAutoRegisterFailed(true);
        return;
      }
      try {
        await registerPending({
          data: { name: meta.full_name ?? "", email: userData.user.email, phone: meta.phone ?? null },
        });
        query.refetch();
      } catch {
        setAutoRegisterFailed(true);
      }
    })();
  }, [query.data, query.isLoading]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  }

  if (query.isLoading) {
    return <GateScreen icon={<Loader2 className="h-6 w-6 animate-spin" />} title="Carregando…" />;
  }

  if (query.isError) {
    return (
      <GateScreen
        icon={<ShieldAlert className="h-6 w-6 text-destructive" />}
        title="Não foi possível verificar seu acesso"
        description="Tente novamente em instantes."
        actions={
          <Button variant="premium" onClick={() => query.refetch()}>
            Tentar novamente
          </Button>
        }
        onSignOut={handleSignOut}
      />
    );
  }

  const status = query.data;

  if (status === undefined) {
    return <GateScreen icon={<Loader2 className="h-6 w-6 animate-spin" />} title="Carregando…" />;
  }

  if (status === null) {
    if (!autoRegisterFailed) {
      return <GateScreen icon={<Loader2 className="h-6 w-6 animate-spin" />} title="Concluindo seu cadastro…" />;
    }
    return (
      <GateScreen
        icon={<ShieldAlert className="h-6 w-6 text-destructive" />}
        title="Sua conta não está vinculada a nenhuma clínica"
        description="Se você tentou se cadastrar pelo link da equipe, peça para o administrador verificar. Se chegou aqui por engano, saia e use o link de cadastro correto."
        onSignOut={handleSignOut}
      />
    );
  }

  if (status.status === "pending") {
    return (
      <GateScreen
        icon={<Sparkles className="h-6 w-6 text-coral" />}
        title="Cadastro em análise"
        description={`${status.name ? `Olá, ${status.name}. ` : ""}Seu acesso foi enviado para aprovação. Assim que o administrador aprovar seu papel e sua unidade, esta tela libera sozinha.`}
        onSignOut={handleSignOut}
      />
    );
  }

  if (status.status === "rejected") {
    return (
      <GateScreen
        icon={<ShieldAlert className="h-6 w-6 text-destructive" />}
        title="Cadastro não aprovado"
        description="O administrador não aprovou seu acesso a esta clínica. Fale com ele se achar que isso é um engano."
        onSignOut={handleSignOut}
      />
    );
  }

  if (status.status === "disabled") {
    return (
      <GateScreen
        icon={<ShieldAlert className="h-6 w-6 text-destructive" />}
        title="Acesso desativado"
        description="Seu acesso a esta clínica foi desativado. Fale com o administrador se achar que isso é um engano."
        onSignOut={handleSignOut}
      />
    );
  }

  return <>{children}</>;
}

function GateScreen({
  icon,
  title,
  description,
  actions,
  onSignOut,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  actions?: ReactNode;
  onSignOut?: () => void;
}) {
  return (
    <div className="min-h-dvh w-full bg-surface-subtle grid place-items-center px-4">
      <div className="surface-card w-full max-w-[420px] p-8 text-center flex flex-col items-center gap-4">
        <div className="h-12 w-12 rounded-2xl bg-muted grid place-items-center">{icon}</div>
        <h1 className="text-lg font-semibold">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        {actions}
        {onSignOut ? (
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground mt-2" onClick={onSignOut}>
            <LogOut className="h-3.5 w-3.5" />
            Sair
          </Button>
        ) : null}
      </div>
    </div>
  );
}
