# 祈愿 · Wish Simulator —— 桌面端（Tauri v2）

把 `D:\祈愿\index.html` 这个单文件祈愿模拟器，用一个极薄的 Tauri 外壳包成 Windows 桌面应用，
并打出 NSIS 安装包。

- **前端**：仍然是那一个 `index.html`，不做任何改动、不做打包构建，直接作为静态资源加载。
- **外壳**：`src-tauri/`，仅一个 `main.rs`，负责开窗 + 放行相册/相机所需权限。
- **体积**：Tauri 用系统自带的 WebView2 渲染，不捆绑浏览器内核，安装包只有几 MB。

---

## 一、本机工具链（已安装好，位置如下）

因为**当前用户没有管理员权限**，无法安装 Tauri 官方要求的 Visual Studio Build Tools（MSVC），
所以这里统一使用 **Rust 官方的 `x86_64-pc-windows-gnu` 工具链**：

| 组件 | 位置 | 说明 |
|---|---|---|
| Rust / Cargo | `D:\toolchain\rust\cargo\bin` | rustup 装的 shim（命令行用） |
| Rust 真实工具链 | `D:\toolchain\rust\rustup\toolchains\stable-x86_64-pc-windows-gnu\bin` | 构建时用这一份，绕开 shim |
| MinGW binutils | `D:\toolchain\mingw64\bin` | 只需要它的 `windres`（编译图标/清单资源），以及备用的 `ld`/`ar`/`dlltool` |
| rc 预处理器 shim | `D:\toolchain\rcpp\bin\gcc.exe` | **必需**。`windres` 解析 `.rc` 前会调用 C 预处理器（默认 `gcc -E`），本机无 gcc，故用一个 Rust 写的「透传预处理器」顶替（见下） |
| Tauri CLI | `node_modules\@tauri-apps\cli`（npm 安装） | 由 `build.mjs` 用 `node` 直接跑其 `tauri.js` 入口 |

**链接器用的是 Rust 自带的 `rust-lld`**，配合 std 里 `self-contained/` 目录内置的 MinGW 运行时库
（`crt2.o` / `libmingw32.a` / `libkernel32.a` …）完成链接——因此**不需要装完整 gcc**。
相关配置写在 `src-tauri/.cargo/config.toml`。

> ### 关于 `rc 预处理器 shim`
> `windres` 在真正解析 `.rc` 之前，会先把内容喂给一个 C 预处理器（MinGW 版默认是 `gcc -E`）。
> 本机只有 binutils、没有 gcc，于是 `windres` 会报 `preprocessing failed`。
> 由于 `tauri-winres` 生成的 `resource.rc` 里**没有任何 `#include`、`#define` 或宏**（只有 windres
> 自己认识的 `#pragma code_page`），所以一个「原样输出」的透传程序就完全可以胜任预处理器。
> 该 shim 位于 `D:\toolchain\rcpp`（Rust 工程，`cargo build --release` 生成），并被放进 `PATH` 最前面。
> 重新生成：
> ```bash
> cd D:\toolchain\rcpp
> cargo build --release
> copy target\x86_64-pc-windows-gnu\release\gcc.exe bin\gcc.exe
> ```

> Rust 版本：1.98.1 ｜ 目标三元组：`x86_64-pc-windows-gnu` ｜ WebView2 运行时：随系统自带

---

## 二、构建

```bash
cd D:\wishsim-desktop
npm install          # 只需一次
node build.mjs       # 同步前端 + 编译 + 打包
```

其它用法：

```bash
node build.mjs --no-bundle   # 只编译 exe，不生成安装包
node build.mjs --debug       # 调试构建（会带控制台窗口）
node sync-dist.mjs           # 只把 D:\祈愿\index.html 同步到 dist\
```

首次构建需要从 crates.io 下载并编译约 400 个 crate，视网络情况约 10–25 分钟；
之后增量构建只需十几秒。

### 产物位置

```
src-tauri\target\release\祈愿.exe                        ← 可执行文件（含 WebView2Loader.dll）
src-tauri\target\release\bundle\nsis\祈愿_1.0.0_x64-setup.exe   ← NSIS 安装包
```

---

## 三、目录结构

```
D:\wishsim-desktop\
├─ dist\index.html          ← 由 sync-dist.mjs 从 D:\祈愿\index.html 复制而来（勿手改）
├─ sync-dist.mjs            ← 前端同步脚本
├─ build.mjs                ← 一键构建脚本
├─ package.json
└─ src-tauri\
   ├─ Cargo.toml
   ├─ build.rs
   ├─ .cargo\config.toml    ← 指定 rust-lld 链接器 + 静态 CRT
   ├─ tauri.conf.json       ← 窗口尺寸、图标、NSIS 打包参数
   ├─ capabilities\         ← 权限声明（纯前端页面，仅需 core:default）
   ├─ icons\                ← 应用图标（脚本生成，非官方素材）
   └─ src\main.rs           ← 壳
```

**改前端请改 `D:\祈愿\index.html`**，然后重新 `node build.mjs`（会自动同步）。

---

## 四、与浏览器版的行为差异

| 能力 | 浏览器 | 桌面端 | 说明 |
|---|---|---|---|
| 抽卡 / 动画 / 音效 | ✅ | ✅ | 完全一致，音效仍为 WebAudio 现场合成 |
| 存档（localStorage / IndexedDB） | ✅ | ✅ | 存在 WebView2 的用户数据目录里，随应用持久化 |
| 相册选图（文件选择框） | ✅ | ✅ | 原生文件对话框 |
| 相机（`getUserMedia`） | 走浏览器授权 | ✅（需 Rust 侧放行） | WebView2 没有授权弹窗 UI，默认会**拒绝**；`main.rs` 里注册了 `PermissionRequested` 处理器显式放行摄像头 |
| 视频壁纸自动播放 | ✅ | ✅ | 需要用户先与页面交互（自动播放策略，与浏览器一致） |

---

## 五、换图标

图标由脚本程序化生成（薄荷绿圆角底 + 白色四叶草 + 金色星芒，不含任何官方素材）：

```bash
python D:\_frames\gen-icon.py
```

或直接替换 `src-tauri\icons\icon.ico` 等文件（建议 1024×1024 起步）。
