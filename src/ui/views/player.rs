//! Bottom deck, transport controls and the queue panel.

use super::RootView;
use crate::ui::format::format_duration;

use gpui_kit::component::button::{Button, ButtonVariants as _};
use gpui_kit::component::slider::Slider;
use gpui_kit::component::Icon;
use gpui_kit::component::{h_flex, v_flex, ActiveTheme as _, Sizable as _, StyledExt as _};
use gpui_kit::prelude::*;
use gpui_kit::*;

pub fn view(root: &RootView, cx: &mut Context<RootView>) -> impl IntoElement {
    let app = root.app.clone();
    let state = app.read(cx);

    let title = if state.playback.title.is_empty() {
        "Nothing playing".to_string()
    } else {
        state.playback.title.clone()
    };
    let artist = if state.playback.artist.is_empty() {
        "Select a track to start".to_string()
    } else {
        state.playback.artist.clone()
    };
    let position = format_duration(state.playback.position);
    let duration = format_duration(state.playback.duration);
    let playing = state.playback.playing;
    let cover = state.playback.cover.clone();
    let queue_count = state.player.queue.len();

    let dim = cx.theme().muted_foreground;
    let border = cx.theme().border;
    let accent = cx.theme().primary;
    let surface = cx.theme().sidebar;

    let (app_play, app_prev, app_next, app_queue) =
        (app.clone(), app.clone(), app.clone(), app.clone());

    h_flex()
        .h(px(92.))
        .flex_shrink_0()
        .px_4()
        .gap_4()
        .bg(surface)
        .border_t_1()
        .border_color(border)
        .child(
            div()
                .w(px(56.))
                .h(px(56.))
                .flex_shrink_0()
                .rounded_md()
                .bg(cx.theme().muted)
                .overflow_hidden()
                .when_some(cover, |this, cover| {
                    this.child(
                        img(ImageSource::Image(cover))
                            .w(px(56.))
                            .h(px(56.))
                            .rounded_md(),
                    )
                })
                .when(state.playback.cover.is_none(), |this| {
                    this.flex()
                        .items_center()
                        .justify_center()
                        .text_color(dim)
                        .child("♪")
                }),
        )
        .child(
            v_flex()
                .w(px(220.))
                .flex_shrink_0()
                .gap_1()
                .child(
                    div()
                        .text_sm()
                        .font_semibold()
                        .truncate()
                        .text_color(cx.theme().foreground)
                        .child(title),
                )
                .child(div().text_xs().truncate().text_color(dim).child(artist))
                .child(
                    h_flex()
                        .gap_2()
                        .text_xs()
                        .text_color(dim)
                        .child(format!("{} BPM", state.playback.bpm.round() as i64))
                        .child("·")
                        .child(if state.playback.key.is_empty() {
                            "—".to_string()
                        } else {
                            state.playback.key.clone()
                        }),
                ),
        )
        .child(
            v_flex()
                .flex_1()
                .min_w_0()
                .gap_1()
                .child(
                    h_flex()
                        .gap_2()
                        .items_center()
                        .child(
                            Button::new("prev")
                                .small()
                                .icon(Icon::new(gpui_kit::assets::IconName::SkipBack))
                                .on_click({
                                    let app = app_prev;
                                    move |_, _, cx| {
                                        app.update(cx, |state, cx| {
                                            state.play_prev();
                                            cx.notify();
                                        });
                                    }
                                }),
                        )
                        .child(
                            Button::new("play")
                                .primary()
                                .icon(if playing {
                                    Icon::new(gpui_kit::assets::IconName::Pause)
                                } else {
                                    Icon::new(gpui_kit::assets::IconName::Play)
                                })
                                .on_click({
                                    let app = app_play;
                                    move |_, _, cx| {
                                        app.update(cx, |state, cx| {
                                            state.toggle_play();
                                            cx.notify();
                                        });
                                    }
                                }),
                        )
                        .child(
                            Button::new("next")
                                .small()
                                .icon(Icon::new(gpui_kit::assets::IconName::SkipForward))
                                .on_click({
                                    let app = app_next;
                                    move |_, _, cx| {
                                        app.update(cx, |state, cx| {
                                            state.play_next();
                                            cx.notify();
                                        });
                                    }
                                }),
                        )
                        .child({
                            let btn = Button::new("shuffle")
                                .small()
                                .icon(Icon::new(gpui_kit::assets::IconName::Shuffle))
                                .on_click({
                                    let app = app.clone();
                                    move |_, _, cx| {
                                        app.update(cx, |state, cx| {
                                            state.toggle_shuffle();
                                            cx.notify();
                                        });
                                    }
                                });
                            if state.shuffle {
                                btn.primary()
                            } else {
                                btn
                            }
                        })
                        .child({
                            let btn = Button::new("repeat")
                                .small()
                                .icon(Icon::new(gpui_kit::assets::IconName::Repeat))
                                .on_click({
                                    let app = app.clone();
                                    move |_, _, cx| {
                                        app.update(cx, |state, cx| {
                                            state.toggle_repeat();
                                            cx.notify();
                                        });
                                    }
                                });
                            if state.repeat {
                                btn.primary()
                            } else {
                                btn
                            }
                        })
                        .child(
                            Button::new("queue")
                                .small()
                                .icon(Icon::new(gpui_kit::assets::IconName::ListMusic))
                                .label(format!("Queue {}", queue_count))
                                .on_click({
                                    let app = app_queue;
                                    move |_, _, cx| {
                                        app.update(cx, |state, cx| {
                                            state.toggle_queue();
                                            cx.notify();
                                        });
                                    }
                                }),
                        ),
                )
                .child(
                    h_flex()
                        .gap_2()
                        .items_center()
                        .text_xs()
                        .text_color(dim)
                        .child(div().w(px(38.)).child(position))
                        .child(div().flex_1().child(Slider::new(&root.sliders.seek)))
                        .child(div().w(px(38.)).child(duration)),
                ),
        )
        .child(
            h_flex()
                .w(px(180.))
                .gap_2()
                .items_center()
                .child(div().text_xs().text_color(dim).child("VOL"))
                .child(div().flex_1().child(Slider::new(&root.sliders.volume))),
        )
        .child(
            Button::new("automix")
                .small()
                .label(if state.automix {
                    "Automix on"
                } else {
                    "Automix off"
                })
                .on_click({
                    let app = app.clone();
                    move |_, _, cx| {
                        app.update(cx, |state, cx| {
                            state.toggle_automix();
                            cx.notify();
                        });
                    }
                }),
        )
        .child(div().w(px(8.)).h(px(8.)).rounded_full().bg(if playing {
            accent
        } else {
            dim.opacity(0.4)
        }))
}

pub fn queue_panel(root: &RootView, cx: &mut Context<RootView>) -> impl IntoElement {
    let app = root.app.clone();
    let state = app.read(cx);
    let queue: Vec<_> = state.player.queue.iter().cloned().collect();
    let dim = cx.theme().muted_foreground;

    v_flex()
        .w(px(280.))
        .h_full()
        .flex_shrink_0()
        .border_l_1()
        .border_color(cx.theme().border)
        .bg(cx.theme().sidebar)
        .child(
            h_flex()
                .px_4()
                .py_3()
                .justify_between()
                .items_center()
                .child(div().text_sm().font_semibold().child("Queue"))
                .child(Button::new("clear-queue").small().label("Clear").on_click({
                    let app = app.clone();
                    move |_, _, cx| {
                        app.update(cx, |state, cx| {
                            state.queue_clear();
                            cx.notify();
                        });
                    }
                })),
        )
        .child(
            v_flex()
                .id("queue-list")
                .flex_1()
                .min_h_0()
                .overflow_y_scroll()
                .children(queue.into_iter().enumerate().map(|(index, track)| {
                    let app = app.clone();
                    h_flex()
                        .px_4()
                        .py_2()
                        .gap_2()
                        .items_center()
                        .border_b_1()
                        .border_color(cx.theme().border)
                        .child(
                            v_flex()
                                .flex_1()
                                .min_w_0()
                                .child(div().text_sm().truncate().child(track.title.clone()))
                                .child(
                                    div()
                                        .text_xs()
                                        .truncate()
                                        .text_color(dim)
                                        .child(track.artist.clone()),
                                ),
                        )
                        .child(
                            Button::new(format!("queue-remove-{index}"))
                                .small()
                                .icon(Icon::new(gpui_kit::assets::IconName::X))
                                .on_click(move |_, _, cx| {
                                    app.update(cx, |state, cx| {
                                        state.queue_remove(index);
                                        cx.notify();
                                    });
                                }),
                        )
                        .into_any_element()
                })),
        )
}
