import { Pressable, Text, type PressableProps } from "react-native";
import { cn } from "@/lib/utils";

type ButtonVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "ghost"
  | "quiet"
  | "hero";
type ButtonSize = "default" | "sm" | "lg" | "xl" | "icon";

interface ButtonProps extends PressableProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  textClassName?: string;
  children: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  default: "border border-primary bg-primary active:opacity-85",
  secondary: "border border-border bg-secondary active:opacity-90",
  destructive: "border border-danger-border bg-danger-soft active:opacity-85",
  outline: "border border-border bg-card active:opacity-90",
  ghost: "bg-transparent active:bg-secondary",
  quiet: "bg-transparent active:bg-secondary",
  hero: "border border-primary bg-primary active:opacity-85",
};

const variantTextStyles: Record<ButtonVariant, string> = {
  default: "text-primary-foreground font-semibold",
  secondary: "text-foreground font-semibold",
  destructive: "text-danger-text font-semibold",
  outline: "text-foreground font-semibold",
  ghost: "text-foreground font-semibold",
  quiet: "text-muted-foreground font-semibold",
  hero: "text-primary-foreground font-semibold",
};

const sizeStyles: Record<ButtonSize, string> = {
  default: "min-h-touch px-4 py-3",
  sm: "min-h-10 px-3 py-2.5",
  lg: "min-h-touch px-5 py-3.5",
  xl: "min-h-touch-lg px-6 py-4",
  icon: "h-touch w-touch items-center justify-center",
};

const sizeTextStyles: Record<ButtonSize, string> = {
  default: "text-base",
  sm: "text-sm",
  lg: "text-base",
  xl: "text-lg",
  icon: "text-base",
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
        "flex-row items-center justify-center rounded-md",
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
