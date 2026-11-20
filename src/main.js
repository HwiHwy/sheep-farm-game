import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import './style.css';

// -----------------------------------------------------------------------------
// Scene setup
// -----------------------------------------------------------------------------
const world = document.querySelector('#game-world');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb9e2ef);
// Push fog farther away so the farm remains crisp instead of looking washed out.
scene.fog = new THREE.Fog(0xc5e6d2, 48, 105);

const camera = new THREE.PerspectiveCamera(
  42,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(18, 21, 27);
camera.lookAt(4.0, 0, 0);
const ASSET = (path) =>
    `${import.meta.env.BASE_URL}${path}`;
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
world.appendChild(renderer.domElement);

// Let the player orbit around the whole farm, zoom in/out, and inspect the pen.
// OrbitControls also supports one-finger rotate and pinch zoom on touch screens.
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(4.0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.enableRotate = true;
controls.enableZoom = true;
controls.enablePan = false;
controls.minDistance = 12;
controls.maxDistance = 38;
controls.minPolarAngle = 0.28;
controls.maxPolarAngle = Math.PI / 2.02;
controls.update();

const hemiLight = new THREE.HemisphereLight(0xf4fbff, 0x78945a, 1.75);
scene.add(hemiLight);

const sun = new THREE.DirectionalLight(0xfff0d5, 2.55);
sun.position.set(-9, 18, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -25;
sun.shadow.camera.right = 25;
sun.shadow.camera.top = 25;
sun.shadow.camera.bottom = -25;
sun.shadow.bias = -0.00015;
scene.add(sun);

const clock = new THREE.Clock();
const shared = {};

// -----------------------------------------------------------------------------
// AUDIO SETTINGS — edit these URLs to add your own sound files.
// Local files go in public/audio/ and use paths such as '/audio/music.mp3'.
// Leave a URL empty ('') to use the built-in generated UI sound (or no music).
// -----------------------------------------------------------------------------
const AUDIO_CONFIG = {
    // Nhạc nền nông trại
backgroundMusicUrl: ASSET('audio/farm-background.mp3'),    backgroundMusicVolume: 0.22,

    // Tiếng cừu kêu ngẫu nhiên
sheepBleatUrls: [
    ASSET('audio/sheep-bleat-1.mp3'),
    ASSET('audio/sheep-bleat-2.mp3')
],

    sheepBleatVolume: 0.28,
    sheepBleatMinIntervalMs: 26000,
    sheepBleatMaxIntervalMs: 42000,

    // Âm thanh khi nhấn nút
buttonClickUrl: ASSET('audio/button-click.mp3'),    buttonClickVolume: 0.32,

    // Âm thanh khi popup xuất hiện
popupSoundUrl: ASSET('audio/popup-chime.mp3'),    popupSoundVolume: 0.55
};
let audioEnabled = true;
let audioStarted = false;
let audioContext = null;
let sheepBleatTimer = null;
let backgroundMusic = null;

if (AUDIO_CONFIG.backgroundMusicUrl.trim()) {
  backgroundMusic = new Audio(AUDIO_CONFIG.backgroundMusicUrl.trim());
  backgroundMusic.loop = true;
  backgroundMusic.preload = 'auto';
  backgroundMusic.volume = AUDIO_CONFIG.backgroundMusicVolume;
}

function getAudioContext() {
  if (audioContext) return audioContext;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  audioContext = new AudioContextClass();
  return audioContext;
}

function playTone(frequency, startOffset, duration, endFrequency, peak = 0.05, type = 'sine') {
  if (!audioEnabled) return;
  const context = getAudioContext();
  if (!context) return;

  const startAt = context.currentTime + startOffset;
  const stopAt = startAt + duration;
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startAt);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(25, endFrequency), stopAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peak, startAt + Math.min(0.018, duration * 0.25));
  gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(stopAt + 0.025);
}

function playAudioFile(url, volume = 0.5) {
  if (!audioEnabled || !url || !url.trim()) return;
  const audio = new Audio(url.trim());
  audio.preload = 'auto';
  audio.volume = THREE.MathUtils.clamp(volume, 0, 1);
  audio.play().catch((error) => {
    console.warn(`[Audio] Could not play ${url}:`, error);
  });
}

function playButtonSound() {
  if (!audioEnabled) return;
  if (AUDIO_CONFIG.buttonClickUrl.trim()) {
    playAudioFile(AUDIO_CONFIG.buttonClickUrl, AUDIO_CONFIG.buttonClickVolume);
    return;
  }
  // Small, quiet two-step tap. No audio file required.
  playTone(720, 0, 0.055, 420, 0.035, 'triangle');
}

function playPopupSound() {
  if (!audioEnabled) return;
  if (AUDIO_CONFIG.popupSoundUrl.trim()) {
    playAudioFile(AUDIO_CONFIG.popupSoundUrl, AUDIO_CONFIG.popupSoundVolume);
    return;
  }
  // A gentle two-note chime for the caught-player popup.
  playTone(587.33, 0, 0.16, 659.25, 0.055, 'sine');
  playTone(783.99, 0.13, 0.24, 880.0, 0.06, 'sine');
}

function scheduleSheepBleat() {
  if (!audioEnabled || !audioStarted || sheepBleatTimer !== null) return;
  const sounds = AUDIO_CONFIG.sheepBleatUrls.filter((url) => typeof url === 'string' && url.trim());
  if (sounds.length === 0) return;

  const minDelay = Math.max(5000, AUDIO_CONFIG.sheepBleatMinIntervalMs);
  const maxDelay = Math.max(minDelay, AUDIO_CONFIG.sheepBleatMaxIntervalMs);
  const delay = minDelay + Math.random() * (maxDelay - minDelay);

  sheepBleatTimer = window.setTimeout(() => {
    sheepBleatTimer = null;
    const livingSheep = typeof activeSheep === 'function' ? activeSheep() : [];
    if (audioEnabled && livingSheep.length > 0) {
      const selectedSound = sounds[Math.floor(Math.random() * sounds.length)];
      playAudioFile(selectedSound, AUDIO_CONFIG.sheepBleatVolume);
    }
    scheduleSheepBleat();
  }, delay);
}

function startFarmAudio() {
  if (!audioEnabled) return;
  audioStarted = true;

  const context = getAudioContext();
  if (context?.state === 'suspended') context.resume().catch(() => {});

  if (backgroundMusic && backgroundMusic.paused) {
    backgroundMusic.play().catch((error) => {
      console.info('[Audio] Background music is waiting for a user gesture or a valid URL.', error);
    });
  }
  scheduleSheepBleat();
}

function updateAudioToggle() {
  const toggle = document.querySelector('#audioToggle');
  if (!toggle) return;
  toggle.textContent = audioEnabled ? '🔊 ÂM THANH' : '🔇 TẮT ÂM';
  toggle.setAttribute('aria-pressed', String(audioEnabled));
  toggle.title = audioEnabled ? 'Tắt âm thanh' : 'Bật âm thanh';
}

// Unlock browser audio after the first visitor interaction (required by browsers).
document.addEventListener('pointerdown', startFarmAudio, { once: true });
document.addEventListener('keydown', startFarmAudio, { once: true });

function material(color, roughness = 0.85, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, flatShading: false, ...extra });
}

function addBox(parent, size, position, mat, cast = true, receive = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  mesh.position.set(...position);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  parent.add(mesh);
  return mesh;
}

function addSphere(parent, radius, position, scale, mat, segments = 16) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, segments, Math.max(8, segments - 2)),
    mat
  );
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

// -----------------------------------------------------------------------------
// External character models
// Put sheep.glb and wolf.glb in public/models/. If either file is missing,
// the game continues with its built-in placeholder character.
// -----------------------------------------------------------------------------
const MODEL_CONFIG = {
    sheep: {
        url: `${import.meta.env.BASE_URL}models/sheep22.glb`,
        height: 1.55,
        rotationY: 0
    },

    wolf: {
        url: `${import.meta.env.BASE_URL}models/wolf.glb`,
        height: 1.9,
        rotationY: 0
    }
};

const gltfLoader = new GLTFLoader();

async function loadOptionalModel(url, label) {
  try {
    const gltf = await gltfLoader.loadAsync(url);
    console.info(`[3D models] Loaded ${label}: ${url}`);
    return gltf;
  } catch (error) {
    console.warn(`[3D models] ${label} not found at ${url}. Using the built-in placeholder model.`, error);
    return null;
  }
}

// Both files are optional during setup; once placed in public/models, refresh.
const [sheepGLTF, wolfGLTF] = await Promise.all([
  loadOptionalModel(MODEL_CONFIG.sheep.url, 'sheep'),
  loadOptionalModel(MODEL_CONFIG.wolf.url, 'wolf')
]);

function makeModelRig(gltf, config, coatColor = null) {
  const model = SkeletonUtils.clone(gltf.scene);
  model.rotation.y = config.rotationY ?? 0;

  model.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    object.frustumCulled = false;

    // Clone materials so every sheep can receive its own wool colour.
    const cloneAndTint = (sourceMaterial) => {
      const cloned = sourceMaterial.clone();
      if (coatColor !== null && cloned.color) {
        const partName = `${object.name} ${sourceMaterial.name}`.toLowerCase();
        const keepNaturalColor = /face|muzzle|eye|nose|hoof|mouth|tongue|inner|skin|eyelid|tooth/i.test(partName);
        if (!keepNaturalColor) {
          cloned.color.set(coatColor);
        }
      }
      return cloned;
    };

    object.material = Array.isArray(object.material)
      ? object.material.map(cloneAndTint)
      : cloneAndTint(object.material);
  });

  // Automatically normalize the model's height and place its feet on y = 0.
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = config.height / Math.max(size.y, 0.001);
  model.scale.multiplyScalar(scale);
  model.position.set(
    -center.x * scale,
    -bounds.min.y * scale,
    -center.z * scale
  );
  model.updateMatrixWorld(true);

  const mixer = new THREE.AnimationMixer(model);
  const clips = gltf.animations ?? [];
  const findClip = (pattern) => clips.find((clip) => pattern.test(clip.name));

  const sitClip = findClip(/sit|sitting|sit[_ -]?down|lay[_ -]?down/i);
  const idleClip = findClip(/idle|stand|rest|breath/i);
  const walkClip = findClip(/walk|move|patrol/i);
  const runClip = findClip(/run|sprint|gallop|dash/i);
  const fallbackClip = clips[0] ?? null;

  const actions = {
    sit: sitClip ? mixer.clipAction(sitClip) : null,
    idle: idleClip ? mixer.clipAction(idleClip) : (fallbackClip ? mixer.clipAction(fallbackClip) : null),
    walk: walkClip ? mixer.clipAction(walkClip) : (runClip ? mixer.clipAction(runClip) : null),
    run: runClip ? mixer.clipAction(runClip) : (walkClip ? mixer.clipAction(walkClip) : null)
  };

  // Start with an idle/first available clip if the GLB contains animation.
  const initialAction = actions.idle ?? actions.walk ?? actions.run;
  if (initialAction) initialAction.play();

  return { model, mixer, actions, currentAction: initialAction, currentMode: initialAction ? 'idle' : null };
}

function updateRigAnimation(rig, mode, dt) {
  if (!rig?.mixer) return;
  const nextAction = rig.actions?.[mode] ?? rig.actions?.idle ?? rig.actions?.walk ?? rig.actions?.run;
  if (nextAction && nextAction !== rig.currentAction) {
    rig.currentAction?.fadeOut(0.18);
    nextAction.reset().fadeIn(0.18).play();
    rig.currentAction = nextAction;
  }
  if (nextAction) rig.currentMode = mode;
  rig.mixer.update(dt);
}

// -----------------------------------------------------------------------------
// Farm environment
// -----------------------------------------------------------------------------
const grassMat = material(0x83c96d);
const fieldMat = material(0x91d477);
const dirtMat = material(0xc99b64);
const fenceMat = material(0xe9d9a9);
const fencePostMat = material(0xb88a55);
const woodMat = material(0x9a623e);
const creamMat = material(0xfff4d9);
const whiteMat = material(0xfffdf2, 0.9);
const darkFaceMat = material(0x665b50, 0.9);
const hoofMat = material(0x554b40);

// Subtle hand-painted grass texture: small colour flecks add detail without
// making the play area visually noisy or distracting from the sheep.
function makeGrassTexture(base, colors, seedCount = 3600) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < seedCount; i += 1) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    ctx.globalAlpha = 0.08 + Math.random() * 0.16;
    ctx.strokeStyle = colors[Math.floor(Math.random() * colors.length)];
    ctx.lineWidth = 1 + Math.random() * 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 4, y - 1 - Math.random() * 5);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

const grassTexture = makeGrassTexture('#78b967', ['#a3d889', '#5fa954', '#c1df91', '#72b45f']);
grassTexture.repeat.set(7, 7);
grassMat.map = grassTexture;
grassMat.color.set(0xffffff);
grassMat.needsUpdate = true;

const paddockTexture = makeGrassTexture('#91cd77', ['#b8df91', '#82c56f', '#a5d987', '#78b969'], 2400);
paddockTexture.repeat.set(4, 3);
fieldMat.map = paddockTexture;
fieldMat.color.set(0xffffff);
fieldMat.needsUpdate = true;

// The farm is built on a round island rather than a rectangular plane.
const groundRadius = 25.5;
const ground = new THREE.Mesh(new THREE.CircleGeometry(groundRadius, 128), grassMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.08;
ground.receiveShadow = true;
scene.add(ground);

// A soft dirt rim makes the circular edge of the land visible from the camera.
const landRim = new THREE.Mesh(
  new THREE.RingGeometry(groundRadius - 0.42, groundRadius, 128),
  material(0xb99769, 1)
);
landRim.rotation.x = -Math.PI / 2;
landRim.position.y = -0.055;
landRim.receiveShadow = true;
scene.add(landRim);

// Round grass field inside the wooden fence.
const paddockRadius = 10.85;
const paddock = new THREE.Mesh(new THREE.CircleGeometry(paddockRadius, 128), fieldMat);
paddock.rotation.x = -Math.PI / 2;
paddock.position.set(0, -0.035, 0);
paddock.receiveShadow = true;
scene.add(paddock);

// Shared dimensions are also used by the wolf routes and sheep movement.
const farmFenceRadius = 11.5;
const farmGateHalfWidth = 1.22;
const farmGateZ = Math.sqrt(farmFenceRadius ** 2 - farmGateHalfWidth ** 2);
const farmGateAngle = Math.PI / 2;
const farmGateHalfAngle = Math.asin(farmGateHalfWidth / farmFenceRadius);
const sheepRoamRadius = 8.8;

// A curved dirt lane connects the round farm gate to the holding pen.
function createDirtRibbon(points, width, mat) {
  const vertices = [];
  const indices = [];
  const half = width / 2;

  for (let i = 0; i < points.length; i += 1) {
    const previous = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const tangentX = next.x - previous.x;
    const tangentZ = next.z - previous.z;
    const length = Math.hypot(tangentX, tangentZ) || 1;
    const sideX = -tangentZ / length;
    const sideZ = tangentX / length;
    const point = points[i];

    vertices.push(
      point.x + sideX * half, -0.018, point.z + sideZ * half,
      point.x - sideX * half, -0.018, point.z - sideZ * half
    );

    if (i < points.length - 1) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const path = new THREE.Mesh(geometry, mat);
  path.receiveShadow = true;
  scene.add(path);
  return path;
}

createDirtRibbon([
  new THREE.Vector3(0, 0, farmGateZ - 0.25),
  new THREE.Vector3(0, 0, 13.0),
  new THREE.Vector3(4.2, 0, 13.0),
  new THREE.Vector3(8.5, 0, 11.2),
  new THREE.Vector3(11.6, 0, 7.5),
  new THREE.Vector3(12.5, 0, 3.6),
  new THREE.Vector3(13.0, 0, 0)
], 2.15, dirtMat);

// Rectangular rails are still used by the separate outdoor holding pen.
function addFenceRail(x1, z1, x2, z2, y, thickness = 0.12) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const length = Math.hypot(dx, dz);
  const rail = addBox(scene, [length, thickness, thickness], [(x1 + x2) / 2, y, (z1 + z2) / 2], fenceMat);
  rail.rotation.y = -Math.atan2(dz, dx);
  return rail;
}

// Continuous curved rails form a circular fence, with an opening at the front.
function addCircularFenceRail(y) {
  const points = [];
  const start = farmGateAngle + farmGateHalfAngle;
  const end = farmGateAngle + Math.PI * 2 - farmGateHalfAngle;
  const steps = 150;

  for (let i = 0; i <= steps; i += 1) {
    const angle = start + (end - start) * (i / steps);
    points.push(new THREE.Vector3(
      farmFenceRadius * Math.cos(angle),
      y,
      farmFenceRadius * Math.sin(angle)
    ));
  }

  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const railGeometry = new THREE.TubeGeometry(curve, 180, 0.065, 8, false);
  const rail = new THREE.Mesh(railGeometry, fenceMat);
  rail.castShadow = true;
  rail.receiveShadow = true;
  scene.add(rail);
}

// Evenly spaced square posts around the circle. Leave the gate opening clear.
const fencePostCount = 64;
for (let i = 0; i < fencePostCount; i += 1) {
  const angle = (i / fencePostCount) * Math.PI * 2;
  let delta = angle - farmGateAngle;
  delta = Math.atan2(Math.sin(delta), Math.cos(delta));
  if (Math.abs(delta) < farmGateHalfAngle + 0.025) continue;

  const post = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 1.02, 0.22),
    fencePostMat
  );
  post.position.set(
    farmFenceRadius * Math.cos(angle),
    0.49,
    farmFenceRadius * Math.sin(angle)
  );
  post.rotation.y = -angle;
  post.castShadow = true;
  post.receiveShadow = true;
  scene.add(post);
}

addCircularFenceRail(0.38);
addCircularFenceRail(0.78);

// Gate jambs and hinged gate leaf at the front opening.
for (const x of [-farmGateHalfWidth, farmGateHalfWidth]) {
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.2, 0.25), woodMat);
  post.position.set(x, 0.58, farmGateZ);
  post.castShadow = true;
  scene.add(post);
}

const gate = new THREE.Group();
addBox(gate, [2.25, 0.13, 0.13], [0, 0.68, 0], fenceMat);
addBox(gate, [2.25, 0.13, 0.13], [0, 0.28, 0], fenceMat);
addBox(gate, [0.13, 0.72, 0.13], [-1.03, 0.48, 0], woodMat);
addBox(gate, [0.13, 0.72, 0.13], [1.03, 0.48, 0], woodMat);
gate.position.set(0, 0, farmGateZ + 0.02);
scene.add(gate);

// Separate holding pen outside the farm. The opening faces the farm (left side).
const penMinX = 13.0;
const penMaxX = 19.3;
const penMinZ = -4.0;
const penMaxZ = 4.0;
const penCenterX = (penMinX + penMaxX) / 2;

const penFloor = new THREE.Mesh(
  new THREE.PlaneGeometry(penMaxX - penMinX, penMaxZ - penMinZ),
  material(0xc9a477, 1)
);
penFloor.rotation.x = -Math.PI / 2;
penFloor.position.set(penCenterX, -0.025, 0);
penFloor.receiveShadow = true;
scene.add(penFloor);

// Top and bottom rails, right wall, and a left wall with an entrance gap.
for (const y of [0.38, 0.76]) {
  addFenceRail(penMinX, penMinZ, penMaxX, penMinZ, y);
  addFenceRail(penMinX, penMaxZ, penMaxX, penMaxZ, y);
  addFenceRail(penMaxX, penMinZ, penMaxX, penMaxZ, y);
  addFenceRail(penMinX, penMinZ, penMinX, -0.95, y);
  addFenceRail(penMinX, 0.95, penMinX, penMaxZ, y);
}

// Fence posts around the holding pen.
for (let x = penMinX; x <= penMaxX + 0.01; x += 1.55) {
  for (const z of [penMinZ, penMaxZ]) {
    addBox(scene, [0.19, 1.0, 0.19], [x, 0.48, z], fencePostMat);
  }
}
for (let z = penMinZ; z <= penMaxZ + 0.01; z += 1.6) {
  addBox(scene, [0.19, 1.0, 0.19], [penMaxX, 0.48, z], fencePostMat);
  if (z < -0.95 || z > 0.95) {
    addBox(scene, [0.19, 1.0, 0.19], [penMinX, 0.48, z], fencePostMat);
  }
}
for (const z of [-0.95, 0.95]) {
  addBox(scene, [0.19, 1.0, 0.19], [penMinX, 0.48, z], fencePostMat);
}

// A small wooden sign identifies the captured-sheep area.
const penSign = new THREE.Group();
addBox(penSign, [3.5, 0.92, 0.16], [0, 0, 0], woodMat);
const signCanvas = document.createElement('canvas');
signCanvas.width = 512;
signCanvas.height = 128;
const signContext = signCanvas.getContext('2d');
signContext.fillStyle = '#70482f';
signContext.fillRect(0, 0, 512, 128);
signContext.strokeStyle = '#e8c994';
signContext.lineWidth = 8;
signContext.strokeRect(9, 9, 494, 110);
signContext.fillStyle = '#fff4d9';
signContext.font = 'bold 43px Arial';
signContext.textAlign = 'center';
signContext.textBaseline = 'middle';
signContext.fillText('LỒNG CỪU', 256, 66);
const signTexture = new THREE.CanvasTexture(signCanvas);
const signFace = new THREE.Mesh(
  new THREE.PlaneGeometry(3.25, 0.72),
  new THREE.MeshBasicMaterial({ map: signTexture })
);
signFace.position.set(0, 0, 0.09);
penSign.add(signFace);
penSign.position.set(penCenterX, 1.55, penMinZ - 0.02);
scene.add(penSign);

// Barn removed: keep the circular farm open and unobstructed.

// Trees, shrubs and flowers
function createTree(x, z, size = 1) {
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * size, 0.23 * size, 1.35 * size, 12), woodMat);
  trunk.position.y = 0.67 * size;
  trunk.castShadow = true;
  tree.add(trunk);
  const leafMat = material(0x4d9c5a);
  addSphere(tree, 0.82 * size, [0, 1.65 * size, 0], [1, 0.92, 1], leafMat, 24);
  addSphere(tree, 0.55 * size, [-0.42 * size, 1.45 * size, 0.08 * size], [1, 1, 1], material(0x68b76a), 20);
  addSphere(tree, 0.55 * size, [0.43 * size, 1.62 * size, -0.05 * size], [1, 1, 1], material(0x3f884d), 20);
  tree.position.set(x, 0, z);
  scene.add(tree);
  return tree;
}

createTree(-10.5, -3.5, 1.25);
createTree(-10, 4.5, 0.95);
createTree(10.2, -4.5, 1.15);
createTree(10.1, 4.2, 0.9);
createTree(5.5, -9, 1.0);

for (let i = 0; i < 28; i++) {
  const x = (Math.random() - 0.5) * 15;
  const z = (Math.random() - 0.5) * 10;
  if (Math.abs(x) > 7.2 || Math.abs(z) > 5.1) continue;
  const flowerGroup = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.025, 0.28, 5), material(0x4c9855));
  stem.position.y = 0.14;
  flowerGroup.add(stem);
  const colors = [0xffd166, 0xfff3a6, 0xff91a4, 0xffffff];
  addSphere(flowerGroup, 0.09, [0, 0.31, 0], [1, 0.65, 1], material(colors[i % colors.length]), 8);
  flowerGroup.position.set(x, 0, z);
  scene.add(flowerGroup);
}

// A few soft clouds in the sky
function createCloud(x, y, z, scale = 1) {
  const cloud = new THREE.Group();
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  addSphere(cloud, 0.8, [0, 0, 0], [1.4, 0.65, 0.7], cloudMat, 12);
  addSphere(cloud, 0.55, [-0.65, 0.12, 0], [1, 0.9, 0.8], cloudMat, 12);
  addSphere(cloud, 0.62, [0.55, 0.14, 0.02], [1, 0.9, 0.8], cloudMat, 12);
  cloud.position.set(x, y, z);
  cloud.scale.setScalar(scale);
  scene.add(cloud);
}
createCloud(-12, 9, -10, 1.5);
createCloud(9, 11, -13, 1.25);

// -----------------------------------------------------------------------------
// Farm decoration pack: small props are placed around the perimeter so they
// do not obstruct the sheep roaming area, the main gate, or the wolf route.
// -----------------------------------------------------------------------------
const farmDecor = new THREE.Group();
scene.add(farmDecor);

function addDecorBox(parent, size, position, mat, cast = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  mesh.position.set(...position);
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function createBush(x, z, scale = 1) {
  const bush = new THREE.Group();
  const leafMaterials = [
    material(0x4f9952),
    material(0x61aa5c),
    material(0x78b968)
  ];
  const parts = [
    [0, 0.38, 0, 0.58],
    [-0.38, 0.30, 0.08, 0.42],
    [0.36, 0.31, -0.04, 0.45],
    [0.02, 0.62, -0.08, 0.42]
  ];
  parts.forEach(([px, py, pz, radius], i) => {
    const leaf = new THREE.Mesh(
      new THREE.SphereGeometry(radius * scale, 20, 16),
      leafMaterials[i % leafMaterials.length]
    );
    leaf.position.set(px * scale, py * scale, pz * scale);
    leaf.castShadow = true;
    leaf.receiveShadow = true;
    bush.add(leaf);
  });
  bush.position.set(x, 0, z);
  farmDecor.add(bush);
  return bush;
}

function createHayBale(x, z, rotation = 0) {
  const bale = new THREE.Group();
  const hay = material(0xe5bd69);
  const hayEnd = material(0xc99745);
  const rope = material(0x9b733a);

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.48, 0.48, 1.12, 28),
    hay
  );
  body.rotation.z = Math.PI / 2;
  body.position.y = 0.49;
  body.castShadow = true;
  body.receiveShadow = true;
  bale.add(body);

  for (const side of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.CircleGeometry(0.465, 28), hayEnd);
    cap.rotation.y = side * Math.PI / 2;
    cap.position.set(side * 0.565, 0.49, 0);
    bale.add(cap);
  }

  for (const xPos of [-0.28, 0.28]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.474, 0.016, 8, 28), rope);
    band.rotation.y = Math.PI / 2;
    band.position.set(xPos, 0.49, 0);
    bale.add(band);
  }

  bale.position.set(x, 0, z);
  bale.rotation.y = rotation;
  farmDecor.add(bale);
}

function createWaterTrough(x, z) {
  const trough = new THREE.Group();
  const darkWood = material(0x65452f);
  const plank = material(0x986540);
  const water = new THREE.MeshStandardMaterial({
    color: 0x69c6df,
    roughness: 0.2,
    metalness: 0.12
  });

  addDecorBox(trough, [1.7, 0.16, 0.68], [0, 0.66, 0], darkWood);
  addDecorBox(trough, [1.7, 0.4, 0.10], [0, 0.84, -0.30], plank);
  addDecorBox(trough, [1.7, 0.4, 0.10], [0, 0.84, 0.30], plank);
  addDecorBox(trough, [0.10, 0.4, 0.62], [-0.8, 0.84, 0], plank);
  addDecorBox(trough, [0.10, 0.4, 0.62], [0.8, 0.84, 0], plank);

  const waterSurface = new THREE.Mesh(new THREE.PlaneGeometry(1.46, 0.48), water);
  waterSurface.rotation.x = -Math.PI / 2;
  waterSurface.position.y = 0.91;
  trough.add(waterSurface);

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      addDecorBox(trough, [0.12, 0.65, 0.12], [sx * 0.65, 0.32, sz * 0.22], darkWood);
    }
  }

  trough.position.set(x, 0, z);
  farmDecor.add(trough);
}

function createFlowerPatch(x, z, count = 9, spread = 1.5) {
  const patch = new THREE.Group();
  const stemMat = material(0x4d9855);
  const flowerMats = [
    material(0xffd166),
    material(0xff91a4),
    material(0xfff3d4),
    material(0xb49ae8),
    material(0xf5a45d)
  ];

  for (let i = 0; i < count; i += 1) {
    const fx = (Math.random() - 0.5) * spread;
    const fz = (Math.random() - 0.5) * spread * 0.8;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.25, 6), stemMat);
    stem.position.set(fx, 0.125, fz);
    patch.add(stem);

    const flowerMat = flowerMats[Math.floor(Math.random() * flowerMats.length)];
    const center = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), flowerMat);
    center.position.set(fx, 0.27, fz);
    center.scale.y = 0.72;
    patch.add(center);

    for (let petalIndex = 0; petalIndex < 5; petalIndex += 1) {
      const angle = petalIndex * Math.PI * 2 / 5;
      const petal = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), flowerMat);
      petal.position.set(fx + Math.cos(angle) * 0.075, 0.27, fz + Math.sin(angle) * 0.075);
      patch.add(petal);
    }
  }

  patch.position.set(x, 0, z);
  farmDecor.add(patch);
  return patch;
}

function createStone(x, z, scale = 1) {
  const stone = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.22 * scale, 1),
    material(0xa9a795, 1)
  );
  stone.position.set(x, 0.12 * scale, z);
  stone.scale.set(1.25, 0.68, 1);
  stone.rotation.set(Math.random() * 0.3, Math.random() * Math.PI, Math.random() * 0.2);
  stone.castShadow = true;
  stone.receiveShadow = true;
  farmDecor.add(stone);
}

function createFarmSign() {
  const sign = new THREE.Group();
  const postMat = material(0x76502f);
  const trimMat = material(0xd1a568);
  const boardMat = material(0x80512f);

  for (const x of [-2.35, 2.35]) {
    addDecorBox(sign, [0.18, 2.65, 0.18], [x, 1.32, 0], postMat);
    addDecorBox(sign, [0.30, 0.16, 0.30], [x, 2.68, 0], trimMat);
  }
  addDecorBox(sign, [5.0, 0.22, 0.24], [0, 2.65, 0], trimMat);
  addDecorBox(sign, [4.15, 0.82, 0.18], [0, 2.05, 0], boardMat);

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#79502f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#e9cf99';
  ctx.lineWidth = 16;
  ctx.strokeRect(12, 12, 1000, 232);
  ctx.fillStyle = '#fff2d2';
  ctx.font = 'bold 82px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('NÔNG TRẠI CỪU', 512, 128);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(4.0, 0.72),
    new THREE.MeshBasicMaterial({ map: texture })
  );
  face.position.set(0, 2.05, 0.101);
  sign.add(face);

  // Place the sign above and just outside the front gate; its posts sit clear
  // of the wolf's approach lane.
  sign.position.set(0, 0, farmGateZ + 0.65);
  farmDecor.add(sign);
}

// Small grouped decorations; central sheep roaming region stays open.
createBush(-9.3, -5.0, 0.95);
createBush(-9.4, 2.9, 1.0);
createBush(9.35, -5.0, 1.0);
createBush(9.35, 4.8, 0.92);
createBush(-3.4, -7.7, 0.9);
createBush(5.8, -7.7, 0.85);

createHayBale(-3.9, -7.15, 0.22);
createHayBale(-3.15, -7.65, -0.25);
createWaterTrough(6.55, -4.45);
createFarmSign();

// Colourful flower clusters and a few stepping stones frame the farm instead
// of occupying the flock's movement zone.
createFlowerPatch(-8.9, -3.0, 10, 1.5);
createFlowerPatch(-8.9, 4.7, 9, 1.4);
createFlowerPatch(8.9, -3.1, 10, 1.5);
createFlowerPatch(8.9, 5.2, 9, 1.4);
createFlowerPatch(-4.3, 6.9, 8, 1.3);
createFlowerPatch(4.3, 6.9, 8, 1.3);

// Stepping stones follow the curved lane outside the round front gate.
const trailPoints = [
  new THREE.Vector3(0, 0, farmGateZ + 0.9),
  new THREE.Vector3(4.2, 0, 13.0),
  new THREE.Vector3(8.5, 0, 11.2),
  new THREE.Vector3(11.6, 0, 7.5),
  new THREE.Vector3(12.5, 0, 3.6)
];
for (let segment = 0; segment < trailPoints.length - 1; segment += 1) {
  const a = trailPoints[segment];
  const b = trailPoints[segment + 1];
  const count = Math.max(2, Math.ceil(a.distanceTo(b) / 1.15));
  for (let i = 0; i < count; i += 1) {
    const t = i / count;
    createStone(
      THREE.MathUtils.lerp(a.x, b.x, t) + (Math.random() - 0.5) * 0.35,
      THREE.MathUtils.lerp(a.z, b.z, t) + (Math.random() - 0.5) * 0.35,
      0.85 + Math.random() * 0.2
    );
  }
}

// A few decorative rocks near the outer corners.
[
  [-9.0, -6.7, 1.0], [-9.1, 5.9, 0.85],
  [9.0, -6.7, 0.95], [9.15, 6.3, 0.9],
  [-4.7, 7.25, 0.7], [5.1, 7.15, 0.7]
].forEach(([x, z, scale]) => createStone(x, z, scale));

// -----------------------------------------------------------------------------
// Quaternius Ultimate Stylized Nature Pack — outer landscape
// Models are loaded from the pack's GLTF files when available. The code also
// creates lightweight Three.js stand-ins so the map remains decorated if a
// model file or remote host is unavailable.
// -----------------------------------------------------------------------------
const NATURE_PACK_LOCAL_BASE = '/models/nature/glTF/';
const NATURE_PACK_REMOTE_BASE =
  'https://badestrand.github.io/threejs/models/quaternius-ultimate-stylized-nature/glTF/';

const natureAssetCache = new Map();

async function loadNaturePackAsset(fileName) {
  if (natureAssetCache.has(fileName)) return natureAssetCache.get(fileName);

  const promise = (async () => {
    // Prefer a local copy of the downloaded Quaternius GLTF folder.
    try {
      const local = await gltfLoader.loadAsync(`${NATURE_PACK_LOCAL_BASE}${fileName}`);
      console.info(`[Nature Pack] Loaded local asset: ${fileName}`);
      return local;
    } catch {
      // A public mirror is used as a convenience when the local pack is absent.
      try {
        const remote = await gltfLoader.loadAsync(`${NATURE_PACK_REMOTE_BASE}${fileName}`);
        console.info(`[Nature Pack] Loaded online asset: ${fileName}`);
        return remote;
      } catch (error) {
        console.warn(`[Nature Pack] Could not load ${fileName}; using a built-in nature prop.`, error);
        return null;
      }
    }
  })();

  natureAssetCache.set(fileName, promise);
  return promise;
}

function addNaturePackInstance(gltf, fileName, x, z, targetHeight, yaw = 0, extraScale = 1) {
  if (!gltf?.scene) return false;

  const model = SkeletonUtils.clone(gltf.scene);
  model.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    object.frustumCulled = false;
    const setNaturalFinish = (mat) => {
      if (!mat) return;
      if ('metalness' in mat) mat.metalness = 0;
      if ('roughness' in mat) mat.roughness = Math.max(mat.roughness ?? 0.8, 0.72);
    };
    if (Array.isArray(object.material)) object.material.forEach(setNaturalFinish);
    else setNaturalFinish(object.material);
  });

  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = (targetHeight / Math.max(size.y, 0.001)) * extraScale;

  model.scale.setScalar(scale);
  model.position.set(
    -center.x * scale,
    -bounds.min.y * scale,
    -center.z * scale
  );
  model.rotation.y = yaw;

  const instance = new THREE.Group();
  instance.position.set(x, 0, z);
  instance.add(model);
  farmDecor.add(instance);
  return instance;
}

// The tree line sits toward the rim of the circular island. The south-east
// gate lane and the holding pen to the east are deliberately kept clear.
const natureTreePlacements = [
  { file: 'BirchTree_1.gltf', x: -18.0, z: -8.0, h: 6.0, yaw: 0.3 },
  { file: 'MapleTree_1.gltf', x: -21.0, z: -1.0, h: 6.8, yaw: 1.1 },
  { file: 'BirchTree_3.gltf', x: -19.0, z: 7.0, h: 5.7, yaw: 2.2 },
  { file: 'MapleTree_3.gltf', x: -14.0, z: 14.0, h: 6.6, yaw: 0.8 },
  { file: 'BirchTree_1.gltf', x: -7.0, z: 19.0, h: 5.8, yaw: 2.8 },
  { file: 'MapleTree_1.gltf', x: 3.0, z: 20.0, h: 6.5, yaw: 1.7 },
  { file: 'BirchTree_3.gltf', x: 11.0, z: 17.0, h: 5.7, yaw: 0.2 },
  { file: 'MapleTree_3.gltf', x: 16.0, z: -12.0, h: 6.3, yaw: 2.4 },
  { file: 'BirchTree_1.gltf', x: 9.0, z: -18.0, h: 5.9, yaw: 1.4 },
  { file: 'MapleTree_1.gltf', x: -3.0, z: -20.0, h: 6.7, yaw: 0.6 },
  { file: 'BirchTree_3.gltf', x: -14.0, z: -15.0, h: 5.5, yaw: 2.6 }
];

const natureBushPlacements = [
  { file: 'Bush.gltf', x: -14.4, z: -4.2, h: 1.75 },
  { file: 'Bush_Large.gltf', x: -15.0, z: 3.4, h: 2.25 },
  { file: 'Bush_Flowers.gltf', x: -11.0, z: 11.4, h: 1.95 },
  { file: 'Bush_Large_Flowers.gltf', x: -5.2, z: 15.2, h: 2.3 },
  { file: 'Bush_Flowers.gltf', x: 5.0, z: 15.4, h: 1.9 },
  { file: 'Bush_Large.gltf', x: 17.0, z: -7.2, h: 2.25 },
  { file: 'Bush.gltf', x: 9.2, z: -14.6, h: 1.65 },
  { file: 'Bush_Large_Flowers.gltf', x: -2.5, z: -15.8, h: 2.2 },
  { file: 'Bush_Flowers.gltf', x: -13.4, z: -11.8, h: 1.95 }
];

// First render dependable procedural props, then replace each one with the
// full textured Nature Pack GLTF as its file finishes loading.
const naturePlaceholders = new Map();

for (const item of natureTreePlacements) {
  const placeholder = createTree(item.x, item.z, item.h / 5.6);
  naturePlaceholders.set(`tree:${item.x},${item.z}`, placeholder);
}
for (const item of natureBushPlacements) {
  const placeholder = item.file.includes('Flowers')
    ? createFlowerPatch(item.x, item.z, 12, 2.0)
    : createBush(item.x, item.z, item.h / 1.8);
  naturePlaceholders.set(`bush:${item.x},${item.z}`, placeholder);
}

async function replaceNaturePlaceholdersWithPackModels() {
  const fileNames = [...new Set([
    ...natureTreePlacements.map((item) => item.file),
    ...natureBushPlacements.map((item) => item.file)
  ])];
  const loaded = await Promise.all(fileNames.map(async (fileName) => [
    fileName,
    await loadNaturePackAsset(fileName)
  ]));
  const modelMap = new Map(loaded);

  const packModelGroup = new THREE.Group();
  packModelGroup.name = 'Quaternius Ultimate Stylized Nature Pack';
  farmDecor.add(packModelGroup);

  for (const item of natureTreePlacements) {
    const gltf = modelMap.get(item.file);
    if (!gltf) continue;

    const instance = addNaturePackInstance(
      gltf, item.file, item.x, item.z, item.h, item.yaw, 1
    );
    if (instance) {
      packModelGroup.add(instance);
      const placeholder = naturePlaceholders.get(`tree:${item.x},${item.z}`);
      if (placeholder?.parent) placeholder.parent.remove(placeholder);
    }
  }

  for (const item of natureBushPlacements) {
    const gltf = modelMap.get(item.file);
    if (!gltf) continue;

    const instance = addNaturePackInstance(
      gltf, item.file, item.x, item.z, item.h, Math.random() * Math.PI * 2, 1
    );
    if (instance) {
      packModelGroup.add(instance);
      const placeholder = naturePlaceholders.get(`bush:${item.x},${item.z}`);
      if (placeholder?.parent) placeholder.parent.remove(placeholder);
    }
  }
}

// Do not block the game loop while external nature models are loading.
replaceNaturePlaceholdersWithPackModels().catch((error) => {
  console.warn('[Nature Pack] Using built-in nature decorations.', error);
});

// A small woodland pond and stone clusters add a focal point on the western
// side of the island, away from the gate route and the sheep pen.
function createWoodlandPond(x, z) {
  const pond = new THREE.Group();
  const bank = new THREE.Mesh(
    new THREE.CircleGeometry(2.25, 56),
    material(0xb9a17c, 1)
  );
  bank.rotation.x = -Math.PI / 2;
  bank.scale.set(1.35, 0.9, 1);
  bank.position.y = 0.012;
  pond.add(bank);

  const water = new THREE.Mesh(
    new THREE.CircleGeometry(1.9, 56),
    new THREE.MeshStandardMaterial({
      color: 0x63b9d0,
      roughness: 0.19,
      metalness: 0.08,
      transparent: true,
      opacity: 0.92
    })
  );
  water.rotation.x = -Math.PI / 2;
  water.scale.set(1.35, 0.9, 1);
  water.position.y = 0.035;
  pond.add(water);

  const rippleMat = new THREE.MeshBasicMaterial({ color: 0xc8f4ee, transparent: true, opacity: 0.65 });
  for (let i = 0; i < 4; i += 1) {
    const ripple = new THREE.Mesh(
      new THREE.TorusGeometry(0.18 + i * 0.13, 0.012, 6, 36),
      rippleMat
    );
    ripple.rotation.x = Math.PI / 2;
    ripple.position.set(-0.35 + i * 0.2, 0.06 + i * 0.001, 0.1);
    ripple.scale.set(1.5, 0.78, 1);
    pond.add(ripple);
  }

  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2;
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.25 + Math.random() * 0.18, 1),
      material([0x8e9584, 0xa8a38f, 0x777f76][i % 3], 1)
    );
    rock.position.set(Math.cos(angle) * 2.75, 0.16, Math.sin(angle) * 1.9);
    rock.scale.set(1.25, 0.7, 0.95);
    rock.rotation.y = Math.random() * Math.PI;
    rock.castShadow = true;
    pond.add(rock);
  }

  // Lily leaves and tiny flowers.
  for (const [lx, lz] of [[-1.05, 0.35], [0.9, -0.45], [0.25, 0.72]]) {
    const leaf = new THREE.Mesh(
      new THREE.CircleGeometry(0.24, 16),
      material(0x4c9b65)
    );
    leaf.rotation.x = -Math.PI / 2;
    leaf.position.set(lx, 0.075, lz);
    pond.add(leaf);
  }

  const flower = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 12, 10),
    material(0xffc5d4)
  );
  flower.position.set(0.9, 0.13, -0.45);
  pond.add(flower);

  pond.position.set(x, 0, z);
  farmDecor.add(pond);
}

createWoodlandPond(-11.2, -11.6);

// Additional grass tufts in irregular patches along the island edge.
function createGrassClump(x, z, scale = 1) {
  const clump = new THREE.Group();
  const grassMaterials = [material(0x4d9957), material(0x69ad60), material(0x8ac76e)];
  for (let i = 0; i < 5; i += 1) {
    const blade = new THREE.Mesh(
      new THREE.ConeGeometry(0.075 * scale, (0.55 + Math.random() * 0.35) * scale, 6),
      grassMaterials[i % grassMaterials.length]
    );
    blade.position.set((Math.random() - 0.5) * 0.38 * scale, (0.26 + Math.random() * 0.08) * scale, (Math.random() - 0.5) * 0.38 * scale);
    blade.rotation.z = (Math.random() - 0.5) * 0.55;
    clump.add(blade);
  }
  clump.position.set(x, 0, z);
  farmDecor.add(clump);
}

[
  [-22, -5], [-21, 8], [-16, 17], [-5, 22], [7, 21],
  [15, -16], [21, -11], [-18, -16], [-7, -22], [3, -22]
].forEach(([x, z], index) => {
  for (let j = 0; j < 4; j += 1) {
    createGrassClump(x + (Math.random() - 0.5) * 1.8, z + (Math.random() - 0.5) * 1.8, 0.7 + (index % 3) * 0.12);
  }
});

// -----------------------------------------------------------------------------
// Sheep character
// -----------------------------------------------------------------------------
const collarColors = [0xf07c65, 0x4c9fe8, 0xe7b84e, 0x9a78d6, 0x59b99a, 0xe77fb2, 0x77a7a0];
const woolPalette = [
  0xff3333, // red
  0xff7700, // orange
  0xffcc00, // yellow
  0x9cff00, // lime
  0x35d058, // green
  0x00d6a3, // turquoise
  0x00cfff, // cyan
  0x2878ff, // blue
  0x4938ff, // indigo
  0x983cff, // violet
  0xd936ff, // magenta
  0xff3ca6, // hot pink
  0xff8fab, // pastel pink
  0xffb347, // pastel orange
  0x9b59b6, // purple
  0x795548, // brown
  0xffffff, // white
  0x292929, // near black
  0x80deea, // light cyan
  0xfff176, // light yellow
  0x76ffda, // mint
  0xff5252, // coral red
  0xb388ff, // lavender
  0x69f0ae  // neon green
];

function createProceduralSheepVisual(group, index, coatColor) {
  const woolMat = material(coatColor, 0.96);
  const tuftColor = new THREE.Color(coatColor).lerp(new THREE.Color(0xffffff), 0.10);
  const woolTuftMat = material(tuftColor, 0.98);
  const faceMat = material(0xb9a99b, 0.92);
  const eyeWhite = material(0xffffff, 0.45);
  const eyeBlack = material(0x1b2520, 0.35);
  const earMat = material(0x9c887b);
  const legs = [];

  addSphere(group, 0.64, [0, 0.83, 0], [1.05, 0.85, 1.3], woolMat, 28);
  const tufts = [
    [-0.48, 1.12, 0.25], [0.48, 1.12, 0.25], [-0.48, 0.94, -0.42],
    [0.48, 0.94, -0.42], [0, 1.33, -0.42], [0, 1.38, 0.22],
    [-0.55, 0.78, 0], [0.55, 0.78, 0], [0, 0.75, -0.76]
  ];
  tufts.forEach((point, i) => addSphere(group, i % 3 === 0 ? 0.31 : 0.27, point, [1, 1, 1], woolTuftMat, 20));

  addSphere(group, 0.34, [0, 0.98, 0.65], [0.82, 1.05, 0.9], woolMat, 24);
  addSphere(group, 0.34, [0, 1.0, 0.93], [0.86, 1.05, 0.92], faceMat, 24);
  addSphere(group, 0.22, [0, 0.83, 1.18], [1.05, 0.72, 0.72], creamMat, 20);
  addSphere(group, 0.065, [0, 0.86, 1.42], [1, 0.8, 0.75], darkFaceMat, 16);

  for (const side of [-1, 1]) {
    const ear = addSphere(group, 0.17, [side * 0.36, 1.2, 0.82], [1.6, 0.48, 0.65], earMat, 18);
    ear.rotation.z = side * -0.35;
    addSphere(group, 0.075, [side * 0.22, 1.09, 1.18], [0.55, 0.55, 0.45], eyeWhite, 16);
    addSphere(group, 0.038, [side * 0.225, 1.09, 1.215], [0.8, 0.9, 0.7], eyeBlack, 14);
  }

  for (const sideX of [-1, 1]) {
    for (const sideZ of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sideX * 0.35, 0.55, sideZ * 0.48);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.48, 14), darkFaceMat);
      leg.position.y = -0.24;
      leg.castShadow = true;
      pivot.add(leg);
      const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.12, 14), hoofMat);
      hoof.position.set(0, -0.48, 0.015);
      pivot.add(hoof);
      group.add(pivot);
      legs.push(pivot);
    }
  }

  const collar = new THREE.Mesh(
    new THREE.TorusGeometry(0.25, 0.055, 14, 32),
    material(collarColors[index % collarColors.length], 0.45, { metalness: 0.08 })
  );
  collar.position.set(0, 0.94, 0.73);
  collar.rotation.x = Math.PI / 2.6;
  group.add(collar);
  return legs;
}

function createSheep(name, index, x, z) {
  const group = new THREE.Group();
  const coatColor = woolPalette[Math.floor(Math.random() * woolPalette.length)];
  let legs = [];
  let modelRig = null;

  if (sheepGLTF) {
    modelRig = makeModelRig(sheepGLTF, MODEL_CONFIG.sheep, coatColor);
    group.add(modelRig.model);
  } else {
    legs = createProceduralSheepVisual(group, index, coatColor);
  }

  group.position.set(x, 0, z);
  scene.add(group);

  const label = document.createElement('div');
  label.className = 'sheep-label';
  label.textContent = name;
  document.body.appendChild(label);

  return {
    name,
    group,
    label,
    legs,
    mixer: modelRig?.mixer ?? null,
    actions: modelRig?.actions ?? null,
    currentAction: modelRig?.currentAction ?? null,
    currentMode: modelRig?.currentMode ?? null,
    active: true,
    captured: false,
    isCarried: false,
    isFading: false,
    fadeTime: 0,
    baseY: 0,
    seed: Math.random() * Math.PI * 2,
    coatColor,
    wanderTarget: new THREE.Vector3(
      THREE.MathUtils.clamp(x + (Math.random() - 0.5) * 4.5, -6.2, 6.2),
      0,
      THREE.MathUtils.clamp(z + (Math.random() - 0.5) * 3.8, -4.2, 4.2)
    ),
    wanderTimer: 1 + Math.random() * 2,
    wanderSpeed: 0.55 + Math.random() * 0.42,
    walking: false
  };
}

// -----------------------------------------------------------------------------
// Wolf character (the game's AI hunter)
// -----------------------------------------------------------------------------
function createWolf() {
  if (wolfGLTF) {
    const wolf = new THREE.Group();
    const modelRig = makeModelRig(wolfGLTF, MODEL_CONFIG.wolf);
    wolf.add(modelRig.model);
    wolf.position.set(0, 0, farmFenceRadius + 1.8);
    wolf.rotation.y = Math.PI; // Face into the farm while waiting at the gate.
    scene.add(wolf);
    return {
      group: wolf,
      legs: [],
      tail: null,
      mixer: modelRig.mixer,
      actions: modelRig.actions,
      currentAction: modelRig.currentAction,
      currentMode: modelRig.currentMode
    };
  }
  return createProceduralWolf();
}

function createProceduralWolf() {
  const wolf = new THREE.Group();
  const furMat = material(0x66747b, 0.9);
  const darkMat = material(0x39464c, 0.9);
  const muzzleMat = material(0xb5a59a, 0.9);
  const eyeMat = material(0xf4c35e, 0.45, { emissive: 0x6e3c0c, emissiveIntensity: 0.2 });
  const blackMat = material(0x171c20, 0.45);
  const legs = [];

  addSphere(wolf, 0.55, [0, 0.9, 0], [0.85, 0.9, 1.35], furMat, 28);
  addSphere(wolf, 0.43, [0, 1.18, 0.86], [0.9, 0.95, 0.9], furMat, 26);
  addSphere(wolf, 0.27, [0, 0.96, 1.22], [1.15, 0.68, 0.92], muzzleMat, 22);
  addSphere(wolf, 0.095, [0, 1.03, 1.46], [1, 0.75, 0.8], blackMat, 16);

  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.55, 16), darkMat);
    ear.position.set(side * 0.29, 1.68, 0.7);
    ear.rotation.z = side * -0.2;
    ear.castShadow = true;
    wolf.add(ear);
    addSphere(wolf, 0.075, [side * 0.22, 1.28, 1.18], [1, 1, 0.55], eyeMat, 16);
    addSphere(wolf, 0.033, [side * 0.22, 1.28, 1.22], [1, 1, 0.5], blackMat, 14);
  }

  // Tail
  const tail = new THREE.Group();
  tail.position.set(0, 1.12, -0.72);
  const tailMesh = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.75, 16), furMat);
  tailMesh.rotation.x = -Math.PI / 2.3;
  tailMesh.position.z = -0.3;
  tail.add(tailMesh);
  wolf.add(tail);

  for (const sideX of [-1, 1]) {
    for (const sideZ of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.userData.sideZ = sideZ;
      pivot.position.set(sideX * 0.34, 0.66, sideZ * 0.58);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.12, 0.58, 14), darkMat);
      leg.position.y = -0.29;
      leg.castShadow = true;
      pivot.add(leg);
      const paw = new THREE.Mesh(new THREE.SphereGeometry(0.14, 18, 14), darkMat);
      paw.position.set(0, -0.55, 0.08);
      pivot.add(paw);
      wolf.add(pivot);
      legs.push(pivot);
    }
  }

  wolf.position.set(0, 0, farmFenceRadius + 1.8);
  wolf.rotation.y = Math.PI; // Face into the farm while waiting at the gate.
  wolf.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  scene.add(wolf);
  return { group: wolf, legs, tail };
}

const wolfRig = createWolf();

// The wolf waits beside the front gate until the player releases it.
const wolfHome = new THREE.Vector3(0, 0, farmFenceRadius + 1.8);
wolfRig.group.position.copy(wolfHome);
wolfRig.group.rotation.y = Math.PI;

let wolfState = 'waitingAtGate';
let approachRoute = [];
let routeStage = 0;
let carriedSheep = null;

const carryRoute = [
  new THREE.Vector3(0, 0, 5.0),
  new THREE.Vector3(0, 0, farmFenceRadius - 1.5),
  new THREE.Vector3(0, 0, farmFenceRadius + 1.8),
  new THREE.Vector3(4.2, 0, 13.0),
  new THREE.Vector3(8.5, 0, 11.2),
  new THREE.Vector3(11.6, 0, 7.5),
  new THREE.Vector3(13.55, 0, 0)
];

const returnRoute = [
  new THREE.Vector3(11.8, 0, 0),
  new THREE.Vector3(11.6, 0, 7.5),
  new THREE.Vector3(8.5, 0, 11.2),
  new THREE.Vector3(4.2, 0, 13.0),
  new THREE.Vector3(0, 0, farmFenceRadius + 1.8)
];

let sheep = [];
let targetSheep = null;
let wolfMoving = false;
let roundNumber = 0;
let caughtNumber = 0;
let chaseElapsed = 0;
const wolfSpeed = 10.5;
const carrySpeed = 10.5;
const escapeSpeed = 1.15;

// -----------------------------------------------------------------------------
// UI and game logic
// -----------------------------------------------------------------------------
const nameInput = document.querySelector('#playerNames');
const createButton = document.querySelector('#createFlock');
const releaseButton = document.querySelector('#releaseWolf');
const resetButton = document.querySelector('#resetGame');
const remainingCount = document.querySelector('#remainingCount');
const caughtCount = document.querySelector('#caughtCount');
const roundCount = document.querySelector('#roundCount');
const statusTitle = document.querySelector('#statusTitle');
const statusText = document.querySelector('#statusText');
const statusIcon = document.querySelector('.status-icon');
const caughtModal = document.querySelector('#caughtModal');
const caughtPlayerName = document.querySelector('#caughtPlayerName');
const closeCaughtModalButton = document.querySelector('#closeCaughtModal');
const dismissCaughtModalButton = document.querySelector('#dismissCaughtModal');
// Control panel toggle
const controlPanel = document.querySelector('#controlPanel');
const togglePanelButton = document.querySelector('#togglePanel');

togglePanelButton.addEventListener('click', () => {
    const collapsed = controlPanel.classList.toggle('collapsed');

    togglePanelButton.textContent = collapsed
        ? '☰ MỞ BẢNG'
        : '⌄ ẨN BẢNG';

    togglePanelButton.setAttribute(
        'aria-expanded',
        String(!collapsed)
    );
});
function setStatus(title, text, icon = '🌿') {
  statusTitle.textContent = title;
  statusText.textContent = text;
  statusIcon.textContent = icon;
}


function openCaughtModal(playerName) {
  caughtPlayerName.textContent = playerName;
  caughtModal.classList.add('open');
  caughtModal.setAttribute('aria-hidden', 'false');
  playPopupSound();
  dismissCaughtModalButton.focus({ preventScroll: true });
}

function closeCaughtModal() {
  caughtModal.classList.remove('open');
  caughtModal.setAttribute('aria-hidden', 'true');
}

closeCaughtModalButton.addEventListener('click', closeCaughtModal);

// =========================================
// WELCOME POPUP - 20/11 MRS WINDY
// =========================================

const welcomeModal = document.querySelector('#welcomeModal');
const closeWelcomeButton = document.querySelector('#closeWelcome');
const enterFarmButton = document.querySelector('#enterFarm');

function closeWelcomeModal() {
  welcomeModal.classList.remove('open');
  welcomeModal.setAttribute('aria-hidden', 'true');
}

// Show automatically when entering the website
function openWelcomeModal() {
  welcomeModal.classList.add('open');
  welcomeModal.setAttribute('aria-hidden', 'false');
}

closeWelcomeButton.addEventListener('click', closeWelcomeModal);
enterFarmButton.addEventListener('click', closeWelcomeModal);

// Close when clicking outside the card
welcomeModal.querySelector('.welcome-backdrop')
  .addEventListener('click', closeWelcomeModal);

// Show welcome popup on page entry
openWelcomeModal();

dismissCaughtModalButton.addEventListener('click', closeCaughtModal);
caughtModal.addEventListener('click', (event) => {
  if (event.target.matches('[data-close-caught]')) closeCaughtModal();
});
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && caughtModal.classList.contains('open')) {
    closeCaughtModal();
  }
});

function activeSheep() {
  return sheep.filter((item) => item.active);
}

function updateStats() {
  remainingCount.textContent = String(activeSheep().length);
  caughtCount.textContent = String(caughtNumber);
  roundCount.textContent = String(roundNumber);
}

function removeAllSheep() {
  for (const item of sheep) {
    if (item.group.parent) item.group.parent.remove(item.group);
    item.label.remove();
  }
  sheep = [];
}

function parseNames(raw) {
  const result = [];
  const seen = new Set();
  for (const part of raw.split(/[\n,;]+/)) {
    const name = part.trim().replace(/\s+/g, ' ');
    const key = name.toLocaleLowerCase('vi-VN');
    if (name && !seen.has(key)) {
      seen.add(key);
      result.push(name.slice(0, 28));
    }
  }
  return result;
}

function arrangeSheep(names) {
  const columns = Math.min(7, Math.ceil(Math.sqrt(names.length * 1.55)));
  const rows = Math.ceil(names.length / columns);
  const spacingX = Math.min(1.75, 11.4 / Math.max(1, columns - 1));
  const spacingZ = Math.min(1.65, 7.0 / Math.max(1, rows - 1));
  const startZ = -((rows - 1) * spacingZ) / 2;

  names.forEach((name, index) => {
    const row = Math.floor(index / columns);
    const inThisRow = Math.min(columns, names.length - row * columns);
    const col = index - row * columns;
    const x = (col - (inThisRow - 1) / 2) * spacingX;
    const z = startZ + row * spacingZ;
    sheep.push(createSheep(name, index, x, z));
  });
}

function createFlock() {
  if (wolfMoving) return;
  const names = parseNames(nameInput.value);
  if (names.length === 0) {
    setStatus('Chưa có người chơi', 'Hãy nhập ít nhất một cái tên trước nhé.', '✍️');
    nameInput.focus();
    return;
  }
  if (names.length > 40) {
    setStatus('Danh sách hơi đông!', 'Phiên bản này hỗ trợ tối đa 40 người chơi để đàn cừu không bị quá chật.', '⚠️');
    return;
  }

  removeAllSheep();
  closeCaughtModal();
  roundNumber = 0;
  caughtNumber = 0;
  targetSheep = null;
  carriedSheep = null;
  wolfMoving = false;
  wolfState = 'waitingAtGate';
  approachRoute = [];
  routeStage = 0;
  chaseElapsed = 0;
  gate.rotation.y = 0;
  wolfRig.group.position.copy(wolfHome);
  wolfRig.group.position.y = 0;
  wolfRig.group.rotation.y = Math.PI;
  arrangeSheep(names);
  updateStats();

  releaseButton.disabled = false;
  resetButton.disabled = false;
  if (names.length === 1) {
    releaseButton.disabled = true;
    setStatus('Đã tìm ra người chiến thắng!', `${names[0]} là chú cừu duy nhất trong nông trại.`, '🏆');
  } else {
    setStatus('Sói đang ngồi chờ ở cổng', `Đã tạo ${names.length} chú cừu. Nhấn “Thả sói” để sói chạy vào nông trại.`, '🐺');
  }
}

function releaseWolf() {
  if (wolfMoving || wolfState !== 'waitingAtGate') return;
  const candidates = activeSheep();
  if (candidates.length <= 1) {
    finishIfWinner();
    return;
  }

  // Choose one living player randomly before the wolf starts its run.
  targetSheep = candidates[Math.floor(Math.random() * candidates.length)];

  // The wolf is already waiting at the entrance, so it runs straight through the gate.
  approachRoute = [
    new THREE.Vector3(0, 0, farmFenceRadius - 1.5)
  ];
  routeStage = 0;

  wolfMoving = true;
  wolfState = 'approachGate';
  chaseElapsed = 0;
  roundNumber += 1;
  gate.rotation.y = -Math.PI / 2;

  updateStats();
  releaseButton.disabled = true;
  createButton.disabled = true;
  setStatus(
    'Sói đã được thả!',
    'Sói đang chạy vào nông trại.',
    '🐺'
  );
}

function finishIfWinner() {
  const survivors = activeSheep();
  if (survivors.length === 1) {
    const winner = survivors[0].name;
    releaseButton.disabled = true;
    createButton.disabled = false;
    setStatus('Nông trại đã tìm ra quán quân!', `${winner} là chú cừu cuối cùng còn trụ lại.`, '🏆');
    return true;
  }
  return false;
}

function catchTarget() {
  if (!targetSheep || !targetSheep.active) return;

  const caught = targetSheep;
  caught.active = false;
  caught.captured = true;
  caught.isCarried = true;
  caught.label.style.display = 'none';
  caughtNumber += 1;

  // Attach the captured sheep to the wolf so it travels outside with it.
  wolfRig.group.attach(caught.group);
  caught.group.position.set(0, 0.18, 1.32);
  caught.group.rotation.set(0, 0, 0);
  caught.group.scale.setScalar(0.38);

  carriedSheep = caught;
  targetSheep = null;
  wolfState = 'carryToPen';
  routeStage = 0;
  updateStats();

  const remaining = activeSheep().length;
  setStatus(
    'Sói đã cắn được một chú cừu!',
    `Sói đang đưa cừu ra lồng. Còn ${remaining} người chơi trong nông trại.`,
    '🐺'
  );
  openCaughtModal(caught.name);
}

function dropCarriedSheep() {
  if (!carriedSheep) return;

  const delivered = carriedSheep;
  scene.attach(delivered.group);

  // Arrange captured sheep in rows inside the outdoor holding cage.
  const slotIndex = caughtNumber - 1;
  const columns = 6;
  const col = slotIndex % columns;
  const row = Math.floor(slotIndex / columns);

  delivered.group.position.set(
    13.55 + col * 0.94,
    0,
    -3.25 + row * 0.98
  );
  delivered.group.rotation.set(0, Math.PI / 2, 0);
  delivered.group.scale.setScalar(0.42);
  delivered.captured = true;
  delivered.isCarried = false;
  delivered.label.style.display = 'block';

  carriedSheep = null;
  wolfState = 'returnToGate';
  routeStage = 0;
  setStatus(
    'Đã đưa cừu vào lồng!',
    `${delivered.name} đã được đưa vào lồng bên ngoài. Sói đang quay lại tuần tra.`,
    '🐑'
  );
}

function resetGame() {
  if (wolfMoving) return;
  createFlock();
}

createButton.addEventListener('click', createFlock);
releaseButton.addEventListener('click', releaseWolf);
resetButton.addEventListener('click', resetGame);

// Soft click sound on game buttons and popup close controls.
document.querySelectorAll('.button, .caught-close, .caught-dismiss').forEach((button) => {
  button.addEventListener('click', playButtonSound);
});

const audioToggleButton = document.querySelector('#audioToggle');
if (audioToggleButton) {
  audioToggleButton.addEventListener('click', () => {
    audioEnabled = !audioEnabled;
    updateAudioToggle();

    if (!audioEnabled) {
      backgroundMusic?.pause();
      if (sheepBleatTimer !== null) {
        window.clearTimeout(sheepBleatTimer);
        sheepBleatTimer = null;
      }
    } else {
      startFarmAudio();
      playButtonSound();
    }
  });
  updateAudioToggle();
}

// A small initial sample makes it obvious how to test the game.
nameInput.value = 'An\nBình\nChi\nDũng\nHương\nMinh\nPhúc\nTrang';
createFlock();

// -----------------------------------------------------------------------------
// Animation loop: update wolf pursuit, character motion and name labels
// -----------------------------------------------------------------------------
const projected = new THREE.Vector3();

function moveWolfToward(destination, speed, dt) {
  const direction = destination.clone().sub(wolfRig.group.position);
  direction.y = 0;
  const distance = direction.length();

  if (distance < 0.22) return true;

  direction.normalize();
  wolfRig.group.rotation.y = Math.atan2(direction.x, direction.z);
  wolfRig.group.position.addScaledVector(
    direction,
    Math.min(speed * dt, distance)
  );
  return false;
}

function updateWolf(dt, elapsed) {
  if (wolfState === 'waitingAtGate') {
    // Stay seated beside the entrance; movement starts only after the button is pressed.
    wolfRig.group.position.copy(wolfHome);
    wolfRig.group.position.y = 0;
    wolfRig.group.rotation.y = Math.PI;
  }

  else if (wolfState === 'approachGate') {
    const destination = approachRoute[routeStage];
    if (destination && moveWolfToward(destination, wolfSpeed, dt)) {
      routeStage += 1;
      if (routeStage >= approachRoute.length) {
        wolfState = 'chase';
        chaseElapsed = 0;
        setStatus(
          'Sói đã vào nông trại',
          'Cuộc săn đang diễn ra trong khu vực đồng cỏ.',
          '🐺'
        );
      }
    }
  }

  else if (wolfState === 'chase' && targetSheep?.active) {
    chaseElapsed += dt;
    const wolfPosition = wolfRig.group.position;
    const sheepPosition = targetSheep.group.position;

    const direction = new THREE.Vector3(
      sheepPosition.x - wolfPosition.x,
      0,
      sheepPosition.z - wolfPosition.z
    );
    const distance = direction.length();

    if (distance > 0.0001) {
      direction.normalize();
      wolfRig.group.rotation.y = Math.atan2(direction.x, direction.z);

      // The selected sheep flees, while the wolf follows its updated position.
      const flee = direction.clone().negate();
      sheepPosition.addScaledVector(flee, escapeSpeed * dt);
      const fleeRadius = Math.hypot(sheepPosition.x, sheepPosition.z);
      if (fleeRadius > sheepRoamRadius) {
        const clampScale = sheepRoamRadius / fleeRadius;
        sheepPosition.x *= clampScale;
        sheepPosition.z *= clampScale;
      }

      const nextDirection = new THREE.Vector3(
        sheepPosition.x - wolfPosition.x,
        0,
        sheepPosition.z - wolfPosition.z
      );
      const nextDistance = nextDirection.length();
      if (nextDistance > 0.0001) {
        nextDirection.normalize();
        wolfPosition.addScaledVector(nextDirection, wolfSpeed * dt);
      }

      targetSheep.group.position.y = Math.abs(Math.sin(elapsed * 13)) * 0.08;
      targetSheep.group.rotation.y = Math.atan2(flee.x, flee.z);
      if (!targetSheep.mixer) {
        targetSheep.legs.forEach((leg, i) => {
          leg.rotation.x = Math.sin(elapsed * 23 + i * Math.PI) * 0.72;
        });
      }

      if (nextDistance < 1.18 || chaseElapsed > 14) {
        catchTarget();
      }
    }
  }

  else if (wolfState === 'carryToPen' && carriedSheep) {
    const destination = carryRoute[routeStage];
    if (destination && moveWolfToward(destination, carrySpeed, dt)) {
      routeStage += 1;
      if (routeStage >= carryRoute.length) {
        dropCarriedSheep();
      }
    }
  }

  else if (wolfState === 'returnToGate') {
    const destination = returnRoute[routeStage];
    if (destination && moveWolfToward(destination, wolfSpeed, dt)) {
      routeStage += 1;
      if (routeStage >= returnRoute.length) {
        wolfState = 'waitingAtGate';
        wolfMoving = false;
        routeStage = 0;
        wolfRig.group.position.copy(wolfHome);
        wolfRig.group.rotation.y = Math.PI;
        gate.rotation.y = 0;

        if (!finishIfWinner()) {
          createButton.disabled = false;
          releaseButton.disabled = activeSheep().length <= 1;
          setStatus(
            'Sói đang ngồi chờ ở cổng',
            'Nhấn “Thả sói” để bắt đầu lượt săn tiếp theo.',
            '🐺'
          );
        }
      }
    }
  }

  // Sit/idle at the gate. Move with walk/run clips only after release.
  const waiting = wolfState === 'waitingAtGate';
  const travelling = wolfState === 'approachGate' || wolfState === 'returnToGate';
  const animationMode = waiting ? 'sit' : (travelling ? 'walk' : 'run');
  const gaitSpeed = waiting ? 2.2 : (travelling ? 12 : 23);
  const gaitAmount = travelling ? 0.52 : 0.92;

  if (wolfRig.mixer) {
    updateRigAnimation(wolfRig, animationMode, dt);
    wolfRig.group.position.y = waiting ? 0 : Math.abs(Math.sin(elapsed * gaitSpeed)) * (travelling ? 0.012 : 0.02);
  } else {
    wolfRig.group.position.y = waiting ? 0 : Math.abs(Math.sin(elapsed * gaitSpeed)) * (travelling ? 0.025 : 0.075);
    wolfRig.legs.forEach((leg, i) => {
      if (waiting) {
        // Simple seated pose for the built-in placeholder wolf: fold the rear legs.
        leg.rotation.x = leg.userData.sideZ < 0 ? -0.9 : 0.04;
      } else {
        leg.rotation.x = Math.sin(elapsed * gaitSpeed + i * Math.PI) * gaitAmount;
      }
    });
    if (wolfRig.tail) {
      wolfRig.tail.rotation.x = Math.sin(elapsed * (waiting ? 2.2 : 8)) * (waiting ? 0.08 : 0.2);
    }
  }
}

function updateSheep(dt, elapsed) {
  const randomFarmPoint = () => {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.sqrt(Math.random()) * sheepRoamRadius;
    return new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
  };

  for (const item of sheep) {
    if (item.isFading) {
      item.fadeTime += dt;
      const scale = Math.max(0.001, 1 - item.fadeTime / 0.42);
      item.group.scale.setScalar(scale);
      if (item.fadeTime >= 0.42) {
        scene.remove(item.group);
        item.label.remove();
        item.isFading = false;
      }
      continue;
    }

    if (item.isCarried || item.captured) {
      if (item.mixer) updateRigAnimation(item, 'idle', dt);
      continue;
    }
    if (!item.active) continue;
    if (item === targetSheep) {
      if (item.mixer) updateRigAnimation(item, 'run', dt);
      continue;
    }

    const position = item.group.position;
    item.wanderTimer -= dt;

    // Pick a new random destination every few seconds, or when the sheep
    // reaches its current destination.
    const toDestination = new THREE.Vector3(
      item.wanderTarget.x - position.x,
      0,
      item.wanderTarget.z - position.z
    );

    if (item.wanderTimer <= 0 || toDestination.length() < 0.5) {
      item.wanderTarget.copy(randomFarmPoint());
      item.wanderTimer = 2.2 + Math.random() * 3.5;
      item.wanderSpeed = 0.48 + Math.random() * 0.48;
    }

    const direction = new THREE.Vector3(
      item.wanderTarget.x - position.x,
      0,
      item.wanderTarget.z - position.z
    );
    const destinationDistance = direction.length();

    if (destinationDistance > 0.08) {
      direction.normalize();

      // Keep a little space between neighboring sheep so they do not all
      // pile up at the same point while wandering around the paddock.
      const separation = new THREE.Vector3();
      for (const other of sheep) {
        if (other === item || !other.active || other.isFading) continue;
        const dx = position.x - other.group.position.x;
        const dz = position.z - other.group.position.z;
        const distanceSq = dx * dx + dz * dz;
        const avoidRadius = 1.12;
        if (distanceSq > 0.0001 && distanceSq < avoidRadius * avoidRadius) {
          const distance = Math.sqrt(distanceSq);
          const strength = (avoidRadius - distance) / avoidRadius;
          separation.x += (dx / distance) * strength;
          separation.z += (dz / distance) * strength;
        }
      }

      if (separation.lengthSq() > 0.0001) {
        direction.addScaledVector(separation.normalize(), 0.85).normalize();
      }

      const desiredRotation = Math.atan2(direction.x, direction.z);
      let rotationDelta = desiredRotation - item.group.rotation.y;
      rotationDelta = Math.atan2(Math.sin(rotationDelta), Math.cos(rotationDelta));
      item.group.rotation.y += rotationDelta * Math.min(1, dt * 4.5);

      const step = Math.min(item.wanderSpeed * dt, destinationDistance);
      position.x += direction.x * step;
      position.z += direction.z * step;
      const currentRadius = Math.hypot(position.x, position.z);
      if (currentRadius > sheepRoamRadius) {
        const boundaryScale = sheepRoamRadius / currentRadius;
        position.x *= boundaryScale;
        position.z *= boundaryScale;
      }
      item.walking = true;
    } else {
      item.walking = false;
    }

    // Prefer real GLB clips; use procedural leg movement only for the fallback model.
    if (item.mixer) {
      updateRigAnimation(item, item.walking ? 'walk' : 'idle', dt);
      item.group.position.y = Math.sin(elapsed * 2 + item.seed) * 0.008;
    } else {
      const walkAmount = item.walking ? 1 : 0.12;
      const gait = elapsed * (item.walking ? 9.5 : 2.1) + item.seed;
      item.group.position.y = Math.abs(Math.sin(gait)) * (item.walking ? 0.045 : 0.012);
      item.group.rotation.z = Math.sin(gait * 0.55) * (item.walking ? 0.035 : 0.012);
      item.legs.forEach((leg, i) => {
        leg.rotation.x = Math.sin(gait + i * Math.PI) * (item.walking ? 0.38 : 0.025) * walkAmount;
      });
    }
  }
}

function updateLabels() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  for (const item of sheep) {
    if ((!item.active && !item.captured) || item.isFading || item.isCarried) continue;
    projected.set(
      item.group.position.x,
      item.group.position.y + 1.92 * item.group.scale.y,
      item.group.position.z
    );
    projected.project(camera);
    const x = (projected.x * 0.5 + 0.5) * width;
    const y = (-projected.y * 0.5 + 0.5) * height;
    const visible = projected.z < 1 && x > -40 && x < width + 40 && y > -40 && y < height + 40;
    item.label.style.display = visible ? 'block' : 'none';
    if (visible) {
      item.label.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
    }
  }
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.04);
  const elapsed = clock.elapsedTime;
  updateWolf(dt, elapsed);
  updateSheep(dt, elapsed);
  controls.update();
  updateLabels();
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
});
