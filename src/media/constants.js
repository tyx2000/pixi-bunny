export const VIEW_WIDTH = 960;
export const VIEW_HEIGHT = 660;
export const HEADER_HEIGHT = 60;
export const MEDIA_PADDING = 12;
export const PREVIEW_HEIGHT = Math.round(VIEW_HEIGHT * 0.8);
export const TIMELINE_PANEL_HEIGHT = VIEW_HEIGHT - PREVIEW_HEIGHT;
export const TIMELINE_PANEL_MIN_RATIO = 0.2;
export const TIMELINE_PANEL_MAX_RATIO = 0.6;
export const TIMELINE_SPLITTER_HEIGHT = 8;
export const PREVIEW_MIN_HEIGHT = 180;
export const BAR_COUNT = 48;
export const TIMELINE_X = MEDIA_PADDING + 72;
export const TIMELINE_HEIGHT = 3;
export const TIMELINE_HIT_HEIGHT = 42;
export const ICON_SIZE = 20;
export const ICON_GAP = 8;
export const PREVIEW_BUTTON_SIZE = ICON_SIZE + ICON_GAP * 2;
export const TIMELINE_KNOB_SIZE = ICON_SIZE;
export const PREVIEW_CONTROL_HEIGHT = PREVIEW_BUTTON_SIZE;
export const PREVIEW_CONTROL_GAP = ICON_GAP;
export const PREVIEW_TIMECODE_SIDE_GAP = 16;
export const PREVIEW_MEDIA_CONTROL_GAP = 12;
export const PREVIEW_PLAY_BUTTON_WIDTH = PREVIEW_BUTTON_SIZE;
export const PREVIEW_ACTION_BUTTON_WIDTH = PREVIEW_BUTTON_SIZE;
export const PREVIEW_TIMECODE_WIDTH = 148;
export const PREVIEW_PROGRESS_MIN_WIDTH = 160;
export const EDITOR_PANEL_X = 0;
export const EDITOR_PANEL_Y = PREVIEW_HEIGHT;
export const EDITOR_PANEL_HEADER_HEIGHT = 26;
export const TRACK_LABEL_WIDTH = 0;
export const TRACK_ROW_GAP = ICON_GAP;
export const RULER_TRACK_GAP = 10;
export const RULER_LABEL_HEIGHT = 16;
export const VIDEO_TRACK_HEIGHT = 60;
export const AUDIO_TRACK_HEIGHT = 50;
export const IMAGE_TRACK_HEIGHT = 50;
export const TEXT_TRACK_HEIGHT = 50;
export const VIDEO_THUMB_WIDTH = 92;
export const VIDEO_THUMB_HEIGHT = VIDEO_TRACK_HEIGHT - ICON_GAP;
export const DEFAULT_TIMELINE_PIXELS_PER_SECOND = 10;
export const TIMELINE_PIXELS_PER_SECOND_MIN = 4;
export const TIMELINE_PIXELS_PER_SECOND_MAX = 80;
export const TIMELINE_DRAG_EXTENSION_SECONDS = 60;
export const TIMELINE_CLIP_DRAG_THRESHOLD = 4;
export const TIMELINE_CLIP_RELEASE_ANIMATION_MS = 160;
export const TRACK_OVERLAP_EPSILON = 0.02;
export const CLIP_MIN_DURATION = 1;
export const CLIP_EDGE_HIT_WIDTH = ICON_GAP;
export const IMAGE_CLIP_DEFAULT_DURATION = 5;
export const VIDEO_FRAME_MIN_INTERVAL = 1 / 30;
export const MEDIA_SYNC_SEEK_THRESHOLD = 0.28;
export const MEDIA_SYNC_SEEK_RETRY_THRESHOLD = 0.45;
export const PERFORMANCE_UPDATE_INTERVAL_MS = 500;
export const PERFORMANCE_FRAME_BUDGET_MS = 1000 / 60;
export const TEXT_DOUBLE_TAP_MS = 360;
export const TEXT_CLIP_DEFAULT_DURATION = 2;
export const TEXT_CLIP_DEFAULT_VALUE = "Hello world";
export const TEXT_CLIP_DEFAULT_COLOR = "#ffffff";
export const TEXT_CLIP_DEFAULT_FONT_SIZE = 14;
export const TEXT_CLIP_FONT_REFERENCE_HEIGHT = PREVIEW_HEIGHT;
export const TEXT_CLIP_DEFAULT_FONT_WEIGHT = "400";
export const TEXT_CLIP_DEFAULT_FONT_FAMILY = "Inter, system-ui, sans-serif";
export const TEXT_CLIP_DEFAULT_ALIGN = "center";
export const TEXT_CLIP_DEFAULT_LINE_HEIGHT = 1.25;
export const TEXT_CLIP_DEFAULT_STROKE_COLOR = "#000000";
export const TEXT_CLIP_DEFAULT_STROKE_WIDTH = 0;
export const TEXT_CLIP_DEFAULT_SHADOW_COLOR = "#000000";
export const TEXT_CLIP_DEFAULT_SHADOW_BLUR = 0;
export const TEXT_CLIP_DEFAULT_SHADOW_DISTANCE = 0;
export const TEXT_CLIP_DEFAULT_BACKGROUND_COLOR = "#000000";
export const TEXT_CLIP_DEFAULT_BACKGROUND_ALPHA = 0;
export const TEXT_CLIP_BOTTOM_MARGIN = 12;
export const TIMELINE_TEXT_LABEL_FONT = "700 12px Inter, system-ui, sans-serif";
export const TIMELINE_TEXT_LABEL_PADDING = 20;
export const TIME_TEXT_FONT_FAMILY =
  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
export const IMAGE_OVERLAY_MIN_WIDTH = 48;
export const IMAGE_OVERLAY_HANDLE_RADIUS = ICON_SIZE / 2;
export const OVERLAY_FADE_SECONDS = 0.35;
export const OVERLAY_DEFAULT_TRANSITION_TYPE = "rotateY";
export const EXPORT_DEFAULT_FPS = 30;
export const EXPORT_DEFAULT_BITRATE = 8_000_000;
export const EXPORT_FPS_OPTIONS = [24, 25, 30, 50, 60];
export const EXPORT_MAX_BITRATE = 30_000_000;
export const IMAGE_EXTENSIONS = new Set(["avif", "jpeg", "jpg", "png", "webp"]);
export const VIDEO_EXTENSIONS = new Set([
  "avi",
  "h264",
  "m4v",
  "mov",
  "mp4",
  "ogg",
  "ogv",
  "webm",
]);
export const AUDIO_EXTENSIONS = new Set([
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
