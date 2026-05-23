import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { readTailLines } from './read-log-tail';

describe('readTailLines', () => {
  it('returns the last N lines in order', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'log-tail-'));
    const filePath = path.join(dir, 'test.log');
    writeFileSync(
      filePath,
      ['line-1', 'line-2', 'line-3', 'line-4', 'line-5'].join('\n'),
      'utf8',
    );

    expect(readTailLines(filePath, 3)).toEqual(['line-3', 'line-4', 'line-5']);
  });

  it('returns an empty array when the file is missing', () => {
    expect(readTailLines(path.join(tmpdir(), 'missing.log'), 10)).toEqual([]);
  });
});
