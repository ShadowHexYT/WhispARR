import { VoiceEmbedding } from "../../shared/types";

function averageBandEnergies(pcm: Float32Array, bandCount = 16) {
  const bands = new Array<number>(bandCount).fill(0);
  const windowSize = Math.max(1, Math.floor(pcm.length / bandCount));

  for (let bandIndex = 0; bandIndex < bandCount; bandIndex += 1) {
    let sum = 0;
    const start = bandIndex * windowSize;
    const end = Math.min(pcm.length, start + windowSize);

    for (let index = start; index < end; index += 1) {
      const sample = pcm[index] ?? 0;
      sum += Math.abs(sample);
    }

    bands[bandIndex] = sum / Math.max(1, end - start);
  }

  const max = Math.max(...bands, 1e-6);
  return bands.map((value) => value / max);
}

export function computeVoiceEmbedding(pcm: Float32Array, _sampleRate: number): VoiceEmbedding {
  const segment = pcm.slice(0, Math.min(4096, pcm.length));
  const rms = Math.sqrt(
    segment.reduce((acc, sample) => acc + sample * sample, 0) / Math.max(1, segment.length)
  );
  let zeroCrossings = 0;

  for (let index = 1; index < segment.length; index += 1) {
    if ((segment[index - 1] ?? 0) * (segment[index] ?? 0) < 0) {
      zeroCrossings += 1;
    }
  }

  return {
    bands: averageBandEnergies(segment),
    rms,
    zcr: zeroCrossings / Math.max(1, segment.length)
  };
}

export function scoreVoiceMatch(reference: VoiceEmbedding, candidate: VoiceEmbedding) {
  const bandDistance = reference.bands.reduce((acc, value, index) => {
    const delta = value - (candidate.bands[index] ?? 0);
    return acc + delta * delta;
  }, 0);

  const rmsPenalty = Math.abs(reference.rms - candidate.rms);
  const zcrPenalty = Math.abs(reference.zcr - candidate.zcr);
  const score = 1 / (1 + bandDistance + rmsPenalty * 2 + zcrPenalty * 6);

  return Number(score.toFixed(3));
}

export function hasAudibleSpeech(pcm: Float32Array) {
  if (pcm.length === 0) {
    return false;
  }

  const windowSize = Math.max(512, Math.min(2048, Math.floor(pcm.length / 8) || 512));
  let overallPeak = 0;
  let bestWindowRms = 0;
  let bestActivityRatio = 0;

  for (let start = 0; start < pcm.length; start += windowSize) {
    const end = Math.min(pcm.length, start + windowSize);
    let peak = 0;
    let energy = 0;
    let activeSamples = 0;

    for (let index = start; index < end; index += 1) {
      const value = Math.abs(pcm[index] ?? 0);
      peak = Math.max(peak, value);
      energy += value * value;
      if (value > 0.012) {
        activeSamples += 1;
      }
    }

    const length = Math.max(1, end - start);
    const rms = Math.sqrt(energy / length);
    const activityRatio = activeSamples / length;

    overallPeak = Math.max(overallPeak, peak);
    bestWindowRms = Math.max(bestWindowRms, rms);
    bestActivityRatio = Math.max(bestActivityRatio, activityRatio);
  }

  return overallPeak > 0.02 && bestWindowRms > 0.006 && bestActivityRatio > 0.02;
}
