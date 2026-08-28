import { memo } from '../../../lib/teact/teact';
import { getActions, withGlobal } from '../../../global';

import type { AccountSettings } from '../../../types';

import { AUTODOWNLOAD_FILESIZE_MB_LIMITS } from '../../../config';
import { purgeClearableCache } from '../../../util/cacheApi';
import { pick } from '../../../util/iteratees';

import useHistoryBack from '../../../hooks/useHistoryBack';
import useLang from '../../../hooks/useLang';
import useLastCallback from '../../../hooks/useLastCallback';

import Island, { IslandTitle } from '../../gili/layout/Island';
import Checkbox from '../../ui/Checkbox';
import ListItem from '../../ui/ListItem';
import RangeSlider from '../../ui/RangeSlider';

type OwnProps = {
  isActive?: boolean;
  onReset: NoneToVoidFunction;
};

type StateProps = Pick<AccountSettings, (
  'canAutoLoadPhotoFromContacts' |
  'canAutoLoadPhotoInPrivateChats' |
  'canAutoLoadPhotoInGroups' |
  'canAutoLoadPhotoInChannels' |
  'canAutoLoadVideoFromContacts' |
  'canAutoLoadVideoInPrivateChats' |
  'canAutoLoadVideoInGroups' |
  'canAutoLoadVideoInChannels' |
  'canAutoLoadFileFromContacts' |
  'canAutoLoadFileInPrivateChats' |
  'canAutoLoadFileInGroups' |
  'canAutoLoadFileInChannels' |
  'autoLoadFileMaxSizeMb' |
  'downloadConcurrency'
)>;

const DEFAULT_DOWNLOAD_CONCURRENCY = 3;

const SettingsDataStorage = ({
  isActive,
  canAutoLoadPhotoFromContacts,
  canAutoLoadPhotoInPrivateChats,
  canAutoLoadPhotoInGroups,
  canAutoLoadPhotoInChannels,
  canAutoLoadVideoFromContacts,
  canAutoLoadVideoInPrivateChats,
  canAutoLoadVideoInGroups,
  canAutoLoadVideoInChannels,
  canAutoLoadFileFromContacts,
  canAutoLoadFileInPrivateChats,
  canAutoLoadFileInGroups,
  canAutoLoadFileInChannels,
  autoLoadFileMaxSizeMb,
  downloadConcurrency,
  onReset,
}: OwnProps & StateProps) => {
  const { setSettingOption, showNotification } = getActions();

  const lang = useLang();

  useHistoryBack({
    isActive,
    onBack: onReset,
  });

  const renderFileSizeCallback = useLastCallback((value: number) => {
    const size = AUTODOWNLOAD_FILESIZE_MB_LIMITS[value];
    return lang('AutodownloadSizeLimitUpTo', {
      limit: lang('MediaSizeMB', { size }, { pluralValue: size }),
    });
  });

  const handleFileSizeChange = useLastCallback((value: number) => {
    setSettingOption({ autoLoadFileMaxSizeMb: AUTODOWNLOAD_FILESIZE_MB_LIMITS[value] });
  });

  const renderDownloadConcurrency = useLastCallback((value: number) => (
    lang('DownloadConcurrencyValue', { count: value })
  ));

  const handleDownloadConcurrencyChange = useLastCallback((value: number) => {
    setSettingOption({ downloadConcurrency: Math.min(10, Math.max(1, value)) });
  });

  const configuredDownloadConcurrency = Number.isFinite(downloadConcurrency)
    ? downloadConcurrency : DEFAULT_DOWNLOAD_CONCURRENCY;

  const handlePurge = useLastCallback(() => {
    purgeClearableCache();
    showNotification({
      message: { key: 'SettingsDataClearMediaDone' },
    });
  });

  function renderContentSizeSlider() {
    const value = AUTODOWNLOAD_FILESIZE_MB_LIMITS.indexOf(autoLoadFileMaxSizeMb);

    return (
      <div>
        <RangeSlider
          label={lang('AutoDownloadMaxFileSize')}
          min={0}
          max={5}
          value={value !== -1 ? value : 2}
          renderValue={renderFileSizeCallback}
          onChange={handleFileSizeChange}
        />
      </div>
    );
  }

  function renderAutoDownloadBlock(
    title: string,
    key: 'Photo' | 'Video' | 'File',
    canAutoLoadFromContacts: boolean,
    canAutoLoadInPrivateChats: boolean,
    canAutoLoadInGroups: boolean,
    canAutoLoadInChannels: boolean,
  ) {
    return (
      <>
        <IslandTitle dir={lang.isRtl ? 'rtl' : undefined}>{title}</IslandTitle>
        <Island>
          <Checkbox
            label={lang('AutoDownloadSettingsContacts')}
            checked={canAutoLoadFromContacts}
            // TODO rewrite to support `useCallback`
            onCheck={(isChecked) => setSettingOption({ [`canAutoLoad${key}FromContacts`]: isChecked })}
          />
          <Checkbox
            label={lang('AutoDownloadSettingsPrivateChats')}
            checked={canAutoLoadInPrivateChats}
            onCheck={(isChecked) => setSettingOption({ [`canAutoLoad${key}InPrivateChats`]: isChecked })}
          />
          <Checkbox
            label={lang('AutoDownloadSettingsGroupChats')}
            checked={canAutoLoadInGroups}
            onCheck={(isChecked) => setSettingOption({ [`canAutoLoad${key}InGroups`]: isChecked })}
          />
          <Checkbox
            label={lang('AutoDownloadSettingsChannels')}
            checked={canAutoLoadInChannels}
            onCheck={(isChecked) => setSettingOption({ [`canAutoLoad${key}InChannels`]: isChecked })}
          />
          {key === 'File' && renderContentSizeSlider()}
        </Island>
      </>
    );
  }

  return (
    <div className="settings-content custom-scroll">
      {renderAutoDownloadBlock(
        lang('AutoDownloadPhotosTitle'),
        'Photo',
        canAutoLoadPhotoFromContacts,
        canAutoLoadPhotoInPrivateChats,
        canAutoLoadPhotoInGroups,
        canAutoLoadPhotoInChannels,
      )}
      {renderAutoDownloadBlock(
        lang('AutoDownloadVideosTitle'),
        'Video',
        canAutoLoadVideoFromContacts,
        canAutoLoadVideoInPrivateChats,
        canAutoLoadVideoInGroups,
        canAutoLoadVideoInChannels,
      )}
      {renderAutoDownloadBlock(
        lang('AutoDownloadFilesTitle'),
        'File',
        canAutoLoadFileFromContacts,
        canAutoLoadFileInPrivateChats,
        canAutoLoadFileInGroups,
        canAutoLoadFileInChannels,
      )}
      <Island>
        <RangeSlider
          label={lang('DownloadConcurrency')}
          min={1}
          max={10}
          value={Math.min(10, Math.max(1, configuredDownloadConcurrency))}
          renderValue={renderDownloadConcurrency}
          onChange={handleDownloadConcurrencyChange}
        />
      </Island>
      <Island>
        <ListItem
          onClick={handlePurge}
          icon="delete"
          multiline
        >
          <span className="title">
            {lang('SettingsDataClearMediaCache')}
          </span>
          <span className="subtitle">
            {lang('SettingsDataClearMediaCacheDescription')}
          </span>
        </ListItem>
      </Island>
    </div>
  );
};

export default memo(withGlobal<OwnProps>(
  (global): Complete<StateProps> => {
    return pick(global.settings.byKey, [
      'canAutoLoadPhotoFromContacts',
      'canAutoLoadPhotoInPrivateChats',
      'canAutoLoadPhotoInGroups',
      'canAutoLoadPhotoInChannels',
      'canAutoLoadVideoFromContacts',
      'canAutoLoadVideoInPrivateChats',
      'canAutoLoadVideoInGroups',
      'canAutoLoadVideoInChannels',
      'canAutoLoadFileFromContacts',
      'canAutoLoadFileInPrivateChats',
      'canAutoLoadFileInGroups',
      'canAutoLoadFileInChannels',
      'autoLoadFileMaxSizeMb',
      'downloadConcurrency',
    ]);
  },
)(SettingsDataStorage));
