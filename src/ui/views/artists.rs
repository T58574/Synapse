//! Artists view: browsable list of artists with track counts and genre,
//! clicking an artist opens their tracks in the library.

use super::RootView;
use crate::ui::state::View;

use gpui_kit::component::input::Input;
use gpui_kit::component::scroll::Scrollbar;
use gpui_kit::component::v_virtual_list;
use gpui_kit::component::{h_flex, v_flex, ActiveTheme as _, StyledExt as _};
use gpui_kit::prelude::*;
use gpui_kit::*;
use std::rc::Rc;

pub fn view(root: &RootView, cx: &mut Context<RootView>) -> impl IntoElement {
    let app = root.app.clone();
    let state = app.read(cx);

    let dim = cx.theme().muted_foreground;
    let border = cx.theme().border;
    let head_bg = cx.theme().table_head;
    let hover = cx.theme().table_hover;

    // Filter artists by search query if any
    let needle = state.search.trim().to_lowercase();
    let artists: Vec<_> = state
        .artists
        .iter()
        .filter(|a| {
            needle.is_empty()
                || a.name.to_lowercase().contains(&needle)
                || a.genre.to_lowercase().contains(&needle)
        })
        .cloned()
        .collect();

    let item_sizes = Rc::new(vec![size(px(0.), px(48.)); artists.len()]);

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
                                .child("Artists"),
                        )
                        .child(Input::new(&state.search_input).w(px(320.))),
                )
                .child(
                    div()
                        .text_xs()
                        .text_color(dim)
                        .child(format!("{} artists · click to show tracks", artists.len())),
                ),
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
                .child(div().w(px(36.)).child("#"))
                .child(div().flex_1().min_w_0().child("ARTIST"))
                .child(div().w(px(160.)).child("GENRE"))
                .child(div().w(px(100.)).text_right().child("TRACKS")),
        )
        .child(
            v_flex()
                .flex_grow_1()
                .min_h_0()
                .size_full()
                .relative()
                .overflow_hidden()
                .when(artists.is_empty(), |this| {
                    this.child(
                        div()
                            .size_full()
                            .flex()
                            .items_center()
                            .justify_center()
                            .text_sm()
                            .text_color(dim)
                            .child("No artists found"),
                    )
                })
                .when(!artists.is_empty(), |this| {
                    let artists = Rc::new(artists);
                    this.child(
                        v_virtual_list(
                            cx.entity(),
                            "artists-list",
                            item_sizes,
                            move |root, range: std::ops::Range<usize>, _window, cx| {
                                let app = root.app.clone();
                                let text = cx.theme().foreground;
                                let muted = cx.theme().muted_foreground;
                                let accent = cx.theme().primary;

                                range
                                    .map(|index| {
                                        let Some(artist) = artists.get(index) else {
                                            return div().into_any_element();
                                        };
                                        let name = artist.name.clone();
                                        let track_count = artist.track_count;
                                        let genre = if artist.genre.is_empty() {
                                            "—".to_string()
                                        } else {
                                            artist.genre.clone()
                                        };
                                        let row_bg = if index % 2 == 0 {
                                            cx.theme().background
                                        } else {
                                            cx.theme().muted
                                        };
                                        let app = app.clone();

                                        let initial = name
                                            .chars()
                                            .next()
                                            .unwrap_or('?')
                                            .to_uppercase()
                                            .to_string();

                                        h_flex()
                                            .id(format!("artist-{index}"))
                                            .w_full()
                                            .h(px(48.))
                                            .px_5()
                                            .gap_3()
                                            .text_sm()
                                            .bg(row_bg)
                                            .cursor_pointer()
                                            .hover(move |style| style.bg(hover))
                                            .on_click(move |_, _, cx| {
                                                let target = name.clone();
                                                app.update(cx, |state, cx| {
                                                    state.set_search(target);
                                                    state.set_view(View::Library);
                                                    cx.notify();
                                                });
                                            })
                                            .child(
                                                div()
                                                    .w(px(32.))
                                                    .h(px(32.))
                                                    .rounded_full()
                                                    .bg(cx.theme().sidebar)
                                                    .border_1()
                                                    .border_color(border)
                                                    .flex()
                                                    .items_center()
                                                    .justify_center()
                                                    .font_bold()
                                                    .text_color(accent)
                                                    .child(initial),
                                            )
                                            .child(
                                                div()
                                                    .flex_1()
                                                    .min_w_0()
                                                    .truncate()
                                                    .font_medium()
                                                    .text_color(text)
                                                    .child(artist.name.clone()),
                                            )
                                            .child(
                                                div()
                                                    .w(px(160.))
                                                    .truncate()
                                                    .text_color(muted)
                                                    .child(genre),
                                            )
                                            .child(
                                                div()
                                                    .w(px(100.))
                                                    .text_right()
                                                    .text_color(muted)
                                                    .child(format!("{} tracks", track_count)),
                                            )
                                            .into_any_element()
                                    })
                                    .collect::<Vec<_>>()
                            },
                        )
                        .track_scroll(&root.artists_scroll_handle),
                    )
                    .child(Scrollbar::vertical(&root.artists_scroll_handle).viewport_from_layout())
                }),
        )
}
