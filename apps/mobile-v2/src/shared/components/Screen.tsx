import type { ReactNode } from "react";
import { SafeAreaView, View } from "react-native";
import { cn } from "@/shared/lib/cn";

type ScreenProps = {
  children: ReactNode;
  className?: string;
  safe?: boolean;
  testID?: string;
};

export function Screen({ children, className, safe = true, testID }: ScreenProps) {
  const Wrapper = safe ? SafeAreaView : View;

  return (
    <Wrapper className={cn("flex-1 bg-background", className)} testID={testID}>
      {children}
    </Wrapper>
  );
}
