import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { ChevronRight, FileText, StickyNote } from 'lucide-react-native';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReportCardReport {
  id: string;
  title: string;
  type: string;
  status: 'draft' | 'finalized';
  visitDate: string | null;
  createdAt: string;
}

export interface ReportCardProps {
  report: ReportCardReport;
  noteCount?: number;
  onPress: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateString: string | null): string {
  if (!dateString) return '';
  const d = new Date(dateString);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function typeLabel(type: string): string {
  switch (type) {
    case 'daily':
      return 'Daily';
    case 'weekly':
      return 'Weekly';
    case 'custom':
      return 'Custom';
    default:
      return type;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReportCard({ report, noteCount = 0, onPress }: ReportCardProps) {
  const { styles, theme } = useStyles(stylesheet);
  const isDraft = report.status === 'draft';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      accessibilityRole="button"
    >
      <View style={styles.leading}>
        <FileText size={20} color={theme.colors.mutedForeground} />
      </View>

      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={1}>
          {report.title || 'Untitled Report'}
        </Text>

        <View style={styles.metaRow}>
          {/* Type badge */}
          <View style={styles.typeBadge}>
            <Text style={styles.typeBadgeText}>{typeLabel(report.type)}</Text>
          </View>

          {/* Status badge */}
          <View style={[styles.statusBadge, isDraft ? styles.statusDraft : styles.statusFinalized]}>
            <Text
              style={[
                styles.statusBadgeText,
                isDraft ? styles.statusDraftText : styles.statusFinalizedText,
              ]}
            >
              {isDraft ? 'Draft' : 'Final'}
            </Text>
          </View>

          {/* Note count */}
          {noteCount > 0 ? (
            <View style={styles.notesBadge}>
              <StickyNote size={12} color={theme.colors.mutedForeground} />
              <Text style={styles.notesText}>{noteCount}</Text>
            </View>
          ) : null}
        </View>

        {report.visitDate || report.createdAt ? (
          <Text style={styles.date}>
            {report.visitDate ? formatDate(report.visitDate) : formatDate(report.createdAt)}
          </Text>
        ) : null}
      </View>

      <ChevronRight size={18} color={theme.colors.mutedForeground} />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const stylesheet = createStyleSheet((theme) => ({
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radii.xl,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    shadowColor: theme.colors.surfaceShadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  cardPressed: {
    opacity: 0.7,
  },
  leading: {
    width: 36,
    height: 36,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    gap: 4,
  },
  title: {
    ...theme.typography.label,
    color: theme.colors.cardForeground,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    flexWrap: 'wrap',
  },
  typeBadge: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.full,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
  },
  typeBadgeText: {
    ...theme.typography.caption,
    color: theme.colors.mutedForeground,
    fontWeight: '500',
  },
  statusBadge: {
    borderRadius: theme.radii.full,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
  },
  statusDraft: {
    backgroundColor: theme.colors.warningSoft,
  },
  statusFinalized: {
    backgroundColor: theme.colors.successSoft,
  },
  statusBadgeText: {
    ...theme.typography.caption,
    fontWeight: '600',
  },
  statusDraftText: {
    color: theme.colors.warning,
  },
  statusFinalizedText: {
    color: theme.colors.success,
  },
  notesBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  notesText: {
    ...theme.typography.caption,
    color: theme.colors.mutedForeground,
  },
  date: {
    ...theme.typography.caption,
    color: theme.colors.mutedForeground,
  },
}));
