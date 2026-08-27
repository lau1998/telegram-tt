# Media Download Progress Design

## Goal

让媒体下载行为接近 Telegram 客户端：每个正在下载的媒体项显示真实进度，点击进度控件可以取消，完成或失败后清理状态。

## Scope

本次只覆盖现有媒体下载入口和媒体项内的进度反馈，不新增独立下载管理面板，不改变浏览器原生下载窗口的行为。

## Current Context

- `src/components/main/DownloadManager.tsx` 负责消费 `activeDownloads` 并调用 `mediaLoader.fetch`。
- `src/util/mediaLoader.ts` 已将 `callApi('downloadMedia')` 的进度回调分发给订阅者。
- `src/types/index.ts` 的 `ActiveDownloads` 目前只记录格式、文件名、大小和来源消息。
- 多个媒体组件已经使用 `ProgressSpinner` 和 `getMediaTransferState`，但下载管理器的独立进度没有写入全局状态；不可见消息或未订阅媒体加载回调的组件无法获得统一下载进度。

## Architecture

下载任务仍以 `mediaHash` 为唯一键。任务进入 `activeDownloads` 时记录 `progress: 0`；`DownloadManager` 为每个任务创建进度回调，并将 `0..1` 的值写回对应任务；组件通过现有 selector 读取任务进度，使用现有传输状态和进度控件渲染。取消、成功、失败都会移除任务，且取消后迟到的回调不得重新建立任务状态。

`ActiveDownloads` 的 `progress` 为可选字段，确保旧缓存和未开始任务仍可读取。下载 URL 模式只展示媒体 API 的准备进度，不模拟浏览器保存窗口的实际进度。

## Components And Files

- `src/types/index.ts`: 为 `ActiveDownloads` 条目增加 `progress?: number`。
- `src/global/reducers/messages.ts`: 增加按 `mediaHash` 更新下载进度的纯 reducer。
- `src/global/actions/ui/messages.ts` 与 `src/global/types/actions.ts`: 增加 `updateMediaDownloadProgress` action，让 `DownloadManager` 通过现有 action 通道更新指定任务的进度；action 在任务不存在时直接返回，避免取消后的迟到回调重建任务。
- `src/components/main/DownloadManager.tsx`: 将媒体加载回调同步到全局状态；在取消、完成、失败时清理回调和任务。
- `src/components/common/Document.tsx`、`Audio.tsx`、`File.tsx`、`src/components/middle/message/Photo.tsx`、`Video.tsx`、`RoundVideo.tsx`、`src/components/mediaViewer/MediaViewerActions.tsx`: 使用全局下载进度作为下载中的展示值，并保留上传和普通媒体加载行为。
- 现有 SCSS 文件：仅在百分比文本或进度控件布局不足时修改，继续使用 camelCase 模块类名和项目 CSS 变量。
- `src/assets/localization/fallback.strings`: 仅在缺少所需下载状态文案时增加本地化 key。

## Interaction

1. 用户点击下载按钮，媒体项进入下载状态，环形进度显示 `0%`。
2. API 每次报告进度时，环形进度和百分比同步更新。
3. 用户点击环形进度，调用现有取消 action；任务停止并恢复下载按钮。
4. 下载完成后执行当前保存或打开逻辑，并移除任务状态。
5. 下载失败时移除任务状态，沿用现有错误处理，不留下不可取消的进度控件。

## Edge Cases

- 内存缓存命中时直接完成，避免无意义的长时间进度。
- 下载重试期间保留当前任务，进度不会被错误标记为完成。
- 取消后忽略迟到的进度回调，避免任务重新显示。
- 多个任务按不同 `mediaHash` 独立更新。
- 超过浏览器能力限制的文件沿用现有通知和清理逻辑。

## Verification

- 运行 `npm run check:ts`。
- 若修改 SCSS，运行 `npm run check:css`。
- 手动验证单文件下载、多个文件并行下载、取消、完成、失败重试以及消息不可见后重新出现时的进度一致性。
