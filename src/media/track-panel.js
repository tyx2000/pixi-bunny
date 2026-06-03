import { requireElement } from "./dom-controls.js";
import { createProjectHistoryPanel } from "./project-history-panel.js";

export function createTrackPanel({ onExportProject, onRestoreProject }) {
  const rows = requireElement("track-panel-rows", HTMLDivElement);
  const projectHistoryPanel = createProjectHistoryPanel({
    onExport: onExportProject,
    onRestore: onRestoreProject,
  });

  return {
    node: requireElement("track-panel", HTMLElement),
    projectHistoryPanel,
    renderRows(types, trackControlState, getTrackTypeLabel) {
      rows.replaceChildren();
      types.forEach((type) => {
        rows.append(createTrackPanelRow(type, trackControlState, getTrackTypeLabel));
      });
    },
    rows,
    saveProjectButton: requireElement("save-project-button", HTMLButtonElement),
  };
}

function createTrackPanelRow(type, trackControlState, getTrackTypeLabel) {
  const row = document.createElement("div");
  const label = document.createElement("span");
  const controlKeys =
    type === "video" || type === "audio" ? ["locked", "hidden", "muted"] : ["locked", "hidden"];

  row.className = "track-panel-row";
  label.textContent = getTrackTypeLabel(type);

  controlKeys.forEach((key) => {
    const controlLabel = document.createElement("label");
    const input = document.createElement("input");
    const text = document.createElement("span");

    controlLabel.className = "track-panel-control";
    input.type = "checkbox";
    input.checked = Boolean(trackControlState[type]?.[key]);
    input.ariaLabel = `${getTrackTypeLabel(type)} ${key}`;
    input.dataset.trackType = type;
    input.dataset.trackKey = key;
    text.textContent = getTrackControlLabel(key);
    controlLabel.append(input, text);
    row.append(controlLabel);
  });

  row.prepend(label);
  return row;
}

function getTrackControlLabel(key) {
  if (key === "locked") {
    return "锁定";
  }
  if (key === "hidden") {
    return "隐藏";
  }
  return "静音";
}
