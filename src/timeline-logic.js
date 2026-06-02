export function getTimelineContentDuration(clips) {
  if (!Array.isArray(clips) || clips.length === 0) {
    return 0;
  }

  return Math.max(
    0,
    ...clips.map((clip) => {
      const startTime = Number.isFinite(clip?.startTime) ? clip.startTime : 0;
      const duration = Number.isFinite(clip?.duration) ? clip.duration : 0;

      return startTime + duration;
    })
  );
}

export function hasClipOverlap(clips, movingClip, trackIndex, startTime, duration, epsilon = 0) {
  const endTime = startTime + duration;

  return clips.some((clip) => {
    if (!clip || clip === movingClip || clip.trackIndex !== trackIndex) {
      return false;
    }

    const clipStart = clip.startTime;
    const clipEnd = clip.startTime + clip.duration;

    return startTime < clipEnd - epsilon && endTime > clipStart + epsilon;
  });
}

export function sanitizeExportFileName(value) {
  const trimmed = String(value || "").trim();
  const safeName = (trimmed || "video-overlay.mp4").replace(/[/:*?"<>|\\]/g, "-");

  return /\.mp4$/i.test(safeName) ? safeName : `${safeName}.mp4`;
}
