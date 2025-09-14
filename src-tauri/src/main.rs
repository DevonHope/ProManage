#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let mut builder = tauri::Builder::default();
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_dialog::init());
    }
    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
