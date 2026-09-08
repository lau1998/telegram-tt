import { spawnSync } from 'child_process';
import { existsSync, readdirSync, statSync } from 'fs';
import { dirname, join, resolve } from 'path';

const BUNDLE_FILE_EXTENSIONS = new Set(['.appimage', '.dmg', '.exe', '.msi', '.deb', '.rpm']);
const BUNDLE_DIRECTORY_NAME = 'bundle';
const TAURI_ROOT = resolve('tauri');
const RELEASE_DIRECTORY_NAME = 'release';
const TARGET_OPTION = '--target';
const TAURI_ARGS = process.argv.slice(2);
const BUNDLE_ROOT = resolveBundleRoot(TAURI_ARGS);
const IS_WINDOWS = process.platform === 'win32';
const NPM_CLI_FALLBACK = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
const TAURI_CLI = resolve('node_modules', '@tauri-apps', 'cli', 'tauri.js');

/**
 * 执行 Tauri 打包命令，并将命令行参数透传给 Tauri CLI
 * @returns {number} Tauri 命令的退出码
 */
function buildClient() {
  const npmCommand = resolveNpmCommand();
  const frontendResult = spawnSync(npmCommand.command, npmCommand.args.concat(['run', 'build:production']), {
    stdio: 'inherit',
  });

  if (frontendResult.error) {
    // 保留启动失败的原始错误，便于定位 Node、npm 或 Rust 环境问题
    process.stderr.write(`前端构建命令启动失败：${frontendResult.error.message}\n`);
    return 1;
  }
  if (frontendResult.status !== 0) return frontendResult.status ?? 1;

  const tauriCommand = resolveTauriCommand();
  const tauriArgs = tauriCommand.args.concat([
    'build',
    '--config',
    JSON.stringify({ build: { beforeBuildCommand: '' } }),
  ]);
  tauriArgs.push(...TAURI_ARGS);

  const tauriResult = spawnSync(tauriCommand.command, tauriArgs, {
    cwd: TAURI_ROOT,
    stdio: 'inherit',
  });

  if (tauriResult.error) {
    process.stderr.write(`Tauri 打包命令启动失败：${tauriResult.error.message}\n`);
    return 1;
  }

  return tauriResult.status ?? 1;
}

function resolveNpmCommand() {
  if (!IS_WINDOWS) {
    return { command: 'npm', args: [] };
  }

  const npmCli = process.env.npm_execpath || NPM_CLI_FALLBACK;
  if (existsSync(npmCli)) {
    return { command: process.execPath, args: [npmCli] };
  }

  return {
    command: process.env.ComSpec || 'cmd.exe',
    args: ['/d', '/s', '/c', 'npm.cmd'],
  };
}

function resolveTauriCommand() {
  if (IS_WINDOWS && existsSync(TAURI_CLI)) {
    return { command: process.execPath, args: [TAURI_CLI] };
  }

  return {
    command: IS_WINDOWS ? join('..', 'node_modules', '.bin', 'tauri.cmd') : join('..', 'node_modules', '.bin', 'tauri'),
    args: [],
  };
}

/**
 * 根据 Tauri 的目标参数解析当前构建对应的产物根目录
 * @param {string[]} args 传递给 Tauri CLI 的参数
 * @returns {string} 当前构建对应的 release 目录
 */
function resolveBundleRoot(args) {
  const target = resolveTarget(args);
  const targetPath = target
    ? join('target', target, RELEASE_DIRECTORY_NAME)
    : join('target', RELEASE_DIRECTORY_NAME);

  return resolve(TAURI_ROOT, targetPath);
}

/**
 * 从 Tauri CLI 参数中提取编译目标三元组
 * @param {string[]} args 传递给 Tauri CLI 的参数
 * @returns {string|undefined} 编译目标三元组
 */
function resolveTarget(args) {
  const targetIndex = args.indexOf(TARGET_OPTION);
  if (targetIndex >= 0) {
    return args[targetIndex + 1];
  }

  const targetPrefix = `${TARGET_OPTION}=`;
  const targetArgument = args.find((arg) => arg.startsWith(targetPrefix));
  return targetArgument?.slice(targetPrefix.length);
}

/**
 * 递归查找 Tauri 输出目录中的安装包和 macOS 应用目录
 * @param {string} directory 当前扫描目录
 * @returns {string[]} 找到的产物绝对路径
 */
function findArtifacts(directory) {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries.flatMap((entry) => {
    const artifactPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.endsWith('.app')) return [artifactPath];
      if (resolve(directory) === BUNDLE_ROOT && entry.name !== BUNDLE_DIRECTORY_NAME) return [];
      return findArtifacts(artifactPath);
    }

    const extension = entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase();
    return BUNDLE_FILE_EXTENSIONS.has(extension) ? [artifactPath] : [];
  });
}

/**
 * 输出打包产物位置
 * @returns {boolean} 是否找到至少一个产物
 */
function reportArtifacts() {
  if (!statSync(BUNDLE_ROOT, { throwIfNoEntry: false })) {
    process.stderr.write(`未找到 Tauri 输出目录：${BUNDLE_ROOT}\n`);
    return false;
  }

  const artifacts = findArtifacts(BUNDLE_ROOT).sort();
  if (!artifacts.length) {
    process.stderr.write(`打包完成，但未找到安装包或 app 文件：${BUNDLE_ROOT}\n`);
    return false;
  }

  process.stdout.write('\n客户端打包完成，产物位置：\n');
  artifacts.forEach((artifactPath) => process.stdout.write(`- ${resolve(artifactPath)}\n`));
  return true;
}

const buildExitCode = buildClient();
if (buildExitCode !== 0) {
  process.exitCode = buildExitCode;
} else if (!reportArtifacts()) {
  process.exitCode = 1;
}
