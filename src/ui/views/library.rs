//! Library: sidebar navigation, search toolbar and the virtualized track table.

use super::RootView;
use crate::ui::state::View;

use gpui_kit::component::button::Button;
use gpui_kit::component::input::Input;
use gpui_kit::component::scroll::Scrollbar;
use gpui_kit::component::v_virtual_list;
use gpui_kit::component::{h_flex, v_flex, ActiveTheme as _, Sizable as _, StyledExt as _};
use gpui_kit::prelude::*;
use gpui_kit::*;
use std::rc::Rc;

pub fn sidebar(_root: &RootView, cx: &mut Context<RootView>) -> impl IntoElement {
    let app = _root.app.clone();
    let state = app.read(cx);
    let playlists = state.playlists.clone();
    let selected = state.selected_playlist.clone();
    let total = state.tracks.len();
    let artist_count = state.artists.len();

    let dim = cx.theme().muted_foreground;
    let border = cx.theme().border;
    let row = RowStyle {
        hover: cx.theme().list_hover,
        active_bg: cx.theme().list_active,
        foreground: cx.theme().foreground,
        dim,
    };

    v_flex()
        .w(px(210.))
        .h_full()
        .flex_shrink_0()
        .border_r_1()
        .border_color(border)
        .bg(cx.theme().sidebar)
        .py_3()
        .gap_1()
        .child(section_label("LIBRARY", dim))
        .child(sidebar_row(
            "all-tracks",
            format!("All tracks  ·  {}", total),
            selected.is_none() && state.view == View::Library,
            {
                let app = app.clone();
                move |cx| {
                    app.update(cx, |state, cx| {
                        state.select_playlist(None);
                        state.set_search(String::new());
                        state.set_view(View::Library);
                        cx.notify();
                    })
                }
            },
            row,
        ))
        .child(sidebar_row(
            "artists",
            format!("Artists  ·  {}", artist_count),
            state.view == View::Artists,
            {
                let app = app.clone();
                move |cx| {
                    app.update(cx, |state, cx| {
                        state.select_playlist(None);
                        state.set_view(View::Artists);
                        cx.notify();
                    })
                }
            },
            row,
        ))
        .child(div().h(px(12.)))
        .child(section_label("PLAYLISTS", dim))
        .children(playlists.into_iter().map(|playlist| {
            let active = selected.as_deref() == Some(playlist.name.as_str());
            let app = app.clone();
            let name = playlist.name.clone();
            sidebar_row(
                format!("playlist-{}", playlist.id),
                format!("{}  ·  {}", playlist.name, playlist.track_paths.len()),
                active,
                move |cx| {
                    let name = name.clone();
                    app.update(cx, |state, cx| {
                        state.select_playlist(Some(name));
                        cx.notify();
                    });
                },
                row,
            )
            .into_any_element()
        }))
}

fn section_label(text: &'static str, color: Hsla) -> impl IntoElement {
    div()
        .px_3()
        .py_1()
        .text_xs()
        .font_semibold()
        .text_color(color)
        .child(text)
}

#[derive(Clone, Copy)]
struct RowStyle {
    hover: Hsla,
    active_bg: Hsla,
    foreground: Hsla,
    dim: Hsla,
}

fn sidebar_row(
    id: impl Into<ElementId>,
    text: String,
    active: bool,
    on_click: impl Fn(&mut App) + 'static,
    style: RowStyle,
) -> impl IntoElement {
    let (foreground, dim, hover, active_bg) =
        (style.foreground, style.dim, style.hover, style.active_bg);
    div()
        .id(id)
        .mx_2()
        .px_2()
        .py_1p5()
        .rounded_md()
        .text_sm()
        .cursor_pointer()
        .text_color(if active { foreground } else { dim })
        .when(active, |this| this.bg(active_bg))
        .when(!active, |this| this.hover(move |style| style.bg(hover)))
        .on_click(move |_, _, cx| on_click(cx))
        .child(text)
}

pub fn view(root: &RootView, cx: &mut Context<RootView>) -> impl IntoElement {
    let app = root.app.clone();
    let state = app.read(cx);

    let summary = state.summary().to_string();
    let selected = state.selected_playlist.clone();
    let dim = cx.theme().muted_foreground;
    let border = cx.theme().border;
    let head_bg = cx.theme().table_head;
    let hover = cx.theme().table_hover;
    let playing_path = state.playing_path.clone();
    // `v_virtual_list` needs one size per row; every row is a fixed 34 px.
    let item_sizes = Rc::new(vec![size(px(0.), px(34.)); state.filtered.len()]);

    let title = selected.clone().unwrap_or_else(|| "All tracks".to_string());

    v_flex()
        .size_full()
        .child(
            v_flex()
                .px_5()
                .py_4()
                .gap_1()
                .border_b_1()
                .border_color(border)
                .child(
                    h_flex()
                        .justify_between()
                        .items_center()
                        .child(
                            div()
                                .text_size(px(20.))
                                .font_bold()
                                .text_color(cx.theme().foreground)
                                .child(title),
                        )
                        .child(Input::new(&state.search_input).w(px(320.))),
                )
                .child(div().text_xs().text_color(dim).child(summary))
                .when(!state.status.is_empty(), |this| {
                    this.child(
                        div()
                            .text_xs()
                            .text_color(cx.theme().primary)
                            .child(state.status.clone()),
                    )
                }),
        )
        .child(
            h_flex()
                .h(px(30.))
                .px_5()
                .gap_3()
                .bg(head_bg)
                .text_xs()
                .text_color(dim)
                .border_b_1()
                .border_color(border)
                .child(div().w(px(28.)).child("#"))
                .child(div().flex_1().min_w_0().child("TITLE"))
                .child(div().w(px(180.)).child("ARTIST"))
                .child(div().w(px(56.)).child("BPM"))
                .child(div().w(px(52.)).child("KEY"))
                .child(div().w(px(56.)).child("TIME"))
                .child(div().w(px(34.))),
        )
        .child(
            v_flex()
                .flex_grow_1()
                .min_h_0()
                .size_full()
                .relative()
                .overflow_hidden()
                .when(state.filtered.is_empty(), |this| {
                    this.child(
                        div()
                            .size_full()
                            .flex()
                            .items_center()
                            .justify_center()
                            .text_sm()
                            .text_color(dim)
                            .child("No tracks · pick a folder or press Scan"),
                    )
                })
                .when(!state.filtered.is_empty(), |this| {
                    this.child(
                        v_virtual_list(
                            cx.entity(),
                            "track-list",
                            item_sizes,
                            move |root, range: std::ops::Range<usize>, _window, cx| {
                                let state = root.app.read(cx);
                                range
                                    .map(|index| {
                                        let Some(&track_index) = state.filtered.get(index) else {
                                            return div().into_any_element();
                                        };
                                        let track = &state.tracks[track_index];
                                        let is_current = playing_path.as_deref()
                                            == Some(track.file_path.as_str());
                                        let is_playing_this = is_current && state.playback.playing;
                                        let app = root.app.clone();
                                        let queue_app = app.clone();
                                        let path = track.file_path.clone();
                                        let row_bg = if index % 2 == 0 {
                                            cx.theme().background
                                        } else {
                                            cx.theme().muted
                                        };
                                        let accent = cx.theme().primary;
                                        let text = cx.theme().foreground;
                                        let muted = cx.theme().muted_foreground;

                                        h_flex()
                                            .id(format!("track-{index}"))
                                            .w_full()
                                            .h(px(34.))
                                            .px_5()
                                            .gap_3()
                                            .text_sm()
                                            .bg(row_bg)
                                            .cursor_pointer()
                                            .hover(move |style| style.bg(hover))
                                            .on_click(move |_, _, cx| {
                                                app.update(cx, |state, cx| {
                                                    state.play_path(&path);
                                                    cx.notify();
                                                });
                                            })
                                            .child(
                                                div()
                                                    .w(px(28.))
                                                    .text_color(if is_current {
                                                        accent
                                                    } else {
                                                        muted
                                                    })
                                                    .child(if is_current {
                                                        if is_playing_this {
                                                            "▶".to_string()
                                                        } else {
                                                            "⏸".to_string()
                                                        }
                                                    } else {
                                                        format!("{}", index + 1)
                                                    }),
                                            )
                                            .child(
                                                div()
                                                    .flex_1()
                                                    .min_w_0()
                                                    .truncate()
                                                    .text_color(if is_current {
                                                        accent
                                                    } else {
                                                        text
                                                    })
                                                    .child(track.title.clone()),
                                            )
                                            .child(
                                                div()
                                                    .w(px(180.))
                                                    .truncate()
                                                    .text_color(muted)
                                                    .child(track.artist.clone()),
                                            )
                                            .child(
                                                div()
                                                    .w(px(56.))
                                                    .text_color(muted)
                                                    .child(format!("{}", track.bpm.round() as i64)),
                                            )
                                            .child(div().w(px(52.)).text_color(muted).child(
                                                if track.key_signature.is_empty() {
                                                    "—".to_string()
                                                } else {
                                                    track.key_signature.clone()
                                                },
                                            ))
                                            .child(div().w(px(56.)).text_color(muted).child(
                                                crate::ui::format::format_duration(
                                                    track.duration_sec,
                                                ),
                                            ))
                                            .child(
                                                div().w(px(34.)).child(
                                                    Button::new(format!("queue-{index}"))
                                                        .small()
                                                        .label("+")
                                                        .on_click({
                                                            let app = queue_app;
                                                            let path = track.file_path.clone();
                                                            move |_, _, cx| {
                                                                app.update(cx, |state, cx| {
                                                                    state.queue_add_by_path(&path);
                                                                    cx.notify();
                                                                });
                                                            }
                                                        }),
                                                ),
                                            )
                                            .into_any_element()
                                    })
                                    .collect::<Vec<_>>()
                            },
                        )
                        .track_scroll(&root.track_scroll_handle),
                    )
                    .child(Scrollbar::vertical(&root.track_scroll_handle).viewport_from_layout())
                }),
        )
}
