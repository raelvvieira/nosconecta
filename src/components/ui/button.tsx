import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// `:active` dispara no pointer-down — é o único jeito de o botão responder
// ao toque no instante do contato, e não só quando o dedo sai. O `hover:`
// que existia antes nunca acontece no celular, então até aqui ~209 botões
// não davam retorno nenhum ao dedo.
//
// A entrada é mais rápida (75ms) que a volta (200ms): o dedo chega de
// repente e sai devagar, e a assimetria é o que faz parecer físico.
const buttonVariants = cva(
  "inline-flex touch-manipulation items-center justify-center gap-2 whitespace-nowrap rounded-[14px] text-sm font-medium cursor-pointer transition-all duration-200 ease-out active:duration-75 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-primary text-white shadow-soft hover:opacity-95 active:opacity-90",
        premium:
          "bg-gradient-primary text-white shadow-soft hover:opacity-95 active:opacity-90",
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
        sm: "h-9 px-3.5 text-xs rounded-[12px]",
        lg: "h-12 px-6 text-base",
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
