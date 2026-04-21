import { type ReactNode } from "react";
import { Text, View } from "react-native";
import { ArrowLeft } from "lucide-react-native";
import { cn } from "@/lib/utils";
import { AppHeaderActions } from "@/components/ui/AppHeaderActions";
import { Button } from "@/components/ui/Button";

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
  const hasTopRow = Boolean(onBack);
  const hasSupportingText = Boolean(eyebrow || subtitle);

  return (
    <View className={cn("gap-3", className)}>
      {hasTopRow ? (
        <View className="min-h-touch flex-row items-center justify-between gap-3">
          <Button
            onPress={onBack}
            variant="outline"
            size="default"
            className="self-start px-4"
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
          </Button>
          <AppHeaderActions />
        </View>
      ) : null}

      <View
        className={cn(
          "flex-row justify-between gap-4",
          hasSupportingText ? "items-start" : "items-center"
        )}
      >
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
        <View className="shrink-0 flex-row items-center gap-2">
          {trailing ? <View>{trailing}</View> : null}
          {!hasTopRow ? <AppHeaderActions /> : null}
        </View>
      </View>
    </View>
  );
}
