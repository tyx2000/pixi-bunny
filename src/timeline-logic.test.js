import test from "node:test";
import assert from "node:assert/strict";
import {
  getTimelineContentDuration,
  hasClipOverlap,
  sanitizeExportFileName,
} from "./timeline-logic.js";

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
