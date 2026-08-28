import { ApiMediaFormat } from '../api/types';

import { callApi } from '../api/gramjs';

const MB = 1024 * 1024;
const DEFAULT_PART_SIZE = 0.25 * MB;
const MAX_END_TO_CACHE = MB - 1;
const MAX_BUFFER_CACHE_SIZE = 32 * MB;

const bufferCache = new Map<string, ArrayBuffer>();
const sizeCache = new Map<string, number>();
const pendingRequests = new Map<string, Promise<{ arrayBuffer?: ArrayBuffer; fullSize?: number } | undefined>>();
let bufferCacheSize = 0;

/** 将渐进式媒体缓冲限制在固定内存预算内，优先保留最近使用的分片 */
function cacheBuffer(cacheKey: string, arrayBuffer: ArrayBuffer) {
  const previous = bufferCache.get(cacheKey);
  if (previous) {
    bufferCacheSize -= previous.byteLength;
  }
  bufferCache.set(cacheKey, arrayBuffer);
  bufferCacheSize += arrayBuffer.byteLength;

  while (bufferCacheSize > MAX_BUFFER_CACHE_SIZE) {
    const oldestKey = bufferCache.keys().next().value;
    if (!oldestKey) break;
    const oldest = bufferCache.get(oldestKey);
    bufferCache.delete(oldestKey);
    bufferCacheSize -= oldest?.byteLength || 0;
  }
}

function getCachedBuffer(cacheKey: string) {
  const arrayBuffer = bufferCache.get(cacheKey);
  if (!arrayBuffer) return undefined;
  bufferCache.delete(cacheKey);
  bufferCache.set(cacheKey, arrayBuffer);
  return arrayBuffer;
}

export async function* makeProgressiveLoader(
  url: string,
  start = 0,
  chunkSize = DEFAULT_PART_SIZE,
): AsyncGenerator<ArrayBuffer, void, undefined> {
  const match = url.match(/fileSize=(\d+)/);
  let fileSize;
  if (match) {
    fileSize = match && Number(match[1]);
  } else {
    fileSize = sizeCache.get(url);
  }

  while (true) {
    if (fileSize && start >= fileSize) return;

    let end = start + chunkSize - 1;
    if (fileSize && end > fileSize) {
      end = fileSize - 1;
    }

    // Check if we have the chunk in memory
    const cacheKey = `${url}:${start}-${end}`;
    let arrayBuffer = getCachedBuffer(cacheKey);

    if (!arrayBuffer) {
      let request = pendingRequests.get(cacheKey);
      if (!request) {
        request = callApi('downloadMedia', {
          mediaFormat: ApiMediaFormat.Progressive,
          url,
          start,
          end,
        });

        pendingRequests.set(cacheKey, request);
      }

      const result = await request.finally(() => {
        pendingRequests.delete(cacheKey);
      });

      if (!result?.arrayBuffer) return;

      // If fileSize is not yet defined, retrieve it from the first chunk's response
      if (result.fullSize && !fileSize) {
        fileSize = result.fullSize;
        sizeCache.set(url, result.fullSize);
      }

      // Store the chunk in memory
      arrayBuffer = result.arrayBuffer;

      // Cache only the beginning of each file for quick preview and bound total memory usage
      if (end <= MAX_END_TO_CACHE) {
        cacheBuffer(cacheKey, result.arrayBuffer);
      }
    }

    // Yield the chunk data
    yield arrayBuffer;

    start = end + 1;
  }
}
