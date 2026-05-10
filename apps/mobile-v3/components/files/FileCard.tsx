import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { X, FileText, File as FileIcon } from 'lucide-react-native';

export interface FileCardFile {
  id: string;
  fileName: string;
  mimeType: string;
  category: string;
  storagePath: string;
  createdAt: string;
}

export interface FileCardProps {
  file: FileCardFile;
  thumbnailUrl?: string;
  onPress?: () => void;
  onDelete?: () => void;
}

function isImage(mimeType: string) {
  return mimeType.startsWith('image/');
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function FileCard({ file, thumbnailUrl, onPress, onDelete }: FileCardProps) {
  const { styles, theme } = useStyles(stylesheet);

  return (
    <Pressable style={styles.container} onPress={onPress}>
      <View style={styles.thumbnailWrap}>
        {isImage(file.mimeType) && thumbnailUrl ? (
          <Image source={{ uri: thumbnailUrl }} style={styles.thumbnail} contentFit="cover" />
        ) : (
          <View style={styles.iconWrap}>
            {file.mimeType.includes('pdf') ? (
              <FileText size={28} color={theme.colors.mutedForeground} />
            ) : (
              <FileIcon size={28} color={theme.colors.mutedForeground} />
            )}
          </View>
        )}
      </View>

      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {file.fileName}
        </Text>
        <Text style={styles.meta}>{formatDate(file.createdAt)}</Text>
      </View>

      {onDelete && (
        <Pressable style={styles.deleteBtn} onPress={onDelete} hitSlop={8}>
          <X size={16} color={theme.colors.destructive} />
        </Pressable>
      )}
    </Pressable>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  thumbnailWrap: {
    width: 48,
    height: 48,
    borderRadius: theme.radii.md,
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceMuted,
  },
  thumbnail: {
    width: 48,
    height: 48,
  },
  iconWrap: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...theme.typography.bodySmall,
    color: theme.colors.foreground,
    fontWeight: '500',
  },
  meta: {
    ...theme.typography.caption,
    color: theme.colors.mutedForeground,
  },
  deleteBtn: {
    padding: theme.spacing.xs,
  },
}));
