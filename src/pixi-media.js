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
const TEXT_TRACK_HEIGHT = TRACK_ROW_HEIGHT;
const VIDEO_THUMB_WIDTH = 92;
const VIDEO_THUMB_HEIGHT = VIDEO_TRACK_HEIGHT - 8;
const TIMELINE_PIXELS_PER_SECOND = 10;
const TIMELINE_DRAG_EXTENSION_SECONDS = 60;
const TRACK_OVERLAP_EPSILON = 0.02;
const CLIP_MIN_DURATION = 1;
const CLIP_EDGE_HIT_WIDTH = 8;
const IMAGE_CLIP_DEFAULT_DURATION = 5;
const VIDEO_FRAME_MIN_INTERVAL = 1 / 30;
const MEDIA_SYNC_SEEK_THRESHOLD = 0.28;
const MEDIA_SYNC_SEEK_RETRY_THRESHOLD = 0.45;
const PERFORMANCE_UPDATE_INTERVAL_MS = 500;
const PERFORMANCE_FRAME_BUDGET_MS = 1000 / 60;
const TEXT_DOUBLE_TAP_MS = 360;
const TEXT_CLIP_DEFAULT_DURATION = 2;
const TEXT_CLIP_DEFAULT_VALUE = "Hello world";
const TEXT_CLIP_DEFAULT_COLOR = "#ffffff";
const TEXT_CLIP_DEFAULT_FONT_SIZE = 14;
const TEXT_CLIP_DEFAULT_FONT_WEIGHT = "400";
const TEXT_CLIP_BOTTOM_MARGIN = 12;
const TIMELINE_TEXT_LABEL_FONT = "700 12px Inter, system-ui, sans-serif";
const TIMELINE_TEXT_LABEL_PADDING = 20;
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

  const exportProgressLabel = document.createElement("span");
  exportProgressLabel.className = "export-progress";
  exportProgressLabel.textContent = "0%";
  exportProgressLabel.hidden = true;

  const subtitleButton = document.createElement("button");
  subtitleButton.type = "button";
  subtitleButton.textContent = "字幕";

  const subtitleContextMenu = document.createElement("div");
  subtitleContextMenu.className = "subtitle-context-menu";
  subtitleContextMenu.hidden = true;

  const subtitleColorInput = document.createElement("input");
  subtitleColorInput.type = "color";
  subtitleColorInput.value = TEXT_CLIP_DEFAULT_COLOR;
  subtitleColorInput.ariaLabel = "字幕颜色";

  const subtitleSizeInput = document.createElement("input");
  subtitleSizeInput.type = "number";
  subtitleSizeInput.min = "8";
  subtitleSizeInput.max = "96";
  subtitleSizeInput.step = "1";
  subtitleSizeInput.value = String(TEXT_CLIP_DEFAULT_FONT_SIZE);
  subtitleSizeInput.ariaLabel = "字幕字号";

  const subtitleWeightSelect = createSelect(
    "字幕字重",
    ["400", "500", "600", "700", "800"],
    TEXT_CLIP_DEFAULT_FONT_WEIGHT
  );

  subtitleContextMenu.append(
    createFieldLabel("颜色", subtitleColorInput),
    createFieldLabel("字号", subtitleSizeInput),
    createFieldLabel("字重", subtitleWeightSelect)
  );
  document.body.appendChild(subtitleContextMenu);

  const subtitleEditInput = document.createElement("input");
  subtitleEditInput.type = "text";
  subtitleEditInput.className = "subtitle-edit-input";
  subtitleEditInput.hidden = true;
  subtitleEditInput.ariaLabel = "编辑字幕文本";
  document.body.appendChild(subtitleEditInput);

  const toolbarLeft = document.createElement("div");
  toolbarLeft.className = "media-toolbar-left";
  const toolbarRight = document.createElement("div");
  toolbarRight.className = "media-toolbar-right";
  const performanceStats = document.createElement("div");
  performanceStats.className = "media-performance-stats";
  performanceStats.textContent = "CPU N/A · GPU N/A · MEM N/A";
  performanceStats.ariaLive = "polite";

  toolbarLeft.append(chooseButton, subtitleButton);
  toolbarRight.append(exportProgressLabel, exportButton);
  hud.append(toolbarLeft, performanceStats, toolbarRight);

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
  const overlayImageLayer = new Container();
  const textOverlayLayer = new Container();
  const overlayImageExtras = new Container();
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
  const editorTimelineVideoClips = new Container();
  const editorTimelineAudioClips = new Container();
  const editorTimelineImageClips = new Container();
  const editorTimelineTextClips = new Container();
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
  const editorTimelineTextLabel = new Text({
    text: "Text",
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
  app.stage.addChild(scene);
  timelineApp.stage.addChild(timelineScene);
  scene.addChild(mediaLayer, textLayer, overlay, visualizer, controlsLayer, titleText, detailText);
  timelineScene.addChild(editorTimeline);
  overlayImageGroup.addChild(
    overlayImageSprite,
    ...overlayImageHandles.map((handle) => handle.node)
  );
  textLayer.addChild(overlayImageLayer, textOverlayLayer);
  overlayImageLayer.addChild(overlayImageExtras, overlayImageGroup);
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
    editorTimelineVideoClips,
    editorTimelineAudioClips,
    editorTimelineImageClips,
    editorTimelineTextClips
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
    editorTimelineTextLabel,
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
  editorTimelineTextLabel.anchor.set(0, 0.5);
  editorTimelineTextLabel.visible = false;
  editorTimelineTextLabel.position.set(
    EDITOR_PANEL_X + 14,
    getVideoTrackY() + getTrackPitch() * 3 + TEXT_TRACK_HEIGHT / 2
  );
  editorTimelineStatus.anchor.set(0.5, 0.5);
  editorTimelineStatus.position.set(getEditorPlayheadX(), EDITOR_PANEL_Y + 14);

  titleText.anchor.set(0.5);
  detailText.anchor.set(0.5);
  textOverlayLayer.eventMode = "static";
  textOverlayLayer.hitArea = new Rectangle(0, 0, getPreviewWidth(), getPreviewHeight());
  overlayImageLayer.eventMode = "static";
  overlayImageLayer.hitArea = new Rectangle(0, 0, getPreviewWidth(), getPreviewHeight());
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
  let playbackStartPending = false;
  let videoFramePending = false;
  let videoFrameRequestId = 0;
  let videoTrackBuildId = 0;
  let videoTrackTextures = [];
  let audioTrackGraphics = [];
  let imageTrackTextures = [];
  let videoTimelineClips = [];
  let audioTimelineClips = [];
  let imageTimelineClips = [];
  let textTimelineClips = [];
  let timelineObjectUrls = [];
  let timelineEditableDuration = 1;
  let videoTrackLoading = false;
  let editorTimelineRulerDuration = -1;
  let editorTimelineRulerY = -1;
  let lastVideoFrameTime = -1;
  let wasPlayingBeforeSeek = false;
  let suppressNextCanvasToggle = false;
  let timelineClipDrag = null;
  let timelineClipDragFrame = 0;
  let pendingTimelineClipDragEvent = null;
  let selectedTimelineClip = null;
  let selectedTextClip = null;
  let textDragging = false;
  let skipNextSubtitleMenuDocumentPointerDown = false;
  let lastTextTapClip = null;
  let lastTextTapTime = 0;
  const textDragOffset = { x: 0, y: 0 };
  const imageFrame = { height: 0, width: 0, x: 0, y: 0 };
  const imageDragOffset = { x: 0, y: 0 };
  const imageResizeOrigin = { corner: "", oppositeX: 0, oppositeY: 0 };
  let selectedImageClip = null;
  let imagePositionInitialized = false;
  let imageDragging = false;
  let imageResizeCorner = "";
  let isExporting = false;
  const performanceStatsState = {
    lastUpdateTime: 0,
    renderCostMs: 0,
  };
  const timelineTextMeasureContext = document.createElement("canvas").getContext("2d");

  function clearCurrentMedia() {
    app.stop();
    playbackTime = 0;
    playbackPlaying = false;
    playbackStartPending = false;
    timelineEditableDuration = 1;
    timelineVerticalScroll = 0;
    videoFrameRequestId += 1;
    videoTrackBuildId += 1;
    videoFramePending = false;
    videoTrackLoading = false;
    lastVideoFrameTime = -1;
    timelineClipDrag = null;
    cancelPendingTimelineClipDragFrame();
    selectedTimelineClip = null;
    clearTimelineTracks();
    currentVideoFile = null;
    exportButton.disabled = true;
    exportProgressLabel.hidden = true;
    isExporting = false;
    selectedTextClip = null;
    textDragging = false;
    hideSubtitleContextMenu();
    finishSubtitleEditing({ commit: false });
    clearTextOverlayNodes();
    lastTextTapClip = null;
    lastTextTapTime = 0;
    skipNextSubtitleMenuDocumentPointerDown = false;
    imagePositionInitialized = false;
    imageDragging = false;
    imageResizeCorner = "";
    selectedImageClip = null;
    overlayImageGroup.visible = false;
    clearExtraImageOverlays();

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
        sourceDuration: videoFrameProvider.duration,
        sourceOffset: 0,
        startTime: 0,
      },
    ];
    selectTimelineClip("video", videoTimelineClips[0]);
    timelineEditableDuration = Math.max(1, videoFrameProvider.duration);
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

      const clip = {
        audioElement: video,
        duration: provider.duration,
        file,
        provider,
        sourceDuration: provider.duration,
        sourceOffset: 0,
        startTime: getVideoTimelineDuration(),
      };

      videoTimelineClips.push(clip);
      selectTimelineClip("video", clip);
      updateTimelineEditableDuration();

      startVideoTrackClipBuild(clip);
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
      sourceDuration: Number.isFinite(audio.duration) ? audio.duration : 0,
      sourceOffset: 0,
      startTime: getInsertionTime(),
      trackIndex: getNextTrackIndex(audioTimelineClips),
    };

    audio.pause();
    audioTimelineClips.push(clip);
    selectTimelineClip("audio", clip);
    updateTimelineEditableDuration();
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
    selectTimelineClip("image", clip);
    updateTimelineEditableDuration();
    renderTimelineClipTracks();
    imagePositionInitialized = false;
    drawEditorTimeline();
    statusText.textContent = "Image added";
  }

  function addTextTimelineClip() {
    if (currentKind !== "video" || !hasPrimaryVideoTrack()) {
      statusText.textContent = "Choose a video first";
      return;
    }

    const rect = getMediaSpriteRect();
    const startTime = getInsertionTime();
    const duration = TEXT_CLIP_DEFAULT_DURATION;
    const clip = {
      duration,
      fill: TEXT_CLIP_DEFAULT_COLOR,
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: TEXT_CLIP_DEFAULT_FONT_SIZE,
      fontStyle: "normal",
      fontWeight: TEXT_CLIP_DEFAULT_FONT_WEIGHT,
      startTime,
      text: TEXT_CLIP_DEFAULT_VALUE,
      trackIndex: getAvailableTextTrackIndex(startTime, duration),
      xRatio: 0.5,
      yRatio: getDefaultTextClipYRatio(rect),
    };

    textTimelineClips.push(clip);
    selectTimelineClip("text", clip);
    selectedTextClip = clip;
    updateTimelineEditableDuration();
    renderTimelineClipTracks();
    updateTextOverlayPosition();
    drawTimeline();
    drawEditorTimeline();
    app.render();
    statusText.textContent = "Subtitle added";
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

  function getClipSourceOffset(clip) {
    return Math.max(0, Number.isFinite(clip?.sourceOffset) ? clip.sourceOffset : 0);
  }

  function getClipSourceDuration(clip) {
    const duration = Number.isFinite(clip?.sourceDuration) ? clip.sourceDuration : clip?.duration;

    return Math.max(0, Number.isFinite(duration) ? duration : 0);
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

  function getTextTrackCount() {
    return getTimelineTrackCount(textTimelineClips);
  }

  function getEditorPanelRowCount() {
    return 1 + getAudioTrackCount() + getImageTrackCount() + getTextTrackCount();
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

  function getTrackViewportTop() {
    return getVideoTrackY();
  }

  function getTrackViewportBottom() {
    return getEditorPanelY() + getEditorPanelHeight() - 8;
  }

  function getTrackContentBottom() {
    const audioBottom = getAudioTrackY(Math.max(0, getAudioTrackCount() - 1)) + AUDIO_TRACK_HEIGHT;
    const imageBottom = getImageTrackY(Math.max(0, getImageTrackCount() - 1)) + IMAGE_TRACK_HEIGHT;
    const textBottom = getTextTrackY(Math.max(0, getTextTrackCount() - 1)) + TEXT_TRACK_HEIGHT;

    return Math.max(getVideoTrackY() + VIDEO_TRACK_HEIGHT, audioBottom, imageBottom, textBottom);
  }

  function getMaxTimelineVerticalScroll() {
    return Math.max(0, getTrackContentBottom() - getTrackViewportBottom());
  }

  function clampTimelineVerticalScroll() {
    timelineVerticalScroll = Math.min(
      Math.max(Number.isFinite(timelineVerticalScroll) ? timelineVerticalScroll : 0, 0),
      getMaxTimelineVerticalScroll()
    );
  }

  function getScrolledTrackY(y) {
    return y - timelineVerticalScroll;
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

  function getTextTrackY(trackIndex = 0) {
    return getImageTrackY(getImageTrackCount()) + trackIndex * getTrackPitch();
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
      syncClipMediaElement(
        clip.audioElement,
        clip.startTime,
        clip.duration,
        getClipSourceOffset(clip)
      );
    }

    for (const clip of audioTimelineClips) {
      syncClipMediaElement(
        clip.audioElement,
        clip.startTime,
        clip.duration,
        getClipSourceOffset(clip)
      );
    }
  }

  async function prepareTimelinePlaybackStart() {
    await Promise.all([preloadCurrentVideoFrame(), prepareTimelineAudioForPlayback()]);
  }

  async function prepareTimelineAudioForPlayback() {
    const prepareTasks = [];

    for (const clip of videoTimelineClips) {
      prepareTasks.push(prepareClipMediaElement(clip));
    }

    for (const clip of audioTimelineClips) {
      prepareTasks.push(prepareClipMediaElement(clip));
    }

    await Promise.all(prepareTasks);
  }

  async function prepareClipMediaElement(clip) {
    const element = clip.audioElement;

    if (!element) {
      return;
    }

    const localTime = playbackTime - clip.startTime;

    if (localTime < 0 || localTime >= clip.duration || clip.duration <= 0) {
      element.pause();
      return;
    }

    const visibleTime = Math.min(Math.max(localTime, 0), Math.max(0, clip.duration - 0.02));
    const sourceTime = getClipSourceOffset(clip) + visibleTime;
    const safeTime = Number.isFinite(element.duration)
      ? Math.min(sourceTime, Math.max(0, element.duration - 0.02))
      : sourceTime;

    if (
      !Number.isFinite(element.duration) ||
      Math.abs(element.currentTime - safeTime) <= MEDIA_SYNC_SEEK_THRESHOLD
    ) {
      return;
    }

    await seekMediaElement(element, safeTime);
  }

  function seekMediaElement(element, time) {
    return new Promise((resolve) => {
      let settled = false;
      const cleanup = () => {
        if (settled) {
          return;
        }

        settled = true;
        element.__timelineSeekPending = false;
        element.removeEventListener("seeked", cleanup);
        window.clearTimeout(timeoutId);
        window.clearTimeout(element.__timelineSeekTimeout);
        resolve();
      };
      const timeoutId = window.setTimeout(cleanup, 350);

      element.__timelineSeekPending = true;
      element.__timelineSeekTarget = time;
      element.__timelineSeekTimeout = timeoutId;
      element.pause();
      element.addEventListener("seeked", cleanup, { once: true });
      element.currentTime = time;
    });
  }

  function syncClipMediaElement(element, startTime, duration, sourceOffset = 0) {
    if (!element) {
      return;
    }

    const localTime = playbackTime - startTime;
    const shouldPlay = playbackPlaying && localTime >= 0 && localTime < duration && duration > 0;

    if (!shouldPlay) {
      element.pause();
      element.__timelineSeekPending = false;
      window.clearTimeout(element.__timelineSeekTimeout);
      return;
    }

    const visibleTime = Math.min(Math.max(localTime, 0), Math.max(0, duration - 0.02));
    const rawTime = Math.max(0, sourceOffset) + visibleTime;
    const safeTime = Number.isFinite(element.duration)
      ? Math.min(rawTime, Math.max(0, element.duration - 0.02))
      : rawTime;

    if (
      Number.isFinite(element.duration) &&
      Math.abs(element.currentTime - safeTime) > MEDIA_SYNC_SEEK_THRESHOLD
    ) {
      const pendingTarget = Number.isFinite(element.__timelineSeekTarget)
        ? element.__timelineSeekTarget
        : Number.NaN;
      const shouldSeek =
        !element.__timelineSeekPending ||
        Math.abs(pendingTarget - safeTime) > MEDIA_SYNC_SEEK_RETRY_THRESHOLD;

      if (shouldSeek) {
        element.__timelineSeekPending = true;
        element.__timelineSeekTarget = safeTime;
        window.clearTimeout(element.__timelineSeekTimeout);
        element.__timelineSeekTimeout = window.setTimeout(() => {
          element.__timelineSeekPending = false;
        }, 350);
        element.addEventListener(
          "seeked",
          () => {
            element.__timelineSeekPending = false;
            window.clearTimeout(element.__timelineSeekTimeout);
          },
          { once: true }
        );
        element.currentTime = safeTime;
      }

      if (element.__timelineSeekPending) {
        return;
      }
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
    if (currentKind !== "video" || playbackStartPending) {
      return;
    }

    const duration = getPlaybackDuration();

    if (duration <= 0) {
      return;
    }

    if (playbackTime >= duration - 0.001) {
      playbackTime = 0;
    }

    playbackStartPending = true;
    statusText.textContent = "Preparing";

    try {
      await prepareTimelinePlaybackStart();
    } finally {
      playbackStartPending = false;
    }

    if (currentKind !== "video") {
      return;
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
      return { alpha: 0, axisScale: 0 };
    }

    return getOverlayTransitionAtTime(playbackTime, intervals, OVERLAY_FADE_SECONDS);
  }

  function updateTextOverlayPosition() {
    const rect = getMediaSpriteRect();

    if (!rect || currentKind !== "video") {
      clearTextOverlayNodes();
      return;
    }

    renderTextOverlays(rect);
  }

  function clearTextOverlayNodes() {
    textTimelineClips.forEach((clip) => {
      clip.overlayNode = null;
    });
    textOverlayLayer.removeChildren().forEach((child) => child.destroy());
  }

  function renderTextOverlays(rect) {
    const activeClips = getActiveTextTimelineClips();

    clearTextOverlayNodes();
    textOverlayLayer.hitArea = new Rectangle(0, 0, getPreviewWidth(), getPreviewHeight());

    for (const clip of activeClips) {
      const textNode = createSubtitleTextNode(clip, rect);

      clip.overlayNode = textNode;
      textOverlayLayer.addChild(textNode);
    }
  }

  function createSubtitleTextNode(clip, rect) {
    const textNode = new Text({
      text: clip.text || TEXT_CLIP_DEFAULT_VALUE,
      style: getSubtitleTextStyle(clip, rect.width),
    });

    textNode.anchor.set(0.5);
    textNode.position.set(
      rect.left + rect.width * clip.xRatio,
      rect.top + rect.height * clip.yRatio
    );
    textNode.eventMode = "static";
    textNode.cursor = textDragging && selectedTextClip === clip ? "grabbing" : "grab";
    textNode.timelineClip = clip;
    textNode.on("pointerdown", (event) => handleTextPointerDown(clip, event));
    clampTextClipToMediaRect(clip, textNode, rect);
    applyTextClipTransition(textNode, clip);
    textNode.hitArea = new Rectangle(
      -textNode.width / 2,
      -textNode.height / 2,
      textNode.width,
      textNode.height
    );

    return textNode;
  }

  function applyTextClipTransition(textNode, clip) {
    const transition = getCurrentOverlayTransition([
      { duration: clip.duration, startTime: clip.startTime },
    ]);

    textNode.alpha = transition.alpha;
    textNode.scale.x *= transition.axisScale;
    textNode.visible = transition.alpha > 0;
  }

  function getSubtitleTextStyle(clip, wordWrapWidth = getMediaSpriteRect()?.width || VIEW_WIDTH) {
    const fontSize = Number(clip.fontSize) || TEXT_CLIP_DEFAULT_FONT_SIZE;

    return {
      align: "center",
      breakWords: true,
      fill: clip.fill || TEXT_CLIP_DEFAULT_COLOR,
      fontFamily: clip.fontFamily || "Inter, system-ui, sans-serif",
      fontSize,
      fontStyle: clip.fontStyle || "normal",
      fontWeight: String(clip.fontWeight || TEXT_CLIP_DEFAULT_FONT_WEIGHT),
      wordWrap: true,
      wordWrapWidth: Math.max(1, wordWrapWidth),
    };
  }

  function clampTextClipToMediaRect(
    clip,
    textNode = clip.overlayNode,
    rect = getMediaSpriteRect()
  ) {
    if (!rect || !textNode) {
      return;
    }

    const halfWidth = Math.min(rect.width / 2, textNode.width / 2);
    const halfHeight = Math.min(rect.height / 2, textNode.height / 2);
    const x = Math.min(Math.max(textNode.x, rect.left + halfWidth), rect.right - halfWidth);
    const y = Math.min(Math.max(textNode.y, rect.top + halfHeight), rect.bottom - halfHeight);

    textNode.position.set(x, y);
    clip.xRatio = (x - rect.left) / rect.width;
    clip.yRatio = (y - rect.top) / rect.height;
  }

  function getDefaultTextClipYRatio(rect) {
    if (!rect) {
      return 0.9;
    }

    const y = rect.height - TEXT_CLIP_BOTTOM_MARGIN - TEXT_CLIP_DEFAULT_FONT_SIZE / 2;

    return Math.min(Math.max(y / rect.height, 0), 1);
  }

  function updateImageOverlayPosition() {
    const rect = getMediaSpriteRect();
    const activeClips = getActiveImageTimelineClips();
    const activeClip = getSelectedImageClip(activeClips);

    if (!rect || currentKind !== "video" || !activeClip) {
      overlayImageGroup.visible = false;
      clearExtraImageOverlays();
      return;
    }

    selectedImageClip = activeClip;
    overlayImageLayer.hitArea = new Rectangle(0, 0, getPreviewWidth(), getPreviewHeight());
    overlayImageSprite.texture = activeClip.texture;

    Object.assign(imageFrame, getImageClipFrame(activeClip, rect));
    imagePositionInitialized = true;

    clampImageToMediaRect();
    saveActiveImageFrame();
    layoutImageOverlay();
    const transition = getCurrentOverlayTransition([
      { duration: activeClip.duration, startTime: activeClip.startTime },
    ]);

    overlayImageGroup.alpha = transition.alpha;
    overlayImageSprite.scale.x *= transition.axisScale;
    overlayImageGroup.visible = overlayImageGroup.alpha > 0;
    renderExtraImageOverlays(
      rect,
      activeClips.filter((clip) => clip !== activeClip)
    );
  }

  function getOverlayImageAspectRatio(clip = getActiveImageTimelineClip()) {
    const activeClip = clip;
    const texture = activeClip?.texture || overlayImageTexture;
    const element = activeClip?.imageElement || overlayImageElement;
    const width = texture.width || element.naturalWidth || 1;
    const height = texture.height || element.naturalHeight || 1;

    return width / height;
  }

  function getImageClipFrame(clip, rect) {
    if (!clip.imageFrame) {
      clip.imageFrame = getDefaultImageFrame(rect, clip);
    }

    return clip.imageFrame;
  }

  function getDefaultImageFrame(rect, clip) {
    const aspectRatio = getOverlayImageAspectRatio(clip);
    const width = Math.min(rect.width * 0.5, rect.height * aspectRatio);
    const height = width / aspectRatio;
    const offset = getClipTrackIndex(clip) * 24;

    return {
      height,
      width,
      x: Math.min(
        Math.max(rect.left + (rect.width - width) / 2 + offset, rect.left),
        rect.right - width
      ),
      y: Math.min(
        Math.max(rect.top + (rect.height - height) / 2 + offset, rect.top),
        rect.bottom - height
      ),
    };
  }

  function saveActiveImageFrame() {
    const activeClip = getActiveImageTimelineClip();

    if (!activeClip) {
      return;
    }

    activeClip.imageFrame = { ...imageFrame };
  }

  function selectImageOverlayClip(clip) {
    const rect = getMediaSpriteRect();

    if (!clip || !rect) {
      return;
    }

    selectedImageClip = clip;
    if (imageTimelineClips.includes(clip)) {
      selectedTimelineClip = { clip, type: "image" };
    }
    Object.assign(imageFrame, getImageClipFrame(clip, rect));
    imagePositionInitialized = true;
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

  function clearExtraImageOverlays() {
    overlayImageExtras.removeChildren().forEach((child) => child.destroy({ children: true }));
  }

  function renderExtraImageOverlays(rect, clips) {
    clearExtraImageOverlays();

    for (const clip of clips) {
      const frame = getImageClipFrame(clip, rect);
      const transition = getCurrentOverlayTransition([
        { duration: clip.duration, startTime: clip.startTime },
      ]);

      if (transition.alpha <= 0) {
        continue;
      }

      const group = new Container();
      const sprite = new Sprite({ texture: clip.texture });

      group.position.set(frame.x, frame.y);
      group.alpha = transition.alpha;
      group.eventMode = "static";
      group.cursor = "move";
      group.hitArea = new Rectangle(0, 0, frame.width, frame.height);
      group.on("pointerdown", (event) => handleExtraImagePointerDown(clip, event));
      sprite.anchor.set(0.5);
      sprite.position.set(frame.width / 2, frame.height / 2);
      sprite.width = frame.width;
      sprite.height = frame.height;
      sprite.scale.x *= transition.axisScale;
      group.addChild(sprite);
      overlayImageExtras.addChild(group);
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
      .drawFrameAt(getClipSourceOffset(clip) + frameTime - clip.startTime)
      .then((frame) => {
        if (requestId !== videoFrameRequestId || currentKind !== "video" || !frame) {
          return;
        }

        applyDecodedVideoFrame(frame);
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

  async function preloadCurrentVideoFrame() {
    if (currentKind !== "video" || !mediaTexture?.source || !videoFrameProvider) {
      return;
    }

    const frameTime = playbackTime;
    const clip = getActiveVideoTimelineClip(frameTime);

    if (!clip?.provider) {
      drawCanvasIntoPreview(null);
      mediaTexture.source.update();
      mediaTexture.update?.();
      app.render();
      return;
    }

    const requestId = videoFrameRequestId + 1;

    videoFrameRequestId = requestId;
    videoFramePending = true;
    lastVideoFrameTime = frameTime;

    try {
      const frame = await clip.provider.drawFrameAt(
        getClipSourceOffset(clip) + frameTime - clip.startTime
      );

      if (requestId === videoFrameRequestId && currentKind === "video" && frame) {
        applyDecodedVideoFrame(frame);
      }
    } catch (error) {
      if (requestId === videoFrameRequestId) {
        statusText.textContent =
          error instanceof Error ? error.message : "Failed to decode video frame.";
      }
    } finally {
      if (requestId === videoFrameRequestId) {
        videoFramePending = false;
      }
    }
  }

  function applyDecodedVideoFrame(frame) {
    if (frame.canvas !== videoFrameProvider?.canvas) {
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
    editorTimelineVideoClips.removeChildren().forEach((child) => child.destroy({ children: true }));
    videoTimelineClips.forEach((clip) => {
      clip.timelineContainer = null;
    });
    videoTrackTextures.forEach((texture) => texture.destroy(true));
    videoTrackTextures = [];
  }

  function clearVideoTrackFramesForClip(clip) {
    const children = editorTimelineFrames.children.filter((child) => child.timelineClip === clip);

    for (const child of children) {
      const texture = child.texture;

      editorTimelineFrames.removeChild(child);
      child.destroy();

      if (texture && !texture.destroyed) {
        texture.destroy(true);
      }

      videoTrackTextures = videoTrackTextures.filter((item) => item !== texture);
    }
  }

  function clearAudioTrackClips() {
    editorTimelineAudioClips.removeChildren().forEach((child) => child.destroy({ children: true }));
    audioTimelineClips.forEach((clip) => {
      clip.timelineContainer = null;
    });
    audioTrackGraphics = [];
  }

  function clearImageTrackClips({ destroyTextures = false } = {}) {
    editorTimelineImageClips.removeChildren().forEach((child) => child.destroy({ children: true }));
    imageTimelineClips.forEach((clip) => {
      clip.timelineContainer = null;
    });
    if (destroyTextures) {
      imageTrackTextures.forEach((texture) => texture.destroy(true));
    }
    imageTrackTextures = [];
  }

  function clearTextTrackClips() {
    editorTimelineTextClips.removeChildren().forEach((child) => child.destroy({ children: true }));
    textTimelineClips.forEach((clip) => {
      clip.timelineContainer = null;
    });
  }

  function clearTimelineTracks() {
    pauseTimelineAudio();
    selectedTimelineClip = null;
    clearVideoTrackFrames();
    clearAudioTrackClips();
    clearImageTrackClips({ destroyTextures: true });
    clearTextTrackClips();
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
    textTimelineClips = [];
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
    editorTimelineTrackMask.clear();
    editorTimelineTrackLabels.removeChildren().forEach((child) => child.destroy());
    editorTimelineStatus.text = "";
    editorTimelineContent.x = 0;
    editorTimelineTracks.y = 0;
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
    clampTimelineVerticalScroll();
    buildEditorTimelineRuler(duration);
    editorTimelineContent.x = playheadX - currentTime * TIMELINE_PIXELS_PER_SECOND;
    editorTimelineTracks.y = -timelineVerticalScroll;
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

    for (let index = 0; index < getTextTrackCount(); index += 1) {
      drawTrackBackground(getTextTrackY(index), TEXT_TRACK_HEIGHT);
    }

    editorTimelineBackground
      .rect(trackX, rulerY, trackWidth, 1)
      .fill({ color: 0x475569, alpha: 0.75 });

    editorTimelineMask.clear();
    editorTimelineMask.rect(trackX, panelY, trackWidth, panelHeight).fill(0xffffff);
    editorTimelineTrackMask.clear();
    editorTimelineTrackMask
      .rect(
        trackX,
        getTrackViewportTop(),
        trackWidth,
        Math.max(1, getTrackViewportBottom() - getTrackViewportTop())
      )
      .fill(0xffffff);

    editorTimelinePlayhead.clear();
    editorTimelinePlayhead
      .moveTo(playheadX, panelY + 10)
      .lineTo(playheadX, panelY + panelHeight - 10)
      .stroke({ color: 0x38bdf8, width: 2 });
    editorTimelinePlayhead.circle(playheadX, panelY + 10, 4).fill(0x38bdf8);
    editorTimelineStatus.position.set(playheadX, panelY + 14);
    drawEditorTrackLabels();
    layoutVideoTrackFrames();
    renderVideoTimelineClipOverlays();

    if (!videoTrackLoading && videoTrackTextures.length > 0) {
      editorTimelineStatus.text = "";
    }

    timelineApp.render();
  }

  function getEditorTimelineContentWidth(duration) {
    return Math.max(1, duration * TIMELINE_PIXELS_PER_SECOND);
  }

  function drawTrackBackground(y, height) {
    const scrolledY = getScrolledTrackY(y);

    if (scrolledY + height < getTrackViewportTop() || scrolledY > getTrackViewportBottom()) {
      return;
    }

    editorTimelineBackground
      .roundRect(getVideoTrackX(), scrolledY, getVideoTrackWidth(), height, 6)
      .fill({ color: 0x111827, alpha: 0.98 })
      .stroke({ color: 0x475569, width: 1 });
  }

  function layoutVideoTrackFrames() {
    const y = getVideoTrackY() + (VIDEO_TRACK_HEIGHT - VIDEO_THUMB_HEIGHT) / 2;

    for (const child of editorTimelineFrames.children) {
      const clip = child.timelineClip;
      const frameCount = Math.max(1, child.timelineFrameCount || 1);
      const frameIndex = Math.max(0, child.timelineFrameIndex || 0);

      if (clip) {
        const clipWidth = getEditorTimelineContentWidth(clip.duration);
        const frameWidth = clipWidth / frameCount;

        child.x = clip.startTime * TIMELINE_PIXELS_PER_SECOND + frameIndex * frameWidth;
        child.width = Math.ceil(frameWidth) + 1;
      }

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

    for (let index = 0; index < getTextTrackCount(); index += 1) {
      addEditorTrackLabel(`Text ${index + 1}`, getTextTrackY(index) + TEXT_TRACK_HEIGHT / 2);
    }
  }

  function addEditorTrackLabel(text, y) {
    const scrolledY = getScrolledTrackY(y);

    if (scrolledY < getTrackViewportTop() || scrolledY > getTrackViewportBottom()) {
      return;
    }

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
    label.position.set(EDITOR_PANEL_X + 14, scrolledY);
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
      let frameCount = 0;

      for (const clip of videoTimelineClips) {
        frameCount += await buildVideoTrackClipFrames(clip, buildId, maxFrames);
      }

      if (buildId === videoTrackBuildId) {
        buildEditorTimelineRuler(getTimelineDuration());
        editorTimelineStatus.text = frameCount > 0 || videoTrackTextures.length ? "" : "No frames";
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

  function startVideoTrackClipBuild(clip) {
    const buildId = videoTrackBuildId + 1;
    const timelineDuration = getTimelineDuration();
    const contentWidth = getEditorTimelineContentWidth(timelineDuration);
    const maxFrames = Math.max(1, Math.min(420, Math.ceil(contentWidth / VIDEO_THUMB_WIDTH)));

    videoTrackBuildId = buildId;
    videoTrackLoading = true;
    clearVideoTrackFramesForClip(clip);
    clearEditorTimelineRuler();
    editorTimelineStatus.text = "Loading frames";

    (async () => {
      const frameCount = await buildVideoTrackClipFrames(clip, buildId, maxFrames);

      if (buildId === videoTrackBuildId) {
        buildEditorTimelineRuler(getTimelineDuration());
        editorTimelineStatus.text = frameCount > 0 || videoTrackTextures.length ? "" : "No frames";
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

  async function buildVideoTrackClipFrames(clip, buildId, maxFrames) {
    const clipWidth = getEditorTimelineContentWidth(clip.duration);
    const clipMaxFrames = Math.max(
      1,
      Math.min(maxFrames, Math.ceil(clipWidth / VIDEO_THUMB_WIDTH))
    );
    const intervalSeconds = Math.max(0.1, clip.duration / clipMaxFrames);
    const frames = await extractVideoFramesWithMediabunny(clip.file, {
      duration: clip.duration,
      fit: "cover",
      includeLastFrame: true,
      intervalSeconds,
      maxFrames: clipMaxFrames,
      poolSize: 3,
      startTime: getClipSourceOffset(clip),
      thumbnailHeight: VIDEO_THUMB_HEIGHT,
      thumbnailWidth: VIDEO_THUMB_WIDTH,
    });

    if (buildId !== videoTrackBuildId || currentKind !== "video") {
      return 0;
    }

    frames.forEach((frame, index) => {
      const texture = Texture.from(frame.canvas, true);
      const sprite = new Sprite({ texture });
      const frameWidth = clipWidth / frames.length;

      sprite.timelineClip = clip;
      sprite.timelineFrameIndex = index;
      sprite.timelineFrameCount = frames.length;
      sprite.x = clip.startTime * TIMELINE_PIXELS_PER_SECOND + index * frameWidth;
      sprite.y = getVideoTrackY() + (VIDEO_TRACK_HEIGHT - VIDEO_THUMB_HEIGHT) / 2;
      sprite.width = Math.ceil(frameWidth) + 1;
      sprite.height = VIDEO_THUMB_HEIGHT;
      videoTrackTextures.push(texture);
      editorTimelineFrames.addChild(sprite);
    });

    return frames.length;
  }

  function renderVideoTimelineClipOverlays() {
    editorTimelineVideoClips.removeChildren().forEach((child) => child.destroy({ children: true }));
    videoTimelineClips.forEach((clip) => {
      clip.timelineContainer = null;
    });

    if (videoTimelineClips.length === 0) {
      return;
    }

    const y = getVideoTrackY() + 2;
    const height = VIDEO_TRACK_HEIGHT - 4;

    for (const clip of videoTimelineClips) {
      const container = new Container();
      const graphic = new Graphics();
      const width = Math.max(1, clip.duration * TIMELINE_PIXELS_PER_SECOND);
      const selected = isSelectedTimelineClip("video", clip);

      container.position.set(clip.startTime * TIMELINE_PIXELS_PER_SECOND, y);
      clip.timelineContainer = container;
      container.eventMode = "static";
      container.cursor = playbackPlaying ? "default" : "grab";
      container.hitArea = new Rectangle(0, 0, width, height);
      container.on("pointerdown", (event) =>
        handleTimelineClipPointerDown("video", clip, event, container)
      );

      graphic
        .roundRect(0, 0, width, height, 5)
        .fill({ color: 0x000000, alpha: selected ? 0.14 : 0.02 })
        .stroke({
          color: selected ? 0xf8fafc : 0x38bdf8,
          alpha: selected ? 0.95 : 0.45,
          width: selected ? 2 : 1,
        });
      drawClipEdgeHandles(graphic, width, height, 0x38bdf8);
      container.addChild(
        graphic,
        createClipEdgeHandle("trim-start", "video", clip, width, height, container),
        createClipEdgeHandle("trim-end", "video", clip, width, height, container)
      );
      editorTimelineVideoClips.addChild(container);
    }
  }

  function drawClipEdgeHandles(graphic, width, height, color) {
    const leftX = Math.min(CLIP_EDGE_HIT_WIDTH, width / 2);
    const rightX = Math.max(width - CLIP_EDGE_HIT_WIDTH, width / 2);

    graphic
      .moveTo(leftX, 6)
      .lineTo(leftX, height - 6)
      .moveTo(rightX, 6)
      .lineTo(rightX, height - 6)
      .stroke({ color, alpha: 0.72, width: 2 });
  }

  function createClipEdgeHandle(mode, type, clip, width, height, targetContainer) {
    const handle = new Container();
    const hitWidth = Math.min(Math.max(CLIP_EDGE_HIT_WIDTH * 1.5, 12), Math.max(width / 2, 1));

    handle.position.set(mode === "trim-start" ? 0 : Math.max(0, width - hitWidth), 0);
    handle.eventMode = "static";
    handle.cursor = playbackPlaying ? "default" : "ew-resize";
    handle.hitArea = new Rectangle(0, 0, hitWidth, height);
    handle.on("pointerdown", (event) =>
      handleTimelineClipPointerDown(type, clip, event, targetContainer, mode)
    );

    return handle;
  }

  function renderAudioTimelineClip(clip, samples = null) {
    const container = new Container();
    const graphic = new Graphics();
    const x = clip.startTime * TIMELINE_PIXELS_PER_SECOND;
    const y = getAudioTrackY(getClipTrackIndex(clip)) + 2;
    const width = Math.max(1, clip.duration * TIMELINE_PIXELS_PER_SECOND);
    const height = AUDIO_TRACK_HEIGHT - 4;
    const selected = isSelectedTimelineClip("audio", clip);

    container.position.set(x, y);
    clip.timelineContainer = container;
    container.eventMode = "static";
    container.cursor = playbackPlaying ? "default" : "grab";
    container.hitArea = new Rectangle(0, 0, width, height);
    container.on("pointerdown", (event) =>
      handleTimelineClipPointerDown("audio", clip, event, container)
    );

    graphic
      .roundRect(0, 0, width, height, 5)
      .fill({ color: 0x1e3a8a, alpha: selected ? 0.96 : 0.88 })
      .stroke({ color: selected ? 0xf8fafc : 0x38bdf8, width: selected ? 2 : 1 });
    drawClipEdgeHandles(graphic, width, height, 0x93c5fd);

    const barCount = Math.max(8, Math.floor(width / 3));
    const barWidth = Math.max(1, width / barCount - 1);

    for (let index = 0; index < barCount; index += 1) {
      const sampleRatio = samples
        ? Math.min(
            0.999,
            (getClipSourceOffset(clip) + (index / barCount) * clip.duration) /
              Math.max(CLIP_MIN_DURATION, getClipSourceDuration(clip))
          )
        : 0;
      const value = samples
        ? samples[Math.floor(sampleRatio * samples.length)]
        : 0.35 + 0.25 * Math.sin(index * 1.7);
      const barHeight = Math.max(2, Math.abs(value) * (height - 6));
      const barX = index * (width / barCount);
      const barY = height / 2 - barHeight / 2;

      graphic.roundRect(barX, barY, barWidth, barHeight, 2).fill({
        color: 0x93c5fd,
        alpha: 0.88,
      });
    }

    container.addChild(
      graphic,
      createClipEdgeHandle("trim-start", "audio", clip, width, height, container),
      createClipEdgeHandle("trim-end", "audio", clip, width, height, container)
    );
    editorTimelineAudioClips.addChild(container);
    audioTrackGraphics.push(container);
  }

  function drawAudioWaveform(graphic, clip, width, height, samples = null) {
    const barCount = Math.max(8, Math.floor(width / 3));
    const barWidth = Math.max(1, width / barCount - 1);

    for (let index = 0; index < barCount; index += 1) {
      const sampleRatio = samples
        ? Math.min(
            0.999,
            (getClipSourceOffset(clip) + (index / barCount) * clip.duration) /
              Math.max(CLIP_MIN_DURATION, getClipSourceDuration(clip))
          )
        : 0;
      const value = samples
        ? samples[Math.floor(sampleRatio * samples.length)]
        : 0.35 + 0.25 * Math.sin(index * 1.7);
      const barHeight = Math.max(2, Math.abs(value) * (height - 6));
      const barX = index * (width / barCount);
      const barY = height / 2 - barHeight / 2;

      graphic.roundRect(barX, barY, barWidth, barHeight, 2).fill({
        color: 0x93c5fd,
        alpha: 0.88,
      });
    }
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
    const selected = isSelectedTimelineClip("image", clip);

    container.position.set(x, y);
    clip.timelineContainer = container;
    container.eventMode = "static";
    container.cursor = playbackPlaying ? "default" : "grab";
    container.hitArea = new Rectangle(0, 0, width, height);
    container.on("pointerdown", (event) =>
      handleTimelineClipPointerDown("image", clip, event, container)
    );

    background
      .roundRect(0, 0, width, height, 5)
      .fill({ color: 0x3f2d0b, alpha: selected ? 0.98 : 0.9 })
      .stroke({ color: selected ? 0xf8fafc : 0xfbbf24, width: selected ? 2 : 1 });
    drawClipEdgeHandles(background, width, height, 0xfde68a);

    sprite.x = 3;
    sprite.y = 3;
    sprite.width = Math.min(width - 6, height - 6);
    sprite.height = height - 6;
    if (!imageTrackTextures.includes(clip.texture)) {
      imageTrackTextures.push(clip.texture);
    }
    container.addChild(
      background,
      sprite,
      createClipEdgeHandle("trim-start", "image", clip, width, height, container),
      createClipEdgeHandle("trim-end", "image", clip, width, height, container)
    );
    editorTimelineImageClips.addChild(container);
  }

  function renderTextTimelineClip(clip) {
    const container = new Container();
    const background = new Graphics();
    const x = clip.startTime * TIMELINE_PIXELS_PER_SECOND;
    const y = getTextTrackY(getClipTrackIndex(clip)) + 2;
    const width = Math.max(1, clip.duration * TIMELINE_PIXELS_PER_SECOND);
    const height = TEXT_TRACK_HEIGHT - 4;
    const label = createTimelineClipLabel(
      getTimelineClipLabelText(clip.text, width - TIMELINE_TEXT_LABEL_PADDING),
      0xf8fafc
    );
    const selected = isSelectedTimelineClip("text", clip);

    container.position.set(x, y);
    clip.timelineContainer = container;
    container.eventMode = "static";
    container.cursor = playbackPlaying ? "default" : "grab";
    container.hitArea = new Rectangle(0, 0, width, height);
    container.on("pointerdown", (event) =>
      handleTimelineClipPointerDown("text", clip, event, container)
    );

    background
      .roundRect(0, 0, width, height, 5)
      .fill({ color: 0x14532d, alpha: selected ? 0.98 : 0.9 })
      .stroke({ color: selected ? 0xf8fafc : 0x4ade80, width: selected ? 2 : 1 });
    drawClipEdgeHandles(background, width, height, 0x86efac);

    container.addChild(background);
    addTimelineTextLabel(container, label, width, height);
    container.addChild(
      createClipEdgeHandle("trim-start", "text", clip, width, height, container),
      createClipEdgeHandle("trim-end", "text", clip, width, height, container)
    );
    editorTimelineTextClips.addChild(container);
  }

  function createTimelineClipLabel(text, fill) {
    const label = new Text({
      text,
      style: {
        fill,
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 12,
        fontWeight: "700",
        wordWrap: false,
        breakWords: false,
      },
    });

    label.anchor.set(0, 0.5);
    return label;
  }

  function getTimelineClipLabelText(value, width = 126) {
    const text = String(value || "")
      .replace(/\s+/g, " ")
      .trim();
    const fallback = text || TEXT_CLIP_DEFAULT_VALUE;
    const maxWidth = Math.max(0, width);

    if (measureTimelineClipLabelText(fallback) <= maxWidth) {
      return fallback;
    }

    if (measureTimelineClipLabelText("…") > maxWidth) {
      return "";
    }

    let low = 0;
    let high = fallback.length;
    let result = "…";

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const candidate = `${fallback.slice(0, mid)}…`;

      if (measureTimelineClipLabelText(candidate) <= maxWidth) {
        result = candidate;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return result;
  }

  function measureTimelineClipLabelText(text) {
    if (!timelineTextMeasureContext) {
      return String(text).length * 7;
    }

    timelineTextMeasureContext.font = TIMELINE_TEXT_LABEL_FONT;

    return timelineTextMeasureContext.measureText(text).width;
  }

  function getTimelineTextLabelMask(width, height) {
    const mask = new Graphics();
    const labelWidth = Math.max(0, width - TIMELINE_TEXT_LABEL_PADDING);

    if (labelWidth <= 0) {
      return null;
    }

    mask.rect(10, 0, labelWidth, height).fill({ color: 0xffffff });

    return mask;
  }

  function addTimelineTextLabel(container, label, width, height) {
    const mask = getTimelineTextLabelMask(width, height);

    label.position.set(10, height / 2);

    if (!mask) {
      return;
    }

    label.mask = mask;
    container.addChild(mask, label);
  }

  function renderTimelineClipTracks() {
    clearAudioTrackClips();
    clearImageTrackClips();
    clearTextTrackClips();
    audioTimelineClips.forEach((clip) => renderAudioTimelineClip(clip, clip.samples || null));
    imageTimelineClips.forEach((clip) => renderImageTimelineClip(clip));
    textTimelineClips.forEach((clip) => renderTextTimelineClip(clip));
  }

  function updateTimelineClipDragPreview() {
    if (!timelineClipDrag) {
      return;
    }

    const { clip, mode, targetContainer, targetStartTime, targetTrackIndex, type } =
      timelineClipDrag;
    const container = targetContainer || clip.timelineContainer;

    if (!container || container.destroyed) {
      return;
    }

    const width = Math.max(1, clip.duration * TIMELINE_PIXELS_PER_SECOND);
    const height = getTimelineClipHeight(type) - 4;

    container.position.set(
      targetStartTime * TIMELINE_PIXELS_PER_SECOND,
      getTimelineClipY(type, targetTrackIndex) + 2
    );
    container.hitArea = new Rectangle(0, 0, width, height);

    if (type === "video") {
      layoutVideoTrackFrames();
    }

    if (mode !== "move") {
      redrawTimelineClipDragPreviewContent(container, type, clip, width, height);
    }

    timelineApp.render();
  }

  function redrawTimelineClipDragPreviewContent(container, type, clip, width, height) {
    container.removeChildren().forEach((child) => child.destroy({ children: true }));

    if (type === "audio") {
      addAudioTimelineClipContent(container, clip, width, height);
    } else if (type === "image") {
      addImageTimelineClipContent(container, clip, width, height);
    } else if (type === "text") {
      addTextTimelineClipContent(container, clip, width, height);
    } else {
      const graphic = new Graphics();

      graphic
        .roundRect(0, 0, width, height, 5)
        .fill({ color: 0x000000, alpha: 0.14 })
        .stroke({ color: 0xf8fafc, width: 2 });
      drawClipEdgeHandles(graphic, width, height, 0x38bdf8);
      container.addChild(
        graphic,
        createClipEdgeHandle("trim-start", "video", clip, width, height, container),
        createClipEdgeHandle("trim-end", "video", clip, width, height, container)
      );
    }
  }

  function addAudioTimelineClipContent(container, clip, width, height) {
    const graphic = new Graphics();

    graphic
      .roundRect(0, 0, width, height, 5)
      .fill({ color: 0x1e3a8a, alpha: 0.96 })
      .stroke({ color: 0xf8fafc, width: 2 });
    drawClipEdgeHandles(graphic, width, height, 0x93c5fd);
    drawAudioWaveform(graphic, clip, width, height, clip.samples || null);
    container.addChild(
      graphic,
      createClipEdgeHandle("trim-start", "audio", clip, width, height, container),
      createClipEdgeHandle("trim-end", "audio", clip, width, height, container)
    );
  }

  function addImageTimelineClipContent(container, clip, width, height) {
    const background = new Graphics();
    const sprite = new Sprite({ texture: clip.texture });

    background
      .roundRect(0, 0, width, height, 5)
      .fill({ color: 0x3f2d0b, alpha: 0.98 })
      .stroke({ color: 0xf8fafc, width: 2 });
    drawClipEdgeHandles(background, width, height, 0xfde68a);
    sprite.x = 3;
    sprite.y = 3;
    sprite.width = Math.max(1, Math.min(width - 6, height - 6));
    sprite.height = Math.max(1, height - 6);
    container.addChild(
      background,
      sprite,
      createClipEdgeHandle("trim-start", "image", clip, width, height, container),
      createClipEdgeHandle("trim-end", "image", clip, width, height, container)
    );
  }

  function addTextTimelineClipContent(container, clip, width, height) {
    const background = new Graphics();
    const label = createTimelineClipLabel(
      getTimelineClipLabelText(clip.text, width - TIMELINE_TEXT_LABEL_PADDING),
      0xf8fafc
    );

    background
      .roundRect(0, 0, width, height, 5)
      .fill({ color: 0x14532d, alpha: 0.98 })
      .stroke({ color: 0xf8fafc, width: 2 });
    drawClipEdgeHandles(background, width, height, 0x86efac);
    container.addChild(background);
    addTimelineTextLabel(container, label, width, height);
    container.addChild(
      createClipEdgeHandle("trim-start", "text", clip, width, height, container),
      createClipEdgeHandle("trim-end", "text", clip, width, height, container)
    );
  }

  function getTimelineClipY(type, trackIndex = 0) {
    if (type === "video") {
      return getVideoTrackY();
    }

    if (type === "audio") {
      return getAudioTrackY(trackIndex);
    }

    return type === "image" ? getImageTrackY(trackIndex) : getTextTrackY(trackIndex);
  }

  function getTimelineClipHeight(type) {
    if (type === "video") {
      return VIDEO_TRACK_HEIGHT;
    }

    if (type === "audio") {
      return AUDIO_TRACK_HEIGHT;
    }

    return type === "image" ? IMAGE_TRACK_HEIGHT : TEXT_TRACK_HEIGHT;
  }

  function getVideoTimelineDuration() {
    return videoTimelineClips.reduce(
      (maxTime, clip) => Math.max(maxTime, clip.startTime + clip.duration),
      0
    );
  }

  function getTimelineContentDuration() {
    const clipEnds = [
      ...videoTimelineClips,
      ...audioTimelineClips,
      ...imageTimelineClips,
      ...textTimelineClips,
    ].map((clip) => clip.startTime + clip.duration);
    const mediaDuration =
      currentKind === "audio" && mediaElement && Number.isFinite(mediaElement.duration)
        ? mediaElement.duration
        : 0;

    return Math.max(mediaDuration, 1, ...clipEnds);
  }

  function getTimelineDuration() {
    return Math.max(timelineEditableDuration, getTimelineContentDuration());
  }

  function updateTimelineEditableDuration(previousDuration = timelineEditableDuration) {
    const nextDuration = getTimelineContentDuration();
    const changed =
      Math.abs(previousDuration - nextDuration) > 0.001 ||
      Math.abs(timelineEditableDuration - nextDuration) > 0.001;

    timelineEditableDuration = nextDuration;

    if (currentKind === "video" && playbackTime > nextDuration) {
      playbackTime = nextDuration;
      syncTimelineAudio();
    }

    if (changed) {
      clearEditorTimelineRuler();
    }

    return changed;
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
    const renderStartTime = performance.now();

    if (currentKind === "audio") {
      drawAudioVisualizer();
      drawTimeline();
      hideEditorTimeline();
      clearTextOverlayNodes();
      overlayImageGroup.visible = false;
    } else if (currentKind === "empty") {
      drawEmptyBackground();
      drawDisabledTimeline();
      hideEditorTimeline();
      clearTextOverlayNodes();
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

    updatePerformanceStats(performance.now() - renderStartTime);
  }

  function updatePerformanceStats(renderCostMs) {
    const previousCost = performanceStatsState.renderCostMs || renderCostMs;
    const now = performance.now();

    performanceStatsState.renderCostMs = previousCost * 0.82 + renderCostMs * 0.18;

    if (now - performanceStatsState.lastUpdateTime < PERFORMANCE_UPDATE_INTERVAL_MS) {
      return;
    }

    performanceStatsState.lastUpdateTime = now;
    performanceStats.textContent = [
      `CPU ${formatPercent(
        (performanceStatsState.renderCostMs / PERFORMANCE_FRAME_BUDGET_MS) * 100
      )}`,
      `GPU ${formatBytes(estimateGpuMemoryBytes())}`,
      `MEM ${formatMemoryUsage()}`,
    ].join(" · ");
  }

  function estimateGpuMemoryBytes() {
    const textures = new Set([
      overlayImageTexture,
      mediaTexture,
      ...videoTrackTextures,
      ...imageTrackTextures,
      ...imageTimelineClips.map((clip) => clip.texture),
    ]);
    let bytes = estimateRendererBackingBytes(app) + estimateRendererBackingBytes(timelineApp);

    textures.forEach((texture) => {
      bytes += estimateTextureBytes(texture);
    });

    return bytes;
  }

  function estimateRendererBackingBytes(targetApp) {
    const renderer = targetApp?.renderer;

    if (!renderer) {
      return 0;
    }

    const backingCanvas = renderer.canvas || targetApp.canvas;
    const width = Number(backingCanvas?.width || renderer.width || targetApp.screen?.width || 0);
    const height = Number(
      backingCanvas?.height || renderer.height || targetApp.screen?.height || 0
    );

    return Math.max(0, width * height * 4);
  }

  function estimateTextureBytes(texture) {
    if (!texture || texture.destroyed) {
      return 0;
    }

    const source = texture.source || texture.baseTexture || {};
    const resolution = Number(source.resolution || texture.resolution) || 1;
    const width = Number(
      source.pixelWidth || source.realWidth || source.width || texture.width || 0
    );
    const height = Number(
      source.pixelHeight || source.realHeight || source.height || texture.height || 0
    );

    return Math.max(0, width * height * resolution * resolution * 4);
  }

  function formatMemoryUsage() {
    const memory = performance.memory;

    if (!memory || !Number.isFinite(memory.usedJSHeapSize)) {
      return "N/A";
    }

    if (Number.isFinite(memory.jsHeapSizeLimit)) {
      return `${formatBytes(memory.usedJSHeapSize)}/${formatBytes(memory.jsHeapSizeLimit)}`;
    }

    return formatBytes(memory.usedJSHeapSize);
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) {
      return "0 MB";
    }

    const megabytes = bytes / 1024 / 1024;

    if (megabytes < 100) {
      return `${megabytes.toFixed(1)} MB`;
    }

    return `${Math.round(megabytes)} MB`;
  }

  function formatPercent(value) {
    if (!Number.isFinite(value)) {
      return "N/A";
    }

    return `${Math.max(0, Math.min(999, value)).toFixed(0)}%`;
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

  function handleTimelineClipPointerDown(
    type,
    clip,
    event,
    targetContainer = null,
    forcedMode = null
  ) {
    suppressNextCanvasToggle = true;

    if (event.button !== undefined && event.button !== 0) {
      cancelPendingTimelineClipDragFrame();
      timelineClipDrag = null;
      selectTimelineClip(type, clip);
      renderTimelineClipTracks();
      drawEditorTimeline();
      event.stopPropagation();
      return;
    }

    if (playbackPlaying) {
      statusText.textContent = "Pause before dragging clips";
      event.stopPropagation();
      return;
    }

    selectTimelineClip(type, clip);

    const local = editorTimelineTracks.toLocal(event.global);
    const clipLocalX = targetContainer
      ? targetContainer.toLocal(event.global).x
      : local.x - clip.startTime * TIMELINE_PIXELS_PER_SECOND;
    const mode = forcedMode || getTimelineClipPointerMode(clip, clipLocalX);
    const originalTrackIndex = getClipTrackIndex(clip);
    const timelineDuration =
      Math.max(timelineEditableDuration, getTimelineDuration()) +
      (mode === "move" ? TIMELINE_DRAG_EXTENSION_SECONDS : 0);
    const moveBounds = null;
    const maxTargetTrackIndex =
      type === "video"
        ? 0
        : type === "audio"
          ? getAudioTrackCount()
          : type === "image"
            ? getImageTrackCount()
            : getTextTrackCount();

    timelineClipDrag = {
      clip,
      lastTimelineDuration: getTimelineDuration(),
      maxTargetTrackIndex,
      moveBounds,
      mode,
      originalDuration: clip.duration,
      originalSourceOffset: getClipSourceOffset(clip),
      originalStartTime: clip.startTime,
      pointerOffsetSeconds: local.x / TIMELINE_PIXELS_PER_SECOND - clip.startTime,
      targetContainer: targetContainer || clip.timelineContainer,
      targetStartTime: clip.startTime,
      targetTrackIndex: originalTrackIndex,
      timelineDuration,
      type,
    };
    statusText.textContent = mode === "move" ? "Dragging clip" : "Trimming clip";
    event.stopPropagation();
  }

  function handleTimelineClipPointerMove(event) {
    if (!timelineClipDrag) {
      return;
    }

    pendingTimelineClipDragEvent = {
      global: {
        x: event.global.x,
        y: event.global.y,
      },
    };

    if (timelineClipDragFrame) {
      return;
    }

    timelineClipDragFrame = window.requestAnimationFrame(() => {
      timelineClipDragFrame = 0;

      if (!timelineClipDrag || !pendingTimelineClipDragEvent) {
        pendingTimelineClipDragEvent = null;
        return;
      }

      const pendingEvent = pendingTimelineClipDragEvent;

      pendingTimelineClipDragEvent = null;
      updateTimelineClipDrag(pendingEvent);
    });
  }

  function handleTimelineClipPointerUp(event) {
    if (!timelineClipDrag) {
      return;
    }

    cancelPendingTimelineClipDragFrame();
    updateTimelineClipDrag(event);

    const { clip, mode, targetStartTime, targetTrackIndex, type } = timelineClipDrag;

    if (mode === "move") {
      clip.startTime = targetStartTime;
      clip.trackIndex = targetTrackIndex;

      if (type === "video") {
        normalizeVideoTimelineClips();
      }
    }

    updateTimelineEditableDuration();
    timelineClipDrag = null;
    renderTimelineClipTracks();
    syncTimelineAudio();
    if (type === "video") {
      if (mode !== "move") {
        startVideoTrackBuild();
      }

      updateVideoTexture(true);
    }
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

    const { clip, mode, type } = timelineClipDrag;
    const previousDuration = timelineClipDrag.lastTimelineDuration ?? getTimelineDuration();
    const target =
      mode === "move" ? getTimelineClipDragTarget(event) : getTimelineClipTrimTarget(event);

    if (mode === "move") {
      const startTime = getTimelineClipFollowStartTime(
        type,
        clip,
        target.trackIndex,
        target.startTime
      );

      clip.startTime = startTime;
      clip.trackIndex = target.trackIndex;
      timelineClipDrag.targetStartTime = startTime;
      timelineClipDrag.targetTrackIndex = target.trackIndex;
    } else {
      clip.startTime = target.startTime;
      clip.duration = target.duration;
      clip.sourceOffset = target.sourceOffset;
      timelineClipDrag.targetStartTime = target.startTime;
      timelineClipDrag.targetTrackIndex = getClipTrackIndex(clip);
    }

    const durationChanged = updateTimelineEditableDuration(previousDuration);

    timelineClipDrag.lastTimelineDuration = getTimelineDuration();
    timelineClipDrag.timelineDuration = Math.max(
      timelineClipDrag.timelineDuration,
      getTimelineDuration() + (mode === "move" ? TIMELINE_DRAG_EXTENSION_SECONDS : 0)
    );
    updateTimelineClipDragPreview();

    if (durationChanged) {
      drawTimeline();
      buildEditorTimelineRuler(getTimelineDuration());
      app.render();
      timelineApp.render();
    }

    statusText.textContent =
      mode === "move" && hasTimelineClipOverlap(type, clip, target.trackIndex, target.startTime)
        ? "Release to follow clip"
        : mode === "move"
          ? "Dragging clip"
          : "Trimming clip";
  }

  function cancelPendingTimelineClipDragFrame() {
    if (timelineClipDragFrame) {
      window.cancelAnimationFrame(timelineClipDragFrame);
      timelineClipDragFrame = 0;
    }

    pendingTimelineClipDragEvent = null;
  }

  function normalizeVideoTimelineClips() {
    const orderedClips = [...videoTimelineClips].sort((left, right) => {
      if (Math.abs(left.startTime - right.startTime) > TRACK_OVERLAP_EPSILON) {
        return left.startTime - right.startTime;
      }

      return videoTimelineClips.indexOf(left) - videoTimelineClips.indexOf(right);
    });
    let cursor = 0;

    for (const clip of orderedClips) {
      clip.startTime = Math.max(clip.startTime, cursor);
      cursor = clip.startTime + clip.duration;
    }
  }

  function getTimelineClipDragTarget(event) {
    const { clip, maxTargetTrackIndex, moveBounds, pointerOffsetSeconds, timelineDuration, type } =
      timelineClipDrag;
    const local = editorTimelineTracks.toLocal(event.global);
    const minStartTime = moveBounds?.minStartTime ?? 0;
    const maxStartTime = moveBounds?.maxStartTime ?? Math.max(0, timelineDuration - clip.duration);
    const startTime = Math.min(
      Math.max(local.x / TIMELINE_PIXELS_PER_SECOND - pointerOffsetSeconds, minStartTime),
      maxStartTime
    );

    return {
      startTime,
      trackIndex: getTimelineTrackIndexFromY(type, local.y, maxTargetTrackIndex),
    };
  }

  function getTimelineClipPointerMode(clip, localX) {
    const width = Math.max(1, clip.duration * TIMELINE_PIXELS_PER_SECOND);

    if (localX <= CLIP_EDGE_HIT_WIDTH) {
      return "trim-start";
    }

    if (localX >= width - CLIP_EDGE_HIT_WIDTH) {
      return "trim-end";
    }

    return "move";
  }

  function getTimelineClipTrimTarget(event) {
    const { clip, mode, originalDuration, originalSourceOffset, originalStartTime, type } =
      timelineClipDrag;
    const local = editorTimelineTracks.toLocal(event.global);
    const pointerTime = Math.max(0, local.x / TIMELINE_PIXELS_PER_SECOND);
    const originalEndTime = originalStartTime + originalDuration;
    const neighborBounds = getTimelineClipNeighborBounds(type, clip, getClipTrackIndex(clip));

    if (mode === "trim-start") {
      const minStartTime =
        type === "image" || type === "text"
          ? 0
          : Math.max(0, originalStartTime - originalSourceOffset);
      const maxStartTime = originalEndTime - CLIP_MIN_DURATION;
      const startTime = Math.min(
        Math.max(pointerTime, minStartTime, neighborBounds.previousEnd),
        maxStartTime
      );
      const duration = Math.max(CLIP_MIN_DURATION, originalEndTime - startTime);
      const sourceOffset =
        type === "image" || type === "text"
          ? undefined
          : Math.max(0, originalSourceOffset + startTime - originalStartTime);

      return { duration, sourceOffset, startTime };
    }

    const sourceDuration = getClipSourceDuration(clip);
    const maxEndTime =
      type === "image" || type === "text"
        ? Math.max(pointerTime, originalStartTime + CLIP_MIN_DURATION)
        : originalStartTime + Math.max(CLIP_MIN_DURATION, sourceDuration - originalSourceOffset);
    const minEndTime = originalStartTime + CLIP_MIN_DURATION;
    const endTime = Math.min(
      Math.max(pointerTime, minEndTime),
      maxEndTime,
      neighborBounds.nextStart
    );

    return {
      duration: Math.max(CLIP_MIN_DURATION, endTime - originalStartTime),
      sourceOffset: type === "image" || type === "text" ? undefined : originalSourceOffset,
      startTime: originalStartTime,
    };
  }

  function getTimelineClipNeighborBounds(type, targetClip, trackIndex) {
    const clips = getTimelineClipsByType(type)
      .filter((clip) => clip !== targetClip && getClipTrackIndex(clip) === trackIndex)
      .sort((left, right) => left.startTime - right.startTime);
    let previousEnd = 0;
    let nextStart = Number.POSITIVE_INFINITY;

    for (const clip of clips) {
      const clipStart = clip.startTime;
      const clipEnd = clip.startTime + clip.duration;

      if (clipEnd <= targetClip.startTime + TRACK_OVERLAP_EPSILON) {
        previousEnd = Math.max(previousEnd, clipEnd);
      } else if (clipStart >= targetClip.startTime + TRACK_OVERLAP_EPSILON) {
        nextStart = Math.min(nextStart, clipStart);
      }
    }

    return { nextStart, previousEnd };
  }

  function getTimelineClipFollowStartTime(type, movingClip, trackIndex, startTime) {
    let resolvedStartTime = Math.max(0, Number.isFinite(startTime) ? startTime : 0);
    const clips = getTimelineClipsByType(type)
      .filter((clip) => clip !== movingClip && getClipTrackIndex(clip) === trackIndex)
      .sort((left, right) => left.startTime - right.startTime);

    for (const clip of clips) {
      const clipEnd = clip.startTime + clip.duration;
      const resolvedEndTime = resolvedStartTime + movingClip.duration;

      if (
        resolvedStartTime < clipEnd - TRACK_OVERLAP_EPSILON &&
        resolvedEndTime > clip.startTime + TRACK_OVERLAP_EPSILON
      ) {
        resolvedStartTime = clipEnd;
      }
    }

    return resolvedStartTime;
  }

  function getTimelineTrackIndexFromY(type, y, maxTargetTrackIndex = null) {
    if (type === "video") {
      return 0;
    }

    const count =
      type === "audio"
        ? getAudioTrackCount()
        : type === "image"
          ? getImageTrackCount()
          : getTextTrackCount();
    const firstY =
      type === "audio"
        ? getAudioTrackY(0)
        : type === "image"
          ? getImageTrackY(0)
          : getTextTrackY(0);
    const rawIndex = Math.round((y - firstY) / getTrackPitch());
    const maxIndex =
      maxTargetTrackIndex === null
        ? Math.max(0, count - 1)
        : Math.max(0, Math.min(maxTargetTrackIndex, count));

    return Math.min(Math.max(rawIndex, 0), maxIndex);
  }

  function getTimelineClipsByType(type) {
    if (type === "video") {
      return videoTimelineClips;
    }

    if (type === "audio") {
      return audioTimelineClips;
    }

    return type === "image" ? imageTimelineClips : textTimelineClips;
  }

  function getSelectedTimelineClip() {
    if (
      selectedTimelineClip &&
      getTimelineClipsByType(selectedTimelineClip.type).includes(selectedTimelineClip.clip)
    ) {
      return selectedTimelineClip;
    }

    selectedTimelineClip = null;

    return null;
  }

  function isSelectedTimelineClip(type, clip) {
    const selected = getSelectedTimelineClip();

    return Boolean(selected && selected.type === type && selected.clip === clip);
  }

  function selectTimelineClip(type, clip) {
    if (!clip || !getTimelineClipsByType(type).includes(clip)) {
      selectedTimelineClip = null;
      return;
    }

    selectedTimelineClip = { clip, type };

    if (type === "image") {
      selectedImageClip = clip;
    } else if (type === "text") {
      selectedTextClip = clip;
    }
  }

  function hasTimelineClipOverlap(type, movingClip, trackIndex, startTime, duration = null) {
    const clipDuration =
      duration === null
        ? Math.max(0, Number.isFinite(movingClip?.duration) ? movingClip.duration : 0)
        : duration;
    const endTime = startTime + clipDuration;

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

  function handleTimelineWheel(event) {
    if (currentKind !== "video" || !isSeekableMedia()) {
      return;
    }

    const maxScroll = getMaxTimelineVerticalScroll();

    if (maxScroll <= 0) {
      return;
    }

    event.preventDefault();
    timelineVerticalScroll = Math.min(
      Math.max(timelineVerticalScroll + event.deltaY / Math.max(timelineScale, 0.001), 0),
      maxScroll
    );
    drawEditorTimeline();
  }

  function handlePlayPauseButtonPointerDown(event) {
    suppressNextCanvasToggle = true;
    event.stopPropagation();
    void toggleMediaPlayback();
  }

  function handlePlayPauseButtonPointerOver() {
    canvas.title = currentKind === "video" && playbackPlaying ? "暂停" : "播放";
  }

  async function handleSplitButtonPointerDown(event) {
    suppressNextCanvasToggle = true;
    event.stopPropagation();
    await splitSelectedTimelineClip();
  }

  function handleSplitButtonPointerOver() {
    canvas.title = "分割";
  }

  function handleDeleteButtonPointerDown(event) {
    suppressNextCanvasToggle = true;
    event.stopPropagation();
    deleteSelectedTimelineClip();
  }

  function handleDeleteButtonPointerOver() {
    canvas.title = "删除";
  }

  function handlePreviewButtonPointerOut() {
    canvas.removeAttribute("title");
  }

  function getEditableSelectedTimelineClip(actionLabel) {
    if (currentKind !== "video") {
      statusText.textContent = "Choose a video first";
      return null;
    }

    if (playbackPlaying || playbackStartPending) {
      statusText.textContent = `Pause before ${actionLabel}`;
      return null;
    }

    const selected = getSelectedTimelineClip();

    if (!selected) {
      statusText.textContent = "Select a clip first";
      return null;
    }

    return selected;
  }

  function deleteSelectedTimelineClip() {
    const selected = getEditableSelectedTimelineClip("deleting clips");

    if (!selected) {
      return;
    }

    removeTimelineClip(selected.type, selected.clip);
    selectedTimelineClip = null;
    if (selected.type === "image" && selectedImageClip === selected.clip) {
      selectedImageClip = null;
    } else if (selected.type === "text" && selectedTextClip === selected.clip) {
      selectedTextClip = null;
      hideSubtitleContextMenu();
      finishSubtitleEditing({ commit: false });
    }

    refreshTimelineAfterClipEdit(selected.type, { rebuildVideo: selected.type === "video" });
    exportButton.disabled =
      currentKind !== "video" || !currentVideoFile || videoTimelineClips.length === 0;
    statusText.textContent = "Clip deleted";
  }

  async function splitSelectedTimelineClip() {
    const selected = getEditableSelectedTimelineClip("splitting clips");

    if (!selected) {
      return;
    }

    const { clip, type } = selected;
    const splitTime = playbackTime;
    const clipStart = clip.startTime;
    const clipEnd = clip.startTime + clip.duration;

    if (
      splitTime <= clipStart + TRACK_OVERLAP_EPSILON ||
      splitTime >= clipEnd - TRACK_OVERLAP_EPSILON
    ) {
      statusText.textContent = "Move playhead inside the selected clip";
      return;
    }

    statusText.textContent = "Splitting clip";

    try {
      const rightClip = await createSplitRightClip(type, clip, splitTime);
      const clips = getTimelineClipsByType(type);
      const index = clips.indexOf(clip);

      clip.duration = splitTime - clipStart;
      clips.splice(index + 1, 0, rightClip);
      selectTimelineClip(type, rightClip);
      refreshTimelineAfterClipEdit(type, { rebuildVideo: type === "video" });
      statusText.textContent = "Clip split";
    } catch (error) {
      statusText.textContent = error instanceof Error ? error.message : "Failed to split clip";
    }
  }

  async function createSplitRightClip(type, clip, splitTime) {
    const leftDuration = splitTime - clip.startTime;
    const rightDuration = clip.startTime + clip.duration - splitTime;
    const sourceOffset = getClipSourceOffset(clip);
    const baseClip = {
      ...clip,
      duration: rightDuration,
      sourceOffset: type === "image" ? undefined : sourceOffset + leftDuration,
      startTime: splitTime,
      trackIndex: getClipTrackIndex(clip),
    };

    if (type === "video") {
      return {
        ...baseClip,
        audioElement: await createTimelineMediaElement("video", clip.file),
        provider: clip.provider,
      };
    }

    if (type === "audio") {
      return {
        ...baseClip,
        audioElement: await createTimelineMediaElement("audio", clip.file),
        samples: clip.samples,
      };
    }

    if (type === "text") {
      return {
        ...baseClip,
        text: clip.text,
        fill: clip.fill,
        fontFamily: clip.fontFamily,
        fontSize: clip.fontSize,
        fontStyle: clip.fontStyle,
        fontWeight: clip.fontWeight,
        xRatio: clip.xRatio,
        yRatio: clip.yRatio,
      };
    }

    return {
      ...baseClip,
      imageFrame: clip.imageFrame ? { ...clip.imageFrame } : undefined,
    };
  }

  async function createTimelineMediaElement(type, file) {
    const url = URL.createObjectURL(file);
    const element = type === "video" ? document.createElement("video") : new Audio();

    timelineObjectUrls.push(url);
    element.loop = false;
    element.preload = "auto";
    element.src = url;

    if (element instanceof HTMLVideoElement) {
      element.playsInline = true;
    }

    await waitForMediaReady(element, "loadedmetadata", type);
    element.pause();

    return element;
  }

  function removeTimelineClip(type, clip) {
    const clips = getTimelineClipsByType(type);
    const index = clips.indexOf(clip);

    if (index === -1) {
      return;
    }

    clips.splice(index, 1);
    disposeTimelineClipResources(type, clip);
  }

  function disposeTimelineClipResources(type, clip) {
    if ((type === "video" || type === "audio") && clip.audioElement) {
      clip.audioElement.pause();

      if (!isTimelineResourceShared("audioElement", clip.audioElement)) {
        if (clip.audioElement !== mediaElement) {
          clip.audioElement.removeAttribute("src");
          clip.audioElement.load();
        }
      }
    }

    if (
      type === "video" &&
      clip.provider &&
      clip.provider !== videoFrameProvider &&
      !isTimelineResourceShared("provider", clip.provider)
    ) {
      clip.provider.dispose();
    }
  }

  function isTimelineResourceShared(key, value) {
    return [
      ...videoTimelineClips,
      ...audioTimelineClips,
      ...imageTimelineClips,
      ...textTimelineClips,
    ].some((clip) => clip[key] === value);
  }

  function refreshTimelineAfterClipEdit(type, { rebuildVideo = false } = {}) {
    pauseTimelineAudio();
    syncTimelineAudio();
    updateTimelineEditableDuration();

    if (type === "video" && rebuildVideo) {
      startVideoTrackBuild();
    } else {
      renderTimelineClipTracks();
    }

    clearEditorTimelineRuler();
    updateVideoTexture(true);
    updateImageOverlayPosition();
    updateTextOverlayPosition();
    drawTimeline();
    drawEditorTimeline();
    app.render();
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

  function getTextOverlayExportStates() {
    const rect = getMediaSpriteRect();

    if (!rect) {
      return [];
    }

    return textTimelineClips.map((clip) => ({
      duration: clip.duration,
      fillStyle: clip.fill || TEXT_CLIP_DEFAULT_COLOR,
      fontFamily: clip.fontFamily || "Inter, system-ui, sans-serif",
      fontStyle: clip.fontStyle || "normal",
      fontSizeRatio: (Number(clip.fontSize) || TEXT_CLIP_DEFAULT_FONT_SIZE) / rect.height,
      fontWeight: String(clip.fontWeight || TEXT_CLIP_DEFAULT_FONT_WEIGHT),
      startTime: clip.startTime,
      strokeStyle: "transparent",
      text: clip.text || TEXT_CLIP_DEFAULT_VALUE,
      transitionSeconds: OVERLAY_FADE_SECONDS,
      maxWidthRatio: 1,
      xRatio: clip.xRatio,
      yRatio: clip.yRatio,
    }));
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
    if (clip.imageFrame) {
      return clip.imageFrame;
    }

    if (clip === getActiveImageTimelineClip() && imagePositionInitialized) {
      return imageFrame;
    }

    return getImageClipFrame(clip, rect);
  }

  function getActiveImageTimelineClips() {
    if (currentKind !== "video") {
      return [];
    }

    return imageTimelineClips.filter(
      (clip) => playbackTime >= clip.startTime && playbackTime < clip.startTime + clip.duration
    );
  }

  function getSelectedImageClip(activeClips = getActiveImageTimelineClips()) {
    if (selectedImageClip && activeClips.includes(selectedImageClip)) {
      return selectedImageClip;
    }

    selectedImageClip = activeClips[0] || null;

    return selectedImageClip;
  }

  function getActiveImageTimelineClip() {
    return getSelectedImageClip();
  }

  function getActiveTextTimelineClips() {
    if (currentKind !== "video") {
      return [];
    }

    return textTimelineClips.filter(
      (clip) => playbackTime >= clip.startTime && playbackTime < clip.startTime + clip.duration
    );
  }

  function getAvailableTextTrackIndex(startTime, duration) {
    let trackIndex = 0;

    while (hasTimelineClipOverlap("text", null, trackIndex, startTime, duration)) {
      trackIndex += 1;
    }

    return trackIndex;
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
        sourceOffset: getClipSourceOffset(clip),
        startTime: clip.startTime,
        volume: clip.volume ?? 1,
      })),
      ...audioTimelineClips.map((clip) => ({
        duration: clip.duration,
        file: clip.file,
        sourceOffset: getClipSourceOffset(clip),
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
          Math.max(0, source.sourceOffset || 0),
          Math.min(
            Math.max(0, buffer.duration - Math.max(0, source.sourceOffset || 0)),
            source.duration,
            Math.max(0, duration - source.startTime)
          )
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

    const textOverlayStates = getTextOverlayExportStates();
    const imageOverlayStates = getImageOverlayExportStates();
    const hasVideoTimelineEdit =
      videoTimelineClips.length !== 1 ||
      videoTimelineClips.some(
        (clip) =>
          getClipSourceOffset(clip) > 0.001 ||
          Math.abs(clip.duration - getClipSourceDuration(clip)) > 0.001 ||
          clip.startTime > 0.001
      );

    if (
      !hasVideoTimelineEdit &&
      textOverlayStates.length === 0 &&
      imageOverlayStates.length === 0 &&
      audioTimelineClips.length === 0
    ) {
      statusText.textContent = "No overlay";
      return;
    }

    isExporting = true;
    exportButton.disabled = true;
    chooseButton.disabled = true;
    exportProgressLabel.hidden = false;
    exportProgressLabel.textContent = "0%";
    statusText.textContent = "Exporting 0%";

    const shouldResume = currentKind === "video" && playbackPlaying;

    playbackPlaying = false;
    pauseTimelineAudio();
    mediaElement?.pause();
    app.stop();

    try {
      const duration = getTimelineDuration();

      statusText.textContent = "Mixing audio";
      exportProgressLabel.textContent = "0%";
      const audioBuffer = await createTimelineAudioMixdown(duration);

      statusText.textContent = "Exporting 0%";
      exportProgressLabel.textContent = "0%";
      const blob = await exportTimelineComposition(
        videoTimelineClips.map((clip) => ({
          duration: clip.duration,
          file: clip.file,
          sourceOffset: getClipSourceOffset(clip),
          startTime: clip.startTime,
        })),
        {
          images: imageOverlayStates,
          texts: textOverlayStates,
        },
        {
          audioBuffer,
          duration,
          onProgress(progress) {
            const percentText = `${Math.round(progress * 100)}%`;

            exportProgressLabel.textContent = percentText;
            statusText.textContent = `Exporting ${percentText}`;
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
      exportButton.disabled =
        currentKind !== "video" || !currentVideoFile || videoTimelineClips.length === 0;
      exportProgressLabel.hidden = true;

      if (shouldResume) {
        await startTimelinePlayback();
      } else {
        app.render();
      }
    }
  }

  function handleTextPointerDown(clip, event) {
    if (currentKind !== "video" || !clip) {
      return;
    }

    if (event.button !== undefined && event.button !== 0) {
      handleTextRightDown(clip, event);
      return;
    }

    const now = performance.now();

    if (lastTextTapClip === clip && now - lastTextTapTime <= TEXT_DOUBLE_TAP_MS) {
      textDragging = false;
      lastTextTapClip = null;
      lastTextTapTime = 0;
      handleTextDoubleClick(clip, event);
      return;
    }

    lastTextTapClip = clip;
    lastTextTapTime = now;
    hideSubtitleContextMenu();
    finishSubtitleEditing();
    selectTimelineClip("text", clip);
    selectedTextClip = clip;
    suppressNextCanvasToggle = true;
    textDragging = true;

    const local = textLayer.toLocal(event.global);
    const rect = getMediaSpriteRect();
    const x = rect ? rect.left + rect.width * clip.xRatio : 0;
    const y = rect ? rect.top + rect.height * clip.yRatio : 0;

    textDragOffset.x = x - local.x;
    textDragOffset.y = y - local.y;
    event.stopPropagation();
  }

  function handleTextPointerMove(event) {
    if (!textDragging || !selectedTextClip) {
      return;
    }

    const local = textLayer.toLocal(event.global);
    const rect = getMediaSpriteRect();
    const node = selectedTextClip.overlayNode;

    if (!rect || !node) {
      return;
    }

    node.position.set(local.x + textDragOffset.x, local.y + textDragOffset.y);
    clampTextClipToMediaRect(selectedTextClip, node, rect);
    updateTextOverlayPosition();
    app.render();
    event.stopPropagation();
  }

  function handleTextPointerUp() {
    if (!textDragging) {
      return;
    }

    textDragging = false;
    updateTextOverlayPosition();
    app.render();
  }

  function handleTextRightDown(clip, event) {
    if (currentKind !== "video" || !clip) {
      return;
    }

    suppressNextCanvasToggle = true;
    finishSubtitleEditing();
    selectTimelineClip("text", clip);
    selectedTextClip = clip;
    showSubtitleContextMenu(clip, event);
    event.stopPropagation();
  }

  function handleTextDoubleClick(clip, event) {
    if (currentKind !== "video" || !clip) {
      return;
    }

    suppressNextCanvasToggle = true;
    hideSubtitleContextMenu();
    selectTimelineClip("text", clip);
    selectedTextClip = clip;
    startSubtitleEditing(clip);
    event.stopPropagation();
  }

  function showSubtitleContextMenu(clip, event) {
    const clientPoint = getClientPointFromPixiEvent(event);

    subtitleColorInput.value = normalizeHexColor(clip.fill || TEXT_CLIP_DEFAULT_COLOR);
    subtitleSizeInput.value = String(Number(clip.fontSize) || TEXT_CLIP_DEFAULT_FONT_SIZE);
    subtitleWeightSelect.value = String(clip.fontWeight || TEXT_CLIP_DEFAULT_FONT_WEIGHT);
    subtitleContextMenu.style.left = `${clientPoint.x}px`;
    subtitleContextMenu.style.top = `${clientPoint.y}px`;
    subtitleContextMenu.hidden = false;
    skipNextSubtitleMenuDocumentPointerDown = true;
  }

  function hideSubtitleContextMenu() {
    subtitleContextMenu.hidden = true;
    skipNextSubtitleMenuDocumentPointerDown = false;
  }

  function handleSubtitleStyleChange() {
    if (!selectedTextClip) {
      return;
    }

    selectedTextClip.fill = subtitleColorInput.value || TEXT_CLIP_DEFAULT_COLOR;
    selectedTextClip.fontSize = Math.min(
      Math.max(Number(subtitleSizeInput.value) || TEXT_CLIP_DEFAULT_FONT_SIZE, 8),
      96
    );
    selectedTextClip.fontWeight = subtitleWeightSelect.value || TEXT_CLIP_DEFAULT_FONT_WEIGHT;
    updateTextOverlayPosition();
    renderTimelineClipTracks();
    drawEditorTimeline();
    app.render();
  }

  function startSubtitleEditing(clip) {
    const rect = getMediaSpriteRect();
    const node = clip.overlayNode;

    if (!rect || !node) {
      return;
    }

    const clientPoint = getClientPointFromCanvasPoint(node.x, node.y);
    const bounds = canvas.getBoundingClientRect();
    const width = Math.max(140, Math.min(bounds.width - 24, node.width + 40));

    subtitleEditInput.value = clip.text || TEXT_CLIP_DEFAULT_VALUE;
    subtitleEditInput.style.left = `${Math.min(
      Math.max(clientPoint.x - width / 2, bounds.left + 12),
      bounds.right - width - 12
    )}px`;
    subtitleEditInput.style.top = `${clientPoint.y - Math.max(18, node.height / 2)}px`;
    subtitleEditInput.style.width = `${width}px`;
    subtitleEditInput.style.fontSize = `${Number(clip.fontSize) || TEXT_CLIP_DEFAULT_FONT_SIZE}px`;
    subtitleEditInput.style.fontWeight = String(clip.fontWeight || TEXT_CLIP_DEFAULT_FONT_WEIGHT);
    subtitleEditInput.style.color = clip.fill || TEXT_CLIP_DEFAULT_COLOR;
    subtitleEditInput.hidden = false;
    subtitleEditInput.focus();
    subtitleEditInput.select();
  }

  function finishSubtitleEditing({ commit = true } = {}) {
    if (commit && selectedTextClip && !subtitleEditInput.hidden) {
      selectedTextClip.text = subtitleEditInput.value || TEXT_CLIP_DEFAULT_VALUE;
      renderTimelineClipTracks();
      updateTextOverlayPosition();
      drawEditorTimeline();
      app.render();
    }

    subtitleEditInput.hidden = true;
  }

  function handleSubtitleEditKeyDown(event) {
    if (event.key === "Enter") {
      finishSubtitleEditing();
    } else if (event.key === "Escape") {
      finishSubtitleEditing({ commit: false });
    }
  }

  function handleDocumentPointerDown(event) {
    if (skipNextSubtitleMenuDocumentPointerDown) {
      skipNextSubtitleMenuDocumentPointerDown = false;
      return;
    }

    if (
      !subtitleContextMenu.hidden &&
      event.target !== subtitleContextMenu &&
      !subtitleContextMenu.contains(event.target)
    ) {
      hideSubtitleContextMenu();
    }
  }

  function handleCanvasContextMenu(event) {
    event.preventDefault();
  }

  function handleCanvasDoubleClick(event) {
    const clip = getTextClipAtCanvasEvent(event);

    if (!clip) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    textDragging = false;
    suppressNextCanvasToggle = true;
    hideSubtitleContextMenu();
    finishSubtitleEditing();
    selectTimelineClip("text", clip);
    selectedTextClip = clip;
    updateTextOverlayPosition();
    startSubtitleEditing(clip);
    app.render();
  }

  function getClientPointFromPixiEvent(event) {
    const global = event.global || { x: getPreviewWidth() / 2, y: getPreviewHeight() / 2 };

    return getClientPointFromCanvasPoint(global.x, global.y);
  }

  function getClientPointFromCanvasPoint(x, y) {
    const bounds = canvas.getBoundingClientRect();

    return {
      x: bounds.left + (x / getPreviewWidth()) * bounds.width,
      y: bounds.top + (y / getPreviewHeight()) * bounds.height,
    };
  }

  function normalizeHexColor(value) {
    return /^#[0-9a-f]{6}$/i.test(value) ? value : TEXT_CLIP_DEFAULT_COLOR;
  }

  function handleImagePointerDown(event) {
    if (currentKind !== "video") {
      return;
    }

    selectImageOverlayClip(getActiveImageTimelineClip());
    suppressNextCanvasToggle = true;
    imageDragging = true;
    overlayImageGroup.cursor = "grabbing";

    const local = textLayer.toLocal(event.global);

    imageDragOffset.x = local.x - imageFrame.x;
    imageDragOffset.y = local.y - imageFrame.y;
    event.stopPropagation();
  }

  function handleExtraImagePointerDown(clip, event) {
    if (currentKind !== "video") {
      return;
    }

    selectImageOverlayClip(clip);
    updateImageOverlayPosition();
    handleImagePointerDown(event);
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
    saveActiveImageFrame();
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
    saveActiveImageFrame();
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
    addTextTimelineClip();
  }

  function isPointerInEditorPanel() {
    return false;
  }

  function isPointerInImageOverlay(event) {
    if (!event || currentKind !== "video") {
      return false;
    }

    const rect = getMediaSpriteRect();

    if (!rect) {
      return false;
    }

    const canvasPoint = getCanvasPoint(event);
    const padding = IMAGE_OVERLAY_HANDLE_RADIUS + 4;

    return getActiveImageTimelineClips().some((clip) => {
      const frame =
        clip === getActiveImageTimelineClip() ? imageFrame : getImageClipFrame(clip, rect);

      return (
        canvasPoint.x >= frame.x - padding &&
        canvasPoint.x <= frame.x + frame.width + padding &&
        canvasPoint.y >= frame.y - padding &&
        canvasPoint.y <= frame.y + frame.height + padding
      );
    });
  }

  function isPointerInTextOverlay(event) {
    if (!event || currentKind !== "video") {
      return false;
    }

    return Boolean(getTextClipAtCanvasEvent(event));
  }

  function getTextClipAtCanvasEvent(event) {
    if (!event || currentKind !== "video") {
      return null;
    }

    const rect = getMediaSpriteRect();

    if (!rect) {
      return null;
    }

    const canvasPoint = getCanvasPoint(event);
    const activeClips = getActiveTextTimelineClips();

    for (let index = activeClips.length - 1; index >= 0; index -= 1) {
      const clip = activeClips[index];
      const node = clip.overlayNode;

      if (!node) {
        continue;
      }

      const padding = 4;
      const inBounds =
        canvasPoint.x >= node.x - node.width / 2 - padding &&
        canvasPoint.x <= node.x + node.width / 2 + padding &&
        canvasPoint.y >= node.y - node.height / 2 - padding &&
        canvasPoint.y <= node.y + node.height / 2 + padding;

      if (inBounds) {
        return clip;
      }
    }

    return null;
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
      (isPointerInEditorPanel(event) ||
        isPointerInImageOverlay(event) ||
        isPointerInTextOverlay(event))
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
  subtitleColorInput.addEventListener("input", handleSubtitleStyleChange);
  subtitleSizeInput.addEventListener("input", handleSubtitleStyleChange);
  subtitleWeightSelect.addEventListener("change", handleSubtitleStyleChange);
  subtitleEditInput.addEventListener("blur", finishSubtitleEditing);
  subtitleEditInput.addEventListener("keydown", handleSubtitleEditKeyDown);
  exportButton.addEventListener("click", handleExportClick);
  input.addEventListener("change", handleInputChange);
  canvas.addEventListener("contextmenu", handleCanvasContextMenu);
  canvas.addEventListener("dblclick", handleCanvasDoubleClick);
  document.addEventListener("pointerdown", handleDocumentPointerDown);
  timelineCanvas.addEventListener("wheel", handleTimelineWheel, { passive: false });
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
  overlayImageLayer.on("pointerup", handleImagePointerUp);
  overlayImageLayer.on("pointerupoutside", handleImagePointerUp);
  overlayImageLayer.on("globalpointermove", handleImagePointerMove);
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
  textOverlayLayer.on("pointerup", handleTextPointerUp);
  textOverlayLayer.on("pointerupoutside", handleTextPointerUp);
  textOverlayLayer.on("globalpointermove", handleTextPointerMove);
  app.ticker.add(renderScene);

  resizeCanvas();

  return () => {
    clearCurrentMedia();
    document.body.classList.remove("pixi-media-page");
    chooseButton.removeEventListener("click", handleChooseClick);
    subtitleButton.removeEventListener("click", handleSubtitleClick);
    subtitleColorInput.removeEventListener("input", handleSubtitleStyleChange);
    subtitleSizeInput.removeEventListener("input", handleSubtitleStyleChange);
    subtitleWeightSelect.removeEventListener("change", handleSubtitleStyleChange);
    subtitleEditInput.removeEventListener("blur", finishSubtitleEditing);
    subtitleEditInput.removeEventListener("keydown", handleSubtitleEditKeyDown);
    exportButton.removeEventListener("click", handleExportClick);
    exportButton.remove();
    subtitleButton.remove();
    subtitleContextMenu.remove();
    subtitleEditInput.remove();
    performanceStats.remove();
    toolbarLeft.remove();
    toolbarRight.remove();
    input.removeEventListener("change", handleInputChange);
    canvas.removeEventListener("contextmenu", handleCanvasContextMenu);
    canvas.removeEventListener("dblclick", handleCanvasDoubleClick);
    document.removeEventListener("pointerdown", handleDocumentPointerDown);
    timelineCanvas.removeEventListener("wheel", handleTimelineWheel);
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
    overlayImageLayer.off("pointerup", handleImagePointerUp);
    overlayImageLayer.off("pointerupoutside", handleImagePointerUp);
    overlayImageLayer.off("globalpointermove", handleImagePointerMove);
    overlayImageGroup.off("pointerdown", handleImagePointerDown);
    overlayImageGroup.off("pointerup", handleImagePointerUp);
    overlayImageGroup.off("pointerupoutside", handleImagePointerUp);
    overlayImageGroup.off("globalpointermove", handleImagePointerMove);
    overlayImageHandles.forEach((handle) => {
      handle.node.removeAllListeners();
    });
    textOverlayLayer.off("pointerup", handleTextPointerUp);
    textOverlayLayer.off("pointerupoutside", handleTextPointerUp);
    textOverlayLayer.off("globalpointermove", handleTextPointerMove);
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

function createFieldLabel(text, field) {
  const label = document.createElement("label");
  const labelText = document.createElement("span");

  labelText.textContent = text;
  label.append(labelText, field);

  return label;
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
    axisScale: Math.cos((1 - progress) * (Math.PI / 2)),
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
