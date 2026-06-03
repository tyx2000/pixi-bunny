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
} from "../util.js";
import {
  AUDIO_TRACK_HEIGHT,
  BAR_COUNT,
  CLIP_EDGE_HIT_WIDTH,
  CLIP_MIN_DURATION,
  DEFAULT_TIMELINE_PIXELS_PER_SECOND,
  EDITOR_PANEL_HEADER_HEIGHT,
  EDITOR_PANEL_X,
  EDITOR_PANEL_Y,
  HEADER_HEIGHT,
  ICON_GAP,
  ICON_SIZE,
  IMAGE_CLIP_DEFAULT_DURATION,
  IMAGE_OVERLAY_HANDLE_RADIUS,
  IMAGE_OVERLAY_MIN_WIDTH,
  IMAGE_TRACK_HEIGHT,
  MEDIA_PADDING,
  MEDIA_SYNC_SEEK_RETRY_THRESHOLD,
  MEDIA_SYNC_SEEK_THRESHOLD,
  OVERLAY_DEFAULT_TRANSITION_TYPE,
  OVERLAY_FADE_SECONDS,
  PERFORMANCE_FRAME_BUDGET_MS,
  PERFORMANCE_UPDATE_INTERVAL_MS,
  PREVIEW_ACTION_BUTTON_WIDTH,
  PREVIEW_CONTROL_GAP,
  PREVIEW_CONTROL_HEIGHT,
  PREVIEW_HEIGHT,
  PREVIEW_MEDIA_CONTROL_GAP,
  PREVIEW_MIN_HEIGHT,
  PREVIEW_PLAY_BUTTON_WIDTH,
  PREVIEW_PROGRESS_MIN_WIDTH,
  PREVIEW_TIMECODE_SIDE_GAP,
  PREVIEW_TIMECODE_WIDTH,
  RULER_LABEL_HEIGHT,
  RULER_TRACK_GAP,
  TEXT_CLIP_BOTTOM_MARGIN,
  TEXT_CLIP_DEFAULT_ALIGN,
  TEXT_CLIP_DEFAULT_BACKGROUND_ALPHA,
  TEXT_CLIP_DEFAULT_BACKGROUND_COLOR,
  TEXT_CLIP_DEFAULT_COLOR,
  TEXT_CLIP_DEFAULT_DURATION,
  TEXT_CLIP_DEFAULT_FONT_FAMILY,
  TEXT_CLIP_DEFAULT_FONT_SIZE,
  TEXT_CLIP_DEFAULT_FONT_WEIGHT,
  TEXT_CLIP_DEFAULT_LINE_HEIGHT,
  TEXT_CLIP_DEFAULT_SHADOW_BLUR,
  TEXT_CLIP_DEFAULT_SHADOW_COLOR,
  TEXT_CLIP_DEFAULT_SHADOW_DISTANCE,
  TEXT_CLIP_DEFAULT_STROKE_COLOR,
  TEXT_CLIP_DEFAULT_STROKE_WIDTH,
  TEXT_CLIP_DEFAULT_VALUE,
  TEXT_CLIP_FONT_REFERENCE_HEIGHT,
  TEXT_DOUBLE_TAP_MS,
  TEXT_TRACK_HEIGHT,
  TIME_TEXT_FONT_FAMILY,
  TIMELINE_CLIP_DRAG_THRESHOLD,
  TIMELINE_CLIP_RELEASE_ANIMATION_MS,
  TIMELINE_DRAG_EXTENSION_SECONDS,
  TIMELINE_HEIGHT,
  TIMELINE_HIT_HEIGHT,
  TIMELINE_KNOB_SIZE,
  TIMELINE_PANEL_HEIGHT,
  TIMELINE_PANEL_MAX_RATIO,
  TIMELINE_PANEL_MIN_RATIO,
  TIMELINE_PIXELS_PER_SECOND_MAX,
  TIMELINE_PIXELS_PER_SECOND_MIN,
  TIMELINE_SPLITTER_HEIGHT,
  TIMELINE_TEXT_LABEL_FONT,
  TIMELINE_TEXT_LABEL_PADDING,
  TIMELINE_X,
  TRACK_LABEL_WIDTH,
  TRACK_OVERLAP_EPSILON,
  TRACK_ROW_GAP,
  VIDEO_FRAME_MIN_INTERVAL,
  VIDEO_THUMB_HEIGHT,
  VIDEO_THUMB_WIDTH,
  VIDEO_TRACK_HEIGHT,
  VIEW_HEIGHT,
  VIEW_WIDTH,
} from "./constants.js";
import { createNumberInput, requireElement } from "./dom-controls.js";
import { createExportDialog } from "./export-dialog.js";
import {
  formatBytes,
  formatMemoryUsage,
  formatNumberInputValue,
  formatPercent,
  formatProjectHistoryFileTime,
  formatRulerTime,
  formatTime,
  getOverlayTransitionAtTime,
  parseHexColorNumber,
} from "./formatting.js";
import { createClipInspector } from "./clip-inspector.js";
import {
  getMediaKind,
  loadImageElement,
  waitForMediaReady,
} from "./media-utils.js";
import {
  estimateRendererBackingBytes,
  estimateTextureBytes,
} from "./performance-metrics.js";
import { createImageResizeHandle } from "./pixi-factories.js";
import { createSubtitleControls } from "./subtitle-controls.js";
import { createTrackPanel } from "./track-panel.js";
import {
  captureTimelineState as captureTimelineStateSnapshot,
  cloneTimelineClipState as cloneTimelineClipStateSnapshot,
  createPortableProjectState,
  getClipSourceOffset,
  getClipTrackIndex,
  getTimelineContentDuration as getClipsContentDuration,
  hasClipOverlap,
} from "./timeline-model.js";

let TIMELINE_PIXELS_PER_SECOND = DEFAULT_TIMELINE_PIXELS_PER_SECOND;

export async function startPixiMedia() {
  document.body.classList.add("pixi-media-page");

  const canvas = document.getElementById("app-canvas");
  const fileName = document.getElementById("moves-count");
  const statusText = document.getElementById("status-text");
  const chooseButton = document.getElementById("shuffle-button");
  const hud = document.getElementById("hud");
  const gameShell = canvas?.closest("#game-shell");
  const fileLabel = fileName?.closest("span")?.firstChild;

  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("Canvas element #app-canvas was not found.");
  }

  if (
    !(fileName instanceof HTMLElement) ||
    !(statusText instanceof HTMLElement) ||
    !(chooseButton instanceof HTMLButtonElement) ||
    !(hud instanceof HTMLElement) ||
    !(gameShell instanceof HTMLElement)
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

  const exportButton = requireElement("export-button", HTMLButtonElement);
  const exportProgressLabel = requireElement("export-progress", HTMLElement);

  const subtitleControls = createSubtitleControls();
  const {
    alignSelect: subtitleAlignSelect,
    applyAllButton: applySubtitleStyleAllButton,
    backgroundAlphaInput: subtitleBackgroundAlphaInput,
    backgroundColorInput: subtitleBackgroundColorInput,
    button: subtitleButton,
    colorInput: subtitleColorInput,
    contextMenu: subtitleContextMenu,
    editInput: subtitleEditInput,
    fontSelect: subtitleFontSelect,
    lineHeightInput: subtitleLineHeightInput,
    panel: subtitlePanel,
    panelList: subtitlePanelList,
    shadowBlurInput: subtitleShadowBlurInput,
    shadowColorInput: subtitleShadowColorInput,
    shadowDistanceInput: subtitleShadowDistanceInput,
    sizeInput: subtitleSizeInput,
    strokeColorInput: subtitleStrokeColorInput,
    strokeWidthInput: subtitleStrokeWidthInput,
    styleFields: subtitleStyleFields,
    weightSelect: subtitleWeightSelect,
  } = subtitleControls;

  const exportDialog = createExportDialog();

  const clipInspectorControls = createClipInspector();
  const {
    allSettingNodes: clipAllSettingNodes,
    audioLabels: clipAudioLabels,
    controlFields: clipControlFields,
    durationInput: clipDurationInput,
    endInput: clipEndInput,
    mutedInput: clipMutedInput,
    node: clipInspector,
    overlayLabels: clipOverlayLabels,
    startInput: clipStartInput,
    subtitleAlignSelect: clipSubtitleAlignSelect,
    subtitleApplyAllButton: clipSubtitleApplyAllButton,
    subtitleBackgroundAlphaInput: clipSubtitleBackgroundAlphaInput,
    subtitleBackgroundColorInput: clipSubtitleBackgroundColorInput,
    subtitleColorInput: clipSubtitleColorInput,
    subtitleFontSelect: clipSubtitleFontSelect,
    subtitleLineHeightInput: clipSubtitleLineHeightInput,
    subtitleShadowBlurInput: clipSubtitleShadowBlurInput,
    subtitleShadowColorInput: clipSubtitleShadowColorInput,
    subtitleShadowDistanceInput: clipSubtitleShadowDistanceInput,
    subtitleSizeInput: clipSubtitleSizeInput,
    subtitleStrokeColorInput: clipSubtitleStrokeColorInput,
    subtitleStrokeWidthInput: clipSubtitleStrokeWidthInput,
    subtitleStyleLabels: clipSubtitleStyleLabels,
    subtitleWeightSelect: clipSubtitleWeightSelect,
    textInput: clipTextInput,
    textLabel: clipTextLabel,
    title: clipInspectorTitle,
    timingLabels: clipTimingLabels,
    transitionDurationInput: clipTransitionDurationInput,
    transitionSelect: clipTransitionSelect,
    volumeInput: clipVolumeInput,
  } = clipInspectorControls;

  const trackPanelControls = createTrackPanel({
    onExportProject: exportProjectHistoryEntry,
    onRestoreProject: restoreProjectHistoryEntry,
  });
  const {
    node: trackPanel,
    projectHistoryPanel,
    rows: trackPanelRows,
    saveProjectButton,
  } = trackPanelControls;

  const sidePanel = requireElement("media-side-panel", HTMLElement);
  const sidePanelToggle = requireElement("media-side-panel-toggle", HTMLButtonElement);
  const performanceStats = requireElement("performance-stats", HTMLElement);
  const input = requireElement("media-file-input", HTMLInputElement);
  const timelineCanvas = requireElement("timeline-canvas", HTMLCanvasElement);
  const timelineSplitter = requireElement("timeline-splitter", HTMLElement);

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

  const scene = new Container();
  const timelineScene = new Container();
  const mediaLayer = new Container();
  const textLayer = new Container();
  const overlayImageLayer = new Container();
  const textOverlayLayer = new Container();
  const overlayImageExtras = new Container();
  const overlayImageGroup = new Container();
  const overlayImageSprite = new Sprite();
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
      fontFamily: TIME_TEXT_FONT_FAMILY,
      fontSize: 13,
      fontWeight: "600",
    },
  });
  const durationText = new Text({
    text: "00:00.000",
    style: {
      fill: "#94a3b8",
      fontFamily: TIME_TEXT_FONT_FAMILY,
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
  editorTimelineLabel.position.set(
    EDITOR_PANEL_X + ICON_GAP + ICON_SIZE / 2,
    getVideoTrackY() + VIDEO_TRACK_HEIGHT / 2
  );
  editorTimelineAudioLabel.anchor.set(0, 0.5);
  editorTimelineAudioLabel.visible = false;
  editorTimelineAudioLabel.position.set(
    EDITOR_PANEL_X + ICON_GAP + ICON_SIZE / 2,
    getVideoTrackY() + VIDEO_TRACK_HEIGHT + TRACK_ROW_GAP + AUDIO_TRACK_HEIGHT / 2
  );
  editorTimelineImageLabel.anchor.set(0, 0.5);
  editorTimelineImageLabel.visible = false;
  editorTimelineImageLabel.position.set(
    EDITOR_PANEL_X + ICON_GAP + ICON_SIZE / 2,
    getVideoTrackY() +
      VIDEO_TRACK_HEIGHT +
      TRACK_ROW_GAP +
      AUDIO_TRACK_HEIGHT +
      TRACK_ROW_GAP +
      IMAGE_TRACK_HEIGHT / 2
  );
  editorTimelineTextLabel.anchor.set(0, 0.5);
  editorTimelineTextLabel.visible = false;
  editorTimelineTextLabel.position.set(
    EDITOR_PANEL_X + ICON_GAP + ICON_SIZE / 2,
    getVideoTrackY() +
      VIDEO_TRACK_HEIGHT +
      TRACK_ROW_GAP +
      AUDIO_TRACK_HEIGHT +
      TRACK_ROW_GAP +
      IMAGE_TRACK_HEIGHT +
      TRACK_ROW_GAP +
      TEXT_TRACK_HEIGHT / 2
  );
  editorTimelineStatus.anchor.set(0.5, 0.5);
  editorTimelineStatus.position.set(getEditorPlayheadX(), EDITOR_PANEL_Y + 14);

  titleText.anchor.set(0.5);
  detailText.anchor.set(0.5);
  textOverlayLayer.eventMode = "passive";
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
  let mediaLoadRequestId = 0;
  let timelineEditableDuration = 1;
  let videoTrackLoading = false;
  let editorTimelineRulerDuration = -1;
  let editorTimelineRulerY = -1;
  let lastVideoFrameTime = -1;
  let wasPlayingBeforeSeek = false;
  let suppressNextCanvasToggle = false;
  let timelineClipDrag = null;
  let timelineClipDragFrame = 0;
  let timelineClipReleaseAnimationFrame = 0;
  let pendingTimelineClipDragEvent = null;
  let timelinePanelHeightPx = null;
  let timelinePanelResizeDrag = null;
  let timelinePanelResizeFrame = 0;
  let pendingTimelinePanelHeightPx = null;
  let selectedTimelineClip = null;
  let selectedTimelineClips = [];
  let timelineClipboard = [];
  let timelineUndoStack = [];
  let timelineRedoStack = [];
  let savedProjectHistory = [];
  let savedProjectHistoryId = 0;
  const timelineClipVisualStartTimes = new Map();
  const trackControlState = {
    audio: { hidden: false, locked: false, muted: false },
    image: { hidden: false, locked: false, muted: false },
    text: { hidden: false, locked: false, muted: false },
    video: { hidden: false, locked: false, muted: false },
  };
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
  let exportAbortController = null;
  const performanceStatsState = {
    lastUpdateTime: 0,
    renderCostMs: 0,
  };
  const timelineTextMeasureContext = document.createElement("canvas").getContext("2d");

  function clearCurrentMedia({ invalidateLoads = false } = {}) {
    if (invalidateLoads) {
      mediaLoadRequestId += 1;
    }

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
    selectedTimelineClips = [];
    timelineClipboard = [];
    timelineUndoStack = [];
    timelineRedoStack = [];
    savedProjectHistory = [];
    timelineClipVisualStartTimes.clear();
    exportDialog.hide();
    exportAbortController?.abort();
    clearTimelineTracks();
    renderProjectHistoryPanel();
    currentVideoFile = null;
    exportButton.disabled = true;
    exportProgressLabel.hidden = true;
    isExporting = false;
    selectedTextClip = null;
    textDragging = false;
    textOverlayLayer.eventMode = "passive";
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
    renderTrackPanel();
    renderClipInspector();
    renderSubtitlePanel();
    hideTimeline();
    hideEditorTimeline();
  }

  async function loadMedia(file) {
    const kind = getMediaKind(file);

    if (!["audio", "image", "video"].includes(kind)) {
      statusText.textContent = "Unsupported file type.";
      return;
    }

    if (kind !== "video" || hasPrimaryVideoTrack()) {
      if (currentKind === "empty") {
        clearCurrentMedia();
        currentKind = "video";
        titleText.visible = false;
        detailText.visible = false;
      }

      try {
        statusText.textContent = "Adding";
        fileName.textContent = file.name;

        if (kind === "audio") {
          await addAudioTimelineClip(file);
        } else if (kind === "image") {
          await addImageTimelineClip(file);
        } else {
          await appendVideoTimelineClip(file);
        }

        drawEditorTimeline();
        app.render();
      } catch (error) {
        statusText.textContent = error instanceof Error ? error.message : "Failed to add";
      }

      return;
    }

    const loadRequestId = mediaLoadRequestId + 1;
    const hadTimelineClips = hasTimelineClips();

    mediaLoadRequestId = loadRequestId;

    if (!hadTimelineClips) {
      clearCurrentMedia();
      mediaLoadRequestId = loadRequestId;
    } else {
      recordTimelineHistory();
    }

    const nextObjectUrl = URL.createObjectURL(file);

    objectUrl = nextObjectUrl;
    fileName.textContent = file.name;
    statusText.textContent = "Loading";

    try {
      const loaded = await loadVideo(file, nextObjectUrl, loadRequestId);

      if (!loaded || !isActiveMediaLoad(loadRequestId)) return;

      titleText.visible = false;
      detailText.visible = false;
      updateTimelineEditableDuration();
      renderTrackPanel();
      resizeCanvas();
      app.render();
    } catch (error) {
      if (!isActiveMediaLoad(loadRequestId)) {
        return;
      }

      clearCurrentMedia({ invalidateLoads: true });
      titleText.visible = true;
      detailText.visible = true;
      fileName.textContent = "none";
      statusText.textContent = error instanceof Error ? error.message : "Failed to load";
      drawEmptyBackground();
      app.render();
    }
  }

  function isActiveMediaLoad(loadRequestId) {
    return loadRequestId === mediaLoadRequestId;
  }

  async function loadVideo(file, sourceUrl, loadRequestId) {
    const video = document.createElement("video");
    let provider = null;

    video.loop = false;
    video.playsInline = true;
    video.preload = "auto";
    video.src = sourceUrl;

    try {
      provider = await createMediabunnyVideoFrameProvider(file);
      await provider.drawFrameAt(0);
      await waitForMediaReady(video, "loadedmetadata", "video");
    } catch (error) {
      provider?.dispose();
      video.pause();
      video.removeAttribute("src");
      video.load();
      throw error;
    }

    if (!isActiveMediaLoad(loadRequestId)) {
      provider.dispose();
      video.pause();
      video.removeAttribute("src");
      video.load();
      return false;
    }

    mediaElement = video;
    videoFrameProvider = provider;
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
        muted: false,
        volume: 1,
      },
    ];
    selectTimelineClip("video", videoTimelineClips[0]);
    timelineEditableDuration = Math.max(1, videoFrameProvider.duration);
    renderTrackPanel();
    statusText.textContent = `Video ${videoFrameProvider.width}x${videoFrameProvider.height}`;
    startVideoTrackBuild();
    statusText.textContent = "Click canvas to play";

    return true;
  }

  function hasPrimaryVideoTrack() {
    return currentKind === "video" && videoFrameProvider && mediaElement;
  }

  function hasTimelineClips() {
    return (
      videoTimelineClips.length > 0 ||
      audioTimelineClips.length > 0 ||
      imageTimelineClips.length > 0 ||
      textTimelineClips.length > 0
    );
  }

  async function appendVideoTimelineClip(file) {
    recordTimelineHistory();
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
        mediaUrl: url,
        provider,
        sourceDuration: provider.duration,
        sourceOffset: 0,
        startTime: getVideoTimelineDuration(),
        muted: false,
        volume: 1,
      };

      videoTimelineClips.push(clip);
      selectTimelineClip("video", clip);
      updateTimelineEditableDuration();
      renderTrackPanel();

      startVideoTrackClipBuild(clip);
      refreshTimelineDurationViews();
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
    recordTimelineHistory();
    const url = URL.createObjectURL(file);
    const audio = new Audio(url);

    timelineObjectUrls.push(url);
    audio.loop = false;
    audio.preload = "auto";

    try {
      await waitForMediaReady(audio, "loadedmetadata", "audio");
    } catch (error) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      revokeTimelineObjectUrl(url);
      throw error;
    }

    const clip = {
      audioElement: audio,
      duration: Number.isFinite(audio.duration) ? audio.duration : 0,
      file,
      mediaUrl: url,
      sourceDuration: Number.isFinite(audio.duration) ? audio.duration : 0,
      sourceOffset: 0,
      startTime: getInsertionTime(),
      trackIndex: getNextTrackIndex(audioTimelineClips),
      muted: false,
      volume: 1,
    };

    audio.pause();
    audioTimelineClips.push(clip);
    selectTimelineClip("audio", clip);
    updateTimelineEditableDuration();
    renderTrackPanel();
    renderTimelineClipTracks();
    refreshTimelineDurationViews();
    syncTimelineAudio();
    statusText.textContent = "Audio added";

    void drawAudioSpectrum(clip).catch(() => {
      renderTimelineClipTracks();
      app.render();
    });
  }

  async function addImageTimelineClip(file) {
    recordTimelineHistory();
    const url = URL.createObjectURL(file);
    let texture = null;
    let imageElement = null;

    try {
      texture = await Assets.load({
        src: url,
        parser: "texture",
        data: { mime: file.type },
      });
      imageElement = await loadImageElement(url);
    } catch (error) {
      texture?.destroy(true);
      URL.revokeObjectURL(url);
      throw error;
    }

    const clip = {
      duration: IMAGE_CLIP_DEFAULT_DURATION,
      file,
      imageElement,
      mediaUrl: url,
      startTime: getInsertionTime(),
      texture,
      trackIndex: getNextTrackIndex(imageTimelineClips),
      transitionSeconds: OVERLAY_FADE_SECONDS,
      transitionType: OVERLAY_DEFAULT_TRANSITION_TYPE,
    };

    timelineObjectUrls.push(url);
    imageTimelineClips.push(clip);
    selectTimelineClip("image", clip);
    updateTimelineEditableDuration();
    renderTrackPanel();
    renderTimelineClipTracks();
    imagePositionInitialized = false;
    refreshTimelineDurationViews();
    statusText.textContent = "Image added";
  }

  function addTextTimelineClip() {
    if (currentKind !== "video" || !hasPrimaryVideoTrack()) {
      statusText.textContent = "Choose a video first";
      return;
    }

    const rect = getMediaSpriteRect();
    recordTimelineHistory();
    const startTime = getInsertionTime();
    const duration = TEXT_CLIP_DEFAULT_DURATION;
    const clip = {
      align: TEXT_CLIP_DEFAULT_ALIGN,
      backgroundAlpha: TEXT_CLIP_DEFAULT_BACKGROUND_ALPHA,
      backgroundColor: TEXT_CLIP_DEFAULT_BACKGROUND_COLOR,
      duration,
      fill: TEXT_CLIP_DEFAULT_COLOR,
      fontFamily: TEXT_CLIP_DEFAULT_FONT_FAMILY,
      fontSize: TEXT_CLIP_DEFAULT_FONT_SIZE,
      fontSizeReferenceHeight: TEXT_CLIP_FONT_REFERENCE_HEIGHT,
      fontStyle: "normal",
      fontWeight: TEXT_CLIP_DEFAULT_FONT_WEIGHT,
      lineHeight: TEXT_CLIP_DEFAULT_LINE_HEIGHT,
      shadowBlur: TEXT_CLIP_DEFAULT_SHADOW_BLUR,
      shadowColor: TEXT_CLIP_DEFAULT_SHADOW_COLOR,
      shadowDistance: TEXT_CLIP_DEFAULT_SHADOW_DISTANCE,
      startTime,
      strokeColor: TEXT_CLIP_DEFAULT_STROKE_COLOR,
      strokeWidth: TEXT_CLIP_DEFAULT_STROKE_WIDTH,
      text: TEXT_CLIP_DEFAULT_VALUE,
      trackIndex: getAvailableTextTrackIndex(startTime, duration),
      transitionSeconds: OVERLAY_FADE_SECONDS,
      transitionType: OVERLAY_DEFAULT_TRANSITION_TYPE,
      xRatio: 0.5,
      yRatio: getDefaultTextClipYRatio(rect),
    };

    textTimelineClips.push(clip);
    selectTimelineClip("text", clip);
    selectedTextClip = clip;
    updateTimelineEditableDuration();
    renderTrackPanel();
    renderTimelineClipTracks();
    updateTextOverlayPosition();
    refreshTimelineDurationViews();
    app.render();
    statusText.textContent = "Subtitle added";
  }

  function refreshTimelineDurationViews() {
    clearEditorTimelineRuler();
    drawTimeline();
    drawEditorTimeline();
    timelineApp.render();
  }

  function captureTimelineState() {
    return captureTimelineStateSnapshot({
      audioTimelineClips,
      editableDuration: timelineEditableDuration,
      imageTimelineClips,
      playbackTime,
      textTimelineClips,
      videoTimelineClips,
      zoom: TIMELINE_PIXELS_PER_SECOND,
    });
  }

  function recordTimelineHistory() {
    timelineUndoStack.push(captureTimelineState());
    if (timelineUndoStack.length > 80) {
      timelineUndoStack.shift();
    }
    timelineRedoStack = [];
  }

  function restoreTimelineState(state) {
    if (!state) {
      return;
    }

    timelineClipVisualStartTimes.clear();
    videoTimelineClips = (state.video || []).map((clip) =>
      cloneTimelineClipStateSnapshot("video", clip)
    );
    audioTimelineClips = (state.audio || []).map((clip) =>
      cloneTimelineClipStateSnapshot("audio", clip)
    );
    imageTimelineClips = (state.image || []).map((clip) =>
      cloneTimelineClipStateSnapshot("image", clip)
    );
    textTimelineClips = (state.text || []).map((clip) =>
      cloneTimelineClipStateSnapshot("text", clip)
    );
    TIMELINE_PIXELS_PER_SECOND = Math.min(
      Math.max(state.zoom || TIMELINE_PIXELS_PER_SECOND, TIMELINE_PIXELS_PER_SECOND_MIN),
      TIMELINE_PIXELS_PER_SECOND_MAX
    );
    timelineEditableDuration = Math.max(1, state.editableDuration || getTimelineContentDuration());
    playbackTime = Math.min(Math.max(state.playbackTime || 0, 0), getTimelineDuration());
    selectedTimelineClip = null;
    selectedTimelineClips = [];
    selectedImageClip = null;
    selectedTextClip = null;
    syncTimelineAudio();
    startVideoTrackBuild();
    renderTrackPanel();
    renderTimelineClipTracks();
    renderClipInspector();
    updateVideoTexture(true);
    updateImageOverlayPosition();
    updateTextOverlayPosition();
    exportButton.disabled =
      currentKind !== "video" || !currentVideoFile || videoTimelineClips.length === 0;
    refreshTimelineDurationViews();
  }

  function undoTimelineEdit() {
    const previousState = timelineUndoStack.pop();

    if (!previousState) {
      statusText.textContent = "Nothing to undo";
      return;
    }

    timelineRedoStack.push(captureTimelineState());
    restoreTimelineState(previousState);
    statusText.textContent = "Undo";
  }

  function redoTimelineEdit() {
    const nextState = timelineRedoStack.pop();

    if (!nextState) {
      statusText.textContent = "Nothing to redo";
      return;
    }

    timelineUndoStack.push(captureTimelineState());
    restoreTimelineState(nextState);
    statusText.textContent = "Redo";
  }

  function saveProjectState() {
    const state = captureTimelineState();
    const entry = {
      id: (savedProjectHistoryId += 1),
      savedAt: Date.now(),
      state,
    };

    savedProjectHistory = [entry, ...savedProjectHistory];
    renderProjectHistoryPanel();
    statusText.textContent = "Project saved";
  }

  function restoreProjectHistoryEntry(entryId) {
    const entry = savedProjectHistory.find((item) => item.id === entryId);

    if (!entry) {
      statusText.textContent = "History not found";
      return;
    }

    recordTimelineHistory();
    restoreTimelineState(entry.state);
    renderProjectHistoryPanel(entry.id);
    statusText.textContent = "Project restored";
  }

  function exportProjectHistoryEntry(entryId) {
    const entry = savedProjectHistory.find((item) => item.id === entryId);

    if (!entry) {
      statusText.textContent = "History not found";
      return;
    }

    downloadBlob(
      new Blob([JSON.stringify(createPortableProjectState(entry.state), null, 2)], {
        type: "application/json",
      }),
      `pixi-media-project-${formatProjectHistoryFileTime(entry.savedAt)}.json`
    );
    statusText.textContent = "Project metadata exported";
  }

  function renderProjectHistoryPanel(activeEntryId = null) {
    projectHistoryPanel.render(savedProjectHistory, activeEntryId);
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

  function getClipSourceDuration(clip) {
    const duration = Number.isFinite(clip?.sourceDuration) ? clip.sourceDuration : clip?.duration;

    return Math.max(0, Number.isFinite(duration) ? duration : 0);
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
    const leftControlsWidth = PREVIEW_PLAY_BUTTON_WIDTH + PREVIEW_CONTROL_GAP;

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
      PREVIEW_TIMECODE_SIDE_GAP * 2 +
      PREVIEW_CONTROL_GAP +
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
    return getPreviewTimelineX() + getPreviewTimelineWidth() + PREVIEW_TIMECODE_SIDE_GAP;
  }

  function getPreviewSplitButtonX() {
    return getPreviewTimecodeX() + PREVIEW_TIMECODE_WIDTH + PREVIEW_TIMECODE_SIDE_GAP;
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
    return (
      getVideoTrackY() + VIDEO_TRACK_HEIGHT + TRACK_ROW_GAP + trackIndex * getTrackPitch("audio")
    );
  }

  function getImageTrackY(trackIndex = 0) {
    return (
      getAudioTrackY(0) +
      getAudioTrackCount() * getTrackPitch("audio") +
      trackIndex * getTrackPitch("image")
    );
  }

  function getTextTrackY(trackIndex = 0) {
    return (
      getImageTrackY(0) +
      getImageTrackCount() * getTrackPitch("image") +
      trackIndex * getTrackPitch("text")
    );
  }

  function getTrackPitch(type = "audio") {
    return getTimelineClipHeight(type) + TRACK_ROW_GAP;
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
      if (isTrackMuted("video")) {
        clip.audioElement?.pause();
        continue;
      }
      syncClipMediaElement(
        clip.audioElement,
        clip.startTime,
        clip.duration,
        getClipSourceOffset(clip),
        clip
      );
    }

    for (const clip of audioTimelineClips) {
      if (isTrackMuted("audio")) {
        clip.audioElement?.pause();
        continue;
      }
      syncClipMediaElement(
        clip.audioElement,
        clip.startTime,
        clip.duration,
        getClipSourceOffset(clip),
        clip
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

  function syncClipMediaElement(element, startTime, duration, sourceOffset = 0, clip = null) {
    if (!element) {
      return;
    }

    const localTime = playbackTime - startTime;
    const shouldPlay =
      playbackPlaying && !clip?.muted && localTime >= 0 && localTime < duration && duration > 0;
    element.volume = Math.min(Math.max(Number(clip?.volume ?? 1), 0), 2);

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

  function getCurrentOverlayTransition(intervals, clip = null) {
    if (currentKind !== "video") {
      return { alpha: 0, axisScale: 0 };
    }

    return getOverlayTransitionAtTime(
      playbackTime,
      intervals,
      Number(clip?.transitionSeconds) >= 0 ? Number(clip.transitionSeconds) : OVERLAY_FADE_SECONDS,
      clip?.transitionType || OVERLAY_DEFAULT_TRANSITION_TYPE
    );
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
    const container = new Container();
    const textNode = new Text({
      text: clip.text || TEXT_CLIP_DEFAULT_VALUE,
      style: getSubtitleTextStyle(clip, rect),
    });
    const background = createSubtitleBackground(textNode, clip);

    textNode.anchor.set(0.5);
    container.addChild(background, textNode);
    container.position.set(
      rect.left + rect.width * clip.xRatio,
      rect.top + rect.height * clip.yRatio
    );
    container.eventMode = "static";
    container.cursor = textDragging && selectedTextClip === clip ? "grabbing" : "grab";
    container.timelineClip = clip;
    container.on("pointerdown", (event) => handleTextPointerDown(clip, event));
    clampTextClipToMediaRect(clip, container, rect, { persist: false });
    applyTextClipTransition(container, clip);
    const bounds = container.getLocalBounds();
    container.hitArea = new Rectangle(bounds.x, bounds.y, bounds.width, bounds.height);

    return container;
  }

  function createSubtitleBackground(textNode, clip) {
    const background = new Graphics();
    const alpha = Math.min(Math.max(Number(clip.backgroundAlpha) || 0, 0), 1);

    if (alpha <= 0 || !textNode.width || !textNode.height) {
      return background;
    }

    const paddingX = Math.max(6, textNode.style.fontSize * 0.45);
    const paddingY = Math.max(3, textNode.style.fontSize * 0.25);

    background
      .roundRect(
        -textNode.width / 2 - paddingX,
        -textNode.height / 2 - paddingY,
        textNode.width + paddingX * 2,
        textNode.height + paddingY * 2,
        4
      )
      .fill({
        color: parseHexColorNumber(clip.backgroundColor || TEXT_CLIP_DEFAULT_BACKGROUND_COLOR),
        alpha,
      });

    return background;
  }

  function applyTextClipTransition(textNode, clip) {
    const transition = getCurrentOverlayTransition(
      [{ duration: clip.duration, startTime: clip.startTime }],
      clip
    );

    textNode.alpha = transition.alpha;
    textNode.scale.x *= transition.axisScale;
    textNode.visible = transition.alpha > 0;
  }

  function getSubtitleTextStyle(clip, rect = getMediaSpriteRect()) {
    const wordWrapWidth = rect?.width || VIEW_WIDTH;
    const fontSize = getRenderedSubtitleFontSize(clip, rect);

    return {
      align: clip.align || TEXT_CLIP_DEFAULT_ALIGN,
      breakWords: true,
      fill: clip.fill || TEXT_CLIP_DEFAULT_COLOR,
      fontFamily: clip.fontFamily || TEXT_CLIP_DEFAULT_FONT_FAMILY,
      fontSize,
      fontStyle: clip.fontStyle || "normal",
      fontWeight: String(clip.fontWeight || TEXT_CLIP_DEFAULT_FONT_WEIGHT),
      lineHeight: Math.max(
        1,
        fontSize * (Number(clip.lineHeight) || TEXT_CLIP_DEFAULT_LINE_HEIGHT)
      ),
      dropShadow:
        Number(clip.shadowBlur) > 0 || Number(clip.shadowDistance) > 0
          ? {
              alpha: 0.82,
              blur: Math.max(0, Number(clip.shadowBlur) || 0),
              color: clip.shadowColor || TEXT_CLIP_DEFAULT_SHADOW_COLOR,
              distance: Math.max(0, Number(clip.shadowDistance) || 0),
            }
          : undefined,
      stroke:
        Number(clip.strokeWidth) > 0
          ? {
              color: clip.strokeColor || TEXT_CLIP_DEFAULT_STROKE_COLOR,
              width: Math.max(0, Number(clip.strokeWidth) || 0),
            }
          : undefined,
      wordWrap: true,
      wordWrapWidth: Math.max(1, wordWrapWidth),
    };
  }

  function getRenderedSubtitleFontSize(clip, rect = getMediaSpriteRect()) {
    const baseFontSize = Number(clip.fontSize) || TEXT_CLIP_DEFAULT_FONT_SIZE;
    const referenceHeight = TEXT_CLIP_FONT_REFERENCE_HEIGHT;

    if (!rect || referenceHeight <= 0) {
      return baseFontSize;
    }

    return Math.max(1, baseFontSize * (rect.height / referenceHeight));
  }

  function clampTextClipToMediaRect(
    clip,
    textNode = clip.overlayNode,
    rect = getMediaSpriteRect(),
    { persist = true } = {}
  ) {
    if (!rect || !textNode) {
      return;
    }

    const halfWidth = Math.min(rect.width / 2, textNode.width / 2);
    const halfHeight = Math.min(rect.height / 2, textNode.height / 2);
    const x = Math.min(Math.max(textNode.x, rect.left + halfWidth), rect.right - halfWidth);
    const y = Math.min(Math.max(textNode.y, rect.top + halfHeight), rect.bottom - halfHeight);

    textNode.position.set(x, y);
    if (persist) {
      clip.xRatio = (x - rect.left) / rect.width;
      clip.yRatio = (y - rect.top) / rect.height;
    }
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
    const transition = getCurrentOverlayTransition(
      [{ duration: activeClip.duration, startTime: activeClip.startTime }],
      activeClip
    );

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
    const texture = activeClip?.texture;
    const element = activeClip?.imageElement;
    const width = texture?.width || element?.naturalWidth || 1;
    const height = texture?.height || element?.naturalHeight || 1;

    return width / height;
  }

  function getImageClipFrame(clip, rect) {
    if (!clip.imageFrameRatio) {
      clip.imageFrameRatio = clip.imageFrame
        ? getImageFrameRatioFromFrame(clip.imageFrame, rect)
        : getDefaultImageFrameRatio(rect, clip);
    }

    return getImageFrameFromRatio(clip.imageFrameRatio, rect, clip);
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

  function getDefaultImageFrameRatio(rect, clip) {
    return getImageFrameRatioFromFrame(getDefaultImageFrame(rect, clip), rect);
  }

  function getImageFrameRatioFromFrame(frame, rect) {
    return {
      heightRatio: frame.height / rect.height,
      widthRatio: frame.width / rect.width,
      xRatio: (frame.x - rect.left) / rect.width,
      yRatio: (frame.y - rect.top) / rect.height,
    };
  }

  function getImageFrameFromRatio(ratio, rect, clip) {
    const aspectRatio = getOverlayImageAspectRatio(clip);
    const maxWidth = Math.min(rect.width, rect.height * aspectRatio);
    const widthRatio = Number(ratio?.widthRatio) || 0.5;
    const width = Math.min(Math.max(rect.width * widthRatio, 1), maxWidth);
    const height = width / aspectRatio;
    const x = rect.left + rect.width * (Number(ratio?.xRatio) || 0);
    const y = rect.top + rect.height * (Number(ratio?.yRatio) || 0);

    return {
      height,
      width,
      x: Math.min(Math.max(x, rect.left), rect.right - width),
      y: Math.min(Math.max(y, rect.top), rect.bottom - height),
    };
  }

  function saveActiveImageFrame() {
    const activeClip = getActiveImageTimelineClip();
    const rect = getMediaSpriteRect();

    if (!activeClip || !rect) {
      return;
    }

    activeClip.imageFrame = { ...imageFrame };
    activeClip.imageFrameRatio = getImageFrameRatioFromFrame(imageFrame, rect);
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
      const transition = getCurrentOverlayTransition(
        [{ duration: clip.duration, startTime: clip.startTime }],
        clip
      );

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
      return getPlaybackDuration() > 0;
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
      .circle(knobX, timelineY, TIMELINE_KNOB_SIZE / 2)
      .fill(0xffffff)
      .stroke({ color: 0x111111, alpha: 0.9, width: 2 });

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
    currentTimeText.style.fontFamily = TIME_TEXT_FONT_FAMILY;
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
    const halfIconSize = ICON_SIZE / 2;
    if (currentKind === "video" ? playbackPlaying : Boolean(mediaElement && !mediaElement.paused)) {
      const barWidth = 5;
      const barGap = 4;
      playPauseButtonIcon
        .rect(-barGap / 2 - barWidth, -halfIconSize, barWidth, ICON_SIZE)
        .fill(0xffffff);
      playPauseButtonIcon.rect(barGap / 2, -halfIconSize, barWidth, ICON_SIZE).fill(0xffffff);
    } else {
      playPauseButtonIcon
        .poly([-halfIconSize, -halfIconSize, -halfIconSize, halfIconSize, halfIconSize, 0], true)
        .fill(0xffffff);
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
    const halfIconSize = ICON_SIZE / 2;
    const strokeInset = 1;
    const chevronInset = ICON_GAP / 2;

    graphics
      .moveTo(cx, cy - halfIconSize + strokeInset)
      .lineTo(cx, cy + halfIconSize - strokeInset)
      .stroke({ color: 0xffffff, width: 2 });
    graphics
      .moveTo(cx - halfIconSize + strokeInset, cy - halfIconSize + 2)
      .lineTo(cx - chevronInset, cy)
      .lineTo(cx - halfIconSize + strokeInset, cy + halfIconSize - 2)
      .stroke({ color: 0xffffff, alpha: 0.82, width: 2 });
    graphics
      .moveTo(cx + halfIconSize - strokeInset, cy - halfIconSize + 2)
      .lineTo(cx + chevronInset, cy)
      .lineTo(cx + halfIconSize - strokeInset, cy + halfIconSize - 2)
      .stroke({ color: 0xffffff, alpha: 0.82, width: 2 });
  }

  function drawDeleteIcon(graphics) {
    const cx = PREVIEW_ACTION_BUTTON_WIDTH / 2;
    const cy = PREVIEW_CONTROL_HEIGHT / 2;
    const halfIconSize = ICON_SIZE / 2;

    graphics
      .moveTo(cx - halfIconSize + 1, cy - halfIconSize + 3)
      .lineTo(cx + halfIconSize - 1, cy - halfIconSize + 3)
      .stroke({ color: 0xffffff, width: 2 });
    graphics
      .moveTo(cx - 5, cy - halfIconSize)
      .lineTo(cx + 5, cy - halfIconSize)
      .stroke({ color: 0xffffff, width: 2 });
    graphics
      .rect(cx - 7, cy - halfIconSize + 5, 14, ICON_SIZE - 4)
      .stroke({ color: 0xffffff, width: 2 });
    graphics
      .moveTo(cx - 3, cy - 2)
      .lineTo(cx - 3, cy + halfIconSize - 2)
      .stroke({ color: 0xffffff, alpha: 0.75, width: 1 });
    graphics
      .moveTo(cx + 3, cy - 2)
      .lineTo(cx + 3, cy + halfIconSize - 2)
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
      .circle(timelineX, timelineY, TIMELINE_KNOB_SIZE / 2)
      .fill({ color: 0xffffff, alpha: 0.45 })
      .stroke({ color: 0x111111, alpha: 0.45, width: 2 });

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
      .fill({ color: 0x111827, alpha: 0.98 });
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

        child.x =
          getTimelineClipVisualStartTime(clip) * TIMELINE_PIXELS_PER_SECOND +
          frameIndex * frameWidth;
        child.width = Math.ceil(frameWidth) + 1;
      }

      child.y = y;
      child.height = VIDEO_THUMB_HEIGHT;
    }
  }

  function getTimelineClipVisualStartTime(clip) {
    return timelineClipVisualStartTimes.has(clip)
      ? timelineClipVisualStartTimes.get(clip)
      : clip.startTime;
  }

  function drawEditorTrackLabels() {
    editorTimelineTrackLabels.removeChildren().forEach((child) => child.destroy());
  }

  function addEditorTrackLabel(type, y) {
    const scrolledY = getScrolledTrackY(y);

    if (scrolledY < getTrackViewportTop() || scrolledY > getTrackViewportBottom()) {
      return;
    }

    const icon = createTrackTypeIcon(type);
    icon.position.set(EDITOR_PANEL_X + ICON_GAP + ICON_SIZE / 2, scrolledY);
    editorTimelineTrackLabels.addChild(icon);
  }

  function createTrackTypeIcon(type) {
    const graphics = new Graphics();
    const iconSize = ICON_SIZE;
    const halfIconSize = iconSize / 2;
    const lineColor = 0xcbd5e1;
    const lineWidth = 1.5;
    const edgeInset = lineWidth / 2;

    if (type === "video") {
      graphics
        .rect(edgeInset, edgeInset, iconSize - lineWidth, iconSize - lineWidth)
        .stroke({ color: lineColor, width: lineWidth });
      graphics
        .moveTo(halfIconSize, iconSize * 0.25)
        .lineTo(halfIconSize, iconSize * 0.75)
        .stroke({ color: lineColor, width: lineWidth });
      graphics
        .moveTo(iconSize * 0.25, halfIconSize)
        .lineTo(iconSize * 0.75, halfIconSize)
        .stroke({ color: lineColor, width: lineWidth });
    } else if (type === "audio") {
      graphics
        .moveTo(iconSize * 0.25, iconSize * 0.4)
        .bezierCurveTo(
          iconSize * 0.25,
          iconSize * 0.25,
          iconSize * 0.4,
          iconSize * 0.25,
          iconSize * 0.4,
          iconSize * 0.4
        )
        .stroke({ color: lineColor, width: lineWidth });
      graphics
        .moveTo(iconSize * 0.25, iconSize * 0.6)
        .bezierCurveTo(
          iconSize * 0.25,
          iconSize * 0.75,
          iconSize * 0.4,
          iconSize * 0.75,
          iconSize * 0.4,
          iconSize * 0.6
        )
        .stroke({ color: lineColor, width: lineWidth });
      graphics
        .moveTo(iconSize * 0.4, iconSize * 0.25)
        .lineTo(iconSize * 0.75, iconSize * 0.1)
        .lineTo(iconSize * 0.75, iconSize * 0.9)
        .lineTo(iconSize * 0.4, iconSize * 0.75)
        .stroke({ color: lineColor, width: lineWidth });
    } else if (type === "image") {
      graphics
        .rect(edgeInset, edgeInset, iconSize - lineWidth, iconSize - lineWidth)
        .stroke({ color: lineColor, width: lineWidth });
      graphics.circle(iconSize * 0.35, iconSize * 0.4, 2).fill({ color: lineColor });
      graphics
        .moveTo(edgeInset, iconSize * 0.8)
        .lineTo(halfIconSize, iconSize * 0.4)
        .lineTo(iconSize - edgeInset, iconSize * 0.7)
        .stroke({ color: lineColor, width: lineWidth });
    } else if (type === "text") {
      graphics
        .moveTo(iconSize * 0.2, iconSize * 0.3)
        .lineTo(iconSize * 0.8, iconSize * 0.3)
        .stroke({ color: lineColor, width: lineWidth });
      graphics
        .moveTo(iconSize * 0.2, halfIconSize)
        .lineTo(iconSize * 0.8, halfIconSize)
        .stroke({ color: lineColor, width: lineWidth });
      graphics
        .moveTo(iconSize * 0.2, iconSize * 0.7)
        .lineTo(iconSize * 0.6, iconSize * 0.7)
        .stroke({ color: lineColor, width: lineWidth });
    }

    graphics.pivot.set(halfIconSize, halfIconSize);
    return graphics;
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

  function cancelTimelineClipReleaseAnimation() {
    if (!timelineClipReleaseAnimationFrame) {
      return;
    }

    window.cancelAnimationFrame(timelineClipReleaseAnimationFrame);
    timelineClipReleaseAnimationFrame = 0;
    timelineClipVisualStartTimes.clear();
    layoutVideoTrackFrames();
  }

  function easeOutCubic(value) {
    const progress = Math.min(Math.max(value, 0), 1);

    return 1 - Math.pow(1 - progress, 3);
  }

  function animateTimelineClipRelease(
    clip,
    type,
    fromStartTime,
    fromTrackIndex,
    toStartTime,
    toTrackIndex
  ) {
    const container = clip.timelineContainer;

    if (!container || container.destroyed) {
      return;
    }

    const fromX = fromStartTime * TIMELINE_PIXELS_PER_SECOND;
    const fromY = getTimelineClipY(type, fromTrackIndex) + 2;
    const toX = toStartTime * TIMELINE_PIXELS_PER_SECOND;
    const toY = getTimelineClipY(type, toTrackIndex) + 2;

    if (Math.abs(fromX - toX) < 0.5 && Math.abs(fromY - toY) < 0.5) {
      return;
    }

    cancelTimelineClipReleaseAnimation();

    const startedAt = performance.now();
    container.position.set(fromX, fromY);

    const tick = (now) => {
      if (!clip.timelineContainer || clip.timelineContainer.destroyed) {
        timelineClipReleaseAnimationFrame = 0;
        timelineClipVisualStartTimes.delete(clip);
        return;
      }

      const progress = easeOutCubic((now - startedAt) / TIMELINE_CLIP_RELEASE_ANIMATION_MS);
      const visualStartTime = fromStartTime + (toStartTime - fromStartTime) * progress;

      if (type === "video") {
        timelineClipVisualStartTimes.set(clip, visualStartTime);
        layoutVideoTrackFrames();
      }

      clip.timelineContainer.position.set(
        visualStartTime * TIMELINE_PIXELS_PER_SECOND,
        fromY + (toY - fromY) * progress
      );
      timelineApp.render();

      if (progress < 1) {
        timelineClipReleaseAnimationFrame = window.requestAnimationFrame(tick);
        return;
      }

      timelineClipReleaseAnimationFrame = 0;
      timelineClipVisualStartTimes.delete(clip);
      if (type === "video") {
        layoutVideoTrackFrames();
      }
      clip.timelineContainer.position.set(toX, toY);
      timelineApp.render();
    };

    timelineClipReleaseAnimationFrame = window.requestAnimationFrame(tick);
  }

  function getTimelineTrackCountByType(type) {
    if (type === "video") {
      return 1;
    }

    if (type === "audio") {
      return getAudioTrackCount();
    }

    return type === "image" ? getImageTrackCount() : getTextTrackCount();
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
    const clipDuration = getClipsContentDuration([
      ...videoTimelineClips,
      ...audioTimelineClips,
      ...imageTimelineClips,
      ...textTimelineClips,
    ]);
    const mediaDuration =
      currentKind === "audio" && mediaElement && Number.isFinite(mediaElement.duration)
        ? mediaElement.duration
        : 0;

    return Math.max(mediaDuration, 1, clipDuration);
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

  function resizeCanvas() {
    maintainCanvasLayout();
    syncTimelinePanelHeightStyle();
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
    layoutActiveSubtitleEditInput();
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

  function syncTimelinePanelHeightStyle() {
    const bounds = getTimelinePanelHeightBounds();

    if (timelinePanelHeightPx !== null) {
      timelinePanelHeightPx = Math.min(Math.max(timelinePanelHeightPx, bounds.min), bounds.max);
      gameShell.style.setProperty("--media-timeline-height", `${timelinePanelHeightPx}px`);
    }

    updateTimelineSplitterAccessibility(timelinePanelHeightPx ?? bounds.min, bounds);
  }

  function getTimelinePanelHeightBounds() {
    const viewportHeight = Math.max(
      1,
      window.innerHeight || document.documentElement.clientHeight || VIEW_HEIGHT
    );
    const min = Math.round(viewportHeight * TIMELINE_PANEL_MIN_RATIO);
    const maxByRatio = Math.round(viewportHeight * TIMELINE_PANEL_MAX_RATIO);
    const maxByPreview = Math.max(
      min,
      viewportHeight - HEADER_HEIGHT - TIMELINE_SPLITTER_HEIGHT - PREVIEW_MIN_HEIGHT
    );

    return {
      max: Math.max(min, Math.min(maxByRatio, maxByPreview)),
      min,
    };
  }

  function clampTimelinePanelHeight(value) {
    const bounds = getTimelinePanelHeightBounds();
    const height = Number.isFinite(value) ? value : bounds.min;

    return Math.min(Math.max(height, bounds.min), bounds.max);
  }

  function applyTimelinePanelHeight(value) {
    timelinePanelHeightPx = clampTimelinePanelHeight(value);
    gameShell.style.setProperty("--media-timeline-height", `${timelinePanelHeightPx}px`);
    updateTimelineSplitterAccessibility(timelinePanelHeightPx);
    resizeCanvas();
  }

  function requestTimelinePanelHeight(value) {
    pendingTimelinePanelHeightPx = clampTimelinePanelHeight(value);

    if (timelinePanelResizeFrame) {
      return;
    }

    timelinePanelResizeFrame = window.requestAnimationFrame(() => {
      timelinePanelResizeFrame = 0;

      if (pendingTimelinePanelHeightPx === null) {
        return;
      }

      const nextHeight = pendingTimelinePanelHeightPx;

      pendingTimelinePanelHeightPx = null;
      applyTimelinePanelHeight(nextHeight);
    });
  }

  function flushPendingTimelinePanelHeight() {
    if (!timelinePanelResizeFrame && pendingTimelinePanelHeightPx === null) {
      return;
    }

    if (timelinePanelResizeFrame) {
      window.cancelAnimationFrame(timelinePanelResizeFrame);
      timelinePanelResizeFrame = 0;
    }

    const nextHeight = pendingTimelinePanelHeightPx;

    pendingTimelinePanelHeightPx = null;

    if (nextHeight !== null) {
      applyTimelinePanelHeight(nextHeight);
    }
  }

  function updateTimelineSplitterAccessibility(
    height = timelinePanelHeightPx ?? getTimelinePanelHeightBounds().min,
    bounds = getTimelinePanelHeightBounds()
  ) {
    timelineSplitter.setAttribute("aria-valuemin", String(Math.round(bounds.min)));
    timelineSplitter.setAttribute("aria-valuemax", String(Math.round(bounds.max)));
    timelineSplitter.setAttribute(
      "aria-valuenow",
      String(Math.round(Math.min(Math.max(height, bounds.min), bounds.max)))
    );
  }

  function handleTimelineSplitterPointerDown(event) {
    if (event.button !== undefined && event.button !== 0) {
      return;
    }

    const bounds = getTimelinePanelHeightBounds();

    event.preventDefault();
    timelinePanelResizeDrag = {
      pointerId: event.pointerId,
      startHeight: timelineCanvas.getBoundingClientRect().height || bounds.min,
      startY: event.clientY,
    };
    document.body.classList.add("media-timeline-resizing");
    timelineSplitter.setPointerCapture?.(event.pointerId);
    window.addEventListener("pointermove", handleTimelineSplitterPointerMove);
    window.addEventListener("pointerup", handleTimelineSplitterPointerUp);
    window.addEventListener("pointercancel", handleTimelineSplitterPointerUp);
  }

  function handleTimelineSplitterPointerMove(event) {
    if (!timelinePanelResizeDrag) {
      return;
    }

    event.preventDefault();
    requestTimelinePanelHeight(
      timelinePanelResizeDrag.startHeight + timelinePanelResizeDrag.startY - event.clientY
    );
  }

  function handleTimelineSplitterPointerUp(event) {
    if (!timelinePanelResizeDrag) {
      return;
    }

    if (event) {
      requestTimelinePanelHeight(
        timelinePanelResizeDrag.startHeight + timelinePanelResizeDrag.startY - event.clientY
      );
    }

    timelineSplitter.releasePointerCapture?.(timelinePanelResizeDrag.pointerId);
    timelinePanelResizeDrag = null;
    document.body.classList.remove("media-timeline-resizing");
    window.removeEventListener("pointermove", handleTimelineSplitterPointerMove);
    window.removeEventListener("pointerup", handleTimelineSplitterPointerUp);
    window.removeEventListener("pointercancel", handleTimelineSplitterPointerUp);

    flushPendingTimelinePanelHeight();
  }

  function handleTimelineSplitterKeyDown(event) {
    const bounds = getTimelinePanelHeightBounds();
    const currentHeight = timelinePanelHeightPx ?? timelineCanvas.getBoundingClientRect().height;
    const step = event.shiftKey ? 80 : 24;
    let nextHeight = currentHeight;

    if (event.key === "ArrowUp") {
      nextHeight = currentHeight + step;
    } else if (event.key === "ArrowDown") {
      nextHeight = currentHeight - step;
    } else if (event.key === "Home") {
      nextHeight = bounds.min;
    } else if (event.key === "End") {
      nextHeight = bounds.max;
    } else {
      return;
    }

    event.preventDefault();
    applyTimelinePanelHeight(nextHeight);
  }

  function handleTimelineClipPointerDown(
    type,
    clip,
    event,
    targetContainer = null,
    forcedMode = null
  ) {
    suppressNextCanvasToggle = true;
    cancelTimelineClipReleaseAnimation();

    if (isTrackLocked(type)) {
      statusText.textContent = "Track locked";
      event.stopPropagation();
      return;
    }

    if (event.button !== undefined && event.button !== 0) {
      cancelPendingTimelineClipDragFrame();
      timelineClipDrag = null;
      selectTimelineClip(type, clip, {
        additive: event.metaKey || event.ctrlKey || event.shiftKey,
      });
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

    selectTimelineClip(type, clip, { additive: event.metaKey || event.ctrlKey || event.shiftKey });

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
      type === "text" ? getTextTrackCount() : Math.max(0, getTimelineTrackCountByType(type) - 1);

    timelineClipDrag = {
      clip,
      dragStarted: false,
      lastTimelineDuration: getTimelineDuration(),
      maxTargetTrackIndex,
      moveBounds,
      mode,
      originalDuration: clip.duration,
      originalSourceOffset: getClipSourceOffset(clip),
      originalStartTime: clip.startTime,
      pointerStartGlobal: { x: event.global.x, y: event.global.y },
      pointerOffsetSeconds: local.x / TIMELINE_PIXELS_PER_SECOND - clip.startTime,
      targetContainer: targetContainer || clip.timelineContainer,
      targetStartTime: clip.startTime,
      targetTrackIndex: originalTrackIndex,
      timelineDuration,
      type,
    };
    statusText.textContent = "Clip selected";
    event.stopPropagation();
  }

  function handleTimelineClipPointerMove(event) {
    if (!timelineClipDrag) {
      return;
    }

    pendingTimelineClipDragEvent = {
      altKey: event.altKey,
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

    if (!timelineClipDrag.dragStarted && !hasTimelineClipDragMoved(event)) {
      timelineClipDrag = null;
      renderTimelineClipTracks();
      drawEditorTimeline();
      renderClipInspector();
      statusText.textContent = "Clip selected";
      app.render();
      event.stopPropagation();
      return;
    }

    updateTimelineClipDrag(event);

    const { clip, mode, targetStartTime, targetTrackIndex, type } = timelineClipDrag;
    const previewStartTime = targetStartTime;
    const previewTrackIndex = targetTrackIndex;
    let resolvedStartTime = targetStartTime;
    let resolvedTrackIndex = targetTrackIndex;
    let movedToResolvedPosition = false;

    if (mode === "move") {
      resolvedStartTime = getTimelineClipFollowStartTime(
        type,
        clip,
        targetTrackIndex,
        targetStartTime
      );
      movedToResolvedPosition =
        Math.abs(resolvedStartTime - targetStartTime) > TRACK_OVERLAP_EPSILON ||
        resolvedTrackIndex !== targetTrackIndex;
      clip.startTime = resolvedStartTime;
      clip.trackIndex = resolvedTrackIndex;

      if (type === "video") {
        normalizeVideoTimelineClips();
        resolvedStartTime = clip.startTime;
        resolvedTrackIndex = getClipTrackIndex(clip);
        movedToResolvedPosition =
          Math.abs(resolvedStartTime - previewStartTime) > TRACK_OVERLAP_EPSILON ||
          resolvedTrackIndex !== previewTrackIndex;
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
    if (mode === "move" && movedToResolvedPosition) {
      animateTimelineClipRelease(
        clip,
        type,
        previewStartTime,
        previewTrackIndex,
        resolvedStartTime,
        resolvedTrackIndex
      );
    } else if (mode === "move") {
      timelineClipVisualStartTimes.delete(clip);
      if (type === "video") {
        layoutVideoTrackFrames();
      }
    }
    statusText.textContent = movedToResolvedPosition
      ? "Clip moved to available position"
      : "Paused";
    app.render();
    event.stopPropagation();
  }

  function updateTimelineClipDrag(event) {
    if (!timelineClipDrag) {
      return;
    }

    if (!timelineClipDrag.dragStarted) {
      if (!hasTimelineClipDragMoved(event)) {
        return;
      }

      timelineClipDrag.dragStarted = true;
      recordTimelineHistory();
    }

    const { clip, mode, type } = timelineClipDrag;
    const previousDuration = timelineClipDrag.lastTimelineDuration ?? getTimelineDuration();
    const target =
      mode === "move" ? getTimelineClipDragTarget(event) : getTimelineClipTrimTarget(event);

    if (mode === "move") {
      timelineClipDrag.targetStartTime = target.startTime;
      timelineClipDrag.targetTrackIndex = target.trackIndex;
      if (type === "video") {
        timelineClipVisualStartTimes.set(clip, target.startTime);
      }
    } else {
      clip.startTime = target.startTime;
      clip.duration = target.duration;
      clip.sourceOffset = target.sourceOffset;
      timelineClipDrag.targetStartTime = target.startTime;
      timelineClipDrag.targetTrackIndex = getClipTrackIndex(clip);
      if (type === "video") {
        timelineClipVisualStartTimes.delete(clip);
      }
    }

    const durationChanged = updateTimelineEditableDuration(previousDuration);

    timelineClipDrag.lastTimelineDuration = getTimelineDuration();
    timelineClipDrag.timelineDuration = Math.max(
      timelineClipDrag.timelineDuration,
      getTimelineDuration() + (mode === "move" ? TIMELINE_DRAG_EXTENSION_SECONDS : 0)
    );
    updateTimelineClipDragPreview();
    renderClipInspector();

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

  function hasTimelineClipDragMoved(event) {
    if (!timelineClipDrag || !event?.global || !timelineClipDrag.pointerStartGlobal) {
      return false;
    }

    const dx = event.global.x - timelineClipDrag.pointerStartGlobal.x;
    const dy = event.global.y - timelineClipDrag.pointerStartGlobal.y;

    return Math.hypot(dx, dy) >= TIMELINE_CLIP_DRAG_THRESHOLD;
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
    const rawStartTime = Math.min(
      Math.max(local.x / TIMELINE_PIXELS_PER_SECOND - pointerOffsetSeconds, minStartTime),
      maxStartTime
    );
    const trackIndex = getTimelineTrackIndexFromY(type, local.y, maxTargetTrackIndex);
    const startTime = event.altKey
      ? rawStartTime
      : Math.min(
          Math.max(getSnappedTimelineTime(rawStartTime, { clip, type, trackIndex }), minStartTime),
          maxStartTime
        );

    return {
      startTime,
      trackIndex,
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
      const rawStartTime = Math.min(
        Math.max(pointerTime, minStartTime, neighborBounds.previousEnd),
        maxStartTime
      );
      const startTime = event.altKey
        ? rawStartTime
        : Math.min(
            Math.max(
              getSnappedTimelineTime(rawStartTime, {
                clip,
                type,
                trackIndex: getClipTrackIndex(clip),
              }),
              minStartTime,
              neighborBounds.previousEnd
            ),
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
    const rawEndTime = Math.min(
      Math.max(pointerTime, minEndTime),
      maxEndTime,
      neighborBounds.nextStart
    );
    const endTime = event.altKey
      ? rawEndTime
      : Math.min(
          Math.max(
            getSnappedTimelineTime(rawEndTime, {
              clip,
              type,
              trackIndex: getClipTrackIndex(clip),
            }),
            minEndTime
          ),
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

  function getSnappedTimelineTime(time, { clip, type, trackIndex }) {
    const threshold = Math.max(0.05, 8 / TIMELINE_PIXELS_PER_SECOND);
    const candidates = [
      playbackTime,
      Math.round(time),
      Math.round(time * 2) / 2,
      ...getTimelineClipsByType(type).flatMap((candidate) => {
        if (candidate === clip || getClipTrackIndex(candidate) !== trackIndex) {
          return [];
        }

        return [candidate.startTime, candidate.startTime + candidate.duration];
      }),
    ];
    let snappedTime = time;
    let bestDistance = threshold;

    for (const candidate of candidates) {
      const distance = Math.abs(candidate - time);

      if (distance <= bestDistance) {
        snappedTime = candidate;
        bestDistance = distance;
      }
    }

    return Math.max(0, snappedTime);
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

  function isTrackLocked(type) {
    return Boolean(trackControlState[type]?.locked);
  }

  function isTrackHidden(type) {
    return Boolean(trackControlState[type]?.hidden);
  }

  function isTrackMuted(type) {
    return Boolean(trackControlState[type]?.muted);
  }

  function getTrackTypeLabel(type) {
    if (type === "video") {
      return "视频";
    }
    if (type === "audio") {
      return "音频";
    }
    if (type === "image") {
      return "图片";
    }
    return "文字";
  }

  function isSelectedTimelineClip(type, clip) {
    return selectedTimelineClips.some(
      (selected) => selected.type === type && selected.clip === clip
    );
  }

  function selectTimelineClip(type, clip, { additive = false } = {}) {
    if (!clip || !getTimelineClipsByType(type).includes(clip)) {
      selectedTimelineClip = null;
      selectedTimelineClips = [];
      renderClipInspector();
      return;
    }

    if (additive) {
      const existingIndex = selectedTimelineClips.findIndex(
        (selected) => selected.type === type && selected.clip === clip
      );

      if (existingIndex >= 0) {
        selectedTimelineClips.splice(existingIndex, 1);
      } else {
        selectedTimelineClips.push({ clip, type });
      }

      selectedTimelineClip = selectedTimelineClips[selectedTimelineClips.length - 1] || null;
    } else {
      selectedTimelineClips = [{ clip, type }];
      selectedTimelineClip = { clip, type };
    }

    if (type === "image") {
      selectedImageClip = clip;
    } else if (type === "text") {
      selectedTextClip = clip;
      syncSubtitleStyleControls(clip);
      renderSubtitlePanel();
    }

    renderClipInspector();
  }

  function renderClipInspector() {
    const selected = getSelectedTimelineClip();

    clipAllSettingNodes.forEach((node) => {
      node.remove();
    });

    if (!selected) {
      clipInspectorTitle.textContent = "Clip 设置";
      return;
    }

    const { clip, type } = selected;
    const isAudioCapable = type === "video" || type === "audio";
    const isOverlay = type === "image" || type === "text";
    const isText = type === "text";

    clipInspectorTitle.textContent = `${getTrackTypeLabel(type)} Clip 设置`;
    clipInspector.append(...clipTimingLabels);

    if (isAudioCapable) {
      clipInspector.append(...clipAudioLabels);
    }

    if (isOverlay) {
      clipInspector.append(...clipOverlayLabels);
    }

    if (isText) {
      clipInspector.append(clipTextLabel, ...clipSubtitleStyleLabels);
    }

    const previewStartTime =
      timelineClipDrag?.clip === clip && timelineClipDrag.dragStarted
        ? timelineClipDrag.targetStartTime
        : clip.startTime;
    const previewDuration = clip.duration;

    clipStartInput.value = formatNumberInputValue(previewStartTime);
    clipDurationInput.value = formatNumberInputValue(previewDuration);
    clipEndInput.value = formatNumberInputValue(previewStartTime + previewDuration);
    clipTextInput.value = clip.text || TEXT_CLIP_DEFAULT_VALUE;
    clipVolumeInput.disabled = !isAudioCapable;
    clipMutedInput.disabled = !isAudioCapable;
    clipTransitionSelect.disabled = !isOverlay;
    clipTransitionDurationInput.disabled = !isOverlay;
    clipVolumeInput.value = String(
      Math.round(Math.min(Math.max(Number(clip.volume ?? 1), 0), 2) * 100)
    );
    clipMutedInput.checked = Boolean(clip.muted);
    clipTransitionSelect.value = clip.transitionType || OVERLAY_DEFAULT_TRANSITION_TYPE;
    clipTransitionDurationInput.value = String(
      Number(clip.transitionSeconds) >= 0 ? Number(clip.transitionSeconds) : OVERLAY_FADE_SECONDS
    );
    if (isText) {
      syncClipSubtitleStyleControls(clip);
    }
  }

  function handleClipInspectorChange(event) {
    const selected = getSelectedTimelineClip();

    if (!selected) {
      return;
    }

    const { clip, type } = selected;
    const previousStart = clip.startTime;
    const previousDuration = clip.duration;
    const input = event?.target;
    const nextStart = Math.max(0, Number(clipStartInput.value) || 0);
    const requestedDuration =
      input === clipEndInput
        ? (Number(clipEndInput.value) || nextStart) - nextStart
        : Number(clipDurationInput.value) || previousDuration;
    const sourceDuration = getClipSourceDuration(clip);
    const maxDuration =
      type === "video" || type === "audio"
        ? Math.max(CLIP_MIN_DURATION, sourceDuration - getClipSourceOffset(clip))
        : Number.POSITIVE_INFINITY;
    const nextDuration = Math.min(Math.max(CLIP_MIN_DURATION, requestedDuration), maxDuration);
    const trackIndex = getClipTrackIndex(clip);

    if (
      (Math.abs(nextStart - previousStart) > TRACK_OVERLAP_EPSILON ||
        Math.abs(nextDuration - previousDuration) > TRACK_OVERLAP_EPSILON) &&
      hasTimelineClipOverlap(type, clip, trackIndex, nextStart, nextDuration)
    ) {
      clipStartInput.value = formatNumberInputValue(previousStart);
      clipDurationInput.value = formatNumberInputValue(previousDuration);
      clipEndInput.value = formatNumberInputValue(previousStart + previousDuration);
      statusText.textContent = "Clip timing overlaps";
      return;
    }

    recordTimelineHistory();
    clip.startTime = nextStart;
    clip.duration = nextDuration;

    if (type === "video" || type === "audio") {
      clip.volume = Math.min(Math.max((Number(clipVolumeInput.value) || 0) / 100, 0), 2);
      clip.muted = Boolean(clipMutedInput.checked);
      syncTimelineAudio();
    }

    if (type === "image" || type === "text") {
      clip.transitionType = clipTransitionSelect.value || OVERLAY_DEFAULT_TRANSITION_TYPE;
      clip.transitionSeconds = Math.min(
        Math.max(Number(clipTransitionDurationInput.value) || 0, 0),
        5
      );
      updateImageOverlayPosition();
      updateTextOverlayPosition();
    }

    if (type === "text") {
      clip.text = clipTextInput.value || TEXT_CLIP_DEFAULT_VALUE;
      applyClipSubtitleStyleControlsToClip(clip);
      syncSubtitleStyleControls(clip);
      renderSubtitlePanel();
    }

    refreshTimelineAfterClipEdit(type, { rebuildVideo: type === "video" });
    renderClipInspector();
    statusText.textContent = "Clip updated";
  }

  function syncClipSubtitleStyleControls(clip) {
    clipSubtitleColorInput.value = normalizeHexColor(clip.fill || TEXT_CLIP_DEFAULT_COLOR);
    clipSubtitleSizeInput.value = String(Number(clip.fontSize) || TEXT_CLIP_DEFAULT_FONT_SIZE);
    clipSubtitleWeightSelect.value = String(clip.fontWeight || TEXT_CLIP_DEFAULT_FONT_WEIGHT);
    clipSubtitleFontSelect.value = clip.fontFamily || TEXT_CLIP_DEFAULT_FONT_FAMILY;
    clipSubtitleAlignSelect.value = clip.align || TEXT_CLIP_DEFAULT_ALIGN;
    clipSubtitleLineHeightInput.value = String(
      Number(clip.lineHeight) || TEXT_CLIP_DEFAULT_LINE_HEIGHT
    );
    clipSubtitleStrokeColorInput.value = normalizeHexColor(
      clip.strokeColor || TEXT_CLIP_DEFAULT_STROKE_COLOR,
      TEXT_CLIP_DEFAULT_STROKE_COLOR
    );
    clipSubtitleStrokeWidthInput.value = String(
      Math.max(0, Number(clip.strokeWidth) || TEXT_CLIP_DEFAULT_STROKE_WIDTH)
    );
    clipSubtitleShadowColorInput.value = normalizeHexColor(
      clip.shadowColor || TEXT_CLIP_DEFAULT_SHADOW_COLOR,
      TEXT_CLIP_DEFAULT_SHADOW_COLOR
    );
    clipSubtitleShadowBlurInput.value = String(
      Math.max(0, Number(clip.shadowBlur) || TEXT_CLIP_DEFAULT_SHADOW_BLUR)
    );
    clipSubtitleShadowDistanceInput.value = String(
      Math.max(0, Number(clip.shadowDistance) || TEXT_CLIP_DEFAULT_SHADOW_DISTANCE)
    );
    clipSubtitleBackgroundColorInput.value = normalizeHexColor(
      clip.backgroundColor || TEXT_CLIP_DEFAULT_BACKGROUND_COLOR,
      TEXT_CLIP_DEFAULT_BACKGROUND_COLOR
    );
    clipSubtitleBackgroundAlphaInput.value = String(
      Math.min(Math.max(Number(clip.backgroundAlpha) || TEXT_CLIP_DEFAULT_BACKGROUND_ALPHA, 0), 1)
    );
  }

  function applyClipSubtitleStyleControlsToClip(clip) {
    Object.assign(clip, {
      align: clipSubtitleAlignSelect.value || TEXT_CLIP_DEFAULT_ALIGN,
      backgroundAlpha: Math.min(
        Math.max(Number(clipSubtitleBackgroundAlphaInput.value) || 0, 0),
        1
      ),
      backgroundColor: clipSubtitleBackgroundColorInput.value || TEXT_CLIP_DEFAULT_BACKGROUND_COLOR,
      fill: clipSubtitleColorInput.value || TEXT_CLIP_DEFAULT_COLOR,
      fontFamily: clipSubtitleFontSelect.value || TEXT_CLIP_DEFAULT_FONT_FAMILY,
      fontSize: Math.min(
        Math.max(Number(clipSubtitleSizeInput.value) || TEXT_CLIP_DEFAULT_FONT_SIZE, 8),
        96
      ),
      fontSizeReferenceHeight: TEXT_CLIP_FONT_REFERENCE_HEIGHT,
      fontWeight: clipSubtitleWeightSelect.value || TEXT_CLIP_DEFAULT_FONT_WEIGHT,
      lineHeight: Math.min(
        Math.max(Number(clipSubtitleLineHeightInput.value) || TEXT_CLIP_DEFAULT_LINE_HEIGHT, 0.8),
        3
      ),
      shadowBlur: Math.min(Math.max(Number(clipSubtitleShadowBlurInput.value) || 0, 0), 40),
      shadowColor: clipSubtitleShadowColorInput.value || TEXT_CLIP_DEFAULT_SHADOW_COLOR,
      shadowDistance: Math.min(Math.max(Number(clipSubtitleShadowDistanceInput.value) || 0, 0), 40),
      strokeColor: clipSubtitleStrokeColorInput.value || TEXT_CLIP_DEFAULT_STROKE_COLOR,
      strokeWidth: Math.min(Math.max(Number(clipSubtitleStrokeWidthInput.value) || 0, 0), 20),
    });
  }

  function handleClipSubtitleApplyAll() {
    const selected = getSelectedTimelineClip();

    if (!selected || selected.type !== "text") {
      return;
    }

    recordTimelineHistory();
    applyClipSubtitleStyleControlsToClip(selected.clip);
    const style = getSubtitleStyleSnapshot(selected.clip);

    textTimelineClips.forEach((clip) => {
      Object.assign(clip, style);
    });
    refreshTimelineAfterClipEdit("text");
    renderClipInspector();
    renderSubtitlePanel();
    statusText.textContent = "Subtitle style applied";
  }

  function handleTrackControlChange(event) {
    const input = event.target;

    if (!(input instanceof HTMLInputElement)) {
      return;
    }

    const type = input.dataset.trackType;
    const key = input.dataset.trackKey;

    if (!trackControlState[type] || !key) {
      return;
    }

    trackControlState[type][key] = input.checked;
    if (key === "muted") {
      syncTimelineAudio();
    }
    if (key === "hidden") {
      updateImageOverlayPosition();
      updateTextOverlayPosition();
    }
    renderTimelineClipTracks();
    drawEditorTimeline();
    app.render();
  }

  function renderTrackPanel() {
    trackPanelControls.renderRows(getVisibleTrackPanelTypes(), trackControlState, getTrackTypeLabel);
  }

  function getVisibleTrackPanelTypes() {
    return ["video", "audio", "image", "text"].filter((type) => {
      if (type === "video") {
        return currentKind === "video" || videoTimelineClips.length > 0;
      }
      if (type === "audio") {
        return currentKind === "audio" || audioTimelineClips.length > 0;
      }
      if (type === "image") {
        return currentKind === "image" || imageTimelineClips.length > 0;
      }

      return textTimelineClips.length > 0;
    });
  }

  function handleSidePanelToggle() {
    const collapsed = sidePanel.classList.toggle("is-collapsed");

    document.body.classList.toggle("media-side-panel-collapsed", collapsed);
    sidePanelToggle.textContent = collapsed ? "›" : "‹";
    sidePanelToggle.ariaLabel = collapsed ? "展开侧边面板" : "折叠侧边面板";
    requestLayoutResize();
  }

  function requestLayoutResize() {
    window.requestAnimationFrame(() => {
      resizeCanvas();
      window.setTimeout(resizeCanvas, 180);
    });
  }

  function hasTimelineClipOverlap(type, movingClip, trackIndex, startTime, duration = null) {
    const clipDuration =
      duration === null
        ? Math.max(0, Number.isFinite(movingClip?.duration) ? movingClip.duration : 0)
        : duration;

    return hasClipOverlap(
      getTimelineClipsByType(type),
      movingClip,
      trackIndex,
      startTime,
      clipDuration,
      TRACK_OVERLAP_EPSILON
    );
  }

  function seekFromPointer(event, { forceFrame = false } = {}) {
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
      setTimelinePlaybackTime(progress * duration, forceFrame);
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

    seekFromPointer(event, { forceFrame: true });
  }

  async function handleTimelinePointerUp(event) {
    if (!isSeeking) {
      return;
    }

    seekFromPointer(event, { forceFrame: true });
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
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      setTimelineHorizontalZoom(event.deltaY < 0 ? 1.15 : 1 / 1.15);
      return;
    }

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

  function setTimelineHorizontalZoom(multiplier) {
    const nextValue = Math.min(
      Math.max(TIMELINE_PIXELS_PER_SECOND * multiplier, TIMELINE_PIXELS_PER_SECOND_MIN),
      TIMELINE_PIXELS_PER_SECOND_MAX
    );

    if (Math.abs(nextValue - TIMELINE_PIXELS_PER_SECOND) < 0.001) {
      return;
    }

    recordTimelineHistory();
    TIMELINE_PIXELS_PER_SECOND = nextValue;
    renderTimelineClipTracks();
    startVideoTrackBuild();
    refreshTimelineDurationViews();
    statusText.textContent = `Timeline zoom ${Math.round(TIMELINE_PIXELS_PER_SECOND)}px/s`;
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

    recordTimelineHistory();
    const selectedItems =
      selectedTimelineClips.length > 0 ? [...selectedTimelineClips] : [{ ...selected }];

    selectedItems.forEach((item) => removeTimelineClip(item.type, item.clip, { dispose: false }));
    selectedTimelineClip = null;
    selectedTimelineClips = [];
    renderClipInspector();
    if (selected.type === "image" && selectedImageClip === selected.clip) {
      selectedImageClip = null;
    } else if (selected.type === "text" && selectedTextClip === selected.clip) {
      selectedTextClip = null;
      hideSubtitleContextMenu();
      finishSubtitleEditing({ commit: false });
    }

    refreshTimelineAfterClipEdit(selected.type, {
      rebuildVideo: selectedItems.some((item) => item.type === "video"),
    });
    exportButton.disabled =
      currentKind !== "video" || !currentVideoFile || videoTimelineClips.length === 0;
    statusText.textContent = selectedItems.length > 1 ? "Clips deleted" : "Clip deleted";
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
    recordTimelineHistory();

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

  function copySelectedTimelineClips() {
    const selectedItems =
      selectedTimelineClips.length > 0
        ? [...selectedTimelineClips]
        : selectedTimelineClip
          ? [selectedTimelineClip]
          : [];

    timelineClipboard = selectedItems.filter((item) =>
      getTimelineClipsByType(item.type).includes(item.clip)
    );
    statusText.textContent =
      timelineClipboard.length > 0
        ? `${timelineClipboard.length} clip copied`
        : "Select a clip first";
  }

  async function pasteTimelineClipboard() {
    if (timelineClipboard.length === 0 || currentKind !== "video") {
      statusText.textContent = "No clips to paste";
      return;
    }

    const sourceItems = [...timelineClipboard];
    const baseStartTime = Math.min(...sourceItems.map((item) => item.clip.startTime));
    const pastedItems = [];

    statusText.textContent = "Pasting clips";
    recordTimelineHistory();

    try {
      for (const item of sourceItems) {
        const startTime = getInsertionTime() + item.clip.startTime - baseStartTime;
        const clip = await cloneTimelineClipForPaste(item.type, item.clip, startTime);

        getTimelineClipsByType(item.type).push(clip);
        pastedItems.push({ clip, type: item.type });
      }

      selectedTimelineClips = pastedItems;
      selectedTimelineClip = pastedItems[pastedItems.length - 1] || null;
      if (selectedTimelineClip?.type === "text") {
        selectedTextClip = selectedTimelineClip.clip;
      } else if (selectedTimelineClip?.type === "image") {
        selectedImageClip = selectedTimelineClip.clip;
      }
      refreshTimelineAfterClipEdit("video", {
        rebuildVideo: pastedItems.some((item) => item.type === "video"),
      });
      statusText.textContent = `${pastedItems.length} clip pasted`;
    } catch (error) {
      statusText.textContent = error instanceof Error ? error.message : "Paste failed";
    }
  }

  async function cloneTimelineClipForPaste(type, sourceClip, startTime) {
    const baseClip = {
      duration: sourceClip.duration,
      sourceDuration: sourceClip.sourceDuration,
      sourceOffset: getClipSourceOffset(sourceClip),
      startTime,
      trackIndex:
        type === "text"
          ? getAvailableTextTrackIndex(startTime, sourceClip.duration)
          : getNextTrackIndex(getTimelineClipsByType(type)),
    };

    if (type === "video") {
      const provider = await createMediabunnyVideoFrameProvider(sourceClip.file);
      const audioElement = await createTimelineMediaElement("video", sourceClip.file);

      return {
        ...baseClip,
        audioElement,
        file: sourceClip.file,
        mediaUrl: audioElement.__timelineObjectUrl,
        muted: Boolean(sourceClip.muted),
        provider,
        volume: sourceClip.volume ?? 1,
      };
    }

    if (type === "audio") {
      const audioElement = await createTimelineMediaElement("audio", sourceClip.file);

      return {
        ...baseClip,
        audioElement,
        file: sourceClip.file,
        mediaUrl: audioElement.__timelineObjectUrl,
        muted: Boolean(sourceClip.muted),
        samples: sourceClip.samples,
        volume: sourceClip.volume ?? 1,
      };
    }

    if (type === "image") {
      return {
        ...sourceClip,
        duration: sourceClip.duration,
        imageFrame: sourceClip.imageFrame ? { ...sourceClip.imageFrame } : undefined,
        imageFrameRatio: sourceClip.imageFrameRatio ? { ...sourceClip.imageFrameRatio } : undefined,
        startTime,
        trackIndex: getNextTrackIndex(imageTimelineClips),
      };
    }

    return {
      ...sourceClip,
      duration: sourceClip.duration,
      startTime,
      trackIndex: getAvailableTextTrackIndex(startTime, sourceClip.duration),
    };
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
      const audioElement = await createTimelineMediaElement("video", clip.file);

      return {
        ...baseClip,
        audioElement,
        mediaUrl: audioElement.__timelineObjectUrl,
        provider: clip.provider,
      };
    }

    if (type === "audio") {
      const audioElement = await createTimelineMediaElement("audio", clip.file);

      return {
        ...baseClip,
        audioElement,
        mediaUrl: audioElement.__timelineObjectUrl,
        samples: clip.samples,
      };
    }

    if (type === "text") {
      return {
        ...baseClip,
        align: clip.align,
        backgroundAlpha: clip.backgroundAlpha,
        backgroundColor: clip.backgroundColor,
        text: clip.text,
        fill: clip.fill,
        fontFamily: clip.fontFamily,
        fontSize: clip.fontSize,
        fontSizeReferenceHeight: TEXT_CLIP_FONT_REFERENCE_HEIGHT,
        fontStyle: clip.fontStyle,
        fontWeight: clip.fontWeight,
        lineHeight: clip.lineHeight,
        shadowBlur: clip.shadowBlur,
        shadowColor: clip.shadowColor,
        shadowDistance: clip.shadowDistance,
        strokeColor: clip.strokeColor,
        strokeWidth: clip.strokeWidth,
        transitionSeconds: clip.transitionSeconds,
        transitionType: clip.transitionType,
        xRatio: clip.xRatio,
        yRatio: clip.yRatio,
      };
    }

    return {
      ...baseClip,
      imageFrame: clip.imageFrame ? { ...clip.imageFrame } : undefined,
      imageFrameRatio: clip.imageFrameRatio ? { ...clip.imageFrameRatio } : undefined,
      transitionSeconds: clip.transitionSeconds,
      transitionType: clip.transitionType,
    };
  }

  async function createTimelineMediaElement(type, file) {
    const url = URL.createObjectURL(file);
    const element = type === "video" ? document.createElement("video") : new Audio();

    timelineObjectUrls.push(url);
    element.__timelineObjectUrl = url;
    element.loop = false;
    element.preload = "auto";
    element.src = url;

    if (element instanceof HTMLVideoElement) {
      element.playsInline = true;
    }

    try {
      await waitForMediaReady(element, "loadedmetadata", type);
      element.pause();
    } catch (error) {
      element.pause();
      element.removeAttribute("src");
      element.load();
      revokeTimelineObjectUrl(url);
      throw error;
    }

    return element;
  }

  function removeTimelineClip(type, clip, { dispose = true } = {}) {
    const clips = getTimelineClipsByType(type);
    const index = clips.indexOf(clip);

    if (index === -1) {
      return;
    }

    clips.splice(index, 1);
    if (dispose) {
      disposeTimelineClipResources(type, clip);
    }
  }

  function disposeTimelineClipResources(type, clip) {
    if ((type === "video" || type === "audio") && clip.audioElement) {
      clip.audioElement.pause();

      if (!isTimelineResourceShared("audioElement", clip.audioElement)) {
        if (clip.audioElement !== mediaElement) {
          clip.audioElement.removeAttribute("src");
          clip.audioElement.load();
          revokeTimelineObjectUrl(clip.mediaUrl || clip.audioElement.__timelineObjectUrl);
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

    if (type === "image") {
      if (clip.texture && !isTimelineResourceShared("texture", clip.texture)) {
        clip.texture.destroy(true);
      }

      if (clip.mediaUrl && !isTimelineResourceShared("mediaUrl", clip.mediaUrl)) {
        revokeTimelineObjectUrl(clip.mediaUrl);
      }
    }
  }

  function revokeTimelineObjectUrl(url) {
    if (!url) {
      return;
    }

    URL.revokeObjectURL(url);
    timelineObjectUrls = timelineObjectUrls.filter((item) => item !== url);
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

    if (rebuildVideo) {
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

    if (isTrackHidden("text")) {
      return [];
    }

    return textTimelineClips.map((clip) => ({
      align: clip.align || TEXT_CLIP_DEFAULT_ALIGN,
      backgroundAlpha: Math.min(Math.max(Number(clip.backgroundAlpha) || 0, 0), 1),
      backgroundColor: clip.backgroundColor || TEXT_CLIP_DEFAULT_BACKGROUND_COLOR,
      duration: clip.duration,
      fillStyle: clip.fill || TEXT_CLIP_DEFAULT_COLOR,
      fontFamily: clip.fontFamily || TEXT_CLIP_DEFAULT_FONT_FAMILY,
      fontStyle: clip.fontStyle || "normal",
      fontSizeRatio:
        (Number(clip.fontSize) || TEXT_CLIP_DEFAULT_FONT_SIZE) / TEXT_CLIP_FONT_REFERENCE_HEIGHT,
      fontWeight: String(clip.fontWeight || TEXT_CLIP_DEFAULT_FONT_WEIGHT),
      lineHeightRatio: Number(clip.lineHeight) || TEXT_CLIP_DEFAULT_LINE_HEIGHT,
      shadowBlurRatio: (Number(clip.shadowBlur) || 0) / rect.height,
      shadowColor: clip.shadowColor || TEXT_CLIP_DEFAULT_SHADOW_COLOR,
      shadowDistanceRatio: (Number(clip.shadowDistance) || 0) / rect.height,
      startTime: clip.startTime,
      strokeStyle: clip.strokeColor || TEXT_CLIP_DEFAULT_STROKE_COLOR,
      strokeWidthRatio: (Number(clip.strokeWidth) || 0) / rect.height,
      text: clip.text || TEXT_CLIP_DEFAULT_VALUE,
      transitionSeconds:
        Number(clip.transitionSeconds) >= 0 ? Number(clip.transitionSeconds) : OVERLAY_FADE_SECONDS,
      transitionType: clip.transitionType || OVERLAY_DEFAULT_TRANSITION_TYPE,
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

    if (isTrackHidden("image")) {
      return [];
    }

    return imageTimelineClips.map((clip) => {
      const frame = getImageExportFrame(rect, clip);

      return {
        duration: clip.duration,
        imageSource: clip.imageElement,
        startTime: clip.startTime,
        transitionSeconds:
          Number(clip.transitionSeconds) >= 0
            ? Number(clip.transitionSeconds)
            : OVERLAY_FADE_SECONDS,
        transitionType: clip.transitionType || OVERLAY_DEFAULT_TRANSITION_TYPE,
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
    if (currentKind !== "video" || isTrackHidden("image")) {
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
    if (currentKind !== "video" || isTrackHidden("text")) {
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
      ...videoTimelineClips
        .filter((clip) => !clip.muted && !isTrackMuted("video"))
        .map((clip) => ({
          duration: clip.duration,
          file: clip.file,
          sourceOffset: getClipSourceOffset(clip),
          startTime: clip.startTime,
          volume: clip.volume ?? 1,
        })),
      ...audioTimelineClips
        .filter((clip) => !clip.muted && !isTrackMuted("audio"))
        .map((clip) => ({
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
    if (isExporting) {
      cancelActiveExport();
      return;
    }

    showExportDialog();
  }

  function showExportDialog() {
    if (!currentVideoFile) {
      return;
    }

    const provider = videoFrameProvider;
    const baseName = currentVideoFile.name.replace(/\.[^.]+$/, "") || "video";

    exportDialog.show({
      fileName: `${baseName}-overlay.mp4`,
      height: provider?.height || "",
      width: provider?.width || "",
    });
  }

  function hideExportDialog() {
    exportDialog.hide();
  }

  function cancelActiveExport() {
    if (!isExporting) {
      hideExportDialog();
      return;
    }

    exportAbortController?.abort();
    statusText.textContent = "Canceling export";
  }

  async function startConfiguredExport() {
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
    exportAbortController = new AbortController();
    exportButton.disabled = false;
    exportButton.textContent = "取消导出";
    exportDialog.startButton.disabled = true;
    chooseButton.disabled = true;
    subtitleButton.disabled = true;
    exportProgressLabel.hidden = false;
    exportProgressLabel.textContent = "0%";
    statusText.textContent = "Exporting 0%";
    hideExportDialog();

    const shouldResume = currentKind === "video" && playbackPlaying;

    playbackPlaying = false;
    pauseTimelineAudio();
    mediaElement?.pause();
    app.stop();

    try {
      const duration = getTimelineDuration();
      const exportSettings = getExportSettings();

      statusText.textContent = "Mixing audio";
      exportProgressLabel.textContent = "0%";
      if (exportAbortController.signal.aborted) {
        throw new DOMException("Export canceled.", "AbortError");
      }
      const audioBuffer = await createTimelineAudioMixdown(duration);
      if (exportAbortController.signal.aborted) {
        throw new DOMException("Export canceled.", "AbortError");
      }

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
          bitrate: exportSettings.bitrate,
          duration,
          fps: exportSettings.fps,
          height: exportSettings.height,
          onProgress(progress, stage = "render") {
            const percentText = `${Math.round(progress * 100)}%`;

            exportProgressLabel.textContent = percentText;
            statusText.textContent =
              stage === "finalize"
                ? `Finalizing ${percentText}`
                : stage === "complete"
                  ? "Preparing download"
                  : `Rendering ${percentText}`;
          },
          signal: exportAbortController.signal,
          width: exportSettings.width,
        }
      );

      downloadBlob(blob, exportSettings.fileName);
      exportProgressLabel.textContent = "100%";
      statusText.textContent = "Export complete";
    } catch (error) {
      statusText.textContent =
        error instanceof DOMException && error.name === "AbortError"
          ? "Export canceled"
          : error instanceof Error
            ? `Export failed: ${error.message}`
            : "Export failed";
    } finally {
      isExporting = false;
      exportAbortController = null;
      chooseButton.disabled = false;
      subtitleButton.disabled = false;
      exportDialog.startButton.disabled = false;
      exportButton.disabled =
        currentKind !== "video" || !currentVideoFile || videoTimelineClips.length === 0;
      exportButton.textContent = "导出";
      exportProgressLabel.hidden = true;

      if (shouldResume) {
        await startTimelinePlayback();
      } else {
        app.render();
      }
    }
  }

  function getExportSettings() {
    const fallbackWidth = videoFrameProvider?.width || 0;
    const fallbackHeight = videoFrameProvider?.height || 0;

    return exportDialog.getSettings({ fallbackHeight, fallbackWidth });
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
      textOverlayLayer.eventMode = "passive";
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
    textOverlayLayer.eventMode = "static";

    const local = textLayer.toLocal(event.global);
    const rect = getMediaSpriteRect();
    const x = rect ? rect.left + rect.width * clip.xRatio : 0;
    const y = rect ? rect.top + rect.height * clip.yRatio : 0;

    textDragOffset.x = x - local.x;
    textDragOffset.y = y - local.y;
    event.stopPropagation();
  }

  function handleTextLayerPointerDown(event) {
    if (textDragging || event.target !== textOverlayLayer) {
      return;
    }

    const clip = getTextClipAtCanvasEvent(event);

    if (clip) {
      handleTextPointerDown(clip, event);
    }
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
    textOverlayLayer.eventMode = "passive";
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
    showSubtitleContextMenuAtPoint(clip, getClientPointFromPixiEvent(event));
  }

  function showSubtitleContextMenuAtPoint(clip, clientPoint) {
    syncSubtitleStyleControls(clip);
    subtitleContextMenu.style.left = `${clientPoint.x}px`;
    subtitleContextMenu.style.top = `${clientPoint.y}px`;
    subtitleContextMenu.hidden = false;
    clampSubtitleContextMenuToViewport();
    skipNextSubtitleMenuDocumentPointerDown = true;
  }

  function clampSubtitleContextMenuToViewport() {
    const margin = 8;
    const rect = subtitleContextMenu.getBoundingClientRect();
    const maxX = Math.max(margin, window.innerWidth - rect.width - margin);
    const maxY = Math.max(margin, window.innerHeight - rect.height - margin);
    const nextX = Math.min(Math.max(margin, rect.left), maxX);
    const nextY = Math.min(Math.max(margin, rect.top), maxY);

    subtitleContextMenu.style.left = `${nextX}px`;
    subtitleContextMenu.style.top = `${nextY}px`;
  }

  function hideSubtitleContextMenu() {
    subtitleContextMenu.hidden = true;
    skipNextSubtitleMenuDocumentPointerDown = false;
  }

  function handleSubtitleStyleChange() {
    if (!selectedTextClip) {
      return;
    }

    recordTimelineHistory();
    applySubtitleStyleControlsToClip(selectedTextClip);
    refreshSubtitleEditingViews();
  }

  function handleApplySubtitleStyleAll() {
    if (!selectedTextClip) {
      return;
    }

    recordTimelineHistory();
    const style = getSubtitleStyleSnapshot(selectedTextClip);

    textTimelineClips.forEach((clip) => {
      Object.assign(clip, style);
    });
    refreshSubtitleEditingViews();
    statusText.textContent = "Subtitle style applied";
  }

  function refreshSubtitleEditingViews() {
    updateTextOverlayPosition();
    renderTimelineClipTracks();
    drawEditorTimeline();
    renderSubtitlePanel();
    renderClipInspector();
    app.render();
  }

  function syncSubtitleStyleControls(clip) {
    subtitleColorInput.value = normalizeHexColor(clip.fill || TEXT_CLIP_DEFAULT_COLOR);
    subtitleSizeInput.value = String(Number(clip.fontSize) || TEXT_CLIP_DEFAULT_FONT_SIZE);
    subtitleWeightSelect.value = String(clip.fontWeight || TEXT_CLIP_DEFAULT_FONT_WEIGHT);
    subtitleFontSelect.value = clip.fontFamily || TEXT_CLIP_DEFAULT_FONT_FAMILY;
    subtitleAlignSelect.value = clip.align || TEXT_CLIP_DEFAULT_ALIGN;
    subtitleLineHeightInput.value = String(
      Number(clip.lineHeight) || TEXT_CLIP_DEFAULT_LINE_HEIGHT
    );
    subtitleStrokeColorInput.value = normalizeHexColor(
      clip.strokeColor || TEXT_CLIP_DEFAULT_STROKE_COLOR,
      TEXT_CLIP_DEFAULT_STROKE_COLOR
    );
    subtitleStrokeWidthInput.value = String(
      Math.max(0, Number(clip.strokeWidth) || TEXT_CLIP_DEFAULT_STROKE_WIDTH)
    );
    subtitleShadowColorInput.value = normalizeHexColor(
      clip.shadowColor || TEXT_CLIP_DEFAULT_SHADOW_COLOR,
      TEXT_CLIP_DEFAULT_SHADOW_COLOR
    );
    subtitleShadowBlurInput.value = String(
      Math.max(0, Number(clip.shadowBlur) || TEXT_CLIP_DEFAULT_SHADOW_BLUR)
    );
    subtitleShadowDistanceInput.value = String(
      Math.max(0, Number(clip.shadowDistance) || TEXT_CLIP_DEFAULT_SHADOW_DISTANCE)
    );
    subtitleBackgroundColorInput.value = normalizeHexColor(
      clip.backgroundColor || TEXT_CLIP_DEFAULT_BACKGROUND_COLOR,
      TEXT_CLIP_DEFAULT_BACKGROUND_COLOR
    );
    subtitleBackgroundAlphaInput.value = String(
      Math.min(Math.max(Number(clip.backgroundAlpha) || TEXT_CLIP_DEFAULT_BACKGROUND_ALPHA, 0), 1)
    );
  }

  function applySubtitleStyleControlsToClip(clip) {
    Object.assign(clip, {
      align: subtitleAlignSelect.value || TEXT_CLIP_DEFAULT_ALIGN,
      backgroundAlpha: Math.min(Math.max(Number(subtitleBackgroundAlphaInput.value) || 0, 0), 1),
      backgroundColor: subtitleBackgroundColorInput.value || TEXT_CLIP_DEFAULT_BACKGROUND_COLOR,
      fill: subtitleColorInput.value || TEXT_CLIP_DEFAULT_COLOR,
      fontFamily: subtitleFontSelect.value || TEXT_CLIP_DEFAULT_FONT_FAMILY,
      fontSize: Math.min(
        Math.max(Number(subtitleSizeInput.value) || TEXT_CLIP_DEFAULT_FONT_SIZE, 8),
        96
      ),
      fontSizeReferenceHeight: TEXT_CLIP_FONT_REFERENCE_HEIGHT,
      fontWeight: subtitleWeightSelect.value || TEXT_CLIP_DEFAULT_FONT_WEIGHT,
      lineHeight: Math.min(
        Math.max(Number(subtitleLineHeightInput.value) || TEXT_CLIP_DEFAULT_LINE_HEIGHT, 0.8),
        3
      ),
      shadowBlur: Math.min(Math.max(Number(subtitleShadowBlurInput.value) || 0, 0), 40),
      shadowColor: subtitleShadowColorInput.value || TEXT_CLIP_DEFAULT_SHADOW_COLOR,
      shadowDistance: Math.min(Math.max(Number(subtitleShadowDistanceInput.value) || 0, 0), 40),
      strokeColor: subtitleStrokeColorInput.value || TEXT_CLIP_DEFAULT_STROKE_COLOR,
      strokeWidth: Math.min(Math.max(Number(subtitleStrokeWidthInput.value) || 0, 0), 20),
    });
  }

  function getSubtitleStyleSnapshot(clip) {
    return {
      align: clip.align || TEXT_CLIP_DEFAULT_ALIGN,
      backgroundAlpha: Math.min(Math.max(Number(clip.backgroundAlpha) || 0, 0), 1),
      backgroundColor: clip.backgroundColor || TEXT_CLIP_DEFAULT_BACKGROUND_COLOR,
      fill: clip.fill || TEXT_CLIP_DEFAULT_COLOR,
      fontFamily: clip.fontFamily || TEXT_CLIP_DEFAULT_FONT_FAMILY,
      fontSize: Math.min(Math.max(Number(clip.fontSize) || TEXT_CLIP_DEFAULT_FONT_SIZE, 8), 96),
      fontSizeReferenceHeight: TEXT_CLIP_FONT_REFERENCE_HEIGHT,
      fontStyle: clip.fontStyle || "normal",
      fontWeight: clip.fontWeight || TEXT_CLIP_DEFAULT_FONT_WEIGHT,
      lineHeight: Math.min(
        Math.max(Number(clip.lineHeight) || TEXT_CLIP_DEFAULT_LINE_HEIGHT, 0.8),
        3
      ),
      shadowBlur: Math.min(Math.max(Number(clip.shadowBlur) || 0, 0), 40),
      shadowColor: clip.shadowColor || TEXT_CLIP_DEFAULT_SHADOW_COLOR,
      shadowDistance: Math.min(Math.max(Number(clip.shadowDistance) || 0, 0), 40),
      strokeColor: clip.strokeColor || TEXT_CLIP_DEFAULT_STROKE_COLOR,
      strokeWidth: Math.min(Math.max(Number(clip.strokeWidth) || 0, 0), 20),
    };
  }

  function startSubtitleEditing(clip) {
    if (!layoutSubtitleEditInput(clip)) {
      return;
    }

    subtitleEditInput.value = clip.text || TEXT_CLIP_DEFAULT_VALUE;
    subtitleEditInput.style.fontSize = `${getRenderedSubtitleFontSize(clip)}px`;
    subtitleEditInput.style.fontWeight = String(clip.fontWeight || TEXT_CLIP_DEFAULT_FONT_WEIGHT);
    subtitleEditInput.style.color = clip.fill || TEXT_CLIP_DEFAULT_COLOR;
    subtitleEditInput.hidden = false;
    subtitleEditInput.focus();
    subtitleEditInput.select();
  }

  function layoutActiveSubtitleEditInput() {
    if (!subtitleEditInput.hidden && selectedTextClip) {
      layoutSubtitleEditInput(selectedTextClip);
    }
  }

  function layoutSubtitleEditInput(clip) {
    const rect = getMediaSpriteRect();
    const node = clip?.overlayNode;

    if (!rect || !node) {
      return false;
    }

    const clientPoint = getClientPointFromCanvasPoint(node.x, node.y);
    const bounds = canvas.getBoundingClientRect();
    const width = Math.max(140, Math.min(bounds.width - 24, node.width + 40));

    subtitleEditInput.style.left = `${Math.min(
      Math.max(clientPoint.x - width / 2, bounds.left + 12),
      bounds.right - width - 12
    )}px`;
    subtitleEditInput.style.top = `${clientPoint.y - Math.max(18, node.height / 2)}px`;
    subtitleEditInput.style.width = `${width}px`;

    return true;
  }

  function finishSubtitleEditing({ commit = true } = {}) {
    if (commit && selectedTextClip && !subtitleEditInput.hidden) {
      recordTimelineHistory();
      selectedTextClip.text = subtitleEditInput.value || TEXT_CLIP_DEFAULT_VALUE;
      renderTimelineClipTracks();
      updateTextOverlayPosition();
      drawEditorTimeline();
      renderSubtitlePanel();
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

  function handleDocumentKeyDown(event) {
    if (isEditableDomTarget(event.target)) {
      return;
    }

    const isCommand = event.metaKey || event.ctrlKey;

    if (isCommand && event.key.toLowerCase() === "z" && !event.shiftKey) {
      event.preventDefault();
      undoTimelineEdit();
    } else if (
      (isCommand && event.key.toLowerCase() === "z" && event.shiftKey) ||
      (isCommand && event.key.toLowerCase() === "y")
    ) {
      event.preventDefault();
      redoTimelineEdit();
    } else if (isCommand && event.key.toLowerCase() === "c") {
      event.preventDefault();
      copySelectedTimelineClips();
    } else if (isCommand && event.key.toLowerCase() === "v") {
      event.preventDefault();
      void pasteTimelineClipboard();
    } else if (event.key === " ") {
      event.preventDefault();
      void toggleMediaPlayback();
    } else if (event.key.toLowerCase() === "s") {
      event.preventDefault();
      void splitSelectedTimelineClip();
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      seekPlaybackBy((event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 1 : 1 / 30));
    } else if (event.key === "=" || event.key === "+") {
      event.preventDefault();
      setTimelineHorizontalZoom(1.15);
    } else if (event.key === "-") {
      event.preventDefault();
      setTimelineHorizontalZoom(1 / 1.15);
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      deleteSelectedTimelineClip();
    }
  }

  function seekPlaybackBy(deltaSeconds) {
    const duration = getPlaybackDuration();

    playbackTime = Math.min(Math.max(playbackTime + deltaSeconds, 0), Math.max(duration, 0));
    if (mediaElement && Number.isFinite(mediaElement.duration)) {
      mediaElement.currentTime = Math.min(playbackTime, mediaElement.duration);
    }
    updateVideoTexture(true);
    syncTimelineAudio();
    renderScene();
    drawTimeline();
    drawEditorTimeline();
    app.render();
  }

  function isEditableDomTarget(target) {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    return (
      target.tagName === "INPUT" ||
      target.tagName === "SELECT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable
    );
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
    textOverlayLayer.eventMode = "passive";
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

  function normalizeHexColor(value, fallback = TEXT_CLIP_DEFAULT_COLOR) {
    return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
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
    renderSubtitlePanel();
  }

  function renderSubtitlePanel() {
    subtitlePanelList.replaceChildren();

    if (textTimelineClips.length === 0) {
      const empty = document.createElement("p");
      empty.className = "subtitle-panel-empty";
      empty.textContent = "暂无字幕";
      subtitlePanelList.append(empty);
      return;
    }

    const orderedClips = [...textTimelineClips].sort((left, right) => {
      if (Math.abs(left.startTime - right.startTime) > TRACK_OVERLAP_EPSILON) {
        return left.startTime - right.startTime;
      }

      return textTimelineClips.indexOf(left) - textTimelineClips.indexOf(right);
    });

    orderedClips.forEach((clip, index) => {
      subtitlePanelList.append(createSubtitlePanelRow(clip, index));
    });
  }

  function createSubtitlePanelRow(clip, index) {
    const row = document.createElement("div");
    row.className = `subtitle-panel-row${selectedTextClip === clip ? " is-selected" : ""}`;
    const mainRow = document.createElement("div");
    mainRow.className = "subtitle-panel-row-main";
    const metaRow = document.createElement("div");
    metaRow.className = "subtitle-panel-row-meta";
    const label = document.createElement("button");
    label.type = "button";
    label.textContent = String(index + 1).padStart(2, "0");
    const textInput = document.createElement("input");
    textInput.type = "text";
    textInput.value = clip.text || TEXT_CLIP_DEFAULT_VALUE;
    textInput.ariaLabel = "字幕文本";
    const startInput = createNumberInput("字幕开始时间", clip.startTime, "0.1", "0", "99999");
    const endInput = createNumberInput(
      "字幕结束时间",
      clip.startTime + clip.duration,
      "0.1",
      "0",
      "99999"
    );
    const settingsButton = document.createElement("button");
    settingsButton.type = "button";
    settingsButton.className = "subtitle-panel-row-settings";
    settingsButton.textContent = "设置";

    label.addEventListener("click", () => {
      selectTimelineClip("text", clip);
      playbackTime = Math.min(Math.max(clip.startTime, 0), getTimelineDuration());
      updateTextOverlayPosition();
      drawTimeline();
      drawEditorTimeline();
      app.render();
    });
    textInput.addEventListener("change", () => {
      recordTimelineHistory();
      clip.text = textInput.value || TEXT_CLIP_DEFAULT_VALUE;
      refreshSubtitleEditingViews();
    });
    startInput.addEventListener("change", () => {
      updateSubtitlePanelRowTiming(clip, startInput, endInput);
    });
    endInput.addEventListener("change", () => {
      updateSubtitlePanelRowTiming(clip, startInput, endInput);
    });
    settingsButton.addEventListener("click", (event) => {
      finishSubtitleEditing();
      selectTimelineClip("text", clip);
      selectedTextClip = clip;
      renderSubtitlePanel();
      clipInspector.scrollIntoView({ block: "nearest" });
      event.stopPropagation();
    });

    mainRow.append(label, textInput);
    metaRow.append(startInput, endInput, settingsButton);
    row.append(mainRow, metaRow);
    return row;
  }

  function updateSubtitlePanelRowTiming(clip, startInput, endInput) {
    const previousStart = clip.startTime;
    const previousDuration = clip.duration;
    const startTime = Math.max(0, Number(startInput.value) || 0);
    const endTime = Math.max(
      startTime + TRACK_OVERLAP_EPSILON,
      Number(endInput.value) || startTime
    );
    const duration = Math.max(TRACK_OVERLAP_EPSILON, endTime - startTime);

    if (hasTimelineClipOverlap("text", clip, getClipTrackIndex(clip), startTime, duration)) {
      clip.startTime = previousStart;
      clip.duration = previousDuration;
      startInput.value = String(previousStart);
      endInput.value = String(previousStart + previousDuration);
      statusText.textContent = "Subtitle timing overlaps";
      return;
    }

    recordTimelineHistory();
    clip.startTime = startTime;
    clip.duration = duration;
    refreshTimelineAfterClipEdit("text");
    renderSubtitlePanel();
    statusText.textContent = "Subtitle timing updated";
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
      const bounds = node.getBounds();
      const inBounds =
        canvasPoint.x >= bounds.x - padding &&
        canvasPoint.x <= bounds.x + bounds.width + padding &&
        canvasPoint.y >= bounds.y - padding &&
        canvasPoint.y <= bounds.y + bounds.height + padding;

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
  subtitleStyleFields.forEach((field) => {
    field.addEventListener("input", handleSubtitleStyleChange);
    field.addEventListener("change", handleSubtitleStyleChange);
  });
  applySubtitleStyleAllButton.addEventListener("click", handleApplySubtitleStyleAll);
  subtitleEditInput.addEventListener("blur", finishSubtitleEditing);
  subtitleEditInput.addEventListener("keydown", handleSubtitleEditKeyDown);
  exportButton.addEventListener("click", handleExportClick);
  exportDialog.startButton.addEventListener("click", startConfiguredExport);
  exportDialog.cancelButton.addEventListener("click", cancelActiveExport);
  clipControlFields.forEach((field) => {
    field.addEventListener("input", handleClipInspectorChange);
    field.addEventListener("change", handleClipInspectorChange);
  });
  clipSubtitleApplyAllButton.addEventListener("click", handleClipSubtitleApplyAll);
  trackPanelRows.addEventListener("change", handleTrackControlChange);
  saveProjectButton.addEventListener("click", saveProjectState);
  sidePanelToggle.addEventListener("click", handleSidePanelToggle);
  input.addEventListener("change", handleInputChange);
  canvas.addEventListener("contextmenu", handleCanvasContextMenu);
  canvas.addEventListener("dblclick", handleCanvasDoubleClick);
  document.addEventListener("pointerdown", handleDocumentPointerDown);
  document.addEventListener("keydown", handleDocumentKeyDown);
  timelineCanvas.addEventListener("wheel", handleTimelineWheel, { passive: false });
  timelineSplitter.addEventListener("pointerdown", handleTimelineSplitterPointerDown);
  timelineSplitter.addEventListener("keydown", handleTimelineSplitterKeyDown);
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
  textOverlayLayer.on("pointerdown", handleTextLayerPointerDown);
  textOverlayLayer.on("pointerupoutside", handleTextPointerUp);
  textOverlayLayer.on("globalpointermove", handleTextPointerMove);
  app.ticker.add(renderScene);

  renderTrackPanel();
  renderProjectHistoryPanel();
  renderClipInspector();
  renderSubtitlePanel();
  resizeCanvas();

  return () => {
    cancelTimelineClipReleaseAnimation();
    clearCurrentMedia({ invalidateLoads: true });
    document.body.classList.remove("pixi-media-page");
    document.body.classList.remove("media-side-panel-collapsed");
    chooseButton.removeEventListener("click", handleChooseClick);
    subtitleButton.removeEventListener("click", handleSubtitleClick);
    subtitleStyleFields.forEach((field) => {
      field.removeEventListener("input", handleSubtitleStyleChange);
      field.removeEventListener("change", handleSubtitleStyleChange);
    });
    applySubtitleStyleAllButton.removeEventListener("click", handleApplySubtitleStyleAll);
    subtitleEditInput.removeEventListener("blur", finishSubtitleEditing);
    subtitleEditInput.removeEventListener("keydown", handleSubtitleEditKeyDown);
    exportButton.removeEventListener("click", handleExportClick);
    exportDialog.startButton.removeEventListener("click", startConfiguredExport);
    exportDialog.cancelButton.removeEventListener("click", cancelActiveExport);
    clipControlFields.forEach((field) => {
      field.removeEventListener("input", handleClipInspectorChange);
      field.removeEventListener("change", handleClipInspectorChange);
    });
    clipSubtitleApplyAllButton.removeEventListener("click", handleClipSubtitleApplyAll);
    trackPanelRows.removeEventListener("change", handleTrackControlChange);
    saveProjectButton.removeEventListener("click", saveProjectState);
    projectHistoryPanel.destroy();
    sidePanelToggle.removeEventListener("click", handleSidePanelToggle);
    exportAbortController?.abort();
    input.removeEventListener("change", handleInputChange);
    canvas.removeEventListener("contextmenu", handleCanvasContextMenu);
    canvas.removeEventListener("dblclick", handleCanvasDoubleClick);
    document.removeEventListener("pointerdown", handleDocumentPointerDown);
    document.removeEventListener("keydown", handleDocumentKeyDown);
    timelineCanvas.removeEventListener("wheel", handleTimelineWheel);
    timelineSplitter.removeEventListener("pointerdown", handleTimelineSplitterPointerDown);
    timelineSplitter.removeEventListener("keydown", handleTimelineSplitterKeyDown);
    window.removeEventListener("pointermove", handleTimelineSplitterPointerMove);
    window.removeEventListener("pointerup", handleTimelineSplitterPointerUp);
    window.removeEventListener("pointercancel", handleTimelineSplitterPointerUp);
    window.removeEventListener("resize", resizeCanvas);
    document.body.classList.remove("media-timeline-resizing");
    if (timelinePanelResizeFrame) {
      window.cancelAnimationFrame(timelinePanelResizeFrame);
      timelinePanelResizeFrame = 0;
    }
    pendingTimelinePanelHeightPx = null;
    gameShell.style.removeProperty("--media-timeline-height");
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
    textOverlayLayer.off("pointerdown", handleTextLayerPointerDown);
    textOverlayLayer.off("pointerupoutside", handleTextPointerUp);
    textOverlayLayer.off("globalpointermove", handleTextPointerMove);
    app.ticker.remove(renderScene);
    app.destroy(false);
    timelineApp.destroy(false);
  };
}
