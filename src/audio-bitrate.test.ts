import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { bitrateForChannels, closestBitrateOption, maxAudioChannels, multichannelAacBitrateOptions, needsMultichannelAac } from './audio-bitrate.ts';
import { parseAppConfiguration } from './config.ts';

const stereoChoices = parseAppConfiguration(
  fs.readFileSync(new URL('../config.ini', import.meta.url), 'utf8'),
).audioBitrates.aacMultichannelBase;
const firstStereoChoice = stereoChoices.at(0) ?? '';
const lastStereoChoice = stereoChoices.at(-1) ?? '';
assert.ok(firstStereoChoice && lastStereoChoice);

test('scales AAC bitrate choices by source channel count from the stereo baseline', () => {
  const sixChannel = multichannelAacBitrateOptions(stereoChoices, 6);
  const eightChannel = multichannelAacBitrateOptions(stereoChoices, 8);
  const expectedEndpoints = (channels: number) => [firstStereoChoice, lastStereoChoice].map((rate) =>
    `${Number.parseInt(rate, 10) * channels / 2}k`);
  assert.deepEqual([sixChannel[0], sixChannel.at(-1)], expectedEndpoints(6));
  assert.deepEqual([eightChannel[0], eightChannel.at(-1)], expectedEndpoints(8));
  const configuredRate = stereoChoices.at(Math.floor(stereoChoices.length / 2)) ?? '';
  assert.ok(configuredRate);
  assert.equal(bitrateForChannels(configuredRate, 6),
    `${Math.round(Number.parseInt(configuredRate, 10) * 6 / 2)}k`);
});

test('selects the closest configured multichannel rate and rejects invalid values', () => {
  const choices = multichannelAacBitrateOptions(stereoChoices, 6);
  const configuredChoice = choices.at(Math.floor(choices.length / 2)) ?? '';
  assert.ok(configuredChoice);
  assert.equal(closestBitrateOption(configuredChoice, choices), configuredChoice);
  assert.throws(() => bitrateForChannels('stereo', 6), /Invalid audio bitrate/);
  assert.throws(() => multichannelAacBitrateOptions(stereoChoices, 2), /require more than two channels/);
});

test('requires multichannel AAC only when an audio source is left undownmixed', () => {
  assert.equal(maxAudioChannels([2, 6, 4]), 6);
  assert.equal(maxAudioChannels([]), 0);
  assert.equal(needsMultichannelAac(6, false), true);
  assert.equal(needsMultichannelAac(2, false), false);
  assert.equal(needsMultichannelAac(6, true), false);
});
