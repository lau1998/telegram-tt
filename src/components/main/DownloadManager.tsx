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
};

type OwnProps = {
  isOpen: boolean;
  onClose: NoneToVoidFunction;
};

const GLOBAL_UPDATE_DEBOUNCE = 1000;

const processedHashes = new Set<string>();
const downloadedHashes = new Set<string>();

const DownloadManager = ({
  activeDownloads,
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
      return;
    }

    Object.entries(activeDownloads).forEach(([mediaHash, metadata]) => {
      if (metadata.isSaveMediaStream) {
        return;
      }

      if (processedHashes.has(mediaHash)) {
        return;
      }
      processedHashes.add(mediaHash);

      const { size, filename, format: mediaFormat } = metadata;
      const callbackUniqueId = generateUniqueId();

      updateMediaDownloadProgress({ mediaHash, progress: 0 });

      const mediaData = mediaLoader.getFromMemory(mediaHash);

      if (mediaData) {
        download(mediaData, filename);
        handleMediaDownloaded(mediaHash);
        return;
      }

      if (size > MAX_BUFFER_SIZE && !IS_OPFS_SUPPORTED && !IS_SERVICE_WORKER_SUPPORTED) {
        showNotification({
          message: 'Downloading files bigger than 2GB is not supported in your browser.',
        });
        handleMediaDownloaded(mediaHash);
        return;
      }

      const handleProgress = (progress: number) => {
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
        });
    });
  }, [activeDownloads]);

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
              return (
                <div key={mediaHash} className={styles.item}>
                  <div className={styles.itemInfo}>
                    <span className={styles.filename} title={metadata.filename}>{metadata.filename}</span>
                    <span className={styles.progress}>
                      {Math.round(progress * 100)}
                      %
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

    return {
      activeDownloads,
    };
  },
)(DownloadManager));
