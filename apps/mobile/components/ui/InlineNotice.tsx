import { type ReactNode } from "react";
import { Text, View } from "react-native";
import { cn } from "@/lib/utils";
import { getSurfaceDepthStyle } from "@/lib/surface-depth";

type InlineNoticeTone = "info" | "success" | "warning" | "danger";

interface InlineNoticeProps {
  tone?: InlineNoticeTone;
  title?: string;
  children: ReactNode;
  className?: string;
}

const toneStyles: Record<InlineNoticeTone, string> = {
  info: "border-info-border bg-info-soft",
  success: "border-success-border bg-success-soft",
  warning: "border-warning-border bg-warning-soft",
  danger: "border-danger-border bg-danger-soft",
};

const toneTextStyles: Record<InlineNoticeTone, string> = {
  info: "text-info-text",
  success: "text-success-text",
  warning: "text-warning-text",
  danger: "text-danger-text",
};

export function InlineNotice({
  tone = "info",
  title,
  children,
  className,
}: InlineNoticeProps) {
  return (
    <View
      className={cn(
        "rounded-md border px-4 py-3",
        toneStyles[tone],
        className
      )}
      style={getSurfaceDepthStyle("raised")}
    >
      {title ? (
        <Text className={cn("mb-1 text-sm font-semibold", toneTextStyles[tone])}>
          {title}
        </Text>
      ) : null}
      <Text className={cn("text-sm", toneTextStyles[tone])}>{children}</Text>
    </View>
  );
}
