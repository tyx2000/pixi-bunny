import test from "node:test";
import assert from "node:assert/strict";
import {
  captureTimelineState,
  cloneTimelineClipState,
  createPortableProjectState,
  getClipSourceOffset,
  getClipTrackIndex,
  getTimelineContentDuration,
  hasClipOverlap,
  sanitizeExportFileName,
} from "./media/timeline-model.js";

test("getTimelineContentDuration returns the latest clip end", () => {
  assert.equal(
    getTimelineContentDuration([
      { startTime: 0, duration: 2 },
      { startTime: 4.5, duration: 1.25 },
      { startTime: 3, duration: 0.5 },
    ]),
    5.75
  );
});

test("hasClipOverlap only compares clips on the target track", () => {
  const clip = { startTime: 1, duration: 2, trackIndex: 0 };
  const clips = [clip, { startTime: 2.5, duration: 1, trackIndex: 0 }];

  assert.equal(hasClipOverlap(clips, clip, 0, 2, 1), true);
  assert.equal(hasClipOverlap(clips, clip, 1, 2, 1), false);
});

test("sanitizeExportFileName keeps mp4 extension and replaces illegal characters", () => {
  assert.equal(sanitizeExportFileName('a/b:c*clip?"<x>|'), "a-b-c-clip---x--.mp4");
  assert.equal(sanitizeExportFileName("final.mp4"), "final.mp4");
});

test("clip fallback helpers normalize missing values", () => {
  assert.equal(getClipSourceOffset({ sourceOffset: -1 }), 0);
  assert.equal(getClipSourceOffset({ sourceOffset: 1.25 }), 1.25);
  assert.equal(getClipTrackIndex({ trackIndex: -2 }), 0);
  assert.equal(getClipTrackIndex({ trackIndex: 3 }), 3);
});

test("cloneTimelineClipState preserves only image clip state fields", () => {
  const texture = { id: "texture" };
  const imageElement = { id: "image" };
  const clone = cloneTimelineClipState("image", {
    duration: 5,
    imageElement,
    imageFrame: { height: 20, width: 10, x: 1, y: 2 },
    imageFrameRatio: { height: 0.2, width: 0.1, x: 0.01, y: 0.02 },
    startTime: 2,
    texture,
    trackIndex: 1,
    transitionSeconds: 0.4,
    transitionType: "rotateY",
  });

  assert.deepEqual(clone.imageFrame, { height: 20, width: 10, x: 1, y: 2 });
  assert.deepEqual(clone.imageFrameRatio, { height: 0.2, width: 0.1, x: 0.01, y: 0.02 });
  assert.equal(clone.texture, texture);
  assert.equal(clone.imageElement, imageElement);
});

test("captureTimelineState groups typed clip snapshots", () => {
  const state = captureTimelineState({
    audioTimelineClips: [{ duration: 2, startTime: 0, trackIndex: 0, volume: 0.5 }],
    editableDuration: 6,
    imageTimelineClips: [],
    playbackTime: 1.25,
    textTimelineClips: [{ duration: 1, startTime: 3, text: "Caption", trackIndex: 0 }],
    videoTimelineClips: [{ duration: 4, muted: true, sourceOffset: 0.5, startTime: 0 }],
    zoom: 12,
  });

  assert.equal(state.audio[0].volume, 0.5);
  assert.equal(state.text[0].text, "Caption");
  assert.equal(state.video[0].muted, true);
  assert.equal(state.zoom, 12);
});

test("createPortableProjectState strips runtime resource references", () => {
  const project = createPortableProjectState({
    audio: [],
    image: [
      {
        duration: 5,
        file: { lastModified: 123, name: "overlay.png", size: 456, type: "image/png" },
        imageElement: {},
        startTime: 0,
        texture: {},
      },
    ],
    text: [],
    video: [],
  });

  assert.deepEqual(project.image[0], {
    duration: 5,
    fileLastModified: 123,
    fileName: "overlay.png",
    fileSize: 456,
    fileType: "image/png",
    relinkRequired: true,
    startTime: 0,
  });
});
