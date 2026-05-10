import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { X } from 'lucide-react-native';

import { useAddMember } from '@/lib/api/hooks';
import { Button, Input } from '@/components/ui';

interface AddMemberSheetProps {
  visible: boolean;
  onClose: () => void;
  projectId: string;
}

type MemberRole = 'admin' | 'editor' | 'viewer';

const ROLES: { value: MemberRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'editor', label: 'Editor' },
  { value: 'viewer', label: 'Viewer' },
];

export function AddMemberSheet({ visible, onClose, projectId }: AddMemberSheetProps) {
  const { styles, theme } = useStyles(stylesheet);
  const addMember = useAddMember();

  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<MemberRole>('editor');
  const [phoneError, setPhoneError] = useState('');

  const handleAdd = () => {
    const trimmed = phone.trim();
    if (!trimmed) {
      setPhoneError('Phone number is required');
      return;
    }
    setPhoneError('');

    addMember.mutate(
      { projectId, phone: trimmed, role },
      {
        onSuccess: () => {
          setPhone('');
          setRole('editor');
          onClose();
        },
      },
    );
  };

  const handleClose = () => {
    setPhone('');
    setRole('editor');
    setPhoneError('');
    addMember.reset();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={handleClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Add Member</Text>
            <Pressable onPress={handleClose} hitSlop={8}>
              <X size={24} color={theme.colors.foreground} />
            </Pressable>
          </View>

          <Input
            label="Phone Number"
            placeholder="+1 234 567 8900"
            value={phone}
            onChangeText={(text) => {
              setPhone(text);
              if (phoneError) setPhoneError('');
            }}
            error={phoneError}
            keyboardType="phone-pad"
            autoFocus
          />

          <View style={styles.roleSection}>
            <Text style={styles.roleLabel}>Role</Text>
            <View style={styles.roleOptions}>
              {ROLES.map((r) => {
                const isSelected = role === r.value;
                return (
                  <Pressable
                    key={r.value}
                    onPress={() => setRole(r.value)}
                    style={[styles.roleOption, isSelected && styles.roleOptionSelected]}
                  >
                    <View style={[styles.radio, isSelected && styles.radioSelected]}>
                      {isSelected ? <View style={styles.radioInner} /> : null}
                    </View>
                    <Text
                      style={[
                        styles.roleOptionText,
                        isSelected && styles.roleOptionTextSelected,
                      ]}
                    >
                      {r.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {addMember.isError ? (
            <Text style={styles.errorText}>
              {addMember.error instanceof Error
                ? addMember.error.message
                : 'Failed to add member'}
            </Text>
          ) : null}

          <Button
            onPress={handleAdd}
            loading={addMember.isPending}
            disabled={addMember.isPending}
          >
            Add Member
          </Button>
        </View>
      </View>
    </Modal>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: theme.radii['2xl'],
    borderTopRightRadius: theme.radii['2xl'],
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    paddingBottom: theme.spacing['2xl'],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    ...theme.typography.h3,
    color: theme.colors.foreground,
  },
  roleSection: {
    gap: theme.spacing.sm,
  },
  roleLabel: {
    ...theme.typography.label,
    color: theme.colors.foreground,
  },
  roleOptions: {
    gap: theme.spacing.sm,
  },
  roleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  roleOptionSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surfaceMuted,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: theme.radii.full,
    borderWidth: 2,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: theme.colors.primary,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.primary,
  },
  roleOptionText: {
    ...theme.typography.body,
    color: theme.colors.foreground,
  },
  roleOptionTextSelected: {
    fontWeight: '600',
  },
  errorText: {
    ...theme.typography.caption,
    color: theme.colors.destructive,
  },
}));
