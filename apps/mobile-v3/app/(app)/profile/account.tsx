import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { router } from 'expo-router';

import { useProfile, useUpdateProfile } from '@/lib/api/hooks';
import { Button, Card, Input, ScreenHeader, Skeleton } from '@/components/ui';
import { useAuth } from '@/features/auth';

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

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function AccountScreen() {
  const { styles } = useStyles(stylesheet);
  const { profile: authProfile } = useAuth();
  const { data: profileData, isLoading } = useProfile();
  const updateProfile = useUpdateProfile();

  const profile = profileData ?? authProfile;

  const [fullName, setFullName] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);

  // Derive display values — local edits take precedence over server data
  const displayName = fullName ?? profile?.fullName ?? '';
  const displayCompany = companyName ?? profile?.companyName ?? '';
  const phone = authProfile?.phone ?? '';

  const initials = useMemo(() => getInitials(displayName || null), [displayName]);

  const hasChanges = useMemo(() => {
    if (fullName !== null && fullName !== (profile?.fullName ?? '')) return true;
    if (companyName !== null && companyName !== (profile?.companyName ?? '')) return true;
    return false;
  }, [fullName, companyName, profile]);

  const handleSave = useCallback(() => {
    const body: { full_name?: string; company_name?: string } = {};
    if (fullName !== null) body.full_name = fullName;
    if (companyName !== null) body.company_name = companyName;
    updateProfile.mutate(body, {
      onSuccess: () => {
        setFullName(null);
        setCompanyName(null);
      },
    });
  }, [fullName, companyName, updateProfile]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']} testID="screen-account">
        <ScreenHeader title="Account Details" onBack={() => router.back()} />
        <View style={styles.content}>
          <View style={styles.avatarCenter}>
            <Skeleton width={80} height={80} style={{ borderRadius: 40 }} />
          </View>
          <Skeleton width="100%" height={44} />
          <Skeleton width="100%" height={44} />
          <Skeleton width="100%" height={44} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']} testID="screen-account">
      <ScreenHeader title="Account Details" onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Avatar */}
        <View style={styles.avatarCenter}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
        </View>

        {/* Info notice */}
        <Card variant="muted" padding="md">
          <Text style={styles.notice}>
            Phone number and profile details can be updated here.
          </Text>
        </Card>

        {/* Fields */}
        <Input
          label="Full Name"
          value={displayName}
          onChangeText={setFullName}
          placeholder="Enter your full name"
          autoCapitalize="words"
        />

        <Input
          label="Company Name"
          value={displayCompany}
          onChangeText={setCompanyName}
          placeholder="Enter company name"
          autoCapitalize="words"
        />

        <Input
          label="Phone"
          value={phone}
          editable={false}
          hint="Phone number cannot be changed"
        />

        {/* Save */}
        <Button
          onPress={handleSave}
          disabled={!hasChanges}
          loading={updateProfile.isPending}
        >
          Save Changes
        </Button>
      </ScrollView>
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
  content: {
    padding: theme.spacing.md,
    gap: theme.spacing.md,
    paddingBottom: theme.spacing['2xl'],
  },
  avatarCenter: {
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.colors.primaryForeground,
  },
  notice: {
    ...theme.typography.bodySmall,
    color: theme.colors.mutedForeground,
    textAlign: 'center',
  },
}));
