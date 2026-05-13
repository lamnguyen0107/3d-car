---
name: threejs-car-animation-transfer
description: Transfer the 3d-car Three.js vehicle scene into another web project. Use whenever moving this GLB car animation system into Vite, vanilla JS, React, or Next apps, especially when wheel rotation, GLTF clip cues, scroll-driven camera poses, runtime cleanup, or large GLB assets larger than 5MB need optimization before integration. This is a single-file skill with workflow, code samples, tuning notes, and optimization guidance kept inline.
---

# Three.js Car Animation Transfer

This skill is a single-file, all-in-one transfer guide for moving the `3d-car` animation system into another project.

Use it when you need one place that contains:

- The transfer workflow.
- The asset gate for large GLBs.
- The optimization policy for files larger than `5MB`.
- The full code sample.
- The animation tuning explanation.
- The cleanup pattern for SPA and React apps.

Open this file and work top to bottom. Do not hunt for extra reference markdown files. Everything important is inline here.

## Scope

This skill handles:

- Porting the `3d-car` scene pattern into another frontend codebase.
- Preflight checks on a new GLB asset.
- Mandatory optimization when a GLB exceeds `5MB`.
- Wheel-root matching, clip matching, and stage normalization.
- Scroll-driven camera poses and cue playback.
- Runtime cleanup so the scene can be mounted and unmounted safely.

This skill does not handle:

- Blender re-rigging.
- Creating new GLTF animations from scratch.
- Re-authoring materials for a new art direction.
- Deep 3D modeling cleanup that requires DCC tools.

## Source Of Truth

Start from the current implementation in this repo:

- `assets/js/core/scene.js`
- `assets/js/core/scroll.js`
- `assets/js/core/performance.js`
- `assets/js/main.js`
- `assets/js/config/brand.config.js`
- `assets/js/config/story.config.js`

Do not copy blindly into the new project. Audit the incoming GLB first, then adapt the runtime.

## Core Pattern

The scene architecture is:

1. Load a GLB vehicle with `GLTFLoader`.
2. Enable Meshopt decoding if the asset uses Meshopt compression.
3. Normalize the model to a predictable stage size.
4. Save every object's rest transform.
5. Spin wheel root nodes every frame with a quaternion layered over the rest pose.
6. Play named GLTF clips as cues.
7. Interpolate camera, target, body rotation, stage offset, lift, floor offset, and exposure by scroll section.
8. Use a bounded performance profile so lower-power devices degrade gracefully.
9. Return a cleanup handle so SPA or React unmounts do not leak RAF loops or `ScrollTrigger`s.

## Transfer Flow

Follow this order. Do not skip ahead.

1. Inspect the incoming GLB size.
2. If the file is larger than `5MB`, optimize it before transfer.
3. Inspect clip names, node names, and likely wheel roots.
4. Move the final GLB to a bundler-managed asset path.
5. Port the config, performance profile, scene controller, scroll narrative, and bootstrap.
6. Validate wheel spin, cue playback, and scroll blending.
7. Validate cleanup on route change or unmount.

## Required Asset Gate

Before integration, check the GLB size:

```bash
node skills/threejs-car-animation-transfer/scripts/check-glb-size.mjs src/assets/models/car.glb
```

Interpretation:

- `<= 5MB`: transfer may proceed without offline optimization if runtime FPS is stable.
- `> 5MB`: optimization is mandatory before integration.
- `> 8MB`: optimize and expect to reduce textures, geometry, or both.

This gate exists because download size is only part of the problem. Large GLBs often imply high texture memory, excessive geometry, or decode overhead that hurts animation smoothness.

## Optimization Policy For Large GLBs

Use official `gltf-transform` tooling for offline optimization.

Install:

```bash
npm install -D @gltf-transform/cli
```

Inspect the model first:

```bash
npx gltf-transform inspect src/assets/models/car.glb
```

The preferred path in this skill is:

1. Use Meshopt for geometry compression.
2. Use WebP conversion for textures.
3. If the output is still too heavy, resize textures and inspect again.
4. Keep the original file until visual QA passes.

Baseline pipeline:

```bash
npx gltf-transform meshopt src/assets/models/car.glb src/assets/models/car.meshopt.glb --level medium
npx gltf-transform webp src/assets/models/car.meshopt.glb src/assets/models/car.optimized.glb
```

If still too large:

```bash
npx gltf-transform resize src/assets/models/car.optimized.glb src/assets/models/car.optimized-2k.glb --width 2048 --height 2048
npx gltf-transform inspect src/assets/models/car.optimized-2k.glb
```

Recommended output naming while iterating:

```txt
car.glb
car.meshopt.glb
car.optimized.glb
car.optimized-2k.glb
```

When QA passes, pick one final runtime asset and point the app to it.

## Runtime Loader Matching

If the optimized asset uses Meshopt:

```js
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
loader.setMeshoptDecoder(MeshoptDecoder);
```

If the optimized asset uses Draco instead:

```js
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('/draco/');
loader.setDRACOLoader(dracoLoader);
```

Do not mismatch the offline compression strategy and the runtime loader.

This means:

- Meshopt-compressed asset -> use `setMeshoptDecoder(...)`
- Draco-compressed asset -> use `setDRACOLoader(...)`

## Discovery Pass Before Porting

Do not assume a new car model matches the original.

Capture these facts before tuning:

- Final optimized file size.
- Animation clip names.
- Wheel-root node names.
- Model forward axis.
- Wheel spin axis.
- Largest texture dimensions from `gltf-transform inspect`.

At runtime, add a one-time audit after `loadAsync(...)`:

```js
console.table(gltf.animations.map((clip) => ({ name: clip.name, duration: clip.duration })));

const wheelCandidates = [];
gltf.scene.traverse((node) => {
  if (/wheel|rim|tire/i.test(node.name)) wheelCandidates.push(node.name);
});
console.log('wheel candidates', wheelCandidates);
```

If clip names or wheel candidates look wrong, block the transfer and fix config before styling the scene further.

## Project Structure

Recommended target structure:

```txt
src/
  assets/
    models/
      car.optimized.glb
  vehicle3d/
    vehicle3d.config.js
    performance-profile.js
    vehicle-scene.js
    scroll-narrative.js
    bootstrap-vehicle3d.js
```

## Runtime Rules

Keep these rules from the current repo:

- Resolve the model with `new URL(..., import.meta.url).href`.
- Normalize the model before tuning camera poses.
- Store rest transforms before mixing wheel spin and clip playback.
- Apply wheel spin as a quaternion layered over the wheel root rest pose.
- Re-apply wheel spin after restoring rest pose and after `mixer.update(delta)` if clip playback overwrites wheel transforms.
- Clamp pixel ratio on low-power devices.
- Return a cleanup handle for unmount.

## Full Code Sample

The code below is intentionally verbose and commented for transfer work. It is not the shortest possible implementation. It is the easiest to reason about and tune.

### `vehicle3d.config.js`

```js
export const VEHICLE_CONFIG = {
  modelUrl: new URL('../assets/models/car.optimized.glb', import.meta.url).href,

  // Match the wheel parent objects, not only the tire mesh, so the whole assembly rotates.
  wheelRootPattern: /^rim_235(?:\.?\d{3})?$/,

  // For some models this will be [0, 1, 0] or [0, 0, 1].
  wheelSpinAxis: [1, 0, 0],

  // "Always spinning" baseline that still reads as premium motion.
  wheelSpinSpeed: Math.PI * 8,

  // Normalize every imported vehicle to this approximate world length.
  desiredLength: 4.8,

  // Base body orientation before section-specific offsets.
  baseRotationY: -Math.PI * 0.08,

  // Default lift of the car on the stage.
  liftY: 0.18,

  // Optional idle drift. Keep small or disable.
  hoverAmplitude: 0.007,
  hoverSpeed: 0.5,

  // GLTF clip playback multiplier.
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
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
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
      antialias: !profile.lowPower && !profile.usePostprocessing,
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
    this.scene.add(this.modelGroup);
    this.modelGroup.add(this.carRoot);

    this.radius = 1;
    this.modelScale = 1;
    this.floorBaseY = -0.02;
    this.currentFloorY = this.floorBaseY;
    this.desiredFloorY = this.floorBaseY;
    this.currentLiftY = VEHICLE_CONFIG.liftY;
    this.desiredLiftY = VEHICLE_CONFIG.liftY;
    this.baseRotationY = VEHICLE_CONFIG.baseRotationY;
    this.desiredRotationY = this.baseRotationY;
    this.desiredStageX = 0;

    // Higher values snap faster. Lower values feel heavier and more cinematic.
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

    this.composer = null;
    this.fxaaPass = null;

    this.setupLighting();
    if (profile.usePostprocessing) this.setupPostprocessing();
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

  setupPostprocessing() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    const bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      this.profile.useExtraBloom ? 0.48 : 0.24,
      0.7,
      0.85
    );
    this.composer.addPass(bloom);

    this.fxaaPass = new ShaderPass(FXAAShader);
    this.composer.addPass(this.fxaaPass);
    this.composer.addPass(new OutputPass());
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

    // Normalize the vehicle so camera poses remain reusable across different car assets.
    const alignedBox = new THREE.Box3().setFromObject(model);
    const alignedSize = alignedBox.getSize(new THREE.Vector3());
    const alignedCenter = alignedBox.getCenter(new THREE.Vector3());
    const alignedLength = Math.max(alignedSize.x, alignedSize.z);

    this.modelScale = VEHICLE_CONFIG.desiredLength / alignedLength;
    this.radius = VEHICLE_CONFIG.desiredLength * 0.5;

    const modelScaleWrap = new THREE.Group();
    model.position.set(-alignedCenter.x, -alignedBox.min.y, -alignedCenter.z);
    modelScaleWrap.scale.setScalar(this.modelScale);
    modelScaleWrap.add(model);
    this.carRoot.add(modelScaleWrap);
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

    if (this.composer) {
      this.composer.setSize(width, height);
      if (this.fxaaPass) {
        this.fxaaPass.material.uniforms.resolution.value.set(
          1 / (width * pixelRatio),
          1 / (height * pixelRatio)
        );
      }
    }
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

    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
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

    this.composer?.dispose?.();
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
    .map((section) => ({
      ...section,
      element: document.getElementById(section.id)
    }))
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
          const mixedPose = sceneController.mixPoses(poses[fromIndex], poses[toIndex], progress);
          sceneController.setDesiredPose(mixedPose);
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

### App entry example

```js
import { bootstrapVehicle3D } from './vehicle3d/bootstrap-vehicle3d.js';

let vehicle3DHandle = null;

bootstrapVehicle3D({
  onProgress: (value) => {
    document.body.style.setProperty('--vehicle-load-progress', value);
  },
  onReady: (sceneController) => {
    vehicle3DHandle = sceneController;
    document.body.classList.add('is-ready');
  }
});
```

### React integration example

```jsx
import { useEffect, useRef } from 'react';
import { bootstrapVehicle3D } from './vehicle3d/bootstrap-vehicle3d.js';

export function VehicleHero() {
  const canvasRef = useRef(null);

  useEffect(() => {
    let handle = null;
    let cancelled = false;

    bootstrapVehicle3D({
      canvas: canvasRef.current,
      onReady: (sceneController) => {
        if (cancelled) {
          sceneController.dispose();
          return;
        }
      }
    }).then((result) => {
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

### DOM contract example

```html
<div id="scene-shell" aria-hidden="true">
  <canvas id="experience-canvas"></canvas>
</div>

<section id="prelude" class="panel"></section>
<section id="hero" class="panel"></section>
<section id="performance" class="panel"></section>
<section id="engineering" class="panel"></section>
<section id="finale" class="panel"></section>
```

```css
#scene-shell {
  position: fixed;
  inset: 0;
  pointer-events: none;
}

#experience-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.panel {
  position: relative;
  min-height: 100vh;
  z-index: 2;
}
```

## Animation Tuning Guide

Use this section after the baseline implementation is working.

The animation stack has four layers:

1. Stage normalization.
2. Section pose selection.
3. Damped interpolation toward desired values.
4. Overlay motion such as wheel spin, clip cues, and optional drift.

When something feels wrong, identify the layer first. Do not blindly tweak random numbers.

### Layer 1: Stage normalization

Relevant code:

```js
const alignedLength = Math.max(alignedSize.x, alignedSize.z);
this.modelScale = VEHICLE_CONFIG.desiredLength / alignedLength;
this.radius = VEHICLE_CONFIG.desiredLength * 0.5;
```

What it does:

- Forces different car models into a consistent staging scale.
- Makes camera values reusable.

Adjust `desiredLength` when:

- The entire car feels too big or too small across every section.

Do not use `desiredLength` when:

- Only one section framing is wrong.

### Layer 2: Section poses

Each section has:

- `camera`
- `target`
- `rotationY`
- `stageX`
- `liftY`
- `floorOffsetY`
- `exposure`
- `cues`

#### `camera`

Example:

```js
camera: { x: -0.18, y: 0.24, z: 2.04 }
```

Meaning:

- `x`: left/right orbit position.
- `y`: camera height.
- `z`: distance to subject.

Typical tuning:

- More negative `x`: stronger left hero angle.
- More positive `x`: stronger right hero angle.
- Higher `y`: more elegant showroom feel.
- Lower `z`: tighter and more aggressive crop.

#### `target`

Example:

```js
target: { x: 0, y: 0.18, z: 0 }
```

Meaning:

- The point the camera looks at.
- This is often the most powerful composition control after `camera`.

Typical tuning:

- Raise `target.y` if you want more windshield/roof emphasis.
- Move `target.x` if the hood, front door, or rear body should anchor the shot.

#### `rotationY`

Meaning:

- Rotates the vehicle itself.

Use it when:

- The layout is correct but the body angle feels unheroic.

#### `stageX`

Meaning:

- Slides the car left or right independently from the camera.

Use it when:

- The page layout needs negative space for copy.

#### `liftY`

Meaning:

- Moves the body vertically.

Use it when:

- The car should feel grounded or slightly pedestal-mounted.

#### `floorOffsetY`

Meaning:

- Moves the floor plane independently.

Use it when:

- You want to preserve the car placement but make the stage feel higher or lower.

#### `exposure`

Meaning:

- Controls tone-mapping brightness.

This is one of the strongest mood knobs. Small changes can noticeably shift the premium feel.

### Layer 3: Pose blending

Relevant code:

```js
const t = THREE.MathUtils.smootherstep(progress, 0, 1);
```

What it does:

- Converts scroll progress into a softer interpolation curve.
- Prevents hard robotic pose transitions.

If the scene feels too floaty:

- Increase damping.
- Reduce the distance between adjacent poses.

If the scene feels too rigid:

- Lower damping slightly.
- Keep `smootherstep`.

### Layer 4: Damping

Relevant knobs:

```js
this.positionDamping = 6.2;
this.rotationDamping = 5;
this.environmentDamping = 5.6;
```

Interpretation:

- `positionDamping`: camera and stage translation response.
- `rotationDamping`: body rotation catch-up.
- `environmentDamping`: lift, floor, and exposure settling.

Higher values:

- Snappier.
- More UI-like.

Lower values:

- Heavier.
- More cinematic.
- Easier to make mushy if pushed too far.

## Wheel Spin Tuning

Relevant code:

```js
const spinStep = this.wheelSpinSpeed * Math.min(delta, 1 / 45);
this.wheelSpinQuaternion.setFromAxisAngle(wheelSpinAxis, this.wheelSpinAngle);
```

Important rule:

- Wheel spin sells continuous energy during scroll.

Tune:

- Increase `wheelSpinSpeed` for a more energized scene.
- Decrease it for a slower luxury feel.

If wheels do not move:

1. Log candidate node names.
2. Confirm the regex matches the real wheel parents.
3. Confirm the axis is correct.
4. Confirm clip playback is not overwriting wheel transforms after spin is applied.

## GLTF Clip Cue Tuning

Relevant code:

```js
action.timeScale = VEHICLE_CONFIG.cueSpeedMultiplier;
action.play();
```

Tune:

- `cueSpeedMultiplier` if clip motion feels sluggish or frantic.
- Section cue arrays if the wrong clip is tied to the wrong story beat.

If cue names are wrong:

- Dump `gltf.animations.map((clip) => clip.name)`
- Fix config
- Do not guess

## Idle Drift Tuning

Relevant code:

```js
Math.sin(elapsed * VEHICLE_CONFIG.hoverSpeed) * (this.radius * VEHICLE_CONFIG.hoverAmplitude)
```

Meaning:

- Adds subtle showroom drift.

Use carefully:

- Too much drift makes the car feel toy-like.
- Premium automotive scenes often need almost none.

## Reduced Motion

Relevant code:

```js
const progress = profile.reducedMotion ? (self.progress >= 0.5 ? 1 : 0) : self.progress;
```

Meaning:

- Users with reduced motion get stepped transitions instead of constant blended movement.

Do not remove without an accessibility reasoned alternative.

## Postprocessing

Only use bloom and extra passes when device headroom allows it.

If the scene looks washed out:

- Lower exposure first
- Re-check bloom strength
- Re-check fill/rim intensities

Do not immediately remove all postprocessing unless profiling shows it is the real bottleneck.

## Safe Tuning Order

When adapting a new car model, use this order:

1. Optimize the asset if needed.
2. Fix scale with `desiredLength`.
3. Fix wheel root matching.
4. Fix wheel spin axis.
5. Fix clip names.
6. Tune section camera values.
7. Tune section targets.
8. Tune body rotation and stage offset.
9. Tune exposure.
10. Tune damping.
11. Tune optional drift and postprocessing.

This avoids masking one problem with another.

## Asset Optimization Playbook

Use this section whenever the incoming GLB is larger than `5MB`, or when animation smoothness is unstable on mid-tier hardware.

### Goal

Reduce load cost and runtime stress before the model reaches the animation layer.

### Why the `5MB` gate exists

Large GLBs usually imply one or more of these:

- Oversized textures
- Uncompressed geometry
- Excessive draw calls
- Dense meshes that the real camera distance does not need

This skill treats `5MB` as the point where optimization stops being optional.

### Required first step

Measure the asset:

```bash
node skills/threejs-car-animation-transfer/scripts/check-glb-size.mjs src/assets/models/car.glb
```

If the result is `OVER_LIMIT`, optimize before integration.

### Install the toolchain

```bash
npm install -D @gltf-transform/cli
```

### Inspect before changing anything

```bash
npx gltf-transform inspect src/assets/models/car.glb
```

Capture:

- File size
- Largest texture dimensions
- Mesh count
- Primitive count
- Animation clip count
- Existing compression extensions

### Preferred compression strategy

This skill prefers Meshopt because the runtime code already expects:

```js
loader.setMeshoptDecoder(MeshoptDecoder);
```

That keeps the transfer path coherent.

### Baseline pipeline

Step 1: geometry compression

```bash
npx gltf-transform meshopt src/assets/models/car.glb src/assets/models/car.meshopt.glb --level medium
```

Step 2: texture conversion

```bash
npx gltf-transform webp src/assets/models/car.meshopt.glb src/assets/models/car.optimized.glb
```

Step 3: inspect again

```bash
npx gltf-transform inspect src/assets/models/car.optimized.glb
```

### If the model is still too heavy

Resize textures:

```bash
npx gltf-transform resize src/assets/models/car.optimized.glb src/assets/models/car.optimized-2k.glb --width 2048 --height 2048
```

Inspect again:

```bash
npx gltf-transform inspect src/assets/models/car.optimized-2k.glb
```

If still too large, repeat at `1024` after visual QA.

### Visual QA after optimization

Check:

- Door seams still align
- Body reflections still look clean
- Wheel silhouettes are not obviously faceted
- Glass and painted surfaces do not show ugly texture artifacts
- Hero shots still feel premium
- Clip playback still works

### Performance QA after optimization

Check:

- Load is faster
- Scroll hitching is reduced
- Animation mixer playback stays stable
- Lower-power devices are less stressed
- Mobile still renders a centered car with wheel spin

### Reject an optimization pass when

- Chrome body panels visibly lose curvature
- Tire silhouette becomes angular in hero framing
- Important animation pivots break
- Texture artifacts become obvious at the intended viewing distance

The target is not the smallest file. The target is the best quality-per-byte result for the real scene.

## Deployment Rules

- If the app deploys under a subpath, set the Vite `base`.
- Always resolve the GLB with `new URL(..., import.meta.url).href`.
- Do not hardcode `/assets/...` for the model path.

## Validation Checklist

After transfer, verify all of the following:

1. The optimized GLB is at or below budget, or has a documented exception.
2. `sceneController.wheelSpinTargets.length` matches the expected wheel count.
3. Logged wheel target names match the real wheel parent objects.
4. Clip names in config actually exist in `gltf.animations`.
5. `npm run build` passes.
6. The canvas is nonblank.
7. The car is centered.
8. All wheels rotate.
9. Scroll sections change pose and cues smoothly.
10. Route unmount or teardown does not leave a live RAF loop.
11. Route unmount or teardown does not leave orphaned `ScrollTrigger`s.

If any validation step fails, do not call the transfer complete.
