import { View, Image, Modal, Dimensions, Pressable } from "react-native";
import { colors } from "@/lib/design-tokens/colors";
import {
  SafeAreaProvider,
  SafeAreaView,
} from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { ScreenHeader } from "@/components/ui/ScreenHeader";

interface ImagePreviewModalProps {
  visible: boolean;
  uri: string | null;
  title?: string;
  onClose: () => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export function ImagePreviewModal({
  visible,
  uri,
  title = "Image",
  onClose,
}: ImagePreviewModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaProvider>
        <SafeAreaView className="flex-1 bg-black" edges={["top", "bottom"]}>
          <View className="flex-row items-center justify-between px-4 py-2">
            <ScreenHeader title={title} hideActions />
            <Pressable
              onPress={onClose}
              accessibilityLabel="Close image preview"
              testID="btn-close-image-preview"
              className="rounded-full bg-white/20 p-2"
            >
              <X size={22} color={colors.primary.foreground} />
            </Pressable>
          </View>
          <View className="flex-1 items-center justify-center px-4">
            {uri ? (
              <Image
                source={{ uri }}
                style={{ width: SCREEN_WIDTH - 32, height: SCREEN_HEIGHT * 0.7 }}
                resizeMode="contain"
                testID="image-preview"
                accessibilityLabel={title}
              />
            ) : null}
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
