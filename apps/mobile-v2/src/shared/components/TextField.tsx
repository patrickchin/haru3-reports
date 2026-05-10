import type { ReactNode } from "react";
import { Text, TextInput, View, type TextInputProps } from "react-native";
import { cn } from "@/shared/lib/cn";
import { colors } from "@/design-tokens/colors";

type TextFieldProps = TextInputProps & {
  label?: string;
  error?: string;
};

export function TextField({
  label,
  error,
  className,
  ...props
}: TextFieldProps) {
  return (
    <View className="gap-1.5">
      {label && (
        <Text className="text-label text-muted-foreground uppercase">
          {label}
        </Text>
      )}
      <TextInput
        className={cn(
          "min-h-touch rounded-lg border border-input bg-card px-4 text-body text-foreground",
          error && "border-destructive",
          className
        )}
        placeholderTextColor={colors.muted.disabled}
        {...props}
      />
      {error && (
        <Text className="text-body text-destructive">{error}</Text>
      )}
    </View>
  );
}
