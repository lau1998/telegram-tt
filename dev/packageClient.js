import { spawnSync } from 'child_process';
import { readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

const BUNDLE_FILE_EXTENSIONS = new Set(['.appimage', '.dmg', '.exe', '.msi', '.deb', '.rpm']);
const BUNDLE_ROOT = resolve('tauri/target');
const TAURI_ROOT = resolve('tauri');

/**
 * 执行 Tauri 打包命令，并将命令行参数透传给 Tauri CLI
 * @returns {number} Tauri 命令的退出码
 */
function buildClient() {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const frontendResult = spawnSync(npmCommand, ['run', 'build:production'], {
    stdio: 'inherit',
  });

  if (frontendResult.error) {
    // 保留启动失败的原始错误，便于定位 Node、npm 或 Rust 环境问题
    process.stderr.write(`前端构建命令启动失败：${frontendResult.error.message}\n`);
    return 1;
  }
  if (frontendResult.status !== 0) return frontendResult.status ?? 1;

  const tauriCommand = process.platform === 'win32'
    ? join('..', 'node_modules', '.bin', 'tauri.cmd')
    : join('..', 'node_modules', '.bin', 'tauri');
  const tauriResult = spawnSync(tauriCommand, [
    'build',
    '--config',
    JSON.stringify({ build: { beforeBuildCommand: '' } }),
    ...process.argv.slice(2),
  ], {
    cwd: TAURI_ROOT,
    stdio: 'inherit',
  });

  if (tauriResult.error) {
    process.stderr.write(`Tauri 打包命令启动失败：${tauriResult.error.message}\n`);
    return 1;
  }

  return tauriResult.status ?? 1;
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
