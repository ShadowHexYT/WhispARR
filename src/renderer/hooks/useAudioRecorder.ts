import { useEffect, useRef, useState } from "react";

type RecorderState = "idle" | "recording" | "stopped";

export function useAudioRecorder(selectedDeviceId: string | null) {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState("");
  const [level, setLevel] = useState(0);
  const chunksRef = useRef<number[]>([]);
  const sampleRateRef = useRef(44100);
  const contextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastLevelRef = useRef(0);
  const meterFrameCountRef = useRef(0);
  const meterAnimationFrameRef = useRef<number | null>(null);

  function stopMeterLoop() {
    if (meterAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(meterAnimationFrameRef.current);
      meterAnimationFrameRef.current = null;
    }
  }

  function resetMeter() {
    stopMeterLoop();
    lastLevelRef.current = 0;
    meterFrameCountRef.current = 0;
    setLevel(0);
  }

  function startMeterLoop() {
    const analyser = analyserRef.current;
    if (!analyser) {
      return;
    }

    const samples = new Float32Array(analyser.fftSize);
    const tick = () => {
      const currentAnalyser = analyserRef.current;
      if (!currentAnalyser) {
        meterAnimationFrameRef.current = null;
        return;
      }

      currentAnalyser.getFloatTimeDomainData(samples);
      let energy = 0;
      for (let index = 0; index < samples.length; index += 1) {
        const sample = samples[index] ?? 0;
        energy += sample * sample;
      }

      meterFrameCountRef.current += 1;
      const rms = Math.sqrt(energy / Math.max(1, samples.length));
      const nextLevel = Math.min(1, rms * 8);
      const roundedLevel = Math.round(nextLevel * 20) / 20;
      const previousLevel = lastLevelRef.current;
      const shouldPublish =
        meterFrameCountRef.current % 2 === 0 ||
        Math.abs(roundedLevel - previousLevel) >= 0.08 ||
        (roundedLevel === 0 && previousLevel !== 0) ||
        (roundedLevel > 0 && previousLevel === 0);

      if (shouldPublish) {
        lastLevelRef.current = roundedLevel;
        setLevel(roundedLevel);
      }

      meterAnimationFrameRef.current = window.requestAnimationFrame(tick);
    };

    stopMeterLoop();
    meterAnimationFrameRef.current = window.requestAnimationFrame(tick);
  }

  useEffect(() => {
    return () => {
      void cleanup();
    };
  }, []);

  async function cleanup() {
    resetMeter();

    sourceRef.current?.disconnect();
    sourceRef.current = null;
    analyserRef.current?.disconnect();
    analyserRef.current = null;
    processorRef.current?.disconnect();
    processorRef.current = null;
    silentGainRef.current?.disconnect();
    silentGainRef.current = null;

    if (contextRef.current) {
      await contextRef.current.close();
      contextRef.current = null;
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  async function start() {
    try {
      setError("");
      chunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: selectedDeviceId
          ? {
              deviceId: { exact: selectedDeviceId },
              echoCancellation: true,
              noiseSuppression: true
            }
          : {
              echoCancellation: true,
              noiseSuppression: true
            }
      });

      const context = new AudioContext();
      if (context.state === "suspended") {
        await context.resume();
      }
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.65;
      const processor = context.createScriptProcessor(1024, 1, 1);
      const silentGain = context.createGain();
      silentGain.gain.value = 0;

      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        for (let index = 0; index < input.length; index += 1) {
          const sample = input[index] ?? 0;
          chunksRef.current.push(sample);
        }
      };

      source.connect(analyser);
      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(context.destination);

      contextRef.current = context;
      sourceRef.current = source;
      analyserRef.current = analyser;
      processorRef.current = processor;
      silentGainRef.current = silentGain;
      streamRef.current = stream;
      sampleRateRef.current = context.sampleRate;
      resetMeter();
      startMeterLoop();
      setState("recording");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Microphone access failed.");
      resetMeter();
      setState("idle");
    }
  }

  async function stop() {
    const pcm = Float32Array.from(chunksRef.current);
    const sampleRate = sampleRateRef.current;
    const context = contextRef.current;

    sourceRef.current?.disconnect();
    sourceRef.current = null;
    analyserRef.current?.disconnect();
    analyserRef.current = null;
    processorRef.current?.disconnect();
    processorRef.current = null;
    silentGainRef.current?.disconnect();
    silentGainRef.current = null;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    contextRef.current = null;
    if (context) {
      void context.close().catch(() => {});
    }

    setState("stopped");
    resetMeter();
    return {
      pcm,
      sampleRate
    };
  }

  function reset() {
    chunksRef.current = [];
    setState("idle");
    setError("");
    resetMeter();
  }

  return {
    state,
    error,
    level,
    start,
    stop,
    reset
  };
}
