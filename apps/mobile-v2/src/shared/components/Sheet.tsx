import type { ReactNode } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import Animated, { FadeIn, SlideInDown } from "react-native-reanimated";
import { cn } from "@/shared/lib/cn";

type SheetProps = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
};

export function Sheet({ visible, onClose, children }: SheetProps) {
  return (
    <Modal visible={visible} transparent animationType="none">
      <Pressable
        className="flex-1 justify-end bg-black/50"
        onPress={onClose}
      >
        <Animated.View entering={FadeIn.duration(200)}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="bg-card rounded-t-xl p-6"
          >
            <Animated.View entering={SlideInDown.duration(250)}>
              {children}
            </Animated.View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

function SheetTitle({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <Text className={cn("text-title-sm text-foreground mb-4", className)}>
      {children}
    </Text>
  );
}

function SheetBody({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <View className={cn("", className)}>{children}</View>;
}

function SheetActions({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <View className={cn("mt-6 flex-row gap-3", className)}>{children}</View>
  );
}

Sheet.Title = SheetTitle;
Sheet.Body = SheetBody;
Sheet.Actions = SheetActions;
