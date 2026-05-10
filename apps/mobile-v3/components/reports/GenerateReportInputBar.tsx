import React, { useCallback, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { Camera, Mic, Plus, Square } from 'lucide-react-native';
import { router } from 'expo-router';

import { LiveWaveform } from '@/components/ui';
import { useGenerateReportContext } from '@/features/reports/GenerateReportProvider';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface GenerateReportInputBarProps {
  projectId: string;
}

export function GenerateReportInputBar({ projectId }: GenerateReportInputBarProps) {
  const { styles, theme } = useStyles(stylesheet);
  const [text, setText] = useState('');

  const {
    addTextNote,
    startRecording,
    stopRecording,
    isRecording,
    amplitudes,
    reportId,
  } = useGenerateReportContext();

  const handleAddText = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setText('');
    await addTextNote(trimmed);
  }, [text, addTextNote]);

  const handleMicPress = useCallback(async () => {
    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  const handleCameraPress = useCallback(() => {
    router.push({
      pathname: '/(app)/projects/[projectId]/reports/camera',
      params: { projectId, reportId },
    } as any);
  }, [projectId, reportId]);

  // Recording mode
  if (isRecording) {
    return (
      <View style={styles.bar}>
        <View style={styles.waveformContainer}>
          <LiveWaveform amplitudes={amplitudes} isActive barCount={24} height={32} />
        </View>
        <Pressable
          testID="btn-record-stop"
          onPress={handleMicPress}
          style={[styles.iconBtn, { backgroundColor: theme.colors.destructive }]}
          accessibilityLabel="Stop recording"
        >
          <Square size={18} color={theme.colors.destructiveForeground} fill={theme.colors.destructiveForeground} />
        </Pressable>
      </View>
    );
  }

  // Default mode
  return (
    <View testID="input-note-container" style={styles.bar}>
      <TextInput
        testID="input-note"
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder="Add a note..."
        placeholderTextColor={theme.colors.mutedForeground}
        multiline
        maxLength={2000}
      />

      {text.trim().length > 0 ? (
        <Pressable testID="btn-add-note" onPress={handleAddText} style={styles.addBtn} accessibilityLabel="Add note">
          <Plus size={20} color={theme.colors.primaryForeground} />
        </Pressable>
      ) : null}

      <Pressable testID="btn-camera-capture" onPress={handleCameraPress} style={styles.iconBtn} accessibilityLabel="Take photo">
        <Camera size={20} color={theme.colors.foreground} />
      </Pressable>

      <Pressable testID="btn-record-start" onPress={handleMicPress} style={styles.iconBtn} accessibilityLabel="Record voice note">
        <Mic size={20} color={theme.colors.foreground} />
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const stylesheet = createStyleSheet((theme) => ({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  input: {
    flex: 1,
    minHeight: 36,
    maxHeight: 100,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.surfaceMuted,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    ...theme.typography.bodySmall,
    color: theme.colors.foreground,
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveformContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
}));
