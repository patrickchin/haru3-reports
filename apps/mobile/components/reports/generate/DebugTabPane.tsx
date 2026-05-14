import { useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
} from "lucide-react-native";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { useGenerateReport } from "@/components/reports/generate/GenerateReportProvider";
import { colors } from "@/lib/design-tokens/colors";

interface DebugTabPaneProps {
  width: number;
}

const monoStyle = {
  fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
} as const;

export function DebugTabPane({ width }: DebugTabPaneProps) {
  const { notes, generation } = useGenerateReport();
  const notesCount = notes.list.length;
  const { copy: copyDebug, isCopied: isDebugCopied } = useCopyToClipboard();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    request: true,
    prompt: true,
    response: true,
    error: false,
  });
  const toggle = (key: string) =>
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));

  // Prefer in-memory rawResponse from the current session; fall back to
  // the persisted lastGeneration when the user just opened a draft and
  // hasn't regenerated yet.
  const debugRawRequest = generation.rawRequest ?? generation.lastGeneration?.request ?? null;
  const debugRawResponse = generation.rawResponse ?? generation.lastGeneration?.response ?? null;

  const { systemPrompt, userPrompt, combined } = useMemo(() => {
    const sys =
      debugRawResponse && typeof debugRawResponse === "object" && "systemPrompt" in debugRawResponse
        ? String((debugRawResponse as { systemPrompt?: unknown }).systemPrompt ?? "")
        : (generation.lastGeneration?.systemPrompt ?? "");
    const usr =
      debugRawResponse && typeof debugRawResponse === "object" && "userPrompt" in debugRawResponse
        ? String((debugRawResponse as { userPrompt?: unknown }).userPrompt ?? "")
        : (generation.lastGeneration?.userPrompt ?? "");
    const com =
      sys || usr
        ? [
            sys ? `# System\n\n${sys}` : "",
            usr ? `# User\n\n${usr}` : "",
          ]
            .filter(Boolean)
            .join("\n\n---\n\n")
        : "";
    return { systemPrompt: sys, userPrompt: usr, combined: com };
  }, [debugRawResponse, generation.lastGeneration]);

  return (
    <View style={{ width }} className="flex-1">
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        <View className="gap-4">
          <View className="flex-row items-center gap-2 border border-border bg-card p-3">
            <Text className="text-sm font-bold text-foreground">Status:</Text>
            <Text className="text-sm text-foreground" style={monoStyle}>
              {generation.mutationStatus}
            </Text>
            <Text className="text-sm font-bold text-foreground">Notes:</Text>
            <Text className="text-sm text-foreground" style={monoStyle}>
              {notesCount}
            </Text>
          </View>

          {/* Request */}
          <View>
            <Pressable
              onPress={() => toggle("request")}
              className="mb-1 flex-row items-center gap-1"
              accessibilityLabel="Toggle request body"
            >
              {collapsed.request ? (
                <ChevronRight size={16} color={colors.foreground} />
              ) : (
                <ChevronDown size={16} color={colors.foreground} />
              )}
              <Text className="text-lg font-bold text-foreground">Request Body</Text>
            </Pressable>
            {!collapsed.request && (
              <View className="border border-border bg-card p-3">
                <ScrollView horizontal showsHorizontalScrollIndicator>
                  <Text className="text-xs text-foreground" style={monoStyle}>
                    {debugRawRequest
                      ? JSON.stringify(debugRawRequest, null, 2)
                      : "No request yet — tap Generate / Update report on the Notes tab."}
                  </Text>
                </ScrollView>
              </View>
            )}
          </View>

          {/* Prompt */}
          <View>
            <View className="mb-1 flex-row items-center justify-between">
              <Pressable
                onPress={() => toggle("prompt")}
                className="flex-row items-center gap-1"
                accessibilityLabel="Toggle prompt"
              >
                {collapsed.prompt ? (
                  <ChevronRight size={16} color={colors.foreground} />
                ) : (
                  <ChevronDown size={16} color={colors.foreground} />
                )}
                <Text className="text-lg font-bold text-foreground">Prompt</Text>
              </Pressable>
              {(systemPrompt || userPrompt) && (
                <View className="flex-row gap-2">
                  <Pressable
                    onPress={() =>
                      copyDebug(systemPrompt, {
                        key: "system",
                        toast: "System prompt copied",
                      })
                    }
                    disabled={!systemPrompt}
                    className="flex-row items-center gap-1 border border-border bg-card px-2 py-1"
                    accessibilityLabel="Copy system prompt"
                  >
                    {isDebugCopied("system") ? (
                      <Check size={12} color={colors.success.DEFAULT} />
                    ) : (
                      <Copy size={12} color={colors.muted.foreground} />
                    )}
                    <Text className="text-xs text-foreground">System</Text>
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      copyDebug(userPrompt, {
                        key: "user",
                        toast: "User prompt copied",
                      })
                    }
                    disabled={!userPrompt}
                    className="flex-row items-center gap-1 border border-border bg-card px-2 py-1"
                    accessibilityLabel="Copy user prompt"
                  >
                    {isDebugCopied("user") ? (
                      <Check size={12} color={colors.success.DEFAULT} />
                    ) : (
                      <Copy size={12} color={colors.muted.foreground} />
                    )}
                    <Text className="text-xs text-foreground">User</Text>
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      copyDebug(combined, {
                        key: "combined",
                        toast: "Full prompt copied",
                      })
                    }
                    disabled={!combined}
                    className="flex-row items-center gap-1 border border-border bg-card px-2 py-1"
                    accessibilityLabel="Copy full prompt"
                  >
                    {isDebugCopied("combined") ? (
                      <Check size={12} color={colors.success.DEFAULT} />
                    ) : (
                      <Copy size={12} color={colors.muted.foreground} />
                    )}
                    <Text className="text-xs text-foreground">Full</Text>
                  </Pressable>
                </View>
              )}
            </View>
            {!collapsed.prompt && (
              <View className="border border-border bg-card p-3">
                {systemPrompt || userPrompt ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator>
                    <Text className="text-xs text-foreground" style={monoStyle}>
                      {combined}
                    </Text>
                  </ScrollView>
                ) : (
                  <Text className="text-xs text-muted-foreground">
                    No prompt yet — generate a report to capture it.
                  </Text>
                )}
              </View>
            )}
          </View>

          {/* Response */}
          <View>
            <Pressable
              onPress={() => toggle("response")}
              className="mb-1 flex-row items-center gap-1"
              accessibilityLabel="Toggle LLM response"
            >
              {collapsed.response ? (
                <ChevronRight size={16} color={colors.foreground} />
              ) : (
                <ChevronDown size={16} color={colors.foreground} />
              )}
              <Text className="text-lg font-bold text-foreground">LLM Response</Text>
            </Pressable>
            {!collapsed.response && (
              <View className="border border-border bg-card p-3">
                <ScrollView horizontal showsHorizontalScrollIndicator>
                  <Text className="text-xs text-foreground" style={monoStyle}>
                    {debugRawResponse ? JSON.stringify(debugRawResponse, null, 2) : ""}
                  </Text>
                </ScrollView>
              </View>
            )}
          </View>

          {/* Error */}
          {generation.error && (
            <View>
              <Pressable
                onPress={() => toggle("error")}
                className="mb-1 flex-row items-center gap-1"
                accessibilityLabel="Toggle error"
              >
                {collapsed.error ? (
                  <ChevronRight size={16} color={colors.danger.DEFAULT} />
                ) : (
                  <ChevronDown size={16} color={colors.danger.DEFAULT} />
                )}
                <Text className="text-lg font-bold text-destructive">Error</Text>
              </Pressable>
              {!collapsed.error && (
                <View className="border border-destructive bg-card p-3">
                  <ScrollView horizontal showsHorizontalScrollIndicator>
                    <Text className="text-xs text-destructive" style={monoStyle}>
                      {generation.error}
                    </Text>
                  </ScrollView>
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
