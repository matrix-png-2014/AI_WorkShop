import { mkdirSync, copyFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 将 three 包内置的 Draco WASM 解码器拷贝到 public/draco/，
 * 使 DRACOLoader 可在完全离线环境下工作。
 *
 * 该脚本由 package.json 的 postinstall 钩子触发。
 * 手动执行：npm run postinstall
 */
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(root, 'node_modules', 'three', 'examples', 'jsm', 'libs', 'draco');
const DEST = join(root, 'public', 'draco');

if (!existsSync(SRC)) {
  console.warn('[copy-draco] 未找到 three 内置 draco 解码器目录，跳过拷贝。');
  process.exit(0);
}

function copyDir(from, to) {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from)) {
    const srcPath = join(from, entry);
    const destPath = join(to, entry);
    if (statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

copyDir(SRC, DEST);
console.log(`[copy-draco] Draco 解码器已拷贝至 public/draco/ (${relative(root, DEST)})`);
