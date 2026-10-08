"use client";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { LANGUAGE_OPTIONS, useSettings } from "@/components/providers/SettingsProvider";
import { rankBrowserVoices } from "@/lib/tts/voices";
import { formatSpeed } from "@/lib/utils";
import { SPEEDS } from "@/types/reading";
import { useMemo, useState } from "react";

export function SettingsDialog() {
  const { settings, update, studios, browserVoices, settingsOpen, setSettingsOpen } = useSettings();
  const [showAllVoices, setShowAllVoices] = useState(false);
  const lang = settings.language === "auto" ? "en-US" : settings.language;
  const deviceVoices = useMemo(() => {
    const ranked = rankBrowserVoices(browserVoices, lang);
    if (showAllVoices) return ranked;
    const prefix = lang.slice(0, 2).toLowerCase();
    const matched = ranked.filter((voice) => voice.lang.toLowerCase().startsWith(prefix));
    return (matched.length ? matched : ranked).slice(0, 16);
  }, [browserVoices, lang, showAllVoices]);
  const studioSelected = Boolean(settings.voiceChoice && !settings.voiceChoice.startsWith("browser:"));

  return (
    <Dialog
      open={settingsOpen}
      title="Reading settings"
      description="The defaults are enough. Change these only if you want to."
      onClose={() => setSettingsOpen(false)}
    >
      <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
        <fieldset>
          <legend className="text-sm font-medium">Theme</legend>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {(["light", "dark", "system"] as const).map((theme) => (
              <button
                key={theme}
                type="button"
                aria-pressed={settings.theme === theme}
                className="h-10 rounded-full border border-line capitalize aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-bg"
                onClick={() => update({ theme })}
              >
                {theme}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="block text-sm font-medium">
          Voice
          <select
            className="mt-2 h-11 w-full rounded-lg border border-line bg-bg px-3 text-base"
            value={settings.voiceChoice ?? ""}
            onChange={(event) => update({ voiceChoice: event.target.value || null })}
          >
            <option value="">Automatic</option>
            {studios.map((studio) => (
              <optgroup key={studio.id} label={studio.name}>
                {studio.voices.map((voice) => (
                  <option key={`${studio.id}:${voice.id}`} value={`${studio.id}:${voice.id}`}>
                    {voice.name}
                  </option>
                ))}
              </optgroup>
            ))}
            <optgroup label="On this device">
              {deviceVoices.map((voice) => (
                <option key={voice.voiceURI} value={`browser:${voice.voiceURI}`}>
                  {voice.name} ({voice.lang})
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <button
          type="button"
          className="text-sm text-muted underline-offset-2 hover:underline"
          onClick={() => setShowAllVoices((value) => !value)}
        >
          {showAllVoices ? "Show fewer device voices" : "Show all device voices"}
        </button>

        <fieldset>
          <legend className="text-sm font-medium">Speed</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {SPEEDS.map((rate) => (
              <button
                key={rate}
                type="button"
                aria-pressed={settings.rate === rate}
                className="h-9 min-w-12 rounded-full border border-line px-3 text-sm aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-bg"
                onClick={() => update({ rate })}
              >
                {formatSpeed(rate)}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="block text-sm font-medium">
          Pitch
          <input
            className="mt-2 w-full"
            type="range"
            min={0.5}
            max={1.5}
            step={0.05}
            value={settings.pitch}
            disabled={studioSelected}
            aria-valuetext={settings.pitch.toFixed(2)}
            onChange={(event) => update({ pitch: Number(event.target.value) })}
          />
          <span className="mt-1 block text-xs font-normal text-faint">
            {studioSelected ? "Pitch follows this voice." : settings.pitch.toFixed(2)}
          </span>
        </label>

        <label className="block text-sm font-medium">
          Volume
          <input
            className="mt-2 w-full"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={settings.volume}
            aria-valuetext={`${Math.round(settings.volume * 100)} percent`}
            onChange={(event) => update({ volume: Number(event.target.value) })}
          />
        </label>

        <label className="block text-sm font-medium">
          Language
          <select
            className="mt-2 h-11 w-full rounded-lg border border-line bg-bg px-3 text-base"
            value={settings.language}
            onChange={(event) => update({ language: event.target.value })}
          >
            {LANGUAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <p className="text-xs leading-5 text-faint">
          Space plays and pauses. Left and right arrows move by sentence. Bracket keys change speed.
          Studio voices are used when a speech key is configured on the server. Otherwise ReadFlow uses a
          voice already on this device.
        </p>
        <div className="flex justify-end">
          <Button onClick={() => setSettingsOpen(false)}>Done</Button>
        </div>
      </div>
    </Dialog>
  );
}
