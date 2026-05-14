import {
  Application,
  Assets,
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Text,
  Texture,
} from "pixi.js";
import {
  createMediabunnyVideoFrameProvider,
  exportVideoWithTextOverlay,
  extractVideoFramesWithMediabunny,
} from "./util.js";
import fogImageUrl from "./assets/fog.jpg";

const VIEW_WIDTH = 960;
const VIEW_HEIGHT = 660;
const MEDIA_PADDING = 36;
const BAR_COUNT = 48;
const TIMELINE_X = 116;
const TIMELINE_Y = VIEW_HEIGHT - 188;
const TIMELINE_WIDTH = VIEW_WIDTH - TIMELINE_X * 2;
const TIMELINE_HEIGHT = 8;
const TIMELINE_HIT_HEIGHT = 42;
const EDITOR_PANEL_X = 54;
const EDITOR_PANEL_Y = VIEW_HEIGHT - 132;
const EDITOR_PANEL_WIDTH = VIEW_WIDTH - EDITOR_PANEL_X * 2;
const EDITOR_PANEL_HEIGHT = 106;
const TRACK_LABEL_WIDTH = 82;
const VIDEO_TRACK_X = EDITOR_PANEL_X + TRACK_LABEL_WIDTH;
const VIDEO_TRACK_Y = EDITOR_PANEL_Y + 34;
const VIDEO_TRACK_WIDTH = EDITOR_PANEL_WIDTH - TRACK_LABEL_WIDTH - 18;
const VIDEO_TRACK_HEIGHT = 58;
const VIDEO_THUMB_WIDTH = 92;
const VIDEO_THUMB_HEIGHT = 52;
const VIDEO_THUMB_GAP = 4;
const VIDEO_FRAME_MIN_INTERVAL = 1 / 30;
const TEXT_OVERLAY_INTERVALS = [
  { duration: 4, startTime: 2 },
  { duration: 7, startTime: 10 },
];
const TEXT_OVERLAY_VALUE = "Pixi text";
const IMAGE_OVERLAY_INTERVAL = { duration: 10, startTime: 4 };
const IMAGE_OVERLAY_MIN_WIDTH = 48;
const IMAGE_OVERLAY_HANDLE_RADIUS = 8;
const OVERLAY_FADE_SECONDS = 0.35;
const IMAGE_EXTENSIONS = new Set(["avif", "jpeg", "jpg", "png", "webp"]);
const VIDEO_EXTENSIONS = new Set(["avi", "h264", "m4v", "mov", "mp4", "ogg", "ogv", "webm"]);
const AUDIO_EXTENSIONS = new Set([
  "aac",
  "flac",
  "m4a",
  "mp3",
  "oga",
  "ogg",
  "opus",
  "wav",
  "weba",
]);

export async function startPixiMedia() {
  const canvas = document.getElementById("app-canvas");
  const fileName = document.getElementById("moves-count");
  const statusText = document.getElementById("status-text");
  const chooseButton = document.getElementById("shuffle-button");
  const fileLabel = fileName?.closest("span")?.firstChild;

  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("Canvas element #app-canvas was not found.");
  }

  if (
    !(fileName instanceof HTMLElement) ||
    !(statusText instanceof HTMLElement) ||
    !(chooseButton instanceof HTMLButtonElement)
  ) {
    throw new Error("Media viewer HUD elements were not found.");
  }

  if (fileLabel) {
    fileLabel.textContent = "File: ";
  }

  document.documentElement.style.setProperty("--game-aspect", `${VIEW_WIDTH} / ${VIEW_HEIGHT}`);
  chooseButton.textContent = "Choose media";
  fileName.textContent = "none";
  statusText.textContent = "Image, video, or audio";

  const exportButton = document.createElement("button");
  exportButton.type = "button";
  exportButton.textContent = "Export";
  exportButton.disabled = true;
  chooseButton.insertAdjacentElement("beforebegin", exportButton);

  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*,video/*,audio/*";
  input.hidden = true;
  document.body.appendChild(input);

  const app = new Application();

  await app.init({
    canvas,
    width: VIEW_WIDTH,
    height: VIEW_HEIGHT,
    backgroundColor: 0x0f172a,
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  });
  maintainCanvasLayout();

  const overlayImageTexture = await Assets.load(fogImageUrl);
  const overlayImageElement = await loadImageElement(fogImageUrl);

  const scene = new Container();
  const mediaLayer = new Container();
  const textLayer = new Container();
  const overlayImageGroup = new Container();
  const overlayImageSprite = new Sprite({ texture: overlayImageTexture });
  const overlayImageHandles = ["tl", "tr", "br", "bl"].map((corner) => ({
    corner,
    node: createImageResizeHandle(corner),
  }));
  const overlay = new Graphics();
  const visualizer = new Graphics();
  const controlsLayer = new Container();
  const timeline = new Container();
  const timelineTrack = new Graphics();
  const timelineFill = new Graphics();
  const timelineKnob = new Graphics();
  const editorTimeline = new Container();
  const editorTimelineBackground = new Graphics();
  const editorTimelineFrames = new Container();
  const editorTimelinePlayhead = new Graphics();
  const editorTimelineLabel = new Text({
    text: "Video",
    style: {
      fill: "#cbd5e1",
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: 13,
      fontWeight: "700",
    },
  });
  const editorTimelineStatus = new Text({
    text: "",
    style: {
      fill: "#94a3b8",
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: 12,
      fontWeight: "600",
    },
  });
  const currentTimeText = new Text({
    text: "00:00.000",
    style: {
      fill: "#e2e8f0",
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: 13,
      fontWeight: "600",
    },
  });
  const durationText = new Text({
    text: "00:00.000",
    style: {
      fill: "#94a3b8",
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: 13,
      fontWeight: "600",
    },
  });
  const titleText = new Text({
    text: "Choose a local media file",
    style: {
      fill: "#f8fafc",
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: 30,
      fontWeight: "700",
    },
  });
  const detailText = new Text({
    text: "Images and videos render on the Pixi canvas. Audio plays with a live visualizer.",
    style: {
      fill: "#cbd5e1",
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: 15,
      wordWrap: true,
      wordWrapWidth: VIEW_WIDTH - MEDIA_PADDING * 2,
    },
  });
  const overlayText = new Text({
    text: TEXT_OVERLAY_VALUE,
    style: {
      fill: "#ffffff",
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: 42,
      fontWeight: "800",
      stroke: { color: "rgba(0, 0, 0, 0.82)", width: 7 },
    },
  });

  app.stage.addChild(scene);
  scene.addChild(
    mediaLayer,
    textLayer,
    overlay,
    visualizer,
    controlsLayer,
    editorTimeline,
    titleText,
    detailText
  );
  overlayImageGroup.addChild(
    overlayImageSprite,
    ...overlayImageHandles.map((handle) => handle.node)
  );
  textLayer.addChild(overlayImageGroup, overlayText);
  controlsLayer.addChild(timeline);
  timeline.addChild(timelineTrack, timelineFill, timelineKnob, currentTimeText, durationText);
  editorTimeline.addChild(
    editorTimelineBackground,
    editorTimelineFrames,
    editorTimelinePlayhead,
    editorTimelineLabel,
    editorTimelineStatus
  );

  timeline.visible = false;
  timeline.eventMode = "static";
  timeline.cursor = "pointer";
  timeline.hitArea = new Rectangle(
    TIMELINE_X,
    TIMELINE_Y - TIMELINE_HIT_HEIGHT / 2,
    TIMELINE_WIDTH,
    TIMELINE_HIT_HEIGHT
  );
  currentTimeText.anchor.set(0, 0.5);
  durationText.anchor.set(1, 0.5);
  currentTimeText.position.set(TIMELINE_X, TIMELINE_Y + 28);
  durationText.position.set(TIMELINE_X + TIMELINE_WIDTH, TIMELINE_Y + 28);
  editorTimeline.visible = false;
  editorTimelineLabel.anchor.set(0, 0.5);
  editorTimelineLabel.position.set(EDITOR_PANEL_X + 14, VIDEO_TRACK_Y + VIDEO_TRACK_HEIGHT / 2);
  editorTimelineStatus.anchor.set(0, 0.5);
  editorTimelineStatus.position.set(VIDEO_TRACK_X + 12, VIDEO_TRACK_Y + VIDEO_TRACK_HEIGHT / 2);

  titleText.anchor.set(0.5);
  titleText.position.set(VIEW_WIDTH / 2, VIEW_HEIGHT / 2 - 22);
  detailText.anchor.set(0.5);
  detailText.position.set(VIEW_WIDTH / 2, VIEW_HEIGHT / 2 + 18);
  overlayText.anchor.set(0.5);
  overlayText.eventMode = "static";
  overlayText.cursor = "grab";
  overlayText.visible = false;
  overlayImageGroup.eventMode = "static";
  overlayImageGroup.cursor = "move";
  overlayImageGroup.visible = false;
  overlayImageSprite.eventMode = "static";
  overlayImageSprite.cursor = "move";
  overlayImageSprite.anchor.set(0.5);

  let objectUrl = "";
  let currentVideoFile = null;
  let mediaSprite = null;
  let mediaTexture = null;
  let mediaElement = null;
  let videoFrameProvider = null;
  let audioContext = null;
  let audioSource = null;
  let analyser = null;
  let frequencyData = null;
  let currentKind = "empty";
  let isSeeking = false;
  let videoFramePending = false;
  let videoFrameRequestId = 0;
  let videoTrackBuildId = 0;
  let videoTrackTextures = [];
  let videoTrackLoading = false;
  let lastVideoFrameTime = -1;
  let wasPlayingBeforeSeek = false;
  let suppressNextCanvasToggle = false;
  let textPositionInitialized = false;
  let textDragging = false;
  const textDragOffset = { x: 0, y: 0 };
  const imageFrame = { height: 0, width: 0, x: 0, y: 0 };
  const imageDragOffset = { x: 0, y: 0 };
  const imageResizeOrigin = { corner: "", oppositeX: 0, oppositeY: 0 };
  let imagePositionInitialized = false;
  let imageDragging = false;
  let imageResizeCorner = "";
  let isExporting = false;

  function clearCurrentMedia() {
    app.stop();
    videoFrameRequestId += 1;
    videoTrackBuildId += 1;
    videoFramePending = false;
    videoTrackLoading = false;
    lastVideoFrameTime = -1;
    clearVideoTrackFrames();
    currentVideoFile = null;
    exportButton.disabled = true;
    isExporting = false;
    textPositionInitialized = false;
    textDragging = false;
    overlayText.visible = false;
    imagePositionInitialized = false;
    imageDragging = false;
    imageResizeCorner = "";
    overlayImageGroup.visible = false;

    if (videoFrameProvider) {
      videoFrameProvider.dispose();
      videoFrameProvider = null;
    }

    if (mediaElement) {
      mediaElement.removeEventListener("seeked", handleMediaSeeked);
      mediaElement.pause();
      mediaElement.removeAttribute("src");
      mediaElement.load();
      mediaElement = null;
    }

    if (audioSource) {
      audioSource.disconnect();
      audioSource = null;
    }

    analyser = null;
    frequencyData = null;
    mediaLayer.removeChildren();

    if (mediaSprite) {
      mediaSprite.destroy();
      mediaSprite = null;
    }

    if (mediaTexture) {
      mediaTexture.destroy(true);
      mediaTexture = null;
    }

    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = "";
    }

    currentKind = "empty";
    isSeeking = false;
    wasPlayingBeforeSeek = false;
    hideTimeline();
    hideEditorTimeline();
  }

  async function loadMedia(file) {
    clearCurrentMedia();

    objectUrl = URL.createObjectURL(file);
    fileName.textContent = file.name;
    statusText.textContent = "Loading";

    try {
      const kind = getMediaKind(file);

      if (kind === "image") {
        await loadImage(file);
      } else if (kind === "video") {
        await loadVideo(file);
      } else if (kind === "audio") {
        await loadAudio(file);
      } else {
        throw new Error("Unsupported file type.");
      }

      titleText.visible = false;
      detailText.visible = false;
      resizeCanvas();
      app.start();
    } catch (error) {
      clearCurrentMedia();
      titleText.visible = true;
      detailText.visible = true;
      fileName.textContent = "none";
      statusText.textContent = error instanceof Error ? error.message : "Failed to load";
      drawEmptyBackground();
      app.render();
    }
  }

  async function loadImage(file) {
    mediaTexture = await Assets.load({
      src: objectUrl,
      parser: "texture",
      data: { mime: file.type },
    });
    mediaSprite = new Sprite({ texture: mediaTexture });
    mediaSprite.anchor.set(0.5);
    mediaLayer.addChild(mediaSprite);
    currentKind = "image";
    statusText.textContent = "Image loaded";
  }

  async function loadVideo(file) {
    const video = document.createElement("video");

    video.loop = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = objectUrl;
    mediaElement = video;

    videoFrameProvider = await createMediabunnyVideoFrameProvider(file);
    await videoFrameProvider.drawFrameAt(0);
    await waitForMediaReady(video, "loadedmetadata", "video");

    mediaTexture = Texture.from(videoFrameProvider.canvas, true);
    mediaTexture.dynamic = true;
    mediaTexture.source.update();
    mediaSprite = new Sprite({ texture: mediaTexture });
    mediaSprite.anchor.set(0.5);
    mediaLayer.addChild(mediaSprite);
    currentKind = "video";
    currentVideoFile = file;
    exportButton.disabled = false;
    statusText.textContent = `Video ${videoFrameProvider.width}x${videoFrameProvider.height}`;
    video.addEventListener("seeked", handleMediaSeeked);
    startVideoTrackBuild(file);

    video
      .play()
      .then(() => {
        statusText.textContent = "Click canvas to pause";
      })
      .catch(() => {
        statusText.textContent = "Click canvas to play";
      });
  }

  async function loadAudio(file) {
    mediaElement = new Audio(objectUrl);
    mediaElement.loop = true;
    mediaElement.preload = "auto";
    await waitForMediaReady(mediaElement, "loadedmetadata", "audio");

    audioContext = audioContext || new AudioContext();
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    analyser = audioContext.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.82;
    frequencyData = new Uint8Array(analyser.frequencyBinCount);
    audioSource = audioContext.createMediaElementSource(mediaElement);
    audioSource.connect(analyser);
    analyser.connect(audioContext.destination);
    currentKind = "audio";
    statusText.textContent = "Click canvas to play";
    mediaElement.addEventListener("seeked", handleMediaSeeked);

    mediaElement
      .play()
      .then(() => {
        statusText.textContent = "Click canvas to pause";
      })
      .catch(() => {
        statusText.textContent = "Click canvas to play";
      });
  }

  function fitMediaSprite() {
    if (!mediaSprite) {
      return;
    }

    const videoWidth =
      videoFrameProvider?.width ||
      (mediaElement instanceof HTMLVideoElement ? mediaElement.videoWidth : 0);
    const videoHeight =
      videoFrameProvider?.height ||
      (mediaElement instanceof HTMLVideoElement ? mediaElement.videoHeight : 0);
    const sourceWidth = mediaTexture?.width || videoWidth || 1;
    const sourceHeight = mediaTexture?.height || videoHeight || 1;
    const maxWidth = VIEW_WIDTH - MEDIA_PADDING * 2;
    const previewBottom = isSeekableMedia()
      ? TIMELINE_Y - TIMELINE_HIT_HEIGHT
      : VIEW_HEIGHT - MEDIA_PADDING;
    const maxHeight = Math.max(1, previewBottom - MEDIA_PADDING);
    const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight);

    mediaSprite.scale.set(scale);
    mediaSprite.position.set(VIEW_WIDTH / 2, MEDIA_PADDING + maxHeight / 2);
    updateImageOverlayPosition();
    updateTextOverlayPosition();
  }

  function getMediaSpriteRect() {
    if (!mediaSprite) {
      return null;
    }

    const width = mediaSprite.width;
    const height = mediaSprite.height;

    return {
      bottom: mediaSprite.y + height / 2,
      height,
      left: mediaSprite.x - width / 2,
      right: mediaSprite.x + width / 2,
      top: mediaSprite.y - height / 2,
      width,
    };
  }

  function getCurrentOverlayTransition(intervals) {
    if (currentKind !== "video" || !mediaElement || !Number.isFinite(mediaElement.currentTime)) {
      return { alpha: 0, yScale: 0 };
    }

    return getOverlayTransitionAtTime(mediaElement.currentTime, intervals, OVERLAY_FADE_SECONDS);
  }

  function updateTextOverlayPosition() {
    const rect = getMediaSpriteRect();

    if (!rect || currentKind !== "video") {
      overlayText.visible = false;
      return;
    }

    if (!textPositionInitialized) {
      overlayText.position.set(rect.left + rect.width / 2, rect.top + rect.height * 0.76);
      textPositionInitialized = true;
    }

    overlayText.scale.set(1, 1);
    clampTextToMediaRect();
    const transition = getCurrentOverlayTransition(TEXT_OVERLAY_INTERVALS);

    overlayText.alpha = transition.alpha;
    overlayText.scale.x = transition.yScale;
    overlayText.visible = overlayText.alpha > 0;
  }

  function updateImageOverlayPosition() {
    const rect = getMediaSpriteRect();

    if (!rect || currentKind !== "video") {
      overlayImageGroup.visible = false;
      return;
    }

    if (!imagePositionInitialized) {
      const aspectRatio = getOverlayImageAspectRatio();
      const width = Math.min(rect.width * 0.5, rect.height * aspectRatio);
      const height = width / aspectRatio;

      imageFrame.width = width;
      imageFrame.height = height;
      imageFrame.x = rect.left + (rect.width - width) / 2;
      imageFrame.y = rect.top + (rect.height - height) / 2;
      imagePositionInitialized = true;
    }

    clampImageToMediaRect();
    layoutImageOverlay();
    const transition = getCurrentOverlayTransition([IMAGE_OVERLAY_INTERVAL]);

    overlayImageGroup.alpha = transition.alpha;
    overlayImageSprite.scale.x *= transition.yScale;
    overlayImageGroup.visible = overlayImageGroup.alpha > 0;
  }

  function clampTextToMediaRect() {
    const rect = getMediaSpriteRect();

    if (!rect) {
      return;
    }

    const halfWidth = Math.min(rect.width / 2, overlayText.width / 2);
    const halfHeight = Math.min(rect.height / 2, overlayText.height / 2);

    overlayText.x = Math.min(
      Math.max(overlayText.x, rect.left + halfWidth),
      rect.right - halfWidth
    );
    overlayText.y = Math.min(
      Math.max(overlayText.y, rect.top + halfHeight),
      rect.bottom - halfHeight
    );
  }

  function getOverlayImageAspectRatio() {
    const width = overlayImageTexture.width || overlayImageElement.naturalWidth || 1;
    const height = overlayImageTexture.height || overlayImageElement.naturalHeight || 1;

    return width / height;
  }

  function clampImageToMediaRect() {
    const rect = getMediaSpriteRect();

    if (!rect) {
      return;
    }

    const aspectRatio = getOverlayImageAspectRatio();
    const maxWidth = Math.min(rect.width, rect.height * aspectRatio);
    const minWidth = Math.min(IMAGE_OVERLAY_MIN_WIDTH, maxWidth);
    const width = Math.min(Math.max(imageFrame.width, minWidth), maxWidth);
    const height = width / aspectRatio;

    imageFrame.width = width;
    imageFrame.height = height;
    imageFrame.x = Math.min(Math.max(imageFrame.x, rect.left), rect.right - width);
    imageFrame.y = Math.min(Math.max(imageFrame.y, rect.top), rect.bottom - height);
  }

  function layoutImageOverlay() {
    overlayImageGroup.position.set(imageFrame.x, imageFrame.y);
    overlayImageGroup.hitArea = new Rectangle(0, 0, imageFrame.width, imageFrame.height);
    overlayImageSprite.position.set(imageFrame.width / 2, imageFrame.height / 2);
    overlayImageSprite.width = imageFrame.width;
    overlayImageSprite.height = imageFrame.height;

    for (const handle of overlayImageHandles) {
      handle.node.position.set(
        handle.corner.includes("l") ? 0 : imageFrame.width,
        handle.corner.includes("t") ? 0 : imageFrame.height
      );
    }
  }

  function drawEmptyBackground() {
    overlay.clear();
    overlay.rect(0, 0, VIEW_WIDTH, VIEW_HEIGHT).fill(0x0f172a);
    overlay
      .rect(
        MEDIA_PADDING,
        MEDIA_PADDING,
        VIEW_WIDTH - MEDIA_PADDING * 2,
        VIEW_HEIGHT - MEDIA_PADDING * 2
      )
      .fill({ color: 0x111827, alpha: 0.9 })
      .stroke({ color: 0x334155, width: 2 });
    visualizer.clear();
  }

  function drawAudioVisualizer() {
    if (!analyser || !frequencyData) {
      return;
    }

    analyser.getByteFrequencyData(frequencyData);
    overlay.clear();
    overlay.rect(0, 0, VIEW_WIDTH, VIEW_HEIGHT).fill(0x0f172a);
    overlay.circle(VIEW_WIDTH / 2, 168, 72).fill({ color: 0x2563eb, alpha: 0.26 });
    overlay.circle(VIEW_WIDTH / 2, 168, 44).fill({ color: 0x38bdf8, alpha: 0.72 });

    visualizer.clear();
    const areaX = 92;
    const areaY = 302;
    const areaWidth = VIEW_WIDTH - areaX * 2;
    const areaHeight = 142;
    const gap = 4;
    const barWidth = (areaWidth - gap * (BAR_COUNT - 1)) / BAR_COUNT;

    for (let i = 0; i < BAR_COUNT; i += 1) {
      const value = frequencyData[Math.floor((i / BAR_COUNT) * frequencyData.length)] / 255;
      const height = Math.max(6, value * areaHeight);
      const x = areaX + i * (barWidth + gap);
      const y = areaY + areaHeight - height;
      const color = i % 3 === 0 ? 0x38bdf8 : i % 3 === 1 ? 0x22c55e : 0xf8fafc;

      visualizer.roundRect(x, y, barWidth, height, 4).fill({ color, alpha: 0.86 });
    }
  }

  function updateVideoTexture(force = false) {
    if (currentKind !== "video" || !mediaTexture?.source || !videoFrameProvider || !mediaElement) {
      return;
    }

    const frameTime = mediaElement.currentTime;

    if (!force && Math.abs(frameTime - lastVideoFrameTime) < VIDEO_FRAME_MIN_INTERVAL) {
      return;
    }

    if (videoFramePending) {
      if (!force) {
        return;
      }

      videoFrameRequestId += 1;
      videoFramePending = false;
    }

    const requestId = videoFrameRequestId + 1;

    videoFrameRequestId = requestId;
    videoFramePending = true;
    lastVideoFrameTime = frameTime;

    videoFrameProvider
      .drawFrameAt(frameTime)
      .then((frame) => {
        if (requestId !== videoFrameRequestId || currentKind !== "video" || !frame) {
          return;
        }

        mediaTexture?.source?.update?.();
        mediaTexture?.update?.();
        fitMediaSprite();
        updateTextOverlayPosition();
        drawTimeline();
        app.render();
      })
      .catch((error) => {
        if (requestId === videoFrameRequestId) {
          statusText.textContent =
            error instanceof Error ? error.message : "Failed to decode video frame.";
        }
      })
      .finally(() => {
        if (requestId !== videoFrameRequestId) {
          return;
        }

        videoFramePending = false;

        if (
          currentKind === "video" &&
          mediaElement &&
          Math.abs(mediaElement.currentTime - lastVideoFrameTime) >= VIDEO_FRAME_MIN_INTERVAL
        ) {
          updateVideoTexture();
        }
      });
  }

  function isSeekableMedia() {
    return (
      (currentKind === "video" || currentKind === "audio") &&
      mediaElement &&
      Number.isFinite(mediaElement.duration) &&
      mediaElement.duration > 0
    );
  }

  function drawTimeline() {
    if (!isSeekableMedia()) {
      hideTimeline();
      return;
    }

    const duration = mediaElement.duration;
    const currentTime = Math.min(Math.max(mediaElement.currentTime, 0), duration);
    const progress = currentTime / duration;
    const knobX = TIMELINE_X + TIMELINE_WIDTH * progress;
    const barY = TIMELINE_Y - TIMELINE_HEIGHT / 2;

    timeline.visible = true;
    timelineTrack.clear();
    timelineTrack
      .roundRect(TIMELINE_X, barY, TIMELINE_WIDTH, TIMELINE_HEIGHT, TIMELINE_HEIGHT / 2)
      .fill({ color: 0x0f172a, alpha: 0.9 })
      .stroke({ color: 0x475569, width: 1 });

    timelineFill.clear();
    timelineFill
      .roundRect(
        TIMELINE_X,
        barY,
        Math.max(0, knobX - TIMELINE_X),
        TIMELINE_HEIGHT,
        TIMELINE_HEIGHT / 2
      )
      .fill(0x38bdf8);

    timelineKnob.clear();
    timelineKnob.circle(knobX, TIMELINE_Y, 11).fill(0xf8fafc).stroke({ color: 0x0284c7, width: 3 });

    currentTimeText.text = formatTime(currentTime);
    durationText.text = formatTime(duration);
  }

  function hideTimeline() {
    timeline.visible = false;
    timelineTrack.clear();
    timelineFill.clear();
    timelineKnob.clear();
  }

  function clearVideoTrackFrames() {
    editorTimelineFrames.removeChildren().forEach((child) => child.destroy());
    videoTrackTextures.forEach((texture) => texture.destroy(true));
    videoTrackTextures = [];
  }

  function hideEditorTimeline() {
    editorTimeline.visible = false;
    editorTimelineBackground.clear();
    editorTimelinePlayhead.clear();
    editorTimelineStatus.text = "";
  }

  function drawEditorTimeline() {
    if (currentKind !== "video" || !isSeekableMedia()) {
      hideEditorTimeline();
      return;
    }

    const duration = mediaElement.duration;
    const progress = Math.min(Math.max(mediaElement.currentTime / duration, 0), 1);
    const playheadX = VIDEO_TRACK_X + VIDEO_TRACK_WIDTH * progress;

    editorTimeline.visible = true;
    editorTimelineBackground.clear();
    editorTimelineBackground
      .roundRect(EDITOR_PANEL_X, EDITOR_PANEL_Y, EDITOR_PANEL_WIDTH, EDITOR_PANEL_HEIGHT, 8)
      .fill({ color: 0x0f172a, alpha: 0.94 })
      .stroke({ color: 0x334155, width: 1 });
    editorTimelineBackground
      .roundRect(VIDEO_TRACK_X, VIDEO_TRACK_Y, VIDEO_TRACK_WIDTH, VIDEO_TRACK_HEIGHT, 6)
      .fill({ color: 0x111827, alpha: 0.98 })
      .stroke({ color: 0x475569, width: 1 });

    editorTimelinePlayhead.clear();
    editorTimelinePlayhead
      .moveTo(playheadX, EDITOR_PANEL_Y + 12)
      .lineTo(playheadX, EDITOR_PANEL_Y + EDITOR_PANEL_HEIGHT - 12)
      .stroke({ color: 0x38bdf8, width: 2 });
    editorTimelinePlayhead.circle(playheadX, EDITOR_PANEL_Y + 12, 4).fill(0x38bdf8);
  }

  function startVideoTrackBuild(file) {
    const buildId = videoTrackBuildId + 1;
    const maxFrames = Math.max(
      1,
      Math.floor((VIDEO_TRACK_WIDTH + VIDEO_THUMB_GAP) / (VIDEO_THUMB_WIDTH + VIDEO_THUMB_GAP))
    );
    const intervalSeconds = Math.max(0.1, videoFrameProvider.duration / maxFrames);

    videoTrackBuildId = buildId;
    videoTrackLoading = true;
    clearVideoTrackFrames();
    editorTimelineStatus.text = "Loading frames";
    drawEditorTimeline();

    extractVideoFramesWithMediabunny(file, {
      fit: "cover",
      includeLastFrame: true,
      intervalSeconds,
      maxFrames,
      poolSize: 3,
      thumbnailHeight: VIDEO_THUMB_HEIGHT,
      thumbnailWidth: VIDEO_THUMB_WIDTH,
    })
      .then((frames) => {
        if (buildId !== videoTrackBuildId || currentKind !== "video") {
          return;
        }

        clearVideoTrackFrames();
        frames.forEach((frame, index) => {
          const texture = Texture.from(frame.canvas, true);
          const sprite = new Sprite({ texture });

          sprite.x = VIDEO_TRACK_X + 4 + index * (VIDEO_THUMB_WIDTH + VIDEO_THUMB_GAP);
          sprite.y = VIDEO_TRACK_Y + (VIDEO_TRACK_HEIGHT - VIDEO_THUMB_HEIGHT) / 2;
          videoTrackTextures.push(texture);
          editorTimelineFrames.addChild(sprite);
        });
        editorTimelineStatus.text = frames.length ? "" : "No frames";
      })
      .catch((error) => {
        if (buildId === videoTrackBuildId) {
          editorTimelineStatus.text =
            error instanceof Error ? error.message : "Failed to load frames";
        }
      })
      .finally(() => {
        if (buildId === videoTrackBuildId) {
          videoTrackLoading = false;
          drawEditorTimeline();
          app.render();
        }
      });
  }

  function renderScene() {
    if (currentKind === "audio") {
      drawAudioVisualizer();
      drawTimeline();
      hideEditorTimeline();
      overlayText.visible = false;
      overlayImageGroup.visible = false;
    } else if (currentKind === "empty") {
      drawEmptyBackground();
      hideTimeline();
      hideEditorTimeline();
      overlayText.visible = false;
      overlayImageGroup.visible = false;
    } else {
      updateVideoTexture();
      overlay.clear();
      visualizer.clear();
      fitMediaSprite();
      updateImageOverlayPosition();
      updateTextOverlayPosition();
      drawTimeline();
      drawEditorTimeline();
    }
  }

  function resizeCanvas() {
    maintainCanvasLayout();
    const bounds = canvas.getBoundingClientRect();
    app.renderer.resize(Math.max(1, bounds.width), Math.max(1, bounds.height));
    const scale = Math.min(app.screen.width / VIEW_WIDTH, app.screen.height / VIEW_HEIGHT);

    scene.scale.set(scale);
    scene.position.set(
      (app.screen.width - VIEW_WIDTH * scale) / 2,
      (app.screen.height - VIEW_HEIGHT * scale) / 2
    );
    renderScene();
    app.render();
    maintainCanvasLayout();
  }

  function maintainCanvasLayout() {
    canvas.style.width = "100%";
    canvas.style.height = "auto";
  }

  function getFileExtension(file) {
    return file.name.split(".").pop()?.toLowerCase() || "";
  }

  function getMediaKind(file) {
    const extension = getFileExtension(file);

    if (file.type.startsWith("image/") || IMAGE_EXTENSIONS.has(extension)) {
      return "image";
    }

    if (file.type.startsWith("video/") || VIDEO_EXTENSIONS.has(extension)) {
      return "video";
    }

    if (file.type.startsWith("audio/") || AUDIO_EXTENSIONS.has(extension)) {
      return "audio";
    }

    return "unknown";
  }

  function waitForMediaReady(element, eventName, label, targetReadyState = 0) {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        element.removeEventListener(eventName, handleReady);
        element.removeEventListener("error", handleError);
      };
      const handleReady = () => {
        cleanup();
        resolve();
      };
      const handleError = () => {
        cleanup();
        reject(new Error(`Browser cannot play this ${label} file.`));
      };

      if (targetReadyState > 0 && element.readyState >= targetReadyState) {
        resolve();
        return;
      }

      element.addEventListener(eventName, handleReady, { once: true });
      element.addEventListener("error", handleError, { once: true });
      element.load();
    });
  }

  function formatTime(value) {
    const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
    const totalMilliseconds = Math.floor(safeValue * 1000);
    const milliseconds = totalMilliseconds % 1000;
    const totalSeconds = Math.floor(totalMilliseconds / 1000);
    const seconds = totalSeconds % 60;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const minutes = totalMinutes % 60;
    const hours = Math.floor(totalMinutes / 60);
    const secondText = seconds.toString().padStart(2, "0");
    const millisecondText = milliseconds.toString().padStart(3, "0");

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secondText}.${millisecondText}`;
    }

    return `${minutes.toString().padStart(2, "0")}:${secondText}.${millisecondText}`;
  }

  function seekFromPointer(event) {
    if (!isSeekableMedia()) {
      return;
    }

    const local = timeline.toLocal(event.global);
    const progress = Math.min(Math.max((local.x - TIMELINE_X) / TIMELINE_WIDTH, 0), 1);

    mediaElement.currentTime = progress * mediaElement.duration;
    updateVideoTexture(true);
    drawTimeline();
    app.render();
  }

  function handleTimelinePointerDown(event) {
    if (!isSeekableMedia()) {
      return;
    }

    suppressNextCanvasToggle = true;
    isSeeking = true;
    wasPlayingBeforeSeek = !mediaElement.paused;
    mediaElement.pause();
    seekFromPointer(event);
  }

  async function handleTimelinePointerUp(event) {
    if (!isSeeking) {
      return;
    }

    seekFromPointer(event);
    isSeeking = false;

    if (wasPlayingBeforeSeek) {
      await mediaElement.play();
      statusText.textContent = "Click canvas to pause";
      app.start();
    } else {
      statusText.textContent = "Paused";
      handleMediaSeeked();
    }
  }

  function handleTimelinePointerMove(event) {
    if (isSeeking) {
      seekFromPointer(event);
    }
  }

  function handleMediaSeeked() {
    updateVideoTexture(true);
    renderScene();
    app.render();
  }

  function getTextOverlayExportState() {
    const rect = getMediaSpriteRect();

    if (!rect) {
      return null;
    }

    return {
      fillStyle: "#ffffff",
      fontFamily: "Inter, system-ui, sans-serif",
      fontSizeRatio: Number(overlayText.style.fontSize || 42) / rect.height,
      fontWeight: "800",
      intervals: TEXT_OVERLAY_INTERVALS,
      transitionSeconds: OVERLAY_FADE_SECONDS,
      strokeStyle: "rgba(0, 0, 0, 0.82)",
      text: overlayText.text,
      xRatio: (overlayText.x - rect.left) / rect.width,
      yRatio: (overlayText.y - rect.top) / rect.height,
    };
  }

  function getImageOverlayExportState() {
    const rect = getMediaSpriteRect();

    if (!rect || !imagePositionInitialized) {
      return null;
    }

    return {
      imageSource: overlayImageElement,
      ...IMAGE_OVERLAY_INTERVAL,
      transitionSeconds: OVERLAY_FADE_SECONDS,
      heightRatio: imageFrame.height / rect.height,
      widthRatio: imageFrame.width / rect.width,
      xRatio: (imageFrame.x - rect.left) / rect.width,
      yRatio: (imageFrame.y - rect.top) / rect.height,
    };
  }

  function downloadBlob(blob, fileNameValue) {
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = downloadUrl;
    link.download = fileNameValue;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  }

  async function handleExportClick() {
    if (!currentVideoFile || isExporting) {
      return;
    }

    const textOverlayState = getTextOverlayExportState();
    const imageOverlayState = getImageOverlayExportState();

    if (!textOverlayState && !imageOverlayState) {
      statusText.textContent = "No overlay";
      return;
    }

    isExporting = true;
    exportButton.disabled = true;
    chooseButton.disabled = true;
    statusText.textContent = "Exporting 0%";

    const shouldResume = currentKind === "video" && mediaElement && !mediaElement.paused;

    mediaElement?.pause();
    app.stop();

    try {
      const blob = await exportVideoWithTextOverlay(
        currentVideoFile,
        {
          ...textOverlayState,
          image: imageOverlayState,
        },
        {
          onProgress(progress) {
            statusText.textContent = `Exporting ${Math.round(progress * 100)}%`;
          },
        }
      );
      const baseName = currentVideoFile.name.replace(/\.[^.]+$/, "") || "video";

      downloadBlob(blob, `${baseName}-overlay.mp4`);
      statusText.textContent = "Export complete";
    } catch (error) {
      statusText.textContent = error instanceof Error ? error.message : "Export failed";
    } finally {
      isExporting = false;
      chooseButton.disabled = false;
      exportButton.disabled = currentKind !== "video" || !currentVideoFile;

      if (shouldResume && mediaElement) {
        await mediaElement.play();
        statusText.textContent = "Click canvas to pause";
        app.start();
      } else {
        app.render();
      }
    }
  }

  function handleTextPointerDown(event) {
    if (currentKind !== "video") {
      return;
    }

    suppressNextCanvasToggle = true;
    textDragging = true;
    overlayText.cursor = "grabbing";

    const local = textLayer.toLocal(event.global);

    textDragOffset.x = overlayText.x - local.x;
    textDragOffset.y = overlayText.y - local.y;
    event.stopPropagation();
  }

  function handleTextPointerMove(event) {
    if (!textDragging) {
      return;
    }

    const local = textLayer.toLocal(event.global);

    overlayText.position.set(local.x + textDragOffset.x, local.y + textDragOffset.y);
    clampTextToMediaRect();
    app.render();
  }

  function handleTextPointerUp() {
    if (!textDragging) {
      return;
    }

    textDragging = false;
    overlayText.cursor = "grab";
  }

  function handleImagePointerDown(event) {
    if (currentKind !== "video") {
      return;
    }

    suppressNextCanvasToggle = true;
    imageDragging = true;
    overlayImageGroup.cursor = "grabbing";

    const local = textLayer.toLocal(event.global);

    imageDragOffset.x = local.x - imageFrame.x;
    imageDragOffset.y = local.y - imageFrame.y;
    event.stopPropagation();
  }

  function handleImageResizePointerDown(corner, event) {
    if (currentKind !== "video") {
      return;
    }

    suppressNextCanvasToggle = true;
    imageResizeCorner = corner;
    imageResizeOrigin.corner = corner;
    imageResizeOrigin.oppositeX = corner.includes("l")
      ? imageFrame.x + imageFrame.width
      : imageFrame.x;
    imageResizeOrigin.oppositeY = corner.includes("t")
      ? imageFrame.y + imageFrame.height
      : imageFrame.y;
    event.stopPropagation();
  }

  function handleImagePointerMove(event) {
    if (!imageDragging && !imageResizeCorner) {
      return;
    }

    const local = textLayer.toLocal(event.global);

    if (imageDragging) {
      imageFrame.x = local.x - imageDragOffset.x;
      imageFrame.y = local.y - imageDragOffset.y;
    } else {
      resizeImageFromPointer(local);
    }

    clampImageToMediaRect();
    layoutImageOverlay();
    app.render();
  }

  function resizeImageFromPointer(local) {
    const rect = getMediaSpriteRect();

    if (!rect) {
      return;
    }

    const corner = imageResizeOrigin.corner;
    const aspectRatio = getOverlayImageAspectRatio();
    const oppositeX = imageResizeOrigin.oppositeX;
    const oppositeY = imageResizeOrigin.oppositeY;
    const desiredWidthFromX = corner.includes("l") ? oppositeX - local.x : local.x - oppositeX;
    const desiredWidthFromY =
      (corner.includes("t") ? oppositeY - local.y : local.y - oppositeY) * aspectRatio;
    const maxWidthFromX = corner.includes("l") ? oppositeX - rect.left : rect.right - oppositeX;
    const maxHeightFromY = corner.includes("t") ? oppositeY - rect.top : rect.bottom - oppositeY;
    const maxWidth = Math.max(1, Math.min(maxWidthFromX, maxHeightFromY * aspectRatio));
    const minWidth = Math.min(IMAGE_OVERLAY_MIN_WIDTH, maxWidth);
    const width = Math.min(Math.max(desiredWidthFromX, desiredWidthFromY, minWidth), maxWidth);
    const height = width / aspectRatio;

    imageFrame.width = width;
    imageFrame.height = height;
    imageFrame.x = corner.includes("l") ? oppositeX - width : oppositeX;
    imageFrame.y = corner.includes("t") ? oppositeY - height : oppositeY;
  }

  function handleImagePointerUp() {
    if (!imageDragging && !imageResizeCorner) {
      return;
    }

    imageDragging = false;
    imageResizeCorner = "";
    overlayImageGroup.cursor = "move";
  }

  function handleChooseClick() {
    input.click();
  }

  function handleInputChange() {
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    void loadMedia(file);
    input.value = "";
  }

  function isPointerInEditorPanel(event) {
    if (!event) {
      return false;
    }

    const canvasPoint = getCanvasPoint(event);

    return canvasPoint.y >= EDITOR_PANEL_Y - 8;
  }

  function isPointerInImageOverlay(event) {
    if (!event || currentKind !== "video" || !overlayImageGroup.visible) {
      return false;
    }

    const canvasPoint = getCanvasPoint(event);
    const padding = IMAGE_OVERLAY_HANDLE_RADIUS + 4;

    return (
      canvasPoint.x >= imageFrame.x - padding &&
      canvasPoint.x <= imageFrame.x + imageFrame.width + padding &&
      canvasPoint.y >= imageFrame.y - padding &&
      canvasPoint.y <= imageFrame.y + imageFrame.height + padding
    );
  }

  function getCanvasPoint(event) {
    const bounds = canvas.getBoundingClientRect();

    return {
      x: ((event.clientX - bounds.left) / bounds.width) * VIEW_WIDTH,
      y: ((event.clientY - bounds.top) / bounds.height) * VIEW_HEIGHT,
    };
  }

  async function togglePlayback(event) {
    if (suppressNextCanvasToggle) {
      suppressNextCanvasToggle = false;
      return;
    }

    if (
      currentKind === "video" &&
      (isPointerInEditorPanel(event) || isPointerInImageOverlay(event))
    ) {
      return;
    }

    if (!mediaElement || currentKind === "image") {
      return;
    }

    if (audioContext?.state === "suspended") {
      await audioContext.resume();
    }

    if (mediaElement.paused) {
      await mediaElement.play();
      statusText.textContent = "Click canvas to pause";
      app.start();
    } else {
      mediaElement.pause();
      statusText.textContent = "Paused";
      app.render();
    }
  }

  chooseButton.addEventListener("click", handleChooseClick);
  exportButton.addEventListener("click", handleExportClick);
  input.addEventListener("change", handleInputChange);
  canvas.addEventListener("pointerdown", togglePlayback);
  window.addEventListener("resize", resizeCanvas);
  timeline.on("pointerdown", handleTimelinePointerDown);
  timeline.on("pointerup", handleTimelinePointerUp);
  timeline.on("pointerupoutside", handleTimelinePointerUp);
  timeline.on("globalpointermove", handleTimelinePointerMove);
  overlayImageGroup.on("pointerdown", handleImagePointerDown);
  overlayImageGroup.on("pointerup", handleImagePointerUp);
  overlayImageGroup.on("pointerupoutside", handleImagePointerUp);
  overlayImageGroup.on("globalpointermove", handleImagePointerMove);
  overlayImageHandles.forEach((handle) => {
    handle.node.on("pointerdown", (event) => handleImageResizePointerDown(handle.corner, event));
    handle.node.on("pointerup", handleImagePointerUp);
    handle.node.on("pointerupoutside", handleImagePointerUp);
    handle.node.on("globalpointermove", handleImagePointerMove);
  });
  overlayText.on("pointerdown", handleTextPointerDown);
  overlayText.on("pointerup", handleTextPointerUp);
  overlayText.on("pointerupoutside", handleTextPointerUp);
  overlayText.on("globalpointermove", handleTextPointerMove);
  app.ticker.add(renderScene);

  resizeCanvas();

  return () => {
    clearCurrentMedia();
    chooseButton.removeEventListener("click", handleChooseClick);
    exportButton.removeEventListener("click", handleExportClick);
    exportButton.remove();
    input.removeEventListener("change", handleInputChange);
    canvas.removeEventListener("pointerdown", togglePlayback);
    window.removeEventListener("resize", resizeCanvas);
    input.remove();
    timeline.off("pointerdown", handleTimelinePointerDown);
    timeline.off("pointerup", handleTimelinePointerUp);
    timeline.off("pointerupoutside", handleTimelinePointerUp);
    timeline.off("globalpointermove", handleTimelinePointerMove);
    overlayImageGroup.off("pointerdown", handleImagePointerDown);
    overlayImageGroup.off("pointerup", handleImagePointerUp);
    overlayImageGroup.off("pointerupoutside", handleImagePointerUp);
    overlayImageGroup.off("globalpointermove", handleImagePointerMove);
    overlayImageHandles.forEach((handle) => {
      handle.node.removeAllListeners();
    });
    overlayText.off("pointerdown", handleTextPointerDown);
    overlayText.off("pointerup", handleTextPointerUp);
    overlayText.off("pointerupoutside", handleTextPointerUp);
    overlayText.off("globalpointermove", handleTextPointerMove);
    app.ticker.remove(renderScene);
    app.destroy(false);
  };
}

function createImageResizeHandle(corner) {
  const handle = new Graphics();

  handle.circle(0, 0, IMAGE_OVERLAY_HANDLE_RADIUS).fill({ color: 0xffffff, alpha: 0.001 });
  handle.eventMode = "static";
  handle.cursor = corner === "tl" || corner === "br" ? "nwse-resize" : "nesw-resize";

  return handle;
}

function getOverlayTransitionAtTime(time, intervals, transitionSeconds) {
  let progress = 0;

  for (const interval of intervals) {
    const start = interval.startTime;
    const end = interval.startTime + interval.duration;

    if (time < start || time >= end) {
      continue;
    }

    const fadeIn = transitionSeconds > 0 ? Math.min((time - start) / transitionSeconds, 1) : 1;
    const fadeOut = transitionSeconds > 0 ? Math.min((end - time) / transitionSeconds, 1) : 1;

    progress = Math.max(progress, easeInOut(Math.min(fadeIn, fadeOut)));
  }

  return {
    alpha: progress,
    yScale: Math.cos((1 - progress) * (Math.PI / 2)),
  };
}

function easeInOut(value) {
  return value * value * (3 - 2 * value);
}

function loadImageElement(src) {
  const image = new Image();

  image.decoding = "async";
  image.src = src;

  if (typeof image.decode === "function") {
    return image.decode().then(() => image);
  }

  return new Promise((resolve, reject) => {
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", () => reject(new Error("Failed to load overlay image.")), {
      once: true,
    });
  });
}
