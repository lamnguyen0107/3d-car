import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { STORY_CONFIG } from '../config/story.config.js';

gsap.registerPlugin(ScrollTrigger);

const DRIVE_MODE_LABELS = {
  prelude: 'Grid Lock',
  hero: 'Ignition',
  performance: 'Redline',
  engineering: 'Apex Craft',
  finale: 'Pit Exit'
};

function setActivePanel(sectionId) {
  document.querySelectorAll('.panel').forEach((panel) => {
    panel.classList.toggle('is-active', panel.id === sectionId);
  });

  document.body.dataset.section = sectionId;
  document.querySelectorAll('[data-drive-mode]').forEach((node) => {
    node.textContent = DRIVE_MODE_LABELS[sectionId] || 'Telemetry';
  });
}

export function setupScrollNarrative(sceneController, profile, audioController = null) {
  const sections = STORY_CONFIG.sections
    .map((section) => ({
      ...section,
      element: document.getElementById(section.id)
    }))
    .filter((section) => section.element);

  if (!sections.length) return;

  const poses = sections.map((section) => sceneController.getSectionPose(section));

  ScrollTrigger.defaults({
    markers: false
  });

  sceneController.snapToPose(poses[0]);
  sceneController.playCueSet(sections[0].cues || []);
  setActivePanel(sections[0].id);
  let activeSectionIndex = 0;

  const activateSection = (index) => {
    const section = sections[index];
    if (!section) return;
    if (activeSectionIndex === index) return;

    activeSectionIndex = index;
    setActivePanel(section.id);
    sceneController.setDesiredPose(poses[index]);
    sceneController.playCueSet(section.cues || []);
    audioController?.setDriveState(section.id, 0);
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
        const progress = profile.reducedMotion
          ? self.progress >= 0.5
            ? 1
            : 0
          : self.progress;

        sceneController.setDesiredPose(sceneController.mixPoses(poses[fromIndex], poses[toIndex], progress));
        setActivePanel(progress < 0.5 ? sections[fromIndex].id : section.id);
        audioController?.setDriveState(
          progress < 0.5 ? sections[fromIndex].id : section.id,
          progress
        );
      },
      onLeave: () => activateSection(toIndex),
      onLeaveBack: () => activateSection(fromIndex)
    });
  });

  gsap.utils.toArray('[data-reveal]').forEach((node) => {
    gsap.from(node, {
      opacity: 0,
      y: profile.reducedMotion ? 0 : 28,
      duration: 0.85,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: node,
        start: 'top 84%'
      }
    });
  });

  ScrollTrigger.refresh();
}
