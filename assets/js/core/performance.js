import { PERFORMANCE_CONFIG } from '../config/performance.config.js';

function getMemoryGb() {
  return navigator.deviceMemory || PERFORMANCE_CONFIG.thresholds.lowMemoryGb;
}

function getThreads() {
  return navigator.hardwareConcurrency || PERFORMANCE_CONFIG.thresholds.lowThreads;
}

export function getPerformanceProfile() {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = navigator.connection?.saveData || false;
  const width = window.innerWidth;
  const memoryGb = getMemoryGb();
  const threads = getThreads();
  const isMobile = width <= PERFORMANCE_CONFIG.breakpoints.mobile;
  const isTablet =
    width > PERFORMANCE_CONFIG.breakpoints.mobile &&
    width <= PERFORMANCE_CONFIG.breakpoints.tablet;
  const lowPower =
    saveData ||
    memoryGb <= PERFORMANCE_CONFIG.thresholds.lowMemoryGb ||
    threads <= PERFORMANCE_CONFIG.thresholds.lowThreads;
  const highHeadroom =
    memoryGb >= PERFORMANCE_CONFIG.thresholds.highMemoryGb &&
    threads >= PERFORMANCE_CONFIG.thresholds.highThreads;

  let pixelRatioCap = PERFORMANCE_CONFIG.dprCaps.desktop;
  if (isMobile) pixelRatioCap = PERFORMANCE_CONFIG.dprCaps.mobile;
  if (isTablet) pixelRatioCap = PERFORMANCE_CONFIG.dprCaps.tablet;
  if (lowPower) pixelRatioCap = Math.min(pixelRatioCap, PERFORMANCE_CONFIG.dprCaps.lowPower);

  const usePostprocessing =
    !reducedMotion &&
    !lowPower &&
    highHeadroom &&
    !isMobile &&
    width >= PERFORMANCE_CONFIG.breakpoints.postprocessingDesktop;

  const shadowsEnabled = !isMobile && !saveData && !lowPower;
  const shadowMapSize = isTablet || lowPower
    ? PERFORMANCE_CONFIG.shadows.tabletMapSize
    : PERFORMANCE_CONFIG.shadows.desktopMapSize;

  return {
    reducedMotion,
    saveData,
    isMobile,
    isTablet,
    lowPower,
    highHeadroom,
    usePostprocessing,
    useExtraBloom: false,
    allowIdleDrift:
      PERFORMANCE_CONFIG.motion.allowIdleDrift && !reducedMotion && !lowPower && !isMobile,
    pixelRatioCap,
    shadowsEnabled,
    shadowMapSize,
    adaptiveQuality: { ...PERFORMANCE_CONFIG.adaptiveQuality }
  };
}
