import React, { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import ReactDOM from "react-dom/client";
import { HudState } from "../shared/types";
import "./hud.css";

const exitSoundUrl = new URL("../../assets/Exit.mp3?v=20260317", import.meta.url).href;
const entranceSoundUrl = new URL("../../assets/Entrance.mp3?v=20260317", import.meta.url).href;

function Hud() {
  const [hudState, setHudState] = useState<HudState>({
    visible: false,
    level: 0,
    label: "Listening",
    soundEnabled: true,
    soundVolume: 0.8,
    hudScale: 100,
    moveMode: false
  });
  const isHeard = hudState.level > 0.03;
  const previousListeningRef = useRef(hudState.label === "Listening");
  const exitAudioRef = useRef<HTMLAudioElement | null>(null);
  const entranceAudioRef = useRef<HTMLAudioElement | null>(null);
  const isListening = hudState.label === "Listening";
  const hudPressActiveRef = useRef(false);

  useEffect(() => {
    exitAudioRef.current = new Audio(exitSoundUrl);
    exitAudioRef.current.volume = hudState.soundVolume ?? 0.8;
    entranceAudioRef.current = new Audio(entranceSoundUrl);
    entranceAudioRef.current.volume = hudState.soundVolume ?? 0.8;

    return () => {
      exitAudioRef.current = null;
      entranceAudioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const volume = hudState.soundVolume ?? 0.8;
    if (exitAudioRef.current) {
      exitAudioRef.current.volume = volume;
    }
    if (entranceAudioRef.current) {
      entranceAudioRef.current.volume = volume;
    }
  }, [hudState.soundVolume]);

  useEffect(() => {
    return window.wisprApi.onHudState((state) => {
      setHudState(state);
    });
  }, []);

  useEffect(() => {
    if (!previousListeningRef.current && isListening && hudState.soundEnabled !== false) {
      const audio = entranceAudioRef.current;
      if (audio) {
        audio.currentTime = 0;
        void audio.play().catch(() => {});
      }
    }

    if (previousListeningRef.current && !isListening && hudState.soundEnabled !== false) {
      const audio = exitAudioRef.current;
      if (audio) {
        audio.currentTime = 0;
        void audio.play().catch(() => {});
      }
    }

    previousListeningRef.current = isListening;
  }, [hudState.soundEnabled, isListening]);

  const bars = useMemo(() => {
    return new Array(18).fill(0).map((_, index) => {
      const offset = index / 17;
      const pulse = Math.max(0.18, hudState.level * (0.6 + Math.sin(offset * Math.PI) * 0.8));
      return `${Math.round(pulse * 100)}%`;
    });
  }, [hudState.level]);

  function stopHudPressToTalk() {
    if (!hudPressActiveRef.current) {
      return;
    }

    hudPressActiveRef.current = false;
    void window.wisprApi.stopHudPressToTalk();
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (hudState.moveMode || !hudState.visible) {
      return;
    }

    if (event.button !== 0) {
      return;
    }

    hudPressActiveRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    void window.wisprApi.startHudPressToTalk();
  }

  return (
    <div
      className={hudState.visible || hudState.moveMode ? "hud-shell visible" : "hud-shell"}
      style={{ "--hud-scale": `${Math.max(60, Math.min(160, hudState.hudScale ?? 100)) / 100}` } as CSSProperties}
    >
      <div
        className={hudState.moveMode ? "hud-pill move-mode" : "hud-pill"}
        onPointerDown={handlePointerDown}
        onPointerUp={() => stopHudPressToTalk()}
        onPointerCancel={() => stopHudPressToTalk()}
        onLostPointerCapture={() => stopHudPressToTalk()}
      >
        <div className={isHeard ? "hud-icon heard" : "hud-icon quiet"} />
        <div className="hud-wave">
          {bars.map((height, index) => (
            <span key={index} style={{ height }} />
          ))}
        </div>
        {hudState.moveMode && <div className="hud-move-badge">Drag pill</div>}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Hud />
  </React.StrictMode>
);
