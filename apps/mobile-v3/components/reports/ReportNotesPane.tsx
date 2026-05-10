import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import {
  FileText,
  Image as ImageIcon,
  Mic,
  StickyNote,
  Video,
  File,
} from 'lucide-react-native';

import { useNotes } from '@/lib/api/hooks';
import { EmptyState } from '@/components/ui';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Note {
  id: string;
  reportId: string;
  kind: 'text' | 'voice' | 'image' | 'video' | 'document';
  body: string | null;
  sortOrder: number;
  fileId: string | null;
  createdAt: string;
}

export interface ReportNotesPaneProps {
  reportId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(dateString: string): string {
  const d = new Date(dateString);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function KindIcon({ kind, color, size }: { kind: Note['kind']; color: string; size: number }) {
  switch (kind) {
    case 'voice':
      return <Mic size={size} color={color} />;
    case 'image':
      return <ImageIcon size={size} color={color} />;
    case 'video':
      return <Video size={size} color={color} />;
    case 'document':
      return <File size={size} color={color} />;
    case 'text':
    default:
      return <StickyNote size={size} color={color} />;
  }
}

function kindLabel(kind: Note['kind']): string {
  switch (kind) {
    case 'voice':
      return 'Voice note';
    case 'image':
      return 'Photo';
    case 'video':
      return 'Video';
    case 'document':
      return 'Document';
    case 'text':
    default:
      return 'Text note';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReportNotesPane({ reportId }: ReportNotesPaneProps) {
  const { styles, theme } = useStyles(stylesheet);
  const { data: notes, isLoading, refetch, isRefetching } = useNotes(reportId);

  const renderNote = ({ item }: { item: Note }) => (
    <View style={styles.noteCard}>
      <View style={styles.noteIcon}>
        <KindIcon kind={item.kind} color={theme.colors.mutedForeground} size={18} />
      </View>
      <View style={styles.noteContent}>
        <View style={styles.noteHeader}>
          <Text style={styles.noteKind}>{kindLabel(item.kind)}</Text>
          <Text style={styles.noteTime}>{formatTimestamp(item.createdAt)}</Text>
        </View>
        {item.body ? (
          <Text style={styles.noteBody} numberOfLines={6}>
            {item.kind === 'voice' ? `Transcript: ${item.body}` : item.body}
          </Text>
        ) : null}
        {!item.body && item.fileId ? (
          <Text style={styles.noteFileRef}>Attached file</Text>
        ) : null}
      </View>
    </View>
  );

  if (!isLoading && (!notes || notes.length === 0)) {
    return (
      <View style={styles.emptyWrap}>
        <EmptyState
          icon={<FileText size={40} color={theme.colors.mutedForeground} />}
          title="No notes yet"
          description="Notes recorded for this report will appear here."
        />
      </View>
    );
  }

  return (
    <FlatList
      data={(notes as Note[] | undefined) ?? []}
      keyExtractor={(item) => item.id}
      renderItem={renderNote}
      contentContainerStyle={styles.list}
      onRefresh={refetch}
      refreshing={isRefetching}
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
  emptyWrap: {
    flex: 1,
    paddingTop: theme.spacing['2xl'],
  },
  noteCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radii.xl,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  noteIcon: {
    width: 32,
    height: 32,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteContent: {
    flex: 1,
    gap: 4,
  },
  noteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  noteKind: {
    ...theme.typography.caption,
    color: theme.colors.mutedForeground,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  noteTime: {
    ...theme.typography.caption,
    color: theme.colors.mutedForeground,
  },
  noteBody: {
    ...theme.typography.bodySmall,
    color: theme.colors.cardForeground,
    lineHeight: 20,
  },
  noteFileRef: {
    ...theme.typography.caption,
    color: theme.colors.info,
    fontStyle: 'italic',
  },
}));
