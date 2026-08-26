# Media Stream Saving Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an async `save_media_stream(message)` helper that downloads Telegram media through the existing GramJS client and triggers a safe browser download.

**Architecture:** Keep MTProto retrieval in the existing `TelegramClient.downloadMedia` path. Add a focused browser-side utility that resolves the active client, retries transient download failures, normalizes a safe filename, creates a `Blob`, and delegates download triggering to the existing `src/util/download.ts` helper.

**Tech Stack:** TypeScript, Teact project utilities, GramJS API types, browser `Blob` and object URLs.

## Global Constraints

- Do not add dependencies or tests.
- Use existing API/client and download helpers.
- Use Chinese standard documentation comments for public functions and important logic.
- Do not depend on UI read-only or rendering flags.
- Browser downloads go to the browser-managed default directory; arbitrary absolute paths are unsupported.
- Preserve unrelated worktree changes.

---

### Task 1: Add the media stream persistence helper

**Files:**
- Create: `src/util/saveMediaStream.ts`

**Interfaces:**
- Consumes: `Api.TypeMessage`, `getGlobal`, `selectTabState`, `downloadMedia`, and `download`.
- Produces: `SaveMediaStreamOptions` and `save_media_stream(message, options?)` returning `{ fileName: string; size: number }`.

- [ ] **Step 1: Inspect client access and message filename conventions**

Run:

```bash
rg -n "selectTabState|getGlobal\(|downloadMedia\(" src/global src/util src/components | head -100
rg -n "fileName|fileName|mimeType|attributes.*Filename|DocumentAttributeFilename" src/api src | head -100
```

Use the existing active-tab client accessor and API media/document types; do not introduce a second client abstraction.

- [ ] **Step 2: Implement typed download and save flow**

Create a module with these behaviors:

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

Validate the message and media before download. Call `client.downloadMedia(message, { progressCallback })`, retry at most three attempts for thrown download errors, reject `undefined` and zero-byte results, sanitize the chosen filename by replacing path/control characters and falling back to `media-${message.id}` with a media-appropriate extension, then create a `Blob`, call `download(URL.createObjectURL(blob), fileName)`, and revoke the URL in `finally`. Convert each failure to an `Error` with the message id and preserve the original cause where supported.

Add Chinese JSDoc for the exported type/function and a short Chinese comment before the retry and object-URL cleanup blocks.

- [ ] **Step 3: Run TypeScript checks**

Run: `npm run check:ts`

Expected: the check completes without new errors attributable to `saveMediaStream.ts`. Fix import order or type mismatches in that file only.

### Task 2: Review integration and lint scope

**Files:**
- Modify: only `src/util/saveMediaStream.ts` if review finds an issue

**Interfaces:**
- Consumes: Task 1 exported helper.
- Produces: verified browser-download behavior with no UI-state dependency.

- [ ] **Step 1: Perform static review**

Confirm there are no hardcoded UI strings, no `null`, no conditional object spreads, no numeric font/style declarations, no arbitrary filesystem APIs, and no imports from React. Confirm the URL is revoked on every path after Blob creation.

- [ ] **Step 2: Re-run checks after fixes**

Run: `npm run check:ts`

Expected: success with no unrelated files changed.
