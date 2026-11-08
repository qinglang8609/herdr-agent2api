// 侧栏最底部的统计块：总 token / 请求 / 成功率 / 账号 / 签到。
// 数据来自自己搭的 code.d8gx.com 面板接口：
//   /api/accounts           账号列表（available、enabled、checkedInToday）
//   /api/stats/requests     请求记录，offset 翻页，每页 limit 上限 500
// 两个接口都只认 Authorization: Bearer <panel token>。
// token 放在 ~/.config/herdr-app/agent2api.json，不进任何仓库。

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { appHome, exec, readTextFile, theme } from "herdr";

const PER = 500; // 接口 limit 上限
const MAX_PAGES = 40; // 翻页上限，防死循环
const BAR = 54; // 进度条宽度（px）

// 中文习惯的单位：万 / 亿。
const fmt = (n) => {
  if (n == null) return "—";
  if (n >= 1e8) return `${(n / 1e8).toFixed(2)}亿`;
  if (n >= 1e4) return `${(n / 1e4).toFixed(1)}万`;
  return String(Math.round(n));
};

export default class Stats extends View {
  init(_props, cx) {
    this.data = null;
    this.note = null;
    this.busy = false;
    this.refresh(cx);
    // 统计数字不用秒级新鲜，5 分钟一次。
    cx.timer.every(300000, (cx) => this.refresh(cx));
  }

  async getJson(url, auth) {
    const r = await exec("curl", ["-s", "--max-time", "20", "-H", auth, url]).catch(() => null);
    if (!r || r.code !== 0) return null;
    try {
      return JSON.parse(r.stdout);
    } catch {
      return null;
    }
  }

  // 全部请求记录：offset 一页页翻到够为止。要算「总 token」就得拿全，
  // 只取最近 500 条会少一个数量级。
  async allRequests(base, auth) {
    const all = [];
    let total = null;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const d = await this.getJson(
        `${base}/api/stats/requests?limit=${PER}&offset=${page * PER}`,
        auth,
      );
      if (!d) break;
      total = d.data?.total ?? total;
      const list = d.data?.entries ?? [];
      all.push(...list);
      if (list.length < PER) break;
      if (total != null && all.length >= total) break;
    }
    return { entries: all, total };
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

        const acc = await this.getJson(`${base}/api/accounts`, auth);
        const req = await this.allRequests(base, auth);
        if (!acc && !req.entries.length) {
          this.note = "取不到数据（token 可能过期）";
          return;
        }

        const list = acc?.data?.accounts ?? [];
        let ok = 0;
        let tokens = 0;
        for (const e of req.entries) {
          if (e.status === 200) ok += 1;
          tokens += e.totalTokens || 0;
        }
        // 近 1 小时缓存命中率。promptTokens 里已经包含 cacheReadTokens，
        // 所以是 cacheRead / promptTokens，不能再把两个数加到一起。
        const cutoff = Date.now() - 3600000;
        let cacheRead = 0;
        let promptAll = 0;
        for (const e of req.entries) {
          if (!e.ts || e.ts < cutoff) continue;
          cacheRead += e.cacheReadTokens || 0;
          promptAll += e.promptTokens || 0;
        }
        this.data = {
          hit: promptAll > 0 ? cacheRead / promptAll : null,
          requests: req.total ?? req.entries.length,
          sampled: req.entries.length,
          ok,
          tokens,
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

    const bar = (frac, color) =>
      div()
        .w(BAR)
        .h(4)
        .flex_none()
        .rounded(2)
        .overflow_hidden()
        .bg(t.border)
        .child(
          div()
            .h(4)
            .rounded(2)
            .bg(color)
            .w(Math.max(3, Math.round(BAR * Math.min(1, Math.max(0, frac))))),
        );

    const label = (text) => div().text_size(10).text_color(t.dim).child(text);
    const number = (text, color) =>
      div().text_size(12.5).font_semibold().text_color(color).child(text);
    const spacer = () => div().flex_1();

    if (!this.data) {
      return v_flex()
        .size_full()
        .px(12)
        .py(10)
        .justify_center()
        .border_t(1)
        .border_color(t.border)
        .text_size(10.5)
        .text_color(t.dim)
        .child(this.note ?? "读取中…");
    }

    const d = this.data;
    const rate = d.sampled ? d.ok / d.sampled : null;
    const usable = d.accounts ? d.usable / d.accounts : null;

    return v_flex()
      .size_full()
      .px(12)
      .py(12)
      .gap(11)
      .justify_center()
      .border_t(1)
      .border_color(t.border)
      // 总 token（青）+ 请求数（白）
      .child(
        h_flex()
          .w_full()
          .gap(6)
          .items_center()
          .child(label("总 Token"))
          .child(number(fmt(d.tokens), t.ansi6))
          .child(spacer())
          .child(label("请求"))
          .child(number(fmt(d.requests ?? 0), t.foreground)),
      )
      // 成功率：绿条 + 绿百分比
      .child(
        h_flex()
          .w_full()
          .gap(8)
          .items_center()
          .child(label("成功率"))
          .child(bar(rate ?? 0, t.ansi2))
          .child(number(rate == null ? "—" : `${(rate * 100).toFixed(1)}%`, t.ansi2))
          .child(spacer()),
      )
      // 缓存命中率（近 1 小时）
      .child(
        h_flex()
          .w_full()
          .gap(8)
          .items_center()
          .child(label("缓存命中率"))
          .child(div().text_size(9).text_color(t.dim).child("近 1 小时"))
          .child(spacer())
          .child(number(d.hit == null ? "—" : `${(d.hit * 100).toFixed(1)}%`, t.ansi5)),
      )
      // 账号可用：蓝条；今日签到：橙字
      .child(
        h_flex()
          .w_full()
          .gap(8)
          .items_center()
          .child(label("账号"))
          .child(bar(usable ?? 0, t.ansi4))
          .child(number(d.accounts ? `${d.usable}/${d.accounts}` : "—", t.ansi4))
          .child(spacer())
          .child(label("签到"))
          .child(number(d.accounts ? `${d.signed}/${d.accounts}` : "—", t.ansi3)),
      )
      .when(Boolean(this.note), (el) =>
        el.child(div().text_size(10).text_color(t.ansi1).child(this.note)),
      );
  }
}
