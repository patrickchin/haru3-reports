import { Text, View } from "react-native";
import { cn } from "@/shared/lib/cn";

type EmptyStateProps = {
  title: string;
  message?: string;
  className?: string;
  testID?: string;
};

export function EmptyState({ title, message, className, testID }: EmptyStateProps) {
  return (
    <View
      className={cn(
        "flex-1 items-center justify-center px-6 py-12",
        className
      )}
      testID={testID}
    >
      <Text className="text-title-sm text-foreground mb-2">{title}</Text>
      {message && (
        <Text className="text-body text-muted-foreground text-center">
          {message}
        </Text>
      )}
    </View>
  );
}
