//! Settings: library folder, output device, crossfade and visualizer.

use super::RootView;
use crate::ui::format::format_total_duration;

use gpui_kit::component::button::Button;
use gpui_kit::component::slider::Slider;
use gpui_kit::component::{h_flex, v_flex, ActiveTheme as _, Sizable as _, StyledExt as _};
use gpui_kit::prelude::*;
use gpui_kit::*;

pub fn view(root: &RootView, cx: &mut Context<RootView>) -> impl IntoElement {
    let app = root.app.clone();
    let state = app.read(cx);

    let dim = cx.theme().muted_foreground;
    let border = cx.theme().border;
    let surface = cx.theme().sidebar;

    v_flex()
        .id("settings-scroll")
        .size_full()
        .p_5()
        .gap_4()
        .overflow_y_scroll()
        .child(
            div()
                .text_size(px(20.))
                .font_bold()
                .text_color(cx.theme().foreground)
                .child("Settings"),
        )
        .child(
            card(surface, border)
                .child(section_title("MUSIC LIBRARY", dim))
                .child(
                    div()
                        .text_sm()
                        .text_color(cx.theme().foreground)
                        .child(state.music_dir.clone()),
                )
                .child(
                    h_flex()
                        .gap_2()
                        .child(
                            Button::new("settings-open")
                                .small()
                                .label("Change folder")
                                .on_click({
                                    let app = app.clone();
                                    move |_, _, cx| {
                                        app.update(cx, |state, cx| {
                                            state.choose_folder();
                                            cx.notify();
                                        });
                                    }
                                }),
                        )
                        .child(
                            Button::new("settings-scan")
                                .small()
                                .label("Rescan")
                                .on_click({
                                    let app = app.clone();
                                    move |_, _, cx| {
                                        app.update(cx, |state, cx| {
                                            state.scan_directory(std::path::PathBuf::from(
                                                state.music_dir.clone(),
                                            ));
                                            cx.notify();
                                        });
                                    }
                                }),
                        ),
                ),
        )
        .child(
            card(surface, border)
                .child(section_title("OUTPUT DEVICE", dim))
                .children(state.devices.clone().into_iter().map(|device| {
                    let app = app.clone();
                    Button::new(format!("device-{}", device.id))
                        .small()
                        .label(if device.is_default {
                            format!("{} (default)", device.name)
                        } else {
                            device.name.clone()
                        })
                        .on_click(move |_, _, cx| {
                            let id = device.id.clone();
                            app.update(cx, |state, cx| {
                                state.set_device(id);
                                cx.notify();
                            });
                        })
                        .into_any_element()
                })),
        )
        .child(
            card(surface, border)
                .child(section_title("PLAYBACK", dim))
                .child(
                    h_flex()
                        .gap_3()
                        .items_center()
                        .child(
                            div()
                                .w(px(130.))
                                .text_sm()
                                .text_color(cx.theme().foreground)
                                .child("Crossfade"),
                        )
                        .child(
                            div()
                                .w(px(220.))
                                .child(Slider::new(&root.sliders.crossfade)),
                        )
                        .child(
                            div()
                                .text_sm()
                                .text_color(dim)
                                .child(format!("{:.1} s", state.crossfade)),
                        ),
                )
                .child(
                    h_flex()
                        .gap_3()
                        .items_center()
                        .child(
                            div()
                                .w(px(130.))
                                .text_sm()
                                .text_color(cx.theme().foreground)
                                .child("Visualizer"),
                        )
                        .child(
                            Button::new("visualizer-toggle")
                                .small()
                                .label(if state.visualizer { "On" } else { "Off" })
                                .on_click({
                                    let app = app.clone();
                                    move |_, _, cx| {
                                        app.update(cx, |state, cx| {
                                            state.toggle_visualizer();
                                            cx.notify();
                                        });
                                    }
                                }),
                        ),
                )
                .child(
                    h_flex()
                        .gap_3()
                        .items_center()
                        .child(
                            div()
                                .w(px(130.))
                                .text_sm()
                                .text_color(cx.theme().foreground)
                                .child("Automix"),
                        )
                        .child(
                            Button::new("automix-toggle")
                                .small()
                                .label(if state.automix { "On" } else { "Off" })
                                .on_click({
                                    let app = app.clone();
                                    move |_, _, cx| {
                                        app.update(cx, |state, cx| {
                                            state.toggle_automix();
                                            cx.notify();
                                        });
                                    }
                                }),
                        ),
                ),
        )
        .child(
            card(surface, border)
                .child(section_title("LIBRARY", dim))
                .child(div().text_sm().text_color(dim).child(format!(
                    "{} tracks · {} · {} artists",
                    state.tracks.len(),
                    format_total_duration(state.tracks.iter().map(|t| t.duration_sec).sum()),
                    state.artists.len()
                ))),
        )
}

fn card(surface: Hsla, border: Hsla) -> Div {
    v_flex()
        .w_full()
        .gap_2()
        .p_4()
        .rounded_lg()
        .bg(surface)
        .border_1()
        .border_color(border)
}

fn section_title(text: &'static str, dim: Hsla) -> impl IntoElement {
    div().text_xs().font_semibold().text_color(dim).child(text)
}
