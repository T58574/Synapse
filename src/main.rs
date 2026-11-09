#![windows_subsystem = "windows"]

pub mod audio;
pub mod diagnostics;
pub mod library;
pub mod logger;
pub mod state;
pub mod ui;

fn main() {
    logger::init();

    let application = gpui_kit::application().with_assets(gpui_kit::assets::AllAssets);
    application.run(|cx| {
        gpui_kit::init(cx);
        ui::init(cx);
    });
}
