import { Text, View } from "react-native";
import { cn } from "@/lib/utils";
import { SurfaceTexture, type SurfaceTextureTone } from "@/components/ui/SurfaceTexture";

type StatTileTone = "default" | "warning" | "danger" | "success";

interface StatTileProps {
  value: string | number;
  label: string;
  tone?: StatTileTone;
  compact?: boolean;
  className?: string;
}

const toneStyles: Record<StatTileTone, string> = {
  default: "border-border bg-card",
  warning: "border-warning-border bg-warning-soft",
  danger: "border-danger-border bg-danger-soft",
  success: "border-success-border bg-success-soft",
};

const textureTones: Record<StatTileTone, SurfaceTextureTone> = {
  default: "default",
  warning: "warning",
  danger: "danger",
  success: "success",
};

export function StatTile({
  value,
  label,
  tone = "default",
  compact = false,
  className,
}: StatTileProps) {
  return (
    <View
      className={cn(
        "min-h-[92px] flex-1 items-center justify-center overflow-hidden rounded-lg border px-3 py-3",
        toneStyles[tone],
        compact && "min-h-[82px]",
        className
      )}
    >
      <SurfaceTexture tone={textureTones[tone]} />
      <Text className="text-metric text-foreground">{value}</Text>
      <Text className="mt-1 text-label text-muted-foreground">{label}</Text>
    </View>
  );
}
