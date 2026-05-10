import { useEffect } from "react";
import { Redirect } from "expo-router";
import { useAuth } from "@/features/auth";
import { LoadingDots } from "@/shared/components/LoadingDots";

export default function IndexScreen() {
  const { session, profile, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingDots />;
  }

  if (!session) {
    return <Redirect href="/sign-in" />;
  }

  if (!profile || !profile.full_name || !profile.company_name) {
    return <Redirect href="/onboarding" />;
  }

  return <Redirect href="/(tabs)/projects" />;
}
