import { BRAND_CONFIG } from '../config/brand.config.js';

const LOADING_STATES = [
  'Ignition sequence',
  'Charging aero maps',
  'Syncing telemetry',
  'Vectoring wheelbase',
  'Redline ready'
];
const LOADING_EPSILON = 0.001;
const LOADING_SMOOTHING = 10;

let loadingAnimationFrame = 0;
let loadingDisplayProgress = 0;
let loadingTargetProgress = 0;
let loadingLastTimestamp = 0;

export function applyBrandContent() {
  document.title = `${BRAND_CONFIG.brandName} | ${BRAND_CONFIG.modelName}`;

  document.querySelectorAll('[data-brand-name]').forEach((node) => {
    node.textContent = BRAND_CONFIG.brandName;
  });

  document.querySelectorAll('[data-model-name]').forEach((node) => {
    node.textContent = BRAND_CONFIG.modelName;
  });

  document.querySelectorAll('[data-primary-cta]').forEach((node) => {
    node.textContent = BRAND_CONFIG.primaryCta;
  });

  const heroLine = document.querySelector('[data-hero-line]');
  const heroSubline = document.querySelector('[data-hero-subline]');

  if (heroLine) heroLine.textContent = BRAND_CONFIG.heroLine;
  if (heroSubline) heroSubline.textContent = BRAND_CONFIG.heroSubline;

  const root = document.documentElement;
  root.style.setProperty('--color-bg', BRAND_CONFIG.palette.background);
  root.style.setProperty('--color-bg-elevated', BRAND_CONFIG.palette.backgroundElevated);
  root.style.setProperty('--color-surface', BRAND_CONFIG.palette.surface);
  root.style.setProperty('--color-surface-border', BRAND_CONFIG.palette.surfaceBorder);
  root.style.setProperty('--color-text', BRAND_CONFIG.palette.text);
  root.style.setProperty('--color-muted', BRAND_CONFIG.palette.muted);
  root.style.setProperty('--color-accent', BRAND_CONFIG.palette.accent);
  root.style.setProperty('--color-accent-soft', BRAND_CONFIG.palette.accentSoft);
  root.style.setProperty('--color-accent-strong', BRAND_CONFIG.palette.accentStrong);
  root.style.setProperty('--shadow-glow', BRAND_CONFIG.palette.shadowGlow);
}

function renderLoadingProgress(value) {
  const clamped = Math.min(1, Math.max(0, value));
  const bar = document.getElementById('loading-bar');
  const needle = document.getElementById('loading-needle');
  const valueNode = document.getElementById('loading-value');
  const percentNode = document.getElementById('loading-percent');
  const statusNode = document.getElementById('loading-status-label');
  const loadingScreen = document.getElementById('loading-screen');
  const percentage = Math.round(clamped * 100);
  const speed = Math.round(clamped * 340);
  const rotation = -112 + clamped * 224;
  const stateIndex = Math.min(
    LOADING_STATES.length - 1,
    Math.floor(clamped * LOADING_STATES.length)
  );

  document.documentElement.style.setProperty('--loading-progress', String(clamped));

  if (bar) bar.style.width = `${percentage}%`;
  if (needle) needle.style.transform = `translate(-50%, -100%) rotate(${rotation}deg)`;
  if (valueNode) valueNode.textContent = String(speed).padStart(3, '0');
  if (percentNode) percentNode.textContent = `${String(percentage).padStart(2, '0')}%`;
  if (statusNode) statusNode.textContent = LOADING_STATES[stateIndex];
  if (loadingScreen) {
    loadingScreen.setAttribute(
      'aria-label',
      `${LOADING_STATES[stateIndex]} ${percentage}%`
    );
  }
}

function animateLoadingProgress(timestamp) {
  if (!loadingLastTimestamp) {
    loadingLastTimestamp = timestamp;
  }

  const deltaSeconds = Math.min((timestamp - loadingLastTimestamp) / 1000, 0.12);
  const isReducedMotion = document.body.classList.contains('is-reduced-motion');
  const interpolation = isReducedMotion ? 1 : 1 - Math.exp(-deltaSeconds * LOADING_SMOOTHING);

  loadingLastTimestamp = timestamp;
  loadingDisplayProgress += (loadingTargetProgress - loadingDisplayProgress) * interpolation;

  if (Math.abs(loadingTargetProgress - loadingDisplayProgress) <= LOADING_EPSILON) {
    loadingDisplayProgress = loadingTargetProgress;
    renderLoadingProgress(loadingDisplayProgress);
    loadingAnimationFrame = 0;
    loadingLastTimestamp = 0;
    return;
  }

  renderLoadingProgress(loadingDisplayProgress);
  loadingAnimationFrame = window.requestAnimationFrame(animateLoadingProgress);
}

export function setLoadingProgress(value) {
  loadingTargetProgress = Math.max(loadingTargetProgress, Math.min(1, Math.max(0, value)));

  if (!loadingAnimationFrame) {
    loadingAnimationFrame = window.requestAnimationFrame(animateLoadingProgress);
  }
}

export function hideLoadingScreen() {
  const loadingScreen = document.getElementById('loading-screen');
  if (!loadingScreen) return;

  setLoadingProgress(1);
  document.body.classList.add('is-ready');

  const hideDelay = document.body.classList.contains('is-reduced-motion') ? 80 : 320;
  window.setTimeout(() => {
    loadingScreen.classList.add('is-hidden');
  }, hideDelay);
}

export function showSceneFallback(message) {
  document.body.classList.add('scene-failed');

  const fallback = document.getElementById('scene-fallback');
  if (fallback) {
    fallback.hidden = false;
    const paragraph = fallback.querySelector('p:last-child');
    if (paragraph && message) paragraph.textContent = message;
  }
}

export function showSceneDebug(detail) {
  if (!detail) return;

  const fallback = document.getElementById('scene-fallback');
  if (!fallback) return;

  let debug = fallback.querySelector('[data-scene-debug]');
  if (!debug) {
    debug = document.createElement('pre');
    debug.setAttribute('data-scene-debug', 'true');
    debug.style.margin = '0.9rem 0 0';
    debug.style.paddingTop = '0.9rem';
    debug.style.borderTop = '1px solid rgba(255,255,255,0.08)';
    debug.style.whiteSpace = 'pre-wrap';
    debug.style.wordBreak = 'break-word';
    debug.style.fontSize = '0.78rem';
    debug.style.lineHeight = '1.5';
    debug.style.color = 'rgba(214,248,255,0.8)';
    fallback.querySelector('.scene-fallback__panel')?.appendChild(debug);
  }

  debug.textContent = detail;
}

export function markMotionProfile(reducedMotion) {
  document.body.classList.toggle('is-reduced-motion', reducedMotion);
}

export function markPerformanceLite(enabled) {
  document.body.classList.toggle('is-performance-lite', Boolean(enabled));
}
