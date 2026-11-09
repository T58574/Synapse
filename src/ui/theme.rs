//! Dark neutral theme and bundled typography.

use gpui_kit::component::{Theme, ThemeMode};
use gpui_kit::*;
use std::borrow::Cow;

pub const FONT_UI: &str = "Chakra Petch";
pub const FONT_MONO: &str = "JetBrains Mono";

// Neutral dark palette (no cyberpunk accents).
pub const C_BG: u32 = 0x0F1013;
pub const C_SURFACE: u32 = 0x15161A;
pub const C_SURFACE_HI: u32 = 0x1C1E23;
pub const C_BORDER: u32 = 0x272A31;
pub const C_TEXT: u32 = 0xE7E9EE;
pub const C_TEXT_DIM: u32 = 0x8C919C;
pub const C_ACCENT: u32 = 0x4C7DFF;

pub fn c(hex: u32) -> Hsla {
    rgb(hex).into()
}

pub fn install(cx: &mut App) {
    let fonts: Vec<Cow<'static, [u8]>> = vec![
        Cow::Borrowed(&include_bytes!("../../assets/fonts/ChakraPetch-Regular.ttf")[..]),
        Cow::Borrowed(&include_bytes!("../../assets/fonts/ChakraPetch-Bold.ttf")[..]),
        Cow::Borrowed(&include_bytes!("../../assets/fonts/JetBrainsMono-Regular.ttf")[..]),
        Cow::Borrowed(&include_bytes!("../../assets/fonts/JetBrainsMono-Bold.ttf")[..]),
    ];
    let _ = cx.text_system().add_fonts(fonts);

    Theme::change(ThemeMode::Dark, None, cx);
    Theme::update(cx, |theme| {
        theme.background = c(C_BG);
        theme.foreground = c(C_TEXT);
        theme.muted = c(C_SURFACE);
        theme.muted_foreground = c(C_TEXT_DIM);
        theme.border = c(C_BORDER);
        theme.input = c(C_SURFACE_HI);

        theme.primary = c(C_ACCENT);
        theme.primary_hover = c(0x6A93FF);
        theme.primary_active = c(0x3A66E0);
        theme.primary_foreground = c(0xFFFFFF);
        theme.accent = c(C_SURFACE_HI);
        theme.accent_foreground = c(C_TEXT);
        theme.ring = c(C_ACCENT);

        theme.list_hover = c(C_SURFACE);
        theme.list_active = c(C_SURFACE_HI);
        theme.list_active_border = c(C_ACCENT);

        theme.sidebar = c(C_SURFACE);
        theme.sidebar_foreground = c(C_TEXT);
        theme.sidebar_accent = c(C_SURFACE_HI);
        theme.sidebar_accent_foreground = c(C_TEXT);
        theme.sidebar_border = c(C_BORDER);

        theme.title_bar = c(C_BG);
        theme.title_bar_border = c(C_BORDER);
        theme.popover = c(C_SURFACE);
        theme.popover_foreground = c(C_TEXT);
        theme.status_bar = c(C_SURFACE);
        theme.status_bar_border = c(C_BORDER);

        theme.table = c(C_BG);
        theme.table_head = c(C_SURFACE);
        theme.table_head_foreground = c(C_TEXT_DIM);
        theme.table_hover = c(C_SURFACE);
        theme.table_active = c(C_SURFACE_HI);
        theme.table_row_border = c(C_BORDER);

        theme.slider_bar = c(0x3A3F49);
        theme.slider_thumb = c(C_ACCENT);
        theme.switch = c(C_BORDER);
        theme.switch_thumb = c(C_TEXT);

        theme.font_family = FONT_UI.into();
        theme.mono_font_family = FONT_MONO.into();
        theme.font_size = px(14.);
        theme.radius = px(7.);
        theme.radius_lg = px(10.);
        theme.shadow = true;
    });
}
