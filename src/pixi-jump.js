import {
  Application,
  Container,
  CullerPlugin,
  Graphics,
  Rectangle,
  Text,
  extensions,
} from "pixi.js";

const WORLD_WIDTH = 960;
const WORLD_HEIGHT = 360;
const GROUND_Y = 278;
const DINO_X = 92;
const GRAVITY = 2200;
const JUMP_VELOCITY = -760;
const START_SPEED = 330;
const MAX_SPEED = 720;
const CLOUD_CULL_AREA = new Rectangle(0, 0, 72, 22);

extensions.add(CullerPlugin);

export async function startPixiJumpGame() {
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

  if (scoreLabel) {
    scoreLabel.textContent = "Score: ";
  }

  document.documentElement.style.setProperty("--game-aspect", `${WORLD_WIDTH} / ${WORLD_HEIGHT}`);
  restartButton.textContent = "Restart";
  statusText.textContent = "Space / click to jump";

  const app = new Application();

  await app.init({
    canvas,
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
    backgroundColor: 0xf8fafc,
    antialias: false,
    autoStart: false,
    autoDensity: true,
    culler: {
      updateTransform: true,
    },
    resolution: window.devicePixelRatio || 1,
  });
  maintainCanvasLayout();

  const world = new Container();
  const cloudsLayer = new Container();
  const ground = new Graphics();
  const obstaclesLayer = new Container();
  const dinoGraphic = new Graphics();
  const gameOverOverlay = new Container();

  app.stage.addChild(world);
  world.addChild(cloudsLayer, ground, obstaclesLayer, dinoGraphic, gameOverOverlay);

  const gameOverBox = new Graphics();
  const gameOverTitle = new Text({
    text: "GAME OVER",
    style: {
      fill: "#f8fafc",
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: 24,
      fontWeight: "700",
    },
  });
  const gameOverHint = new Text({
    text: "Press Space or click to restart",
    style: {
      fill: "#f8fafc",
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: 14,
    },
  });

  gameOverOverlay.addChild(gameOverBox, gameOverTitle, gameOverHint);
  gameOverOverlay.visible = false;

  const dino = {
    height: 46,
    vy: 0,
    width: 38,
    x: DINO_X,
    y: GROUND_Y - 46,
  };

  let score = 0;
  let speed = START_SPEED;
  let obstacleTimer = 0;
  let cloudTimer = 0;
  let groundOffset = 0;
  let isGameOver = false;
  let firstObstacleIndex = 0;
  let firstCloudIndex = 0;
  let obstacles = [];
  let clouds = [];

  function resetGame() {
    app.stop();
    dino.y = GROUND_Y - dino.height;
    dino.vy = 0;
    score = 0;
    speed = START_SPEED;
    obstacleTimer = 0.8;
    cloudTimer = 0.2;
    groundOffset = 0;
    isGameOver = false;
    firstObstacleIndex = 0;
    firstCloudIndex = 0;
    obstacles = [];
    clouds = [];
    destroyLayerChildren(obstaclesLayer);
    destroyLayerChildren(cloudsLayer);
    gameOverOverlay.visible = false;
    scoreCount.textContent = "0";
    restartButton.disabled = false;
    statusText.textContent = "Space / click to jump";
    syncWorldScale();
    render();
    app.render();
    app.start();
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
    const obstacle = {
      graphic: new Graphics(),
      height,
      type: tall ? "cactus" : "double-cactus",
      width,
      x: WORLD_WIDTH + 20,
      y: GROUND_Y - height,
    };

    drawObstacleGraphic(obstacle);
    obstacle.graphic.cullable = true;
    obstacle.graphic.cullArea = new Rectangle(-10, 0, width + 20, height);
    obstacles.push(obstacle);
    obstaclesLayer.addChild(obstacle.graphic);
  }

  function createCloud() {
    const cloud = {
      graphic: new Graphics(),
      speed: 24 + Math.random() * 24,
      x: WORLD_WIDTH + 80,
      y: 42 + Math.random() * 86,
    };

    drawCloudGraphic(cloud.graphic);
    cloud.graphic.cullable = true;
    cloud.graphic.cullArea = CLOUD_CULL_AREA;
    clouds.push(cloud);
    cloudsLayer.addChild(cloud.graphic);
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

    for (let i = firstObstacleIndex; i < obstacles.length; i += 1) {
      const obstacle = obstacles[i];
      obstacle.x -= speed * deltaTime;
      obstacle.graphic.position.set(obstacle.x, obstacle.y);
    }

    for (let i = firstCloudIndex; i < clouds.length; i += 1) {
      const cloud = clouds[i];
      cloud.x -= cloud.speed * deltaTime;
      cloud.graphic.position.set(cloud.x, cloud.y);
    }

    while (
      firstObstacleIndex < obstacles.length &&
      obstacles[firstObstacleIndex].x + obstacles[firstObstacleIndex].width <= -20
    ) {
      firstObstacleIndex += 1;
    }

    while (firstCloudIndex < clouds.length && clouds[firstCloudIndex].x <= -120) {
      firstCloudIndex += 1;
    }

    if (hasObstacleCollision()) {
      isGameOver = true;
      statusText.textContent = "Game over";
      gameOverOverlay.visible = true;
    }
  }

  function hasObstacleCollision() {
    const dinoHitBox = getDinoHitBox();

    for (let i = firstObstacleIndex; i < obstacles.length; i += 1) {
      const obstacle = obstacles[i];

      if (intersects(dinoHitBox, getObstacleHitBox(obstacle))) {
        return true;
      }
    }

    return false;
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

  function render() {
    drawGround();
    drawDino();
    gameOverOverlay.position.set(WORLD_WIDTH / 2 - 132, WORLD_HEIGHT / 2 - 40);
  }

  function drawCloudGraphic(graphic) {
    graphic.clear();
    graphic.roundRect(0, 10, 72, 12, 6).fill(0xd1d5db);
    graphic.roundRect(16, 0, 28, 20, 10).fill(0xd1d5db);
    graphic.roundRect(38, 3, 24, 16, 8).fill(0xd1d5db);
  }

  function drawGround() {
    ground.clear();
    ground.moveTo(0, GROUND_Y).lineTo(WORLD_WIDTH, GROUND_Y).stroke({ color: 0x4b5563, width: 2 });

    for (let x = -groundOffset; x < WORLD_WIDTH; x += 36) {
      ground.rect(x, GROUND_Y + 18, 14, 2).fill(0x6b7280);
      ground.rect(x + 22, GROUND_Y + 10, 6, 2).fill(0x6b7280);
    }
  }

  function drawDino() {
    const legOffset = Math.floor(score / 3) % 2 === 0 && dino.vy === 0 ? 0 : 5;

    dinoGraphic.clear();
    dinoGraphic.rect(dino.x + 8, dino.y + 4, 24, 22).fill(0x111827);
    dinoGraphic.rect(dino.x + 24, dino.y, 18, 16).fill(0x111827);
    dinoGraphic.rect(dino.x + 4, dino.y + 24, 26, 14).fill(0x111827);
    dinoGraphic.rect(dino.x, dino.y + 17, 12, 5).fill(0x111827);
    dinoGraphic.rect(dino.x + 9, dino.y + 37, 8, 9 + legOffset).fill(0x111827);
    dinoGraphic.rect(dino.x + 25, dino.y + 37, 8, 14 - legOffset).fill(0x111827);
    dinoGraphic.rect(dino.x + 36, dino.y + 5, 3, 3).fill(0xf8fafc);
  }

  function drawObstacleGraphic(obstacle) {
    obstacle.graphic.clear();

    if (obstacle.type === "double-cactus") {
      drawCactus(obstacle.graphic, 0, 6, 18, obstacle.height - 6);
      drawCactus(obstacle.graphic, 20, 0, 18, obstacle.height);
    } else {
      drawCactus(obstacle.graphic, 0, 0, obstacle.width, obstacle.height);
    }

    obstacle.graphic.position.set(obstacle.x, obstacle.y);
  }

  function drawCactus(graphic, x, y, width, height) {
    const stemWidth = Math.max(10, width * 0.42);
    const stemX = x + (width - stemWidth) / 2;

    graphic.rect(stemX, y, stemWidth, height).fill(0x166534);
    graphic.rect(stemX - 8, y + height * 0.35, 9, stemWidth).fill(0x166534);
    graphic.rect(stemX + stemWidth - 1, y + height * 0.22, 9, stemWidth).fill(0x166534);
    graphic.rect(stemX - 8, y + height * 0.25, stemWidth, 8).fill(0x166534);
    graphic.rect(stemX + stemWidth - 1, y + height * 0.12, stemWidth, 8).fill(0x166534);
  }

  function drawGameOver() {
    gameOverBox.clear();
    gameOverBox.rect(0, 0, 264, 80).fill({ color: 0x111827, alpha: 0.88 });
    gameOverTitle.position.set(132, 22);
    gameOverTitle.anchor.set(0.5);
    gameOverHint.position.set(132, 52);
    gameOverHint.anchor.set(0.5);
  }

  function resizeCanvas() {
    maintainCanvasLayout();
    const bounds = canvas.getBoundingClientRect();
    app.renderer.resize(Math.max(1, bounds.width), Math.max(1, bounds.height));
    syncWorldScale();
    render();
    app.render();
    maintainCanvasLayout();
  }

  function syncWorldScale() {
    const scale = Math.min(app.screen.width / WORLD_WIDTH, app.screen.height / WORLD_HEIGHT);

    world.scale.set(scale);
    world.position.set(
      (app.screen.width - WORLD_WIDTH * scale) / 2,
      (app.screen.height - WORLD_HEIGHT * scale) / 2
    );
  }

  function maintainCanvasLayout() {
    canvas.style.width = "100%";
    canvas.style.height = "auto";
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

  function tick(ticker) {
    const deltaTime = Math.min(ticker.deltaMS / 1000, 0.033);
    update(deltaTime);
    render();

    if (isGameOver) {
      app.stop();
      app.render();
    }
  }

  function destroyLayerChildren(layer) {
    for (const child of layer.removeChildren()) {
      child.destroy();
    }
  }

  canvas.addEventListener("pointerdown", handlePointerDown);
  restartButton.addEventListener("click", resetGame);
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("resize", resizeCanvas);
  app.ticker.add(tick);

  drawGameOver();
  resetGame();
  resizeCanvas();

  return () => {
    canvas.removeEventListener("pointerdown", handlePointerDown);
    restartButton.removeEventListener("click", resetGame);
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("resize", resizeCanvas);
    app.stop();
    app.ticker.remove(tick);
    app.destroy(false);
  };
}
