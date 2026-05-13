---
name: threejs-car-animation-transfer
description: Transfer the 3d-car Three.js vehicle scene into another web project. Use whenever moving this GLB car animation system into Vite, vanilla JS, React, or Next apps, especially when wheel rotation, GLTF clip cues, viewport-fit model scaling, smooth scroll-driven camera poses, runtime cleanup, or GLB assets larger than 5MB need an opt-in optimization pass that preserves detail, textures, and animation behavior as much as possible.
---

# Three.js Car Animation Transfer

This skill is a single-file transfer guide for moving the `3d-car` animation system into another project.

Keep this goal in mind:

- Reuse the scene architecture.
- Keep the imported model visually intact.
- Preserve animation behavior.
- Do not optimize large assets without explicit user approval.

## Scope

This skill handles:

- GLB preflight checks.
- Opt-in optimization for models larger than `5MB`.
- Wheel-root matching.
- GLTF clip matching.
- Model normalization.
- Viewport-fit camera and model scaling.
- Scroll-driven camera poses.
- Runtime cleanup for SPA and React apps.

## Source Of Truth

Use the current repo implementation as the reference: `assets/js/core/scene.js`, `assets/js/core/scroll.js`, `assets/js/core/performance.js`, `assets/js/main.js`, `assets/js/config/brand.config.js`, `assets/js/config/story.config.js`.

Copy the pattern, not the file blindly.

## Transfer Flow

Follow this order:

1. Measure the incoming GLB size.
2. If the GLB is larger than `5MB`, recommend optimization and ask the user first.
3. Inspect clips, node names, wheel roots, and likely wheel axis.
4. Put the final chosen GLB in a bundler-managed asset path.
5. Fit the model to the viewport before tuning individual section poses.
6. Port config, performance profile, scene, scroll logic, and bootstrap.
7. Validate viewport fit, wheel spin, cue playback, scroll blending, and cleanup.

## Asset Gate

Before transfer, measure the GLB:

```bash
node skills/threejs-car-animation-transfer/scripts/check-glb-size.mjs src/assets/models/car.glb
```

Interpretation:

- `<= 5MB`: transfer may proceed without offline optimization if runtime performance is acceptable.
- `> 5MB`: optimization should be recommended, but must be approved by the user first.
- `> 8MB`: optimization is strongly recommended, but still opt-in.

Large size is only a signal. Real cost is size plus texture memory, geometry density, draw calls, and decode overhead.

## User Approval Rule

Never optimize automatically.

When the model is larger than `5MB`, ask before changing the asset:

- `Do you want me to run a safe optimization pass first? It keeps the original file, avoids texture downscaling, and focuses on preserving animation compatibility.`
- `The safe pass was not enough. Do you want me to try a more aggressive pass that may reduce texture fidelity, such as WebP conversion or texture resize?`

## Preservation Rule

The target is not "smallest possible file". The target is "smaller file without breaking the look or animation behavior that matters."

Always preserve:

- the original source GLB
- clip count
- clip names
- visible body curvature
- wheel silhouette
- acceptable texture detail in hero views
- animation playback behavior

Be honest: you cannot guarantee zero visual change from every transform. That is why optimization is opt-in and must pass visual QA plus animation QA before it replaces the runtime asset.

## Optimization Policy

Use official `gltf-transform` tooling for offline optimization.

Install:

```bash
npm install -D @gltf-transform/cli
```

Inspect the source file first:

```bash
npx gltf-transform inspect src/assets/models/car.glb
```

### Safe pass

Use the safe pass first after user approval. Goals:

- keep the original file untouched
- avoid texture downscaling
- avoid geometry simplification by default
- keep runtime loader strategy aligned with Meshopt

Command:

```bash
npx gltf-transform meshopt src/assets/models/car.glb src/assets/models/car.safe.glb --level medium
```

Inspect the result:

```bash
npx gltf-transform inspect src/assets/models/car.safe.glb
```

### Aggressive pass

Only use this after a second explicit approval if the safe pass is still too heavy.

WebP conversion:

```bash
npx gltf-transform webp src/assets/models/car.safe.glb src/assets/models/car.optimized.glb
```

Inspect:

```bash
npx gltf-transform inspect src/assets/models/car.optimized.glb
```

If the user explicitly approves texture downscaling:

```bash
npx gltf-transform resize src/assets/models/car.optimized.glb src/assets/models/car.optimized-2k.glb --width 2048 --height 2048
npx gltf-transform inspect src/assets/models/car.optimized-2k.glb
```

Recommended naming while iterating:

```txt
car.glb
car.safe.glb
car.optimized.glb
car.optimized-2k.glb
```

Do not overwrite the original asset during experimentation.

## Runtime Loader Matching

- Meshopt output -> `loader.setMeshoptDecoder(MeshoptDecoder)`
- Draco output -> `loader.setDRACOLoader(dracoLoader)`

Do not mismatch the offline compression strategy and the runtime loader.

### Draco runtime example

Use this only when the asset was actually compressed with Draco:

```js
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const loader = new GLTFLoader();
const dracoLoader = new DRACOLoader();

// Point this to a public decoder path in the target app.
dracoLoader.setDecoderPath('/draco/');
loader.setDRACOLoader(dracoLoader);

const gltf = await loader.loadAsync(modelUrl);

// Optional cleanup if the loader is no longer needed.
dracoLoader.dispose();
```

## Discovery Pass

Do not assume a new car model matches the original.

Capture final file size, clip names, clip durations, likely wheel parents, likely wheel axis, and largest texture dimensions from `inspect`.

Add a one-time audit after `loadAsync(...)`:

```js
console.table(gltf.animations.map((clip) => ({ name: clip.name, duration: clip.duration })));

const wheelCandidates = [];
gltf.scene.traverse((node) => {
  if (/wheel|rim|tire/i.test(node.name)) wheelCandidates.push(node.name);
});
console.log('wheel candidates', wheelCandidates);
```

If these do not line up with config, block the transfer and fix config first.

## Runtime Rules

Keep these rules:

- Resolve the model with `new URL(..., import.meta.url).href`.
- Normalize before tuning poses.
- Treat the viewport as the camera contract: set `camera.aspect = viewportWidth / viewportHeight`, update the projection matrix, and fit the model into the camera frustum after each resize.
- Scale large models down and small models up so the vehicle stays inside the visible viewport before any section-specific `stageX`, `camera`, or `target` tuning.
- Keep model fit bounded with scale multipliers so resize events do not make the car microscopic or oversized.
- Save rest transforms before cues.
- Rotate wheels on top of the rest pose.
- Re-apply wheel spin after rest-pose restore and after mixer updates if clips overwrite wheel transforms.
- Cap pixel ratio on low-power devices.
- Return a cleanup handle for unmount.

## Viewport Fit Rule

The car must enter the screen already fitting inside the viewport. Do not rely on manual camera guessing to rescue a bad initial scale.

Use this rule:

1. Set camera aspect from the real viewport.
2. Compute the visible frustum span at the first section's camera distance.
3. Compute a target diameter from the smaller viewport span and a coverage ratio.
4. Scale the GLB root so its bounding box fits that diameter.
5. Allow both directions: large models scale down, small models scale up.
6. Re-run the fit on resize before refreshing scroll triggers.

Keep section poses as art direction after this fit. `stageX` may create layout negative space, but it must not push the car outside the viewport unless the design intentionally crops it.

## Full Portable Example

### `vehicle3d.config.js`

```js
export const VEHICLE_CONFIG = {
  modelUrl: new URL('../assets/models/car.optimized.glb', import.meta.url).href,
  wheelRootPattern: /^rim_235(?:\.?\d{3})?$/,
  wheelSpinAxis: [1, 0, 0],
  wheelSpinSpeed: Math.PI * 8,
  desiredLength: 4.8,
  viewportFit: {
    enabled: true,
    coverage: 0.78,
    mobileCoverage: 0.68,
    minScaleMultiplier: 0.7,
    maxScaleMultiplier: 1.8
  },
  baseRotationY: -Math.PI * 0.08,
  liftY: 0.18,
  hoverAmplitude: 0.007,
  hoverSpeed: 0.5,
  cueSpeedMultiplier: 1.2,
  palette: {
    background: '#090304',
    key: 0xfff0eb,
    rim: 0xff6f5e,
    fill: 0xffb4a8
  },
  sections: [
    {
      id: 'prelude',
      camera: { x: 0.02, y: 0.22, z: 1.68 },
      target: { x: 0.24, y: 0.16, z: 0 },
      rotationY: 0.25,
      stageX: 0.62,
      liftY: 0.08,
      floorOffsetY: 0,
      exposure: 1.22,
      cues: ['FrontDoorWindshieldAction']
    },
    {
      id: 'hero',
      camera: { x: -0.18, y: 0.24, z: 2.04 },
      target: { x: 0, y: 0.18, z: 0 },
      rotationY: -1.32,
      stageX: 0.02,
      liftY: 0.12,
      floorOffsetY: 0.05,
      exposure: 1.28,
      cues: ['AllActions']
    },
    {
      id: 'performance',
      camera: { x: 0.02, y: 0.24, z: 2.02 },
      target: { x: -0.04, y: 0.19, z: 0 },
      rotationY: 0.02,
      stageX: -0.46,
      liftY: 0.06,
      floorOffsetY: 0.02,
      exposure: 1.22,
      cues: ['LeftDoorAction', 'RightDoorAction']
    },
    {
      id: 'engineering',
      camera: { x: -0.08, y: 0.27, z: 2.02 },
      target: { x: 0.05, y: 0.19, z: 0 },
      rotationY: 0.5,
      stageX: 0.44,
      liftY: 0.06,
      floorOffsetY: 0.02,
      exposure: 1.24,
      cues: ['RearDoorAction']
    },
    {
      id: 'finale',
      camera: { x: -0.04, y: 0.16, z: 1.42 },
      target: { x: 0, y: 0.1, z: 0 },
      rotationY: 1.82,
      stageX: 0,
      liftY: -0.38,
      floorOffsetY: -0.38,
      exposure: 1.26,
      cues: []
    }
  ]
};
```

### `performance-profile.js`

```js
export function getVehiclePerformanceProfile() {
  const width = window.innerWidth;
  const memoryGb = navigator.deviceMemory || 4;
  const threads = navigator.hardwareConcurrency || 4;
  const saveData = navigator.connection?.saveData || false;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const isMobile = width <= 720;
  const isTablet = width > 720 && width <= 1080;
  const lowPower = saveData || memoryGb <= 4 || threads <= 6;
  const highHeadroom = memoryGb >= 8 && threads >= 8;

  let pixelRatioCap = 1;
  if (isMobile) pixelRatioCap = 0.9;
  if (isTablet) pixelRatioCap = 1;
  if (lowPower) pixelRatioCap = Math.min(pixelRatioCap, 0.85);

  return {
    reducedMotion,
    saveData,
    isMobile,
    isTablet,
    lowPower,
    highHeadroom,
    pixelRatioCap,
    shadowsEnabled: !isMobile && !saveData && !lowPower,
    shadowMapSize: isTablet || lowPower ? 768 : 1024,
    usePostprocessing: !reducedMotion && !lowPower && highHeadroom && !isMobile && width >= 1600,
    useExtraBloom: false,
    allowIdleDrift: false
  };
}
```

### `vehicle-scene.js`

```js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { VEHICLE_CONFIG } from './vehicle3d.config.js';

const wheelSpinAxis = new THREE.Vector3(...VEHICLE_CONFIG.wheelSpinAxis);

export class VehicleSceneController {
  constructor({ canvas, profile, onProgress = () => {} }) {
    this.canvas = canvas;
    this.profile = profile;
    this.onProgress = onProgress;
    this.clock = new THREE.Clock();
    this.isVisible = true;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(VEHICLE_CONFIG.palette.background);
    this.scene.fog = new THREE.Fog(VEHICLE_CONFIG.palette.background, 10, 26);

    this.camera = new THREE.PerspectiveCamera(34, 1, 0.01, 500);
    this.cameraPosition = new THREE.Vector3();
    this.cameraTarget = new THREE.Vector3();
    this.desiredCameraPosition = new THREE.Vector3();
    this.desiredCameraTarget = new THREE.Vector3();
    this.baseTarget = new THREE.Vector3();

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !profile.lowPower,
      alpha: true,
      powerPreference: 'high-performance'
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = profile.shadowsEnabled;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.currentExposure = VEHICLE_CONFIG.sections[0].exposure;
    this.desiredExposure = this.currentExposure;
    this.renderer.toneMappingExposure = this.currentExposure;

    this.modelGroup = new THREE.Group();
    this.carRoot = new THREE.Group();
    this.modelScaleWrap = null;
    this.modelBaseBox = new THREE.Box3();
    this.scene.add(this.modelGroup);
    this.modelGroup.add(this.carRoot);

    this.radius = 1;
    this.modelScale = 1;
    this.modelBaseScale = 1;
    this.floorBaseY = -0.02;
    this.currentFloorY = this.floorBaseY;
    this.desiredFloorY = this.floorBaseY;
    this.currentLiftY = VEHICLE_CONFIG.liftY;
    this.desiredLiftY = VEHICLE_CONFIG.liftY;
    this.baseRotationY = VEHICLE_CONFIG.baseRotationY;
    this.desiredRotationY = this.baseRotationY;
    this.desiredStageX = 0;

    this.positionDamping = profile.reducedMotion ? 28 : profile.lowPower ? 5.2 : 6.2;
    this.rotationDamping = profile.reducedMotion ? 24 : profile.lowPower ? 4.4 : 5;
    this.environmentDamping = profile.reducedMotion ? 24 : profile.lowPower ? 4.8 : 5.6;

    this.mixer = null;
    this.actions = new Map();
    this.animatedActions = new Set();
    this.playedCues = new Set();
    this.restTransforms = new Map();

    this.wheelSpinTargets = [];
    this.wheelSpinAngle = 0;
    this.wheelSpinQuaternion = new THREE.Quaternion();
    this.wheelSpinSpeed = VEHICLE_CONFIG.wheelSpinSpeed;

    this.setupLighting();
    this.bindVisibility();
  }

  bindVisibility() {
    this.handleVisibilityChange = () => {
      this.isVisible = !document.hidden;
      this.clock.getDelta();
    };
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  setupLighting() {
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const ambient = new THREE.HemisphereLight(0xffe4dd, 0x150708, 1.8);
    const key = new THREE.DirectionalLight(VEHICLE_CONFIG.palette.key, 4.8);
    key.position.set(6, 5, 5);
    key.castShadow = this.profile.shadowsEnabled;
    key.shadow.mapSize.set(this.profile.shadowMapSize, this.profile.shadowMapSize);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 30;
    key.shadow.bias = -0.0002;

    const rim = new THREE.PointLight(VEHICLE_CONFIG.palette.rim, 18, 48, 2.2);
    rim.position.set(-4, 2, -5);

    const fill = new THREE.PointLight(VEHICLE_CONFIG.palette.fill, 14, 32, 2.2);
    fill.position.set(4, 1.5, 4.5);

    this.floor = new THREE.Mesh(
      new THREE.CircleGeometry(5.8, 64),
      new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.3 })
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = this.floorBaseY;
    this.floor.receiveShadow = this.profile.shadowsEnabled;

    this.scene.add(ambient, key, rim, fill, this.floor);
  }

  setupWheelSpin(model) {
    this.wheelSpinTargets = [];
    model.traverse((child) => {
      if (VEHICLE_CONFIG.wheelRootPattern.test(child.name)) {
        this.wheelSpinTargets.push(child);
      }
    });
  }

  updateWheelSpin(delta) {
    if (!this.wheelSpinTargets.length || !this.wheelSpinSpeed) return;
    const spinStep = this.wheelSpinSpeed * Math.min(delta, 1 / 45);
    this.wheelSpinAngle = (this.wheelSpinAngle + spinStep) % (Math.PI * 2);
    this.applyWheelSpinPose();
  }

  applyWheelSpinPose() {
    if (!this.wheelSpinTargets.length) return;
    this.wheelSpinQuaternion.setFromAxisAngle(wheelSpinAxis, this.wheelSpinAngle);

    this.wheelSpinTargets.forEach((wheelRoot) => {
      const restTransform = this.restTransforms.get(wheelRoot);
      if (!restTransform) return;
      wheelRoot.quaternion.copy(restTransform.quaternion);
      wheelRoot.quaternion.multiply(this.wheelSpinQuaternion);
    });
  }

  async loadModel() {
    const manager = new THREE.LoadingManager();
    manager.onProgress = (_, loaded, total) => {
      if (total) this.onProgress(loaded / total);
    };

    const loader = new GLTFLoader(manager);
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(VEHICLE_CONFIG.modelUrl);
    this.onProgress(1);

    console.table(gltf.animations.map((clip) => ({ name: clip.name, duration: clip.duration })));

    const model = gltf.scene;
    const meshEntries = [];

    model.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = true;

      if (child.material) {
        child.material.envMapIntensity = child.material.envMapIntensity || 1.5;
        if ('metalness' in child.material) child.material.metalness = Math.min(1, child.material.metalness + 0.05);
        if ('roughness' in child.material) child.material.roughness = Math.max(0.05, child.material.roughness * 0.82);
      }

      meshEntries.push({
        mesh: child,
        box: new THREE.Box3(),
        center: new THREE.Vector3()
      });
    });

    model.updateMatrixWorld(true);
    meshEntries.forEach((entry) => {
      entry.box.setFromObject(entry.mesh);
      entry.box.getCenter(entry.center);
    });

    const alignedBox = new THREE.Box3().setFromObject(model);
    const alignedSize = alignedBox.getSize(new THREE.Vector3());
    const alignedCenter = alignedBox.getCenter(new THREE.Vector3());
    const alignedLength = Math.max(alignedSize.x, alignedSize.z);

    this.modelBaseScale = VEHICLE_CONFIG.desiredLength / alignedLength;
    this.modelScale = this.modelBaseScale;
    this.radius = VEHICLE_CONFIG.desiredLength * 0.5;

    const modelScaleWrap = new THREE.Group();
    model.position.set(-alignedCenter.x, -alignedBox.min.y, -alignedCenter.z);
    modelScaleWrap.scale.setScalar(this.modelScale);
    modelScaleWrap.add(model);
    this.carRoot.add(modelScaleWrap);
    this.modelScaleWrap = modelScaleWrap;
    this.modelBaseBox.copy(alignedBox);
    modelScaleWrap.updateMatrixWorld(true);

    const scaledBox = new THREE.Box3().setFromObject(modelScaleWrap);
    const bodyHeight = scaledBox.getSize(new THREE.Vector3()).y;
    this.baseTarget.set(0, Math.min(Math.max(bodyHeight * 0.44, 0.48), 0.82), 0);
    this.cameraTarget.copy(this.baseTarget);

    this.mixer = new THREE.AnimationMixer(model);
    gltf.animations.forEach((clip) => {
      const action = this.mixer.clipAction(clip);
      action.enabled = true;
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = false;
      this.actions.set(clip.name, action);
    });

    this.setupWheelSpin(model);
    model.traverse((child) => {
      this.restTransforms.set(child, {
        position: child.position.clone(),
        quaternion: child.quaternion.clone(),
        scale: child.scale.clone()
      });
    });

    console.log('wheel targets', this.wheelSpinTargets.map((node) => node.name));

    this.snapToPose(this.getSectionPose(VEHICLE_CONFIG.sections[0]));
  }

  getSectionPose(section) {
    return {
      cameraX: section.camera.x * this.radius,
      cameraY: section.camera.y * this.radius,
      cameraZ: section.camera.z * this.radius,
      targetX: section.target.x * this.radius,
      targetY: section.target.y * this.radius,
      targetZ: section.target.z * this.radius,
      rotationY: VEHICLE_CONFIG.baseRotationY + section.rotationY,
      stageX: (section.stageX || 0) * this.radius,
      liftY: section.liftY ?? VEHICLE_CONFIG.liftY,
      floorY: this.floorBaseY + (section.floorOffsetY ?? 0),
      exposure: section.exposure
    };
  }

  mixPoses(fromPose, toPose, progress) {
    const t = THREE.MathUtils.smootherstep(progress, 0, 1);
    const lerp = THREE.MathUtils.lerp;
    return {
      cameraX: lerp(fromPose.cameraX, toPose.cameraX, t),
      cameraY: lerp(fromPose.cameraY, toPose.cameraY, t),
      cameraZ: lerp(fromPose.cameraZ, toPose.cameraZ, t),
      targetX: lerp(fromPose.targetX, toPose.targetX, t),
      targetY: lerp(fromPose.targetY, toPose.targetY, t),
      targetZ: lerp(fromPose.targetZ, toPose.targetZ, t),
      rotationY: lerp(fromPose.rotationY, toPose.rotationY, t),
      stageX: lerp(fromPose.stageX, toPose.stageX, t),
      liftY: lerp(fromPose.liftY, toPose.liftY, t),
      floorY: lerp(fromPose.floorY, toPose.floorY, t),
      exposure: lerp(fromPose.exposure, toPose.exposure, t)
    };
  }

  snapToPose(pose) {
    this.cameraPosition.set(pose.cameraX, pose.cameraY, pose.cameraZ);
    this.cameraTarget.set(pose.targetX, pose.targetY, pose.targetZ);
    this.desiredCameraPosition.copy(this.cameraPosition);
    this.desiredCameraTarget.copy(this.cameraTarget);
    this.carRoot.rotation.y = pose.rotationY;
    this.desiredRotationY = pose.rotationY;
    this.carRoot.position.x = pose.stageX;
    this.desiredStageX = pose.stageX;
    this.carRoot.position.y = pose.liftY;
    this.currentLiftY = pose.liftY;
    this.desiredLiftY = pose.liftY;
    this.currentFloorY = pose.floorY;
    this.desiredFloorY = pose.floorY;
    if (this.floor) this.floor.position.set(pose.stageX, pose.floorY, 0);
    this.currentExposure = pose.exposure;
    this.desiredExposure = pose.exposure;
    this.renderer.toneMappingExposure = pose.exposure;
  }

  setDesiredPose(pose) {
    this.desiredCameraPosition.set(pose.cameraX, pose.cameraY, pose.cameraZ);
    this.desiredCameraTarget.set(pose.targetX, pose.targetY, pose.targetZ);
    this.desiredRotationY = pose.rotationY;
    this.desiredStageX = pose.stageX;
    this.desiredLiftY = pose.liftY;
    this.desiredFloorY = pose.floorY;
    this.desiredExposure = pose.exposure;
  }

  setViewport(width, height) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    const pixelRatio = Math.min(window.devicePixelRatio || 1, this.profile.pixelRatioCap);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);

    this.fitModelToViewport(width, height);
  }

  fitModelToViewport(width = window.innerWidth, height = window.innerHeight) {
    const fit = VEHICLE_CONFIG.viewportFit;
    if (!fit?.enabled || !this.modelScaleWrap || this.modelBaseBox.isEmpty()) return;

    const firstPose = this.getSectionPose(VEHICLE_CONFIG.sections[0]);
    const cameraPosition = new THREE.Vector3(firstPose.cameraX, firstPose.cameraY, firstPose.cameraZ);
    const cameraTarget = new THREE.Vector3(firstPose.targetX, firstPose.targetY, firstPose.targetZ);
    const distance = cameraPosition.distanceTo(cameraTarget);
    const verticalSpan = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * distance;
    const horizontalSpan = verticalSpan * this.camera.aspect;
    const coverage = width <= 720 ? fit.mobileCoverage : fit.coverage;
    const targetDiameter = Math.min(verticalSpan, horizontalSpan) * coverage;
    const sourceSize = this.modelBaseBox.getSize(new THREE.Vector3());
    const sourceDiameter = Math.max(sourceSize.x, sourceSize.y, sourceSize.z);
    const fittedScale = THREE.MathUtils.clamp(
      targetDiameter / sourceDiameter,
      this.modelBaseScale * fit.minScaleMultiplier,
      this.modelBaseScale * fit.maxScaleMultiplier
    );

    this.modelScale = fittedScale;
    this.modelScaleWrap.scale.setScalar(fittedScale);
    this.radius = (sourceDiameter * fittedScale) * 0.5;
  }

  playCue(name) {
    if (!name || !this.actions.has(name) || this.playedCues.has(name)) return;
    const action = this.actions.get(name);
    action.reset();
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
    action.timeScale = VEHICLE_CONFIG.cueSpeedMultiplier;
    action.play();
    this.playedCues.add(name);
    this.animatedActions.add(action);
  }

  restoreRestPose() {
    this.restTransforms.forEach((transform, object) => {
      object.position.copy(transform.position);
      object.quaternion.copy(transform.quaternion);
      object.scale.copy(transform.scale);
    });
    this.applyWheelSpinPose();
    this.carRoot.updateMatrixWorld(true);
  }

  playCueSet(cues = []) {
    if (!this.restTransforms.size) return;
    if (this.mixer) this.mixer.stopAllAction();
    this.animatedActions.clear();
    this.playedCues.clear();
    this.restoreRestPose();
    cues.forEach((cue) => this.playCue(cue));
  }

  update() {
    if (!this.isVisible) return;

    const delta = this.clock.getDelta();
    const elapsed = this.clock.elapsedTime;

    this.modelGroup.position.y = this.profile.allowIdleDrift
      ? Math.sin(elapsed * VEHICLE_CONFIG.hoverSpeed) * (this.radius * VEHICLE_CONFIG.hoverAmplitude)
      : 0;

    if (this.mixer) {
      this.mixer.update(delta);
      for (const action of [...this.animatedActions]) {
        if (!action.isRunning()) this.animatedActions.delete(action);
      }
    }

    this.updateWheelSpin(delta);

    this.cameraPosition.x = THREE.MathUtils.damp(this.cameraPosition.x, this.desiredCameraPosition.x, this.positionDamping, delta);
    this.cameraPosition.y = THREE.MathUtils.damp(this.cameraPosition.y, this.desiredCameraPosition.y, this.positionDamping, delta);
    this.cameraPosition.z = THREE.MathUtils.damp(this.cameraPosition.z, this.desiredCameraPosition.z, this.positionDamping, delta);
    this.cameraTarget.x = THREE.MathUtils.damp(this.cameraTarget.x, this.desiredCameraTarget.x, this.positionDamping, delta);
    this.cameraTarget.y = THREE.MathUtils.damp(this.cameraTarget.y, this.desiredCameraTarget.y, this.positionDamping, delta);
    this.cameraTarget.z = THREE.MathUtils.damp(this.cameraTarget.z, this.desiredCameraTarget.z, this.positionDamping, delta);
    this.carRoot.rotation.y = THREE.MathUtils.damp(this.carRoot.rotation.y, this.desiredRotationY, this.rotationDamping, delta);
    this.carRoot.position.x = THREE.MathUtils.damp(this.carRoot.position.x, this.desiredStageX, this.positionDamping, delta);
    this.currentLiftY = THREE.MathUtils.damp(this.currentLiftY, this.desiredLiftY, this.environmentDamping, delta);
    this.carRoot.position.y = this.currentLiftY;
    this.currentFloorY = THREE.MathUtils.damp(this.currentFloorY, this.desiredFloorY, this.environmentDamping, delta);
    if (this.floor) this.floor.position.set(this.carRoot.position.x, this.currentFloorY, 0);
    this.currentExposure = THREE.MathUtils.damp(this.currentExposure, this.desiredExposure, this.environmentDamping, delta);
    this.renderer.toneMappingExposure = this.currentExposure;

    this.camera.position.copy(this.cameraPosition);
    this.camera.lookAt(this.cameraTarget);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    if (this.mixer) this.mixer.stopAllAction();

    this.scene.traverse((child) => {
      if (!child.isMesh) return;
      child.geometry?.dispose();

      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.filter(Boolean).forEach((material) => {
        Object.values(material).forEach((value) => {
          if (value && value.isTexture) value.dispose();
        });
        material.dispose();
      });
    });

    this.renderer.dispose();
  }
}
```

### `scroll-narrative.js`

```js
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { VEHICLE_CONFIG } from './vehicle3d.config.js';

gsap.registerPlugin(ScrollTrigger);

export function setupVehicleScrollNarrative(sceneController, profile) {
  const sections = VEHICLE_CONFIG.sections
    .map((section) => ({ ...section, element: document.getElementById(section.id) }))
    .filter((section) => section.element);

  if (!sections.length) return () => {};

  const triggers = [];
  const revealAnimations = [];
  const poses = sections.map((section) => sceneController.getSectionPose(section));

  sceneController.snapToPose(poses[0]);
  sceneController.playCueSet(sections[0].cues || []);
  document.body.dataset.section = sections[0].id;

  let activeSectionIndex = 0;

  const activateSection = (index) => {
    const section = sections[index];
    if (!section || activeSectionIndex === index) return;
    activeSectionIndex = index;
    document.body.dataset.section = section.id;
    sceneController.setDesiredPose(poses[index]);
    sceneController.playCueSet(section.cues || []);
  };

  sections.forEach((section, index) => {
    triggers.push(
      ScrollTrigger.create({
        trigger: section.element,
        start: index === 0 ? 'top top' : 'top 55%',
        end: 'bottom 45%',
        onEnter: () => activateSection(index),
        onEnterBack: () => activateSection(index)
      })
    );
  });

  sections.slice(1).forEach((section, index) => {
    const fromIndex = index;
    const toIndex = index + 1;

    triggers.push(
      ScrollTrigger.create({
        trigger: section.element,
        start: 'top 82%',
        end: 'top 38%',
        invalidateOnRefresh: true,
        onUpdate: (self) => {
          const progress = profile.reducedMotion ? (self.progress >= 0.5 ? 1 : 0) : self.progress;
          sceneController.setDesiredPose(sceneController.mixPoses(poses[fromIndex], poses[toIndex], progress));
          document.body.dataset.section = progress < 0.5 ? sections[fromIndex].id : section.id;
        },
        onLeave: () => activateSection(toIndex),
        onLeaveBack: () => activateSection(fromIndex)
      })
    );
  });

  gsap.utils.toArray('[data-reveal]').forEach((node) => {
    const tween = gsap.from(node, {
      opacity: 0,
      y: profile.reducedMotion ? 0 : 28,
      duration: 0.85,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: node,
        start: 'top 84%'
      }
    });
    revealAnimations.push(tween);
  });

  ScrollTrigger.refresh();

  return () => {
    revealAnimations.forEach((tween) => tween.scrollTrigger?.kill());
    revealAnimations.forEach((tween) => tween.kill());
    triggers.forEach((trigger) => trigger.kill());
  };
}
```

### `bootstrap-vehicle3d.js`

```js
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { VehicleSceneController } from './vehicle-scene.js';
import { setupVehicleScrollNarrative } from './scroll-narrative.js';
import { getVehiclePerformanceProfile } from './performance-profile.js';

export async function bootstrapVehicle3D({
  canvas = document.getElementById('experience-canvas'),
  onProgress = () => {},
  onReady = () => {},
  onError = (error) => console.error('Vehicle scene failed:', error)
} = {}) {
  let frameId = 0;
  let destroyScroll = () => {};

  try {
    const profile = getVehiclePerformanceProfile();
    const sceneController = new VehicleSceneController({ canvas, profile, onProgress });

    const handleResize = () => {
      sceneController.setViewport(window.innerWidth, window.innerHeight);
      ScrollTrigger.refresh();
    };

    window.addEventListener('resize', handleResize);
    await sceneController.loadModel();
    handleResize();
    destroyScroll = setupVehicleScrollNarrative(sceneController, profile) || (() => {});
    onReady(sceneController);

    const render = () => {
      sceneController.update();
      frameId = requestAnimationFrame(render);
    };
    render();

    return {
      sceneController,
      dispose() {
        cancelAnimationFrame(frameId);
        window.removeEventListener('resize', handleResize);
        destroyScroll();
        sceneController.dispose();
      }
    };
  } catch (error) {
    onError(error);
    return null;
  }
}
```

### Next.js integration example

Use a client component and initialize on mount:

```jsx
'use client';

import { useEffect, useRef } from 'react';
import { bootstrapVehicle3D } from '@/vehicle3d/bootstrap-vehicle3d.js';

export default function VehicleCanvas() {
  const canvasRef = useRef(null);

  useEffect(() => {
    let handle = null;
    let cancelled = false;

    bootstrapVehicle3D({ canvas: canvasRef.current }).then((result) => {
      if (cancelled) {
        result?.dispose?.();
        return;
      }
      handle = result;
    });

    return () => {
      cancelled = true;
      handle?.dispose?.();
    };
  }, []);

  return <canvas id="experience-canvas" ref={canvasRef} />;
}
```

If the page uses the App Router and the scene is heavy, prefer loading this component only in the route that needs it.

## Animation Tuning

Tune in this order:

1. `desiredLength`
2. `viewportFit`
3. wheel root regex
4. wheel spin axis
5. clip names
6. section camera values
7. section target values
8. rotation and stage offsets
9. exposure
10. damping
11. optional drift and postprocessing

### Normalization

Use `desiredLength` when the car is globally too large or too small. Do not use it to fix a single bad shot.

Use `viewportFit` after normalization. The viewport fit is the hard safety rail: the model should stay fully visible in the camera frustum. If the car is tiny, increase through `maxScaleMultiplier` or coverage. If the car clips, reduce coverage or lower `maxScaleMultiplier` before moving section cameras.

### Section pose knobs

Each section gives you `camera`, `target`, `rotationY`, `stageX`, `liftY`, `floorOffsetY`, `exposure`, and `cues`.

- `camera.x`: orbit left/right
- `camera.y`: height
- `camera.z`: distance
- `target`: shifts visual focus without moving the camera rig
- `rotationY`: rotates the car itself
- `stageX`: creates negative space for layout
- `liftY`: body height on stage
- `floorOffsetY`: floor placement independent from the car
- `exposure`: strong mood control

### Pose blending

Relevant code:

```js
const t = THREE.MathUtils.smootherstep(progress, 0, 1);
```

This keeps transitions soft instead of robotic. If motion is too floaty, increase damping or reduce pose distance. If too stiff, lower damping slightly.

Do not jump directly between section poses during normal scroll. Every section transition should pass through `mixPoses(...)`, then `setDesiredPose(...)`, and the render loop should settle with `THREE.MathUtils.damp(...)`. This keeps the car, camera, target, lift, floor, and exposure moving as one smooth system.

### Damping

Relevant knobs:

```js
this.positionDamping = 6.2;
this.rotationDamping = 5;
this.environmentDamping = 5.6;
```

- `positionDamping`: camera and stage translation feel
- `rotationDamping`: body angle catch-up
- `environmentDamping`: lift, floor, exposure settling

Higher values snap faster. Lower values feel heavier.

### Wheel spin

Relevant code:

```js
const spinStep = this.wheelSpinSpeed * Math.min(delta, 1 / 45);
this.wheelSpinQuaternion.setFromAxisAngle(wheelSpinAxis, this.wheelSpinAngle);
```

Use `wheelSpinSpeed` to control scene energy. If the wheels do not spin, check candidate names, regex, axis, and whether clip playback is overwriting wheel transforms.

### Clip cues

Relevant code:

```js
action.timeScale = VEHICLE_CONFIG.cueSpeedMultiplier;
action.play();
```

- `cueSpeedMultiplier`: clip intensity
- `cues`: section-to-clip mapping

If cue names are wrong, dump `gltf.animations.map((clip) => clip.name)` and fix config. Do not guess.

### Fallback when clip names do not match

Use this flow:

1. Log the real clip names:

```js
console.table(gltf.animations.map((clip) => ({ name: clip.name, duration: clip.duration })));
```

2. Compare each configured cue against the real list.
3. Rename the cues in config to the real clip names.
4. If the new model has no useful clips, set `cues: []` temporarily and finish the camera transfer first.
5. If multiple clips are similar, test them one by one before assigning them to story sections.

Safe temporary fallback:

```js
sections: [
  { id: 'hero', camera: {...}, target: {...}, rotationY: 0, exposure: 1.2, cues: [] }
]
```

Do not leave invented clip names in config.

### Fallback when wheel root regex does not match

Use this flow:

1. Log likely wheel nodes:

```js
const wheelCandidates = [];
gltf.scene.traverse((node) => {
  if (/wheel|rim|tire/i.test(node.name)) wheelCandidates.push(node.name);
});
console.log(wheelCandidates);
```

2. Identify the parent nodes that should rotate together with the tire and rim.
3. Replace `wheelRootPattern` with a regex that matches those parent nodes.
4. If names are inconsistent, use a predicate function instead of a regex.

Regex fallback example:

```js
wheelRootPattern: /front_wheel|rear_wheel|rim|tire/i
```

Predicate fallback example:

```js
const isWheelRoot = (node) => /wheel|rim/i.test(node.name) && node.children.length > 0;
```

If wheels rotate around the wrong axis after matching the nodes, fix `wheelSpinAxis` before touching anything else.

### Reduced motion

Relevant code:

```js
const progress = profile.reducedMotion ? (self.progress >= 0.5 ? 1 : 0) : self.progress;
```

Keep this behavior unless you have a deliberate accessibility alternative.

## Optimization QA

### Visual QA

- door seams still align
- body reflections still read correctly
- wheel silhouettes are not obviously faceted
- glass and paint surfaces do not show unacceptable artifacts
- hero shots still feel premium
- texture sharpness is still acceptable in intended hero views

### Animation QA

- `gltf.animations.length` still matches the source asset
- clip names are unchanged
- clip durations still look sane
- wheel roots still exist and still match the runtime pattern
- wheel spin still works
- cue playback still works
- rest-pose restore still works before cue playback

Reject an optimization pass when body curvature degrades, tire silhouette becomes angular, clip names disappear, pivots break, texture artifacts become obvious, or animation playback no longer matches the source model.

## Validation Checklist

After transfer, verify all of the following:

1. The source GLB was measured before transfer.
2. If the file was larger than `5MB`, the user was asked before optimization.
3. The original GLB is still preserved.
4. The chosen runtime GLB is documented.
5. Wheel target count matches the expected wheel count.
6. Logged wheel target names match the actual wheel parent objects.
7. Clip names in config exist in `gltf.animations`.
8. Clip count and playback behavior still match the source model.
9. Texture detail is still acceptable in intended hero views.
10. `npm run build` passes.
11. The canvas is nonblank.
12. The camera aspect matches the viewport after load and after resize.
13. The full car fits inside the viewport on desktop and mobile.
14. Small models scale up and large models scale down within configured viewport-fit bounds.
15. The car is centered before section-specific art direction offsets.
16. All wheels rotate.
17. Scroll sections change pose and cues smoothly.
18. Route teardown leaves no live RAF loop.
19. Route teardown leaves no orphaned `ScrollTrigger`s.

If any step fails, do not call the transfer complete.
