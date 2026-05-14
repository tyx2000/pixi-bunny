const WORLD_WIDTH = 960;
const WORLD_HEIGHT = 360;
const GROUND_Y = 278;
const DINO_X = 92;
const GRAVITY = 2200;
const JUMP_VELOCITY = -760;
const START_SPEED = 330;
const MAX_SPEED = 720;

export function startJumpGame() {
  const canvas = document.getElementById("app-canvas");
  const scoreCount = document.getElementById("moves-count");
  const statusText = document.getElementById("status-text");
  const restartButton = document.getElementById("shuffle-button");
  const scoreLabel = scoreCount?.closest("span")?.firstChild;

  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("Canvas element #app-canvas was not found.");
  }

  if (
    !(scoreCount instanceof HTMLElement) ||
    !(statusText instanceof HTMLElement) ||
    !(restartButton instanceof HTMLButtonElement)
  ) {
    throw new Error("Jump game HUD elements were not found.");
  }

  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Canvas 2D rendering is not supported in this browser.");
  }

  if (scoreLabel) {
    scoreLabel.textContent = "Score: ";
  }

  document.documentElement.style.setProperty("--game-aspect", `${WORLD_WIDTH} / ${WORLD_HEIGHT}`);
  restartButton.textContent = "Restart";
  statusText.textContent = "Space / click to jump";

  const dino = {
    height: 46,
    vy: 0,
    width: 38,
    x: DINO_X,
    y: GROUND_Y - 46,
  };

  let animationFrameId = 0;
  let isLoopRunning = false;
  let lastFrameTime = 0;
  let score = 0;
  let speed = START_SPEED;
  let obstacleTimer = 0;
  let cloudTimer = 0;
  let groundOffset = 0;
  let isGameOver = false;
  let obstacles = [];
  let clouds = [];

  function resetGame() {
    dino.y = GROUND_Y - dino.height;
    dino.vy = 0;
    score = 0;
    speed = START_SPEED;
    obstacleTimer = 0.8;
    cloudTimer = 0.2;
    groundOffset = 0;
    isGameOver = false;
    obstacles = [];
    clouds = [];
    scoreCount.textContent = "0";
    restartButton.disabled = false;
    statusText.textContent = "Space / click to jump";
    stopLoop();
    draw();
    startLoop();
  }

  function resizeCanvasToDisplaySize() {
    const pixelRatio = window.devicePixelRatio || 1;
    const displayWidth = Math.floor(canvas.clientWidth * pixelRatio);
    const displayHeight = Math.floor(canvas.clientHeight * pixelRatio);

    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
      canvas.width = displayWidth;
      canvas.height = displayHeight;
    }
  }

  function toCanvasScale() {
    return {
      x: canvas.width / WORLD_WIDTH,
      y: canvas.height / WORLD_HEIGHT,
    };
  }

  function jump() {
    if (isGameOver) {
      resetGame();
      return;
    }

    if (dino.y >= GROUND_Y - dino.height - 0.5) {
      dino.vy = JUMP_VELOCITY;
      statusText.textContent = "Clear the cactus";
    }
  }

  function createObstacle() {
    const tall = Math.random() > 0.55;
    const width = tall ? 24 : 44;
    const height = tall ? 58 : 36;

    obstacles.push({
      height,
      type: tall ? "cactus" : "double-cactus",
      width,
      x: WORLD_WIDTH + 20,
      y: GROUND_Y - height,
    });
  }

  function createCloud() {
    clouds.push({
      speed: 24 + Math.random() * 24,
      x: WORLD_WIDTH + 80,
      y: 42 + Math.random() * 86,
    });
  }

  function update(deltaTime) {
    if (isGameOver) {
      return;
    }

    score += deltaTime * 10;
    speed = Math.min(MAX_SPEED, START_SPEED + score * 2.7);
    scoreCount.textContent = String(Math.floor(score));

    dino.vy += GRAVITY * deltaTime;
    dino.y += dino.vy * deltaTime;

    if (dino.y > GROUND_Y - dino.height) {
      dino.y = GROUND_Y - dino.height;
      dino.vy = 0;
    }

    groundOffset = (groundOffset + speed * deltaTime) % 36;
    obstacleTimer -= deltaTime;
    cloudTimer -= deltaTime;

    if (obstacleTimer <= 0) {
      createObstacle();
      obstacleTimer = 0.72 + Math.random() * 0.92 - Math.min(score / 1800, 0.34);
    }

    if (cloudTimer <= 0) {
      createCloud();
      cloudTimer = 1.8 + Math.random() * 2.4;
    }

    for (const obstacle of obstacles) {
      obstacle.x -= speed * deltaTime;
    }

    for (const cloud of clouds) {
      cloud.x -= cloud.speed * deltaTime;
    }

    obstacles = obstacles.filter((obstacle) => obstacle.x + obstacle.width > -20);
    clouds = clouds.filter((cloud) => cloud.x > -120);

    if (obstacles.some((obstacle) => intersects(getDinoHitBox(), getObstacleHitBox(obstacle)))) {
      isGameOver = true;
      statusText.textContent = "Game over";
    }
  }

  function getDinoHitBox() {
    return {
      height: dino.height - 8,
      width: dino.width - 10,
      x: dino.x + 6,
      y: dino.y + 5,
    };
  }

  function getObstacleHitBox(obstacle) {
    return {
      height: obstacle.height - 7,
      width: obstacle.width - 8,
      x: obstacle.x + 4,
      y: obstacle.y + 6,
    };
  }

  function intersects(a, b) {
    return (
      a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
    );
  }

  function draw() {
    resizeCanvasToDisplaySize();

    const scale = toCanvasScale();

    ctx.save();
    ctx.setTransform(scale.x, 0, 0, scale.y, 0, 0);
    ctx.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    drawClouds();
    drawGround();
    drawDino();

    for (const obstacle of obstacles) {
      drawObstacle(obstacle);
    }

    if (isGameOver) {
      drawGameOver();
    }

    ctx.restore();
  }

  function drawClouds() {
    ctx.fillStyle = "#d1d5db";

    for (const cloud of clouds) {
      ctx.beginPath();
      ctx.roundRect(cloud.x, cloud.y, 72, 12, 6);
      ctx.roundRect(cloud.x + 16, cloud.y - 10, 28, 20, 10);
      ctx.roundRect(cloud.x + 38, cloud.y - 7, 24, 16, 8);
      ctx.fill();
    }
  }

  function drawGround() {
    ctx.strokeStyle = "#4b5563";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(WORLD_WIDTH, GROUND_Y);
    ctx.stroke();

    ctx.fillStyle = "#6b7280";

    for (let x = -groundOffset; x < WORLD_WIDTH; x += 36) {
      ctx.fillRect(x, GROUND_Y + 18, 14, 2);
      ctx.fillRect(x + 22, GROUND_Y + 10, 6, 2);
    }
  }

  function drawDino() {
    const legOffset = Math.floor(score / 3) % 2 === 0 && dino.vy === 0 ? 0 : 5;

    ctx.fillStyle = "#111827";
    ctx.fillRect(dino.x + 8, dino.y + 4, 24, 22);
    ctx.fillRect(dino.x + 24, dino.y, 18, 16);
    ctx.fillRect(dino.x + 4, dino.y + 24, 26, 14);
    ctx.fillRect(dino.x, dino.y + 17, 12, 5);
    ctx.fillRect(dino.x + 9, dino.y + 37, 8, 9 + legOffset);
    ctx.fillRect(dino.x + 25, dino.y + 37, 8, 14 - legOffset);
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(dino.x + 36, dino.y + 5, 3, 3);
  }

  function drawObstacle(obstacle) {
    ctx.fillStyle = "#166534";

    if (obstacle.type === "double-cactus") {
      drawCactus(obstacle.x, obstacle.y + 6, 18, obstacle.height - 6);
      drawCactus(obstacle.x + 20, obstacle.y, 18, obstacle.height);
      return;
    }

    drawCactus(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
  }

  function drawCactus(x, y, width, height) {
    const stemWidth = Math.max(10, width * 0.42);
    const stemX = x + (width - stemWidth) / 2;

    ctx.fillRect(stemX, y, stemWidth, height);
    ctx.fillRect(stemX - 8, y + height * 0.35, 9, stemWidth);
    ctx.fillRect(stemX + stemWidth - 1, y + height * 0.22, 9, stemWidth);
    ctx.fillRect(stemX - 8, y + height * 0.25, stemWidth, 8);
    ctx.fillRect(stemX + stemWidth - 1, y + height * 0.12, stemWidth, 8);
  }

  function drawGameOver() {
    ctx.fillStyle = "rgb(17 24 39 / 0.88)";
    ctx.fillRect(WORLD_WIDTH / 2 - 132, WORLD_HEIGHT / 2 - 40, 264, 80);
    ctx.fillStyle = "#f8fafc";
    ctx.font = "700 24px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("GAME OVER", WORLD_WIDTH / 2, WORLD_HEIGHT / 2 - 4);
    ctx.font = "14px Inter, system-ui, sans-serif";
    ctx.fillText("Press Space or click to restart", WORLD_WIDTH / 2, WORLD_HEIGHT / 2 + 24);
  }

  function loop(frameTime) {
    const deltaTime = Math.min((frameTime - lastFrameTime) / 1000, 0.033);
    lastFrameTime = frameTime;

    update(deltaTime);
    draw();

    if (isGameOver) {
      isLoopRunning = false;
      return;
    }

    animationFrameId = requestAnimationFrame(loop);
  }

  function startLoop() {
    if (isLoopRunning) {
      return;
    }

    isLoopRunning = true;
    lastFrameTime = performance.now();
    animationFrameId = requestAnimationFrame(loop);
  }

  function stopLoop() {
    isLoopRunning = false;
    cancelAnimationFrame(animationFrameId);
  }

  function handleKeyDown(event) {
    if (event.code !== "Space" && event.code !== "ArrowUp") {
      return;
    }

    event.preventDefault();
    jump();
  }

  function handlePointerDown() {
    jump();
  }

  canvas.addEventListener("pointerdown", handlePointerDown);
  restartButton.addEventListener("click", resetGame);
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("resize", draw);

  resetGame();

  return () => {
    stopLoop();
    canvas.removeEventListener("pointerdown", handlePointerDown);
    restartButton.removeEventListener("click", resetGame);
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("resize", draw);
  };
}
