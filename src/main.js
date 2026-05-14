import { startJumpGame } from "./jump.js";
import { startPixiJumpGame } from "./pixi-jump.js";
import { startPixiMedia } from "./pixi-media.js";
import { startPixiPuzzle } from "./pixi-puzzle.js";
import { startPuzzle } from "./puzzle.js";
import { startSnooker } from "./snooker.js";
import "./style.css";

const game = new URLSearchParams(window.location.search).get("game") || "puzzle";

if (game === "snooker") {
  startSnooker();
} else if (game === "pixi-puzzle") {
  startPixiPuzzle();
} else if (game === "jump") {
  startJumpGame();
} else if (game === "pixi-jump") {
  startPixiJumpGame();
} else if (game === "pixi-media") {
  startPixiMedia();
} else {
  startPuzzle();
}
