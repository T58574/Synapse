//! Ten-band equalizer and DSP panel.

use super::RootView;
use crate::ui::views::{DSP_LABELS, EQ_LABELS, EQ_RANGE};

use gpui_kit::component::button::Button;
use gpui_kit::component::slider::Slider;
use gpui_kit::component::{h_flex, v_flex, ActiveTheme as _, Sizable as _, StyledExt as _};
use gpui_kit::prelude::*;
use gpui_kit::*;

pub fn view(root: &RootView, cx: &mut Context<RootView>) -> impl IntoElement {
    let app = root.app.clone();
    let state = app.read(cx);
    let dim = cx.theme().muted_foreground;

    v_flex()
        .w(px(300.))
        .h_full()
        .flex_shrink_0()
        .border_l_1()
        .border_color(cx.theme().border)
        .bg(cx.theme().sidebar)
        .p_3()
        .gap_3()
        .child(
            h_flex()
                .justify_between()
                .items_center()
                .child(div().text_sm().font_semibold().child("Equalizer"))
                .child(Button::new("eq-reset").small().label("Reset").on_click({
                    let root = cx.entity();
                    move |_, window, cx| {
                        root.update(cx, |root, cx| root.reset_sliders(window, cx));
                    }
                })),
        )
        .child(
            h_flex().h(px(170.)).gap_1().items_end().children(
                EQ_LABELS
                    .iter()
                    .enumerate()
                    .map(|(band, label)| {
                        v_flex()
                            .flex_1()
                            .h_full()
                            .gap_1()
                            .items_center()
                            .child(
                                div()
                                    .flex_1()
                                    .h_full()
                                    .child(Slider::new(&root.sliders.eq[band]).vertical()),
                            )
                            .child(div().text_xs().text_color(dim).child(*label))
                    })
                    .collect::<Vec<_>>(),
            ),
        )
        .child(
            div()
                .text_xs()
                .text_color(dim)
                .child(format!("Gain range ±{:.0} dB", EQ_RANGE)),
        )
        .child(div().h(px(1.)).w_full().bg(cx.theme().border))
        .child(
            v_flex()
                .gap_2()
                .children(DSP_LABELS.iter().enumerate().map(|(index, label)| {
                    h_flex()
                        .gap_2()
                        .items_center()
                        .child(div().w(px(96.)).text_xs().text_color(dim).child(*label))
                        .child(div().flex_1().child(Slider::new(&root.sliders.dsp[index])))
                })),
        )
        .child(
            div()
                .text_xs()
                .text_color(dim)
                .child(format!("Master volume {:.0}%", state.volume * 100.0)),
        )
}
