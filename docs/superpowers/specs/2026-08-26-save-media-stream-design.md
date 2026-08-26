# 媒体消息流本地保存设计

## 目标

提供异步函数 `save_media_stream(message)`，绕过 UI 渲染状态，直接调用现有 GramJS 客户端获取消息媒体的二进制数据，并触发浏览器保存。

## 平台边界

项目运行在浏览器环境。浏览器不能直接写入用户任意绝对路径，因此本功能使用浏览器默认下载目录。底层客户端负责 MTProto 文件请求，浏览器负责通过 `Blob` 和现有下载工具保存文件。

## 数据流

1. 调用方传入 `Api.TypeMessage`，可选传入文件名和进度回调。
2. 保存模块验证消息存在可下载媒体，并调用 `TelegramClient.downloadMedia`。
3. `downloadMedia` 根据消息中的 `fileReference`、DC、文件大小构造文件位置并以分块方式获取 `Uint8Array`。
4. 模块校验结果非空，构造 `Blob` URL，调用现有 `download()` 工具触发浏览器文件下载，并释放 URL。

## 错误处理

- 无媒体、媒体类型不受支持或下载结果为空时抛出带上下文的 `Error`。
- 网络中断按有限次数重试，避免无限占用连接。
- Blob 创建和下载触发失败统一捕获并转换为可诊断错误。
- 文件名只允许安全字符，避免路径分隔符和控制字符影响下载行为。

## 接口

```ts
export type SaveMediaStreamOptions = {
  fileName?: string;
  progressCallback?: (downloaded: number, total: number) => void;
};

export async function save_media_stream(
  message: Api.TypeMessage,
  options?: SaveMediaStreamOptions,
): Promise<{ fileName: string; size: number }>;
```

该函数不读取 UI 只读标记，也不修改全局状态。它复用现有客户端和下载工具，不引入新依赖。
