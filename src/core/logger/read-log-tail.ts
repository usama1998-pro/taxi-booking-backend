import { closeSync, existsSync, fstatSync, openSync, readSync } from 'node:fs';

const CHUNK_SIZE = 64 * 1024;

/**
 * Reads up to `maxLines` complete lines from the end of a UTF-8 text file.
 * Does not load the whole file into memory.
 */
export function readTailLines(filePath: string, maxLines: number): string[] {
  if (!existsSync(filePath) || maxLines < 1) {
    return [];
  }

  const fd = openSync(filePath, 'r');
  try {
    const fileSize = fstatSync(fd).size;
    if (fileSize === 0) {
      return [];
    }

    let position = fileSize;
    let leftover = '';
    const collected: string[] = [];

    while (position > 0 && collected.length < maxLines) {
      const readSize = Math.min(CHUNK_SIZE, position);
      position -= readSize;
      const buffer = Buffer.alloc(readSize);
      readSync(fd, buffer, 0, readSize, position);
      const chunk = buffer.toString('utf8') + leftover;
      const parts = chunk.split(/\r?\n/);
      leftover = parts.shift() ?? '';

      for (let i = parts.length - 1; i >= 0; i -= 1) {
        const line = parts[i];
        if (line === '' && collected.length === 0) {
          continue;
        }
        collected.push(line);
        if (collected.length >= maxLines) {
          break;
        }
      }
    }

    if (leftover.length > 0 && collected.length < maxLines) {
      collected.push(leftover);
    }

    return collected.reverse();
  } finally {
    closeSync(fd);
  }
}
