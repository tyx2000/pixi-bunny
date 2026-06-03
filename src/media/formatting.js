import { OVERLAY_DEFAULT_TRANSITION_TYPE } from "./constants.js";

export function formatMemoryUsage() {
  const memory = performance.memory;

  if (!memory || !Number.isFinite(memory.usedJSHeapSize)) {
    return "N/A";
  }

  if (Number.isFinite(memory.jsHeapSizeLimit)) {
    return `${formatBytes(memory.usedJSHeapSize)}/${formatBytes(memory.jsHeapSizeLimit)}`;
  }

  return formatBytes(memory.usedJSHeapSize);
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 MB";
  }

  const megabytes = bytes / 1024 / 1024;

  if (megabytes < 100) {
    return `${megabytes.toFixed(1)} MB`;
  }

  return `${Math.round(megabytes)} MB`;
}

export function formatPercent(value) {
  if (!Number.isFinite(value)) {
    return "N/A";
  }

  return `${Math.max(0, Math.min(999, value)).toFixed(0)}%`;
}

export function formatTime(value) {
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

export function formatNumberInputValue(value) {
  const safeValue = Number.isFinite(value) ? value : 0;

  return String(Math.round(safeValue * 1000) / 1000);
}

export function formatRulerTime(value) {
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

export function formatProjectHistoryTime(value) {
  const date = new Date(value);

  return date.toLocaleString("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
  });
}

export function formatProjectHistoryFileTime(value) {
  const date = new Date(value);
  const parts = [
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
  ];

  return parts.map((part) => String(part).padStart(2, "0")).join("");
}

export function parseHexColorNumber(value) {
  const hex = /^#[0-9a-f]{6}$/i.test(value) ? value.slice(1) : "000000";

  return Number.parseInt(hex, 16);
}

export function getOverlayTransitionAtTime(
  time,
  intervals,
  transitionSeconds,
  transitionType = OVERLAY_DEFAULT_TRANSITION_TYPE
) {
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

  if (transitionType === "none") {
    return { alpha: progress > 0 ? 1 : 0, axisScale: 1 };
  }

  return {
    alpha: progress,
    axisScale: transitionType === "rotateY" ? Math.cos((1 - progress) * (Math.PI / 2)) : 1,
  };
}

export function easeInOut(value) {
  return value * value * (3 - 2 * value);
}
