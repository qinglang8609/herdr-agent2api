// 侧栏最底部的统计块：token / 请求 / 成功率 / 账号 / 签到。
// 数据来自自己搭的 code.d8gx.com 面板接口：
//   /api/accounts           账号列表（available、checkedInToday）
//   /api/stats/requests     请求总数 total + 每条记录的 totalTokens / status
// 两个接口都只认 Authorization: Bearer <panel token>。
// token 放在 ~/.config/herdr-app/agent2api.json，不进任何仓库。

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { appHome, exec, readTextFile, theme } from "herdr";

// 接口 limit 上限就是 500；拉更多只会更慢。
const PER = 500;
const BAR = 46; // 进度条宽度（px）

const fmt = (n) => {
  if (n == null) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
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
        const req = await this.getJson(`${base}/api/stats/requests?limit=${PER}`, auth);
        if (!acc && !req) {
          this.note = "取不到数据（token 可能过期）";
          return;
        }

        const list = acc?.data?.accounts ?? [];
        const entries = req?.data?.entries ?? [];
        let ok = 0;
        let tokens = 0;
        for (const e of entries) {
          if (e.status === 200) ok += 1;
          tokens += e.totalTokens || 0;
        }
        this.data = {
          requests: req?.data?.total ?? null,
          sampled: entries.length,
          ok,
          tokens,
          usable: list.filter((a) => a.available === true).length,
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

    // 一根进度条：底槽用 border 色，填充用传进来的颜色。
    const bar = (frac, color) =>
      div()
        .w(BAR)
        .h(3)
        .flex_none()
        .rounded(2)
        .overflow_hidden()
        .bg(t.border)
        .child(
          div()
            .h(3)
            .rounded(2)
            .bg(color)
            .w(Math.max(2, Math.round(BAR * Math.min(1, Math.max(0, frac))))),
        );

    const label = (text) => div().text_size(9.5).text_color(t.dim).child(text);
    const number = (text, color) => div().text_size(11).font_semibold().text_color(color).child(text);
    const spacer = () => div().flex_1();

    if (!this.data) {
      return v_flex()
        .size_full()
        .px(10)
        .py(7)
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
    const signed = d.accounts ? d.signed / d.accounts : null;

    return v_flex()
      .size_full()
      .px(10)
      .py(7)
      .gap(4)
      .justify_center()
      .border_t(1)
      .border_color(t.border)
      // 第一行：token（青）+ 请求数（白）
      .child(
        h_flex()
          .w_full()
          .gap(5)
          .items_center()
          .child(label("TOKEN"))
          .child(number(fmt(d.tokens), t.ansi6))
          .child(spacer())
          .child(label("请求"))
          .child(number(fmt(d.requests ?? 0), t.foreground)),
      )
      // 第二行：成功率进度条（绿）
      .child(
        h_flex()
          .w_full()
          .gap(6)
          .items_center()
          .child(label("成功"))
          .child(bar(rate ?? 0, t.ansi2))
          .child(number(rate == null ? "—" : `${(rate * 100).toFixed(1)}%`, t.ansi2)),
      )
      // 第三行：账号可用（蓝）与今日签到（橙），各带一条
      .child(
        h_flex()
          .w_full()
          .gap(6)
          .items_center()
          .child(label("账号"))
          .child(bar(usable ?? 0, t.ansi4))
          .child(number(`${d.usable}/${d.accounts}`, t.ansi4))
          .child(spacer())
          .child(label("签到"))
          .child(number(d.accounts ? `${d.signed}/${d.accounts}` : "—", t.ansi3)),
      )
      .when(Boolean(this.note), (el) => el.child(div().text_size(9.5).text_color(t.ansi1).child(this.note)));
  }
}
