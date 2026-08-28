import {
  memo, useCallback,
} from '../../../lib/teact/teact';
import { getActions, withGlobal } from '../../../global';

import type { InterfaceTextSize, SharedSettings } from '../../../global/types';
import type { ThemeKey, TimeFormat } from '../../../types';
import type { IRadioOption } from '../../ui/RadioGroup';
import { SettingsScreens } from '../../../types';

import { selectSharedSettings } from '../../../global/selectors/sharedState';
import {
  IS_ANDROID, IS_IOS, IS_MAC_OS,
} from '../../../util/browser/windowEnvironment';
import { getSystemTheme } from '../../../util/systemTheme';

import useAppLayout from '../../../hooks/useAppLayout';
import useHistoryBack from '../../../hooks/useHistoryBack';
import useLang from '../../../hooks/useLang';
import useLastCallback from '../../../hooks/useLastCallback';

import Island, { IslandTitle } from '../../gili/layout/Island';
import Checkbox from '../../ui/Checkbox';
import ListItem from '../../ui/ListItem';
import RadioGroup from '../../ui/RadioGroup';
import RangeSlider from '../../ui/RangeSlider';

type OwnProps = {
  isActive?: boolean;
  onReset: () => void;
};

type StateProps =
  Pick<SharedSettings, (
    'interfaceTextSize' |
    'messageTextSize' |
    'messageSendKeyCombo' |
    'shouldReplaceTextShortcuts' |
    'timeFormat' |
    'theme' |
    'shouldUseSystemTheme'
  )>;

const SettingsGeneral = ({
  isActive,
  interfaceTextSize,
  messageTextSize,
  messageSendKeyCombo,
  shouldReplaceTextShortcuts,
  timeFormat,
  theme,
  shouldUseSystemTheme,
  onReset,
}: OwnProps & StateProps) => {
  const {
    setSharedSettingOption, openSettingsScreen,
  } = getActions();

  const lang = useLang();

  const { isMobile } = useAppLayout();
  const isMobileDevice = isMobile && (IS_IOS || IS_ANDROID);

  const timeFormatOptions: IRadioOption[] = [{
    label: lang('SettingsTimeFormat12'),
    value: '12h',
  }, {
    label: lang('SettingsTimeFormat24'),
    value: '24h',
  }];

  const appearanceThemeOptions: IRadioOption[] = [{
    label: lang('EmptyChatAppearanceLight'),
    value: 'light',
  }, {
    label: lang('EmptyChatAppearanceDark'),
    value: 'dark',
  }, {
    label: lang('EmptyChatAppearanceSystem'),
    value: 'auto',
  }];

  const interfaceTextSizeOptions: IRadioOption[] = [{
    label: lang('SettingsInterfaceTextSizeSmall'),
    value: 'small',
  }, {
    label: lang('SettingsInterfaceTextSizeMedium'),
    value: 'medium',
  }, {
    label: lang('SettingsInterfaceTextSizeLarge'),
    value: 'large',
  }];

  const keyboardSendOptions = !isMobileDevice ? [
    { value: 'enter', label: lang('SettingsSendEnter'), subLabel: lang('SettingsSendEnterDescription') },
    {
      value: 'ctrl-enter',
      label: lang(IS_MAC_OS || IS_IOS ? 'SettingsSendCmdenter' : 'SettingsSendCtrlenter'),
      subLabel: lang('SettingsSendPlusEnterDescription'),
    },
  ] : undefined;

  const handleMessageTextSizeChange = useCallback((newSize: number) => {
    document.documentElement.style.setProperty(
      '--composer-text-size', `${Math.max(newSize, IS_IOS ? 16 : 15)}px`,
    );
    document.documentElement.style.setProperty('--message-meta-height', `${Math.floor(newSize * 1.25)}px`);
    document.documentElement.style.setProperty('--message-text-size', `${newSize}px`);
    document.documentElement.setAttribute('data-message-text-size', newSize.toString());

    setSharedSettingOption({ messageTextSize: newSize });
  }, []);

  /**
   * 保存用户选择的界面文字档位
   */
  const handleInterfaceTextSizeChange = useLastCallback((newSize: string) => {
    setSharedSettingOption({ interfaceTextSize: newSize as InterfaceTextSize });
  });

  const handleAppearanceThemeChange = useCallback((value: string) => {
    const newTheme = value === 'auto' ? getSystemTheme() : value as ThemeKey;

    setSharedSettingOption({ theme: newTheme });
    setSharedSettingOption({ shouldUseSystemTheme: value === 'auto' });
  }, []);

  const handleTimeFormatChange = useCallback((newTimeFormat: string) => {
    setSharedSettingOption({ timeFormat: newTimeFormat as TimeFormat });
    setSharedSettingOption({ wasTimeFormatSetManually: true });
  }, []);

  const handleMessageSendComboChange = useCallback((newCombo: string) => {
    setSharedSettingOption({ messageSendKeyCombo: newCombo as SharedSettings['messageSendKeyCombo'] });
  }, []);

  const handleTextShortcutReplacementChange = useLastCallback((shouldReplace: boolean) => {
    setSharedSettingOption({ shouldReplaceTextShortcuts: shouldReplace });
  });

  useHistoryBack({
    isActive,
    onBack: onReset,
  });

  return (
    <div className="settings-content custom-scroll">
      <IslandTitle dir={lang.isRtl ? 'rtl' : undefined}>{lang('Settings')}</IslandTitle>
      <Island>
        <RadioGroup
          name="interface-text-size"
          options={interfaceTextSizeOptions}
          selected={interfaceTextSize}
          onChange={handleInterfaceTextSizeChange}
        />
        <RangeSlider
          label={lang('TextSize')}
          min={12}
          max={20}
          value={messageTextSize}
          onChange={handleMessageTextSizeChange}
        />
        <ListItem
          icon="photo"
          narrow
          onClick={() => openSettingsScreen({ screen: SettingsScreens.GeneralChatBackground })}
        >
          {lang('ChatBackground')}
        </ListItem>
      </Island>

      <IslandTitle dir={lang.isRtl ? 'rtl' : undefined}>{lang('Theme')}</IslandTitle>
      <Island>
        <RadioGroup
          name="theme"
          options={appearanceThemeOptions}
          selected={shouldUseSystemTheme ? 'auto' : theme}
          onChange={handleAppearanceThemeChange}
        />
      </Island>

      <IslandTitle dir={lang.isRtl ? 'rtl' : undefined}>{lang('SettingsTimeFormat')}</IslandTitle>
      <Island>
        <RadioGroup
          name="timeformat"
          options={timeFormatOptions}
          selected={timeFormat}
          onChange={handleTimeFormatChange}
        />
      </Island>

      <IslandTitle dir={lang.isRtl ? 'rtl' : undefined}>{lang('SettingsKeyboard')}</IslandTitle>
      <Island>
        {keyboardSendOptions && (
          <RadioGroup
            name="keyboard-send-settings"
            options={keyboardSendOptions}
            onChange={handleMessageSendComboChange}
            selected={messageSendKeyCombo}
          />
        )}
        <Checkbox
          label={lang('SettingsAutomaticTextReplacements')}
          subLabel={lang('SettingsAutomaticTextReplacementsInfo')}
          checked={shouldReplaceTextShortcuts}
          onCheck={handleTextShortcutReplacementChange}
        />
      </Island>
    </div>
  );
};

export default memo(withGlobal<OwnProps>(
  (global): Complete<StateProps> => {
    const {
      theme,
      shouldUseSystemTheme,
      messageSendKeyCombo,
      shouldReplaceTextShortcuts,
      interfaceTextSize,
      messageTextSize,
      timeFormat,
    } = selectSharedSettings(global);

    return {
      messageSendKeyCombo,
      shouldReplaceTextShortcuts,
      interfaceTextSize,
      messageTextSize,
      timeFormat,
      theme,
      shouldUseSystemTheme,
    };
  },
)(SettingsGeneral));
