import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { type ReactNode } from "react";
import {
  useProfile,
  useTokenUsage,
  useTokenUsageEvents,
  useTokenUsageHistory,
} from "../queries";

// Mock supabase
vi.mock("@/infra/supabase", () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(),
  },
}));

describe("Account Queries", () => {
  let queryClient: QueryClient;
  // @ts-expect-error: JSX namespace requires React 19+ types, safe to ignore in test context
  let wrapper: ({ children }: { children: ReactNode }) => JSX.Element;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  });

  describe("useProfile", () => {
    it("fetches profile for authenticated user", async () => {
      const { supabase } = await import("@/infra/supabase");
      const mockUser = { 
        id: "user-1", 
        phone: "+1234567890",
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: "2026-01-01T00:00:00Z",
      };
      const mockProfile = {
        id: "user-1",
        phone: "+1234567890",
        full_name: "John Doe",
        company_name: "Acme Corp",
        avatar_url: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      };

      vi.mocked(supabase.auth.getUser).mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: mockProfile,
              error: null,
            }),
          }),
        }),
      } as any);

      const { result } = renderHook(() => useProfile(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockProfile);
    });
  });

  describe("useTokenUsage", () => {
    it("fetches current month usage", async () => {
      const { supabase } = await import("@/infra/supabase");
      const mockUser = { id: "user-1", app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: "2026-01-01T00:00:00Z" };
      const mockUsage = {
        user_id: "user-1",
        month: "2026-05-01T00:00:00Z",
        input_tokens: 1000,
        output_tokens: 500,
        cached_tokens: 200,
        generation_count: 5,
      };

      vi.mocked(supabase.auth.getUser).mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: mockUsage,
                error: null,
              }),
            }),
          }),
        }),
      } as any);

      const { result } = renderHook(() => useTokenUsage(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockUsage);
    });

    it("returns null when no usage data exists", async () => {
      const { supabase } = await import("@/infra/supabase");
      const mockUser = { id: "user-1", app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: "2026-01-01T00:00:00Z" };

      vi.mocked(supabase.auth.getUser).mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            }),
          }),
        }),
      } as any);

      const { result } = renderHook(() => useTokenUsage(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBeNull();
    });
  });

  describe("useTokenUsageEvents", () => {
    it("fetches events for the last N days", async () => {
      const { supabase } = await import("@/infra/supabase");
      const mockUser = { id: "user-1", app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: "2026-01-01T00:00:00Z" };
      const mockEvents = [
        {
          id: "event-1",
          user_id: "user-1",
          project_id: "project-1",
          report_id: "report-1",
          input_tokens: 100,
          output_tokens: 50,
          cached_tokens: 20,
          model: "gpt-4",
          provider: "openai",
          created_at: "2026-05-10T10:00:00Z",
        },
      ];

      vi.mocked(supabase.auth.getUser).mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                returns: vi.fn().mockResolvedValue({
                  data: mockEvents,
                  error: null,
                }),
              }),
            }),
          }),
        }),
      } as any);

      const { result } = renderHook(() => useTokenUsageEvents(30), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockEvents);
    });
  });

  describe("useTokenUsageHistory", () => {
    it("fetches monthly history ordered by month", async () => {
      const { supabase } = await import("@/infra/supabase");
      const mockUser = { id: "user-1", app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: "2026-01-01T00:00:00Z" };
      const mockHistory = [
        {
          user_id: "user-1",
          month: "2026-05-01T00:00:00Z",
          input_tokens: 1000,
          output_tokens: 500,
          cached_tokens: 200,
          generation_count: 5,
        },
        {
          user_id: "user-1",
          month: "2026-04-01T00:00:00Z",
          input_tokens: 800,
          output_tokens: 400,
          cached_tokens: 150,
          generation_count: 4,
        },
      ];

      vi.mocked(supabase.auth.getUser).mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              returns: vi.fn().mockResolvedValue({
                data: mockHistory,
                error: null,
              }),
            }),
          }),
        }),
      } as any);

      const { result } = renderHook(() => useTokenUsageHistory(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockHistory);
    });
  });
});
