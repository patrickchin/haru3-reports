import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  ChevronRight,
  Cpu,
  LogOut,
  Trash2,
  User,
  X,
  Check,
  ChevronLeft,
} from 'lucide-react-native';
import Constants from 'expo-constants';

import { useUsage, useAiProviders, useAiSettings, useUpdateAiSettings } from '@/lib/api/hooks';
import { Button, Card, ScreenHeader, Skeleton, AppDialogSheet } from '@/components/ui';
import { useAuth, useAuthActions } from '@/features/auth';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

function formatNumber(n: number | undefined): string {
  if (n === undefined || n === null) return '0';
  return n.toLocaleString();
}

// ---------------------------------------------------------------------------
// AI Provider Picker Modal
// ---------------------------------------------------------------------------

interface AiPickerProps {
  visible: boolean;
  onClose: () => void;
}

function AiProviderPicker({ visible, onClose }: AiPickerProps) {
  const { styles, theme } = useStyles(stylesheet);
  const { data: providers } = useAiProviders();
  const { data: settings } = useAiSettings();
  const updateAi = useUpdateAiSettings();
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);

  const activeProvider = selectedProvider ?? null;
  const providerObj = providers?.find((p) => p.id === activeProvider);

  const handleSelectProvider = useCallback((id: string) => {
    setSelectedProvider(id);
  }, []);

  const handleSelectModel = useCallback(
    (providerId: string, modelId: string) => {
      updateAi.mutate({ provider: providerId, model: modelId });
      setSelectedProvider(null);
      onClose();
    },
    [updateAi, onClose],
  );

  const handleBack = useCallback(() => {
    setSelectedProvider(null);
  }, []);

  const handleClose = useCallback(() => {
    setSelectedProvider(null);
    onClose();
  }, [onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            {activeProvider ? (
              <Pressable onPress={handleBack} hitSlop={8}>
                <ChevronLeft size={24} color={theme.colors.foreground} />
              </Pressable>
            ) : (
              <View style={{ width: 24 }} />
            )}
            <Text style={styles.modalTitle}>
              {activeProvider ? providerObj?.name ?? 'Models' : 'AI Provider'}
            </Text>
            <Pressable onPress={handleClose} hitSlop={8}>
              <X size={24} color={theme.colors.foreground} />
            </Pressable>
          </View>

          <ScrollView style={styles.modalList}>
            {!activeProvider
              ? providers?.map((p) => {
                  const isCurrent = settings?.provider === p.id;
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => handleSelectProvider(p.id)}
                      style={({ pressed }) => [
                        styles.menuRow,
                        isCurrent && styles.menuRowActive,
                        pressed && styles.menuRowPressed,
                      ]}
                    >
                      <Text style={styles.menuRowLabel}>{p.name}</Text>
                      {isCurrent && <Check size={18} color={theme.colors.success} />}
                      <ChevronRight size={18} color={theme.colors.mutedForeground} />
                    </Pressable>
                  );
                })
              : providerObj?.models.map((m) => {
                  const isCurrent =
                    settings?.provider === activeProvider && settings?.model === m.id;
                  return (
                    <Pressable
                      key={m.id}
                      onPress={() => handleSelectModel(activeProvider, m.id)}
                      style={({ pressed }) => [
                        styles.menuRow,
                        isCurrent && styles.menuRowActive,
                        pressed && styles.menuRowPressed,
                      ]}
                    >
                      <Text style={styles.menuRowLabel}>{m.id}</Text>
                      {isCurrent && <Check size={18} color={theme.colors.success} />}
                    </Pressable>
                  );
                })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Menu Row
// ---------------------------------------------------------------------------

interface MenuRowProps {
  icon: React.ReactNode;
  label: string;
  subtitle?: string;
  subtitleTestID?: string;
  disabled?: boolean;
  onPress?: () => void;
  testID?: string;
}

function MenuRow({ icon, label, subtitle, subtitleTestID, disabled, onPress, testID }: MenuRowProps) {
  const { styles, theme } = useStyles(stylesheet);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      style={({ pressed }) => [
        styles.menuRow,
        pressed && !disabled && styles.menuRowPressed,
        disabled && styles.menuRowDisabled,
      ]}
    >
      <View style={styles.menuRowIcon}>{icon}</View>
      <View style={styles.menuRowContent}>
        <Text style={styles.menuRowLabel}>{label}</Text>
        {subtitle ? <Text style={styles.menuRowSub} testID={subtitleTestID}>{subtitle}</Text> : null}
      </View>
      <ChevronRight size={18} color={theme.colors.mutedForeground} />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export default function ProfileScreen() {
  const { styles, theme } = useStyles(stylesheet);
  const { profile } = useAuth();
  const { signOut } = useAuthActions();
  const queryClient = useQueryClient();
  const { data: usage, isLoading: usageLoading, refetch, isRefetching } = useUsage();
  const { data: aiSettings } = useAiSettings();

  const [showAiPicker, setShowAiPicker] = useState(false);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [showSignOutDialog, setShowSignOutDialog] = useState(false);

  const initials = useMemo(() => getInitials(profile?.fullName), [profile?.fullName]);

  const appVersion = Constants.expoConfig?.version ?? '3.0.0';

  const aiSubtitle = useMemo(() => {
    if (!aiSettings) return undefined;
    return `${aiSettings.provider} / ${aiSettings.model}`;
  }, [aiSettings]);

  const handleClearCache = useCallback(() => {
    queryClient.clear();
    setShowClearDialog(false);
  }, [queryClient]);

  const handleSignOut = useCallback(async () => {
    setShowSignOutDialog(false);
    await signOut();
    router.replace('/(auth)/login' as any);
  }, [signOut]);

  const totalTokens = (usage?.totalInputTokens ?? 0) + (usage?.totalOutputTokens ?? 0);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScreenHeader title="Profile" />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={() => {}}
        refreshControl={undefined}
      >
        {/* Wrap in a FlatList-like pull-to-refresh */}

        {/* User card */}
        <Card>
          <View style={styles.userRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userName} testID="profile-display-name">{profile?.fullName ?? 'No name'}</Text>
              <Text style={styles.userPhone} testID="profile-phone">{profile?.phone ?? ''}</Text>
              {profile?.companyName ? (
                <Text style={styles.userCompany} testID="profile-company-name">{profile.companyName}</Text>
              ) : null}
            </View>
          </View>
        </Card>

        {/* Usage stats */}
        <Pressable onPress={() => router.push('/(app)/profile/usage')} testID="btn-open-usage">
          <Card>
            <Text style={styles.sectionLabel}>Usage this month</Text>
            {usageLoading ? (
              <View style={styles.usageStatsRow}>
                <Skeleton width={80} height={20} />
                <Skeleton width={80} height={20} />
              </View>
            ) : (
              <View style={styles.usageStatsRow}>
                <View style={styles.usageStat}>
                  <Text style={styles.usageValue}>
                    {formatNumber(totalTokens)}
                  </Text>
                  <Text style={styles.usageLabel}>Tokens used</Text>
                </View>
              </View>
            )}
          </Card>
        </Pressable>

        {/* Menu */}
        <Card padding="sm">
          <MenuRow
            icon={<User size={20} color={theme.colors.foreground} />}
            label="Account Details"
            onPress={() => router.push('/(app)/profile/account')}
          />
          <MenuRow
            icon={<Cpu size={20} color={theme.colors.foreground} />}
            label="AI Provider"
            subtitle={aiSubtitle}
            subtitleTestID="ai-model-id"
            onPress={() => setShowAiPicker(true)}
            testID="btn-open-ai-model"
          />
          <MenuRow
            icon={<Bell size={20} color={theme.colors.mutedForeground} />}
            label="Notifications"
            subtitle="Coming soon"
            disabled
          />
        </Card>

        {/* Actions */}
        <View style={styles.actions}>
          <Button variant="outline" onPress={() => setShowClearDialog(true)} testID="btn-clear-cache">
            Clear cached data
          </Button>
          <Button variant="destructive" onPress={() => setShowSignOutDialog(true)} testID="btn-sign-out">
            Sign Out
          </Button>
        </View>

        {/* Version */}
        <Text style={styles.version} testID="build-info">Version {appVersion}</Text>
      </ScrollView>

      {/* AI Picker Modal */}
      <AiProviderPicker visible={showAiPicker} onClose={() => setShowAiPicker(false)} />

      {/* Clear cache dialog */}
      <AppDialogSheet
        visible={showClearDialog}
        onClose={() => setShowClearDialog(false)}
        title="Clear cached data?"
        message="This will clear all locally cached data. You will need to reload content from the server."
        actions={[
          { label: 'Cancel', onPress: () => setShowClearDialog(false), variant: 'secondary' },
          { label: 'Clear', onPress: handleClearCache, variant: 'destructive' },
        ]}
      />

      {/* Sign out dialog */}
      <AppDialogSheet
        visible={showSignOutDialog}
        onClose={() => setShowSignOutDialog(false)}
        title="Sign out?"
        message="You will need to sign in again to access your account."
        actions={[
          { label: 'Cancel', onPress: () => setShowSignOutDialog(false), variant: 'secondary' },
          { label: 'Sign Out', onPress: handleSignOut, variant: 'destructive' },
        ]}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const stylesheet = createStyleSheet((theme) => ({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scroll: {
    padding: theme.spacing.md,
    gap: theme.spacing.md,
    paddingBottom: theme.spacing['2xl'],
  },

  // User card
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.primaryForeground,
  },
  userInfo: {
    flex: 1,
    gap: 2,
  },
  userName: {
    ...theme.typography.h3,
    color: theme.colors.foreground,
  },
  userPhone: {
    ...theme.typography.bodySmall,
    color: theme.colors.mutedForeground,
  },
  userCompany: {
    ...theme.typography.caption,
    color: theme.colors.mutedForeground,
  },

  // Usage stats
  sectionLabel: {
    ...theme.typography.label,
    color: theme.colors.mutedForeground,
    marginBottom: theme.spacing.sm,
  },
  usageStatsRow: {
    flexDirection: 'row',
    gap: theme.spacing.lg,
  },
  usageStat: {
    gap: 2,
  },
  usageValue: {
    ...theme.typography.h3,
    color: theme.colors.foreground,
  },
  usageLabel: {
    ...theme.typography.caption,
    color: theme.colors.mutedForeground,
  },

  // Menu rows
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
    gap: theme.spacing.md,
  },
  menuRowActive: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.md,
  },
  menuRowPressed: {
    opacity: 0.6,
  },
  menuRowDisabled: {
    opacity: 0.4,
  },
  menuRowIcon: {
    width: 32,
    height: 32,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuRowContent: {
    flex: 1,
    gap: 1,
  },
  menuRowLabel: {
    ...theme.typography.body,
    color: theme.colors.foreground,
  },
  menuRowSub: {
    ...theme.typography.caption,
    color: theme.colors.mutedForeground,
  },

  // Actions
  actions: {
    gap: theme.spacing.sm,
  },

  // Version
  version: {
    ...theme.typography.caption,
    color: theme.colors.mutedForeground,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.colors.card,
    borderTopLeftRadius: theme.radii['2xl'],
    borderTopRightRadius: theme.radii['2xl'],
    maxHeight: '70%',
    paddingBottom: theme.spacing['2xl'],
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  modalTitle: {
    ...theme.typography.h3,
    color: theme.colors.foreground,
  },
  modalList: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
  },
}));
