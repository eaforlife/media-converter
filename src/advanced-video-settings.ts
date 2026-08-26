import type { AdvancedVideoSettings } from './shared-types';

export type AdvancedVideoField = keyof AdvancedVideoSettings;

export const supportedAdvancedVideoFields = (encoder: string): readonly AdvancedVideoField[] => {
  if (encoder.endsWith('_nvenc')) {
    return ['bFrames', 'multipass', 'bRefMode', 'adaptiveBFrames', 'sceneCutDetection', 'rcLookahead', 'nonReferenceP', 'spatialAq', 'temporalAq'];
  }
  if (/^(?:h264|hevc)_qsv$/.test(encoder)) {
    return ['bFrames', 'adaptiveBFrames', 'sceneCutDetection', 'rcLookahead'];
  }
  if (encoder === 'av1_qsv') return ['adaptiveBFrames', 'sceneCutDetection', 'rcLookahead'];
  if (encoder.endsWith('_amf')) {
    return [
      ...(/^(?:h264|av1)_amf$/.test(encoder) ? ['adaptiveBFrames' as const] : []),
      'sceneCutDetection', 'rcLookahead', 'spatialAq', 'temporalAq',
    ];
  }
  if (encoder === 'libx264' || encoder === 'libx265') {
    return ['bFrames', 'bRefMode', 'adaptiveBFrames', 'sceneCutDetection', 'rcLookahead', 'spatialAq'];
  }
  return [];
};

export const advancedVideoArguments = (encoder: string, settings: AdvancedVideoSettings) => {
  if (encoder.endsWith('_nvenc')) {
    const args = [
      '-multipass', String(settings.multipass), '-bf', settings.bFrames ? '4' : '0',
      '-b_ref_mode', settings.bRefMode, '-b_adapt', settings.adaptiveBFrames ? '1' : '0',
      '-no-scenecut', settings.sceneCutDetection ? '0' : '1', '-rc-lookahead', String(settings.rcLookahead),
      '-nonref_p', settings.nonReferenceP ? '1' : '0', '-spatial-aq', settings.spatialAq > 0 ? '1' : '0',
      '-temporal-aq', settings.temporalAq ? '1' : '0',
    ];
    if (settings.spatialAq > 0) args.push('-aq-strength', String(settings.spatialAq));
    return args;
  }
  if (/^(?:h264|hevc)_qsv$/.test(encoder)) {
    return [
      '-bf', settings.bFrames ? '4' : '0', '-adaptive_b', settings.adaptiveBFrames ? '1' : '0', '-adaptive_i', settings.sceneCutDetection ? '1' : '0',
      '-look_ahead_depth', String(settings.rcLookahead),
    ];
  }
  if (encoder === 'av1_qsv') {
    return [
      '-adaptive_b', settings.adaptiveBFrames ? '1' : '0', '-adaptive_i', settings.sceneCutDetection ? '1' : '0',
      '-look_ahead_depth', String(settings.rcLookahead),
    ];
  }
  if (encoder.endsWith('_amf')) {
    const preanalysis = settings.adaptiveBFrames || settings.sceneCutDetection || settings.rcLookahead > 0
      || settings.spatialAq > 0 || settings.temporalAq;
    const caqStrength = settings.spatialAq <= 5 ? 'low' : settings.spatialAq <= 10 ? 'medium' : 'high';
    return [
      '-preanalysis', preanalysis ? '1' : '0',
      ...(/^(?:h264|av1)_amf$/.test(encoder) ? ['-pa_adaptive_mini_gop', settings.adaptiveBFrames ? '1' : '0'] : []),
      '-pa_scene_change_detection_enable', settings.sceneCutDetection ? '1' : '0',
      '-pa_lookahead_buffer_depth', String(Math.min(settings.rcLookahead, 41)),
      '-pa_paq_mode', settings.spatialAq > 0 ? 'caq' : 'none',
      ...(settings.spatialAq > 0 ? ['-pa_caq_strength', caqStrength] : []),
      '-pa_taq_mode', settings.temporalAq ? '1' : 'none',
    ];
  }
  if (encoder === 'libx264') {
    const bPyramid = settings.bRefMode === 'disabled' ? 'none' : settings.bRefMode === 'each' ? 'strict' : 'normal';
    return [
      '-bf', settings.bFrames ? '4' : '0', '-b-pyramid', bPyramid,
      '-b_strategy', settings.adaptiveBFrames ? '1' : '0', '-sc_threshold', settings.sceneCutDetection ? '40' : '0',
      '-rc-lookahead', String(settings.rcLookahead), '-aq-mode', settings.spatialAq > 0 ? 'variance' : 'none',
      ...(settings.spatialAq > 0 ? ['-aq-strength', (settings.spatialAq / 10).toFixed(1)] : []),
    ];
  }
  if (encoder === 'libx265') {
    return ['-x265-params', [
      `bframes=${settings.bFrames ? 4 : 0}`, `b-pyramid=${settings.bRefMode === 'disabled' ? 0 : 1}`,
      `b-adapt=${settings.adaptiveBFrames ? 1 : 0}`, `scenecut=${settings.sceneCutDetection ? 40 : 0}`,
      `rc-lookahead=${settings.rcLookahead}`, `aq-mode=${settings.spatialAq > 0 ? 2 : 0}`,
      ...(settings.spatialAq > 0 ? [`aq-strength=${(settings.spatialAq / 5).toFixed(1)}`] : []),
    ].join(':')];
  }
  return [];
};
