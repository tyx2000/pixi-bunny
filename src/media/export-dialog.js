import {
  EXPORT_DEFAULT_BITRATE,
  EXPORT_DEFAULT_FPS,
  EXPORT_FPS_OPTIONS,
  EXPORT_MAX_BITRATE,
} from "./constants.js";
import { requireElement } from "./dom-controls.js";
import { sanitizeExportFileName } from "./timeline-model.js";

export function createExportDialog() {
  const node = requireElement("export-dialog", HTMLDivElement);
  const widthInput = requireElement("export-width-input", HTMLInputElement);
  const heightInput = requireElement("export-height-input", HTMLInputElement);
  const fpsInput = requireElement("export-fps-input", HTMLInputElement);
  const bitrateInput = requireElement("export-bitrate-input", HTMLInputElement);
  const fileNameInput = requireElement("export-file-name-input", HTMLInputElement);

  return {
    cancelButton: requireElement("export-cancel-button", HTMLButtonElement),
    node,
    startButton: requireElement("export-start-button", HTMLButtonElement),
    getSettings({ fallbackHeight = 0, fallbackWidth = 0 } = {}) {
      const width = Math.max(0, Math.round(Number(widthInput.value) || fallbackWidth));
      const height = Math.max(0, Math.round(Number(heightInput.value) || fallbackHeight));
      const requestedFps = Math.round(Number(fpsInput.value) || EXPORT_DEFAULT_FPS);
      const fps = getStableExportFps(requestedFps);
      const bitrateMbps = Math.min(
        Math.max(Number(bitrateInput.value) || EXPORT_DEFAULT_BITRATE / 1_000_000, 1),
        EXPORT_MAX_BITRATE / 1_000_000
      );
      const fileName = sanitizeExportFileName(fileNameInput.value || "video-overlay.mp4");

      fpsInput.value = String(fps);
      bitrateInput.value = String(bitrateMbps);

      return {
        bitrate: Math.round(bitrateMbps * 1_000_000),
        fileName,
        fps,
        height: height || undefined,
        width: width || undefined,
      };
    },
    hide() {
      node.hidden = true;
    },
    show({ fileName, height, width }) {
      widthInput.value = String(width || "");
      heightInput.value = String(height || "");
      fpsInput.value = String(EXPORT_DEFAULT_FPS);
      bitrateInput.value = String(EXPORT_DEFAULT_BITRATE / 1_000_000);
      fileNameInput.value = fileName;
      node.hidden = false;
    },
  };
}

function getStableExportFps(value) {
  return EXPORT_FPS_OPTIONS.reduce((closest, option) =>
    Math.abs(option - value) < Math.abs(closest - value) ? option : closest
  );
}
