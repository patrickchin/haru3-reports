import React, { useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Alert } from 'react-native';
import { Button } from '@/components/ui';

export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface FilePickerProps {
  onFileSelected: (file: PickedFile) => void;
  category: 'image' | 'document';
  children?: React.ReactNode;
}

export function FilePicker({ onFileSelected, category, children }: FilePickerProps) {
  const pick = useCallback(async () => {
    try {
      if (category === 'image') {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Permission required', 'Please allow access to your photo library.');
          return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.8,
        });

        if (result.canceled || !result.assets[0]) return;

        const asset = result.assets[0];
        onFileSelected({
          uri: asset.uri,
          name: asset.fileName ?? `photo_${Date.now()}.jpg`,
          mimeType: asset.mimeType ?? 'image/jpeg',
          size: asset.fileSize ?? 0,
        });
      } else {
        const result = await DocumentPicker.getDocumentAsync({
          type: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
          copyToCacheDirectory: true,
        });

        if (result.canceled || !result.assets[0]) return;

        const asset = result.assets[0];
        onFileSelected({
          uri: asset.uri,
          name: asset.name,
          mimeType: asset.mimeType ?? 'application/octet-stream',
          size: asset.size ?? 0,
        });
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Could not pick file');
    }
  }, [category, onFileSelected]);

  if (children) {
    return (
      <Button variant="ghost" onPress={pick} testID="btn-file-picker">
        {children}
      </Button>
    );
  }

  return (
    <Button variant="secondary" onPress={pick} testID="btn-file-picker">
      {category === 'image' ? 'Choose Photo' : 'Choose Document'}
    </Button>
  );
}
