// composer：终端下面的输入框，跟着当前聚焦的 pane 走。
// 布局节点写 { mod: "composer", props: { part: "composer" } }。

import { View, div } from "gpui-kit";
import { props, theme } from "herdr";
import Composer from "./parts/composer.js";

const PARTS = {
  composer: Composer,
};

export default class ComposerMod extends View {
  init(_props, cx) {
    const Part = PARTS[props()?.part];
    this.part = Part ? new Part() : null;
    if (this.part?.init) {
      if (this.part.init.length >= 2) this.part.init(_props, cx);
      else this.part.init(cx);
    }
  }

  render(cx) {
    if (!this.part) {
      return div()
        .size_full()
        .p(8)
        .text_size(11)
        .text_color(theme().dim)
        .child(`composer: 未知的 part "${props()?.part}"`);
    }
    return this.part.render(cx);
  }
}
