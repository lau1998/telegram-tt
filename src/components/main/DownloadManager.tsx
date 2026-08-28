import { memo, useEffect } from '../../lib/teact/teact';
import { getActions, getGlobal, withGlobal } from '../../global';

import type { TabState } from '../../global/types';
import { ApiMediaFormat } from '../../api/types';

import { selectTabState } from '../../global/selectors';
import { IS_OPFS_SUPPORTED, IS_SERVICE_WORKER_SUPPORTED, MAX_BUFFER_SIZE } from '../../util/browser/windowEnvironment';
import download from '../../util/download';
import generateUniqueId from '../../util/generateUniqueId';
import * as mediaLoader from '../../util/mediaLoader';

import useLang from '../../hooks/useLang';
import useLastCallback from '../../hooks/useLastCallback';
import useRunDebounced from '../../hooks/useRunDebounced';

import Icon from '../common/icons/Icon';
import ProgressSpinner from '../ui/ProgressSpinner';

import styles from './DownloadManager.module.scss';

type StateProps = {
  activeDownloads: TabState['activeDownloads'];
  downloadConcurrency: number;
};

type OwnProps = {
  isOpen: boolean;
  onClose: NoneToVoidFunction;
};

const GLOBAL_UPDATE_DEBOUNCE = 1000;
const MAX_DOWNLOAD_CONCURRENCY = 10;
const DEFAULT_DOWNLOAD_CONCURRENCY = 3;
const PROGRESS_UPDATE_INTERVAL = 200;

const processedHashes = new Set<string>();
const downloadedHashes = new Set<string>();
const runningHashes = new Set<string>();
const startedAtByHash = new Map<string, number>();
const lastProgressAtByHash = new Map<string, number>();

/** 将每秒字节数转换为下载面板使用的数值和单位键 */
function getSpeedDisplay(bytesPerSecond: number) {
  if (bytesPerSecond >= 1024 * 1024) {
    return { value: (bytesPerSecond / (1024 * 1024)).toFixed(1), unit: 'DownloadSpeedMbps' as const };
  }

  return { value: Math.max(1, Math.round(bytesPerSecond / 1024)), unit: 'DownloadSpeedKbps' as const };
}

/** 释放指定下载任务占用的并发名额及其瞬时进度状态 */
function releaseDownloadSlot(mediaHash: string) {
  runningHashes.delete(mediaHash);
  startedAtByHash.delete(mediaHash);
  lastProgressAtByHash.delete(mediaHash);
}

const DownloadManager = ({
  activeDownloads,
  downloadConcurrency,
  isOpen,
  onClose,
}: OwnProps & StateProps) => {
  const {
    cancelMediaHashDownloads, showNotification, updateMediaDownloadProgress,
  } = getActions();
  const lang = useLang();

  const runDebounced = useRunDebounced(GLOBAL_UPDATE_DEBOUNCE, true);

  const handleMediaDownloaded = useLastCallback((hash: string) => {
    downloadedHashes.add(hash);
    runDebounced(() => {
      if (downloadedHashes.size) {
        cancelMediaHashDownloads({ mediaHashes: Array.from(downloadedHashes) });
        downloadedHashes.clear();
      }
    });
  });

  useEffect(() => {
    if (!Object.keys(activeDownloads).length) {
      processedHashes.clear();
      runningHashes.clear();
      startedAtByHash.clear();
      lastProgressAtByHash.clear();
      return;
    }

    const configuredConcurrency = Number.isFinite(downloadConcurrency)
      ? downloadConcurrency : DEFAULT_DOWNLOAD_CONCURRENCY;
    const maxConcurrency = Math.min(MAX_DOWNLOAD_CONCURRENCY, Math.max(1, configuredConcurrency));
    const activeEntries = Object.entries(activeDownloads);
    activeEntries.forEach(([mediaHash, metadata]) => {
      if (metadata.isSaveMediaStream) {
        return;
      }

      if (processedHashes.has(mediaHash) || runningHashes.size >= maxConcurrency) {
        return;
      }
      processedHashes.add(mediaHash);
      runningHashes.add(mediaHash);
      startedAtByHash.set(mediaHash, Date.now());

      const { size, filename, format: mediaFormat } = metadata;
      const callbackUniqueId = generateUniqueId();

      updateMediaDownloadProgress({ mediaHash, progress: 0 });

      const mediaData = mediaLoader.getFromMemory(mediaHash);

      if (mediaData) {
        download(mediaData, filename);
        releaseDownloadSlot(mediaHash);
        handleMediaDownloaded(mediaHash);
        return;
      }

      if (size > MAX_BUFFER_SIZE && !IS_OPFS_SUPPORTED && !IS_SERVICE_WORKER_SUPPORTED) {
        showNotification({
          message: 'Downloading files bigger than 2GB is not supported in your browser.',
        });
        releaseDownloadSlot(mediaHash);
        handleMediaDownloaded(mediaHash);
        return;
      }

      const handleProgress = (progress: number) => {
        const now = Date.now();
        if (progress < 1 && now - (lastProgressAtByHash.get(mediaHash) || 0) < PROGRESS_UPDATE_INTERVAL) {
          return;
        }
        lastProgressAtByHash.set(mediaHash, now);
        updateMediaDownloadProgress({ mediaHash, progress });

        const currentDownloads = selectTabState(getGlobal()).activeDownloads;
        if (!currentDownloads[mediaHash]) {
          mediaLoader.cancelProgress(handleProgress);
        }
      };

      mediaLoader.fetch(mediaHash, mediaFormat, true, handleProgress, callbackUniqueId)
        .then((result) => {
          if (mediaFormat === ApiMediaFormat.DownloadUrl) {
            const url = new URL(result, window.document.baseURI);
            url.searchParams.set('filename', encodeURIComponent(filename));
            const downloadWindow = window.open(url.toString());

            downloadWindow?.addEventListener('beforeunload', () => {
              showNotification({
                message: 'Download started. Please, do not close the app before it is finished.',
              });
            }, { once: true });
          } else if (result) {
            download(result, filename);
          }

          handleMediaDownloaded(mediaHash);
        })
        .catch(() => {
          handleMediaDownloaded(mediaHash);
        })
        .finally(() => {
          releaseDownloadSlot(mediaHash);
        });
    });
  }, [activeDownloads, downloadConcurrency]);

  const downloadEntries = Object.entries(activeDownloads);
  if (!downloadEntries.length) {
    return undefined;
  }

  return (
    <div className={styles.root}>
      {isOpen && (
        <div className={styles.panel}>
          <div className={styles.header}>
            <span>{lang('MediaDownload')}</span>
            <button type="button" className={styles.closeButton} onClick={onClose} aria-label={lang('Close')}>
              <Icon name="close" />
            </button>
          </div>
          <div className={styles.list}>
            {downloadEntries.map(([mediaHash, metadata]) => {
              const progress = metadata.progress || 0;
              const startedAt = startedAtByHash.get(mediaHash);
              const elapsedSeconds = startedAt ? Math.max((Date.now() - startedAt) / 1000, 1) : 0;
              const speed = elapsedSeconds && progress > 0 ? metadata.size * progress / elapsedSeconds : 0;
              const speedDisplay = speed > 0 ? getSpeedDisplay(speed) : undefined;
              const isWaiting = !processedHashes.has(mediaHash) && !metadata.isSaveMediaStream;
              return (
                <div key={mediaHash} className={styles.item}>
                  <div className={styles.itemInfo}>
                    <span className={styles.filename} title={metadata.filename}>{metadata.filename}</span>
                    <span className={styles.progress}>
                      {isWaiting ? lang('DownloadWaiting') : `${Math.round(progress * 100)}%`}
                      {!isWaiting && speedDisplay && ` · ${lang(speedDisplay.unit, { speed: speedDisplay.value })}`}
                    </span>
                  </div>
                  <ProgressSpinner
                    progress={progress}
                    size="s"
                    onClick={() => cancelMediaHashDownloads({ mediaHashes: [mediaHash] })}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default memo(withGlobal<OwnProps>(
  (global): Complete<StateProps> => {
    const activeDownloads = selectTabState(global).activeDownloads;
    const downloadConcurrency = global.settings.byKey.downloadConcurrency;

    return {
      activeDownloads,
      downloadConcurrency,
    };
  },
)(DownloadManager));
