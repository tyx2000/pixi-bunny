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
  exportTimelineComposition,
  extractVideoFramesWithMediabunny,
} from "./util.js";
import fogImageUrl from "./assets/fog.jpg";

const VIEW_WIDTH = 960;
const VIEW_HEIGHT = 660;
const HEADER_HEIGHT = 60;
const MEDIA_PADDING = 12;
const PREVIEW_HEIGHT = Math.round(VIEW_HEIGHT * 0.8);
const TIMELINE_PANEL_HEIGHT = VIEW_HEIGHT - PREVIEW_HEIGHT;
const BAR_COUNT = 48;
const TIMELINE_X = MEDIA_PADDING + 72;
const TIMELINE_HEIGHT = 3;
const TIMELINE_HIT_HEIGHT = 42;
const PREVIEW_CONTROL_HEIGHT = 34;
const PREVIEW_CONTROL_GAP = 10;
const PREVIEW_MEDIA_CONTROL_GAP = 12;
const PREVIEW_PLAY_BUTTON_WIDTH = 44;
const PREVIEW_ACTION_BUTTON_WIDTH = 54;
const PREVIEW_TIMECODE_WIDTH = 148;
const PREVIEW_PROGRESS_MIN_WIDTH = 160;
const EDITOR_PANEL_X = 0;
const EDITOR_PANEL_Y = PREVIEW_HEIGHT;
const EDITOR_PANEL_HEADER_HEIGHT = 26;
const TRACK_LABEL_WIDTH = 76;
const TRACK_ROW_HEIGHT = 60;
const TRACK_ROW_GAP = 8;
const RULER_TRACK_GAP = 10;
const RULER_LABEL_HEIGHT = 16;
const VIDEO_TRACK_HEIGHT = TRACK_ROW_HEIGHT;
const AUDIO_TRACK_HEIGHT = TRACK_ROW_HEIGHT;
const IMAGE_TRACK_HEIGHT = TRACK_ROW_HEIGHT;
const VIDEO_THUMB_WIDTH = 92;
const VIDEO_THUMB_HEIGHT = VIDEO_TRACK_HEIGHT - 8;
const TIMELINE_PIXELS_PER_SECOND = 10;
const TRACK_OVERLAP_EPSILON = 0.02;
const IMAGE_CLIP_DEFAULT_DURATION = 5;
const VIDEO_FRAME_MIN_INTERVAL = 1 / 30;
const TEXT_OVERLAY_INTERVALS = [
  { duration: 4, startTime: 2 },
  { duration: 7, startTime: 10 },
];
const TEXT_OVERLAY_VALUE = "Pixi text";
const TEXT_OVERLAY_DEFAULT_DURATION = 5;
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
  document.body.classList.add("pixi-media-page");

  const canvas = document.getElementById("app-canvas");
  const fileName = document.getElementById("moves-count");
  const statusText = document.getElementById("status-text");
  const chooseButton = document.getElementById("shuffle-button");
  const hud = document.getElementById("hud");
  const fileLabel = fileName?.closest("span")?.firstChild;

  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("Canvas element #app-canvas was not found.");
  }

  if (
    !(fileName instanceof HTMLElement) ||
    !(statusText instanceof HTMLElement) ||
    !(chooseButton instanceof HTMLButtonElement) ||
    !(hud instanceof HTMLElement)
  ) {
    throw new Error("Media viewer HUD elements were not found.");
  }

  if (fileLabel) {
    fileLabel.textContent = "File: ";
  }

  document.documentElement.style.setProperty("--game-aspect", `${VIEW_WIDTH} / ${PREVIEW_HEIGHT}`);
  chooseButton.textContent = "媒体文件";
  fileName.textContent = "none";
  statusText.textContent = "Image, video, or audio";

  const exportButton = document.createElement("button");
  exportButton.type = "button";
  exportButton.textContent = "导出";
  exportButton.disabled = true;

  const subtitleButton = document.createElement("button");
  subtitleButton.type = "button";
  subtitleButton.textContent = "字幕";

  const subtitleTextInput = document.createElement("input");
  subtitleTextInput.type = "text";
  subtitleTextInput.value = TEXT_OVERLAY_VALUE;
  subtitleTextInput.ariaLabel = "字幕文本";

  const subtitleSizeSelect = createSelect("字幕字号", ["28", "36", "42", "48", "56", "64"], "42");
  const subtitleFontSelect = createSelect(
    "字幕字体",
    ["Inter", "Arial", "Georgia", "Times New Roman", "Courier New"],
    "Inter"
  );
  const subtitleStyleSelect = createSelect(
    "字幕风格",
    ["Regular", "Bold", "Italic", "Bold Italic"],
    "Bold"
  );
  const subtitleColorInput = document.createElement("input");
  subtitleColorInput.type = "color";
  subtitleColorInput.value = "#ffffff";
  subtitleColorInput.ariaLabel = "字幕颜色";

  const toolbarLeft = document.createElement("div");
  toolbarLeft.className = "media-toolbar-left";
  const toolbarRight = document.createElement("div");
  toolbarRight.className = "media-toolbar-right";
  const subtitleControls = document.createElement("div");
  subtitleControls.className = "subtitle-controls";

  subtitleControls.append(
    subtitleTextInput,
    subtitleSizeSelect,
    subtitleFontSelect,
    subtitleStyleSelect,
    subtitleColorInput
  );
  toolbarLeft.append(chooseButton, subtitleButton, subtitleControls);
  toolbarRight.append(exportButton);
  hud.append(toolbarLeft, toolbarRight);

  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*,video/*,audio/*";
  input.hidden = true;
  document.body.appendChild(input);

  const timelineCanvas = document.createElement("canvas");
  timelineCanvas.id = "timeline-canvas";
  canvas.insertAdjacentElement("afterend", timelineCanvas);

  const app = new Application();
  const timelineApp = new Application();

  await app.init({
    canvas,
    width: VIEW_WIDTH,
    height: PREVIEW_HEIGHT,
    backgroundColor: 0x0f172a,
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  });

  await timelineApp.init({
    canvas: timelineCanvas,
    width: VIEW_WIDTH,
    height: TIMELINE_PANEL_HEIGHT,
    backgroundColor: 0x101010,
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  });
  timelineApp.stop();
  maintainCanvasLayout();

  const overlayImageTexture = await Assets.load(fogImageUrl);
  const overlayImageElement = await loadImageElement(fogImageUrl);

  const scene = new Container();
  const timelineScene = new Container();
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
  const playPauseButton = new Container();
  const playPauseButtonBackground = new Graphics();
  const playPauseButtonIcon = new Graphics();
  const splitButton = new Container();
  const splitButtonBackground = new Graphics();
  const splitButtonLabel = new Text({
    text: "分割",
    style: {
      fill: "#f5f5f5",
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: 13,
      fontWeight: "700",
    },
  });
  const deleteButton = new Container();
  const deleteButtonBackground = new Graphics();
  const deleteButtonLabel = new Text({
    text: "删除",
    style: {
      fill: "#f5f5f5",
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: 13,
      fontWeight: "700",
    },
  });
  const editorTimeline = new Container();
  const editorTimelineBackground = new Graphics();
  const editorTimelineContent = new Container();
  const editorTimelineTracks = new Container();
  const editorTimelineRuler = new Graphics();
  const editorTimelineRulerLabels = new Container();
  const editorTimelineFrames = new Container();
  const editorTimelineAudioClips = new Container();
  const editorTimelineImageClips = new Container();
  const editorTimelineTrackLabels = new Container();
  const editorTimelinePlayhead = new Graphics();
  const editorTimelineMask = new Graphics();
  const editorTimelineTrackMask = new Graphics();
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
  const editorTimelineAudioLabel = new Text({
    text: "Audio",
    style: {
      fill: "#cbd5e1",
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: 13,
      fontWeight: "700",
    },
  });
  const editorTimelineImageLabel = new Text({
    text: "Image",
    style: {
      fill: "#cbd5e1",
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: 13,
      fontWeight: "700",
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
  timelineApp.stage.addChild(timelineScene);
  scene.addChild(mediaLayer, textLayer, overlay, visualizer, controlsLayer, titleText, detailText);
  timelineScene.addChild(editorTimeline);
  overlayImageGroup.addChild(
    overlayImageSprite,
    ...overlayImageHandles.map((handle) => handle.node)
  );
  textLayer.addChild(overlayImageGroup, overlayText);
  controlsLayer.addChild(timeline);
  playPauseButton.addChild(playPauseButtonBackground, playPauseButtonIcon);
  splitButton.addChild(splitButtonBackground, splitButtonLabel);
  deleteButton.addChild(deleteButtonBackground, deleteButtonLabel);
  timeline.addChild(
    playPauseButton,
    timelineTrack,
    timelineFill,
    timelineKnob,
    currentTimeText,
    durationText,
    splitButton,
    deleteButton
  );
  editorTimelineContent.addChild(
    editorTimelineRuler,
    editorTimelineRulerLabels,
    editorTimelineTracks
  );
  editorTimelineTracks.addChild(
    editorTimelineFrames,
    editorTimelineAudioClips,
    editorTimelineImageClips
  );
  editorTimeline.addChild(
    editorTimelineBackground,
    editorTimelineContent,
    editorTimelinePlayhead,
    editorTimelineMask,
    editorTimelineTrackMask,
    editorTimelineTrackLabels,
    editorTimelineLabel,
    editorTimelineAudioLabel,
    editorTimelineImageLabel,
    editorTimelineStatus
  );
  editorTimelineContent.mask = editorTimelineMask;
  editorTimelineTracks.mask = editorTimelineTrackMask;

  let timelineScale = 1;
  let timelineVerticalScroll = 0;

  timeline.visible = false;
  timeline.eventMode = "static";
  timeline.cursor = "pointer";
  timeline.hitArea = new Rectangle(
    0,
    getPreviewTimelineY() - TIMELINE_HIT_HEIGHT / 2,
    getPreviewWidth(),
    TIMELINE_HIT_HEIGHT
  );
  currentTimeText.anchor.set(0, 0.5);
  durationText.visible = false;
  splitButtonLabel.anchor.set(0.5);
  deleteButtonLabel.anchor.set(0.5);
  playPauseButton.eventMode = "static";
  playPauseButton.cursor = "pointer";
  splitButton.eventMode = "static";
  splitButton.cursor = "pointer";
  deleteButton.eventMode = "static";
  deleteButton.cursor = "pointer";
  currentTimeText.position.set(getPreviewTimelineX(), getPreviewTimelineY() + 28);
  durationText.position.set(
    getPreviewTimelineX() + getPreviewTimelineWidth(),
    getPreviewTimelineY() + 28
  );
  editorTimeline.visible = false;
  editorTimeline.eventMode = "static";
  editorTimelineLabel.anchor.set(0, 0.5);
  editorTimelineLabel.visible = false;
  editorTimelineLabel.position.set(EDITOR_PANEL_X + 14, getVideoTrackY() + VIDEO_TRACK_HEIGHT / 2);
  editorTimelineAudioLabel.anchor.set(0, 0.5);
  editorTimelineAudioLabel.visible = false;
  editorTimelineAudioLabel.position.set(
    EDITOR_PANEL_X + 14,
    getVideoTrackY() + getTrackPitch() + AUDIO_TRACK_HEIGHT / 2
  );
  editorTimelineImageLabel.anchor.set(0, 0.5);
  editorTimelineImageLabel.visible = false;
  editorTimelineImageLabel.position.set(
    EDITOR_PANEL_X + 14,
    getVideoTrackY() + getTrackPitch() * 2 + IMAGE_TRACK_HEIGHT / 2
  );
  editorTimelineStatus.anchor.set(0.5, 0.5);
  editorTimelineStatus.position.set(getEditorPlayheadX(), EDITOR_PANEL_Y + 14);

  titleText.anchor.set(0.5);
  detailText.anchor.set(0.5);
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
  let playbackTime = 0;
  let playbackPlaying = false;
  let videoFramePending = false;
  let videoFrameRequestId = 0;
  let videoTrackBuildId = 0;
  let videoTrackTextures = [];
  let audioTrackGraphics = [];
  let imageTrackTextures = [];
  let videoTimelineClips = [];
  let audioTimelineClips = [];
  let imageTimelineClips = [];
  let timelineObjectUrls = [];
  let videoTrackLoading = false;
  let editorTimelineRulerDuration = -1;
  let editorTimelineRulerY = -1;
  let lastVideoFrameTime = -1;
  let wasPlayingBeforeSeek = false;
  let suppressNextCanvasToggle = false;
  let timelineClipDrag = null;
  let textOverlayIntervals = [];
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
    playbackTime = 0;
    playbackPlaying = false;
    videoFrameRequestId += 1;
    videoTrackBuildId += 1;
    videoFramePending = false;
    videoTrackLoading = false;
    lastVideoFrameTime = -1;
    timelineClipDrag = null;
    clearTimelineTracks();
    currentVideoFile = null;
    exportButton.disabled = true;
    isExporting = false;
    textOverlayIntervals = [];
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
      mediaElement.removeEventListener("ended", handleMediaEnded);
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
    const kind = getMediaKind(file);

    if (hasPrimaryVideoTrack()) {
      try {
        statusText.textContent = "Adding";

        if (kind === "audio") {
          await addAudioTimelineClip(file);
        } else if (kind === "image") {
          await addImageTimelineClip(file);
        } else if (kind === "video") {
          await appendVideoTimelineClip(file);
        } else {
          throw new Error("Unsupported file type.");
        }

        drawEditorTimeline();
        app.render();
      } catch (error) {
        statusText.textContent = error instanceof Error ? error.message : "Failed to add";
      }

      return;
    }

    clearCurrentMedia();

    objectUrl = URL.createObjectURL(file);
    fileName.textContent = file.name;
    statusText.textContent = "Loading";

    try {
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
      app.render();
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

    video.loop = false;
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
    playbackTime = 0;
    playbackPlaying = false;
    exportButton.disabled = false;
    videoTimelineClips = [
      {
        audioElement: video,
        duration: videoFrameProvider.duration,
        file,
        provider: videoFrameProvider,
        startTime: 0,
      },
    ];
    statusText.textContent = `Video ${videoFrameProvider.width}x${videoFrameProvider.height}`;
    startVideoTrackBuild();
    statusText.textContent = "Click canvas to play";
  }

  async function loadAudio(file) {
    mediaElement = new Audio(objectUrl);
    mediaElement.loop = false;
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
    mediaElement.addEventListener("ended", handleMediaEnded);
  }

  function hasPrimaryVideoTrack() {
    return currentKind === "video" && videoFrameProvider && mediaElement;
  }

  async function appendVideoTimelineClip(file) {
    const provider = await createMediabunnyVideoFrameProvider(file);
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");

    timelineObjectUrls.push(url);
    video.loop = false;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;

    try {
      await provider.drawFrameAt(0);
      await waitForMediaReady(video, "loadedmetadata", "video");

      videoTimelineClips.push({
        audioElement: video,
        duration: provider.duration,
        file,
        provider,
        startTime: getVideoTimelineDuration(),
      });

      startVideoTrackBuild();
      drawEditorTimeline();
      statusText.textContent = "Video appended";
    } catch (error) {
      provider.dispose();
      video.pause();
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      timelineObjectUrls = timelineObjectUrls.filter((item) => item !== url);
      throw error;
    }
  }

  async function addAudioTimelineClip(file) {
    const url = URL.createObjectURL(file);
    const audio = new Audio(url);

    timelineObjectUrls.push(url);
    audio.loop = false;
    audio.preload = "auto";
    await waitForMediaReady(audio, "loadedmetadata", "audio");

    const clip = {
      audioElement: audio,
      duration: Number.isFinite(audio.duration) ? audio.duration : 0,
      file,
      startTime: getInsertionTime(),
      trackIndex: getNextTrackIndex(audioTimelineClips),
    };

    audio.pause();
    audioTimelineClips.push(clip);
    renderTimelineClipTracks();
    drawEditorTimeline();
    syncTimelineAudio();
    statusText.textContent = "Audio added";

    void drawAudioSpectrum(clip).catch(() => {
      renderTimelineClipTracks();
      app.render();
    });
  }

  async function addImageTimelineClip(file) {
    const url = URL.createObjectURL(file);
    const texture = await Assets.load({
      src: url,
      parser: "texture",
      data: { mime: file.type },
    });
    const imageElement = await loadImageElement(url);
    const clip = {
      duration: IMAGE_CLIP_DEFAULT_DURATION,
      imageElement,
      startTime: getInsertionTime(),
      texture,
      trackIndex: getNextTrackIndex(imageTimelineClips),
    };

    timelineObjectUrls.push(url);
    imageTimelineClips.push(clip);
    renderTimelineClipTracks();
    imagePositionInitialized = false;
    drawEditorTimeline();
    statusText.textContent = "Image added";
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
    const maxWidth = getPreviewWidth() - MEDIA_PADDING * 2;
    const previewTop = MEDIA_PADDING;
    const previewBottom = getPreviewContentBottom();
    const maxHeight = Math.max(1, previewBottom - previewTop);
    const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight);

    mediaSprite.scale.set(scale);
    mediaSprite.position.set(getPreviewWidth() / 2, previewTop + maxHeight / 2);
    updateImageOverlayPosition();
    updateTextOverlayPosition();
  }

  function getPlaybackDuration() {
    if (currentKind === "video") {
      return getTimelineDuration();
    }

    return mediaElement && Number.isFinite(mediaElement.duration) ? mediaElement.duration : 0;
  }

  function getCurrentPlaybackTime() {
    if (currentKind === "video") {
      return playbackTime;
    }

    return mediaElement && Number.isFinite(mediaElement.currentTime) ? mediaElement.currentTime : 0;
  }

  function setTimelinePlaybackTime(value, forceFrame = true) {
    const duration = getPlaybackDuration();

    playbackTime = Math.min(Math.max(Number.isFinite(value) ? value : 0, 0), duration);
    updateVideoTexture(forceFrame);
    syncTimelineAudio();
    drawTimeline();
    drawEditorTimeline();
  }

  function getActiveVideoTimelineClip(time = playbackTime) {
    return (
      videoTimelineClips.find(
        (clip) => time >= clip.startTime && time < clip.startTime + clip.duration
      ) || null
    );
  }

  function getClipTrackIndex(clip) {
    return Math.max(0, Number.isFinite(clip?.trackIndex) ? clip.trackIndex : 0);
  }

  function getTimelineTrackCount(clips) {
    if (clips.length === 0) {
      return 1;
    }

    return Math.max(1, ...clips.map((clip) => getClipTrackIndex(clip) + 1));
  }

  function getNextTrackIndex(clips, excludedClip = null) {
    const trackIndexes = clips
      .filter((clip) => clip !== excludedClip)
      .map((clip) => getClipTrackIndex(clip));

    return trackIndexes.length === 0 ? 0 : Math.max(...trackIndexes) + 1;
  }

  function getAudioTrackCount() {
    return getTimelineTrackCount(audioTimelineClips);
  }

  function getImageTrackCount() {
    return getTimelineTrackCount(imageTimelineClips);
  }

  function getEditorPanelRowCount() {
    return 1 + getAudioTrackCount() + getImageTrackCount();
  }

  function getPreviewWidth() {
    return Math.max(1, app.screen.width || VIEW_WIDTH);
  }

  function getPreviewHeight() {
    return Math.max(1, app.screen.height || PREVIEW_HEIGHT);
  }

  function getPreviewTimelineX() {
    const leftControlsWidth = PREVIEW_PLAY_BUTTON_WIDTH + PREVIEW_CONTROL_GAP * 2;

    return MEDIA_PADDING + leftControlsWidth;
  }

  function getPreviewTimelineY() {
    return getPreviewControlY() + PREVIEW_CONTROL_HEIGHT / 2;
  }

  function getPreviewTimelineWidth() {
    const x = getPreviewTimelineX();
    const rightControlsWidth =
      PREVIEW_TIMECODE_WIDTH +
      PREVIEW_ACTION_BUTTON_WIDTH * 2 +
      PREVIEW_CONTROL_GAP * 4 +
      MEDIA_PADDING;

    return Math.max(PREVIEW_PROGRESS_MIN_WIDTH, getPreviewWidth() - x - rightControlsWidth);
  }

  function getPreviewControlY() {
    return Math.max(MEDIA_PADDING, getPreviewHeight() - MEDIA_PADDING - PREVIEW_CONTROL_HEIGHT);
  }

  function getPreviewContentBottom() {
    return Math.max(MEDIA_PADDING + 1, getPreviewControlY() - PREVIEW_MEDIA_CONTROL_GAP);
  }

  function getPreviewContentCenterY() {
    return MEDIA_PADDING + (getPreviewContentBottom() - MEDIA_PADDING) / 2;
  }

  function getPreviewTimecodeX() {
    return getPreviewTimelineX() + getPreviewTimelineWidth() + PREVIEW_CONTROL_GAP;
  }

  function getPreviewSplitButtonX() {
    return getPreviewTimecodeX() + PREVIEW_TIMECODE_WIDTH + PREVIEW_CONTROL_GAP;
  }

  function getPreviewDeleteButtonX() {
    return getPreviewSplitButtonX() + PREVIEW_ACTION_BUTTON_WIDTH + PREVIEW_CONTROL_GAP;
  }

  function layoutPreviewText() {
    const centerY = getPreviewContentCenterY();

    titleText.position.set(getPreviewWidth() / 2, centerY - 22);
    detailText.position.set(getPreviewWidth() / 2, centerY + 18);
    detailText.style.wordWrapWidth = Math.max(1, getPreviewWidth() - MEDIA_PADDING * 2);
  }

  function getTimelineViewportWidth() {
    return Math.max(VIEW_WIDTH, timelineApp.screen.width / timelineScale);
  }

  function getTimelineViewportHeight() {
    return Math.max(TIMELINE_PANEL_HEIGHT, timelineApp.screen.height / timelineScale);
  }

  function getEditorPanelWidth() {
    return Math.max(1, getTimelineViewportWidth() - EDITOR_PANEL_X * 2);
  }

  function getEditorPanelHeight() {
    return getTimelineViewportHeight();
  }

  function getEditorPanelY() {
    return EDITOR_PANEL_Y;
  }

  function getEditorRulerY() {
    return getEditorPanelY() + 18;
  }

  function getVideoTrackY() {
    return getEditorRulerY() + RULER_LABEL_HEIGHT + RULER_TRACK_GAP;
  }

  function getVideoTrackX() {
    return EDITOR_PANEL_X + TRACK_LABEL_WIDTH;
  }

  function getVideoTrackWidth() {
    return Math.max(1, getEditorPanelWidth() - TRACK_LABEL_WIDTH - 18);
  }

  function getEditorPlayheadX() {
    return getVideoTrackX() + getVideoTrackWidth() / 2;
  }

  function getAudioTrackY(trackIndex = 0) {
    return getVideoTrackY() + TRACK_ROW_HEIGHT + TRACK_ROW_GAP + trackIndex * getTrackPitch();
  }

  function getImageTrackY(trackIndex = 0) {
    return getAudioTrackY(getAudioTrackCount()) + trackIndex * getTrackPitch();
  }

  function getTrackPitch() {
    return TRACK_ROW_HEIGHT + TRACK_ROW_GAP;
  }

  function drawCanvasIntoPreview(sourceCanvas) {
    const previewCanvas = videoFrameProvider?.canvas;
    const context = previewCanvas?.getContext("2d", { alpha: false });

    if (!previewCanvas || !context) {
      return;
    }

    context.fillStyle = "#000000";
    context.fillRect(0, 0, previewCanvas.width, previewCanvas.height);

    if (!sourceCanvas) {
      return;
    }

    const scale = Math.min(
      previewCanvas.width / sourceCanvas.width,
      previewCanvas.height / sourceCanvas.height
    );
    const width = sourceCanvas.width * scale;
    const height = sourceCanvas.height * scale;
    const x = (previewCanvas.width - width) / 2;
    const y = (previewCanvas.height - height) / 2;

    context.drawImage(sourceCanvas, x, y, width, height);
  }

  function syncTimelineAudio() {
    for (const clip of videoTimelineClips) {
      syncClipMediaElement(clip.audioElement, clip.startTime, clip.duration);
    }

    for (const clip of audioTimelineClips) {
      syncClipMediaElement(clip.audioElement, clip.startTime, clip.duration);
    }
  }

  function syncClipMediaElement(element, startTime, duration) {
    if (!element) {
      return;
    }

    const localTime = playbackTime - startTime;
    const shouldPlay = playbackPlaying && localTime >= 0 && localTime < duration && duration > 0;

    if (!shouldPlay) {
      element.pause();
      return;
    }

    const safeTime = Math.min(Math.max(localTime, 0), Math.max(0, duration - 0.02));

    if (Number.isFinite(element.duration) && Math.abs(element.currentTime - safeTime) > 0.08) {
      element.currentTime = safeTime;
    }

    if (element.paused) {
      void element.play().catch(() => {
        element.pause();
      });
    }
  }

  function pauseTimelineAudio() {
    for (const clip of videoTimelineClips) {
      clip.audioElement?.pause();
    }

    for (const clip of audioTimelineClips) {
      clip.audioElement?.pause();
    }
  }

  async function startTimelinePlayback() {
    if (currentKind !== "video") {
      return;
    }

    const duration = getPlaybackDuration();

    if (duration <= 0) {
      return;
    }

    if (playbackTime >= duration - 0.001) {
      playbackTime = 0;
    }

    playbackPlaying = true;
    syncTimelineAudio();
    statusText.textContent = "Click canvas to pause";
    app.start();
  }

  function pauseTimelinePlayback(status = "Paused") {
    playbackPlaying = false;
    pauseTimelineAudio();
    statusText.textContent = status;
    app.stop();
    renderScene();
    app.render();
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
    if (currentKind !== "video") {
      return { alpha: 0, yScale: 0 };
    }

    return getOverlayTransitionAtTime(playbackTime, intervals, OVERLAY_FADE_SECONDS);
  }

  function updateTextOverlayPosition() {
    const rect = getMediaSpriteRect();

    if (!rect || currentKind !== "video") {
      overlayText.visible = false;
      return;
    }

    if (!textPositionInitialized) {
      overlayText.position.set(rect.left + rect.width / 2, rect.top + rect.height * 0.82);
      textPositionInitialized = true;
    }

    overlayText.scale.set(1, 1);
    clampTextToMediaRect();
    const transition = getCurrentOverlayTransition(textOverlayIntervals);

    overlayText.alpha = transition.alpha;
    overlayText.scale.x = transition.yScale;
    overlayText.visible = overlayText.alpha > 0;
  }

  function updateImageOverlayPosition() {
    const rect = getMediaSpriteRect();
    const activeClip = getActiveImageTimelineClip();

    if (!rect || currentKind !== "video" || !activeClip) {
      overlayImageGroup.visible = false;
      return;
    }

    overlayImageSprite.texture = activeClip.texture;

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
    const transition = getCurrentOverlayTransition([
      { duration: activeClip.duration, startTime: activeClip.startTime },
    ]);

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
    const activeClip = getActiveImageTimelineClip();
    const texture = activeClip?.texture || overlayImageTexture;
    const element = activeClip?.imageElement || overlayImageElement;
    const width = texture.width || element.naturalWidth || 1;
    const height = texture.height || element.naturalHeight || 1;

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
    const previewWidth = getPreviewWidth();
    const previewHeight = getPreviewHeight();

    layoutPreviewText();
    overlay.clear();
    overlay.rect(0, 0, previewWidth, previewHeight).fill(0x050505);
    overlay
      .rect(
        MEDIA_PADDING,
        MEDIA_PADDING,
        previewWidth - MEDIA_PADDING * 2,
        getPreviewContentBottom() - MEDIA_PADDING
      )
      .fill({ color: 0x000000, alpha: 0.9 });
    visualizer.clear();
  }

  function drawAudioVisualizer() {
    if (!analyser || !frequencyData) {
      return;
    }

    analyser.getByteFrequencyData(frequencyData);
    overlay.clear();
    overlay.rect(0, 0, getPreviewWidth(), getPreviewHeight()).fill(0x0f172a);
    overlay
      .circle(getPreviewWidth() / 2, getPreviewHeight() * 0.32, 72)
      .fill({ color: 0x2563eb, alpha: 0.26 });
    overlay
      .circle(getPreviewWidth() / 2, getPreviewHeight() * 0.32, 44)
      .fill({ color: 0x38bdf8, alpha: 0.72 });

    visualizer.clear();
    const areaX = Math.max(48, getPreviewWidth() * 0.1);
    const areaY = getPreviewHeight() * 0.58;
    const areaWidth = getPreviewWidth() - areaX * 2;
    const areaHeight = Math.max(72, getPreviewHeight() * 0.22);
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
    if (currentKind !== "video" || !mediaTexture?.source || !videoFrameProvider) {
      return;
    }

    const frameTime = playbackTime;

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

    const clip = getActiveVideoTimelineClip(frameTime);

    if (!clip?.provider) {
      drawCanvasIntoPreview(null);
      mediaTexture.source.update();
      mediaTexture.update?.();
      fitMediaSprite();
      updateImageOverlayPosition();
      updateTextOverlayPosition();
      drawTimeline();
      drawEditorTimeline();
      videoFramePending = false;
      app.render();
      return;
    }

    clip.provider
      .drawFrameAt(frameTime - clip.startTime)
      .then((frame) => {
        if (requestId !== videoFrameRequestId || currentKind !== "video" || !frame) {
          return;
        }

        if (frame.canvas !== videoFrameProvider.canvas) {
          drawCanvasIntoPreview(frame.canvas);
        }

        mediaTexture?.source?.update?.();
        mediaTexture?.update?.();
        fitMediaSprite();
        updateImageOverlayPosition();
        updateTextOverlayPosition();
        drawTimeline();
        drawEditorTimeline();
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
          Math.abs(playbackTime - lastVideoFrameTime) >= VIDEO_FRAME_MIN_INTERVAL
        ) {
          updateVideoTexture();
        }
      });
  }

  function isSeekableMedia() {
    if (currentKind === "video") {
      return hasPrimaryVideoTrack() && getPlaybackDuration() > 0;
    }

    return (
      currentKind === "audio" &&
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

    const duration = getPlaybackDuration();
    const currentTime = Math.min(Math.max(getCurrentPlaybackTime(), 0), duration);
    const progress = currentTime / duration;
    const timelineX = getPreviewTimelineX();
    const timelineY = getPreviewTimelineY();
    const timelineWidth = getPreviewTimelineWidth();
    const knobX = timelineX + timelineWidth * progress;
    const barY = timelineY - TIMELINE_HEIGHT / 2;

    timeline.visible = true;
    drawPreviewPlaybackControls(currentTime, duration);
    timeline.hitArea = new Rectangle(
      0,
      timelineY - TIMELINE_HIT_HEIGHT / 2,
      getPreviewWidth(),
      TIMELINE_HIT_HEIGHT
    );
    timelineTrack.clear();
    timelineTrack
      .roundRect(timelineX, barY, timelineWidth, TIMELINE_HEIGHT, TIMELINE_HEIGHT / 2)
      .fill(0x111111)
      .stroke({ color: 0xffffff, width: 1 });

    timelineFill.clear();
    timelineFill
      .roundRect(
        timelineX,
        barY,
        Math.max(0, knobX - timelineX),
        TIMELINE_HEIGHT,
        TIMELINE_HEIGHT / 2
      )
      .fill(0xffffff);

    timelineKnob.clear();
    timelineKnob
      .moveTo(knobX, timelineY - 14)
      .lineTo(knobX, timelineY + 14)
      .stroke({ color: 0xffffff, width: 3 });

    currentTimeText.text = `${formatTime(currentTime)} / ${formatTime(duration)}`;
    currentTimeText.position.set(getPreviewTimecodeX(), timelineY);
  }

  function drawPreviewPlaybackControls() {
    const y = getPreviewControlY();
    const centerY = y + PREVIEW_CONTROL_HEIGHT / 2;

    drawPlayPauseButton(y);
    drawPreviewActionButton(
      splitButton,
      splitButtonBackground,
      splitButtonLabel,
      getPreviewSplitButtonX(),
      y
    );
    drawPreviewActionButton(
      deleteButton,
      deleteButtonBackground,
      deleteButtonLabel,
      getPreviewDeleteButtonX(),
      y
    );

    currentTimeText.style.fill = "#f5f5f5";
    currentTimeText.style.fontSize = 13;
    currentTimeText.anchor.set(0, 0.5);
    currentTimeText.hitArea = new Rectangle(0, 0, PREVIEW_TIMECODE_WIDTH, PREVIEW_CONTROL_HEIGHT);
    durationText.visible = false;
    playPauseButton.position.set(MEDIA_PADDING, y);
    splitButton.position.set(getPreviewSplitButtonX(), y);
    deleteButton.position.set(getPreviewDeleteButtonX(), y);
    splitButtonLabel.position.set(PREVIEW_ACTION_BUTTON_WIDTH / 2, PREVIEW_CONTROL_HEIGHT / 2);
    deleteButtonLabel.position.set(PREVIEW_ACTION_BUTTON_WIDTH / 2, PREVIEW_CONTROL_HEIGHT / 2);
    playPauseButton.hitArea = new Rectangle(
      0,
      0,
      PREVIEW_PLAY_BUTTON_WIDTH,
      PREVIEW_CONTROL_HEIGHT
    );
    splitButton.hitArea = new Rectangle(0, 0, PREVIEW_ACTION_BUTTON_WIDTH, PREVIEW_CONTROL_HEIGHT);
    deleteButton.hitArea = new Rectangle(0, 0, PREVIEW_ACTION_BUTTON_WIDTH, PREVIEW_CONTROL_HEIGHT);
    playPauseButtonIcon.position.set(PREVIEW_PLAY_BUTTON_WIDTH / 2, centerY - y);
  }

  function drawPlayPauseButton(y) {
    playPauseButtonBackground.clear();
    playPauseButtonBackground
      .roundRect(0, 0, PREVIEW_PLAY_BUTTON_WIDTH, PREVIEW_CONTROL_HEIGHT, 6)
      .fill({ color: 0xffffff, alpha: 0.001 });

    playPauseButtonIcon.clear();
    if (currentKind === "video" ? playbackPlaying : Boolean(mediaElement && !mediaElement.paused)) {
      playPauseButtonIcon.rect(-6, -8, 4, 16).fill(0xffffff);
      playPauseButtonIcon.rect(3, -8, 4, 16).fill(0xffffff);
    } else {
      playPauseButtonIcon.poly([-5, -9, -5, 9, 9, 0], true).fill(0xffffff);
    }

    playPauseButton.position.set(MEDIA_PADDING, y);
  }

  function drawPreviewActionButton(container, background, label, x, y) {
    background.clear();
    background
      .roundRect(0, 0, PREVIEW_ACTION_BUTTON_WIDTH, PREVIEW_CONTROL_HEIGHT, 6)
      .fill({ color: 0xffffff, alpha: 0.001 });

    label.visible = false;
    if (label.text === "分割") {
      drawSplitIcon(background);
    } else {
      drawDeleteIcon(background);
    }
    container.position.set(x, y);
  }

  function drawSplitIcon(graphics) {
    const cx = PREVIEW_ACTION_BUTTON_WIDTH / 2;
    const cy = PREVIEW_CONTROL_HEIGHT / 2;

    graphics
      .moveTo(cx, cy - 11)
      .lineTo(cx, cy + 11)
      .stroke({ color: 0xffffff, width: 2 });
    graphics
      .moveTo(cx - 12, cy - 8)
      .lineTo(cx - 3, cy)
      .lineTo(cx - 12, cy + 8)
      .stroke({ color: 0xffffff, alpha: 0.82, width: 2 });
    graphics
      .moveTo(cx + 12, cy - 8)
      .lineTo(cx + 3, cy)
      .lineTo(cx + 12, cy + 8)
      .stroke({ color: 0xffffff, alpha: 0.82, width: 2 });
  }

  function drawDeleteIcon(graphics) {
    const cx = PREVIEW_ACTION_BUTTON_WIDTH / 2;
    const cy = PREVIEW_CONTROL_HEIGHT / 2;

    graphics
      .moveTo(cx - 9, cy - 7)
      .lineTo(cx + 9, cy - 7)
      .stroke({ color: 0xffffff, width: 2 });
    graphics
      .moveTo(cx - 5, cy - 11)
      .lineTo(cx + 5, cy - 11)
      .stroke({ color: 0xffffff, width: 2 });
    graphics.rect(cx - 7, cy - 5, 14, 16).stroke({ color: 0xffffff, width: 2 });
    graphics
      .moveTo(cx - 3, cy - 2)
      .lineTo(cx - 3, cy + 8)
      .stroke({ color: 0xffffff, alpha: 0.75, width: 1 });
    graphics
      .moveTo(cx + 3, cy - 2)
      .lineTo(cx + 3, cy + 8)
      .stroke({ color: 0xffffff, alpha: 0.75, width: 1 });
  }

  function hideTimeline() {
    timeline.visible = false;
    timelineTrack.clear();
    timelineFill.clear();
    timelineKnob.clear();
  }

  function drawDisabledTimeline() {
    const timelineX = getPreviewTimelineX();
    const timelineY = getPreviewTimelineY();
    const timelineWidth = getPreviewTimelineWidth();
    const barY = timelineY - TIMELINE_HEIGHT / 2;

    timeline.visible = true;
    timeline.hitArea = new Rectangle(
      0,
      timelineY - TIMELINE_HIT_HEIGHT / 2,
      getPreviewWidth(),
      TIMELINE_HIT_HEIGHT
    );
    drawPreviewPlaybackControls();

    timelineTrack.clear();
    timelineTrack
      .roundRect(timelineX, barY, timelineWidth, TIMELINE_HEIGHT, TIMELINE_HEIGHT / 2)
      .fill({ color: 0x111111, alpha: 0.7 })
      .stroke({ color: 0xffffff, alpha: 0.3, width: 1 });

    timelineFill.clear();
    timelineKnob.clear();
    timelineKnob
      .moveTo(timelineX, timelineY - 14)
      .lineTo(timelineX, timelineY + 14)
      .stroke({ color: 0xffffff, alpha: 0.45, width: 3 });

    currentTimeText.text = `${formatTime(0)} / ${formatTime(0)}`;
    currentTimeText.position.set(getPreviewTimecodeX(), timelineY);
  }

  function clearVideoTrackFrames() {
    editorTimelineFrames.removeChildren().forEach((child) => child.destroy());
    videoTrackTextures.forEach((texture) => texture.destroy(true));
    videoTrackTextures = [];
  }

  function clearAudioTrackClips() {
    editorTimelineAudioClips.removeChildren().forEach((child) => child.destroy({ children: true }));
    audioTrackGraphics = [];
  }

  function clearImageTrackClips({ destroyTextures = false } = {}) {
    editorTimelineImageClips.removeChildren().forEach((child) => child.destroy({ children: true }));
    if (destroyTextures) {
      imageTrackTextures.forEach((texture) => texture.destroy(true));
    }
    imageTrackTextures = [];
  }

  function clearTimelineTracks() {
    pauseTimelineAudio();
    clearVideoTrackFrames();
    clearAudioTrackClips();
    clearImageTrackClips({ destroyTextures: true });
    clearEditorTimelineRuler();
    videoTimelineClips.forEach((clip) => {
      if (clip.provider && clip.provider !== videoFrameProvider) {
        clip.provider.dispose();
      }

      if (clip.audioElement && clip.audioElement !== mediaElement) {
        clip.audioElement.pause();
        clip.audioElement.removeAttribute("src");
        clip.audioElement.load();
      }
    });
    audioTimelineClips.forEach((clip) => {
      if (clip.audioElement) {
        clip.audioElement.pause();
        clip.audioElement.removeAttribute("src");
        clip.audioElement.load();
      }
    });
    videoTimelineClips = [];
    audioTimelineClips = [];
    imageTimelineClips = [];
    timelineObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    timelineObjectUrls = [];
  }

  function clearEditorTimelineRuler() {
    editorTimelineRuler.clear();
    editorTimelineRulerLabels.removeChildren().forEach((child) => child.destroy());
    editorTimelineRulerDuration = -1;
    editorTimelineRulerY = -1;
  }

  function hideEditorTimeline() {
    editorTimeline.visible = false;
    editorTimelineBackground.clear();
    editorTimelinePlayhead.clear();
    editorTimelineMask.clear();
    editorTimelineTrackLabels.removeChildren().forEach((child) => child.destroy());
    editorTimelineStatus.text = "";
    editorTimelineContent.x = 0;
    timelineApp.render();
  }

  function drawEditorTimeline() {
    if (currentKind !== "video" || !isSeekableMedia()) {
      hideEditorTimeline();
      return;
    }

    const panelY = getEditorPanelY();
    const panelHeight = getEditorPanelHeight();
    const panelWidth = getEditorPanelWidth();
    const rulerY = getEditorRulerY();
    const trackX = getVideoTrackX();
    const trackWidth = getVideoTrackWidth();
    const playheadX = getEditorPlayheadX();
    const duration = getTimelineDuration();
    const currentTime = Math.min(Math.max(playbackTime, 0), duration);
    buildEditorTimelineRuler(duration);
    editorTimelineContent.x = playheadX - currentTime * TIMELINE_PIXELS_PER_SECOND;
    editorTimeline.hitArea = new Rectangle(EDITOR_PANEL_X, panelY, panelWidth, panelHeight);

    editorTimeline.visible = true;
    editorTimelineBackground.clear();
    editorTimelineBackground
      .roundRect(EDITOR_PANEL_X, panelY, panelWidth, panelHeight, 0)
      .fill({ color: 0x0f172a, alpha: 0.94 })
      .stroke({ color: 0x334155, width: 1 });
    drawTrackBackground(getVideoTrackY(), VIDEO_TRACK_HEIGHT);

    for (let index = 0; index < getAudioTrackCount(); index += 1) {
      drawTrackBackground(getAudioTrackY(index), AUDIO_TRACK_HEIGHT);
    }

    for (let index = 0; index < getImageTrackCount(); index += 1) {
      drawTrackBackground(getImageTrackY(index), IMAGE_TRACK_HEIGHT);
    }

    editorTimelineBackground
      .rect(trackX, rulerY, trackWidth, 1)
      .fill({ color: 0x475569, alpha: 0.75 });

    editorTimelineMask.clear();
    editorTimelineMask.rect(trackX, panelY, trackWidth, panelHeight).fill(0xffffff);

    editorTimelinePlayhead.clear();
    editorTimelinePlayhead
      .moveTo(playheadX, panelY + 10)
      .lineTo(playheadX, panelY + panelHeight - 10)
      .stroke({ color: 0x38bdf8, width: 2 });
    editorTimelinePlayhead.circle(playheadX, panelY + 10, 4).fill(0x38bdf8);
    editorTimelineStatus.position.set(playheadX, panelY + 14);
    drawEditorTrackLabels();
    layoutVideoTrackFrames();

    if (!videoTrackLoading && videoTrackTextures.length > 0) {
      editorTimelineStatus.text = "";
    }

    timelineApp.render();
  }

  function getEditorTimelineContentWidth(duration) {
    return Math.max(1, duration * TIMELINE_PIXELS_PER_SECOND);
  }

  function drawTrackBackground(y, height) {
    editorTimelineBackground
      .roundRect(getVideoTrackX(), y, getVideoTrackWidth(), height, 6)
      .fill({ color: 0x111827, alpha: 0.98 })
      .stroke({ color: 0x475569, width: 1 });
  }

  function layoutVideoTrackFrames() {
    const y = getVideoTrackY() + (VIDEO_TRACK_HEIGHT - VIDEO_THUMB_HEIGHT) / 2;

    for (const child of editorTimelineFrames.children) {
      child.y = y;
      child.height = VIDEO_THUMB_HEIGHT;
    }
  }

  function drawEditorTrackLabels() {
    editorTimelineTrackLabels.removeChildren().forEach((child) => child.destroy());
    addEditorTrackLabel("Video", getVideoTrackY() + VIDEO_TRACK_HEIGHT / 2);

    for (let index = 0; index < getAudioTrackCount(); index += 1) {
      addEditorTrackLabel(`Audio ${index + 1}`, getAudioTrackY(index) + AUDIO_TRACK_HEIGHT / 2);
    }

    for (let index = 0; index < getImageTrackCount(); index += 1) {
      addEditorTrackLabel(`Image ${index + 1}`, getImageTrackY(index) + IMAGE_TRACK_HEIGHT / 2);
    }
  }

  function addEditorTrackLabel(text, y) {
    const label = new Text({
      text,
      style: {
        fill: "#cbd5e1",
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 12,
        fontWeight: "700",
      },
    });

    label.anchor.set(0, 0.5);
    label.position.set(EDITOR_PANEL_X + 14, y);
    editorTimelineTrackLabels.addChild(label);
  }

  function getEditorTimelineRulerDurationSeconds(duration) {
    return Math.max(5, Math.ceil(duration / 5) * 5);
  }

  function buildEditorTimelineRuler(duration) {
    const rulerY = getEditorRulerY();

    if (
      Math.abs(editorTimelineRulerDuration - duration) < 0.001 &&
      Math.abs(editorTimelineRulerY - rulerY) < 0.001
    ) {
      return;
    }

    const lastSecond = getEditorTimelineRulerDurationSeconds(duration);
    const contentWidth = lastSecond * TIMELINE_PIXELS_PER_SECOND;

    editorTimelineRulerDuration = duration;
    editorTimelineRulerY = rulerY;
    editorTimelineRuler.clear();
    editorTimelineRulerLabels.removeChildren().forEach((child) => child.destroy());

    editorTimelineRuler
      .moveTo(0, rulerY)
      .lineTo(contentWidth, rulerY)
      .stroke({ color: 0x64748b, width: 1 });

    for (let second = 0; second <= lastSecond; second += 1) {
      const x = second * TIMELINE_PIXELS_PER_SECOND;
      const tickHeight = second % 10 === 0 ? 13 : second % 5 === 0 ? 10 : 6;

      editorTimelineRuler
        .moveTo(x, rulerY)
        .lineTo(x, rulerY - tickHeight)
        .stroke({ color: second % 5 === 0 ? 0x94a3b8 : 0x64748b, width: 1 });

      if (second % 10 === 0) {
        const label = new Text({
          text: formatRulerTime(second),
          style: {
            fill: "#94a3b8",
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: 10,
            fontWeight: "600",
          },
        });

        label.anchor.set(0.5, 0);
        label.position.set(x, rulerY + 4);
        editorTimelineRulerLabels.addChild(label);
      }
    }
  }

  function startVideoTrackBuild() {
    const buildId = videoTrackBuildId + 1;
    const timelineDuration = getTimelineDuration();
    const contentWidth = getEditorTimelineContentWidth(timelineDuration);
    const maxFrames = Math.max(1, Math.min(420, Math.ceil(contentWidth / VIDEO_THUMB_WIDTH)));

    videoTrackBuildId = buildId;
    videoTrackLoading = true;
    clearVideoTrackFrames();
    clearEditorTimelineRuler();
    editorTimelineStatus.text = "Loading frames";
    drawEditorTimeline();

    (async () => {
      for (const clip of videoTimelineClips) {
        const clipWidth = getEditorTimelineContentWidth(clip.duration);
        const clipMaxFrames = Math.max(
          1,
          Math.min(maxFrames, Math.ceil(clipWidth / VIDEO_THUMB_WIDTH))
        );
        const intervalSeconds = Math.max(0.1, clip.duration / clipMaxFrames);
        const frames = await extractVideoFramesWithMediabunny(clip.file, {
          fit: "cover",
          includeLastFrame: true,
          intervalSeconds,
          maxFrames: clipMaxFrames,
          poolSize: 3,
          thumbnailHeight: VIDEO_THUMB_HEIGHT,
          thumbnailWidth: VIDEO_THUMB_WIDTH,
        });

        if (buildId !== videoTrackBuildId || currentKind !== "video") {
          return;
        }

        frames.forEach((frame, index) => {
          const texture = Texture.from(frame.canvas, true);
          const sprite = new Sprite({ texture });
          const frameWidth = clipWidth / frames.length;

          sprite.x = clip.startTime * TIMELINE_PIXELS_PER_SECOND + index * frameWidth;
          sprite.y = getVideoTrackY() + (VIDEO_TRACK_HEIGHT - VIDEO_THUMB_HEIGHT) / 2;
          sprite.width = Math.ceil(frameWidth) + 1;
          sprite.height = VIDEO_THUMB_HEIGHT;
          videoTrackTextures.push(texture);
          editorTimelineFrames.addChild(sprite);
        });
      }

      if (buildId === videoTrackBuildId) {
        buildEditorTimelineRuler(getTimelineDuration());
        editorTimelineStatus.text = videoTrackTextures.length ? "" : "No frames";
      }
    })()
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

  function renderAudioTimelineClip(clip, samples = null) {
    const container = new Container();
    const graphic = new Graphics();
    const x = clip.startTime * TIMELINE_PIXELS_PER_SECOND;
    const y = getAudioTrackY(getClipTrackIndex(clip)) + 2;
    const width = Math.max(1, clip.duration * TIMELINE_PIXELS_PER_SECOND);
    const height = AUDIO_TRACK_HEIGHT - 4;

    container.position.set(x, y);
    container.eventMode = "static";
    container.cursor = playbackPlaying ? "default" : "grab";
    container.hitArea = new Rectangle(0, 0, width, height);
    container.on("pointerdown", (event) => handleTimelineClipPointerDown("audio", clip, event));

    graphic
      .roundRect(0, 0, width, height, 5)
      .fill({ color: 0x1e3a8a, alpha: 0.88 })
      .stroke({ color: 0x38bdf8, width: 1 });

    const barCount = Math.max(8, Math.floor(width / 3));
    const barWidth = Math.max(1, width / barCount - 1);

    for (let index = 0; index < barCount; index += 1) {
      const value = samples
        ? samples[Math.floor((index / barCount) * samples.length)]
        : 0.35 + 0.25 * Math.sin(index * 1.7);
      const barHeight = Math.max(2, Math.abs(value) * (height - 6));
      const barX = index * (width / barCount);
      const barY = height / 2 - barHeight / 2;

      graphic.roundRect(barX, barY, barWidth, barHeight, 2).fill({
        color: 0x93c5fd,
        alpha: 0.88,
      });
    }

    container.addChild(graphic);
    editorTimelineAudioClips.addChild(container);
    audioTrackGraphics.push(container);
  }

  async function drawAudioSpectrum(clip) {
    const context = audioContext || new AudioContext();
    const buffer = await clip.file.arrayBuffer();
    const decoded = await context.decodeAudioData(buffer.slice(0));
    const channel = decoded.getChannelData(0);
    const sampleCount = Math.max(16, Math.floor(clip.duration * TIMELINE_PIXELS_PER_SECOND));
    const samples = [];

    for (let index = 0; index < sampleCount; index += 1) {
      const start = Math.floor((index / sampleCount) * channel.length);
      const end = Math.floor(((index + 1) / sampleCount) * channel.length);
      let peak = 0;

      for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
        peak = Math.max(peak, Math.abs(channel[sampleIndex] || 0));
      }

      samples.push(peak);
    }

    clip.samples = samples;
    clearAudioTrackClips();
    audioTimelineClips.forEach((audioClip) => {
      renderAudioTimelineClip(audioClip, audioClip.samples || null);
    });
    drawEditorTimeline();
    app.render();
  }

  function renderImageTimelineClip(clip) {
    const container = new Container();
    const background = new Graphics();
    const sprite = new Sprite({ texture: clip.texture });
    const x = clip.startTime * TIMELINE_PIXELS_PER_SECOND;
    const y = getImageTrackY(getClipTrackIndex(clip)) + 2;
    const width = Math.max(1, clip.duration * TIMELINE_PIXELS_PER_SECOND);
    const height = IMAGE_TRACK_HEIGHT - 4;

    container.position.set(x, y);
    container.eventMode = "static";
    container.cursor = playbackPlaying ? "default" : "grab";
    container.hitArea = new Rectangle(0, 0, width, height);
    container.on("pointerdown", (event) => handleTimelineClipPointerDown("image", clip, event));

    background
      .roundRect(0, 0, width, height, 5)
      .fill({ color: 0x3f2d0b, alpha: 0.9 })
      .stroke({ color: 0xfbbf24, width: 1 });

    sprite.x = 3;
    sprite.y = 3;
    sprite.width = Math.min(width - 6, height - 6);
    sprite.height = height - 6;
    if (!imageTrackTextures.includes(clip.texture)) {
      imageTrackTextures.push(clip.texture);
    }
    container.addChild(background, sprite);
    editorTimelineImageClips.addChild(container);
  }

  function renderTimelineClipTracks() {
    clearAudioTrackClips();
    clearImageTrackClips();
    audioTimelineClips.forEach((clip) => renderAudioTimelineClip(clip, clip.samples || null));
    imageTimelineClips.forEach((clip) => renderImageTimelineClip(clip));
  }

  function getVideoTimelineDuration() {
    return videoTimelineClips.reduce(
      (maxTime, clip) => Math.max(maxTime, clip.startTime + clip.duration),
      0
    );
  }

  function getTimelineDuration() {
    const clipEnds = [...videoTimelineClips, ...audioTimelineClips, ...imageTimelineClips].map(
      (clip) => clip.startTime + clip.duration
    );
    const mediaDuration =
      currentKind === "audio" && mediaElement && Number.isFinite(mediaElement.duration)
        ? mediaElement.duration
        : 0;

    return Math.max(mediaDuration, 1, ...clipEnds);
  }

  function getInsertionTime() {
    if (currentKind === "video") {
      return Math.min(Math.max(playbackTime, 0), getTimelineDuration());
    }

    if (mediaElement && Number.isFinite(mediaElement.currentTime)) {
      return Math.min(Math.max(mediaElement.currentTime, 0), getTimelineDuration());
    }

    return 0;
  }

  function renderScene(ticker) {
    if (currentKind === "audio") {
      drawAudioVisualizer();
      drawTimeline();
      hideEditorTimeline();
      overlayText.visible = false;
      overlayImageGroup.visible = false;
    } else if (currentKind === "empty") {
      drawEmptyBackground();
      drawDisabledTimeline();
      hideEditorTimeline();
      overlayText.visible = false;
      overlayImageGroup.visible = false;
    } else {
      if (playbackPlaying) {
        const deltaSeconds = Math.min(0.1, Math.max(0, (ticker?.deltaMS || 16.67) / 1000));
        const duration = getPlaybackDuration();

        playbackTime = Math.min(playbackTime + deltaSeconds, duration);

        if (playbackTime >= duration - 0.001) {
          playbackTime = duration;
          playbackPlaying = false;
          pauseTimelineAudio();
          statusText.textContent = "Ended";
          app.stop();
        } else {
          syncTimelineAudio();
        }
      }

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
    scene.scale.set(1);
    scene.position.set(0, 0);
    layoutPreviewText();

    const timelineBounds = timelineCanvas.getBoundingClientRect();
    timelineApp.renderer.resize(
      Math.max(1, timelineBounds.width),
      Math.max(1, timelineBounds.height)
    );
    timelineScale = Math.min(1, timelineApp.screen.width / VIEW_WIDTH);
    timelineScene.scale.set(timelineScale);
    timelineScene.position.set(0, -PREVIEW_HEIGHT * timelineScale);
    renderScene();
    app.render();
    timelineApp.render();
    maintainCanvasLayout();
  }

  function maintainCanvasLayout() {
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    timelineCanvas.style.width = "100%";
    timelineCanvas.style.height = "100%";
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

  function formatRulerTime(value) {
    const safeValue = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
    const seconds = safeValue % 60;
    const totalMinutes = Math.floor(safeValue / 60);
    const minutes = totalMinutes % 60;
    const hours = Math.floor(totalMinutes / 60);
    const secondText = seconds.toString().padStart(2, "0");

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secondText}`;
    }

    return `${minutes}:${secondText}`;
  }

  function handleTimelineClipPointerDown(type, clip, event) {
    suppressNextCanvasToggle = true;

    if (playbackPlaying) {
      statusText.textContent = "Pause before dragging clips";
      event.stopPropagation();
      return;
    }

    const local = editorTimelineContent.toLocal(event.global);

    timelineClipDrag = {
      clip,
      pointerOffsetSeconds: local.x / TIMELINE_PIXELS_PER_SECOND - clip.startTime,
      targetStartTime: clip.startTime,
      targetTrackIndex: getClipTrackIndex(clip),
      timelineDuration: getTimelineDuration(),
      type,
    };
    statusText.textContent = "Dragging clip";
    event.stopPropagation();
  }

  function handleTimelineClipPointerMove(event) {
    if (!timelineClipDrag) {
      return;
    }

    updateTimelineClipDrag(event);
  }

  function handleTimelineClipPointerUp(event) {
    if (!timelineClipDrag) {
      return;
    }

    updateTimelineClipDrag(event);

    const { clip, targetStartTime, targetTrackIndex, type } = timelineClipDrag;
    const clips = getTimelineClipsByType(type);
    const finalTrackIndex = hasTimelineClipOverlap(type, clip, targetTrackIndex, targetStartTime)
      ? getNextTrackIndex(clips, clip)
      : targetTrackIndex;

    clip.startTime = targetStartTime;
    clip.trackIndex = finalTrackIndex;
    timelineClipDrag = null;
    renderTimelineClipTracks();
    clearEditorTimelineRuler();
    drawTimeline();
    drawEditorTimeline();
    updateImageOverlayPosition();
    statusText.textContent = "Paused";
    app.render();
    event.stopPropagation();
  }

  function updateTimelineClipDrag(event) {
    if (!timelineClipDrag) {
      return;
    }

    const target = getTimelineClipDragTarget(event);
    const { clip, type } = timelineClipDrag;

    clip.startTime = target.startTime;
    clip.trackIndex = target.trackIndex;
    timelineClipDrag.targetStartTime = target.startTime;
    timelineClipDrag.targetTrackIndex = target.trackIndex;
    renderTimelineClipTracks();
    clearEditorTimelineRuler();
    drawTimeline();
    drawEditorTimeline();
    statusText.textContent = hasTimelineClipOverlap(type, clip, target.trackIndex, target.startTime)
      ? "Release to move into a new track"
      : "Dragging clip";
    app.render();
  }

  function getTimelineClipDragTarget(event) {
    const { clip, pointerOffsetSeconds, timelineDuration, type } = timelineClipDrag;
    const local = editorTimelineContent.toLocal(event.global);
    const maxStartTime = Math.max(0, timelineDuration - clip.duration);
    const startTime = Math.min(
      Math.max(local.x / TIMELINE_PIXELS_PER_SECOND - pointerOffsetSeconds, 0),
      maxStartTime
    );

    return {
      startTime,
      trackIndex: getTimelineTrackIndexFromY(type, local.y),
    };
  }

  function getTimelineTrackIndexFromY(type, y) {
    const count = type === "audio" ? getAudioTrackCount() : getImageTrackCount();
    const firstY = type === "audio" ? getAudioTrackY(0) : getImageTrackY(0);
    const rawIndex = Math.round((y - firstY) / getTrackPitch());

    return Math.min(Math.max(rawIndex, 0), Math.max(0, count - 1));
  }

  function getTimelineClipsByType(type) {
    return type === "audio" ? audioTimelineClips : imageTimelineClips;
  }

  function hasTimelineClipOverlap(type, movingClip, trackIndex, startTime) {
    const endTime = startTime + movingClip.duration;

    return getTimelineClipsByType(type).some((clip) => {
      if (clip === movingClip || getClipTrackIndex(clip) !== trackIndex) {
        return false;
      }

      const clipStart = clip.startTime;
      const clipEnd = clip.startTime + clip.duration;

      return (
        startTime < clipEnd - TRACK_OVERLAP_EPSILON && endTime > clipStart + TRACK_OVERLAP_EPSILON
      );
    });
  }

  function seekFromPointer(event) {
    if (!isSeekableMedia()) {
      return;
    }

    const local = timeline.toLocal(event.global);
    const progress = Math.min(
      Math.max((local.x - getPreviewTimelineX()) / getPreviewTimelineWidth(), 0),
      1
    );
    const duration = getPlaybackDuration();

    if (currentKind === "video") {
      setTimelinePlaybackTime(progress * duration, true);
    } else if (mediaElement) {
      mediaElement.currentTime = progress * duration;
    }

    drawTimeline();
    app.render();
  }

  function handleTimelinePointerDown(event) {
    if (!isSeekableMedia()) {
      return;
    }

    const local = timeline.toLocal(event.global);
    const timelineX = getPreviewTimelineX();
    const timelineWidth = getPreviewTimelineWidth();

    if (local.x < timelineX || local.x > timelineX + timelineWidth) {
      return;
    }

    suppressNextCanvasToggle = true;
    isSeeking = true;
    wasPlayingBeforeSeek =
      currentKind === "video" ? playbackPlaying : Boolean(mediaElement && !mediaElement.paused);

    if (currentKind === "video") {
      playbackPlaying = false;
      pauseTimelineAudio();
      app.stop();
    } else {
      mediaElement.pause();
    }

    seekFromPointer(event);
  }

  async function handleTimelinePointerUp(event) {
    if (!isSeeking) {
      return;
    }

    seekFromPointer(event);
    isSeeking = false;

    if (currentKind === "video" && wasPlayingBeforeSeek) {
      await startTimelinePlayback();
    } else if (currentKind !== "video" && wasPlayingBeforeSeek) {
      await mediaElement.play();
      statusText.textContent = "Click canvas to pause";
      app.start();
    } else {
      statusText.textContent = "Paused";
      if (currentKind === "video") {
        renderScene();
        app.render();
      } else {
        handleMediaSeeked();
      }
    }
  }

  function handleTimelinePointerMove(event) {
    if (isSeeking) {
      seekFromPointer(event);
    }
  }

  function handlePlayPauseButtonPointerDown(event) {
    suppressNextCanvasToggle = true;
    event.stopPropagation();
    void toggleMediaPlayback();
  }

  function handlePlayPauseButtonPointerOver() {
    canvas.title = currentKind === "video" && playbackPlaying ? "暂停" : "播放";
  }

  function handleSplitButtonPointerDown(event) {
    suppressNextCanvasToggle = true;
    event.stopPropagation();
    statusText.textContent = "Split";
  }

  function handleSplitButtonPointerOver() {
    canvas.title = "分割";
  }

  function handleDeleteButtonPointerDown(event) {
    suppressNextCanvasToggle = true;
    event.stopPropagation();
    statusText.textContent = "Delete";
  }

  function handleDeleteButtonPointerOver() {
    canvas.title = "删除";
  }

  function handlePreviewButtonPointerOut() {
    canvas.removeAttribute("title");
  }

  function handleMediaSeeked() {
    if (currentKind === "video") {
      updateVideoTexture(true);
    }

    renderScene();
    app.render();
  }

  function handleMediaEnded() {
    if (currentKind === "video") {
      pauseTimelinePlayback("Ended");
      return;
    }

    statusText.textContent = "Ended";
    updateVideoTexture(true);
    renderScene();
    app.render();
    app.stop();
  }

  function getTextOverlayExportState() {
    const rect = getMediaSpriteRect();

    if (!rect || textOverlayIntervals.length === 0) {
      return null;
    }

    return {
      fillStyle: subtitleColorInput.value,
      fontFamily: `${subtitleFontSelect.value}, system-ui, sans-serif`,
      fontStyle: subtitleStyleSelect.value.includes("Italic") ? "italic" : "normal",
      fontSizeRatio: Number(overlayText.style.fontSize || 42) / rect.height,
      fontWeight: subtitleStyleSelect.value.includes("Bold") ? "800" : "400",
      intervals: textOverlayIntervals,
      transitionSeconds: OVERLAY_FADE_SECONDS,
      strokeStyle: "rgba(0, 0, 0, 0.82)",
      text: overlayText.text,
      xRatio: (overlayText.x - rect.left) / rect.width,
      yRatio: (overlayText.y - rect.top) / rect.height,
    };
  }

  function getImageOverlayExportStates() {
    const rect = getMediaSpriteRect();

    if (!rect) {
      return [];
    }

    return imageTimelineClips.map((clip) => {
      const frame = getImageExportFrame(rect, clip);

      return {
        duration: clip.duration,
        imageSource: clip.imageElement,
        startTime: clip.startTime,
        transitionSeconds: OVERLAY_FADE_SECONDS,
        heightRatio: frame.height / rect.height,
        widthRatio: frame.width / rect.width,
        xRatio: (frame.x - rect.left) / rect.width,
        yRatio: (frame.y - rect.top) / rect.height,
      };
    });
  }

  function getImageExportFrame(rect, clip) {
    if (imagePositionInitialized) {
      return imageFrame;
    }

    const width = clip.texture.width || clip.imageElement.naturalWidth || 1;
    const height = clip.texture.height || clip.imageElement.naturalHeight || 1;
    const aspectRatio = width / height;
    const frameWidth = Math.min(rect.width * 0.5, rect.height * aspectRatio);
    const frameHeight = frameWidth / aspectRatio;

    return {
      height: frameHeight,
      width: frameWidth,
      x: rect.left + (rect.width - frameWidth) / 2,
      y: rect.top + (rect.height - frameHeight) / 2,
    };
  }

  function getActiveImageTimelineClip() {
    if (currentKind !== "video") {
      return null;
    }

    return (
      imageTimelineClips.find(
        (clip) => playbackTime >= clip.startTime && playbackTime < clip.startTime + clip.duration
      ) || null
    );
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

  async function createTimelineAudioMixdown(duration) {
    const audioSources = [
      ...videoTimelineClips.map((clip) => ({
        duration: clip.duration,
        file: clip.file,
        startTime: clip.startTime,
        volume: clip.volume ?? 1,
      })),
      ...audioTimelineClips.map((clip) => ({
        duration: clip.duration,
        file: clip.file,
        startTime: clip.startTime,
        volume: clip.volume ?? 1,
      })),
    ];

    if (audioSources.length === 0 || duration <= 0) {
      return null;
    }

    const sampleRate = 48000;
    const offlineContext = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);
    const decodeContext = audioContext || new AudioContext();
    let decodedCount = 0;

    for (const source of audioSources) {
      try {
        const arrayBuffer = await source.file.arrayBuffer();
        const buffer = await decodeContext.decodeAudioData(arrayBuffer.slice(0));
        const node = offlineContext.createBufferSource();
        const gain = offlineContext.createGain();

        node.buffer = buffer;
        gain.gain.value = source.volume;
        node.connect(gain);
        gain.connect(offlineContext.destination);
        node.start(
          Math.max(0, source.startTime),
          0,
          Math.min(buffer.duration, source.duration, Math.max(0, duration - source.startTime))
        );
        decodedCount += 1;
      } catch {
        // Some containers/codecs cannot be decoded by AudioContext; skip those tracks for export.
      }
    }

    if (decodedCount === 0) {
      return null;
    }

    return offlineContext.startRendering();
  }

  async function handleExportClick() {
    if (!currentVideoFile || isExporting) {
      return;
    }

    const textOverlayState = getTextOverlayExportState();
    const imageOverlayStates = getImageOverlayExportStates();

    if (!textOverlayState && imageOverlayStates.length === 0 && audioTimelineClips.length === 0) {
      statusText.textContent = "No overlay";
      return;
    }

    isExporting = true;
    exportButton.disabled = true;
    chooseButton.disabled = true;
    statusText.textContent = "Exporting 0%";

    const shouldResume = currentKind === "video" && playbackPlaying;

    playbackPlaying = false;
    pauseTimelineAudio();
    mediaElement?.pause();
    app.stop();

    try {
      const duration = getTimelineDuration();

      statusText.textContent = "Mixing audio";
      const audioBuffer = await createTimelineAudioMixdown(duration);

      statusText.textContent = "Exporting 0%";
      const blob = await exportTimelineComposition(
        videoTimelineClips.map((clip) => ({
          duration: clip.duration,
          file: clip.file,
          startTime: clip.startTime,
        })),
        {
          ...textOverlayState,
          images: imageOverlayStates,
        },
        {
          audioBuffer,
          duration,
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

      if (shouldResume) {
        await startTimelinePlayback();
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

  function handleSubtitleClick() {
    applySubtitleControls();
    textOverlayIntervals = [
      {
        duration: TEXT_OVERLAY_DEFAULT_DURATION,
        startTime: getCurrentPlaybackTime(),
      },
    ];
    textPositionInitialized = false;
    updateTextOverlayPosition();
    app.render();
  }

  function handleSubtitleControlChange() {
    applySubtitleControls();
    updateTextOverlayPosition();
    app.render();
  }

  function applySubtitleControls() {
    const fontSize = Number(subtitleSizeSelect.value) || 42;
    const fontStyleValue = subtitleStyleSelect.value;
    const isItalic = fontStyleValue.includes("Italic");
    const isBold = fontStyleValue.includes("Bold");

    overlayText.text = subtitleTextInput.value || TEXT_OVERLAY_VALUE;
    overlayText.style.fontSize = fontSize;
    overlayText.style.fontFamily = `${subtitleFontSelect.value}, system-ui, sans-serif`;
    overlayText.style.fontStyle = isItalic ? "italic" : "normal";
    overlayText.style.fontWeight = isBold ? "800" : "400";
    overlayText.style.fill = subtitleColorInput.value;
    overlayText.style.stroke = {
      color: "rgba(0, 0, 0, 0.82)",
      width: Math.max(4, Math.round(fontSize * 0.16)),
    };
  }

  function isPointerInEditorPanel() {
    return false;
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
      x: ((event.clientX - bounds.left) / bounds.width) * getPreviewWidth(),
      y: ((event.clientY - bounds.top) / bounds.height) * getPreviewHeight(),
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

    await toggleMediaPlayback();
  }

  async function toggleMediaPlayback() {
    if ((!mediaElement && currentKind !== "video") || currentKind === "image") {
      return;
    }

    if (audioContext?.state === "suspended") {
      await audioContext.resume();
    }

    if (currentKind === "video") {
      if (playbackPlaying) {
        pauseTimelinePlayback();
      } else {
        await startTimelinePlayback();
      }

      return;
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
  subtitleButton.addEventListener("click", handleSubtitleClick);
  subtitleTextInput.addEventListener("input", handleSubtitleControlChange);
  subtitleSizeSelect.addEventListener("change", handleSubtitleControlChange);
  subtitleFontSelect.addEventListener("change", handleSubtitleControlChange);
  subtitleStyleSelect.addEventListener("change", handleSubtitleControlChange);
  subtitleColorInput.addEventListener("input", handleSubtitleControlChange);
  exportButton.addEventListener("click", handleExportClick);
  input.addEventListener("change", handleInputChange);
  canvas.addEventListener("pointerdown", togglePlayback);
  window.addEventListener("resize", resizeCanvas);
  timeline.on("pointerdown", handleTimelinePointerDown);
  timeline.on("pointerup", handleTimelinePointerUp);
  timeline.on("pointerupoutside", handleTimelinePointerUp);
  timeline.on("globalpointermove", handleTimelinePointerMove);
  playPauseButton.on("pointerdown", handlePlayPauseButtonPointerDown);
  playPauseButton.on("pointerover", handlePlayPauseButtonPointerOver);
  playPauseButton.on("pointerout", handlePreviewButtonPointerOut);
  splitButton.on("pointerdown", handleSplitButtonPointerDown);
  splitButton.on("pointerover", handleSplitButtonPointerOver);
  splitButton.on("pointerout", handlePreviewButtonPointerOut);
  deleteButton.on("pointerdown", handleDeleteButtonPointerDown);
  deleteButton.on("pointerover", handleDeleteButtonPointerOver);
  deleteButton.on("pointerout", handlePreviewButtonPointerOut);
  editorTimeline.on("pointerup", handleTimelineClipPointerUp);
  editorTimeline.on("pointerupoutside", handleTimelineClipPointerUp);
  editorTimeline.on("globalpointermove", handleTimelineClipPointerMove);
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
    document.body.classList.remove("pixi-media-page");
    chooseButton.removeEventListener("click", handleChooseClick);
    subtitleButton.removeEventListener("click", handleSubtitleClick);
    subtitleTextInput.removeEventListener("input", handleSubtitleControlChange);
    subtitleSizeSelect.removeEventListener("change", handleSubtitleControlChange);
    subtitleFontSelect.removeEventListener("change", handleSubtitleControlChange);
    subtitleStyleSelect.removeEventListener("change", handleSubtitleControlChange);
    subtitleColorInput.removeEventListener("input", handleSubtitleControlChange);
    exportButton.removeEventListener("click", handleExportClick);
    exportButton.remove();
    subtitleButton.remove();
    subtitleControls.remove();
    toolbarLeft.remove();
    toolbarRight.remove();
    input.removeEventListener("change", handleInputChange);
    canvas.removeEventListener("pointerdown", togglePlayback);
    window.removeEventListener("resize", resizeCanvas);
    input.remove();
    timeline.off("pointerdown", handleTimelinePointerDown);
    timeline.off("pointerup", handleTimelinePointerUp);
    timeline.off("pointerupoutside", handleTimelinePointerUp);
    timeline.off("globalpointermove", handleTimelinePointerMove);
    playPauseButton.off("pointerdown", handlePlayPauseButtonPointerDown);
    playPauseButton.off("pointerover", handlePlayPauseButtonPointerOver);
    playPauseButton.off("pointerout", handlePreviewButtonPointerOut);
    splitButton.off("pointerdown", handleSplitButtonPointerDown);
    splitButton.off("pointerover", handleSplitButtonPointerOver);
    splitButton.off("pointerout", handlePreviewButtonPointerOut);
    deleteButton.off("pointerdown", handleDeleteButtonPointerDown);
    deleteButton.off("pointerover", handleDeleteButtonPointerOver);
    deleteButton.off("pointerout", handlePreviewButtonPointerOut);
    editorTimeline.off("pointerup", handleTimelineClipPointerUp);
    editorTimeline.off("pointerupoutside", handleTimelineClipPointerUp);
    editorTimeline.off("globalpointermove", handleTimelineClipPointerMove);
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
    timelineApp.destroy(false);
    timelineCanvas.remove();
  };
}

function createImageResizeHandle(corner) {
  const handle = new Graphics();

  handle.circle(0, 0, IMAGE_OVERLAY_HANDLE_RADIUS).fill({ color: 0xffffff, alpha: 0.001 });
  handle.eventMode = "static";
  handle.cursor = corner === "tl" || corner === "br" ? "nwse-resize" : "nesw-resize";

  return handle;
}

function createSelect(label, values, selectedValue) {
  const select = document.createElement("select");

  select.ariaLabel = label;

  for (const value of values) {
    const option = document.createElement("option");

    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }

  select.value = selectedValue;

  return select;
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
