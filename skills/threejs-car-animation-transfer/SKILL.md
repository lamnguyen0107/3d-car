---
name: threejs-car-animation-transfer
description: Port a Three.js GLB car scene into another web project with cinematic lighting, scroll-driven camera poses, GLTF animation cues, fast wheel rotation, responsive viewport handling, and Vite-friendly asset loading. Use when transferring the 3d-car vehicle animation system, adapting a sports car GLB model, debugging wheel spin selectors, or rebuilding the animation in a vanilla JS, Vite, or React frontend.
---

# Three.js Car Animation Transfer

## Overview

Use this skill to transfer the `3d-car` animation pattern into another frontend project. The core pattern is:

- Load a GLB vehicle with `GLTFLoader` and `MeshoptDecoder`.
- Normalize the model to a predictable stage size.
- Store every object's rest transform.
- Spin wheel root nodes every frame with a quaternion layered over the rest pose.
- Play named GLTF animation clips as scroll cues.
- Interpolate camera, target, car rotation, stage offset, lift, and exposure by section.

## Transfer Checklist

1. Install dependencies:

```bash
npm install three gsap
```

2. Put the GLB at a bundler-managed path, for example:

```txt
src/assets/models/car.glb
```

3. Add a full-screen canvas:

```html
<canvas id="experience-canvas"></canvas>
```

4. Keep these files together:

```txt
src/vehicle3d/vehicle3d.config.js
src/vehicle3d/performance-profile.js
src/vehicle3d/vehicle-scene.js
src/vehicle3d/scroll-narrative.js
src/vehicle3d/bootstrap-vehicle3d.js
```

5. Verify the GLB exposes wheel roots. For the original model, the wheel roots are matched by:

```js
/^rim_235(?:\.?\d{3})?$/
```

This matches both raw GLB names like `rim_235.001` and Three.js-normalized names like `rim_235001`.

## Configuration

Create `vehicle3d.config.js`:

```js
export const VEHICLE_CONFIG = {
  modelUrl: new URL('../assets/models/car.glb', import.meta.url).href,
  wheelRootPattern: /^rim_235(?:\.?\d{3})?$/,
  wheelSpinAxis: [1, 0, 0],
  wheelSpinSpeed: Math.PI * 8,
  desiredLength: 4.8,
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
    // Add performance, engineering, and finale sections using the same shape.
    // Each section can define: id, camera, target, rotationY, stageX, liftY,
    // floorOffsetY, exposure, and optional GLTF animation cue names.
  ]
};
```

Create `performance-profile.js`:

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

  return {
    reducedMotion,
    saveData,
    isMobile,
    isTablet,
    lowPower,
    highHeadroom,
    pixelRatioCap: lowPower ? 0.85 : isMobile || isTablet ? 1 : 1,
    shadowsEnabled: !isMobile && !saveData && !lowPower,
    shadowMapSize: isTablet || lowPower ? 768 : 1024,
    usePostprocessing: !reducedMotion && !lowPower && highHeadroom && !isMobile && width >= 1600,
    allowIdleDrift: false
  };
}
```

## Scene Controller

Create `vehicle-scene.js`. This is the portable core; keep the wheel-spin methods together with `restTransforms`.

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
    this.currentExposure = VEHICLE_CONFIG.sections[0].exposure;
    this.desiredExposure = this.currentExposure;
    this.desiredRotationY = VEHICLE_CONFIG.baseRotationY;
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
    document.addEventListener('visibilitychange', () => {
      this.isVisible = !document.hidden;
      this.clock.getDelta();
    });
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

  async loadModel() {
    const manager = new THREE.LoadingManager();
    manager.onProgress = (_, loaded, total) => {
      if (total) this.onProgress(loaded / total);
    };

    const loader = new GLTFLoader(manager);
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(VEHICLE_CONFIG.modelUrl);
    this.onProgress(1);

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
      meshEntries.push({ mesh: child, box: new THREE.Box3(), center: new THREE.Vector3() });
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

    this.snapToPose(this.getSectionPose(VEHICLE_CONFIG.sections[0]));
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
}
```

## Scroll Narrative

Create `scroll-narrative.js`:

```js
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { VEHICLE_CONFIG } from './vehicle3d.config.js';

gsap.registerPlugin(ScrollTrigger);

export function setupVehicleScrollNarrative(sceneController, profile) {
  const sections = VEHICLE_CONFIG.sections
    .map((section) => ({ ...section, element: document.getElementById(section.id) }))
    .filter((section) => section.element);

  if (!sections.length) return;

  const poses = sections.map((section) => sceneController.getSectionPose(section));
  sceneController.snapToPose(poses[0]);
  sceneController.playCueSet(sections[0].cues || []);

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
    ScrollTrigger.create({
      trigger: section.element,
      start: index === 0 ? 'top top' : 'top 55%',
      end: 'bottom 45%',
      onEnter: () => activateSection(index),
      onEnterBack: () => activateSection(index)
    });
  });

  sections.slice(1).forEach((section, index) => {
    const fromIndex = index;
    const toIndex = index + 1;

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
    });
  });

  ScrollTrigger.refresh();
}
```

## Bootstrap

Create `bootstrap-vehicle3d.js`:

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
    setupVehicleScrollNarrative(sceneController, profile);
    onReady(sceneController);

    const render = () => {
      sceneController.update();
      requestAnimationFrame(render);
    };
    render();

    return sceneController;
  } catch (error) {
    onError(error);
    return null;
  }
}
```

Use it from the app entry:

```js
import { bootstrapVehicle3D } from './vehicle3d/bootstrap-vehicle3d.js';

bootstrapVehicle3D({
  onProgress: (value) => {
    document.body.style.setProperty('--vehicle-load-progress', value);
  },
  onReady: () => {
    document.body.classList.add('is-ready');
  }
});
```

## CSS Contract

Use a fixed, full-viewport `#scene-shell` with `pointer-events: none`, make `#experience-canvas` `width: 100%; height: 100%; display: block`, keep page content above it with a higher `z-index`, and give every scroll section at least `min-height: 100vh`.

## Porting Notes

- Keep `wheelSpinSpeed` independent from `reducedMotion` if the product requirement is "wheels must always rotate." The original fast setting is `Math.PI * 8`.
- If wheels do not rotate, first log `sceneController.wheelSpinTargets.map((node) => node.name)`. Expected count is 4 for the original model.
- If the wheel root names differ, update `wheelRootPattern`; prefer matching wheel parent objects, not tire meshes, so rim and tire rotate together.
- If wheels rotate around the wrong axis, change `wheelSpinAxis`. Common alternatives are `[0, 1, 0]` or `[0, 0, 1]`, depending on model orientation.
- If GLTF door/body animations overwrite the wheel transform, call `applyWheelSpinPose()` after rest-pose restore and after `mixer.update(delta)`.
- If the model appears too large or small, adjust `desiredLength` before tuning camera poses.
- If the page deploys under a GitHub Pages subpath, use Vite `base` and always resolve the GLB with `new URL(..., import.meta.url).href`.

## Validation

After transfer, log `sceneController.wheelSpinTargets.length`, `sceneController.wheelSpinTargets.map((node) => node.name)`, and `sceneController.wheelSpinSpeed`. For the original GLB, expect 4 targets named `rim_235`, `rim_235001`, `rim_235002`, `rim_235003`, and speed `25.132741228718345`. Run `npm run build`, open the page, and confirm the canvas is nonblank, the car is centered, all wheels rotate, and scroll sections change pose/cues.
