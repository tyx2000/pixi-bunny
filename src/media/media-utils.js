import { AUDIO_EXTENSIONS, IMAGE_EXTENSIONS, VIDEO_EXTENSIONS } from "./constants.js";

export function getFileExtension(file) {
  return file.name.split(".").pop()?.toLowerCase() || "";
}

export function getMediaKind(file) {
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

export function waitForMediaReady(element, eventName, label, targetReadyState = 0) {
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

export function loadImageElement(src) {
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
