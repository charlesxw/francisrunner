import * as THREE from "three";
import {
  createScoreState,
  updateScoreProgress,
  finalizeRunScore,
  startNewRun,
} from "./src/score.mjs";

const palette = {
  fog: 0xa3bbff,
  ambientLight: 0xdde7ff,
  directionalLight: 0xafc2ff,
  skyLight: 0xf4f7ff,
  groundLight: 0x243986,
  ground: 0x385de0,
  obstacle: 0x4c2ce1,
  obstacleEmissive: 0x1b286e,
  lowObstacle: 0x263ec2,
  lowObstacleEmissive: 0x12256a,
  highObstacle: 0x6e4dff,
  highObstacleEmissive: 0x2d1e78,
};

const scene = new THREE.Scene();
scene.background = null;
scene.fog = new THREE.Fog(palette.fog, 45, 190);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(palette.ambientLight, 0.85);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(palette.directionalLight, 1.1);
directionalLight.position.set(7, 11, -6);
scene.add(directionalLight);

const hemisphereLight = new THREE.HemisphereLight(
  palette.skyLight,
  palette.groundLight,
  0.45
);
scene.add(hemisphereLight);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(30, 600),
  new THREE.MeshStandardMaterial({
    color: palette.ground,
    roughness: 0.8,
    metalness: 0.06,
  })
);
ground.rotation.x = -Math.PI / 2;
ground.position.set(0, 0, 220);
scene.add(ground);

const lanePositions = [-2, 0, 2];
const startingLaneIndex = 1;
let currentLaneIndex = startingLaneIndex;

const runnerBaseSize = {
  width: 1,
  height: 2,
  depth: 1,
};

const runnerMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  transparent: true,
  side: THREE.DoubleSide,
});

const runner = new THREE.Mesh(
  new THREE.PlaneGeometry(runnerBaseSize.width, runnerBaseSize.height),
  runnerMaterial
);

function applyRunnerTexture(loadedTexture, { updateGeometry = false } = {}) {
  const imageWidth = loadedTexture.image?.width;
  const imageHeight = loadedTexture.image?.height;
  loadedTexture.colorSpace = THREE.SRGBColorSpace;
  runnerMaterial.map = loadedTexture;
  runnerMaterial.needsUpdate = true;

  if (!updateGeometry || !imageWidth || !imageHeight) {
    return;
  }

  const originalAspectRatio = imageWidth / imageHeight;
  runnerBaseSize.width = runnerBaseSize.height * originalAspectRatio;
  runner.geometry.dispose();
  runner.geometry = new THREE.PlaneGeometry(
    runnerBaseSize.width,
    runnerBaseSize.height
  );
}

const textureLoader = new THREE.TextureLoader();
const runnerTextures = {
  main: null,
  smiling: null,
  dies: null,
};
const celebrationMilestoneStep = 1000;
const obstacleLogoTexture = textureLoader.load(
  "/assets/claudecodeavoid.svg",
  (loadedTexture) => {
    loadedTexture.colorSpace = THREE.SRGBColorSpace;
    loadedTexture.wrapS = THREE.ClampToEdgeWrapping;
    loadedTexture.wrapT = THREE.ClampToEdgeWrapping;
    loadedTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  },
  undefined,
  () => {
    console.error("Missing /assets/claudecodeavoid.svg");
  }
);

function setRunnerEmote(emoteKey) {
  const texture = runnerTextures[emoteKey];
  if (!texture) {
    return;
  }
  applyRunnerTexture(texture);
}

textureLoader.load(
  "/assets/main_character.png",
  (loadedTexture) => {
    runnerTextures.main = loadedTexture;
    applyRunnerTexture(loadedTexture, { updateGeometry: true });
  },
  undefined,
  () => {
    console.error("Missing /assets/main_character.png");
  }
);

textureLoader.load(
  "/assets/main_character_smiling.png",
  (loadedTexture) => {
    runnerTextures.smiling = loadedTexture;
  },
  undefined,
  () => {
    console.error("Missing /assets/main_character_smiling.png");
  }
);

textureLoader.load(
  "/assets/main_character_dies.png",
  (loadedTexture) => {
    runnerTextures.dies = loadedTexture;
  },
  undefined,
  () => {
    console.error("Missing /assets/main_character_dies.png");
  }
);

runner.position.set(lanePositions[currentLaneIndex], runnerBaseSize.height / 2, 0);
scene.add(runner);

const gameOverOverlay = document.getElementById("game-over");
const scoreDisplay = document.getElementById("score");
const bestScoreDisplay = document.getElementById("best-score");
const finalScoreDisplay = document.getElementById("final-score");
const playAgainButton = document.getElementById("play-again");

const difficulty = {
  baseForwardSpeed: 14,
  maxForwardSpeed: 24,
  speedPerLevel: 0.8,
  scorePerLevel: 120,
  spawnIntervalMin: 0.8,
  spawnIntervalMax: 1.6,
  spawnIntervalMinFloor: 0.44,
  spawnIntervalMaxFloor: 0.95,
  spawnIntervalMinPerLevel: 0.025,
  spawnIntervalMaxPerLevel: 0.04,
  spawnDistanceMin: 60,
  spawnDistanceMax: 100,
  spawnDistanceMinFloor: 36,
  spawnDistanceMaxFloor: 68,
  spawnDistanceMinPerLevel: 1.5,
  spawnDistanceMaxPerLevel: 2.5,
};

const state = {
  isGameOver: false,
  forwardSpeed: difficulty.baseForwardSpeed,
  laneLerpSpeed: 14,
  gravity: -35,
  jumpVelocity: 13,
  verticalVelocity: 0,
  groundedY: runnerBaseSize.height / 2,
  duckScaleY: 0.45,
  duckDuration: 0.45,
  duckTimer: 0,
  isDucking: false,
  obstacles: [],
  score: createScoreState({ pointsPerMeter: 1 }),
  spawnTimer: 0,
  nextSpawnIn: randRange(difficulty.spawnIntervalMin, difficulty.spawnIntervalMax),
  spawnIntervalMin: difficulty.spawnIntervalMin,
  spawnIntervalMax: difficulty.spawnIntervalMax,
  spawnDistanceMin: difficulty.spawnDistanceMin,
  spawnDistanceMax: difficulty.spawnDistanceMax,
  cleanupDistance: 25,
  isJumpEmoteActive: false,
  isDeathAnimating: false,
  deathAnimTimer: 0,
  deathAnimDuration: 0.95,
  deathVelocityX: 0,
  deathVelocityY: 0,
  deathForwardSpeed: 0,
  deathSpinSpeed: 0,
  nextCelebrationScore: celebrationMilestoneStep,
  celebrationBursts: [],
};

function randRange(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function onKeyDown(event) {
  if (state.isGameOver) {
    return;
  }

  if (event.code === "ArrowLeft" || event.code === "KeyA") {
    currentLaneIndex = clamp(currentLaneIndex + 1, 0, lanePositions.length - 1);
  }

  if (event.code === "ArrowRight" || event.code === "KeyD") {
    currentLaneIndex = clamp(currentLaneIndex - 1, 0, lanePositions.length - 1);
  }

  if (event.code === "Space") {
    if (isGrounded() && !state.isDucking) {
      state.verticalVelocity = state.jumpVelocity;
      state.isJumpEmoteActive = true;
      setRunnerEmote("smiling");
    }
  }

  if (event.code === "KeyS" || event.code === "ArrowDown") {
    if (isGrounded() && !state.isDucking) {
      startDuck();
    }
  }
}

function isGrounded() {
  return runner.position.y <= state.groundedY + 0.001;
}

function startDuck() {
  state.isDucking = true;
  state.duckTimer = state.duckDuration;
  runner.scale.y = state.duckScaleY;
  const duckedHeight = runnerBaseSize.height * runner.scale.y;
  runner.position.y = duckedHeight / 2;
}

function endDuck() {
  state.isDucking = false;
  state.duckTimer = 0;
  runner.scale.y = 1;
  runner.position.y = state.groundedY;
}

const obstacleTypes = [
  {
    kind: "block",
    weight: 0.45,
    width: 1.2,
    heightMin: 1.6,
    heightMax: 2.4,
    depth: 1.2,
    yMode: "ground",
    color: palette.obstacle,
    emissive: palette.obstacleEmissive,
  },
  {
    kind: "low",
    weight: 0.3,
    width: 1.5,
    heightMin: 0.65,
    heightMax: 1.05,
    depth: 1.4,
    yMode: "ground",
    color: palette.lowObstacle,
    emissive: palette.lowObstacleEmissive,
  },
  {
    kind: "high",
    weight: 0.25,
    width: 1.6,
    heightMin: 0.75,
    heightMax: 1.1,
    depth: 1.4,
    yMode: "head",
    yOffsetMin: 1.95,
    yOffsetMax: 2.15,
    color: palette.highObstacle,
    emissive: palette.highObstacleEmissive,
  },
];

function pickObstacleType() {
  const totalWeight = obstacleTypes.reduce((sum, type) => sum + type.weight, 0);
  let pick = Math.random() * totalWeight;

  for (const type of obstacleTypes) {
    pick -= type.weight;
    if (pick <= 0) {
      return type;
    }
  }

  return obstacleTypes[0];
}

function spawnObstacle() {
  const laneIndex = Math.floor(Math.random() * lanePositions.length);
  const type = pickObstacleType();
  const width = type.width;
  const height = randRange(type.heightMin, type.heightMax);
  const depth = type.depth;
  const z = runner.position.z + randRange(state.spawnDistanceMin, state.spawnDistanceMax);
  const y =
    type.yMode === "head"
      ? randRange(type.yOffsetMin, type.yOffsetMax)
      : height / 2;

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: obstacleLogoTexture,
      emissive: 0x101010,
      emissiveIntensity: 0.12,
      roughness: 0.38,
      metalness: 0.14,
    })
  );
  mesh.position.set(lanePositions[laneIndex], y, z);
  scene.add(mesh);

  state.obstacles.push({
    mesh,
    kind: type.kind,
    laneIndex,
    width,
    height,
    depth,
    z,
  });
}

function clearObstacles() {
  for (const obstacle of state.obstacles) {
    scene.remove(obstacle.mesh);
    obstacle.mesh.geometry.dispose();
    if (Array.isArray(obstacle.mesh.material)) {
      for (const material of obstacle.mesh.material) {
        material.dispose();
      }
    } else {
      obstacle.mesh.material.dispose();
    }
  }

  state.obstacles = [];
}

function updateDifficulty() {
  const level = Math.floor(state.score.value / difficulty.scorePerLevel);
  state.forwardSpeed = Math.min(
    difficulty.baseForwardSpeed + level * difficulty.speedPerLevel,
    difficulty.maxForwardSpeed
  );

  state.spawnIntervalMin = Math.max(
    difficulty.spawnIntervalMinFloor,
    difficulty.spawnIntervalMin - level * difficulty.spawnIntervalMinPerLevel
  );
  state.spawnIntervalMax = Math.max(
    difficulty.spawnIntervalMaxFloor,
    difficulty.spawnIntervalMax - level * difficulty.spawnIntervalMaxPerLevel
  );
  state.spawnIntervalMax = Math.max(
    state.spawnIntervalMin + 0.12,
    state.spawnIntervalMax
  );

  state.spawnDistanceMin = Math.max(
    difficulty.spawnDistanceMinFloor,
    difficulty.spawnDistanceMin - level * difficulty.spawnDistanceMinPerLevel
  );
  state.spawnDistanceMax = Math.max(
    difficulty.spawnDistanceMaxFloor,
    difficulty.spawnDistanceMax - level * difficulty.spawnDistanceMaxPerLevel
  );
  state.spawnDistanceMax = Math.max(
    state.spawnDistanceMin + 10,
    state.spawnDistanceMax
  );
}

function updateObstacles(deltaTime) {
  state.spawnTimer += deltaTime;
  if (state.spawnTimer >= state.nextSpawnIn) {
    state.spawnTimer = 0;
    state.nextSpawnIn = randRange(state.spawnIntervalMin, state.spawnIntervalMax);
    spawnObstacle();
  }

  for (let i = state.obstacles.length - 1; i >= 0; i -= 1) {
    const obstacle = state.obstacles[i];
    obstacle.z = obstacle.mesh.position.z;

    if (obstacle.z < runner.position.z - state.cleanupDistance) {
      scene.remove(obstacle.mesh);
      obstacle.mesh.geometry.dispose();
      obstacle.mesh.material.dispose();
      state.obstacles.splice(i, 1);
    }
  }
}

function getRunnerBounds() {
  const width = runnerBaseSize.width * runner.scale.x;
  const height = runnerBaseSize.height * runner.scale.y;
  const depth = runnerBaseSize.depth * runner.scale.z;

  return {
    minX: runner.position.x - width / 2,
    maxX: runner.position.x + width / 2,
    minY: runner.position.y - height / 2,
    maxY: runner.position.y + height / 2,
    minZ: runner.position.z - depth / 2,
    maxZ: runner.position.z + depth / 2,
  };
}

function getObstacleBounds(obstacle) {
  return {
    minX: obstacle.mesh.position.x - obstacle.width / 2,
    maxX: obstacle.mesh.position.x + obstacle.width / 2,
    minY: obstacle.mesh.position.y - obstacle.height / 2,
    maxY: obstacle.mesh.position.y + obstacle.height / 2,
    minZ: obstacle.mesh.position.z - obstacle.depth / 2,
    maxZ: obstacle.mesh.position.z + obstacle.depth / 2,
  };
}

function boundsIntersect(a, b) {
  return (
    a.minX <= b.maxX &&
    a.maxX >= b.minX &&
    a.minY <= b.maxY &&
    a.maxY >= b.minY &&
    a.minZ <= b.maxZ &&
    a.maxZ >= b.minZ
  );
}

function checkCollisions() {
  const runnerBounds = getRunnerBounds();
  for (const obstacle of state.obstacles) {
    const obstacleBounds = getObstacleBounds(obstacle);
    if (boundsIntersect(runnerBounds, obstacleBounds)) {
      triggerGameOver();
      return;
    }
  }
}

function triggerGameOver() {
  if (state.isGameOver) {
    return;
  }

  state.isGameOver = true;
  state.isDeathAnimating = true;
  state.deathAnimTimer = 0;
  state.deathVelocityX = (Math.random() < 0.5 ? -1 : 1) * 6;
  state.deathVelocityY = 11.5;
  state.deathForwardSpeed = state.forwardSpeed * 0.35 + 8;
  state.deathSpinSpeed = (Math.random() < 0.5 ? -1 : 1) * 14;
  state.verticalVelocity = 0;
  state.duckTimer = 0;
  state.isDucking = false;
  runner.scale.y = 1;
  setRunnerEmote("dies");

  const finalScore = finalizeRunScore(state.score);
  if (finalScoreDisplay) {
    finalScoreDisplay.textContent = `Final score: ${finalScore}`;
  }
  updateScoreUI();
}

function createCelebrationBurst() {
  const smilingTexture = runnerTextures.smiling;
  if (!smilingTexture || !smilingTexture.image) {
    return;
  }

  const imageWidth = smilingTexture.image.width || 1;
  const imageHeight = smilingTexture.image.height || 1;
  const aspectRatio = imageWidth / imageHeight;
  const pieceCount = 220;
  const burstDuration = 2.6;
  const burst = {
    pieces: [],
    life: burstDuration,
    duration: burstDuration,
  };

  for (let i = 0; i < pieceCount; i += 1) {
    const spriteHeight = randRange(0.45, 1.05);
    const spriteWidth = spriteHeight * aspectRatio;
    const geometry = new THREE.PlaneGeometry(spriteWidth, spriteHeight);
    const material = new THREE.MeshBasicMaterial({
      map: smilingTexture,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(
      runner.position.x + randRange(-11, 11),
      runner.position.y + randRange(3, 11),
      runner.position.z + randRange(-7, 18)
    );
    mesh.rotation.set(0, 0, randRange(-Math.PI, Math.PI));
    scene.add(mesh);

    burst.pieces.push({
      mesh,
      velocity: new THREE.Vector3(
        randRange(-8.5, 8.5),
        randRange(4, 16),
        randRange(-4.5, 6)
      ),
      spin: randRange(-10, 10),
    });
  }

  state.celebrationBursts.push(burst);
}

function updateCelebrations(deltaTime) {
  for (let i = state.celebrationBursts.length - 1; i >= 0; i -= 1) {
    const burst = state.celebrationBursts[i];
    burst.life -= deltaTime;
    const normalizedLife = clamp(burst.life / burst.duration, 0, 1);

    for (const piece of burst.pieces) {
      piece.velocity.y += state.gravity * 0.35 * deltaTime;
      piece.mesh.position.x += piece.velocity.x * deltaTime;
      piece.mesh.position.y += piece.velocity.y * deltaTime;
      piece.mesh.position.z += piece.velocity.z * deltaTime;
      piece.mesh.rotation.z += piece.spin * deltaTime;
      piece.mesh.material.opacity = normalizedLife;
    }

    if (burst.life <= 0) {
      for (const piece of burst.pieces) {
        scene.remove(piece.mesh);
        piece.mesh.geometry.dispose();
        piece.mesh.material.dispose();
      }
      state.celebrationBursts.splice(i, 1);
    }
  }
}

function clearCelebrations() {
  for (const burst of state.celebrationBursts) {
    for (const piece of burst.pieces) {
      scene.remove(piece.mesh);
      piece.mesh.geometry.dispose();
      piece.mesh.material.dispose();
    }
  }
  state.celebrationBursts = [];
}

function checkCelebrationMilestones() {
  while (state.score.value >= state.nextCelebrationScore) {
    createCelebrationBurst();
    state.nextCelebrationScore += celebrationMilestoneStep;
  }
}

function updateDeathAnimation(deltaTime) {
  if (!state.isDeathAnimating) {
    return;
  }

  state.deathAnimTimer += deltaTime;
  state.deathVelocityY += state.gravity * 0.72 * deltaTime;

  runner.position.x += state.deathVelocityX * deltaTime;
  runner.position.y += state.deathVelocityY * deltaTime;
  runner.position.z += state.deathForwardSpeed * deltaTime;
  runner.rotation.z += state.deathSpinSpeed * deltaTime;
  runner.rotation.y += state.deathSpinSpeed * 0.28 * deltaTime;

  if (state.deathAnimTimer >= state.deathAnimDuration) {
    state.isDeathAnimating = false;
    gameOverOverlay.style.display = "flex";
  }
}

function resetGame() {
  if (!state.isGameOver) {
    return;
  }

  clearObstacles();
  state.isGameOver = false;
  state.verticalVelocity = 0;
  state.duckTimer = 0;
  state.isDucking = false;
  state.spawnTimer = 0;
  state.forwardSpeed = difficulty.baseForwardSpeed;
  state.spawnIntervalMin = difficulty.spawnIntervalMin;
  state.spawnIntervalMax = difficulty.spawnIntervalMax;
  state.spawnDistanceMin = difficulty.spawnDistanceMin;
  state.spawnDistanceMax = difficulty.spawnDistanceMax;
  state.nextSpawnIn = randRange(state.spawnIntervalMin, state.spawnIntervalMax);
  state.isJumpEmoteActive = false;
  state.isDeathAnimating = false;
  state.deathAnimTimer = 0;
  state.deathVelocityX = 0;
  state.deathVelocityY = 0;
  state.deathForwardSpeed = 0;
  state.deathSpinSpeed = 0;
  state.nextCelebrationScore = celebrationMilestoneStep;
  clearCelebrations();

  currentLaneIndex = startingLaneIndex;
  runner.scale.set(1, 1, 1);
  runner.rotation.set(0, 0, 0);
  runner.position.set(lanePositions[currentLaneIndex], state.groundedY, 0);
  setRunnerEmote("main");

  startNewRun(state.score);
  updateScoreUI();

  if (finalScoreDisplay) {
    finalScoreDisplay.textContent = "";
  }
  gameOverOverlay.style.display = "none";

  camera.position.copy(runner.position).add(new THREE.Vector3(0, 5, -10));
  camera.lookAt(runner.position.x, runner.position.y + 1.2, runner.position.z + 15);
}

function updateScoreUI() {
  if (scoreDisplay) {
    scoreDisplay.textContent = state.score.value;
  }
  if (bestScoreDisplay) {
    bestScoreDisplay.textContent = state.score.bestValue;
  }
}

function updateRunner(deltaTime) {
  runner.position.z += state.forwardSpeed * deltaTime;

  const targetX = lanePositions[currentLaneIndex];
  runner.position.x = THREE.MathUtils.lerp(
    runner.position.x,
    targetX,
    clamp(state.laneLerpSpeed * deltaTime, 0, 1)
  );

  if (state.duckTimer > 0) {
    state.duckTimer -= deltaTime;
    if (state.duckTimer <= 0) {
      endDuck();
    }
  }

  state.verticalVelocity += state.gravity * deltaTime;
  runner.position.y += state.verticalVelocity * deltaTime;

  const currentHeight = runnerBaseSize.height * runner.scale.y;
  const groundYForCurrentSize = currentHeight / 2;
  if (runner.position.y < groundYForCurrentSize) {
    runner.position.y = groundYForCurrentSize;
    state.verticalVelocity = 0;

    if (state.isJumpEmoteActive) {
      state.isJumpEmoteActive = false;
      setRunnerEmote("main");
    }
  }
}

function updateCamera(deltaTime) {
  const cameraOffset = new THREE.Vector3(0, 5, -10);
  const desiredPos = new THREE.Vector3().copy(runner.position).add(cameraOffset);
  camera.position.lerp(desiredPos, clamp(8 * deltaTime, 0, 1));
  camera.lookAt(runner.position.x, runner.position.y + 1.2, runner.position.z + 15);
}

window.addEventListener("keydown", onKeyDown);

if (playAgainButton) {
  playAgainButton.addEventListener("click", resetGame);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();

function animate() {
  const deltaTime = clock.getDelta();

  if (!state.isGameOver) {
    updateScoreProgress(state.score, deltaTime, state.forwardSpeed);
    checkCelebrationMilestones();
    updateDifficulty();
    updateRunner(deltaTime);
    updateObstacles(deltaTime);
    checkCollisions();
    updateScoreUI();
  }

  updateCelebrations(deltaTime);

  if (state.isDeathAnimating) {
    updateDeathAnimation(deltaTime);
  }

  updateCamera(deltaTime);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
