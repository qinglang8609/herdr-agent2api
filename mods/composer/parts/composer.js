// 终端下面的输入框：回车把文字贴进当前 pane 的终端并回车（hc send），
// Shift+回车换行；agent 在干活时右边的按钮变成 Stop（hc interrupt）。
//
// 目标是「当前聚焦的 pane」而不是「当前线程的 agent」，所以切 pane 就换目标 ——
// 看起来就像每个 pane 下面都挂着一个。

import { View, div } from "gpui-kit";
import { v_flex, h_flex, TextareaState, Textarea } from "gpui-base";
import { theme, hc, notify, focused, panes, spaces, agents, layout, run } from "herdr";

// 输入框的高度：默认 1 行，内容多了自己长高。布局节点是有固定高度的，所以
// 「长高」只能靠 layout.resize 改节点高度，改的是这个节点的 px。
const LINE_H = 19; // text_size(13) 的一行
const BASE = 75; // 1 行时的高度：行 19 + 框内边距 14 + 按钮行 28 + 外上下 14
const MAX_ROWS = 8;
const CHARS = 110; // 保守估计一行能放多少字符（用来算软换行占了几行）

function nodeById(node, id) {
  if (!node) return null;
  if (node.id === id) return node;
  for (const c of node.children ?? []) {
    const hit = nodeById(c, id);
    if (hit) return hit;
  }
  return null;
}

// 多行框按 Enter 会先插入一个 "\n" 再触发 submit，所以「原样发送」要把那个换行
// 摘掉（studio 的 composer 也这么做）。Shift+Enter 才保留换行。
function withoutNewEnter(before, now) {
  if (typeof now !== "string") return before ?? "";
  if (now.length !== (before ?? "").length + 1) return now.replace(/\n$/, "");
  for (let i = 0; i < now.length; i += 1) {
    if (now[i] !== before[i]) return now[i] === "\n" ? now.slice(0, i) + now.slice(i + 1) : now;
  }
  return now;
}

export default class Composer extends View {
  init(_props, cx) {
    this.text = "";
    this.before = "";
    this.touched = false;
    this.busy = false;
    // 当前节点高度，用来判断要不要真的调 layout.resize（每敲一个字都调没必要）
    this.px = nodeById(layout(), "composer")?.size?.px ?? BASE;
    this.input = TextareaState.new({ placeholder: "写点什么发给这个 pane，回车发送" });
    this.input.set_soft_wrap(true);

    this.input.on("change", (_e, cx) => {
      this.before = this.text;
      this.text = this.input.value();
      this.fit();
      cx.notify();
    });
    this.input.on("submit", (e, cx) => {
      if (e?.shift) {
        this.text = this.input.value();
        return;
      }
      const now = this.input.value();
      this.text = withoutNewEnter(this.text === now ? this.before : this.text, now);
      this.send(cx);
    });
    this.input.on("focus", (_e, cx) => {
      this.touched = true;
      cx.notify();
    });
    this.input.on("blur", (_e, cx) => {
      this.touched = false;
      cx.notify();
    });
  }

  // 这段文字要占几行：按显式换行切开，每段再按宽度估一次软换行。
  rowsOf(text) {
    let rows = 0;
    for (const seg of String(text ?? "").split("\n")) {
      rows += Math.max(1, Math.ceil(seg.length / CHARS));
    }
    return Math.max(1, Math.min(MAX_ROWS, rows));
  }

  // 让布局节点跟着内容长高（1 行是 BASE，每多一行加 LINE_H）。
  fit() {
    const want = BASE + (this.rowsOf(this.text) - 1) * LINE_H;
    if (want === this.px) return;
    this.px = want;
    run("layout.resize", { id: "composer", px: want });
  }

  // 当前该写给谁：聚焦的 pane 的终端；它要是没有（比如焦点在 mod 块上），
  // 退到当前空间当前 tab 的第一个终端。
  target() {
    const f = focused();
    const list = agents() ?? [];
    if (f?.terminal) {
      return { address: f.terminal, agent: list.find((a) => a.address === f.terminal) ?? null };
    }
    const space = (spaces() ?? []).find((s) => s.active);
    const tab = (space?.tabs ?? []).find((t) => t.active);
    const pane = tab
      ? (panes() ?? []).find((p) => p.tab === tab.id && p.terminal)
      : null;
    return pane?.terminal
      ? { address: pane.terminal, agent: list.find((a) => a.address === pane.terminal) ?? null }
      : null;
  }

  send(cx) {
    const text = this.text.trim();
    const to = this.target();
    if (!text) return;
    if (!to) {
      notify({ title: "这个 pane 没有终端", body: "先开一个终端再发。", level: "info" });
      return;
    }
    this.text = "";
    this.input.set_value("");
    this.fit();
    cx.notify();
    cx.spawn(async () => {
      const r = await hc(["send", to.address, text]).catch((e) => ({ code: 1, stderr: String(e) }));
      if (r?.code !== 0) {
        notify({
          title: "发不出去",
          body: String(r?.stderr || "").trim().split("\n")[0] || "hc send 失败",
          level: "error",
        });
      }
    });
  }

  render() {
    const t = theme();
    const to = this.target();
    const a = to?.agent ?? null;
    const working = a?.status === "working";
    const ready = Boolean(this.text.trim()) && Boolean(to);
    const label = a
      ? `${a.app || "agent"}${a.status ? ` · ${a.status}` : ""}`
      : to
        ? to.address
        : "没有终端";

    return v_flex()
      .size_full()
      .px(10)
      .pt(6)
      .pb(8)
      .child(
        v_flex()
          .id("cp-box")
          .w_full()
          .flex_1()
          .min_h(0)
          .rounded(12)
          .bg(t.popover)
          .border_1()
          .border_color(this.touched ? t.input : t.border)
          .px(12)
          .pt(8)
          .pb(6)
          .gap(4)
          .cursor_text()
          .on_click(() => this.input.focus())
          .child(
            div()
              .flex_1()
              .min_h(0)
              .child(
                Textarea.new(this.input)
                  .w_full()
                  .h_full()
                  .text_size(13)
                  .text_color(t.foreground),
              ),
          )
          .child(
            h_flex()
              .w_full()
              .h(24)
              .gap(8)
              .items_center()
              .child(div().text_size(10.5).text_color(t.dim).child(label))
              .child(div().flex_1())
              .child(
                working && !ready
                  ? div()
                      .id("cp-stop")
                      .h(24)
                      .px(10)
                      .rounded(12)
                      .bg(t.solid)
                      .flex()
                      .items_center()
                      .justify_center()
                      .text_size(11)
                      .text_color(t.solid_foreground)
                      .cursor_pointer()
                      .tooltip("打断它（hc interrupt）")
                      .on_click((_e, cx) => {
                        cx.stop_propagation();
                        this.busy = true;
                        hc(["interrupt", to.address]);
                        cx.notify();
                      })
                      .child("Stop")
                  : div()
                      .id("cp-send")
                      .h(24)
                      .px(12)
                      .rounded(12)
                      .bg(ready ? t.solid : t.selected)
                      .flex()
                      .items_center()
                      .justify_center()
                      .text_size(11)
                      .text_color(ready ? t.solid_foreground : t.dim)
                      .when(ready, (el) => el.cursor_pointer())
                      .tooltip("回车发送")
                      .on_click((_e, cx) => {
                        cx.stop_propagation();
                        this.send(cx);
                      })
                      .child("发送"),
              ),
          ),
      );
  }
}
