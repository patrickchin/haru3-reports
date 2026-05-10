/**
 * Hook to hydrate the upload queue on app launch.
 *
 * Calls getUploadQueue().hydrate() once on mount to resume
 * any pending uploads from AsyncStorage.
 */
import { useEffect } from "react";
import { getUploadQueue } from "./queue";

export function useHydrateUploadQueue() {
  useEffect(() => {
    void getUploadQueue().hydrate();
  }, []);
}
