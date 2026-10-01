// 祈愿 · Wish Simulator —— 桌面端外壳
//
// 这个壳只做三件事：
//   1. 开一个窗口，加载打包进去的 index.html；
//   2. 放行「相机 / 麦克风」权限；
//   3. 发布版不弹控制台窗口。
//
// 关于第 2 点：
//   Windows 上 Tauri 用的是 WebView2，而 WebView2 没有权限询问弹窗 UI。
//   如果不显式处理，页面里 navigator.mediaDevices.getUserMedia() 会被静默拒绝，
//   而且 WebView2 会把这次「拒绝」持久化到用户数据目录里，之后再也拿不到摄像头。
//   所以这里直接在 Rust 侧批准，既是修复也是规避上面那个「拒绝一次就永久失效」的坑。
//
//   注意：操作系统层面（设置 → 隐私和安全性 → 相机 → 允许桌面应用访问相机）
//   仍然必须打开，这道闸在 Windows 手里，应用管不了。

// 发布版不附带控制台窗口（调试版保留，方便看日志）
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(desktop)]
use tauri::webview::{PermissionKind, PermissionResponse};

fn main() {
    let builder = tauri::Builder::default();

    // 放行相机与麦克风；其余权限保持 WebView2 默认行为，不做越权处理
    #[cfg(desktop)]
    let builder = builder.on_permission_request(|_webview, kind| match kind {
        PermissionKind::Camera | PermissionKind::Microphone => PermissionResponse::Allow,
        _ => PermissionResponse::Default,
    });

    builder
        .run(tauri::generate_context!())
        .expect("启动 祈愿 · Wish Simulator 失败");
}
