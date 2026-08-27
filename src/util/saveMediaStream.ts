import type { ApiMessage, ApiOnProgress } from '../api/types';
import { ApiMediaFormat } from '../api/types';

import {
  getMediaFilename,
  getMessageActionPhoto,
  getMessageAudio,
  getMessageDocument,
  getMessageMediaHash,
  getMessagePhoto,
  getMessageSticker,
  getMessageVideo,
  getMessageVoice,
} from '../global/helpers/messageMedia';
import { callApi, cancelApiProgress } from '../api/gramjs';
import download from './download';

const MAX_DOWNLOAD_ATTEMPTS = 3;
const FALLBACK_MIME_TYPE = 'application/octet-stream';
const activeProgressCallbacks = new Map<string, ApiOnProgress>();

/** 描述媒体流保存时可选的文件名、媒体 hash 和下载进度回调 */
export type SaveMediaStreamOptions = {
  fileName?: string;
  mediaHash?: string;
  progressCallback?: (downloaded: number, total?: number) => void;
};

/** 取消指定媒体的流式保存请求 */
export function cancelSaveMediaStream(mediaHash: string) {
  const progressCallback = activeProgressCallbacks.get(mediaHash);
  if (!progressCallback) return;

  cancelApiProgress(progressCallback);
  activeProgressCallbacks.delete(mediaHash);
}

/** 通过 UI API 下载消息媒体并保存到浏览器默认下载目录 */
export async function save_media_stream(
  message: ApiMessage,
  options?: SaveMediaStreamOptions,
): Promise<{ fileName: string; size: number }> {
  const messageId = message.id.toString();
  const mediaHash = options?.mediaHash || getMessageMediaHash(
    message,
    {},
    'download',
  );
  if (!mediaHash) throw createSaveError(messageId, '消息不包含可下载媒体');
  const media = getMessageVideo(message)
    || getMessagePhoto(message)
    || getMessageActionPhoto(message)
    || getMessageDocument(message)
    || getMessageSticker(message)
    || getMessageAudio(message)
    || getMessageVoice(message);
  const total = media && 'size' in media ? media.size : undefined;

  let result: Awaited<ReturnType<typeof callApi<'downloadMedia'>>>;
  const progressCallback: ApiOnProgress = (progress) => {
    options?.progressCallback?.(total ? progress * total : progress, total);
  };
  activeProgressCallbacks.set(mediaHash, progressCallback);

  // 下载错误最多重试三次，避免网络抖动导致保存流程无限等待
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
        throw createSaveError(messageId, '下载消息媒体失败', err);
      }
    }
  }

  activeProgressCallbacks.delete(mediaHash);

  if (!result?.dataBlob) throw createSaveError(messageId, '下载消息媒体为空');
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
    if (!blob.size) throw createSaveError(messageId, '下载消息媒体为空');
    const fileName = sanitizeFileName(
      options?.fileName || (media && getMediaFilename(media)), messageId, blob.type,
    );
    blobUrl = URL.createObjectURL(blob);
    // 对象 URL 在下载队列实际点击后释放，避免点击前撤销导致文件无法保存
    await download(blobUrl, fileName, revokeUrl);
    return { fileName, size: blob.size };
  } catch (err: unknown) {
    if (err instanceof Error && err.message.startsWith(`消息 ${messageId}：`)) throw err;
    throw createSaveError(messageId, '触发浏览器下载失败', err);
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
  return new Error(`消息 ${messageId}：${description}`, cause === undefined ? undefined : { cause });
}
