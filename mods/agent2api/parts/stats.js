// 侧栏最底部的统计块：模型用量 + 成功/总请求 + 缓存命中 + 账号 + 签到。
// 数据来自自己搭的 code.d8gx.com 面板接口：
//   /api/accounts           账号列表（available、enabled、checkedInToday）
//   /api/stats/requests     请求记录，offset 翻页，每页 limit 上限 500
// 两个接口都只认 Authorization: Bearer <panel token>。
// token 放在 ~/.config/herdr-app/agent2api.json，不进任何仓库。

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { appHome, exec, readTextFile, theme } from "herdr";

const TOP_MODELS = 5; // 堆叠条最多按几个模型分段

// 中文习惯的单位：万 / 亿。
const fmt = (n) => {
  if (n == null) return "—";
  if (n >= 1e8) return `${(n / 1e8).toFixed(2)}亿`;
  if (n >= 1e4) return `${(n / 1e4).toFixed(1)}万`;
  return String(Math.round(n));
};

// 请求数用千分位，跟面板一致。
const num = (n) => (n == null ? "—" : Number(n).toLocaleString("en-US"));

export default class Stats extends View {
  init(_props, cx) {
    this.data = null;
    this.note = null;
    this.busy = false;
    this.refresh(cx);
    // 取数就是两个小请求（summary + accounts，共约 80KB），15 秒一次不心疼。
    cx.timer.every(15000, (cx) => this.refresh(cx));
  }

  async getJson(url, auth) {
    const r = await exec("curl", ["-s", "--compressed", "--max-time", "20", "-H", auth, url]).catch(() => null);
    if (!r || r.code !== 0) return null;
    try {
      return JSON.parse(r.stdout);
    } catch {
      return null;
    }
  }

  refresh(cx) {
    if (this.busy) return;
    this.busy = true;
    cx.spawn(async (cx) => {
      try {
        const raw = await readTextFile(`${appHome()}/agent2api.json`).catch(() => null);
        if (!raw) {
          this.note = "缺 agent2api.json";
          return;
        }
        const cfg = JSON.parse(raw);
        const base = String(cfg.base || "https://code.d8gx.com").replace(/\/+$/, "");
        if (!cfg.token) {
          this.note = "配置里没有 token";
          return;
        }
        const auth = `Authorization: Bearer ${cfg.token}`;

        // 面板报表页用的就是这个汇总接口：一次拿全，不用逐条翻页。
        //   overview  -> tokens / requests / successful
        //   models    -> 各模型用量
        //   cacheRates.last1h -> 近 1 小时缓存命中率
        // 账号可用和签到还在 /api/accounts 里，两个并发。
        const [sum, acc] = await Promise.all([
          this.getJson(`${base}/api/stats/summary`, auth),
          this.getJson(`${base}/api/accounts`, auth),
        ]);
        if (!sum && !acc) {
          this.note = "取不到数据（token 可能过期）";
          return;
        }

        const ov = sum?.data?.overview ?? {};
        const topModels = (sum?.data?.models ?? [])
          .map((m) => [m.label || m.model, m.totalTokens || 0])
          .sort((a, b) => b[1] - a[1])
          .slice(0, TOP_MODELS);
        const list = acc?.data?.accounts ?? [];

        this.data = {
          tokens: ov.tokens ?? 0,
          topModels,
          requests: ov.requests ?? 0,
          ok: ov.successful ?? 0,
          hit: sum?.data?.cacheRates?.last1h?.rate ?? null,
          // available 为 null 表示「这一轮还没查到」，不是不可用；只有 false 才算不可用。
          usable: list.filter((a) => a.available !== false).length,
          accounts: list.length,
          signed: list.filter((a) => a.checkedInToday === true).length,
        };
        this.note = null;
      } catch (e) {
        this.note = String(e?.message || e).slice(0, 48);
      } finally {
        this.busy = false;
        cx.notify();
      }
    });
  }

  render(cx) {
    const t = theme();

    // 一个指标：左上名字、右上数值，下面一条进度。
    // 两段用 flex_grow 分配，是真正的百分比，不是写死的像素。
    const row = (name, value, frac, sub) => {
      const f = Math.max(0, Math.min(1, frac ?? 0));
      return v_flex()
        .w_full()
        .gap(3)
        .child(
          h_flex()
            .w_full()
            .gap(6)
            .items_center()
            .child(div().text_size(11).text_color(t.dim).child(name))
            .child(div().flex_1())
            .when(Boolean(sub), (el) =>
              el.child(div().text_size(10).text_color(t.dim).child(sub)),
            )
            .child(div().text_size(13).font_semibold().text_color(t.dim).child(value)),
        )
        .child(
          h_flex()
            .w_full()
            .h(3)
            .rounded(2)
            .overflow_hidden()
            .child(div().h(3).bg(t.dim).flex_grow(Math.max(0.015, f)))
            .child(div().h(3).bg(t.raised).flex_grow(Math.max(0.0001, 1 - f))),
        );
    };

    // 段色只在亮灰和暗灰之间交替，不用彩色。
    const TINT = [t.muted, t.border];

    // 一根堆叠条：按模型占比分段。
    const stack = (models, total) =>
      h_flex()
        .w_full()
        .h(4)
        .rounded(2)
        .overflow_hidden()
        .bg(t.raised)
        .children(
          models.map(([, v], k) =>
            div()
              .h(4)
              .bg(TINT[k % TINT.length])
              .flex_grow(Math.max(0.0001, total ? v / total : 0)),
          ),
        );

    if (!this.data) {
      return v_flex()
        .size_full()
        .px(12)
        .py(10)
        .justify_center()
        .text_size(10.5)
        .text_color(t.dim)
        .child(this.note ?? "读取中…");
    }

    const d = this.data;
    const rate = d.requests ? d.ok / d.requests : null;
    const usable = d.accounts ? d.usable / d.accounts : null;
    const signed = d.accounts ? d.signed / d.accounts : null;

    return v_flex()
      .size_full()
      .px(12)
      .py(9)
      .gap(5)
      .justify_center()
      // 总 Token：标题 + 数值，下面一根按模型分段的堆叠条
      .child(
        v_flex()
          .w_full()
          .gap(3)
          .child(
            h_flex()
              .w_full()
              .gap(6)
              .items_center()
              .child(div().text_size(9.5).text_color(t.dim).child("总 Token"))
              .child(div().flex_1())
              .child(div().text_size(13).font_semibold().text_color(t.dim).child(fmt(d.tokens))),
          )
          .child(stack(d.topModels, d.tokens)),
      )
      // 请求数据：成功 / 总，条 = 成功率
      .child(row("请求数据", `${num(d.ok)} / ${num(d.requests)}`, rate))
      .child(
        row("缓存命中 · 1h", d.hit == null ? "—" : `${(d.hit * 100).toFixed(1)}%`, d.hit),
      )
      .child(row("账号可用", d.accounts ? `${d.usable}/${d.accounts}` : "—", usable))
      .child(row("今日签到", d.accounts ? `${d.signed}/${d.accounts}` : "—", signed))
      .when(Boolean(this.note), (el) =>
        el.child(div().text_size(9.5).text_color(t.ansi1).child(this.note)),
      );
  }
}
