import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ProfileForm } from "../profile-form";
import type { Profile } from "@/infra/db-types";

// Mock the mutations module
vi.mock("../mutations", () => ({
  useUpdateProfile: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
}));

const mockProfile: Profile = {
  id: "user-1",
  phone: "+1234567890",
  full_name: "John Doe",
  company_name: "Acme Corp",
  avatar_url: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function Wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("ProfileForm", () => {
  it("renders with profile data", () => {
    render(
      <Wrapper>
        <ProfileForm profile={mockProfile} />
      </Wrapper>
    );

    const fullNameInput = screen.getByTestId("profile:full-name-input");
    const companyNameInput = screen.getByTestId("profile:company-name-input");
    const phoneInput = screen.getByTestId("profile:phone-input");

    expect(fullNameInput.props.value).toBe("John Doe");
    expect(companyNameInput.props.value).toBe("Acme Corp");
    expect(phoneInput.props.value).toBe("+1234567890");
    expect(phoneInput.props.editable).toBe(false);
  });

  it("validates required full_name field", async () => {
    render(
      <Wrapper>
        <ProfileForm profile={mockProfile} />
      </Wrapper>
    );

    const fullNameInput = screen.getByTestId("profile:full-name-input");
    const saveButton = screen.getByTestId("profile:btn-save");

    fireEvent.changeText(fullNameInput, "");
    fireEvent.press(saveButton);

    await waitFor(() => {
      expect(screen.queryByText("Full name is required")).toBeTruthy();
    });
  });

  it("calls onSuccess after successful update", async () => {
    const { useUpdateProfile } = await import("../mutations");
    const mockMutateAsync = vi.fn().mockResolvedValue(mockProfile);
    const mockOnSuccess = vi.fn();

    vi.mocked(useUpdateProfile).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    } as any);

    render(
      <Wrapper>
        <ProfileForm profile={mockProfile} onSuccess={mockOnSuccess} />
      </Wrapper>
    );

    const fullNameInput = screen.getByTestId("profile:full-name-input");
    const saveButton = screen.getByTestId("profile:btn-save");

    fireEvent.changeText(fullNameInput, "Jane Smith");
    fireEvent.press(saveButton);

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        full_name: "Jane Smith",
        company_name: "Acme Corp",
      });
      expect(mockOnSuccess).toHaveBeenCalled();
    });
  });

  it("disables save button when no changes", () => {
    render(
      <Wrapper>
        <ProfileForm profile={mockProfile} />
      </Wrapper>
    );

    const saveButton = screen.getByTestId("profile:btn-save");
    expect(saveButton.props.accessibilityState.disabled).toBe(true);
  });

  it("enables save button when form is dirty", () => {
    render(
      <Wrapper>
        <ProfileForm profile={mockProfile} />
      </Wrapper>
    );

    const fullNameInput = screen.getByTestId("profile:full-name-input");
    const saveButton = screen.getByTestId("profile:btn-save");

    fireEvent.changeText(fullNameInput, "Jane Smith");

    expect(saveButton.props.accessibilityState.disabled).toBe(false);
  });
});
