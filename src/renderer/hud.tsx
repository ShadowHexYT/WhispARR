import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { HudState } from "../shared/types";
import "./hud.css";

const popSoundUrl = new URL("../../assets/pop_sound.mp3", import.meta.url).href;
const startHumSoundUrl = new URL("../../assets/start_hum.mp3", import.meta.url).href;

function Hud() {
  const [hudState, setHudState] = useState<HudState>({
    visible: false,
    level: 0,
    label: "Listening",
    soundEnabled: true,
    soundVolume: 0.8,
    moveMode: false
  });
  const isHeard = hudState.level > 0.03;
  const previousVisibleRef = useRef(false);
  const popAudioRef = useRef<HTMLAudioElement | null>(null);
  const startHumAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    popAudioRef.current = new Audio(popSoundUrl);
    popAudioRef.current.volume = hudState.soundVolume ?? 0.8;
    startHumAudioRef.current = new Audio(startHumSoundUrl);
    startHumAudioRef.current.volume = hudState.soundVolume ?? 0.8;

    return () => {
      popAudioRef.current = null;
      startHumAudioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const volume = hudState.soundVolume ?? 0.8;
    if (popAudioRef.current) {
      popAudioRef.current.volume = volume;
    }
    if (startHumAudioRef.current) {
      startHumAudioRef.current.volume = volume;
    }
  }, [hudState.soundVolume]);

  useEffect(() => {
    return window.wisprApi.onHudState((state) => {
      setHudState(state);
    });
  }, []);

  useEffect(() => {
    if (!previousVisibleRef.current && hudState.visible && hudState.soundEnabled !== false) {
      const audio = startHumAudioRef.current;
      if (audio) {
        audio.currentTime = 0;
        void audio.play().catch(() => {});
      }
    }

    if (previousVisibleRef.current && !hudState.visible && hudState.soundEnabled !== false) {
      const audio = popAudioRef.current;
      if (audio) {
        audio.currentTime = 0;
        void audio.play().catch(() => {});
      }
    }

    previousVisibleRef.current = hudState.visible;
  }, [hudState.visible]);

  const bars = useMemo(() => {
    return new Array(18).fill(0).map((_, index) => {
      const offset = index / 17;
      const pulse = Math.max(0.18, hudState.level * (0.6 + Math.sin(offset * Math.PI) * 0.8));
      return `${Math.round(pulse * 100)}%`;
    });
  }, [hudState.level]);

  return (
    <div className={hudState.visible || hudState.moveMode ? "hud-shell visible" : "hud-shell"}>
      <div className={hudState.moveMode ? "hud-pill move-mode" : "hud-pill"}>
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
