import { Component, type ErrorInfo, type ReactNode } from "react";
import { Text, View } from "react-native";
import { Button } from "./Button";

type ErrorBoundaryProps = {
  children: ReactNode;
  fallback?: (error: Error) => ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error);
      }

      return (
        <View className="flex-1 items-center justify-center bg-background px-6">
          <Text className="text-title text-foreground mb-4">
            Something went wrong
          </Text>
          <Text className="text-body text-muted-foreground mb-6 text-center">
            {this.state.error.message}
          </Text>
          <Button
            onPress={() => this.setState({ hasError: false, error: null })}
          >
            <Text className="text-body text-primary-foreground font-semibold">
              Try again
            </Text>
          </Button>
        </View>
      );
    }

    return this.props.children;
  }
}
