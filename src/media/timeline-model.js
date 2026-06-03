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
    if (!clip || clip === movingClip || getClipTrackIndex(clip) !== trackIndex) {
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

export function getClipSourceOffset(clip) {
  return Math.max(0, Number.isFinite(clip?.sourceOffset) ? clip.sourceOffset : 0);
}

export function getClipTrackIndex(clip) {
  return Math.max(0, Number.isFinite(clip?.trackIndex) ? clip.trackIndex : 0);
}

export function captureTimelineState({
  audioTimelineClips,
  editableDuration,
  imageTimelineClips,
  playbackTime,
  textTimelineClips,
  videoTimelineClips,
  zoom,
}) {
  return {
    audio: audioTimelineClips.map((clip) => cloneTimelineClipState("audio", clip)),
    editableDuration,
    image: imageTimelineClips.map((clip) => cloneTimelineClipState("image", clip)),
    playbackTime,
    text: textTimelineClips.map((clip) => cloneTimelineClipState("text", clip)),
    video: videoTimelineClips.map((clip) => cloneTimelineClipState("video", clip)),
    zoom,
  };
}

export function cloneTimelineClipState(type, clip) {
  const baseClip = {
    duration: clip.duration,
    startTime: clip.startTime,
    trackIndex: getClipTrackIndex(clip),
  };

  if (type === "video") {
    return {
      ...baseClip,
      audioElement: clip.audioElement,
      file: clip.file,
      mediaUrl: clip.mediaUrl,
      muted: Boolean(clip.muted),
      provider: clip.provider,
      sourceDuration: clip.sourceDuration,
      sourceOffset: getClipSourceOffset(clip),
      volume: clip.volume ?? 1,
    };
  }

  if (type === "audio") {
    return {
      ...baseClip,
      audioElement: clip.audioElement,
      file: clip.file,
      mediaUrl: clip.mediaUrl,
      muted: Boolean(clip.muted),
      samples: Array.isArray(clip.samples) ? [...clip.samples] : clip.samples,
      sourceDuration: clip.sourceDuration,
      sourceOffset: getClipSourceOffset(clip),
      volume: clip.volume ?? 1,
    };
  }

  if (type === "image") {
    return {
      ...baseClip,
      file: clip.file,
      imageElement: clip.imageElement,
      imageFrame: clip.imageFrame ? { ...clip.imageFrame } : undefined,
      imageFrameRatio: clip.imageFrameRatio ? { ...clip.imageFrameRatio } : undefined,
      mediaUrl: clip.mediaUrl,
      texture: clip.texture,
      transitionSeconds: clip.transitionSeconds,
      transitionType: clip.transitionType,
    };
  }

  return {
    ...baseClip,
    align: clip.align,
    backgroundAlpha: clip.backgroundAlpha,
    backgroundColor: clip.backgroundColor,
    fill: clip.fill,
    fontFamily: clip.fontFamily,
    fontSize: clip.fontSize,
    fontSizeReferenceHeight: clip.fontSizeReferenceHeight,
    fontStyle: clip.fontStyle,
    fontWeight: clip.fontWeight,
    lineHeight: clip.lineHeight,
    shadowBlur: clip.shadowBlur,
    shadowColor: clip.shadowColor,
    shadowDistance: clip.shadowDistance,
    strokeColor: clip.strokeColor,
    strokeWidth: clip.strokeWidth,
    text: clip.text,
    transitionSeconds: clip.transitionSeconds,
    transitionType: clip.transitionType,
    xRatio: clip.xRatio,
    yRatio: clip.yRatio,
  };
}

export function createPortableProjectState(state) {
  return {
    ...state,
    audio: (state.audio || []).map(createPortableClipState),
    image: (state.image || []).map(createPortableClipState),
    text: (state.text || []).map(createPortableClipState),
    video: (state.video || []).map(createPortableClipState),
  };
}

export function createPortableClipState(clip) {
  const {
    audioElement,
    file,
    imageElement,
    mediaUrl,
    provider,
    samples,
    texture,
    timelineContainer,
    ...portableClip
  } = clip;

  return {
    ...portableClip,
    fileLastModified: file?.lastModified || 0,
    fileName: file?.name || "",
    fileSize: file?.size || 0,
    fileType: file?.type || "",
    relinkRequired: Boolean(file || texture || imageElement || audioElement || provider),
  };
}
