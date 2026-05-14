import fogUrl from "./assets/fog.jpg";

const COLS = 8;
const ROWS = 6;
const TILE_COUNT = COLS * ROWS;
const EMPTY = -1;
const SHUFFLE_INSTANT_STEPS = 520;
const SHUFFLE_ANIMATED_STEPS = 24;
const MOVE_DURATION = 180;
const SHUFFLE_MOVE_DURATION = 36;

export function startPuzzle() {
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

  const gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: true,
  });

  if (!gl) {
    throw new Error("WebGL is not supported in this browser.");
  }

  let imageWidth = 1;
  let imageHeight = 1;
  let board = createSolvedBoard(0);
  let emptyIndex = 0;
  let hiddenTile = 0;
  let moves = 0;
  let completed = false;
  let moveAnimation = null;
  let shuffleQueue = [];
  let isShuffling = false;

  const shaderProgram = applyShader(
    `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;

      uniform vec2 u_resolution;

      varying vec2 v_texCoord;

      void main() {
        vec2 zeroToOne = a_position / u_resolution;
        vec2 clipSpace = zeroToOne * 2.0 - 1.0;

        gl_Position = vec4(clipSpace.x, -clipSpace.y, 0.0, 1.0);
        v_texCoord = a_texCoord;
      }
    `,
    `
      precision mediump float;

      uniform sampler2D u_image;

      varying vec2 v_texCoord;

      void main() {
        gl_FragColor = texture2D(u_image, v_texCoord);
      }
    `
  );

  function createSolvedBoard(missingIndex) {
    return Array.from({ length: TILE_COUNT }, (_, index) =>
      index === missingIndex ? EMPTY : index
    );
  }

  function resizeCanvasToDisplaySize() {
    const pixelRatio = window.devicePixelRatio || 1;
    const displayWidth = Math.floor(canvas.clientWidth * pixelRatio);
    const displayHeight = Math.floor(canvas.clientHeight * pixelRatio);

    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
      canvas.width = displayWidth;
      canvas.height = displayHeight;
      return true;
    }

    return false;
  }

  function createShader(type, source) {
    const shader = gl.createShader(type);

    if (!shader) {
      throw new Error("Unable to create shader.");
    }

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader) || "Unknown shader compile error.";
      gl.deleteShader(shader);
      throw new Error(message);
    }

    return shader;
  }

  function applyShader(vertexSource, fragmentSource) {
    const vertexShader = createShader(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = createShader(gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();

    if (!program) {
      throw new Error("Unable to create shader program.");
    }

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(program) || "Unknown shader link error.";
      gl.deleteProgram(program);
      throw new Error(message);
    }

    const positionBuffer = gl.createBuffer();
    const texCoordBuffer = gl.createBuffer();
    const positionLocation = gl.getAttribLocation(program, "a_position");
    const texCoordLocation = gl.getAttribLocation(program, "a_texCoord");
    const resolutionLocation = gl.getUniformLocation(program, "u_resolution");
    const imageLocation = gl.getUniformLocation(program, "u_image");

    if (
      !positionBuffer ||
      !texCoordBuffer ||
      positionLocation < 0 ||
      texCoordLocation < 0 ||
      !resolutionLocation ||
      !imageLocation
    ) {
      gl.deleteProgram(program);
      throw new Error("Unable to initialize shader locations.");
    }

    return {
      imageLocation,
      positionBuffer,
      positionLocation,
      program,
      resolutionLocation,
      texCoordBuffer,
      texCoordLocation,
    };
  }

  function createTexture(image) {
    const texture = gl.createTexture();

    if (!texture) {
      throw new Error("Unable to create texture.");
    }

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

    return texture;
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Unable to load image: ${src}`));
      image.src = src;
    });
  }

  function clearCanvas() {
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0.03, 0.04, 0.06, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  function getGridPosition(index) {
    return {
      col: index % COLS,
      row: Math.floor(index / COLS),
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
    shuffleQueue = [];
    isShuffling = animate;
    updateHud();

    if (!animate) {
      render();
      return;
    }

    for (let step = 0; step < SHUFFLE_ANIMATED_STEPS; step += 1) {
      const nextIndex = pickShuffleMove(previousEmptyIndex);
      shuffleQueue.push(nextIndex);
      previousEmptyIndex = emptyIndex;
      swapWithEmpty(nextIndex);
    }

    for (let step = shuffleQueue.length - 1; step >= 0; step -= 1) {
      swapWithEmpty(shuffleQueue[step]);
    }

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

  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  }

  function lerp(start, end, amount) {
    return start + (end - start) * amount;
  }

  function drawTileAtGridPosition(destination, sourceIndex, revealMode = false) {
    const source = getGridPosition(sourceIndex);
    const tileWidth = gl.drawingBufferWidth / COLS;
    const tileHeight = gl.drawingBufferHeight / ROWS;
    const gap = revealMode ? 0 : Math.max(1, Math.round(gl.drawingBufferWidth / 1200));
    const x1 = destination.col * tileWidth + gap / 2;
    const y1 = destination.row * tileHeight + gap / 2;
    const x2 = (destination.col + 1) * tileWidth - gap / 2;
    const y2 = (destination.row + 1) * tileHeight - gap / 2;
    const u1 = (source.col * imageWidth) / COLS / imageWidth;
    const v1 = (source.row * imageHeight) / ROWS / imageHeight;
    const u2 = ((source.col + 1) * imageWidth) / COLS / imageWidth;
    const v2 = ((source.row + 1) * imageHeight) / ROWS / imageHeight;

    gl.bindBuffer(gl.ARRAY_BUFFER, shaderProgram.positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2]),
      gl.STREAM_DRAW
    );
    gl.enableVertexAttribArray(shaderProgram.positionLocation);
    gl.vertexAttribPointer(shaderProgram.positionLocation, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, shaderProgram.texCoordBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([u1, v1, u2, v1, u1, v2, u1, v2, u2, v1, u2, v2]),
      gl.STREAM_DRAW
    );
    gl.enableVertexAttribArray(shaderProgram.texCoordLocation);
    gl.vertexAttribPointer(shaderProgram.texCoordLocation, 2, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function drawTile(destinationIndex, sourceIndex, revealMode = false) {
    drawTileAtGridPosition(getGridPosition(destinationIndex), sourceIndex, revealMode);
  }

  function createMoveAnimation(tileIndex, duration, onComplete) {
    moveAnimation = {
      duration,
      from: getGridPosition(tileIndex),
      onComplete,
      sourceIndex: board[tileIndex],
      startedAt: performance.now(),
      tileIndex,
      to: getGridPosition(emptyIndex),
    };
    updateHud();
    requestAnimationFrame(render);
  }

  function completeMoveAnimation() {
    if (!moveAnimation) {
      return;
    }

    const { onComplete } = moveAnimation;
    moveAnimation = null;
    onComplete();
    updateHud();
  }

  function playNextShuffleMove() {
    if (shuffleQueue.length === 0) {
      isShuffling = false;
      moves = 0;
      updateHud();
      render();
      return;
    }

    const tileIndex = shuffleQueue.shift();
    createMoveAnimation(tileIndex, SHUFFLE_MOVE_DURATION, () => {
      swapWithEmpty(tileIndex);
      playNextShuffleMove();
    });
  }

  function render(frameTime = performance.now()) {
    resizeCanvasToDisplaySize();
    clearCanvas();

    gl.useProgram(shaderProgram.program);
    gl.uniform2f(shaderProgram.resolutionLocation, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform1i(shaderProgram.imageLocation, 0);

    if (completed) {
      for (let index = 0; index < TILE_COUNT; index += 1) {
        drawTile(index, index, true);
      }

      return;
    }

    for (let index = 0; index < TILE_COUNT; index += 1) {
      const tile = board[index];

      if (tile !== EMPTY && index !== moveAnimation?.tileIndex) {
        drawTile(index, tile);
      }
    }

    if (moveAnimation) {
      const elapsed = frameTime - moveAnimation.startedAt;
      const progress = Math.min(1, elapsed / moveAnimation.duration);
      const easedProgress = easeInOut(progress);
      const position = {
        col: lerp(moveAnimation.from.col, moveAnimation.to.col, easedProgress),
        row: lerp(moveAnimation.from.row, moveAnimation.to.row, easedProgress),
      };

      drawTileAtGridPosition(position, moveAnimation.sourceIndex);

      if (progress < 1) {
        requestAnimationFrame(render);
      } else {
        completeMoveAnimation();
        render();
      }
    }
  }

  function getClickedTile(event) {
    const bounds = canvas.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;

    if (x < 0 || y < 0 || x > bounds.width || y > bounds.height) {
      return -1;
    }

    const col = Math.min(COLS - 1, Math.floor((x / bounds.width) * COLS));
    const row = Math.min(ROWS - 1, Math.floor((y / bounds.height) * ROWS));

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
      }

      updateHud();
    });
  }

  function resizeAndRender() {
    render();
  }

  async function init() {
    const image = await loadImage(fogUrl);
    imageWidth = image.naturalWidth;
    imageHeight = image.naturalHeight;
    document.documentElement.style.setProperty("--game-aspect", `${imageWidth} / ${imageHeight}`);

    const texture = createTexture(image);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);

    shuffleBoard(false);
    render();
  }

  canvas.addEventListener("click", handleTileClick);
  shuffleButton.addEventListener("click", () => {
    shuffleBoard();
  });
  window.addEventListener("resize", resizeAndRender);

  init().catch((error) => {
    statusText.textContent = "Image failed to load";
    throw error;
  });

  return () => {
    canvas.removeEventListener("click", handleTileClick);
    window.removeEventListener("resize", resizeAndRender);
  };
}
