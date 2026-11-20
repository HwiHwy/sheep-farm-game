import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import './style.css';

// ============================================================================
// CLAW MACHINE V12 — participant names become colorful plush toys.
// The crane automatically moves to one random remaining toy per turn.
// ============================================================================

const ASSET = (path) => `${import.meta.env.BASE_URL}${String(path).replace(/^\/+/, '')}`;
const resolveAssetUrl = (path) => {
  const value = String(path ?? '').trim();
  if (!value) return '';
  if (/^(https?:|data:|blob:)/i.test(value)) return value;
  if (value.startsWith(import.meta.env.BASE_URL)) return value;
  return ASSET(value);
};
const world = document.querySelector('#game-world');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd9edf5);
scene.fog = new THREE.Fog(0xd9edf5, 34, 75);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 120);
camera.position.set(13, 11.5, 17);
camera.lookAt(0, 3.4, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
world.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 3.6, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.enablePan = false;
controls.minDistance = 9;
controls.maxDistance = 30;
controls.minPolarAngle = 0.24;
controls.maxPolarAngle = Math.PI / 2.04;
controls.update();

const hemi = new THREE.HemisphereLight(0xf8fcff, 0x8c789b, 1.9);
scene.add(hemi);
const keyLight = new THREE.DirectionalLight(0xfff0d9, 2.7);
keyLight.position.set(-8, 17, 11);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -18;
keyLight.shadow.camera.right = 18;
keyLight.shadow.camera.top = 18;
keyLight.shadow.camera.bottom = -18;
scene.add(keyLight);
const pinkLight = new THREE.PointLight(0xff91bf, 24, 24);
pinkLight.position.set(-6, 6, 5);
scene.add(pinkLight);
const cyanLight = new THREE.PointLight(0x75d9ff, 22, 22);
cyanLight.position.set(7, 6, -5);
scene.add(cyanLight);

const clock = new THREE.Clock();
const shared = {};
const MAT = (color, roughness = 0.65, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });

function addBox(parent, size, position, mat, cast = true, receive = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  mesh.position.set(...position);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  parent.add(mesh);
  return mesh;
}
function addSphere(parent, radius, position, scale, mat, segments = 20) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, segments, Math.max(10, segments - 2)), mat);
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function addCylinderBetween(parent, a, b, radius, mat, radialSegments = 10) {
  const direction = new THREE.Vector3().subVectors(b, a);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), radialSegments), mat);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}
function makeLabelTexture(text, background = '#6d5b91') {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 220;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#fff2cf';
  ctx.lineWidth = 12;
  ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
  ctx.fillStyle = '#fffaf1';
  ctx.font = '900 88px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 4, 700);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// ----------------------------------------------------------------------------
// AUDIO CONFIG — keep your existing public/audio files, or leave URLs empty.
// ----------------------------------------------------------------------------
const AUDIO_CONFIG = {
  backgroundMusicUrl: ASSET('audio/farm-background.mp3'),
  backgroundMusicVolume: 0.18,
  buttonClickUrl: ASSET('audio/button-click.mp3'),
  buttonClickVolume: 0.3,
  popupSoundUrl: ASSET('audio/popup-chime.mp3'),
  popupSoundVolume: 0.5,
  plushWinUrl: '', // Optional: '/audio/plush-win.mp3'
  plushWinVolume: 0.45
};
let audioEnabled = true;
let audioUnlocked = false;
let audioContext = null;
let music = null;
if (AUDIO_CONFIG.backgroundMusicUrl) {
  music = new Audio(AUDIO_CONFIG.backgroundMusicUrl);
  music.loop = true;
  music.volume = AUDIO_CONFIG.backgroundMusicVolume;
  music.preload = 'auto';
}
function getAudioContext() {
  if (audioContext) return audioContext;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  audioContext = new AudioContextClass();
  return audioContext;
}
function tone(frequency, duration = 0.07, peak = 0.035, type = 'triangle') {
  if (!audioEnabled) return;
  const context = getAudioContext();
  if (!context) return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const start = context.currentTime;
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}
function playFile(url, volume = 0.4) {
  if (!audioEnabled || !url) return;
  const audio = new Audio(resolveAssetUrl(url));
  audio.volume = THREE.MathUtils.clamp(volume, 0, 1);
  audio.play().catch(() => {});
}
function playClick() {
  if (AUDIO_CONFIG.buttonClickUrl) playFile(AUDIO_CONFIG.buttonClickUrl, AUDIO_CONFIG.buttonClickVolume);
  else tone(680, 0.06, 0.03);
}
function playPopup() {
  if (AUDIO_CONFIG.popupSoundUrl) playFile(AUDIO_CONFIG.popupSoundUrl, AUDIO_CONFIG.popupSoundVolume);
  else {
    tone(587, 0.16, 0.05, 'sine');
    window.setTimeout(() => tone(784, 0.22, 0.045, 'sine'), 110);
  }
}
function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  const context = getAudioContext();
  if (context?.state === 'suspended') context.resume().catch(() => {});
  if (music?.paused) music.play().catch(() => {});
}
document.addEventListener('pointerdown', unlockAudio, { once: true });
document.addEventListener('keydown', unlockAudio, { once: true });

// ----------------------------------------------------------------------------
// Machine environment — transparent cabinet, prize tray, gantry and claw.
// ----------------------------------------------------------------------------
const floorMat = MAT(0xe8edf4, 0.92);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), floorMat);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.08;
floor.receiveShadow = true;
scene.add(floor);

// Pastel arcade floor tiles.
const tileMatA = MAT(0xf5f0f5, 0.9);
const tileMatB = MAT(0xdfeaf3, 0.9);
for (let x = -5; x <= 5; x += 1) {
  for (let z = -5; z <= 5; z += 1) {
    const tile = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.035, 1.95), (x + z) % 2 === 0 ? tileMatA : tileMatB);
    tile.position.set(x * 2, -0.025, z * 2);
    tile.receiveShadow = true;
    scene.add(tile);
  }
}

const machine = new THREE.Group();
scene.add(machine);
const bodyPurple = MAT(0x7663ad, 0.34, { metalness: 0.22 });
const bodyPink = MAT(0xe995b9, 0.42, { metalness: 0.12 });
const trimGold = MAT(0xf4cf83, 0.34, { metalness: 0.45 });
const darkMetal = MAT(0x59627f, 0.3, { metalness: 0.7 });
const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xc9efff, roughness: 0.08, metalness: 0.08, transmission: 0.15, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false });
const innerFloorMat = MAT(0xe9dff2, 0.72);

// Heavy lower cabinet and inner plush platform.
addBox(machine, [11.4, 1.48, 8.8], [0, 0.72, 0], bodyPurple);
addBox(machine, [10.55, 0.16, 7.85], [0, 1.50, 0], trimGold);
addBox(machine, [10.25, 0.10, 7.55], [0, 1.62, 0], innerFloorMat);
addBox(machine, [11.5, 0.18, 8.9], [0, 1.48, 0], bodyPink, false);

// Rounded-looking corner posts and cabinet frame.
const postPositions = [];
for (const x of [-5.25, 5.25]) for (const z of [-3.95, 3.95]) postPositions.push([x, z]);
for (const [x, z] of postPositions) {
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 6.25, 16), trimGold);
  post.position.set(x, 4.72, z);
  post.castShadow = true;
  machine.add(post);
}
for (const y of [1.72, 7.8]) {
  addBox(machine, [10.65, 0.18, 0.18], [0, y, -3.95], trimGold);
  addBox(machine, [10.65, 0.18, 0.18], [0, y, 3.95], trimGold);
  addBox(machine, [0.18, 0.18, 7.9], [-5.25, y, 0], trimGold);
  addBox(machine, [0.18, 0.18, 7.9], [5.25, y, 0], trimGold);
}

// Transparent glass panels. The front panel is split so the prize outlet remains visible.
const sideGlassL = new THREE.Mesh(new THREE.BoxGeometry(0.045, 6.05, 7.75), glassMat);
sideGlassL.position.set(-5.22, 4.72, 0); machine.add(sideGlassL);
const sideGlassR = new THREE.Mesh(new THREE.BoxGeometry(0.045, 6.05, 7.75), glassMat);
sideGlassR.position.set(5.22, 4.72, 0); machine.add(sideGlassR);
const backGlass = new THREE.Mesh(new THREE.BoxGeometry(10.4, 6.05, 0.045), glassMat);
backGlass.position.set(0, 4.72, -3.92); machine.add(backGlass);
const frontGlassLeft = new THREE.Mesh(new THREE.BoxGeometry(7.15, 6.05, 0.045), glassMat);
frontGlassLeft.position.set(-1.62, 4.72, 3.92); machine.add(frontGlassLeft);
const frontGlassRightTop = new THREE.Mesh(new THREE.BoxGeometry(2.95, 4.9, 0.045), glassMat);
frontGlassRightTop.position.set(3.78, 5.28, 3.92); machine.add(frontGlassRightTop);
const frontGlassRightBottom = new THREE.Mesh(new THREE.BoxGeometry(2.95, 0.65, 0.045), glassMat);
frontGlassRightBottom.position.set(3.78, 1.99, 3.92); machine.add(frontGlassRightBottom);

// Top sign and illuminated trim.
addBox(machine, [11.65, 0.72, 9.0], [0, 8.18, 0], bodyPink);
addBox(machine, [10.8, 0.12, 8.15], [0, 7.78, 0], trimGold);
const signTexture = makeLabelTexture('CLAW MACHINE', '#6f5eaa');
const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.25), new THREE.MeshBasicMaterial({ map: signTexture }));
sign.position.set(0, 8.2, 4.53);
machine.add(sign);

// Side decorative light strips.
for (const x of [-5.36, 5.36]) {
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 5.5, 0.08), new THREE.MeshStandardMaterial({ color: 0xffc1df, emissive: 0xff79bd, emissiveIntensity: 1.1 }));
  strip.position.set(x, 4.75, 0);
  machine.add(strip);
}

// Front control console, button cluster and coin slot.
addBox(machine, [11.35, 0.92, 1.35], [0, 0.52, 5.0], bodyPurple);
addBox(machine, [3.2, 0.08, 0.55], [0, 1.02, 5.0], darkMetal);
for (const [x, color] of [[-0.95, 0x73d6ec], [0, 0xffd26f], [0.95, 0xff8fbd]]) {
  const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.14, 24), MAT(color, 0.25, { emissive: color, emissiveIntensity: 0.16 }));
  btn.position.set(x, 1.16, 5.0);
  btn.castShadow = true;
  machine.add(btn);
}
addBox(machine, [0.9, 0.22, 0.1], [-3.9, 0.78, 5.67], darkMetal);
addBox(machine, [0.08, 0.08, 0.12], [-3.9, 0.78, 5.73], trimGold);

// Prize chute and collection tray outside the front-right glass opening.
const prizeTray = new THREE.Group();
addBox(prizeTray, [3.05, 0.18, 3.0], [0, 0, 0], bodyPink);
addBox(prizeTray, [3.05, 0.10, 0.12], [0, 0.30, -1.44], trimGold);
addBox(prizeTray, [0.12, 0.34, 3.0], [-1.47, 0.17, 0], trimGold);
addBox(prizeTray, [0.12, 0.34, 3.0], [1.47, 0.17, 0], trimGold);
addBox(prizeTray, [3.05, 0.25, 0.12], [0, 0.13, 1.44], trimGold);
prizeTray.position.set(3.65, 1.58, 4.95);
machine.add(prizeTray);

// Overhead gantry rails.
const railMat = MAT(0x65708d, 0.28, { metalness: 0.65 });
addBox(machine, [9.7, 0.16, 0.16], [0, 7.48, -3.0], railMat);
addBox(machine, [9.7, 0.16, 0.16], [0, 7.48, 3.0], railMat);
addBox(machine, [0.16, 0.16, 6.2], [-4.7, 7.48, 0], railMat);
addBox(machine, [0.16, 0.16, 6.2], [4.7, 7.48, 0], railMat);

// Crane trolley and its cable/claw rig.
const trolley = new THREE.Group();
trolley.position.set(0, 7.32, 0);
scene.add(trolley);
addBox(trolley, [1.3, 0.42, 1.15], [0, 0, 0], darkMetal);
addBox(trolley, [0.95, 0.16, 0.82], [0, -0.28, 0], trimGold);
for (const x of [-0.43, 0.43]) {
  for (const z of [-0.35, 0.35]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.16, 16), MAT(0x414b65, 0.3, { metalness: 0.7 }));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.18, z);
    trolley.add(wheel);
  }
}
const ropeMat = MAT(0x626d84, 0.35, { metalness: 0.55 });
const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1, 12), ropeMat);
trolley.add(rope);
const clawGroup = new THREE.Group();
trolley.add(clawGroup);
const clawHub = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 14), trimGold);
clawHub.castShadow = true;
clawGroup.add(clawHub);
const clawArms = [];
for (const sx of [-1, 1]) {
  for (const sz of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.15, -0.08, sz * 0.15);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 0.86, 12), darkMetal);
    arm.position.set(sx * 0.18, -0.36, sz * 0.18);
    arm.rotation.x = sz * 0.34;
    arm.rotation.z = -sx * 0.34;
    arm.castShadow = true;
    pivot.add(arm);
    const rubberTip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), MAT(0x5f6a80));
    rubberTip.position.set(sx * 0.34, -0.76, sz * 0.34);
    pivot.add(rubberTip);
    clawGroup.add(pivot);
    clawArms.push({ pivot, sx, sz });
  }
}

let ropeLength = 0.95;
let clawOpen = 0.82;
function updateClawRig() {
  rope.scale.y = ropeLength;
  rope.position.y = -ropeLength / 2 - 0.08;
  clawGroup.position.set(0, -ropeLength - 0.16, 0);
  for (const arm of clawArms) {
    const angle = 0.08 + clawOpen * 0.42;
    arm.pivot.rotation.x = arm.sz * angle;
    arm.pivot.rotation.z = -arm.sx * angle;
  }
}
updateClawRig();

// Small arcade decorations around the machine.
function makeBalloon(x, y, z, color) {
  const group = new THREE.Group();
  const balloon = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 18), MAT(color, 0.28, { metalness: 0.05 }));
  balloon.scale.set(0.82, 1.12, 0.82);
  balloon.castShadow = true;
  group.add(balloon);
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.0, 6), MAT(0xb7a8ba));
  string.position.y = -0.8;
  group.add(string);
  group.position.set(x, y, z);
  scene.add(group);
}
makeBalloon(-8, 3.3, -2, 0xf59dc1);
makeBalloon(-8.7, 2.8, -1.2, 0x8ed7ec);
makeBalloon(8.2, 3.3, -1.8, 0xf6cb74);
makeBalloon(8.9, 2.8, -1.2, 0xb99ae9);

// ----------------------------------------------------------------------------
// Optional sheep GLB model. If not found, create a soft toy-like sheep locally.
// ----------------------------------------------------------------------------
const MODEL_URLS = [ASSET('models/sheep22.glb'), ASSET('models/sheep.glb')];
const gltfLoader = new GLTFLoader();
let plushGLTF = null;
for (const url of MODEL_URLS) {
  try {
    plushGLTF = await gltfLoader.loadAsync(url);
    console.info('[Claw Machine] Loaded plush model:', url);
    break;
  } catch {
    // Continue to the next candidate; the procedural plush remains available.
  }
}

const plushPalette = [
  0xff4f81, 0xff8a3d, 0xffcc42, 0x8bd448, 0x24c9a6, 0x36b8ed,
  0x4778f5, 0x8b63ee, 0xc45ce8, 0xf05cb8, 0xff758f, 0x6bced1,
  0xc3df55, 0xf0a7dd, 0x92a4ff, 0x8d6b52, 0xffffff, 0x42445e,
  0xffd0a6, 0x8ed5a5, 0xa8d8ff, 0xff9a66, 0xc9a0ff, 0x96b5aa
];

function makeProceduralPlush(color) {
  const group = new THREE.Group();
  const coat = MAT(color, 0.92);
  const face = MAT(0xf1d7c9, 0.88);
  const dark = MAT(0x4b4052, 0.65);
  const eye = MAT(0x282633, 0.35);
  // Soft oval body.
  addSphere(group, 0.48, [0, 0.52, 0], [0.95, 0.88, 1.12], coat, 24);
  const tufts = [
    [-0.32,0.78,0.22],[0.32,0.78,0.22],[-0.34,0.58,-0.45],
    [0.34,0.58,-0.45],[0,0.92,-0.36],[0,0.98,0.22],
    [-0.4,0.46,0],[0.4,0.46,0],[0,0.43,-0.62]
  ];
  for (const p of tufts) addSphere(group, 0.22, p, [1,1,1], coat, 16);
  addSphere(group, 0.28, [0,0.66,0.58], [0.9,1.0,0.9], face, 20);
  addSphere(group, 0.18, [0,0.52,0.82], [1.0,0.75,0.65], face, 16);
  addSphere(group, 0.045, [0,0.56,1.0], [1,0.8,0.8], dark, 12);
  for (const side of [-1,1]) {
    const ear = addSphere(group,0.13,[side*0.29,0.78,0.55],[1.5,0.48,0.72],face,12);
    ear.rotation.z = side * -0.25;
    addSphere(group,0.035,[side*0.115,0.73,0.79],[1,1,0.55],eye,10);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.055,0.065,0.35,10),dark);
    leg.position.set(side*0.27,0.18,0.30); leg.castShadow=true; group.add(leg);
    const leg2 = leg.clone(); leg2.position.z=-0.38; group.add(leg2);
  }
  return group;
}

function buildPlushVisual(color) {
  if (!plushGLTF) return { visual: makeProceduralPlush(color), mixer: null };
  const visual = SkeletonUtils.clone(plushGLTF.scene);
  visual.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.castShadow = true;
    obj.receiveShadow = true;
    obj.frustumCulled = false;
    const tint = (source) => {
      const cloned = source.clone();
      if (cloned.color) {
        const name = `${obj.name} ${source.name}`.toLowerCase();
        if (!/face|muzzle|eye|nose|hoof|mouth|skin|inner|tooth/i.test(name)) {
          cloned.color.set(color);
        }
      }
      return cloned;
    };
    obj.material = Array.isArray(obj.material) ? obj.material.map(tint) : tint(obj.material);
  });
  visual.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(visual);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = 1.12 / Math.max(size.y, 0.001);
  visual.scale.multiplyScalar(scale);
  visual.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
  visual.updateMatrixWorld(true);
  const clips = plushGLTF.animations ?? [];
  const mixer = clips.length ? new THREE.AnimationMixer(visual) : null;
  if (mixer) mixer.clipAction(clips.find((c) => /idle|stand|rest/i.test(c.name)) ?? clips[0]).play();
  return { visual, mixer };
}

// ----------------------------------------------------------------------------
// Player plushies and labels.
// ----------------------------------------------------------------------------
const CABINET_FLOOR_Y = 1.68;
const MAX_PLAYERS = 24;
const plushies = [];
const collectedPlushies = [];
const labelProjection = new THREE.Vector3();

function createPlush(name, index, x, z) {
  const root = new THREE.Group();
  const color = plushPalette[Math.floor(Math.random() * plushPalette.length)];
  const { visual, mixer } = buildPlushVisual(color);
  root.add(visual);
  root.position.set(x, CABINET_FLOOR_Y, z);
  root.rotation.y = (Math.random() - 0.5) * 0.7;
  root.scale.setScalar(0.82 + Math.random() * 0.08);
  scene.add(root);

  const label = document.createElement('div');
  label.className = 'plush-label';
  label.textContent = name;
  document.body.appendChild(label);

  return {
    name, index, color, group: root, visual, mixer, label,
    active: true, collected: false, seed: Math.random() * Math.PI * 2,
    home: new THREE.Vector3(x, CABINET_FLOOR_Y, z)
  };
}

// ----------------------------------------------------------------------------
// Machine movement / crane game state.
// ----------------------------------------------------------------------------
const craneHome = new THREE.Vector3(0, 7.32, 0);
const dropPoint = new THREE.Vector3(4.05, CABINET_FLOOR_Y + 0.6, 2.95);
const dropCraneX = 4.0;
const dropCraneZ = 2.85;
let selectedPlush = null;
let cranePhase = 'idle';
let phaseTimer = 0;
let targetRopeLength = 0.95;
let roundNumber = 0;
let caughtNumber = 0;
let busy = false;
const craneSpeed = 8.2;
const prizeSlots = [];
for (let row = 0; row < 8; row += 1) {
  for (let col = 0; col < 3; col += 1) {
    prizeSlots.push(new THREE.Vector3(2.83 + col * 0.82, 1.78 + Math.floor(row / 4) * 0.06, 3.80 + row * 0.30));
  }
}

// ----------------------------------------------------------------------------
// UI bindings, status, stats, popup and audio toggle.
// ----------------------------------------------------------------------------
const nameInput = document.querySelector('#playerNames');
const createButton = document.querySelector('#createFlock');
const grabButton = document.querySelector('#grabButton');
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
const audioToggle = document.querySelector('#audioToggle');
const controlPanel = document.querySelector('#controlPanel');
const togglePanelButton = document.querySelector('#togglePanel');

function setStatus(title, text, icon = '🧸') {
  statusTitle.textContent = title;
  statusText.textContent = text;
  statusIcon.textContent = icon;
}
function activePlushies() { return plushies.filter((p) => p.active && !p.collected); }
function updateStats() {
  remainingCount.textContent = String(activePlushies().length);
  caughtCount.textContent = String(caughtNumber);
  roundCount.textContent = String(roundNumber);
  grabButton.disabled = busy || activePlushies().length === 0;
}
function openCaughtModal(name) {
  caughtPlayerName.textContent = name;
  caughtModal.classList.add('open');
  caughtModal.setAttribute('aria-hidden', 'false');
  playPopup();
}
function closeCaughtModal() {
  caughtModal.classList.remove('open');
  caughtModal.setAttribute('aria-hidden', 'true');
}
closeCaughtModalButton.addEventListener('click', () => { playClick(); closeCaughtModal(); });
dismissCaughtModalButton.addEventListener('click', () => { playClick(); closeCaughtModal(); });
caughtModal.querySelector('[data-close-caught]').addEventListener('click', closeCaughtModal);
window.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeCaughtModal(); });

// Collapsible player panel.
togglePanelButton.addEventListener('click', () => {
  playClick();
  const collapsed = controlPanel.classList.toggle('collapsed');
  togglePanelButton.textContent = collapsed ? '☰ MỞ BẢNG' : '⌄ ẨN BẢNG';
  togglePanelButton.setAttribute('aria-expanded', String(!collapsed));
});

audioToggle.addEventListener('click', () => {
  audioEnabled = !audioEnabled;
  if (music) {
    if (audioEnabled && audioUnlocked) music.play().catch(() => {});
    else music.pause();
  }
  audioToggle.textContent = audioEnabled ? '🔊 ÂM THANH' : '🔇 TẮT ÂM';
  audioToggle.setAttribute('aria-pressed', String(audioEnabled));
  if (audioEnabled) playClick();
});

function parseNames(raw) {
  const unique = new Set();
  const names = [];
  for (const token of raw.split(/[\n,;]+/)) {
    const name = token.trim().replace(/\s+/g, ' ').slice(0, 28);
    const key = name.toLocaleLowerCase('vi-VN');
    if (name && !unique.has(key)) { unique.add(key); names.push(name); }
  }
  return names;
}
function clearPlushies() {
  for (const p of plushies) {
    scene.remove(p.group);
    p.label.remove();
  }
  for (const p of collectedPlushies) scene.remove(p.group);
  plushies.length = 0;
  collectedPlushies.length = 0;
}
function arrangePlushes(names) {
  const cols = Math.min(6, Math.ceil(Math.sqrt(names.length * 1.45)));
  const rows = Math.ceil(names.length / cols);
  const spacingX = Math.min(1.72, 8.0 / Math.max(1, cols - 1));
  const spacingZ = Math.min(1.48, 5.5 / Math.max(1, rows - 1));
  const startZ = -((rows - 1) * spacingZ) / 2;
  names.forEach((name, index) => {
    const row = Math.floor(index / cols);
    const countInRow = Math.min(cols, names.length - row * cols);
    const col = index - row * cols;
    const x = (col - (countInRow - 1) / 2) * spacingX;
    const z = startZ + row * spacingZ;
    plushies.push(createPlush(name, index, x, z));
  });
}
function resetCrane() {
  selectedPlush = null;
  cranePhase = 'idle';
  phaseTimer = 0;
  busy = false;
  trolley.position.copy(craneHome);
  ropeLength = 0.95;
  clawOpen = 0.82;
  updateClawRig();
}
function createPlushCollection() {
  if (busy) return;
  const names = parseNames(nameInput.value);
  if (names.length === 0) {
    setStatus('Chưa có người chơi', 'Nhập ít nhất một tên để tạo thú bông nhé.', '✍️');
    nameInput.focus();
    return;
  }
  if (names.length > MAX_PLAYERS) {
    setStatus('Danh sách quá đông', `Máy hiện hỗ trợ tối đa ${MAX_PLAYERS} thú bông trong một lượt.`, '⚠️');
    return;
  }
  closeCaughtModal();
  clearPlushies();
  resetCrane();
  caughtNumber = 0;
  roundNumber = 0;
  arrangePlushes(names);
  resetButton.disabled = false;
  updateStats();
  grabButton.disabled = false;
  setStatus('Máy gắp đã sẵn sàng', `Đã xếp ${names.length} thú bông vào máy. Nhấn GẮP THÚ để bắt đầu.`, '🕹️');
}

function moveCraneTo(x, z, speed, dt) {
  const dx = x - trolley.position.x;
  const dz = z - trolley.position.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 0.065) {
    trolley.position.x = x;
    trolley.position.z = z;
    return true;
  }
  trolley.position.x += (dx / distance) * Math.min(speed * dt, distance);
  trolley.position.z += (dz / distance) * Math.min(speed * dt, distance);
  return false;
}
function moveRopeTo(length, speed, dt) {
  const delta = length - ropeLength;
  if (Math.abs(delta) < 0.035) {
    ropeLength = length;
    updateClawRig();
    return true;
  }
  ropeLength += Math.sign(delta) * Math.min(speed * dt, Math.abs(delta));
  updateClawRig();
  return false;
}
function startGrab() {
  if (busy) return;
  const candidates = activePlushies();
  if (!candidates.length) {
    setStatus('Máy đã hết thú bông', 'Nhấn BẮT ĐẦU LẠI để xếp một lượt mới.', '🏆');
    grabButton.disabled = true;
    return;
  }
  playClick();
  selectedPlush = candidates[Math.floor(Math.random() * candidates.length)];
  roundNumber += 1;
  busy = true;
  phaseTimer = 0;
  cranePhase = 'moveToToy';
  targetRopeLength = 0.95;
  clawOpen = 0.82;
  grabButton.disabled = true;
  createButton.disabled = true;
  resetButton.disabled = true;
  updateStats();
  setStatus('Cần gắp đang di chuyển', 'Máy đang chọn vị trí một món thú bông.', '🕹️');
}
function attachSelectedPlush() {
  if (!selectedPlush) return;
  const toy = selectedPlush;
  toy.active = false;
  toy.collected = true;
  toy.label.style.display = 'none';
  clawGroup.attach(toy.group);
  toy.group.position.set(0, -0.48, 0);
  toy.group.rotation.set(0, 0, 0);
  toy.group.scale.setScalar(0.58);
}
function releaseSelectedPlush() {
  if (!selectedPlush) return;
  const toy = selectedPlush;
  scene.attach(toy.group);
  const slot = prizeSlots[caughtNumber % prizeSlots.length] ?? new THREE.Vector3(3.8, 1.78, 5.5);
  toy.group.position.copy(slot);
  toy.group.rotation.set(0, Math.random() * Math.PI * 2, 0);
  toy.group.scale.setScalar(0.52);
  toy.collected = true;
  collectedPlushies.push(toy);
  caughtNumber += 1;
  selectedPlush = null;
  updateStats();
  openCaughtModal(toy.name);
  if (AUDIO_CONFIG.plushWinUrl) playFile(AUDIO_CONFIG.plushWinUrl, AUDIO_CONFIG.plushWinVolume);
  else tone(940, 0.12, 0.045, 'sine');
}

function updateCraneSequence(dt) {
  if (!busy) return;
  phaseTimer += dt;

  if (cranePhase === 'moveToToy') {
    if (!selectedPlush) return;
    const reached = moveCraneTo(selectedPlush.home.x, selectedPlush.home.z, craneSpeed, dt);
    moveRopeTo(0.95, 8, dt);
    if (reached) {
      cranePhase = 'lowerToToy';
      phaseTimer = 0;
      setStatus('Cần gắp đang hạ xuống', 'Móc gắp đang tiến sát thú bông được chọn.', '⬇️');
    }
  }
  else if (cranePhase === 'lowerToToy') {
    if (moveRopeTo(4.88, 5.4, dt)) {
      cranePhase = 'closeClaw';
      phaseTimer = 0;
      setStatus('Đang kẹp thú bông', 'Các càng gắp đang khép lại.', '🤏');
    }
  }
  else if (cranePhase === 'closeClaw') {
    clawOpen = Math.max(0.02, clawOpen - dt * 2.0);
    updateClawRig();
    if (phaseTimer >= 0.48) {
      attachSelectedPlush();
      cranePhase = 'liftToy';
      phaseTimer = 0;
      setStatus('Đã gắp được thú bông', 'Cần gắp đang nâng món đồ lên.', '🎉');
    }
  }
  else if (cranePhase === 'liftToy') {
    if (moveRopeTo(0.95, 5.8, dt)) {
      cranePhase = 'moveToPrize';
      phaseTimer = 0;
    }
  }
  else if (cranePhase === 'moveToPrize') {
    if (moveCraneTo(dropCraneX, dropCraneZ, craneSpeed * 0.85, dt)) {
      cranePhase = 'lowerToPrize';
      phaseTimer = 0;
    }
  }
  else if (cranePhase === 'lowerToPrize') {
    if (moveRopeTo(4.25, 6.5, dt)) {
      cranePhase = 'openClaw';
      phaseTimer = 0;
      setStatus('Đang thả thú vào khay', 'Món thú bông sắp rơi xuống khay nhận thưởng.', '🎁');
    }
  }
  else if (cranePhase === 'openClaw') {
    clawOpen = Math.min(0.82, clawOpen + dt * 2.2);
    updateClawRig();
    if (phaseTimer >= 0.42) {
      releaseSelectedPlush();
      cranePhase = 'liftAfterDrop';
      phaseTimer = 0;
    }
  }
  else if (cranePhase === 'liftAfterDrop') {
    if (moveRopeTo(0.95, 6.0, dt)) {
      cranePhase = 'returnHome';
      phaseTimer = 0;
    }
  }
  else if (cranePhase === 'returnHome') {
    if (moveCraneTo(0, 0, craneSpeed * 0.9, dt)) {
      busy = false;
      cranePhase = 'idle';
      createButton.disabled = false;
      resetButton.disabled = false;
      updateStats();
      const remaining = activePlushies().length;
      if (remaining > 0) {
        setStatus('Máy gắp đã sẵn sàng', `Đã gắp ${caughtNumber} món. Còn ${remaining} thú bông trong máy.`, '🧸');
      } else {
        setStatus('Chúc mừng! Máy đã hết thú', 'Bạn đã gắp hết tất cả thú bông trong lượt này.', '🏆');
      }
    }
  }
}

function resetCollection() {
  if (busy) return;
  createPlushCollection();
}
createButton.addEventListener('click', () => { playClick(); createPlushCollection(); });
grabButton.addEventListener('click', startGrab);
resetButton.addEventListener('click', () => { playClick(); resetCollection(); });

// Initial example names for a quick first test.
nameInput.value = 'An\nBình\nChi\nDũng\nHương\nMinh\nPhúc\nTrang\nKhánh\nTuấn\nVy\nLong';
createPlushCollection();

// ----------------------------------------------------------------------------
// Labels and rendering.
// ----------------------------------------------------------------------------
function updateLabels() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  for (const toy of plushies) {
    if (!toy.active || toy.collected) { toy.label.style.display = 'none'; continue; }
    const worldPoint = toy.group.localToWorld(new THREE.Vector3(0, 1.5, 0));
    labelProjection.copy(worldPoint).project(camera);
    const x = (labelProjection.x * 0.5 + 0.5) * width;
    const y = (-labelProjection.y * 0.5 + 0.5) * height;
    const visible = labelProjection.z < 1 && x > -60 && x < width + 60 && y > -40 && y < height + 40;
    toy.label.style.display = visible ? 'block' : 'none';
    if (visible) toy.label.style.transform = `translate(-50%,-100%) translate(${x}px,${y}px)`;
  }
}
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.04);
  const elapsed = clock.elapsedTime;

  updateCraneSequence(dt);
  for (const toy of plushies) {
    if (!toy.active || toy.collected) continue;
    toy.group.position.y = toy.home.y + Math.sin(elapsed * 1.7 + toy.seed) * 0.018;
    toy.group.rotation.z = Math.sin(elapsed * 1.15 + toy.seed) * 0.012;
    if (toy.mixer) toy.mixer.update(dt);
  }
  for (const toy of collectedPlushies) {
    if (toy.mixer) toy.mixer.update(dt);
  }
  // A subtle idle sway for the whole gantry when the machine is waiting.
  if (!busy) trolley.position.y = craneHome.y + Math.sin(elapsed * 1.2) * 0.015;
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

// 20/11 welcome greeting popup.
const welcomeModal = document.querySelector('#welcomeModal');
const closeWelcomeButton = document.querySelector('#closeWelcome');
const enterFarmButton = document.querySelector('#enterFarm');
function closeWelcome() {
  welcomeModal.classList.remove('open');
  welcomeModal.setAttribute('aria-hidden', 'true');
}
function openWelcome() {
  welcomeModal.classList.add('open');
  welcomeModal.setAttribute('aria-hidden', 'false');
}
closeWelcomeButton.addEventListener('click', () => { playClick(); closeWelcome(); });
enterFarmButton.addEventListener('click', () => { playClick(); closeWelcome(); });
welcomeModal.querySelector('.welcome-backdrop').addEventListener('click', closeWelcome);
openWelcome();
