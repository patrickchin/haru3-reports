import { type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { ArrowLeft } from "lucide-react-native";
import { cn } from "@/lib/utils";

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  backLabel?: string;
  onBack?: () => void;
  trailing?: ReactNode;
  titleAccessory?: ReactNode;
  className?: string;
}

export function ScreenHeader({
  title,
  subtitle,
  eyebrow,
  backLabel = "Back",
  onBack,
  trailing,
  titleAccessory,
  className,
}: ScreenHeaderProps) {
  return (
    <View className={cn("gap-4", className)}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          className="h-touch self-start rounded-md border border-border bg-card px-4 active:opacity-80"
          accessibilityRole="button"
        >
          <View className="h-full flex-row items-center gap-2">
            <ArrowLeft size={16} color="#1a1a2e" />
            <Text
              className="text-sm font-semibold text-foreground"
              style={{ lineHeight: 16, includeFontPadding: false }}
            >
              {backLabel}
            </Text>
          </View>
        </Pressable>
      ) : null}

      <View className="flex-row items-start justify-between gap-4">
        <View className="flex-1 gap-1.5">
          {eyebrow ? (
            <Text className="text-label text-muted-foreground">{eyebrow}</Text>
          ) : null}
          <View className="flex-row flex-wrap items-center gap-2">
            <Text className="flex-shrink text-display text-foreground">{title}</Text>
            {titleAccessory}
          </View>
          {subtitle ? (
            <Text className="text-body text-muted-foreground">{subtitle}</Text>
          ) : null}
        </View>
        {trailing ? <View className="shrink-0">{trailing}</View> : null}
      </View>
    </View>
  );
}
