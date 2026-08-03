function findFingerprint(file, type) {
  if (!file || !Array.isArray(file.fingerprints)) {
    return null;
  }
  const fp = file.fingerprints.find((f) => {
    return f.type === type;
  });
  return fp ? fp.value : null;
}

// Straight from Stash: ui/v2.5/src/utils/text.ts
const RESOLUTION_LADDER = [
  [6144, "HUGE"],
  [3840, "8K"],
  [3584, "7K"],
  [3000, "6K"],
  [2560, "5K"],
  [1920, "4K"],
  [1440, "1440p"],
  [1080, "1080p"],
  [720, "720p"],
  [540, "540p"],
  [480, "480p"],
  [360, "360p"],
  [240, "240p"],
  [144, "144p"],
];

function resolutionLabel(width, height) {
  if (!width || !height) {
    return null;
  }
  const number = width > height ? height : width;
  for (let i = 0; i < RESOLUTION_LADDER.length; i++) {
    if (number >= RESOLUTION_LADDER[i][0]) {
      return RESOLUTION_LADDER[i][1];
    }
  }
  return null;
}

export function deriveFileTech(file) {
  if (!file) {
    return {
      resolution: null,
      videoCodec: null,
      audioCodec: null,
      bitrateMbps: null,
      fps: null,
      phash: null,
      oshash: null,
    };
  }
  return {
    resolution: resolutionLabel(file.width, file.height),
    videoCodec: file.video_codec || null,
    audioCodec: file.audio_codec || null,
    bitrateMbps: file.bit_rate ? file.bit_rate / 1000000 : null,
    fps: file.frame_rate ? Math.round(file.frame_rate * 100) / 100 : null,
    phash: findFingerprint(file, "phash"),
    oshash: findFingerprint(file, "oshash"),
  };
}
