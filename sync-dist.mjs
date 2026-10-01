// 把 D:\祈愿\index.html 同步到 dist\index.html（保持单一数据源，避免两份文件各改各的）
// 用法： node sync-dist.mjs  [可选的源文件路径]
import { copyFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const distDir = join(here, 'dist');
const dst = join(distDir, 'index.html');

// 依次尝试：命令行参数 → 环境变量 → 上级的「祈愿」目录 → D:\祈愿
const candidates = [
  process.argv[2],
  process.env.WISH_SRC,
  resolve(here, '..', '祈愿', 'index.html'),
  'D:/祈愿/index.html',
].filter(Boolean);

let src = null;
for (const c of candidates) {
  if (existsSync(c) && statSync(c).isFile()) { src = c; break; }
}
if (!src) {
  console.error('[sync] 找不到源文件，尝试过：\n  ' + candidates.join('\n  '));
  process.exit(1);
}

mkdirSync(distDir, { recursive: true });
copyFileSync(src, dst);
const kb = (statSync(dst).size / 1024).toFixed(1);
console.log(`[sync] ${src}  ->  ${dst}  (${kb} KB)`);
