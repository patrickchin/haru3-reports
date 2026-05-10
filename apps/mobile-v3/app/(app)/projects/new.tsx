import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { router } from 'expo-router';

import { useCreateProject } from '@/lib/api/hooks';
import { Button, Input, SafeAreaView, ScreenHeader } from '@/components/ui';

export default function NewProjectScreen() {
  const { styles } = useStyles(stylesheet);
  const createProject = useCreateProject();

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [clientName, setClientName] = useState('');
  const [nameError, setNameError] = useState('');

  const handleCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError('Project name is required');
      return;
    }
    setNameError('');

    createProject.mutate(
      {
        name: trimmed,
        address: address.trim() || undefined,
        clientName: clientName.trim() || undefined,
      },
      {
        onSuccess: () => {
          router.replace('/(app)/projects');
        },
      },
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader title="New Project" onBack={() => router.back()} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.form}
          keyboardShouldPersistTaps="handled"
        >
          <Input
            testID="input-project-name"
            label="Name"
            placeholder="Project name"
            value={name}
            onChangeText={(text) => {
              setName(text);
              if (nameError) setNameError('');
            }}
            error={nameError}
            autoFocus
          />
          <Input
            testID="input-project-address"
            label="Address"
            placeholder="Project address (optional)"
            value={address}
            onChangeText={setAddress}
          />
          <Input
            testID="input-client-name"
            label="Client Name"
            placeholder="Client name (optional)"
            value={clientName}
            onChangeText={setClientName}
          />

          {createProject.isError ? (
            <View style={styles.errorBox}>
              <Input
                editable={false}
                value=""
                error={
                  createProject.error instanceof Error
                    ? createProject.error.message
                    : 'Failed to create project'
                }
              />
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          <Button
            testID="btn-submit-project"
            onPress={handleCreate}
            loading={createProject.isPending}
            disabled={createProject.isPending}
          >
            Create Project
          </Button>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  flex: {
    flex: 1,
  },
  form: {
    paddingHorizontal: theme.spacing.screen,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.md,
  },
  errorBox: {
    marginTop: theme.spacing.sm,
  },
  footer: {
    paddingHorizontal: theme.spacing.screen,
    paddingVertical: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
}));
