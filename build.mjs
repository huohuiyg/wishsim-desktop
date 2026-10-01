// build.mjs —— 一键构建「祈愿」桌面端
// 自动装配 Rust(GNU) / MinGW-w64 / Tauri CLI 环境，然后调用 tauri build。
//
// 用法：
//   node build.mjs                 打包（生成 NSIS 安装包）
//   node build.mjs --no-bundle     只编译 exe，不打包
//   node build.mjs --debug         调试构建
//
// 本机工具链位置（如需迁移，改这三个常量或对应环境变量）：
//   Rust   : D:\toolchain\rust     (rustup，host = x86_64-pc-windows-gnu)
//   MinGW  : D:\toolchain\mingw64  (仅用其 binutils: windres/ld/ar)
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const RUSTUP_HOME = process.env.RUSTUP_HOME || 'D:\\toolchain\\rust\\rustup';
const CARGO_HOME = process.env.CARGO_HOME || 'D:\\toolchain\\rust\\cargo';
const TOOLCHAIN_BIN = process.env.RUST_TOOLCHAIN_BIN
  || 'D:\\toolchain\\rust\\rustup\\toolchains\\stable-x86_64-pc-windows-gnu\\bin';
const MINGW_BIN = process.env.MINGW_BIN || 'D:\\toolchain\\mingw64\\bin';
// windres 在解析 .rc 前会调用 C 预处理器（默认是 gcc -E）。本机只装了 binutils、
// 没有 gcc，所以这里提供一个「透传式预处理器」gcc.exe（由 rcpp 工程编译而来）。
// 它逐字节输出 .rc 内容：本项目生成的 resource.rc 不含 #include / 宏，透传即可。
const RCPP_BIN = process.env.RCPP_BIN || 'D:\\toolchain\\rcpp\\bin';
const NODE_BIN = process.env.NODE_BIN
  || 'C:\\Users\\Admin（无密码）\\.workbuddy\\binaries\\node\\versions\\22.22.2-3';

const log = (...a) => console.log('[build]', ...a);
const die = (m) => { console.error('[build] 错误：' + m); process.exit(1); };

// ---------- 1. 校验工具链 ----------
if (!existsSync(join(TOOLCHAIN_BIN, 'cargo.exe')))
  die(`找不到 cargo：${TOOLCHAIN_BIN}\\cargo.exe\n请先运行环境安装（见 README）。`);
if (!existsSync(join(MINGW_BIN, 'windres.exe')))
  die(`找不到 windres：${MINGW_BIN}\\windres.exe\nTauri 在 Windows 上需要它来编译图标/清单资源。`);
if (!existsSync(join(RCPP_BIN, 'gcc.exe')))
  die(`找不到预处理器 shim：${RCPP_BIN}\\gcc.exe\n` +
      `windres 解析 .rc 时需要它（本机无 gcc）。\n` +
      `重新生成：cd D:\\toolchain\\rcpp && cargo build --release && ` +
      `copy target\\x86_64-pc-windows-gnu\\release\\gcc.exe bin\\gcc.exe`);

log('Rust 工具链 : ' + TOOLCHAIN_BIN);
log('MinGW binutils : ' + MINGW_BIN);
log('rc 预处理器 : ' + RCPP_BIN + '\\gcc.exe');

// ---------- 2. 组装环境变量 ----------
// 注意：要用真实工具链目录，不要用 cargo\bin 里的 rustup shim
//       （在 Git Bash 下 shim 的输出转发会失效）。
// NSIS 打包时，Tauri 会从 GitHub Releases 下载 NSIS 3.11 与 nsis_tauri_utils.dll。
// 国内直连 GitHub 常被掐断（Peer disconnected），这里默认走一个 GitHub 代理镜像。
// 官方支持的变量是 TAURI_BUNDLER_TOOLS_GITHUB_MIRROR_TEMPLATE，占位符：
//   <owner> <repo> <version> <asset>
// 如果这个镜像失效，用环境变量覆盖即可，例如：
//   set TAURI_BUNDLER_TOOLS_GITHUB_MIRROR_TEMPLATE=https://ghproxy.net/https://github.com/<owner>/<repo>/releases/download/<version>/<asset>
const GH_MIRROR_TEMPLATE = process.env.TAURI_BUNDLER_TOOLS_GITHUB_MIRROR_TEMPLATE
  || process.env.GH_MIRROR_TEMPLATE
  || 'https://gh-proxy.com/https://github.com/<owner>/<repo>/releases/download/<version>/<asset>';

// 本机没有 gcc，链接器用 Rust 工具链自带的 rust-lld（自包含链接）。
// 这条**不写进** src-tauri/.cargo/config.toml —— 那是机器无关的文件，
// 写死绝对路径会让 CI / 其他机器直接报 `linker ... not found`。
// 所以改在这里用环境变量注入（只对本机构建生效）。
const RUST_LLD = process.env.RUST_LLD
  || 'D:\\toolchain\\rust\\rustup\\toolchains\\stable-x86_64-pc-windows-gnu\\lib\\rustlib\\x86_64-pc-windows-gnu\\bin\\rust-lld.exe';

const env = Object.assign({}, process.env, {
  RUSTUP_HOME,
  CARGO_HOME,
  CARGO_TERM_COLOR: 'always',
  TAURI_BUNDLER_TOOLS_GITHUB_MIRROR_TEMPLATE: GH_MIRROR_TEMPLATE,
  // 让 cargo 用 rust-lld 当链接器（等价于 config.toml 里的 linker=…）
  CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER: RUST_LLD,
  PATH: [RCPP_BIN, TOOLCHAIN_BIN, MINGW_BIN, NODE_BIN, process.env.PATH].join(';'),
});

const vv = spawnSync(join(TOOLCHAIN_BIN, 'rustc.exe'), ['-vV'], { env, encoding: 'utf8' });
const host = (vv.stdout || '').match(/^host:\s*(\S+)/m)?.[1] || '';
log('rustc host : ' + host);
log('GitHub 镜像 : ' + GH_MIRROR_TEMPLATE);
if (!host.includes('windows-gnu')) {
  console.warn('[build] 警告：host 不是 *-windows-gnu，Tauri 的资源编译器可能会失败。');
  console.warn('[build] 可执行：rustup default stable-x86_64-pc-windows-gnu');
}

// ---------- 3. 同步前端 ----------
const r0 = spawnSync(process.execPath, [join(here, 'sync-dist.mjs')], {
  cwd: here, env, stdio: 'inherit',
});
if (r0.status !== 0) die('同步 dist 失败');

// ---------- 4. 调用 tauri build ----------
// 用 node 直接跑 CLI 的 JS 入口（@tauri-apps/cli 是 N-API 原生模块）。
// 不要用 npx.cmd：Node 22 在 Windows 上禁止无 shell 直接 spawn .cmd（EINVAL）。
const cliJs = join(here, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');
if (!existsSync(cliJs)) die(`找不到 Tauri CLI：${cliJs}\n请先在 ${here} 执行 npm install。`);

const args = ['build'];
if (process.argv.includes('--no-bundle')) args.push('--no-bundle');
if (process.argv.includes('--debug')) args.push('--debug');

const cwd = join(here, 'src-tauri');
log(`执行：node ${cliJs} ${args.join(' ')}  (cwd=${cwd})`);
log('首次构建要下载并编译数百个 crate，可能需要十几分钟…\n');

const r = spawnSync(process.execPath, [cliJs, ...args], { cwd, env, stdio: 'inherit' });
if (r.error) die('无法启动 Tauri CLI：' + r.error.message);
if (r.status !== 0) die('构建失败，退出码 ' + r.status);

log('完成。产物：');
log('  exe      src-tauri\\target\\release\\祈愿.exe');
log('  安装包   src-tauri\\target\\release\\bundle\\nsis\\*.exe');
