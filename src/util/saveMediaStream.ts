import type { ApiMessage, ApiOnProgress } from '../api/types';
import type { DownloadableMedia } from '../global/helpers/messageMedia';
import { ApiMediaFormat } from '../api/types';

import {
  getMediaFilename,
  getMediaFileSize,
  getMediaHash,
} from '../global/helpers/messageMedia';
import { callApi, cancelApiProgress } from '../api/gramjs';
import download from './download';

const MAX_DOWNLOAD_ATTEMPTS = 3;
const FALLBACK_MIME_TYPE = 'application/octet-stream';
const activeProgressCallbacks = new Map<string, ApiOnProgress>();

export type SaveMediaStreamRequest = {
  message: ApiMessage;
  media: DownloadableMedia;
};

export type SaveMediaStreamContext = SaveMediaStreamRequest & {
  mediaHash: string;
};

export type SaveMediaStreamOptions = {
  fileName?: string;
  mediaHash?: string;
  onProgress?: (progress: number) => void;
};

export type SaveMediaStreamsOptions = {
  onStart?: (context: SaveMediaStreamContext) => void;
  onProgress?: (context: SaveMediaStreamContext, progress: number) => void;
  onComplete?: (context: SaveMediaStreamContext) => void;
  onError?: (context: SaveMediaStreamContext) => void;
};

export function cancelSaveMediaStream(mediaHash: string) {
  const progressCallback = activeProgressCallbacks.get(mediaHash);
  if (!progressCallback) return;

  cancelApiProgress(progressCallback);
  activeProgressCallbacks.delete(mediaHash);
}

export function saveMediaStreams(requests: SaveMediaStreamRequest[], options: SaveMediaStreamsOptions) {
  requests.forEach((request) => {
    const mediaHash = getMediaHash(request.media, 'download');
    if (!mediaHash) return;

    const context = {
      ...request,
      mediaHash,
    } satisfies SaveMediaStreamContext;

    options.onStart?.(context);

    void saveMediaStream(request.message, request.media, {
      mediaHash,
      onProgress: (progress) => {
        options.onProgress?.(context, progress);
      },
    }).then(() => {
      options.onComplete?.(context);
    }).catch(() => {
      options.onError?.(context);
    });
  });
}

export async function saveMediaStream(
  message: ApiMessage,
  media: DownloadableMedia,
  options?: SaveMediaStreamOptions,
): Promise<{ fileName: string; size: number }> {
  const messageId = message.id.toString();
  const mediaHash = options?.mediaHash || getMediaHash(media, 'download');
  if (!mediaHash) throw createSaveError(messageId, 'Message has no downloadable media');

  const total = getMediaFileSize(media);
  let result: Awaited<ReturnType<typeof callApi<'downloadMedia'>>>;
  const progressCallback: ApiOnProgress = (progress) => {
    options?.onProgress?.(progress);
  };
  activeProgressCallbacks.set(mediaHash, progressCallback);

  for (let attempt = 0; attempt < MAX_DOWNLOAD_ATTEMPTS; attempt++) {
    try {
      result = await callApi('downloadMedia', {
        url: mediaHash,
        mediaFormat: ApiMediaFormat.BlobUrl,
        isHtmlAllowed: false,
      }, progressCallback);
      break;
    } catch (err: unknown) {
      if (attempt === MAX_DOWNLOAD_ATTEMPTS - 1) {
        activeProgressCallbacks.delete(mediaHash);
        throw createSaveError(messageId, 'Failed to download message media', err);
      }
    }
  }

  activeProgressCallbacks.delete(mediaHash);

  if (!result?.dataBlob) throw createSaveError(messageId, 'Downloaded message media is empty');

  let blob: Blob;
  let blobUrl: string | undefined;
  let isUrlRevoked = false;
  const revokeUrl = () => {
    if (isUrlRevoked) return;
    isUrlRevoked = true;
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  };

  try {
    blob = result.dataBlob instanceof Blob
      ? result.dataBlob
      : new Blob([result.dataBlob], { type: result.mimeType || FALLBACK_MIME_TYPE });
    if (!blob.size) throw createSaveError(messageId, 'Downloaded message media is empty');

    const fileName = sanitizeFileName(options?.fileName || getMediaFilename(media), messageId, blob.type);
    blobUrl = URL.createObjectURL(blob);
    await download(blobUrl, fileName, revokeUrl);
    return { fileName, size: total || blob.size };
  } catch (err: unknown) {
    if (err instanceof Error && err.message.startsWith(`Message ${messageId}:`)) throw err;
    throw createSaveError(messageId, 'Failed to trigger browser download', err);
  } finally {
    revokeUrl();
  }
}

function sanitizeFileName(fileName: string | undefined, messageId: string, mimeType: string) {
  const extension = mimeType.split('/')[1]?.split(';')[0] || 'bin';
  const safeExtension = extension.replace(/[^a-z0-9]/gi, '') || 'bin';
  const fallback = `media-${messageId}.${safeExtension}`;
  if (!fileName) return fallback;

  const sanitized = Array.from(fileName, (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 || '\\/:*?"<>|'.includes(character) ? '_' : character;
  }).join('').trim().replace(/^[. ]+|[. ]+$/g, '');
  return sanitized || fallback;
}

function createSaveError(messageId: string, description: string, cause?: unknown) {
  return new Error(`Message ${messageId}: ${description}`, cause === undefined ? undefined : { cause });
}
