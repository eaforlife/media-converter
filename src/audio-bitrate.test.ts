import assert from 'node:assert/strict';
import test from 'node:test';
import { bitrateForChannels, closestBitrateOption, multichannelAacBitrateOptions } from './audio-bitrate.ts';

const stereoChoices = ['32k', '48k', '64k', '80k', '96k', '112k', '128k', '144k', '160k', '192k', '224k', '256k'];

test('scales AAC bitrate choices by source channel count from the stereo baseline', () => {
  const sixChannel = multichannelAacBitrateOptions(stereoChoices, 6);
  const eightChannel = multichannelAacBitrateOptions(stereoChoices, 8);
  assert.equal(sixChannel[0], '96k');
  assert.equal(sixChannel.at(-1), '768k');
  assert.equal(eightChannel[0], '128k');
  assert.equal(eightChannel.at(-1), '1024k');
  assert.equal(bitrateForChannels('144k', 6), '432k');
});

test('selects the closest configured multichannel rate and rejects invalid values', () => {
  const choices = multichannelAacBitrateOptions(stereoChoices, 6);
  assert.equal(closestBitrateOption('160k', choices), '144k');
  assert.throws(() => bitrateForChannels('stereo', 6), /Invalid audio bitrate/);
  assert.throws(() => multichannelAacBitrateOptions(stereoChoices, 2), /require more than two channels/);
});
