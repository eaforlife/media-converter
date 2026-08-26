import { deepStrictEqual, equal } from 'node:assert/strict';
import { test } from 'node:test';
import {
  bufferSizeFor,
  deliveryQualityForOutput,
  deliveryPresetForOutput,
  scaleDimensionsFor,
  videoOutputProfile,
} from './video-output-profile.ts';

test('auto scaling classifies each source into the strict output tiers', () => {
  const cases = [
    { height: 2160, tier: '4k', scale: ['2720', '-2'], maxRate: 9500 },
    { height: 1080, tier: '1080p', scale: ['1760', '-2'], maxRate: 7000 },
    { height: 720, tier: '720p', scale: ['1320', '-2'], maxRate: 2500 },
    { height: 360, tier: '360p', scale: ['720', '-2'], maxRate: 2500 },
  ] as const;

  for (const expected of cases) {
    const profile = videoOutputProfile(expected.height, 'auto');
    equal(profile.tier, expected.tier);
    deepStrictEqual(profile.scale, expected.scale);
    equal(profile.maxRate, expected.maxRate);
  }
});

test('explicit scaling uses the selected output profile instead of the source tier', () => {
  const sourceHeight = 2160;
  deepStrictEqual(scaleDimensionsFor(sourceHeight, '1080p'), ['1760', '-2']);
  deepStrictEqual(scaleDimensionsFor(sourceHeight, '720p'), ['1320', '-2']);
  deepStrictEqual(scaleDimensionsFor(sourceHeight, '360p'), ['720', '-2']);
  equal(videoOutputProfile(sourceHeight, '1080p').maxRate, 7000);
  equal(videoOutputProfile(sourceHeight, '720p').maxRate, 2500);
});

test('streaming uses CQ 27 for 1080p source and scaled output profiles', () => {
  equal(deliveryQualityForOutput('Streaming', videoOutputProfile(1080, 'auto').tier, '29'), '27');
  equal(deliveryQualityForOutput('Streaming', videoOutputProfile(2160, '1080p').tier, '29'), '27');
  equal(deliveryQualityForOutput('Streaming', videoOutputProfile(2160, 'auto').tier, '29'), '29');
  equal(deliveryQualityForOutput('Archive', videoOutputProfile(1080, 'auto').tier, '18'), '18');
});

test('cellular and 360p resolve to the same output and delivery profiles', () => {
  const explicit360 = videoOutputProfile(2160, '360p');
  const cellular = videoOutputProfile(2160, 'auto', true);
  deepStrictEqual(cellular, explicit360);
  equal(deliveryPresetForOutput('Streaming', explicit360.tier), 'Cellular');
});

test('disabled scaling emits no scale filter while retaining the source rate tier', () => {
  equal(scaleDimensionsFor(2160, 'disabled'), null);
  equal(videoOutputProfile(2160, 'disabled').tier, '4k');
  equal(videoOutputProfile(2160, 'disabled').maxRate, 9500);
});

test('buffer sizing retains the preset multiplier when max rate changes', () => {
  equal(bufferSizeFor(7000, 2), 14000);
  equal(bufferSizeFor(2500, 2), 5000);
});
