import { Application, Assets, Container, Rectangle, Sprite, Texture } from "pixi.js";
import fogUrl from "./assets/fog.jpg";

const COLS = 8;
const ROWS = 6;
const TILE_COUNT = COLS * ROWS;
const EMPTY = -1;
const SHUFFLE_INSTANT_STEPS = 520;
const SHUFFLE_ANIMATED_STEPS = 24;
const MOVE_DURATION = 180;
const SHUFFLE_MOVE_DURATION = 36;

export async function startPixiPuzzle() {
  const canvas = document.getElementById("app-canvas");
  const movesCount = document.getElementById("moves-count");
  const statusText = document.getElementById("status-text");
  const shuffleButton = document.getElementById("shuffle-button");

  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("Canvas element #app-canvas was not found.");
  }

  if (
    !(movesCount instanceof HTMLElement) ||
    !(statusText instanceof HTMLElement) ||
    !(shuffleButton instanceof HTMLButtonElement)
  ) {
    throw new Error("Puzzle HUD elements were not found.");
  }

  const baseTexture = await Assets.load(fogUrl);
  const imageWidth = baseTexture.width;
  const imageHeight = baseTexture.height;
  const tileWidth = imageWidth / COLS;
  const tileHeight = imageHeight / ROWS;

  document.documentElement.style.setProperty("--game-aspect", `${imageWidth} / ${imageHeight}`);

  const app = new Application();

  await app.init({
    canvas,
    width: imageWidth,
    height: imageHeight,
    backgroundColor: 0x020617,
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  });
  maintainCanvasLayout();

  const boardLayer = new Container();
  const tileSprites = createTileSprites(baseTexture);

  app.stage.addChild(boardLayer);

  for (const sprite of tileSprites) {
    boardLayer.addChild(sprite);
  }

  let board = createSolvedBoard(0);
  let emptyIndex = 0;
  let hiddenTile = 0;
  let moves = 0;
  let completed = false;
  let moveAnimation = null;
  let isShuffling = false;
  let shuffleStepsRemaining = 0;
  let shufflePreviousEmptyIndex = -1;

  function createSolvedBoard(missingIndex) {
    return Array.from({ length: TILE_COUNT }, (_, index) =>
      index === missingIndex ? EMPTY : index
    );
  }

  function createTileSprites(texture) {
    return Array.from({ length: TILE_COUNT }, (_, index) => {
      const { col, row } = getGridPosition(index);
      const frame = new Rectangle(col * tileWidth, row * tileHeight, tileWidth, tileHeight);
      const tileTexture = new Texture({
        source: texture.source,
        frame,
      });
      const sprite = new Sprite(tileTexture);

      sprite.width = tileWidth;
      sprite.height = tileHeight;
      sprite.eventMode = "none";

      return sprite;
    });
  }

  function getGridPosition(index) {
    return {
      col: index % COLS,
      row: Math.floor(index / COLS),
    };
  }

  function getSlotPosition(index) {
    const { col, row } = getGridPosition(index);

    return {
      x: col * tileWidth,
      y: row * tileHeight,
    };
  }

  function getAdjacentIndexes(index) {
    const { col, row } = getGridPosition(index);
    const adjacent = [];

    if (col > 0) {
      adjacent.push(index - 1);
    }

    if (col < COLS - 1) {
      adjacent.push(index + 1);
    }

    if (row > 0) {
      adjacent.push(index - COLS);
    }

    if (row < ROWS - 1) {
      adjacent.push(index + COLS);
    }

    return adjacent;
  }

  function isAdjacent(a, b) {
    return getAdjacentIndexes(a).includes(b);
  }

  function swapWithEmpty(tileIndex) {
    board[emptyIndex] = board[tileIndex];
    board[tileIndex] = EMPTY;
    emptyIndex = tileIndex;
  }

  function pickShuffleMove(previousEmptyIndex = -1) {
    const candidates = getAdjacentIndexes(emptyIndex).filter(
      (index) => index !== previousEmptyIndex
    );
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  function shuffleBoard(animate = true) {
    hiddenTile = Math.floor(Math.random() * TILE_COUNT);
    board = createSolvedBoard(hiddenTile);
    emptyIndex = hiddenTile;

    let previousEmptyIndex = -1;

    for (let step = 0; step < SHUFFLE_INSTANT_STEPS; step += 1) {
      const nextIndex = pickShuffleMove(previousEmptyIndex);
      previousEmptyIndex = emptyIndex;
      swapWithEmpty(nextIndex);
    }

    moves = 0;
    completed = false;
    moveAnimation = null;
    isShuffling = animate;
    shuffleStepsRemaining = animate ? SHUFFLE_ANIMATED_STEPS : 0;
    shufflePreviousEmptyIndex = previousEmptyIndex;
    updateHud();

    if (!animate) {
      syncSpritesToBoard();
      return;
    }

    syncSpritesToBoard();
    playNextShuffleMove();
  }

  function updateHud() {
    movesCount.textContent = String(moves);
    statusText.textContent = completed
      ? "Complete"
      : isShuffling
        ? "Shuffling"
        : "Find the empty neighbor";
    shuffleButton.textContent = completed ? "New puzzle" : "Shuffle";
    shuffleButton.disabled = isShuffling || Boolean(moveAnimation);
  }

  function isSolved() {
    return board.every((tile, index) => {
      if (tile === EMPTY) {
        return index === hiddenTile;
      }

      return tile === index;
    });
  }

  function syncSpritesToBoard() {
    for (let slotIndex = 0; slotIndex < TILE_COUNT; slotIndex += 1) {
      const tileIndex = board[slotIndex];

      if (tileIndex === EMPTY) {
        continue;
      }

      const sprite = tileSprites[tileIndex];
      const position = getSlotPosition(slotIndex);
      sprite.position.set(position.x, position.y);
      sprite.visible = true;
    }

    tileSprites[hiddenTile].visible = completed;
  }

  function revealCompletedImage() {
    for (let tileIndex = 0; tileIndex < TILE_COUNT; tileIndex += 1) {
      const sprite = tileSprites[tileIndex];
      const position = getSlotPosition(tileIndex);
      sprite.position.set(position.x, position.y);
      sprite.visible = true;
    }
  }

  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  }

  function lerp(start, end, amount) {
    return start + (end - start) * amount;
  }

  function createMoveAnimation(tileIndex, duration, onComplete) {
    const sourceIndex = board[tileIndex];
    const sprite = tileSprites[sourceIndex];

    if (sourceIndex === EMPTY || !sprite) {
      throw new Error("Cannot animate an empty puzzle slot.");
    }

    const from = getSlotPosition(tileIndex);
    const to = getSlotPosition(emptyIndex);

    moveAnimation = {
      duration,
      from,
      onComplete,
      sprite,
      startedAt: performance.now(),
      to,
    };
    updateHud();
    app.ticker.add(runMoveAnimation);
  }

  function runMoveAnimation() {
    if (!moveAnimation) {
      app.ticker.remove(runMoveAnimation);
      return;
    }

    const elapsed = performance.now() - moveAnimation.startedAt;
    const progress = Math.min(1, elapsed / moveAnimation.duration);
    const easedProgress = easeInOut(progress);

    moveAnimation.sprite.position.set(
      lerp(moveAnimation.from.x, moveAnimation.to.x, easedProgress),
      lerp(moveAnimation.from.y, moveAnimation.to.y, easedProgress)
    );

    if (progress < 1) {
      return;
    }

    const { onComplete } = moveAnimation;
    moveAnimation = null;
    app.ticker.remove(runMoveAnimation);
    onComplete();
    updateHud();
  }

  function playNextShuffleMove() {
    if (shuffleStepsRemaining === 0) {
      isShuffling = false;
      moves = 0;
      updateHud();
      syncSpritesToBoard();
      return;
    }

    const tileIndex = pickShuffleMove(shufflePreviousEmptyIndex);
    shufflePreviousEmptyIndex = emptyIndex;
    shuffleStepsRemaining -= 1;

    createMoveAnimation(tileIndex, SHUFFLE_MOVE_DURATION, () => {
      swapWithEmpty(tileIndex);
      playNextShuffleMove();
    });
  }

  function getClickedTile(event) {
    const point = event.getLocalPosition(boardLayer);
    const col = Math.floor(point.x / tileWidth);
    const row = Math.floor(point.y / tileHeight);

    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) {
      return -1;
    }

    return row * COLS + col;
  }

  function handleTileClick(event) {
    if (completed || isShuffling || moveAnimation) {
      return;
    }

    const tileIndex = getClickedTile(event);

    if (tileIndex < 0 || board[tileIndex] === EMPTY || !isAdjacent(tileIndex, emptyIndex)) {
      return;
    }

    createMoveAnimation(tileIndex, MOVE_DURATION, () => {
      swapWithEmpty(tileIndex);
      moves += 1;

      if (isSolved()) {
        completed = true;
        revealCompletedImage();
      } else {
        syncSpritesToBoard();
      }

      updateHud();
    });
  }

  function resizeCanvas() {
    maintainCanvasLayout();
    const bounds = canvas.getBoundingClientRect();
    app.renderer.resize(Math.max(1, bounds.width), Math.max(1, bounds.height));
    boardLayer.scale.set(app.screen.width / imageWidth, app.screen.height / imageHeight);
    maintainCanvasLayout();
  }

  function maintainCanvasLayout() {
    canvas.style.width = "100%";
    canvas.style.height = "auto";
  }

  boardLayer.eventMode = "static";
  boardLayer.hitArea = new Rectangle(0, 0, imageWidth, imageHeight);
  boardLayer.on("pointerdown", handleTileClick);
  shuffleButton.addEventListener("click", () => {
    shuffleBoard();
  });
  window.addEventListener("resize", resizeCanvas);

  shuffleBoard(false);
  resizeCanvas();

  return () => {
    boardLayer.off("pointerdown", handleTileClick);
    window.removeEventListener("resize", resizeCanvas);
    app.destroy(false);
  };
}
