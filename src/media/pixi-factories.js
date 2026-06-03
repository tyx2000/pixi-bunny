import { Graphics } from "pixi.js";
import { IMAGE_OVERLAY_HANDLE_RADIUS } from "./constants.js";

export function createImageResizeHandle(corner) {
  const handle = new Graphics();

  handle.circle(0, 0, IMAGE_OVERLAY_HANDLE_RADIUS).fill({ color: 0xffffff, alpha: 0.001 });
  handle.eventMode = "static";
  handle.cursor = corner === "tl" || corner === "br" ? "nwse-resize" : "nesw-resize";

  return handle;
}
