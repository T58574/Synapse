//! Root view, chrome and shared widget helpers.

pub mod artists;
pub mod equalizer;
pub mod library;
pub mod player;
pub mod settings;

use super::state::{AppState, View};
use super::theme;

use gpui_kit::component::button::Button;
use gpui_kit::component::slider::{SliderEvent, SliderState};
use gpui_kit::component::VirtualListScrollHandle;
use gpui_kit::component::{h_flex, v_flex, ActiveTheme as _, Sizable as _, StyledExt as _};
use gpui_kit::prelude::*;
use gpui_kit::*;

pub struct Sliders {
    pub seek: Entity<SliderState>,
    pub volume: Entity<SliderState>,
    pub crossfade: Entity<SliderState>,
    pub eq: Vec<Entity<SliderState>>,
    pub dsp: Vec<Entity<SliderState>>,
}

pub const DSP_KEYS: [&str; 5] = ["limiter", "width", "reverb", "bass", "treble"];
pub const DSP_LABELS: [&str; 5] = ["Limiter", "Stereo width", "Reverb", "Bass boost", "Treble"];
pub const EQ_LABELS: [&str; 10] = [
    "40", "80", "160", "250", "500", "1k", "2k", "4k", "8k", "16k",
];
pub const EQ_RANGE: f32 = 12.0;

fn slider(min: f32, max: f32, step: f32, value: f32) -> SliderState {
    SliderState::new().min(min).max(max).step(step).default_value(value)
}

#[derive(Default)]
pub struct PendingSync {
    seek: Option<f32>,
    volume: Option<f32>,
    crossfade: Option<f32>,
}

#[derive(Default)]
pub struct Dragging {
    seek: bool,
    volume: bool,
    crossfade: bool,
}

pub struct RootView {
    pub app: Entity<AppState>,
    pub sliders: Sliders,
    pub pending: PendingSync,
    pub dragging: Dragging,
    pub track_scroll_handle: VirtualListScrollHandle,
    pub artists_scroll_handle: VirtualListScrollHandle,
}

impl RootView {
    pub fn new(app: Entity<AppState>, cx: &mut Context<Self>) -> Self {
        let initial_volume = app.read(cx).volume;
        let initial_crossfade = app.read(cx).crossfade as f32;

        let seek = cx.new(|_| slider(0.0, 1.0, 0.001, 0.0));
        let volume = cx.new(|_| slider(0.0, 1.0, 0.01, initial_volume));
        let crossfade = cx.new(|_| slider(1.0, 12.0, 0.5, initial_crossfade));
        let eq: Vec<Entity<SliderState>> = (0..10)
            .map(|_| cx.new(|_| slider(-EQ_RANGE, EQ_RANGE, 0.5, 0.0)))
            .collect();
        let dsp: Vec<Entity<SliderState>> = DSP_KEYS
            .iter()
            .map(|key| {
                let (min, max, step, default) = match *key {
                    "limiter" => (0.0, 1.0, 0.05, 0.0),
                    "width" => (0.5, 2.0, 0.05, 1.0),
                    "reverb" => (0.0, 1.0, 0.05, 0.0),
                    "bass" => (0.0, 1.0, 0.05, 0.0),
                    "treble" => (0.0, 1.0, 0.05, 0.0),
                    _ => (0.0, 1.0, 0.05, 0.0),
                };
                cx.new(|_| slider(min, max, step, default))
            })
            .collect();

        cx.subscribe(&seek, |this: &mut Self, _, event: &SliderEvent, cx| {
            match event {
                // While the user drags, playback ticks must not stomp the thumb.
                SliderEvent::Change(_) => this.dragging.seek = true,
                SliderEvent::Release(value) => {
                    this.dragging.seek = false;
                    let fraction = value.start() as f64;
                    this.app.update(cx, |state, cx| {
                        let seconds = fraction * state.playback.duration;
                        state.seek(seconds);
                        cx.notify();
                    });
                }
            }
        })
        .detach();

        cx.subscribe(
            &volume,
            |this: &mut Self, _, event: &SliderEvent, cx| match event {
                SliderEvent::Change(value) => {
                    this.dragging.volume = true;
                    let value = value.start();
                    this.app.update(cx, |state, cx| {
                        state.set_volume(value);
                        cx.notify();
                    });
                }
                SliderEvent::Release(_) => {
                    this.dragging.volume = false;
                    this.app.update(cx, |state, _| state.persist_volume());
                }
            },
        )
        .detach();

        cx.subscribe(
            &crossfade,
            |this: &mut Self, _, event: &SliderEvent, cx| match event {
                SliderEvent::Change(_) => this.dragging.crossfade = true,
                SliderEvent::Release(value) => {
                    this.dragging.crossfade = false;
                    let value = value.start() as f64;
                    this.app.update(cx, |state, cx| {
                        state.set_crossfade(value);
                        cx.notify();
                    });
                }
            },
        )
        .detach();

        for (band, state) in eq.iter().enumerate() {
            cx.subscribe(state, move |this: &mut Self, _, event: &SliderEvent, cx| {
                if let SliderEvent::Change(value) = event {
                    let value = value.start();
                    this.app.update(cx, |state, cx| {
                        state.set_eq_band(band, value);
                        cx.notify();
                    });
                }
            })
            .detach();
        }

        for (index, state) in dsp.iter().enumerate() {
            cx.subscribe(state, move |this: &mut Self, _, event: &SliderEvent, cx| {
                if let SliderEvent::Change(value) = event {
                    let value = value.start();
                    this.app.update(cx, |state, cx| {
                        state.set_dsp_param(DSP_KEYS[index], value);
                        cx.notify();
                    });
                }
            })
            .detach();
        }

        cx.observe(&app, |this, _, cx| {
            let (position, duration, volume, crossfade) = {
                let state = this.app.read(cx);
                (
                    state.playback.position,
                    state.playback.duration,
                    state.volume,
                    state.crossfade,
                )
            };
            let fraction = if duration > 0.0 {
                (position / duration).clamp(0.0, 1.0) as f32
            } else {
                0.0
            };
            if !this.dragging.seek
                && (this.sliders.seek.read(cx).value().start() - fraction).abs() > 0.002
            {
                this.pending.seek = Some(fraction);
            }
            if !this.dragging.volume
                && (this.sliders.volume.read(cx).value().start() - volume).abs() > 0.005
            {
                this.pending.volume = Some(volume);
            }
            if !this.dragging.crossfade
                && (this.sliders.crossfade.read(cx).value().start() - crossfade as f32).abs() > 0.01
            {
                this.pending.crossfade = Some(crossfade as f32);
            }
            cx.notify();
        })
        .detach();

        Self {
            app,
            pending: PendingSync::default(),
            dragging: Dragging::default(),
            sliders: Sliders {
                seek,
                volume,
                crossfade,
                eq,
                dsp,
            },
            track_scroll_handle: VirtualListScrollHandle::new(),
            artists_scroll_handle: VirtualListScrollHandle::new(),
        }
    }

    fn sync_sliders(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if let Some(value) = self.pending.seek.take() {
            let slider = self.sliders.seek.clone();
            slider.update(cx, |state, cx| state.set_value(value, window, cx));
        }
        if let Some(value) = self.pending.volume.take() {
            let slider = self.sliders.volume.clone();
            slider.update(cx, |state, cx| state.set_value(value, window, cx));
        }
        if let Some(value) = self.pending.crossfade.take() {
            let slider = self.sliders.crossfade.clone();
            slider.update(cx, |state, cx| state.set_value(value, window, cx));
        }
    }

    pub fn reset_sliders(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        for slider in &self.sliders.eq {
            slider.update(cx, |state, cx| state.set_value(0.0, window, cx));
        }
        self.app.update(cx, |state, cx| {
            state.reset_eq();
            cx.notify();
        });
    }

    fn header(&self, cx: &mut Context<Self>) -> impl IntoElement {
        let app = self.app.clone();
        let state = self.app.read(cx);
        let view = state.view;
        let playing = state.playback.playing;
        let visualizer = state.visualizer;
        let spectrum = state.spectrum;
        let accent = cx.theme().primary;
        let dim = cx.theme().muted_foreground;

        let (app_a, app_b) = (app.clone(), app.clone());
        let (app_c, app_d) = (app.clone(), app.clone());

        h_flex()
            .h(px(54.))
            .px_4()
            .gap_4()
            .border_b_1()
            .border_color(cx.theme().border)
            .bg(cx.theme().background)
            .child(
                div()
                    .text_lg()
                    .font_bold()
                    .text_color(cx.theme().foreground)
                    .child("SYNAPSE"),
            )
            .child(
                h_flex()
                    .gap_1()
                    .child(tab(
                        "nav-library",
                        "Library",
                        view == View::Library || view == View::Artists,
                        {
                            let app = app_a;
                            move |cx| {
                                app.update(cx, |state, cx| {
                                    state.set_view(View::Library);
                                    cx.notify();
                                })
                            }
                        },
                    ))
                    .child(tab("nav-settings", "Settings", view == View::Settings, {
                        let app = app_b;
                        move |cx| {
                            app.update(cx, |state, cx| {
                                state.set_view(View::Settings);
                                cx.notify();
                            })
                        }
                    })),
            )
            .child(
                h_flex()
                    .flex_1()
                    .justify_center()
                    .h(px(26.))
                    .gap(px(2.))
                    .children((0..super::state::SPECTRUM_BANDS).map(|i| {
                        let level = if playing && visualizer {
                            spectrum[i]
                        } else {
                            0.0
                        };
                        div()
                            .w(px(2.5))
                            .h(px(22.0 * level.max(0.04)))
                            .rounded_full()
                            .bg(if level > 0.0 {
                                accent
                            } else {
                                dim.opacity(0.25)
                            })
                    })),
            )
            .child(
                h_flex()
                    .gap_2()
                    .child(
                        Button::new("open-folder")
                            .small()
                            .label("Open folder")
                            .on_click({
                                let app = app_c;
                                move |_, _, cx| {
                                    app.update(cx, |state, cx| {
                                        state.choose_folder();
                                        cx.notify();
                                    });
                                }
                            }),
                    )
                    .child(Button::new("scan").small().label("Scan").on_click({
                        let app = app_d;
                        move |_, _, cx| {
                            app.update(cx, |state, cx| {
                                state.scan_directory(std::path::PathBuf::from(
                                    state.music_dir.clone(),
                                ));
                                cx.notify();
                            });
                        }
                    }))
                    .child(
                        Button::new("eq-toggle")
                            .small()
                            .label("Equalizer")
                            .on_click({
                                let app = self.app.clone();
                                move |_, _, cx| {
                                    app.update(cx, |state, cx| {
                                        state.toggle_equalizer();
                                        cx.notify();
                                    });
                                }
                            }),
                    ),
            )
    }

    fn body(&self, cx: &mut Context<Self>) -> impl IntoElement {
        let (view, show_eq, show_queue) = {
            let state = self.app.read(cx);
            (state.view, state.show_equalizer, state.show_queue)
        };

        let content = match view {
            View::Library => library::view(self, cx).into_any_element(),
            View::Artists => artists::view(self, cx).into_any_element(),
            View::Settings => settings::view(self, cx).into_any_element(),
        };

        h_flex()
            .flex_1()
            .min_h_0()
            .items_stretch()
            .child(library::sidebar(self, cx))
            .child(v_flex().flex_1().min_w_0().h_full().child(content))
            .when(show_eq, |this| this.child(equalizer::view(self, cx)))
            .when(show_queue, |this| this.child(player::queue_panel(self, cx)))
    }
}

impl Render for RootView {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        self.sync_sliders(window, cx);
        v_flex()
            .size_full()
            .bg(cx.theme().background)
            .text_color(cx.theme().foreground)
            .child(self.header(cx))
            .child(self.body(cx))
            .child(player::view(self, cx))
    }
}

pub fn tab(
    id: &'static str,
    label: &'static str,
    active: bool,
    on_click: impl Fn(&mut App) + 'static,
) -> impl IntoElement {
    let accent = theme::c(theme::C_ACCENT);
    let surface = theme::c(theme::C_SURFACE_HI);
    div()
        .id(id)
        .px_3()
        .py_1()
        .rounded_md()
        .text_sm()
        .cursor_pointer()
        .when(active, |this| this.bg(surface).text_color(accent))
        .when(!active, |this| {
            this.text_color(theme::c(theme::C_TEXT_DIM))
                .hover(|style| style.bg(surface))
        })
        .on_click(move |_, _, cx| on_click(cx))
        .child(label)
}
