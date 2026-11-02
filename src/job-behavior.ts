export type OutputBehavior = {
  remuxAudio: boolean;
  remuxSubtitles: boolean;
};

export const excludedStreamArguments = ({ remuxAudio, remuxSubtitles }: OutputBehavior) => [
  ...(!remuxAudio ? ['-an'] : []),
  ...(!remuxSubtitles ? ['-sn'] : []),
];

export const canProcessSurroundAudio = (
  hasEnabledSurround: boolean,
  audioProcessingEnabled: boolean,
  audioIncluded: boolean,
) => hasEnabledSurround && audioProcessingEnabled && audioIncluded;

export const shouldExtractClosedCaptions = (eligibility: {
  musicVideo: boolean;
  extractionEnabled: boolean;
  captionsDetected: boolean;
  captionSelected: boolean;
  subtitleProcessingEnabled: boolean;
  subtitlesIncluded: boolean;
}) => eligibility.musicVideo
  && eligibility.extractionEnabled
  && eligibility.captionsDetected
  && eligibility.captionSelected
  && eligibility.subtitleProcessingEnabled
  && eligibility.subtitlesIncluded;
