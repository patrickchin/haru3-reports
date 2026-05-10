import React from 'react';
import { View, Pressable, Modal } from 'react-native';
import { Image } from 'expo-image';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { X } from 'lucide-react-native';

export interface ImagePreviewModalProps {
  visible: boolean;
  uri: string | null;
  onClose: () => void;
}

export function ImagePreviewModal({ visible, uri, onClose }: ImagePreviewModalProps) {
  const { styles } = useStyles(stylesheet);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay} testID="image-preview">
        <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={12} testID="btn-close-image-preview">
          <X size={24} color="#fff" />
        </Pressable>

        {uri && (
          <Image
            source={{ uri }}
            style={styles.image}
            contentFit="contain"
          />
        )}
      </View>
    </Modal>
  );
}

const stylesheet = createStyleSheet(() => ({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: 56,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  image: {
    width: '100%',
    height: '80%',
  },
}));
