import { requireElement } from "./dom-controls.js";

export function createSubtitleControls() {
  const colorInput = requireElement("subtitle-color-input", HTMLInputElement);
  const sizeInput = requireElement("subtitle-size-input", HTMLInputElement);
  const weightSelect = requireElement("subtitle-weight-select", HTMLSelectElement);
  const fontSelect = requireElement("subtitle-font-select", HTMLSelectElement);
  const alignSelect = requireElement("subtitle-align-select", HTMLSelectElement);
  const lineHeightInput = requireElement("subtitle-line-height-input", HTMLInputElement);
  const strokeColorInput = requireElement("subtitle-stroke-color-input", HTMLInputElement);
  const strokeWidthInput = requireElement("subtitle-stroke-width-input", HTMLInputElement);
  const shadowColorInput = requireElement("subtitle-shadow-color-input", HTMLInputElement);
  const shadowBlurInput = requireElement("subtitle-shadow-blur-input", HTMLInputElement);
  const shadowDistanceInput = requireElement("subtitle-shadow-distance-input", HTMLInputElement);
  const backgroundColorInput = requireElement("subtitle-background-color-input", HTMLInputElement);
  const backgroundAlphaInput = requireElement("subtitle-background-alpha-input", HTMLInputElement);

  return {
    alignSelect,
    applyAllButton: requireElement("apply-subtitle-style-all-button", HTMLButtonElement),
    backgroundAlphaInput,
    backgroundColorInput,
    button: requireElement("subtitle-button", HTMLButtonElement),
    colorInput,
    contextMenu: requireElement("subtitle-context-menu", HTMLDivElement),
    editInput: requireElement("subtitle-edit-input", HTMLInputElement),
    fontSelect,
    lineHeightInput,
    panel: requireElement("subtitle-panel", HTMLElement),
    panelList: requireElement("subtitle-panel-list", HTMLDivElement),
    shadowBlurInput,
    shadowColorInput,
    shadowDistanceInput,
    sizeInput,
    strokeColorInput,
    strokeWidthInput,
    styleFields: [
      colorInput,
      sizeInput,
      weightSelect,
      fontSelect,
      alignSelect,
      lineHeightInput,
      strokeColorInput,
      strokeWidthInput,
      shadowColorInput,
      shadowBlurInput,
      shadowDistanceInput,
      backgroundColorInput,
      backgroundAlphaInput,
    ],
    weightSelect,
  };
}
