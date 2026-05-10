import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import {
  FileText,
  Image as ImageIcon,
  Mic,
  StickyNote,
  Trash2,
  Video,
  Loader2,
  AlertTriangle,
} from 'lucide-react-native';

import type { TimelineEntry } from '@/features/reports/useNoteTimeline';
import { VoiceNoteCard } from '@/components/voice';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NoteTimelineProps {
  timeline: TimelineEntry[];
  onDelete: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(dateString: string): string {
  const d = new Date(dateString);
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function KindIcon({ kind, color, size }: { kind: TimelineEntry['kind']; color: string; size: number }) {
  switch (kind) {
    case 'voice':
      return <Mic size={size} color={color} />;
    case 'image':
      return <ImageIcon size={size} color={color} />;
    case 'video':
      return <Video size={size} color={color} />;
    case 'document':
      return <FileText size={size} color={color} />;
    case 'text':
    default:
      return <StickyNote size={size} color={color} />;
  }
}

// ---------------------------------------------------------------------------
// Timeline Item
// ---------------------------------------------------------------------------

function TimelineItem({
  entry,
  onDelete,
}: {
  entry: TimelineEntry;
  onDelete: () => void;
}) {
  const { styles, theme } = useStyles(stylesheet);

  // Pending status badge
  if (entry.isPending) {
    const isFailed = entry.pendingStatus === 'failed';
    const pendingKindLabel = entry.kind === 'image' ? 'photo' : entry.kind;
    return (
      <View testID={`pending-${pendingKindLabel}-${entry.id}`} style={styles.item}>
        <View style={styles.iconCol}>
          <KindIcon kind={entry.kind} color={theme.colors.mutedForeground} size={18} />
        </View>
        <View style={styles.content}>
          <View style={styles.statusRow}>
            {isFailed ? (
              <AlertTriangle size={14} color={theme.colors.destructive} />
            ) : (
              <Loader2 size={14} color={theme.colors.mutedForeground} />
            )}
            <Text
              style={[
                styles.statusText,
                isFailed && { color: theme.colors.destructive },
              ]}
            >
              {entry.pendingStatus === 'uploading'
                ? 'Uploading...'
                : entry.pendingStatus === 'transcribing'
                  ? 'Transcribing...'
                  : 'Failed'}
            </Text>
          </View>
          {entry.body ? <Text style={styles.body}>{entry.body}</Text> : null}
          {isFailed && entry.pendingError ? (
            <Text style={styles.errorText}>{entry.pendingError}</Text>
          ) : null}
        </View>
      </View>
    );
  }

  // Voice note — use VoiceNoteCard
  if (entry.kind === 'voice') {
    return (
      <View style={styles.item}>
        <View style={styles.voiceCardWrapper}>
          <VoiceNoteCard
            note={{
              id: entry.id,
              body: entry.body,
              fileId: entry.fileId,
              createdAt: entry.createdAt,
            }}
          />
          <Pressable onPress={onDelete} hitSlop={8} style={styles.deleteBtn}>
            <Trash2 size={16} color={theme.colors.destructive} />
          </Pressable>
        </View>
      </View>
    );
  }

  // Text / image / document / video
  return (
    <View style={styles.item}>
      <View style={styles.iconCol}>
        <KindIcon kind={entry.kind} color={theme.colors.primary} size={18} />
      </View>
      <View style={styles.content}>
        {entry.body ? (
          <Text style={styles.body}>{entry.body}</Text>
        ) : (
          <Text style={styles.bodyPlaceholder}>
            {entry.kind === 'image'
              ? 'Photo attachment'
              : entry.kind === 'document'
                ? 'Document attachment'
                : 'No content'}
          </Text>
        )}
        <Text style={styles.timestamp}>{formatTimestamp(entry.createdAt)}</Text>
      </View>
      <Pressable onPress={onDelete} hitSlop={8} style={styles.deleteBtn}>
        <Trash2 size={16} color={theme.colors.destructive} />
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NoteTimeline({ timeline, onDelete }: NoteTimelineProps) {
  const { styles } = useStyles(stylesheet);

  if (timeline.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>
          No notes yet. Add a text note, record voice, or take a photo to get started.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      testID="note-timeline"
      data={timeline}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <TimelineItem entry={item} onDelete={() => onDelete(item.id)} />
      )}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
    />
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const stylesheet = createStyleSheet((theme) => ({
  list: {
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing['2xl'],
  },
  item: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  iconCol: {
    width: 28,
    alignItems: 'center',
    paddingTop: 2,
  },
  content: {
    flex: 1,
    gap: 4,
  },
  body: {
    ...theme.typography.bodySmall,
    color: theme.colors.foreground,
    lineHeight: 20,
  },
  bodyPlaceholder: {
    ...theme.typography.bodySmall,
    color: theme.colors.mutedForeground,
    fontStyle: 'italic',
  },
  timestamp: {
    ...theme.typography.caption,
    color: theme.colors.mutedForeground,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusText: {
    ...theme.typography.caption,
    color: theme.colors.mutedForeground,
  },
  errorText: {
    ...theme.typography.caption,
    color: theme.colors.destructive,
  },
  deleteBtn: {
    padding: theme.spacing.xs,
    alignSelf: 'flex-start',
  },
  voiceCardWrapper: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  emptyText: {
    ...theme.typography.body,
    color: theme.colors.mutedForeground,
    textAlign: 'center',
  },
}));
