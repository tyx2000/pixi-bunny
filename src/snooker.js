import { Application, Container, Graphics, Text } from "pixi.js";

const TABLE_WIDTH = 1000;
const TABLE_HEIGHT = 500;
const CUSHION = 34;
const BALL_RADIUS = 10;
const POCKET_RADIUS = 24;
const BAULK_X = 215;
const D_RADIUS = 68;
const FRICTION = 0.994;
const STOP_SPEED = 0.01;
const MAX_SHOT_SPEED = 20;
const COLLISION_RESTITUTION = 0.96;

const COLORS = {
  baize: 0x0a6a35,
  black: 0x111111,
  blue: 0x1f6feb,
  brown: 0x8b5a2b,
  cushion: 0x154d2b,
  green: 0x19a54a,
  pink: 0xf2a0c7,
  rail: 0x4a2c17,
  red: 0xce2b2b,
  white: 0xf8fafc,
  yellow: 0xe5c84c,
};

export async function startSnooker() {
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
    throw new Error("Snooker HUD elements were not found.");
  }

  document.documentElement.style.setProperty("--game-aspect", "2 / 1");

  movesCount.closest("span").firstChild.textContent = "Potted: ";
  shuffleButton.textContent = "Rack";
  statusText.textContent = "Drag from the cue ball";

  const app = new Application();

  await app.init({
    canvas,
    width: TABLE_WIDTH,
    height: TABLE_HEIGHT,
    backgroundColor: 0x020617,
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  });

  const table = new Graphics();
  const aimLine = new Graphics();
  const ballsLayer = new Container();
  const message = new Text({
    text: "",
    style: {
      fill: "#f8fafc",
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: 18,
      fontWeight: "600",
    },
  });

  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;
  app.stage.addChild(table, ballsLayer, aimLine, message);

  let balls = [];
  let cueBall = null;
  let potted = 0;
  let aimPoint = null;
  let ballInHand = true;
  let isAiming = false;
  let isPlacingCueBall = false;

  function rackBalls() {
    ballsLayer.removeChildren();
    balls = [];
    potted = 0;
    movesCount.textContent = "0";
    ballInHand = true;
    isAiming = false;
    isPlacingCueBall = false;
    statusText.textContent = "Place cue ball behind the baulk line";
    aimLine.clear();

    cueBall = addBall("Cue", COLORS.white, 168, TABLE_HEIGHT / 2, false);

    addBall("Yellow", COLORS.yellow, 215, 182, false);
    addBall("Green", COLORS.green, 215, 318, false);
    addBall("Brown", COLORS.brown, 215, TABLE_HEIGHT / 2, false);
    addBall("Blue", COLORS.blue, TABLE_WIDTH / 2, TABLE_HEIGHT / 2, false);
    addBall("Pink", COLORS.pink, 705, TABLE_HEIGHT / 2, false);
    addBall("Black", COLORS.black, 875, TABLE_HEIGHT / 2, false);

    const startX = 735;
    const startY = TABLE_HEIGHT / 2;
    const gap = BALL_RADIUS * 2 + 1.5;

    for (let row = 0; row < 5; row += 1) {
      for (let col = 0; col <= row; col += 1) {
        addBall("Red", COLORS.red, startX + row * gap, startY + (col - row / 2) * gap, false);
      }
    }

    drawTable();
    drawBalls();
  }

  function addBall(name, color, x, y, pottedBall) {
    const graphic = new Graphics();
    const ball = {
      color,
      graphic,
      name,
      potted: pottedBall,
      vx: 0,
      vy: 0,
      x,
      y,
    };

    balls.push(ball);
    ballsLayer.addChild(graphic);

    return ball;
  }

  function drawTable() {
    table.clear();
    table.roundRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT, 28).fill(COLORS.rail);
    table
      .roundRect(CUSHION / 2, CUSHION / 2, TABLE_WIDTH - CUSHION, TABLE_HEIGHT - CUSHION, 18)
      .fill(COLORS.cushion);
    table
      .rect(CUSHION, CUSHION, TABLE_WIDTH - CUSHION * 2, TABLE_HEIGHT - CUSHION * 2)
      .fill(COLORS.baize);

    for (const pocket of getPockets()) {
      table.circle(pocket.x, pocket.y, POCKET_RADIUS).fill(0x020617);
    }

    table
      .moveTo(215, CUSHION)
      .lineTo(215, TABLE_HEIGHT - CUSHION)
      .stroke({ color: 0xd9f99d, width: 1, alpha: 0.45 });
    table.arc(215, TABLE_HEIGHT / 2, 68, -Math.PI / 2, Math.PI / 2).stroke({
      color: 0xd9f99d,
      width: 1,
      alpha: 0.45,
    });
  }

  function drawBalls() {
    for (const ball of balls) {
      ball.graphic.clear();

      if (ball.potted) {
        continue;
      }

      ball.graphic.circle(0, 0, BALL_RADIUS).fill(ball.color);
      ball.graphic.circle(-3, -4, BALL_RADIUS * 0.28).fill({ color: 0xffffff, alpha: 0.45 });
      ball.graphic.circle(0, 0, BALL_RADIUS).stroke({ color: 0x020617, width: 1, alpha: 0.55 });
      ball.graphic.position.set(ball.x, ball.y);
    }
  }

  function getPockets() {
    return [
      { x: CUSHION, y: CUSHION },
      { x: TABLE_WIDTH / 2, y: CUSHION - 4 },
      { x: TABLE_WIDTH - CUSHION, y: CUSHION },
      { x: CUSHION, y: TABLE_HEIGHT - CUSHION },
      { x: TABLE_WIDTH / 2, y: TABLE_HEIGHT - CUSHION + 4 },
      { x: TABLE_WIDTH - CUSHION, y: TABLE_HEIGHT - CUSHION },
    ];
  }

  function areBallsMoving() {
    return balls.some((ball) => !ball.potted && Math.hypot(ball.vx, ball.vy) > STOP_SPEED);
  }

  function updatePhysics() {
    for (const ball of balls) {
      if (ball.potted) {
        continue;
      }

      ball.x += ball.vx;
      ball.y += ball.vy;
      ball.vx *= FRICTION;
      ball.vy *= FRICTION;

      if (Math.hypot(ball.vx, ball.vy) < STOP_SPEED) {
        ball.vx = 0;
        ball.vy = 0;
      }

      bounceOffCushions(ball);
      checkPocket(ball);
    }

    resolveBallCollisions();
    drawBalls();
  }

  function bounceOffCushions(ball) {
    const minX = CUSHION + BALL_RADIUS;
    const maxX = TABLE_WIDTH - CUSHION - BALL_RADIUS;
    const minY = CUSHION + BALL_RADIUS;
    const maxY = TABLE_HEIGHT - CUSHION - BALL_RADIUS;

    if (ball.x < minX || ball.x > maxX) {
      ball.x = Math.max(minX, Math.min(maxX, ball.x));
      ball.vx *= -0.9;
    }

    if (ball.y < minY || ball.y > maxY) {
      ball.y = Math.max(minY, Math.min(maxY, ball.y));
      ball.vy *= -0.9;
    }
  }

  function checkPocket(ball) {
    for (const pocket of getPockets()) {
      if (Math.hypot(ball.x - pocket.x, ball.y - pocket.y) < POCKET_RADIUS) {
        ball.potted = true;
        ball.vx = 0;
        ball.vy = 0;

        if (ball === cueBall) {
          cueBall.x = 168;
          cueBall.y = TABLE_HEIGHT / 2;
          cueBall.potted = false;
          ballInHand = true;
          statusText.textContent = "Place cue ball behind the baulk line";
        } else {
          potted += 1;
          movesCount.textContent = String(potted);
          statusText.textContent = `${ball.name} potted`;
        }

        return;
      }
    }
  }

  function resolveBallCollisions() {
    for (let i = 0; i < balls.length; i += 1) {
      for (let j = i + 1; j < balls.length; j += 1) {
        const a = balls[i];
        const b = balls[j];

        if (a.potted || b.potted) {
          continue;
        }

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy);
        const minDistance = BALL_RADIUS * 2;

        if (distance <= 0 || distance >= minDistance) {
          continue;
        }

        const nx = dx / distance;
        const ny = dy / distance;
        const overlap = (minDistance - distance) / 2;

        a.x -= nx * overlap;
        a.y -= ny * overlap;
        b.x += nx * overlap;
        b.y += ny * overlap;

        const relativeVelocityX = b.vx - a.vx;
        const relativeVelocityY = b.vy - a.vy;
        const velocityAlongNormal = relativeVelocityX * nx + relativeVelocityY * ny;

        if (velocityAlongNormal > 0) {
          continue;
        }

        const impulse = (-(1 + COLLISION_RESTITUTION) * velocityAlongNormal) / 2;

        a.vx -= impulse * nx;
        a.vy -= impulse * ny;
        b.vx += impulse * nx;
        b.vy += impulse * ny;
      }
    }
  }

  function getLocalPoint(event) {
    return event.getLocalPosition(app.stage);
  }

  function drawAim(point) {
    if (!cueBall || cueBall.potted || ballInHand) {
      return;
    }

    const power = Math.min(
      MAX_SHOT_SPEED,
      Math.hypot(cueBall.x - point.x, cueBall.y - point.y) / 10
    );
    aimLine.clear();
    aimLine
      .moveTo(cueBall.x, cueBall.y)
      .lineTo(point.x, point.y)
      .stroke({ color: 0xf8fafc, width: 2, alpha: 0.65 });
    aimLine.rect(24, TABLE_HEIGHT - 28, power * 18, 8).fill({ color: 0xf8fafc, alpha: 0.7 });
  }

  function shoot(point) {
    if (!cueBall || ballInHand) {
      return;
    }

    const dx = cueBall.x - point.x;
    const dy = cueBall.y - point.y;
    const distance = Math.hypot(dx, dy);

    if (distance < 12) {
      return;
    }

    const speed = Math.min(MAX_SHOT_SPEED, distance / 10);
    cueBall.vx = (dx / distance) * speed;
    cueBall.vy = (dy / distance) * speed;
    statusText.textContent = "Shot played";
  }

  function isValidCueBallPosition(point) {
    const safeMinX = CUSHION + BALL_RADIUS;
    const safeMaxX = BAULK_X - BALL_RADIUS;
    const safeMinY = CUSHION + BALL_RADIUS;
    const safeMaxY = TABLE_HEIGHT - CUSHION - BALL_RADIUS;
    const insideTable =
      point.x >= safeMinX && point.x <= safeMaxX && point.y >= safeMinY && point.y <= safeMaxY;
    const insideD =
      Math.hypot(point.x - BAULK_X, point.y - TABLE_HEIGHT / 2) <= D_RADIUS - BALL_RADIUS ||
      point.x < BAULK_X - D_RADIUS;

    if (!insideTable || !insideD) {
      return false;
    }

    return balls.every((ball) => {
      if (ball === cueBall || ball.potted) {
        return true;
      }

      return Math.hypot(point.x - ball.x, point.y - ball.y) >= BALL_RADIUS * 2.2;
    });
  }

  function clampCueBallPosition(point) {
    return {
      x: Math.max(CUSHION + BALL_RADIUS, Math.min(BAULK_X - BALL_RADIUS, point.x)),
      y: Math.max(CUSHION + BALL_RADIUS, Math.min(TABLE_HEIGHT - CUSHION - BALL_RADIUS, point.y)),
    };
  }

  function placeCueBall(point) {
    if (!cueBall) {
      return;
    }

    const position = clampCueBallPosition(point);

    if (!isValidCueBallPosition(position)) {
      statusText.textContent = "Place inside the D";
      return;
    }

    cueBall.x = position.x;
    cueBall.y = position.y;
    statusText.textContent = "Release to set cue ball";
    drawBalls();
  }

  function handlePointerDown(event) {
    if (!cueBall || cueBall.potted || areBallsMoving()) {
      return;
    }

    const point = getLocalPoint(event);

    if (ballInHand) {
      isPlacingCueBall = true;
      placeCueBall(point);
      return;
    }

    if (Math.hypot(point.x - cueBall.x, point.y - cueBall.y) > BALL_RADIUS * 5) {
      return;
    }

    isAiming = true;
    aimPoint = point;
    drawAim(point);
  }

  function handlePointerMove(event) {
    if (isPlacingCueBall) {
      placeCueBall(getLocalPoint(event));
      return;
    }

    if (!isAiming) {
      return;
    }

    aimPoint = getLocalPoint(event);
    drawAim(aimPoint);
  }

  function handlePointerUp() {
    if (isPlacingCueBall) {
      isPlacingCueBall = false;
      ballInHand = false;
      statusText.textContent = "Drag from the cue ball";
      return;
    }

    if (!isAiming || !aimPoint) {
      return;
    }

    shoot(aimPoint);
    isAiming = false;
    aimPoint = null;
    aimLine.clear();
  }

  function updateStatusWhenStill() {
    if (!isAiming && !areBallsMoving() && statusText.textContent === "Shot played") {
      statusText.textContent = "Drag from the cue ball";
    }
  }

  function resizeCanvas() {
    const bounds = canvas.getBoundingClientRect();
    app.renderer.resize(Math.max(1, bounds.width), Math.max(1, bounds.height));
    app.stage.scale.set(app.screen.width / TABLE_WIDTH, app.screen.height / TABLE_HEIGHT);
  }

  app.stage.on("pointerdown", handlePointerDown);
  app.stage.on("pointermove", handlePointerMove);
  app.stage.on("pointerup", handlePointerUp);
  app.stage.on("pointerupoutside", handlePointerUp);
  shuffleButton.addEventListener("click", rackBalls);
  window.addEventListener("resize", resizeCanvas);

  app.ticker.add(() => {
    updatePhysics();
    updateStatusWhenStill();
  });

  rackBalls();
  resizeCanvas();

  return () => {
    app.destroy(false);
    shuffleButton.removeEventListener("click", rackBalls);
    window.removeEventListener("resize", resizeCanvas);
  };
}
