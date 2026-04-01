import { TextInput, View, Text, type TextInputProps } from "react-native";
import { cn } from "@/lib/utils";

interface InputProps extends TextInputProps {
  label?: string;
  className?: string;
  containerClassName?: string;
}

export function Input({
  label,
  className,
  containerClassName,
  ...props
}: InputProps) {
  return (
    <View className={cn("gap-2", containerClassName)}>
      {label && (
        <Text className="text-sm font-semibold tracking-wider text-muted-foreground">{label}</Text>
      )}
      <TextInput
        className={cn(
          "h-12 border border-border bg-white px-4 text-lg text-foreground",
          className
        )}
        style={{ textAlignVertical: "center", paddingTop: 0, paddingBottom: 0 }}
        placeholderTextColor="#5c5c6e"
        {...props}
      />
    </View>
  );
}
