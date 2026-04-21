import { TextInput, View, Text, type TextInputProps } from "react-native";
import { cn } from "@/lib/utils";
import { getSurfaceDepthStyle } from "@/lib/surface-depth";

interface InputProps extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string | null;
  className?: string;
  containerClassName?: string;
}

export function Input({
  label,
  hint,
  error,
  className,
  containerClassName,
  editable = true,
  style,
  ...props
}: InputProps) {
  const isReadOnly = editable === false;

  return (
    <View className={cn("gap-2", containerClassName)}>
      {label && (
        <Text className="text-label text-muted-foreground">{label}</Text>
      )}
      <TextInput
        className={cn(
          "min-h-touch rounded-md border px-4 py-3 text-base text-foreground",
          isReadOnly ? "border-border bg-surface-muted text-muted-foreground" : "border-border bg-card",
          error ? "border-danger-border" : "",
          className
        )}
        style={[
          getSurfaceDepthStyle(isReadOnly ? "flat" : "raised"),
          { textAlignVertical: "center", paddingTop: 0, paddingBottom: 0 },
          style,
        ]}
        placeholderTextColor="#5c5c6e"
        editable={editable}
        {...props}
      />
      {error ? (
        <Text className="text-sm text-danger-text">{error}</Text>
      ) : hint ? (
        <Text className="text-sm text-muted-foreground">{hint}</Text>
      ) : null}
    </View>
  );
}
