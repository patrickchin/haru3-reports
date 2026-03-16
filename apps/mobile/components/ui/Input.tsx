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
        <Text className="text-sm font-medium text-foreground">{label}</Text>
      )}
      <TextInput
        className={cn(
          "h-12 rounded-lg bg-secondary px-4 text-base text-foreground",
          className
        )}
        placeholderTextColor="#6e6e77"
        {...props}
      />
    </View>
  );
}
