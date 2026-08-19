import * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";

import { cn } from "@/lib/utils";

// Gaveta inferior que se arrasta.
//
// Diferente do Sheet (Radix), que abre e fecha por animação fixa, esta segue o
// dedo: dá para puxar para baixo, soltar no meio, e a velocidade do gesto
// decide se ela fecha ou volta. É a mesma gaveta do iOS.
//
// O Sheet continua sendo o certo para as gavetas laterais do desktop — esta
// existe só para o `side="bottom"` do celular, onde o arraste é o gesto que a
// pessoa já espera.

const Drawer = ({
  // O padrão do shadcn é escalar o fundo enquanto a gaveta sobe, mas isso exige
  // um `data-vaul-drawer-wrapper` na raiz da árvore, e os layouts `h-dvh flex`
  // do app não sobrevivem a um div a mais no meio.
  shouldScaleBackground = false,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) => (
  <DrawerPrimitive.Root shouldScaleBackground={shouldScaleBackground} {...props} />
);
Drawer.displayName = "Drawer";

const DrawerTrigger = DrawerPrimitive.Trigger;

const DrawerPortal = DrawerPrimitive.Portal;

const DrawerClose = DrawerPrimitive.Close;

const DrawerOverlay = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Overlay
    ref={ref}
    // 30% em vez dos 80% do shadcn: a gaveta cobre no máximo 88% da tela, e um
    // véu quase preto faz o que sobra parecer desligado em vez de atrás.
    className={cn("fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]", className)}
    {...props}
  />
));
DrawerOverlay.displayName = DrawerPrimitive.Overlay.displayName;

interface DrawerContentProps
  extends React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content> {
  /** Esconde a alça quando o conteúdo já desenha a sua. */
  hideHandle?: boolean;
}

const DrawerContent = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Content>,
  DrawerContentProps
>(({ className, children, hideHandle = false, ...props }, ref) => (
  <DrawerPortal>
    <DrawerOverlay />
    <DrawerPrimitive.Content
      ref={ref}
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col rounded-t-3xl border-t border-border bg-card",
        "pb-[env(safe-area-inset-bottom)] outline-none",
        className,
      )}
      {...props}
    >
      {!hideHandle && (
        <DrawerPrimitive.Handle className="mx-auto my-3 !h-1.5 !w-10 shrink-0 !rounded-full !bg-border" />
      )}
      {/* O conteúdo rola aqui dentro. O vaul lê o scrollTop deste elemento para
          decidir entre arrastar a gaveta e rolar a lista: só arrasta quando a
          rolagem já está no topo, que é o que evita os dois gestos brigarem. */}
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain custom-scroll">
        {children}
      </div>
    </DrawerPrimitive.Content>
  </DrawerPortal>
));
DrawerContent.displayName = "DrawerContent";

const DrawerHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("grid gap-1.5 p-4 text-center sm:text-left", className)} {...props} />
);
DrawerHeader.displayName = "DrawerHeader";

const DrawerFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("mt-auto flex flex-col gap-2 p-4", className)} {...props} />
);
DrawerFooter.displayName = "DrawerFooter";

const DrawerTitle = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none", className)}
    {...props}
  />
));
DrawerTitle.displayName = DrawerPrimitive.Title.displayName;

const DrawerDescription = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DrawerDescription.displayName = DrawerPrimitive.Description.displayName;

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
};
