import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { MobileFabProvider } from "@/components/finance/mobile-fab-context";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { supabase } from "@/integrations/supabase/client";
import { registerServiceWorker } from "@/lib/pwa/service-worker";
import { MembershipGate } from "@/components/auth/MembershipGate";
import { Novidades } from "@/components/tema/Novidades";
import { TEMAS, TEMA_PADRAO } from "@/lib/tema/temas";
import { UnitProvider } from "@/lib/settings/unit-context";

function NotFoundComponent() {
  return <ResponsiveRouteState title="Página não encontrada" notFound />;
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <ResponsiveRouteState
      title="Esta página não carregou"
      description="Algo deu errado. Tente novamente ou volte ao início para continuar."
      onRetry={() => {
        router.invalidate();
        reset();
      }}
    />
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        // viewport-fit=cover é o que faz env(safe-area-inset-*) reportar
        // valores reais no iOS. Sem ele o app instalado passa por baixo do
        // notch e da barra de gestos.
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      { title: "Nós Conecta" },
      { name: "description", content: "Sistema de gestão financeira para clínicas odontológicas." },
      { name: "author", content: "NÓS Conecta" },
      { property: "og:title", content: "Nós Conecta" },
      {
        property: "og:description",
        content: "Sistema de gestão financeira para clínicas odontológicas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Nós Conecta" },
      {
        name: "twitter:description",
        content: "Sistema de gestão financeira para clínicas odontológicas.",
      },
      {
        property: "og:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/f8a90e44-aa95-437f-9ffc-a812fd85284b/id-preview-07a4c3cc--d99d44d3-aac2-4003-ad96-b3d585719075.lovable.app-1781664690838.png",
      },
      {
        name: "twitter:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/f8a90e44-aa95-437f-9ffc-a812fd85284b/id-preview-07a4c3cc--d99d44d3-aac2-4003-ad96-b3d585719075.lovable.app-1781664690838.png",
      },
      // Literal, e não `var(--coral)`: meta tag não resolve variável de CSS —
      // o navegador recebia a string crua e a barra de status ficava sem cor.
      { name: "theme-color", content: "#FF7A59" },
      { name: "application-name", content: "NÓS Conecta" },
      // O iOS ignora o manifest para decidir se abre em tela cheia; quem
      // manda são estas duas.
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: "NÓS Conecta" },
      { name: "mobile-web-app-capable", content: "yes" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

// Pinta o tema guardado ANTES da primeira pintura, em toda página — a tela de
// login inclusive. Antes a cor só entrava depois de o React montar, e por
// dentro do AuthGate: o login abria no rosa padrão mesmo com outro tema
// escolhido. Os ids repetem `TEMAS` (lib/tema/temas.ts) porque este script
// roda antes de qualquer módulo carregar.
const TEMA_ANTES_DA_PINTURA = `try{var t=localStorage.getItem("nos:tema");if(${JSON.stringify(
  TEMAS.map((t) => t.id).filter((id) => id !== TEMA_PADRAO),
)}.indexOf(t)>-1)document.documentElement.dataset.tema=t}catch(e){}`;

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: TEMA_ANTES_DA_PINTURA }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    registerServiceWorker();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthGate>
        <MembershipGate>
          <UnitProvider>
            <MobileFabProvider>
              <Outlet />
              <Novidades />
            </MobileFabProvider>
          </UnitProvider>
        </MembershipGate>
      </AuthGate>
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}

/**
 * Estamos no endereço do cartão?
 *
 * A regra é a primeira parte do domínio ser `club` — uma convenção que a
 * clínica controla pelo DNS, sem nada para configurar no sistema. Serve para
 * o cartão poder trazer só `club.suaclinica.com.br`, sem caminho depois.
 *
 * Fora do navegador (prerender) devolve `false`: ali não há domínio nenhum, e
 * o desvio é de interface.
 */
function ehDominioDoClube(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.hostname.toLowerCase().split(".")[0] === "club";
}

function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setAuthed(!!data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthed(!!session);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    // No endereço do cartão, a raiz é a área do paciente — com ou sem sessão.
    if (pathname === "/" && ehDominioDoClube()) {
      router.navigate({ to: "/club", replace: true });
      return;
    }
    const isAuthRoute = pathname.startsWith("/auth");
    // /convite é pública como /auth: quem abre o link ainda não tem conta. E,
    // ao contrário de /auth, ela NÃO redireciona para /inicio quando já há
    // sessão — a própria página trata o caso de quem já está logado (ver
    // `convite.$token.tsx`).
    // `/club` é a área do PACIENTE, aberta pelo QR Code do cartão: quem chega
    // ali normalmente não tem sessão nenhuma, e mandá-lo para o login da
    // equipe seria o fim do passeio.
    // `/comecar` é o "Testar grátis" da página de vendas: quem chega ali ainda
    // não tem conta.
    const isPublicRoute =
      isAuthRoute ||
      pathname.startsWith("/convite") ||
      pathname.startsWith("/club") ||
      pathname.startsWith("/comecar");
    if (!authed && !isPublicRoute) {
      router.navigate({
        to: "/auth",
        search: { redirect: pathname === "/" ? "/inicio" : pathname },
        replace: true,
      });
    }
    if (authed && isAuthRoute) {
      router.navigate({ to: "/inicio", replace: true });
    }
    if (authed && pathname === "/") {
      router.navigate({ to: "/inicio", replace: true });
    }
  }, [ready, authed, pathname, router]);

  if (!ready) {
    return (
      <div className="min-h-dvh w-full bg-surface-subtle grid place-items-center">
        <div className="h-8 w-8 rounded-full border-2 border-coral border-t-transparent animate-spin" />
      </div>
    );
  }
  const isPublicRoute =
    pathname.startsWith("/auth") ||
    pathname.startsWith("/convite") ||
    pathname.startsWith("/club") ||
    pathname.startsWith("/comecar") ||
    (pathname === "/" && ehDominioDoClube());
  if (!authed && !isPublicRoute) return null;
  return <>{children}</>;
}
