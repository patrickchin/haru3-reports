import { useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Image } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { File as ExpoFile } from "expo-file-system";
import { supabase } from "@/infra/supabase";
import { useAuth } from "@/features/auth";
import { useUpdateProfile } from "./mutations";
import { colors } from "@/design-tokens/colors";

interface AvatarUploaderProps {
  size?: number;
}

const AVATARS_BUCKET = "avatars";

/**
 * Lets the signed-in user pick an image, downscale it, and upload it as
 * their avatar. Updates `profiles.avatar_url` on success.
 *
 * Ported from v1 `apps/mobile/components/account/AvatarUploader.tsx`.
 */
export function AvatarUploader({ size = 96 }: AvatarUploaderProps) {
  const { user, profile } = useAuth();
  const updateProfile = useUpdateProfile();
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
      mediaTypes: "images",
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

      // Read bytes using expo-file-system v6 API
      const bytes = await new ExpoFile(compressed.uri).bytes();

      // Upload to avatars bucket
      const id = crypto.randomUUID();
      const storagePath = `${user.id}/${id}.jpg`;
      const bucket = supabase.storage.from(AVATARS_BUCKET);

      const upload = await bucket.upload(storagePath, bytes, {
        contentType: "image/jpeg",
        upsert: true, // avatars overwrite the previous file
      });

      if (upload.error) {
        throw new Error(`Avatar upload failed: ${upload.error.message}`);
      }

      // Get public URL
      const { data } = bucket.getPublicUrl(storagePath);

      // Cache-bust so the new avatar shows immediately.
      const busted = `${data.publicUrl}?v=${Date.now()}`;
      await updateProfile.mutateAsync({ avatar_url: busted });
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
          <ActivityIndicator size="small" color={colors.foreground} />
        ) : url ? (
          <Image
            source={{ uri: url }}
            style={{ width: size, height: size }}
            accessibilityLabel="Profile picture"
          />
        ) : (
          <Text className="text-muted-foreground text-xs">No photo</Text>
        )}
      </Pressable>
      {error && (
        <Text className="text-destructive text-xs text-center">{error}</Text>
      )}
    </View>
  );
}
