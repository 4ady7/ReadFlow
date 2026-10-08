"use client";

import { LibraryProvider } from "@/components/providers/LibraryProvider";
import { MiniPlayer } from "@/components/audio/MiniPlayer";
import { PlaybackProvider } from "@/components/providers/PlaybackProvider";
import { SettingsProvider } from "@/components/providers/SettingsProvider";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import type { ReactNode } from "react";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SettingsProvider>
      <LibraryProvider>
        <PlaybackProvider>
          {children}
          <MiniPlayer />
          <SettingsDialog />
        </PlaybackProvider>
      </LibraryProvider>
    </SettingsProvider>
  );
}
