import assert from 'node:assert/strict';
import test from 'node:test';
import { compactActivityLog } from './log-format.ts';

test('formats activity logs as one compact event stream', () => {
  assert.equal(compactActivityLog([
    '',
    '2026-08-28T00:00:00.000Z [INFO] application.started',
    '',
    '',
    '2026-08-28T00:00:01.000Z [INFO] ffprobe.output {}',
    '',
    '',
  ].join('\r\n')), [
    '2026-08-28T00:00:00.000Z [INFO] application.started',
    '2026-08-28T00:00:01.000Z [INFO] ffprobe.output {}',
    '',
  ].join('\n'));
});

test('keeps empty logs empty', () => {
  assert.equal(compactActivityLog('\n\r\n  \n'), '');
});
