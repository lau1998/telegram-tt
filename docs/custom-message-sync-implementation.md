# 定制功能：群/频道消息同步落地方案

## 1. 最终结论

本需求采用“现有 Telegram Web 前端 + Rust 常驻同步服务”的前后端架构。

前端负责配置和管理规则，Rust 服务端负责 Telegram 登录、消息监听、媒体传输、相册聚合、任务队列和异常恢复。浏览器关闭后，服务端仍继续执行已启用的同步规则。

第一期支持两种独立模式：

- **保留来源转发**：使用 Telegram 原生转发语义，目标端保留来源信息。
- **隐藏来源复制**：重新构建目标消息，不展示原始来源信息，由当前执行身份发送。

两种模式必须由用户主动选择，转发失败时不得自动切换为复制模式。

## 2. 当前项目边界

当前仓库是 Vite/Teact 前端项目，已有浏览器端 GramJS 实现，但没有现成的 Rust 后端、`Cargo.toml` 或 `src-tauri` 服务目录。

现有前端 GramJS 代码不能直接作为服务端运行时使用，因为它依赖浏览器 Worker、`BroadcastChannel`、浏览器本地存储和 `File`/`Blob` 类型。Rust 服务端需要独立实现 Telegram 连接、Session、媒体处理和同步 Worker。

## 3. 目标目录结构

```text
telegram-tt/
├── src/                         # 现有 Teact 前端
├── server-rust/                 # Rust 常驻服务
│   ├── Cargo.toml
│   └── src/
│       ├── main.rs              # 服务入口
│       ├── api/                 # HTTP/WebSocket API
│       ├── auth/                # 用户账号和 Bot 授权
│       ├── telegram/            # Telegram 客户端封装
│       ├── sync/                # 规则、事件、投递和重试
│       ├── media/               # 流式媒体和相册处理
│       ├── storage/             # 持久化存储
│       └── security/            # 凭证和敏感数据保护
└── shared/                      # 前后端共享接口协议
```

Rust Telegram 客户端优先评估 `grammers-client`。正式开发前必须完成最小 POC，验证用户账号、Bot、消息更新、转发、媒体上传和相册发送。

## 4. 功能范围

### 4.1 第一阶段支持

- 左上角菜单新增“定制功能”。
- 定制功能列表展示“消息同步”。
- 创建一条单向规则：A → B。
- 支持群 → 群、群 → 频道、频道 → 群、频道 → 频道。
- 支持当前用户账号和指定 Bot。
- 支持保留来源转发和隐藏来源复制。
- 支持文本、基础富文本、图片、视频、音频、普通文件和相册。
- 只同步规则启用后的新消息。
- 支持草稿、启用、暂停、恢复和删除。
- 支持失败重试、断线恢复、去重和消息映射。
- 支持服务端长期运行。

### 4.2 第一阶段不支持

- 历史消息补同步。
- 来源消息编辑和删除同步。
- 评论区、论坛 Topic 和回复关系同步。
- 投票、付款、抽奖、实时位置等特殊消息。
- 关键词、时间和消息类型过滤。
- 多条规则和一对多同步。
- 转发失败后自动降级为复制。

## 5. 前端功能

### 5.1 菜单和列表页

左上角菜单新增“定制功能”，进入后展示“消息同步”功能卡片。

功能卡片展示：

- 功能名称和说明。
- 当前状态：未配置、草稿、运行中、已暂停、异常。
- 配置、启用、暂停、恢复、删除操作。

第一阶段只允许一条有效规则，但数据结构按未来多规则设计。

### 5.2 配置页

配置项：

| 配置项 | 说明 |
| --- | --- |
| 来源 A | 当前执行身份可以读取的群或频道 |
| 目标 B | 当前执行身份可以发送消息的群或频道 |
| 执行身份 | 当前账号或已配置 Bot，默认当前账号 |
| 同步模式 | 保留来源转发或隐藏来源复制 |

保存前校验：

- 必填项完整。
- A 与 B 不能相同。
- 执行身份可以访问 A。
- 执行身份可以向 B 发送消息。
- A 和 B 使用稳定的 Telegram Peer ID 保存。

保存后默认进入“草稿”状态，保存和启用必须是两个独立操作。

启用前展示：

> 启用后，来源 A 的新消息将自动发送到目标 B。请确认目标成员可以看到这些内容。

## 6. 执行身份和授权

### 6.1 当前用户账号

服务端创建独立的 Telegram Session。生产环境推荐使用二维码授权：

1. Rust 服务端生成登录二维码。
2. 前端展示二维码。
3. 用户使用已经登录的 Telegram 客户端确认。
4. Rust 服务端获得独立 Session。
5. 服务端加密保存 Session 并长期运行。

不建议生产环境直接把浏览器 Session 原文上传到服务端。当前前端的 `ApiSessionData` 包含各 Telegram DC 的 auth key，泄露后等同于泄露账号授权。

开发阶段可以实现 Session 格式转换 POC，但不能将其作为默认生产授权方式。

### 6.2 Bot

Bot 作为独立执行身份保存 Bot Token。Bot 必须：

- 加入来源 A。
- 具备读取来源消息的能力。
- 加入目标 B。
- 具备发送消息或频道发帖权限。
- 群组场景正确配置管理员权限或隐私模式。

Bot Token 使用安全凭证存储，不能出现在前端、普通日志、任务队列或错误信息中。

### 6.3 权限检查

创建或启用规则时执行预检查；每条消息实际发送前再次校验规则状态、执行身份和目标权限。权限失效后进入“异常”，不得无限重试。

私有群和私有频道允许作为来源或目标，但执行身份必须实际具备访问权限。

## 7. 同步模式

### 7.1 保留来源转发

- 使用 Telegram 原生转发能力。
- 保留来源群或频道信息。
- 保留原始转发语义。
- 优先避免下载后再上传媒体。

### 7.2 隐藏来源复制

- 不展示原始来源群或频道。
- 不展示原始来源作者。
- 当前账号或 Bot 作为目标消息发送者。
- 重新处理文本实体、媒体说明和媒体文件。
- 相册按媒体组重新发送。

复制模式是一次性内容复制，不代表目标消息与源消息保持编辑或删除镜像关系。第一阶段不默认修改原消息正文或增加前缀。

## 8. 大文件和相册

### 8.1 大文件传输原则

- 不允许一次性将整个文件读入内存。
- 使用固定大小 Chunk 下载和上传。
- 限制每条规则、每个执行身份和全局并发数。
- 限制内存中的最大 Chunk 数量。
- 大文件使用临时文件或有界环形缓冲区。
- 支持断线后的任务恢复。
- 不进行音视频转码，避免额外 CPU 消耗。
- CPU 密集型任务不得阻塞异步运行时。

转发模式优先使用原生转发，避免不必要的下载和上传。复制模式优先复用 Telegram 媒体引用，无法复用时再进行流式下载和上传。

### 8.2 相册处理

- 按 Telegram 媒体分组标识聚合。
- 等待媒体组收齐或达到聚合超时。
- 按来源顺序构建目标媒体组。
- 目标端允许产生多条目标消息。
- 保存来源消息到目标消息的一对多映射。
- 相册不得静默拆成互不相关的单条消息。
- 部分失败时展示明确状态和失败原因。
- 重试使用同一个相册任务幂等键。

## 9. 内容保护和不支持消息

来源开启内容保护时，两种模式都禁止同步：

- 禁止原生转发。
- 禁止复制内容。
- 禁止下载后重新上传绕过保护。
- 禁止转发失败后自动切换模式。

不支持的消息进入“已跳过”或“失败”状态，并记录规则 ID、来源消息 ID、执行身份、原因和时间。日志不得记录消息正文、媒体内容、完整链接或凭证。

## 10. Rust 服务端模块

### 10.1 API

负责规则 CRUD、启用/暂停/恢复、执行身份查询、二维码登录、权限检查、同步状态和未知结果处理。

### 10.2 Telegram 连接

负责用户 Session、Bot Session、连接建立、断线重连、Telegram 更新、DC 切换和错误转换。

### 10.3 同步 Worker

负责来源消息接收、任务生成、单规则串行投递、模式选择、相册聚合、幂等和消息映射。

### 10.4 媒体模块

负责分块下载、分块上传、临时文件生命周期、文件类型和大小限制、传输进度及相册媒体组。

### 10.5 存储模块

负责规则、执行身份元数据、凭证引用、来源事件、同步投递、消息映射、同步游标和审计记录。

## 11. 数据模型

### 11.1 `sync_rule`

```text
rule_id
owner_id
executor_id
source_peer_id
target_peer_id
mode                    # FORWARD / COPY
desired_state           # DRAFT / ACTIVE / PAUSED / DELETED
health_state            # STARTING / HEALTHY / DEGRADED / BLOCKED
config_version
activation_message_id
created_at
updated_at
enabled_at
paused_at
deleted_at
last_success_at
last_error_code
last_error_at
```

### 11.2 `executor`

```text
executor_id
owner_id
type                    # USER / BOT
display_name
telegram_user_id
telegram_bot_id
credential_reference
status                  # CONNECTING / READY / REVOKED / ERROR
created_at
updated_at
last_connected_at
```

`credential_reference` 只保存安全凭证存储中的引用，不保存明文 Session 或 Bot Token。

### 11.3 `sync_delivery`

```text
delivery_id
rule_id
config_version
source_peer_id
source_message_id
target_peer_id
target_message_ids
operation               # CREATE
mode
idempotency_key
status                  # PENDING / SENDING / SENT / RETRY_WAIT / SKIPPED / FAILED / UNKNOWN
attempt_count
first_attempt_at
last_attempt_at
sent_at
last_error_code
last_error_message
next_retry_at
created_at
updated_at
```

创建消息的幂等键：

```text
executor_id + rule_id + source_peer_id + source_message_id + operation
```

### 11.4 `message_mapping`

```text
rule_id
source_peer_id
source_message_id
target_peer_id
target_message_ids
mode
mapping_status
created_at
updated_at
```

`target_message_ids` 必须支持多个目标消息，以覆盖相册场景。

### 11.5 `sync_cursor`

```text
rule_id
activation_message_id
realtime_cursor
contiguous_processed_cursor
last_checkpoint_at
```

不能只使用当前最大消息 ID 代表所有更早消息均已成功处理。

## 12. 状态和投递语义

### 12.1 规则状态

| 状态 | 含义 |
| --- | --- |
| `DRAFT` | 已保存但未启用 |
| `ACTIVE` | 允许创建和发送新任务 |
| `PAUSED` | 不创建新任务 |
| `DELETED` | 逻辑删除 |

### 12.2 健康状态

| 状态 | 含义 |
| --- | --- |
| `STARTING` | Worker 正在启动 |
| `HEALTHY` | 正常运行 |
| `DEGRADED` | 网络、限流或部分任务异常 |
| `BLOCKED` | 权限、Session 或目标不可用 |

### 12.3 投递语义

系统采用：

> 持久化至少一次投递；正常重试不重复；外部发送结果不明确时进入 `UNKNOWN`。

不能承诺绝对 exactly-once。`UNKNOWN` 状态需要支持查询目标消息、标记已发送、跳过和带风险重试，并保留审计记录。

## 13. 重试和错误处理

### 可重试

- 连接断开。
- 请求超时且无法确认是否已发送。
- Telegram 临时服务错误。
- 服务端临时存储错误。
- Worker 重启。

使用指数退避和随机抖动，并设置最大重试次数或最大持续时间。

### 限流

遇到 Telegram Flood Wait 或目标慢速模式时，按照服务端返回的等待时间处理，不能固定频率忙等。

### 不可重试

- 来源或目标不存在。
- 没有读取权限。
- 没有发送权限。
- 内容受保护。
- 消息类型不支持。
- Session 被撤销。
- Bot Token 无效。

## 14. API 方向

### 执行身份

```text
GET    /api/executors
POST   /api/executors/user/qr
GET    /api/executors/user/qr/:requestId
POST   /api/executors/bots
DELETE /api/executors/:executorId
POST   /api/executors/:executorId/check
```

### 同步规则

```text
GET    /api/sync-rules
POST   /api/sync-rules
PATCH  /api/sync-rules/:ruleId
DELETE /api/sync-rules/:ruleId
POST   /api/sync-rules/:ruleId/enable
POST   /api/sync-rules/:ruleId/pause
POST   /api/sync-rules/:ruleId/resume
POST   /api/sync-rules/:ruleId/check-permissions
```

### 同步任务

```text
GET    /api/sync-rules/:ruleId/summary
GET    /api/sync-rules/:ruleId/deliveries
POST   /api/sync-rules/:ruleId/deliveries/:deliveryId/confirm
POST   /api/sync-rules/:ruleId/deliveries/:deliveryId/retry
```

接口协议放入 `shared/`，前端不直接依赖 Rust 内部数据结构。

## 15. 开发阶段

### 阶段 0：技术验证

- 创建 Rust 服务目录和最小启动入口。
- 验证 Rust Telegram 客户端库。
- 验证用户账号二维码授权。
- 验证 Bot Token 登录。
- 验证断线重连。
- 验证文本发送和消息更新接收。
- 验证大文件分块下载和上传。
- 验证单组相册发送。
- 验证 Session 持久化和服务重启恢复。

阶段 0 未通过前，不进入完整 UI 和业务同步开发。

### 阶段 1：基础同步

- 前端新增“定制功能”入口和消息同步配置页。
- Rust 实现规则 CRUD。
- 支持当前账号和 Bot 执行身份。
- 支持文本、常见媒体和普通文件。
- 支持保留来源转发。
- 支持启用、暂停、恢复、删除、去重和基础重试。

### 阶段 2：复制模式和相册

- 实现文本复制。
- 实现媒体复制。
- 实现相册聚合和一对多映射。
- 实现临时文件和磁盘配额。
- 实现复制模式失败和未知结果处理。

### 阶段 3：生产可靠性

- Worker 租约和栅栏令牌。
- 服务重启恢复。
- 账号和目标级限流。
- 监控、告警和审计。
- 未知结果人工处理。
- Session 撤销和异常恢复。

## 16. 验收标准

### 前端和配置

- 左上角可以进入“定制功能”。
- 可以配置 A、B、执行身份和同步模式。
- 保存后默认是草稿。
- A 与 B 相同时不能保存或启用。
- 无读取或发送权限时不能启用。
- 页面展示规则状态、最近同步时间和最近错误。

### 账号和服务端

- 当前账号可以通过二维码授权到服务端。
- Bot 可以通过 Token 添加并检查权限。
- 服务端重启后不需要重新登录。
- 用户可以撤销服务端账号或 Bot 授权。
- 关闭网页不影响服务端同步。

### 同步和媒体

- 只同步规则启用后的新消息。
- 文本、图片、视频、音频和普通文件按支持范围同步。
- 相册按媒体组处理，目标端映射完整。
- 大文件不会一次性读入内存。
- 并发数量和临时磁盘空间有上限。
- 网络错误可以重试。
- Telegram 限流按照返回时间等待。
- 重复更新不会创建重复任务。
- 服务端重启后任务可以恢复。
- 外部发送结果不明确时进入 `UNKNOWN`。

### 生命周期和安全

- 暂停后不创建新的同步任务。
- 暂停期间消息不自动补发。
- 删除后不再同步新消息。
- 删除后旧 Worker 不能继续发送。
- 删除规则不会删除目标端已发送消息。
- 受保护内容在两种模式下均不会被同步。
- 日志、数据库和队列不包含明文 Session、Bot Token、消息正文或媒体内容。

## 17. 不承诺的能力

第一阶段不承诺：

- exactly-once 绝对不重复投递。
- 源消息编辑后目标消息自动更新。
- 源消息删除后目标消息自动删除。
- 所有 Telegram 特殊消息类型均可复制。
- 受保护内容可以被同步。
- 历史消息自动补同步。

## 18. 发布前检查

- Rust 服务端使用独立部署配置。
- API、Telegram API ID 和 API Hash 使用正式环境配置。
- 用户 Session 和 Bot Token 已接入安全凭证存储。
- 数据库和媒体临时目录有容量限制、清理策略和备份策略。
- 服务端日志已脱敏。
- Worker 重启恢复、大文件、相册、限流和断线场景已验证。
- 用户可以撤销服务端 Telegram 登录设备。
- 前端显示的状态与服务端真实状态一致。
