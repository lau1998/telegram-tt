import { pause } from './schedulers';

type PendingDownload = {
  url: string;
  filename: string;
  onComplete?: NoneToVoidFunction;
  resolve: AnyToVoidFunction;
  reject: (err: unknown) => void;
};

// Chrome prevents more than 10 downloads per second
const LIMIT_PER_BATCH = 10;
const BATCH_INTERVAL = 1000;

let pendingDownloads: PendingDownload[] = [];
let planned = false;

export default function download(url: string, filename: string, onComplete?: NoneToVoidFunction) {
  const promise = new Promise<void>((resolve, reject) => {
    pendingDownloads.push({ url, filename, onComplete, resolve, reject });
  });
  if (!planned) {
    planned = true;
    setTimeout(processQueue, BATCH_INTERVAL);
  }
  if (!onComplete) void promise.catch(() => undefined);
  return promise;
}

async function processQueue() {
  try {
    let count = 0;
    for (const pendingDownload of pendingDownloads) {
      try {
        downloadOne(pendingDownload);
        pendingDownload.resolve();
      } catch (err: unknown) {
        pendingDownload.reject(err);
      }
      count++;
      if (count === LIMIT_PER_BATCH) {
        await pause(BATCH_INTERVAL);
        count = 0;
      }
    }
  } finally {
    pendingDownloads = [];
    planned = false;
  }
}

function downloadOne({ url, filename, onComplete }: PendingDownload) {
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.download = filename;
  try {
    link.click();
    onComplete?.();
  } catch (err: unknown) {
    // eslint-disable-next-line no-console
    console.error(err); // Suppress redundant "Blob loading failed" error popup on IOS
    throw err;
  }
}
