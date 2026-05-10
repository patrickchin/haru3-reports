import { ActivityIndicator, View } from "react-native";
import { colors } from "@/design-tokens/colors";
import { cn } from "@/shared/lib/cn";

type LoadingDotsProps = {
  className?: string;
};

export function LoadingDots({ className }: LoadingDotsProps) {
  return (
    <View
      className={cn("flex-1 items-center justify-center", className)}
    >
      <ActivityIndicator size="large" color={colors.primary.DEFAULT} />
    </View>
  );
}
