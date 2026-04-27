import { useState } from "react";
import { View, Text, Image, Pressable, ActivityIndicator } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import { backend } from "@/lib/backend";
import { useAuth } from "@/lib/auth";
import { uploadAvatar } from "@/lib/file-upload";

interface AvatarUploaderProps {
  size?: number;
}

/**
 * Lets the signed-in user pick an image, downscale it, and upload it as
 * their avatar. Updates `profiles.avatar_url` on success.
 */
export function AvatarUploader({ size = 96 }: AvatarUploaderProps) {
  const { user, profile, updateProfile } = useAuth();
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePick = async () => {
    if (!user) return;
    setError(null);

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError("Photo library permission denied");
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (picked.canceled || !picked.assets[0]) return;

    setIsUploading(true);
    try {
      // Downscale to 512×512 to stay well under the 10 MB avatar limit.
      const compressed = await ImageManipulator.manipulateAsync(
        picked.assets[0].uri,
        [{ resize: { width: 512, height: 512 } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
      );
      const info = await FileSystem.getInfoAsync(compressed.uri);
      const sizeBytes =
        info.exists && "size" in info && typeof info.size === "number"
          ? info.size
          : 0;
      const base64 = await FileSystem.readAsStringAsync(compressed.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const binary =
        typeof atob === "function"
          ? atob(base64)
          : Buffer.from(base64, "base64").toString("binary");
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const { publicUrl } = await uploadAvatar({
        backend,
        userId: user.id,
        body: bytes,
        filename: "avatar.jpg",
        mimeType: "image/jpeg",
        sizeBytes,
      });

      // Cache-bust so the new avatar shows immediately.
      const busted = `${publicUrl}?v=${Date.now()}`;
      await updateProfile({ avatar_url: busted });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload avatar");
    } finally {
      setIsUploading(false);
    }
  };

  const url = profile?.avatar_url ?? null;

  return (
    <View className="items-center gap-2">
      <Pressable
        onPress={handlePick}
        disabled={isUploading}
        accessibilityLabel="Change profile picture"
        testID="btn-avatar-upload"
        style={{ width: size, height: size, borderRadius: size / 2 }}
        className="overflow-hidden border border-border bg-secondary items-center justify-center"
      >
        {isUploading ? (
          <ActivityIndicator size="small" color="#1a1a2e" />
        ) : url ? (
          <Image
            source={{ uri: url }}
            style={{ width: size, height: size }}
            accessibilityLabel="Profile picture"
          />
        ) : (
          <Text className="text-2xl font-bold text-muted-foreground">
            {(profile?.full_name?.[0] ?? "?").toUpperCase()}
          </Text>
        )}
      </Pressable>
      <Text className="text-xs text-muted-foreground">
        {isUploading ? "Uploading…" : "Tap to change"}
      </Text>
      {error ? (
        <Text className="text-xs text-danger-foreground">{error}</Text>
      ) : null}
    </View>
  );
}
