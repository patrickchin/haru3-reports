import React, { useRef, useState, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, Alert } from 'react-native';
import { Image } from 'expo-image';
import { CameraView, useCameraPermissions, type FlashMode, type CameraType } from 'expo-camera';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { X, Zap, ZapOff, SwitchCamera, Check } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { commitCameraSession, cancelCameraSession } from '@/features/camera/session';
import * as Linking from 'expo-linking';

const MAX_PHOTOS = 20;
const FLASH_MODES: FlashMode[] = ['off', 'auto', 'on'];

export default function CaptureScreen() {
  const { styles, theme } = useStyles(stylesheet);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session: sessionId } = useLocalSearchParams<{ session: string }>();

  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [photos, setPhotos] = useState<string[]>([]);
  const [flashMode, setFlashMode] = useState<FlashMode>('off');
  const [facing, setFacing] = useState<CameraType>('back');
  const [capturing, setCapturing] = useState(false);

  const cycleFlash = useCallback(() => {
    setFlashMode((prev) => {
      const idx = FLASH_MODES.indexOf(prev);
      return FLASH_MODES[(idx + 1) % FLASH_MODES.length];
    });
  }, []);

  const flipCamera = useCallback(() => {
    setFacing((prev) => (prev === 'back' ? 'front' : 'back'));
  }, []);

  const capture = useCallback(async () => {
    if (!cameraRef.current || capturing || photos.length >= MAX_PHOTOS) return;
    setCapturing(true);
    try {
      const pic = await cameraRef.current.takePictureAsync({ quality: 0.8, skipProcessing: false });
      if (pic?.uri) {
        setPhotos((prev) => [...prev, pic.uri]);
      }
    } finally {
      setCapturing(false);
    }
  }, [capturing, photos.length]);

  const removePhoto = useCallback((index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleDone = useCallback(() => {
    if (sessionId) {
      commitCameraSession(sessionId, photos);
    }
    router.back();
  }, [sessionId, photos, router]);

  const handleCancel = useCallback(() => {
    if (photos.length > 0) {
      Alert.alert('Discard photos?', `You have ${photos.length} photo(s). Discard them?`, [
        { text: 'Keep Editing', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            if (sessionId) cancelCameraSession(sessionId);
            router.back();
          },
        },
      ]);
    } else {
      if (sessionId) cancelCameraSession(sessionId);
      router.back();
    }
  }, [photos.length, sessionId, router]);

  // ----------- Permission gate -----------
  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.permissionGate]}>
        <Text style={styles.permissionTitle}>Camera Access Required</Text>
        <Text style={styles.permissionBody}>
          We need camera access to capture site photos for your reports.
        </Text>

        {permission.canAskAgain ? (
          <Pressable style={styles.permissionBtn} onPress={requestPermission}>
            <Text style={styles.permissionBtnText}>Allow Camera Access</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.permissionBtn} onPress={() => Linking.openSettings()}>
            <Text style={styles.permissionBtnText}>Open Settings</Text>
          </Pressable>
        )}

        <Pressable style={styles.cancelTextBtn} onPress={handleCancel}>
          <Text style={styles.cancelTextBtnLabel}>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  // ----------- Camera UI -----------
  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        flash={flashMode}
      />

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={handleCancel} hitSlop={12}>
          <X size={28} color="#fff" />
        </Pressable>

        <Pressable onPress={cycleFlash} hitSlop={12}>
          {flashMode === 'off' ? (
            <ZapOff size={24} color="#fff" />
          ) : (
            <View style={styles.flashRow}>
              <Zap size={24} color="#fff" />
              <Text style={styles.flashLabel}>{flashMode.toUpperCase()}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* Bottom bar */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        {/* Thumbnail strip */}
        {photos.length > 0 && (
          <ScrollView horizontal style={styles.thumbnailStrip} showsHorizontalScrollIndicator={false}>
            {photos.map((uri, idx) => (
              <Pressable key={uri} onPress={() => removePhoto(idx)} style={styles.thumbWrap}>
                <Image source={{ uri }} style={styles.thumb} contentFit="cover" />
                <View style={styles.thumbRemove}>
                  <X size={10} color="#fff" />
                </View>
              </Pressable>
            ))}
          </ScrollView>
        )}

        <View style={styles.controls}>
          {/* Done button */}
          <View style={styles.controlSide}>
            {photos.length > 0 && (
              <Pressable style={styles.doneBtn} onPress={handleDone}>
                <Check size={18} color="#fff" />
                <Text style={styles.doneText}>{photos.length}</Text>
              </Pressable>
            )}
          </View>

          {/* Shutter */}
          <Pressable
            style={[styles.shutter, capturing && styles.shutterActive]}
            onPress={capture}
            disabled={photos.length >= MAX_PHOTOS}
          >
            <View style={styles.shutterInner} />
          </Pressable>

          {/* Flip */}
          <View style={styles.controlSide}>
            <Pressable onPress={flipCamera} hitSlop={12}>
              <SwitchCamera size={28} color="#fff" />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    ...({ StyleSheet: undefined } as any), // workaround removed
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },

  // Permission gate
  permissionGate: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
    backgroundColor: theme.colors.background,
  },
  permissionTitle: {
    ...theme.typography.h3,
    color: theme.colors.foreground,
  },
  permissionBody: {
    ...theme.typography.body,
    color: theme.colors.mutedForeground,
    textAlign: 'center',
  },
  permissionBtn: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm + 4,
    borderRadius: theme.radii.lg,
    marginTop: theme.spacing.md,
  },
  permissionBtnText: {
    ...theme.typography.label,
    color: theme.colors.primaryForeground,
  },
  cancelTextBtn: {
    marginTop: theme.spacing.sm,
  },
  cancelTextBtnLabel: {
    ...theme.typography.label,
    color: theme.colors.mutedForeground,
  },

  // Top bar
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  flashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  flashLabel: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },

  // Bottom bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: theme.spacing.sm,
  },
  thumbnailStrip: {
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    maxHeight: 56,
  },
  thumbWrap: {
    width: 48,
    height: 48,
    borderRadius: theme.radii.sm,
    overflow: 'hidden',
    marginRight: theme.spacing.xs,
  },
  thumb: {
    width: 48,
    height: 48,
  },
  thumbRemove: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 8,
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },

  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.xl,
  },
  controlSide: {
    width: 56,
    alignItems: 'center',
  },

  // Shutter
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shutterActive: {
    opacity: 0.6,
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#fff',
  },

  // Done
  doneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.accent,
    paddingHorizontal: theme.spacing.sm + 4,
    paddingVertical: theme.spacing.xs + 2,
    borderRadius: theme.radii.full,
  },
  doneText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
}));
