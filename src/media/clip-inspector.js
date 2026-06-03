import { requireElement } from "./dom-controls.js";

export function createClipInspector() {
  const startInput = requireElement("clip-start-input", HTMLInputElement);
  const durationInput = requireElement("clip-duration-input", HTMLInputElement);
  const endInput = requireElement("clip-end-input", HTMLInputElement);
  const textInput = requireElement("clip-text-input", HTMLInputElement);
  const volumeInput = requireElement("clip-volume-input", HTMLInputElement);
  const mutedInput = requireElement("clip-muted-input", HTMLInputElement);
  const transitionSelect = requireElement("clip-transition-select", HTMLSelectElement);
  const transitionDurationInput = requireElement(
    "clip-transition-duration-input",
    HTMLInputElement
  );
  const subtitleColorInput = requireElement("clip-subtitle-color-input", HTMLInputElement);
  const subtitleSizeInput = requireElement("clip-subtitle-size-input", HTMLInputElement);
  const subtitleWeightSelect = requireElement(
    "clip-subtitle-weight-select",
    HTMLSelectElement
  );
  const subtitleFontSelect = requireElement("clip-subtitle-font-select", HTMLSelectElement);
  const subtitleAlignSelect = requireElement("clip-subtitle-align-select", HTMLSelectElement);
  const subtitleLineHeightInput = requireElement(
    "clip-subtitle-line-height-input",
    HTMLInputElement
  );
  const subtitleStrokeColorInput = requireElement(
    "clip-subtitle-stroke-color-input",
    HTMLInputElement
  );
  const subtitleStrokeWidthInput = requireElement(
    "clip-subtitle-stroke-width-input",
    HTMLInputElement
  );
  const subtitleShadowColorInput = requireElement(
    "clip-subtitle-shadow-color-input",
    HTMLInputElement
  );
  const subtitleShadowBlurInput = requireElement(
    "clip-subtitle-shadow-blur-input",
    HTMLInputElement
  );
  const subtitleShadowDistanceInput = requireElement(
    "clip-subtitle-shadow-distance-input",
    HTMLInputElement
  );
  const subtitleBackgroundColorInput = requireElement(
    "clip-subtitle-background-color-input",
    HTMLInputElement
  );
  const subtitleBackgroundAlphaInput = requireElement(
    "clip-subtitle-background-alpha-input",
    HTMLInputElement
  );
  const timingLabels = [
    requireElement("clip-start-label", HTMLLabelElement),
    requireElement("clip-duration-label", HTMLLabelElement),
    requireElement("clip-end-label", HTMLLabelElement),
  ];
  const textLabel = requireElement("clip-text-label", HTMLLabelElement);
  const audioLabels = [
    requireElement("clip-volume-label", HTMLLabelElement),
    requireElement("clip-muted-label", HTMLLabelElement),
  ];
  const overlayLabels = [
    requireElement("clip-transition-label", HTMLLabelElement),
    requireElement("clip-transition-duration-label", HTMLLabelElement),
  ];
  const subtitleStyleLabels = [
    requireElement("clip-subtitle-color-label", HTMLLabelElement),
    requireElement("clip-subtitle-size-label", HTMLLabelElement),
    requireElement("clip-subtitle-weight-label", HTMLLabelElement),
    requireElement("clip-subtitle-font-label", HTMLLabelElement),
    requireElement("clip-subtitle-align-label", HTMLLabelElement),
    requireElement("clip-subtitle-line-height-label", HTMLLabelElement),
    requireElement("clip-subtitle-stroke-color-label", HTMLLabelElement),
    requireElement("clip-subtitle-stroke-width-label", HTMLLabelElement),
    requireElement("clip-subtitle-shadow-color-label", HTMLLabelElement),
    requireElement("clip-subtitle-shadow-blur-label", HTMLLabelElement),
    requireElement("clip-subtitle-shadow-distance-label", HTMLLabelElement),
    requireElement("clip-subtitle-background-color-label", HTMLLabelElement),
    requireElement("clip-subtitle-background-alpha-label", HTMLLabelElement),
    requireElement("clip-subtitle-apply-all-button", HTMLButtonElement),
  ];

  return {
    allSettingNodes: [
      ...timingLabels,
      textLabel,
      ...audioLabels,
      ...overlayLabels,
      ...subtitleStyleLabels,
    ],
    audioLabels,
    controlFields: [
      startInput,
      durationInput,
      endInput,
      textInput,
      volumeInput,
      mutedInput,
      transitionSelect,
      transitionDurationInput,
      subtitleColorInput,
      subtitleSizeInput,
      subtitleWeightSelect,
      subtitleFontSelect,
      subtitleAlignSelect,
      subtitleLineHeightInput,
      subtitleStrokeColorInput,
      subtitleStrokeWidthInput,
      subtitleShadowColorInput,
      subtitleShadowBlurInput,
      subtitleShadowDistanceInput,
      subtitleBackgroundColorInput,
      subtitleBackgroundAlphaInput,
    ],
    durationInput,
    endInput,
    mutedInput,
    node: requireElement("clip-inspector", HTMLElement),
    overlayLabels,
    startInput,
    subtitleAlignSelect,
    subtitleApplyAllButton: requireElement(
      "clip-subtitle-apply-all-button",
      HTMLButtonElement
    ),
    subtitleBackgroundAlphaInput,
    subtitleBackgroundColorInput,
    subtitleColorInput,
    subtitleFontSelect,
    subtitleLineHeightInput,
    subtitleShadowBlurInput,
    subtitleShadowColorInput,
    subtitleShadowDistanceInput,
    subtitleSizeInput,
    subtitleStrokeColorInput,
    subtitleStrokeWidthInput,
    subtitleStyleLabels,
    subtitleWeightSelect,
    textInput,
    textLabel,
    title: requireElement("clip-inspector-title", HTMLElement),
    timingLabels,
    transitionDurationInput,
    transitionSelect,
    volumeInput,
  };
}
