export const PERFORMANCE_CONFIG = {
  breakpoints: {
    mobile: 720,
    tablet: 1080,
    postprocessingDesktop: 1600
  },
  dprCaps: {
    mobile: 1,
    tablet: 1,
    desktop: 1,
    lowPower: 0.85
  },
  motion: {
    textStagger: 0.08,
    allowIdleDrift: false
  },
  shadows: {
    desktopMapSize: 1024,
    tabletMapSize: 768
  },
  thresholds: {
    lowMemoryGb: 4,
    lowThreads: 6,
    highMemoryGb: 8,
    highThreads: 8
  },
  adaptiveQuality: {
    sampleFrames: 90,
    targetFrameMs: 20.5,
    fallbackPixelRatio: 0.85
  }
};
