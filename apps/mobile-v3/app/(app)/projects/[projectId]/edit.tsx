import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { router, useLocalSearchParams } from 'expo-router';

import { useProject, useUpdateProject, useDeleteProject } from '@/lib/api/hooks';
import { Button, Divider, Input, SafeAreaView, ScreenHeader, Skeleton } from '@/components/ui';

export default function EditProjectScreen() {
  const { styles } = useStyles(stylesheet);
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { data: project, isLoading } = useProject(projectId) as {
    data: Record<string, any> | undefined;
    isLoading: boolean;
  };
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [clientName, setClientName] = useState('');
  const [nameError, setNameError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (project) {
      setName(project.name ?? '');
      setAddress(project.address ?? '');
      setClientName(project.clientName ?? '');
    }
  }, [project]);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError('Project name is required');
      return;
    }
    setNameError('');

    updateProject.mutate(
      {
        id: projectId,
        name: trimmed,
        address: address.trim() || undefined,
        clientName: clientName.trim() || undefined,
      },
      { onSuccess: () => router.back() },
    );
  };

  const handleDelete = () => {
    deleteProject.mutate(projectId, {
      onSuccess: () => {
        router.dismissAll();
        router.replace('/(app)/projects');
      },
    });
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title="Edit Project" onBack={() => router.back()} />
        <View style={styles.form}>
          <Skeleton width="100%" height={44} />
          <Skeleton width="100%" height={44} />
          <Skeleton width="100%" height={44} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader title="Edit Project" onBack={() => router.back()} />
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
            testID="input-edit-project-name"
            label="Name"
            placeholder="Project name"
            value={name}
            onChangeText={(text) => {
              setName(text);
              if (nameError) setNameError('');
            }}
            error={nameError}
          />
          <Input
            testID="input-edit-project-address"
            label="Address"
            placeholder="Project address (optional)"
            value={address}
            onChangeText={setAddress}
          />
          <Input
            testID="input-edit-client-name"
            label="Client Name"
            placeholder="Client name (optional)"
            value={clientName}
            onChangeText={setClientName}
          />

          {updateProject.isError ? (
            <Text style={styles.errorText}>
              {updateProject.error instanceof Error
                ? updateProject.error.message
                : 'Failed to save changes'}
            </Text>
          ) : null}

          <Divider style={styles.divider} />

          {confirmDelete ? (
            <View style={styles.confirmRow}>
              <Text style={styles.confirmText}>Delete this project permanently?</Text>
              <View style={styles.confirmButtons}>
                <Button
                  variant="outline"
                  size="sm"
                  onPress={() => setConfirmDelete(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onPress={handleDelete}
                  loading={deleteProject.isPending}
                >
                  Delete
                </Button>
              </View>
              {deleteProject.isError ? (
                <Text style={styles.errorText}>
                  {deleteProject.error instanceof Error
                    ? deleteProject.error.message
                    : 'Failed to delete project'}
                </Text>
              ) : null}
            </View>
          ) : (
            <Button
              testID="btn-delete-project"
              variant="ghost"
              onPress={() => setConfirmDelete(true)}
              style={styles.deleteButton}
            >
              <Text style={styles.deleteText}>Delete Project</Text>
            </Button>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Button
            testID="btn-save-project"
            onPress={handleSave}
            loading={updateProject.isPending}
            disabled={updateProject.isPending}
          >
            Save Changes
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
  flex: { flex: 1 },
  form: {
    paddingHorizontal: theme.spacing.screen,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.md,
  },
  errorText: {
    ...theme.typography.bodySmall,
    color: theme.colors.destructive,
  },
  divider: {
    marginVertical: theme.spacing.md,
  },
  confirmRow: {
    gap: theme.spacing.sm,
  },
  confirmText: {
    ...theme.typography.body,
    color: theme.colors.destructive,
  },
  confirmButtons: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  deleteButton: {
    alignSelf: 'flex-start',
  },
  deleteText: {
    ...theme.typography.label,
    color: theme.colors.destructive,
  },
  footer: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
}));
