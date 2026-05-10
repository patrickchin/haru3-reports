import type { ReactNode } from "react";
import { View, type ViewProps } from "react-native";
import { cn } from "@/shared/lib/cn";

type CardProps = ViewProps & {
  children: ReactNode;
};

export function Card({ className, children, ...props }: CardProps) {
  return (
    <View
      className={cn("bg-card rounded-lg border border-border p-4", className)}
      {...props}
    >
      {children}
    </View>
  );
}

function CardHeader({ className, children, ...props }: CardProps) {
  return (
    <View className={cn("mb-3", className)} {...props}>
      {children}
    </View>
  );
}

function CardBody({ className, children, ...props }: CardProps) {
  return (
    <View className={cn("", className)} {...props}>
      {children}
    </View>
  );
}

function CardActions({ className, children, ...props }: CardProps) {
  return (
    <View className={cn("mt-3 flex-row gap-2", className)} {...props}>
      {children}
    </View>
  );
}

Card.Header = CardHeader;
Card.Body = CardBody;
Card.Actions = CardActions;
