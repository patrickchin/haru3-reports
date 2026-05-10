import React from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  Mic,
  Play,
  Pause,
  RotateCcw,
  Loader2,
  AlertTriangle,
} from 'lucide-react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { usePlayer } from '@/features/audio/usePlayer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VoiceNoteCardNote {
  id: string;
  body: string | null;
  fileId: string | null;
  createdAt: string;
}

export interface VoiceNoteCardProps {
  note: VoiceNoteCardNote;
  fileUrl?: string;
  status?: 'uploading' | 'transcribing' | 'saved' | 'failed';
  onRetry?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const VoiceNoteCard = React.memo(function VoiceNoteCard({
  note,
  fileUrl,
  status = 'saved',
  onRetry,
}: VoiceNoteCardProps) {
  const { styles, theme } = useStyles(stylesheet);

  const player = usePlayer(
    fileUrl ?? '',
    note.fileId ?? note.id,
  );

  const canPlay = !!fileUrl && status === 'saved';
  const isPending = status === 'uploading' || status === 'transcribing';

  return (
    <View style={styles.card} testID={`voice-note-card-${note.id}`}>
      {/* Header row */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Mic size={16} color={theme.colors.primary} />
          <Text style={styles.label} testID={`voice-note-title-${note.id}`}>Voice Note</Text>
        </View>
        <Text style={styles.timestamp} testID={`voice-note-captured-at-${note.id}`}>{formatTimestamp(note.createdAt)}</Text>
      </View>

      {/* Status indicator */}
      {isPending && (
        <View style={styles.statusRow}>
          <Loader2 size={14} color={theme.colors.mutedForeground} />
          <Text style={styles.statusText}>
            {status === 'uploading' ? 'Uploading...' : 'Transcribing...'}
          </Text>
        </View>
      )}

      {status === 'failed' && (
        <View style={styles.statusRow}>
          <AlertTriangle size={14} color={theme.colors.destructive} />
          <Text style={[styles.statusText, { color: theme.colors.destructive }]}>
            Failed
          </Text>
          {onRetry && (
            <Pressable onPress={onRetry} style={styles.retryButton}>
              <RotateCcw size={14} color={theme.colors.primary} />
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Transcript */}
      {note.body ? (
        <Text style={styles.body} testID={`voice-note-summary-${note.id}`}>{note.body}</Text>
      ) : (
        !isPending &&
        status !== 'failed' && (
          <Text style={styles.bodyPlaceholder}>No transcript available</Text>
        )
      )}

      {/* Playback controls */}
      {canPlay && (
        <View style={styles.playbackRow}>
          <Pressable
            onPress={player.isPlaying ? player.pause : player.play}
            style={styles.playButton}
            accessibilityLabel={player.isPlaying ? 'Pause' : 'Play'}
            testID={`btn-voice-note-play-${note.id}`}
          >
            {player.isPlaying ? (
              <Pause size={16} color={theme.colors.primary} />
            ) : (
              <Play size={16} color={theme.colors.primary} />
            )}
          </Pressable>
          <Text style={styles.durationText}>
            {formatDuration(player.position)} / {formatDuration(player.duration)}
          </Text>
        </View>
      )}
    </View>
  );
});

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const stylesheet = createStyleSheet((theme) => ({
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.foreground,
  },
  timestamp: {
    fontSize: 12,
    color: theme.colors.mutedForeground,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusText: {
    fontSize: 13,
    color: theme.colors.mutedForeground,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 8,
  },
  retryText: {
    fontSize: 13,
    fontWeight: '500',
    color: theme.colors.primary,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.foreground,
  },
  bodyPlaceholder: {
    fontSize: 14,
    fontStyle: 'italic',
    color: theme.colors.mutedForeground,
  },
  playbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  playButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationText: {
    fontSize: 12,
    color: theme.colors.mutedForeground,
    fontVariant: ['tabular-nums'],
  },
}));
