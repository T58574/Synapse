//! GPUI application layer: window bootstrap, state entity and views.

pub mod artists;
pub mod format;
pub mod model;
pub mod shuffle;
pub mod state;
pub mod theme;
pub mod views;

use gpui_kit::prelude::*;
use gpui_kit::*;
use state::AppState;
use views::RootView;

pub fn init(cx: &mut App) {
    theme::install(cx);

    let options = WindowOptions {
        window_bounds: Some(WindowBounds::Windowed(Bounds::new(
            point(px(80.), px(80.)),
            size(px(1280.), px(800.)),
        ))),
        titlebar: Some(TitlebarOptions {
            title: Some("Synapse".into()),
            ..Default::default()
        }),
        ..Default::default()
    };

    gpui_kit::open_window(options, cx, |window, cx| {
        let app = cx.new(|cx| AppState::bootstrap(window, cx));
        cx.new(|cx| RootView::new(app, cx))
    })
    .expect("failed to open Synapse window");
}
