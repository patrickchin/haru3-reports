import { View, type ViewProps } from "react-native";
import { cn } from "@/lib/utils";
import { SurfaceTexture, type SurfaceTextureTone } from "@/components/ui/SurfaceTexture";

type CardVariant = "default" | "muted" | "emphasis" | "danger";
type CardPadding = "sm" | "md" | "lg";

interface CardProps extends ViewProps {
  className?: string;
  variant?: CardVariant;
  padding?: CardPadding;
}

const variantStyles: Record<CardVariant, string> = {
  default: "border-border bg-card",
  muted: "border-border bg-surface-muted",
  emphasis: "border-foreground/10 bg-surface-emphasis",
  danger: "border-danger-border bg-danger-soft",
};

const textureTones: Record<CardVariant, SurfaceTextureTone> = {
  default: "default",
  muted: "muted",
  emphasis: "emphasis",
  danger: "danger",
};

const paddingStyles: Record<CardPadding, string> = {
  sm: "p-3",
  md: "p-4",
  lg: "p-5",
};

export function Card({
  className,
  variant = "default",
  padding = "md",
  children,
  ...props
}: CardProps) {
  return (
    <View
      className={cn(
        "overflow-hidden rounded-lg border",
        variantStyles[variant],
        paddingStyles[padding],
        className
      )}
      {...props}
    >
      <SurfaceTexture tone={textureTones[variant]} />
      {children}
    </View>
  );
}
