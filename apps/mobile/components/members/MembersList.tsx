import { Pressable, Text, View } from "react-native";
import { Trash2, Crown, Shield, Pencil, Eye } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import type { TeamMember, MemberRole } from "@/lib/project-members";
import { ROLE_LABELS } from "@/lib/project-members";

interface MembersListProps {
  team: TeamMember[];
  currentUserId: string | null;
  canManage: boolean;
  onRemove: (member: TeamMember) => void;
}

const ROLE_ICONS: Record<MemberRole | "owner", typeof Crown> = {
  owner: Crown,
  admin: Shield,
  editor: Pencil,
  viewer: Eye,
};

function RoleBadge({ role }: { role: MemberRole | "owner" }) {
  const Icon = ROLE_ICONS[role];
  const label = role === "owner" ? "Owner" : ROLE_LABELS[role as MemberRole];
  return (
    <View className="flex-row items-center gap-1 rounded-md border border-border bg-surface-muted px-2 py-0.5">
      <Icon size={12} color="#5c5c6e" />
      <Text className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </Text>
    </View>
  );
}

function MemberRow({
  name,
  company,
  role,
  canRemove,
  onRemove,
}: {
  name: string | null;
  company: string | null;
  role: MemberRole | "owner";
  canRemove: boolean;
  onRemove?: () => void;
}) {
  const displayName = name ?? "Unknown";
  return (
    <Card variant="default" padding="md" className="flex-row items-center gap-3">
      <View className="h-10 w-10 items-center justify-center rounded-full border border-border bg-surface-muted">
        <Text className="text-sm font-bold text-muted-foreground">
          {displayName.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <View className="flex-row items-center gap-2">
          <Text className="text-base font-semibold text-foreground" numberOfLines={1}>
            {displayName}
          </Text>
          <RoleBadge role={role} />
        </View>
        {company ? (
          <Text className="text-sm text-muted-foreground" numberOfLines={1}>
            {company}
          </Text>
        ) : null}
      </View>
      {canRemove && onRemove ? (
        <Pressable
          onPress={onRemove}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Remove member"
        >
          <Trash2 size={18} color="#dc2626" />
        </Pressable>
      ) : null}
    </Card>
  );
}

export function MembersList({
  team,
  currentUserId,
  canManage,
  onRemove,
}: MembersListProps) {
  return (
    <View className="gap-2">
      {team.map((member) => (
        <MemberRow
          key={member.member_id ?? member.user_id}
          name={member.full_name}
          company={member.company_name}
          role={member.role}
          canRemove={canManage && !member.is_owner && member.user_id !== currentUserId}
          onRemove={() => onRemove(member)}
        />
      ))}
    </View>
  );
}
