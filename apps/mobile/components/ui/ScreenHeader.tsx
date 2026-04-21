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
  backLabel,
  onBack,
  trailing,
  titleAccessory,
  className,
}: ScreenHeaderProps) {
  const hasSupportingRow = Boolean(eyebrow || subtitle || titleAccessory);

  return (
    <View className={cn("gap-3", className)}>
      <View className="min-h-touch flex-row items-center gap-3">
        {onBack ? (
          <Button
            onPress={onBack}
            variant="outline"
            size="default"
            className="shrink-0 px-3"
            accessibilityRole="button"
            accessibilityLabel={backLabel ? `Back to ${backLabel}` : "Back"}
          >
            <View className="h-full flex-row items-center gap-1.5">
              <ArrowLeft size={16} color="#1a1a2e" />
              {backLabel ? (
                <Text
                  className="text-sm font-semibold text-foreground"
                  style={{ lineHeight: 16, includeFontPadding: false }}
                >
                  {backLabel}
                </Text>
              ) : null}
            </View>
          </Button>
        ) : null}

        <Text
          className="min-w-0 flex-1 text-title-sm text-foreground"
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {title}
        </Text>

        <View className="shrink-0 flex-row items-center gap-2">
          {trailing ? <View>{trailing}</View> : null}
          <AppHeaderActions />
        </View>
      </View>

      {hasSupportingRow ? (
        <View className="gap-1">
          {eyebrow ? (
            <Text className="text-label text-muted-foreground">{eyebrow}</Text>
          ) : null}
          {subtitle ? (
            <Text className="text-body text-muted-foreground">{subtitle}</Text>
          ) : null}
          {titleAccessory ? <View>{titleAccessory}</View> : null}
        </View>
      ) : null}
    </View>
  );
}
