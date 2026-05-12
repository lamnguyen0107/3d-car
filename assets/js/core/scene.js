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
import { BRAND_CONFIG } from '../config/brand.config.js';
import { STORY_CONFIG } from '../config/story.config.js';

const MODEL_URL = new URL('../../models/car.glb', import.meta.url).href;
const WHEEL_ROOT_PATTERN = /^rim_235(?:\.?\d{3})?$/;
const WHEEL_SPIN_AXIS = new THREE.Vector3(1, 0, 0);

export class SceneController {
  constructor({ canvas, profile, onProgress }) {
    this.canvas = canvas;
    this.profile = profile;
    this.onProgress = onProgress;
    this.clock = new THREE.Clock();
    this.isVisible = true;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.01, 500);
    this.cameraPosition = new THREE.Vector3();
    this.cameraTarget = new THREE.Vector3();
    this.desiredCameraPosition = new THREE.Vector3();
    this.desiredCameraTarget = new THREE.Vector3();
    this.baseTarget = new THREE.Vector3();

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: !this.profile.lowPower && !this.profile.usePostprocessing,
      alpha: true,
      powerPreference: 'high-performance'
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.currentExposure = STORY_CONFIG.sections[0].exposure;
    this.desiredExposure = STORY_CONFIG.sections[0].exposure;
    this.renderer.toneMappingExposure = this.currentExposure;
    this.renderer.shadowMap.enabled = this.profile.shadowsEnabled;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.viewportWidth = 0;
    this.viewportHeight = 0;
    this.performanceLiteApplied = this.profile.lowPower || this.profile.saveData;
    this.performanceFrameTimes = [];
    this.performanceSampleLimit = this.profile.adaptiveQuality.sampleFrames;
    this.performanceFrameBudget = this.profile.adaptiveQuality.targetFrameMs / 1000;
    this.performanceFallbackPixelRatio = this.profile.adaptiveQuality.fallbackPixelRatio;

    this.modelGroup = new THREE.Group();
    this.carRoot = new THREE.Group();
    this.scene.add(this.modelGroup);
    this.modelGroup.add(this.carRoot);
    this.baseRotationY = BRAND_CONFIG.model.baseRotationY;
    this.desiredRotationY = this.baseRotationY;
    this.desiredStageX = 0;
    this.currentLiftY = BRAND_CONFIG.model.liftY;
    this.desiredLiftY = BRAND_CONFIG.model.liftY;
    this.floorBaseY = -0.02;
    this.visualFloorY = -0.02;
    this.glowBaseOffsetY = -0.022;
    this.haloOffsetY = 0.004;
    this.contactShadowOffsetY = 0.003;
    this.currentFloorY = this.floorBaseY;
    this.desiredFloorY = this.floorBaseY;
    this.positionDamping = this.profile.reducedMotion ? 28 : this.profile.lowPower ? 5.2 : 6.2;
    this.rotationDamping = this.profile.reducedMotion ? 24 : this.profile.lowPower ? 4.4 : 5;
    this.environmentDamping = this.profile.reducedMotion ? 24 : this.profile.lowPower ? 4.8 : 5.6;

    this.mixer = null;
    this.actions = new Map();
    this.animatedActions = new Set();
    this.playedCues = new Set();
    this.restTransforms = new Map();
    this.cueSpeedMultiplier = 1.2;
    this.radius = 1;
    this.groundY = 0;
    this.modelScale = 1;
    this.composer = null;
    this.fxaaPass = null;
    this.wheelSpinTargets = [];
    this.wheelSpinAngle = 0;
    this.wheelSpinQuaternion = new THREE.Quaternion();
    this.wheelSpinSpeed = profile.reducedMotion
      ? 0
      : BRAND_CONFIG.model.wheelSpinSpeed * (profile.lowPower ? 0.55 : 1);
    this.keyLight = null;

    this.bindVisibility();
    this.setupScene();
  }

  setFloorStackY(floorY, stageX = this.carRoot.position.x) {
    if (this.floor) this.floor.position.set(stageX, floorY, 0);
    if (this.contactShadow) this.contactShadow.position.set(stageX, floorY + this.contactShadowOffsetY, 0);
    if (this.glowBase) {
      this.glowBase.position.set(stageX, floorY + this.glowBaseOffsetY, 0);
    }
    if (this.halo) {
      this.halo.position.set(stageX, floorY + this.haloOffsetY, 0);
    }
  }

  bindVisibility() {
    document.addEventListener('visibilitychange', () => {
      this.isVisible = !document.hidden;
      this.clock.getDelta();
    });
  }

  setupScene() {
    this.scene.background = new THREE.Color(BRAND_CONFIG.palette.background);
    this.scene.fog = new THREE.Fog(BRAND_CONFIG.palette.background, 10, 26);

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    const envMap = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = envMap;
    pmremGenerator.dispose();

    const ambient = new THREE.HemisphereLight(0xffe4dd, 0x150708, 1.8);
    const key = new THREE.DirectionalLight(0xfff0eb, 4.8);
    key.position.set(6, 5, 5);
    key.castShadow = this.profile.shadowsEnabled;
    key.shadow.mapSize.set(this.profile.shadowMapSize, this.profile.shadowMapSize);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 30;
    key.shadow.bias = -0.0002;
    this.keyLight = key;

    const rim = new THREE.PointLight(0xff6f5e, 18, 48, 2.2);
    rim.position.set(-4, 2, -5);

    const fill = new THREE.PointLight(0xffb4a8, 14, 32, 2.2);
    fill.position.set(4, 1.5, 4.5);

    const glowBaseTexture = this.createFloorGlowTexture();
    const glowBase = new THREE.Mesh(
      new THREE.CircleGeometry(4.2, 64),
      new THREE.MeshBasicMaterial({
        map: glowBaseTexture,
        transparent: true,
        opacity: 0.624,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
        fog: false,
        toneMapped: false
      })
    );
    glowBase.rotation.x = -Math.PI / 2;
    glowBase.position.y = this.visualFloorY + this.glowBaseOffsetY;
    glowBase.renderOrder = 1;

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(5.8, 64),
      new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.3 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = this.floorBaseY;
    floor.receiveShadow = this.profile.shadowsEnabled;
    floor.renderOrder = 2;

    const contactShadowTexture = this.createContactShadowTexture();
    const contactShadow = new THREE.Mesh(
      new THREE.CircleGeometry(3.8, 64),
      new THREE.MeshBasicMaterial({
        map: contactShadowTexture,
        transparent: true,
        opacity: 0.66,
        depthWrite: false,
        depthTest: true,
        fog: false,
        toneMapped: false
      })
    );
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = this.floorBaseY + this.contactShadowOffsetY;
    contactShadow.scale.set(1.24, 1, 0.7);
    contactShadow.renderOrder = 3;

    const haloTexture = this.createHaloTexture();
    const halo = new THREE.Mesh(
      new THREE.CircleGeometry(3.2, 64),
      new THREE.MeshBasicMaterial({
        map: haloTexture,
        transparent: true,
        opacity: 0.234,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
        fog: false,
        toneMapped: false
      })
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = this.visualFloorY + this.haloOffsetY;
    halo.renderOrder = 4;

    this.glowBase = glowBase;
    this.floor = floor;
    this.contactShadow = contactShadow;
    this.halo = halo;
    this.scene.add(ambient, key, rim, fill, glowBase, floor, contactShadow, halo);

    if (this.profile.usePostprocessing) {
      this.setupPostprocessing();
    }
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

  createHaloTexture() {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(
      size / 2,
      size / 2,
      size * 0.04,
      size / 2,
      size / 2,
      size * 0.5
    );
    gradient.addColorStop(0, 'rgba(255,111,94,0.52)');
    gradient.addColorStop(0.18, 'rgba(255,111,94,0.16)');
    gradient.addColorStop(0.52, 'rgba(255,111,94,0.03)');
    gradient.addColorStop(1, 'rgba(255,111,94,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  createFloorGlowTexture() {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(
      size / 2,
      size / 2,
      size * 0.04,
      size / 2,
      size / 2,
      size * 0.42
    );
    gradient.addColorStop(0, 'rgba(255,118,104,0.5)');
    gradient.addColorStop(0.16, 'rgba(232,64,48,0.24)');
    gradient.addColorStop(0.34, 'rgba(116,16,18,0.08)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  createContactShadowTexture() {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(
      size / 2,
      size / 2,
      size * 0.08,
      size / 2,
      size / 2,
      size * 0.5
    );
    gradient.addColorStop(0, 'rgba(0,0,0,0.62)');
    gradient.addColorStop(0.28, 'rgba(0,0,0,0.28)');
    gradient.addColorStop(0.6, 'rgba(0,0,0,0.1)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  setupWheelSpin(model) {
    this.wheelSpinTargets = [];

    model.traverse((child) => {
      if (WHEEL_ROOT_PATTERN.test(child.name)) {
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

    this.wheelSpinQuaternion.setFromAxisAngle(WHEEL_SPIN_AXIS, this.wheelSpinAngle);

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
      if (!total) return;
      this.onProgress(loaded / total);
    };

    const loader = new GLTFLoader(manager);
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(MODEL_URL);
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
        if ('metalness' in child.material) {
          child.material.metalness = Math.min(1, child.material.metalness + 0.05);
        }
        if ('roughness' in child.material) {
          child.material.roughness = Math.max(0.05, child.material.roughness * 0.82);
        }
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

    const sortedX = meshEntries.map((entry) => entry.center.x).sort((a, b) => a - b);
    const sortedY = meshEntries.map((entry) => entry.center.y).sort((a, b) => a - b);
    const sortedZ = meshEntries.map((entry) => entry.center.z).sort((a, b) => a - b);
    const middleIndex = Math.floor(meshEntries.length / 2);
    const focusMedian = new THREE.Vector3(
      sortedX[middleIndex],
      sortedY[middleIndex],
      sortedZ[middleIndex]
    );

    const focusBox = new THREE.Box3();
    const focusThreshold = 10;
    let focusMeshCount = 0;

    meshEntries.forEach((entry) => {
      const inFocusCluster = entry.center.distanceTo(focusMedian) <= focusThreshold;
      entry.mesh.visible = inFocusCluster;
      if (!inFocusCluster) return;
      focusBox.union(entry.box);
      focusMeshCount += 1;
    });

    const alignedBox =
      focusMeshCount > 0 ? focusBox : new THREE.Box3().setFromObject(model);
    const alignedSize = alignedBox.getSize(new THREE.Vector3());
    const alignedCenter = alignedBox.getCenter(new THREE.Vector3());
    const alignedLength = Math.max(alignedSize.x, alignedSize.z);
    const desiredLength = 4.8;
    this.modelScale = desiredLength / alignedLength;
    this.radius = desiredLength * 0.5;

    const modelScaleWrap = new THREE.Group();
    model.position.set(-alignedCenter.x, -alignedBox.min.y, -alignedCenter.z);
    modelScaleWrap.scale.setScalar(this.modelScale);
    modelScaleWrap.add(model);
    this.carRoot.add(modelScaleWrap);
    modelScaleWrap.updateMatrixWorld(true);

    const scaledBox = new THREE.Box3().setFromObject(modelScaleWrap);
    const scaledSize = scaledBox.getSize(new THREE.Vector3());
    this.groundY = scaledBox.min.y;

    this.carRoot.rotation.y = this.baseRotationY;
    this.carRoot.position.y = BRAND_CONFIG.model.liftY;

    const bodyHeight = scaledSize.y;
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

    this.snapToPose(this.getSectionPose(STORY_CONFIG.sections[0]));
  }

  getSectionPose(section) {
    return {
      cameraX: section.camera.x * this.radius,
      cameraY: section.camera.y * this.radius,
      cameraZ: section.camera.z * this.radius,
      targetX: section.target.x * this.radius,
      targetY: section.target.y * this.radius,
      targetZ: section.target.z * this.radius,
      rotationY: this.baseRotationY + section.rotationY,
      exposure: section.exposure,
      stageX: (section.stageX || 0) * this.radius,
      liftY: section.liftY ?? BRAND_CONFIG.model.liftY,
      floorY: this.floorBaseY + (section.floorOffsetY ?? 0)
    };
  }

  mixPoses(fromPose, toPose, progress) {
    const t = THREE.MathUtils.smootherstep(progress, 0, 1);
    return {
      cameraX: THREE.MathUtils.lerp(fromPose.cameraX, toPose.cameraX, t),
      cameraY: THREE.MathUtils.lerp(fromPose.cameraY, toPose.cameraY, t),
      cameraZ: THREE.MathUtils.lerp(fromPose.cameraZ, toPose.cameraZ, t),
      targetX: THREE.MathUtils.lerp(fromPose.targetX, toPose.targetX, t),
      targetY: THREE.MathUtils.lerp(fromPose.targetY, toPose.targetY, t),
      targetZ: THREE.MathUtils.lerp(fromPose.targetZ, toPose.targetZ, t),
      rotationY: THREE.MathUtils.lerp(fromPose.rotationY, toPose.rotationY, t),
      exposure: THREE.MathUtils.lerp(fromPose.exposure, toPose.exposure, t),
      stageX: THREE.MathUtils.lerp(fromPose.stageX, toPose.stageX, t),
      liftY: THREE.MathUtils.lerp(fromPose.liftY, toPose.liftY, t),
      floorY: THREE.MathUtils.lerp(fromPose.floorY, toPose.floorY, t)
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
    this.setFloorStackY(pose.floorY, pose.stageX);
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
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, this.profile.pixelRatioCap);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);

    if (this.composer) {
      this.composer.setSize(width, height);
      if (this.fxaaPass) {
        this.fxaaPass.material.uniforms.resolution.value.x = 1 / (width * pixelRatio);
        this.fxaaPass.material.uniforms.resolution.value.y = 1 / (height * pixelRatio);
      }
    }
  }

  applyAdaptiveQualityFallback() {
    if (this.performanceLiteApplied) return;

    this.performanceLiteApplied = true;
    this.profile.lowPower = true;
    this.profile.usePostprocessing = false;
    this.profile.shadowsEnabled = false;
    this.profile.allowIdleDrift = false;
    this.profile.pixelRatioCap = Math.min(
      this.profile.pixelRatioCap,
      this.performanceFallbackPixelRatio
    );

    document.body.classList.add('is-performance-lite');

    this.renderer.shadowMap.enabled = false;
    if (this.keyLight) this.keyLight.castShadow = false;
    if (this.floor) this.floor.receiveShadow = false;

    if (this.composer?.dispose) {
      this.composer.dispose();
    }

    this.composer = null;
    this.fxaaPass = null;
    this.setViewport(this.viewportWidth || window.innerWidth, this.viewportHeight || window.innerHeight);
  }

  samplePerformance(delta) {
    if (this.performanceLiteApplied || this.profile.reducedMotion) return;

    this.performanceFrameTimes.push(delta);
    if (this.performanceFrameTimes.length < this.performanceSampleLimit) return;

    const averageFrameTime =
      this.performanceFrameTimes.reduce((sum, frameTime) => sum + frameTime, 0) /
      this.performanceFrameTimes.length;
    const slowFrameCount = this.performanceFrameTimes.filter(
      (frameTime) => frameTime > this.performanceFrameBudget
    ).length;

    this.performanceFrameTimes.length = 0;

    if (
      averageFrameTime > this.performanceFrameBudget ||
      slowFrameCount >= this.performanceSampleLimit * 0.35
    ) {
      this.applyAdaptiveQualityFallback();
    }
  }

  playCue(name) {
    if (!name || !this.actions.has(name) || this.playedCues.has(name)) return;
    const action = this.actions.get(name);
    action.reset();
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
    action.timeScale = this.cueSpeedMultiplier;
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

    if (this.mixer) {
      this.mixer.stopAllAction();
    }

    this.animatedActions.clear();
    this.playedCues.clear();
    this.restoreRestPose();

    cues.forEach((cue) => this.playCue(cue));
  }

  update() {
    if (!this.isVisible) return;

    const delta = this.clock.getDelta();
    const elapsed = this.clock.elapsedTime;
    this.samplePerformance(delta);

    if (this.profile.allowIdleDrift) {
      this.modelGroup.position.y =
        Math.sin(elapsed * BRAND_CONFIG.model.hoverSpeed) *
        (this.radius * BRAND_CONFIG.model.hoverAmplitude);
    } else {
      this.modelGroup.position.y = 0;
    }

    if (this.mixer) {
      this.mixer.update(delta);
      for (const action of [...this.animatedActions]) {
        if (!action.isRunning()) this.animatedActions.delete(action);
      }
    }

    this.updateWheelSpin(delta);

    this.cameraPosition.x = THREE.MathUtils.damp(
      this.cameraPosition.x,
      this.desiredCameraPosition.x,
      this.positionDamping,
      delta
    );
    this.cameraPosition.y = THREE.MathUtils.damp(
      this.cameraPosition.y,
      this.desiredCameraPosition.y,
      this.positionDamping,
      delta
    );
    this.cameraPosition.z = THREE.MathUtils.damp(
      this.cameraPosition.z,
      this.desiredCameraPosition.z,
      this.positionDamping,
      delta
    );

    this.cameraTarget.x = THREE.MathUtils.damp(
      this.cameraTarget.x,
      this.desiredCameraTarget.x,
      this.positionDamping,
      delta
    );
    this.cameraTarget.y = THREE.MathUtils.damp(
      this.cameraTarget.y,
      this.desiredCameraTarget.y,
      this.positionDamping,
      delta
    );
    this.cameraTarget.z = THREE.MathUtils.damp(
      this.cameraTarget.z,
      this.desiredCameraTarget.z,
      this.positionDamping,
      delta
    );

    this.carRoot.rotation.y = THREE.MathUtils.damp(
      this.carRoot.rotation.y,
      this.desiredRotationY,
      this.rotationDamping,
      delta
    );
    this.carRoot.position.x = THREE.MathUtils.damp(
      this.carRoot.position.x,
      this.desiredStageX,
      this.positionDamping,
      delta
    );
    this.currentLiftY = THREE.MathUtils.damp(
      this.currentLiftY,
      this.desiredLiftY,
      this.environmentDamping,
      delta
    );
    this.carRoot.position.y = this.currentLiftY;
    this.currentFloorY = THREE.MathUtils.damp(
      this.currentFloorY,
      this.desiredFloorY,
      this.environmentDamping,
      delta
    );
    this.setFloorStackY(this.currentFloorY, this.carRoot.position.x);
    this.currentExposure = THREE.MathUtils.damp(
      this.currentExposure,
      this.desiredExposure,
      this.environmentDamping,
      delta
    );
    this.renderer.toneMappingExposure = this.currentExposure;

    this.camera.position.copy(this.cameraPosition);
    this.camera.lookAt(this.cameraTarget);

    if (this.composer) {
      this.composer.render();
      return;
    }

    this.renderer.render(this.scene, this.camera);
  }
}
