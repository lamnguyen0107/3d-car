import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { getPerformanceProfile } from './core/performance.js';
import { EngineAudioController } from './core/audio.js';
import {
  applyBrandContent,
  hideLoadingScreen,
  markPerformanceLite,
  markMotionProfile,
  setLoadingProgress,
  showSceneDebug,
  showSceneFallback
} from './core/ui.js';
import { SceneController } from './core/scene.js';
import { setupScrollNarrative } from './core/scroll.js';

gsap.registerPlugin(ScrollTrigger);

async function bootstrap() {
  try {
    applyBrandContent();

    const profile = getPerformanceProfile();
    markMotionProfile(profile.reducedMotion);
    markPerformanceLite(profile.lowPower || profile.saveData);
    const audioController = new EngineAudioController({
      lowPower: profile.lowPower
    });
    audioController.mount();

    const canvas = document.getElementById('experience-canvas');
    const sceneController = new SceneController({
      canvas,
      profile,
      onProgress: (value) => {
        setLoadingProgress(value);
        audioController.setLoadProgress(value);
      }
    });

    const handleResize = () => {
      sceneController.setViewport(window.innerWidth, window.innerHeight);
      ScrollTrigger.refresh();
    };

    window.addEventListener('resize', handleResize);

    await sceneController.loadModel();
    handleResize();
    setupScrollNarrative(sceneController, profile, audioController);
    audioController.markReady();
    audioController.setDriveState('prelude', 0);
    hideLoadingScreen();

    const render = () => {
      sceneController.update();
      requestAnimationFrame(render);
    };

    render();
  } catch (error) {
    const errorDetail =
      error instanceof Error
        ? `${error.name}: ${error.message}${error.stack ? `\n${error.stack}` : ''}`
        : String(error);

    console.error('Scene bootstrap failed:', errorDetail);
    hideLoadingScreen();
    showSceneFallback(
      'The 3D model could not be loaded, so the site has switched to a reduced cinematic layer while preserving the flagship narrative.'
    );
    showSceneDebug(errorDetail);
  }
}

bootstrap();
