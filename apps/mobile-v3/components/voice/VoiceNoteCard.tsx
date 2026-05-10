import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  Mic,
  Play,
  Pause,
  RotateCcw,
  Loader2,
  AlertTriangle,
  MoreHorizontal,
  Share2,
  Download,
  Trash2,
  FileText,
} from 'lucide-react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { getSurfaceDepthStyle } from '@/lib/styles/tokens';
import { usePlayer } from '@/features/audio/usePlayer';
import { AppDialogSheet } from '@/components/ui/AppDialogSheet';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VoiceNoteCardNote {
  id: string;
  body: string | null;
  fileId: string | null;
  createdAt: string;
  voiceTitle?: string | null;
  voiceSummary?: string | null;
  authorName?: string | null;
}

export interface VoiceNoteCardProps {
  note: VoiceNoteCardNote;
  fileUrl?: string;
  status?: 'uploading' | 'transcribing' | 'saved' | 'failed';
  onRetry?: () => void;
  onDelete?: () => void;
  onShare?: () => void;
  onDownload?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
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
// Progress Bar
// ---------------------------------------------------------------------------

interface SeekBarProps {
  position: number;
  duration: number;
  onSeek: (position: number) => void;
}

function SeekBar({ position, duration, onSeek }: SeekBarProps) {
  const { styles, theme } = useStyles(stylesheet);
  const progress = duration > 0 ? position / duration : 0;

  const handlePress = useCallback(
    (e: { nativeEvent: { locationX: number } }) => {
      // Approximate bar width as 100% of parent; not pixel-perfect but functional
      const barWidth = 250; // will be overridden by layout
      const ratio = Math.max(0, Math.min(1, e.nativeEvent.locationX / barWidth));
      onSeek(ratio * duration);
    },
    [duration, onSeek],
  );

  return (
    <Pressable onPress={handlePress} style={styles.seekBarContainer}>
      <View style={styles.seekBarTrack}>
        <View style={[styles.seekBarFill, { flex: progress }]} />
        <View style={{ flex: 1 - progress }} />
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const VoiceNoteCard = React.memo(function VoiceNoteCard({
  note,
  fileUrl,
  status = 'saved',
  onRetry,
  onDelete,
  onShare,
  onDownload,
}: VoiceNoteCardProps) {
  const { styles, theme } = useStyles(stylesheet);
  const [showMenu, setShowMenu] = useState(false);

  const player = usePlayer(
    fileUrl ?? '',
    note.fileId ?? note.id,
  );

  const canPlay = !!fileUrl && status === 'saved';
  const isPending = status === 'uploading' || status === 'transcribing';

  const title = note.voiceTitle || 'Voice Note';

  const menuActions = [
    ...(onShare ? [{ label: 'Share', onPress: () => { setShowMenu(false); onShare(); }, variant: 'secondary' as const }] : []),
    ...(onDownload ? [{ label: 'Download', onPress: () => { setShowMenu(false); onDownload(); }, variant: 'secondary' as const }] : []),
    ...(onDelete ? [{ label: 'Delete', onPress: () => { setShowMenu(false); onDelete(); }, variant: 'destructive' as const }] : []),
    { label: 'Cancel', onPress: () => setShowMenu(false), variant: 'secondary' as const },
  ];

  return (
    <View style={styles.card} testID={`voice-note-card-${note.id}`}>
      {/* Header row */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.micIcon}>
            <Mic size={14} color={theme.colors.primaryForeground} />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.title} testID={`voice-note-title-${note.id}`}>{title}</Text>
            <View style={styles.metaRow}>
              {note.authorName ? (
                <Text style={styles.metaText}>{note.authorName}</Text>
              ) : null}
              <Text style={styles.metaText} testID={`voice-note-captured-at-${note.id}`}>
                {formatTimestamp(note.createdAt)}
              </Text>
            </View>
          </View>
        </View>
        {(onDelete || onShare || onDownload) && (
          <Pressable onPress={() => setShowMenu(true)} hitSlop={8} style={styles.menuButton}>
            <MoreHorizontal size={18} color={theme.colors.mutedForeground} />
          </Pressable>
        )}
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

      {/* Summary */}
      {note.voiceSummary ? (
        <View style={styles.summarySection}>
          <Text style={styles.summaryLabel}>Summary</Text>
          <Text style={styles.summaryText} testID={`voice-note-summary-${note.id}`}>{note.voiceSummary}</Text>
        </View>
      ) : null}

      {/* Transcript */}
      {note.body ? (
        <View style={styles.transcriptSection}>
          <Text style={styles.transcriptLabel}>Transcript</Text>
          <Text style={styles.body}>{note.body}</Text>
        </View>
      ) : (
        !isPending &&
        status !== 'failed' &&
        !note.voiceSummary && (
          <Text style={styles.bodyPlaceholder}>No transcript available</Text>
        )
      )}

      {/* Playback controls with seek bar */}
      {canPlay && (
        <View style={styles.playbackRow}>
          <Pressable
            onPress={player.isPlaying ? player.pause : player.play}
            style={styles.playButton}
            accessibilityLabel={player.isPlaying ? 'Pause' : 'Play'}
            testID={`btn-voice-note-play-${note.id}`}
          >
            {player.isPlaying ? (
              <Pause size={14} color={theme.colors.primaryForeground} />
            ) : (
              <Play size={14} color={theme.colors.primaryForeground} />
            )}
          </Pressable>
          <View style={styles.playbackInfo}>
            <SeekBar
              position={player.position}
              duration={player.duration}
              onSeek={player.seekTo ?? (() => {})}
            />
            <View style={styles.durationRow}>
              <Text style={styles.durationText}>{formatDuration(player.position)}</Text>
              <Text style={styles.durationText}>{formatDuration(player.duration)}</Text>
            </View>
          </View>
        </View>
      )}

      {/* Options menu */}
      <AppDialogSheet
        visible={showMenu}
        onClose={() => setShowMenu(false)}
        title="Voice Note Options"
        actions={menuActions}
      />
    </View>
  );
});

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const raised = getSurfaceDepthStyle('raised');

const stylesheet = createStyleSheet((theme) => ({
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...raised,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    flex: 1,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  micIcon: {
    width: 28,
    height: 28,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  title: {
    ...theme.typography.body,
    fontWeight: '600',
    color: theme.colors.foreground,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  metaText: {
    ...theme.typography.caption,
    color: theme.colors.mutedForeground,
  },
  menuButton: {
    padding: theme.spacing.xs,
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
  summarySection: {
    gap: 4,
  },
  summaryLabel: {
    ...theme.typography.label,
    color: theme.colors.mutedForeground,
  },
  summaryText: {
    ...theme.typography.bodySmall,
    color: theme.colors.foreground,
  },
  transcriptSection: {
    gap: 4,
  },
  transcriptLabel: {
    ...theme.typography.label,
    color: theme.colors.mutedForeground,
  },
  body: {
    ...theme.typography.bodySmall,
    color: theme.colors.foreground,
  },
  bodyPlaceholder: {
    ...theme.typography.bodySmall,
    fontStyle: 'italic',
    color: theme.colors.mutedForeground,
  },
  playbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playbackInfo: {
    flex: 1,
    gap: 4,
  },
  seekBarContainer: {
    height: 20,
    justifyContent: 'center',
  },
  seekBarTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.muted,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  seekBarFill: {
    backgroundColor: theme.colors.primary,
  },
  durationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  durationText: {
    fontSize: 11,
    color: theme.colors.mutedForeground,
    fontVariant: ['tabular-nums'],
  },
}));
