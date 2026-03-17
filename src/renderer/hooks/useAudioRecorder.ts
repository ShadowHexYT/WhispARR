import { useEffect, useRef, useState } from "react";

type RecorderState = "idle" | "recording" | "stopped";

export function useAudioRecorder(selectedDeviceId: string | null) {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState("");
  const [level, setLevel] = useState(0);
  const chunksRef = useRef<number[]>([]);
  const sampleRateRef = useRef(44100);
  const contextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      void cleanup();
    };
  }, []);

  async function cleanup() {
    processorRef.current?.disconnect();
    processorRef.current = null;

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
      const processor = context.createScriptProcessor(1024, 1, 1);

      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        let energy = 0;
        for (let index = 0; index < input.length; index += 1) {
          const sample = input[index] ?? 0;
          chunksRef.current.push(sample);
          energy += sample * sample;
        }
        const rms = Math.sqrt(energy / Math.max(1, input.length));
        setLevel(Math.min(1, rms * 8));
      };

      source.connect(processor);
      processor.connect(context.destination);

      contextRef.current = context;
      processorRef.current = processor;
      streamRef.current = stream;
      sampleRateRef.current = context.sampleRate;
      setState("recording");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Microphone access failed.");
      setState("idle");
    }
  }

  async function stop() {
    const pcm = Float32Array.from(chunksRef.current);
    const sampleRate = sampleRateRef.current;
    const context = contextRef.current;

    processorRef.current?.disconnect();
    processorRef.current = null;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    contextRef.current = null;
    if (context) {
      void context.close().catch(() => {});
    }

    setState("stopped");
    setLevel(0);
    return {
      pcm,
      sampleRate
    };
  }

  function reset() {
    chunksRef.current = [];
    setState("idle");
    setError("");
    setLevel(0);
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
