import { View, Text, type ViewProps } from "react-native";
import { cn } from "@/lib/utils";

type BadgeVariant = "active" | "delayed" | "completed" | "draft" | "final";

interface BadgeProps extends ViewProps {
  variant?: BadgeVariant;
  className?: string;
  children: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  active: "border-emerald-700 bg-emerald-50",
  delayed: "border-amber-700 bg-amber-50",
  completed: "border-muted-foreground bg-secondary",
  draft: "border-amber-700 bg-amber-50",
  final: "border-emerald-700 bg-emerald-50",
};

const variantTextStyles: Record<BadgeVariant, string> = {
  active: "text-emerald-700",
  delayed: "text-amber-700",
  completed: "text-muted-foreground",
  draft: "text-amber-700",
  final: "text-emerald-700",
};

export function Badge({
  variant = "active",
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <View
      className={cn(
        "border px-2.5 py-0.5",
        variantStyles[variant],
        className
      )}
      {...props}
    >
      <Text
        className={cn("text-sm font-semibold uppercase tracking-wider", variantTextStyles[variant])}
      >
        {children}
      </Text>
    </View>
  );
}
