import type { InterfaceTextSize } from '../global/types';

/**
 * 将界面文字档位写入根元素，使基于 `rem` 的界面文本按既有比例缩放
 */
export function applyInterfaceTextSize(interfaceTextSize: InterfaceTextSize) {
  document.documentElement.dataset.interfaceTextSize = interfaceTextSize;
}
