import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react-native";
import { ProjectForm } from "./project-form";

describe("ProjectForm", () => {
  it("renders name and address fields", () => {
    const mockSubmit = async () => {};
    render(
      <ProjectForm onSubmit={mockSubmit} submitLabel="Create" />
    );

    expect(screen.getByPlaceholderText("Enter project name")).toBeTruthy();
    expect(screen.getByPlaceholderText("Enter project address")).toBeTruthy();
    expect(screen.getByText("Create")).toBeTruthy();
  });

  it("validates required name field", async () => {
    const mockSubmit = async () => {};
    const { getByText } = render(
      <ProjectForm onSubmit={mockSubmit} submitLabel="Create" />
    );

    const submitButton = getByText("Create");
    submitButton.props.onPress();

    // Wait for validation error (using findByText for async)
    const errorText = await screen.findByText("Project name is required");
    expect(errorText).toBeTruthy();
  });

  it("populates initial data", () => {
    const mockSubmit = async () => {};
    render(
      <ProjectForm
        initialData={{ name: "Test Project", address: "123 Main" }}
        onSubmit={mockSubmit}
        submitLabel="Save"
      />
    );

    const nameInput = screen.getByDisplayValue("Test Project");
    const addressInput = screen.getByDisplayValue("123 Main");

    expect(nameInput).toBeTruthy();
    expect(addressInput).toBeTruthy();
  });
});
