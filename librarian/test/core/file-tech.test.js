import test from "node:test";
import assert from "node:assert/strict";
import { deriveFileTech } from "../../src/core/file-tech.js";

test("derives resolution/codecs/bitrate/fps/phash/oshash from a single file's own fields", () => {
  const file = {
    id: "1",
    width: 1920,
    height: 1080,
    video_codec: "h264",
    audio_codec: "aac",
    bit_rate: 8000000,
    frame_rate: 30,
    fingerprints: [
      { type: "phash", value: "abc123" },
      { type: "oshash", value: "def456" },
    ],
  };
  const tech = deriveFileTech(file);
  assert.equal(tech.resolution, "1080p");
  assert.equal(tech.videoCodec, "h264");
  assert.equal(tech.audioCodec, "aac");
  assert.equal(tech.bitrateMbps, 8);
  assert.equal(tech.fps, 30);
  assert.equal(tech.phash, "abc123");
  assert.equal(tech.oshash, "def456");
});

test("fps is rounded to 2 decimal places, dropping long float artifacts from container metadata", () => {
  assert.equal(deriveFileTech({ frame_rate: 23.976023976023978 }).fps, 23.98);
  assert.equal(deriveFileTech({ frame_rate: 30 }).fps, 30);
});

test("resolution ladder matches Stash's own TextUtils.resolution at representative boundaries", () => {
  assert.equal(deriveFileTech({ width: 3840, height: 2160 }).resolution, "4K");
  assert.equal(
    deriveFileTech({ width: 1920, height: 1080 }).resolution,
    "1080p",
  );
  assert.equal(deriveFileTech({ width: 1280, height: 720 }).resolution, "720p");
  assert.equal(
    deriveFileTech({ width: 1080, height: 1920 }).resolution,
    "1080p",
  );
  assert.equal(deriveFileTech({ width: 100, height: 100 }).resolution, null);
});

test("resolution/codec/bitrate/fps/phash/oshash are all null for a null file or a file lacking that data", () => {
  const nullFile = deriveFileTech(null);
  assert.equal(nullFile.resolution, null);
  assert.equal(nullFile.videoCodec, null);
  assert.equal(nullFile.audioCodec, null);
  assert.equal(nullFile.bitrateMbps, null);
  assert.equal(nullFile.fps, null);
  assert.equal(nullFile.phash, null);
  assert.equal(nullFile.oshash, null);

  const bareFile = deriveFileTech({ id: "1" });
  assert.equal(bareFile.resolution, null);
  assert.equal(bareFile.videoCodec, null);
  assert.equal(bareFile.audioCodec, null);
  assert.equal(bareFile.bitrateMbps, null);
  assert.equal(bareFile.fps, null);
  assert.equal(bareFile.phash, null);
  assert.equal(bareFile.oshash, null);
});

test("phash/oshash are each found independently among multiple fingerprint types, not assumed to be the only one or confused with each other", () => {
  const file = {
    id: "1",
    fingerprints: [
      { type: "oshash", value: "the-real-oshash" },
      { type: "phash", value: "the-real-phash" },
      { type: "md5", value: "but-not-this" },
    ],
  };
  assert.equal(deriveFileTech(file).phash, "the-real-phash");
  assert.equal(deriveFileTech(file).oshash, "the-real-oshash");
});
