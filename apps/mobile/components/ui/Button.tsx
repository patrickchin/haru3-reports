import { Pressable, Text, type PressableProps } from "react-native";
import { cn } from "@/lib/utils";

type ButtonVariant = "default" | "destructive" | "outline" | "ghost" | "hero";
type ButtonSize = "default" | "sm" | "lg" | "xl" | "icon";

interface ButtonProps extends PressableProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  textClassName?: string;
  children: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  default: "bg-primary active:opacity-80",
  destructive: "bg-destructive active:opacity-80",
  outline: "border border-border bg-transparent active:bg-secondary",
  ghost: "bg-transparent active:bg-secondary",
  hero: "bg-primary border-2 border-foreground active:opacity-80",
};

const variantTextStyles: Record<ButtonVariant, string> = {
  default: "text-primary-foreground font-semibold uppercase tracking-wider",
  destructive: "text-destructive-foreground font-semibold uppercase tracking-wider",
  outline: "text-foreground font-semibold",
  ghost: "text-foreground font-semibold",
  hero: "text-primary-foreground font-semibold uppercase tracking-wider",
};

const sizeStyles: Record<ButtonSize, string> = {
  default: "h-11 px-5",
  sm: "h-9 px-3",
  lg: "h-12 px-6",
  xl: "h-14 px-6",
  icon: "h-11 w-11 items-center justify-center",
};

const sizeTextStyles: Record<ButtonSize, string> = {
  default: "text-lg",
  sm: "text-base",
  lg: "text-lg",
  xl: "text-lg",
  icon: "text-lg",
};

export function Button({
  variant = "default",
  size = "default",
  className,
  textClassName,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <Pressable
      className={cn(
        "flex-row items-center justify-center",
        variantStyles[variant],
        sizeStyles[size],
        disabled && "opacity-50",
        className
      )}
      disabled={disabled}
      {...props}
    >
      {typeof children === "string" ? (
        <Text
          className={cn(
            variantTextStyles[variant],
            sizeTextStyles[size],
            textClassName
          )}
        >
          {children}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  );
}
