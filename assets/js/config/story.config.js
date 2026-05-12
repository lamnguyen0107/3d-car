export const STORY_CONFIG = {
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
      exposure: 1.26
    }
  ]
};
