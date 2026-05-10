import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
} from "react-native";
import { cn } from "@/shared/lib/cn";
import { colors } from "@/design-tokens/colors";

const buttonVariants = cva(
  "flex-row items-center justify-center rounded-lg min-h-touch",
  {
    variants: {
      variant: {
        primary: "bg-primary",
        secondary: "bg-secondary",
        destructive: "bg-destructive",
        ghost: "bg-transparent",
      },
      size: {
        default: "px-6 py-3",
        sm: "px-4 py-2",
        lg: "px-8 py-4",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
);

type ButtonProps = PressableProps &
  VariantProps<typeof buttonVariants> & {
    children: ReactNode;
    loading?: boolean;
  };

export function Button({
  variant,
  size,
  loading,
  disabled,
  children,
  className,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      className={cn(
        buttonVariants({ variant, size }),
        isDisabled && "opacity-50",
        className
      )}
      disabled={isDisabled}
      {...props}
    >
      {loading ? (
        <ActivityIndicator
          color={
            variant === "primary" || variant === "destructive"
              ? colors.primary.foreground
              : colors.foreground
          }
        />
      ) : (
        children
      )}
    </Pressable>
  );
}
