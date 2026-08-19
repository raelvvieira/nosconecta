import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// `:active` dispara no pointer-down — é o único jeito de o botão responder
// ao toque no instante do contato, e não só quando o dedo sai. O `hover:`
// que existia antes nunca acontece no celular, então até aqui ~209 botões
// não davam retorno nenhum ao dedo.
//
// A entrada é mais rápida (75ms, ease-out) que a volta (260ms, mola): o dedo
// chega de repente e sai devagar, e a assimetria é o que faz parecer físico.
// Afundar é resposta a um toque; voltar é o objeto assentando sozinho, e só a
// volta tem forma de mola.
//
// A transição lista as propriedades em vez de `all`: `all` inclui o que é
// layout, e aí cada quadro sai do compositor.
const buttonVariants = cva(
  "inline-flex touch-manipulation items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium cursor-pointer transition-[transform,background-color,border-color,color,box-shadow,opacity,filter] duration-[260ms] ease-spring active:duration-75 active:ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // `premium` é o nome que o projeto usa para a ação principal; `default`
        // aponta para ela em vez de repetir a string, que era o que fazia as
        // duas divergirem em silêncio quando uma era ajustada.
        premium:
          "bg-gradient-primary text-white shadow-2 hover:brightness-[1.03] hover:shadow-3 active:brightness-[0.97]",
        default:
          "bg-gradient-primary text-white shadow-2 hover:brightness-[1.03] hover:shadow-3 active:brightness-[0.97]",
        dark:
          "bg-foreground text-white hover:bg-foreground-hover active:bg-foreground-active",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80",
        outline:
          "border border-input bg-white text-foreground hover:bg-surface-subtle active:bg-border",
        secondary:
          "bg-white border border-input text-foreground hover:bg-surface-subtle active:bg-border",
        ghost:
          "text-foreground hover:bg-surface-subtle active:bg-border",
        link:
          "text-primary underline-offset-4 hover:underline active:opacity-70",
      },
      size: {
        default: "h-11 px-5",
        sm: "h-9 px-3.5 text-xs rounded-sm",
        lg: "h-12 px-6 text-base rounded-lg",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
