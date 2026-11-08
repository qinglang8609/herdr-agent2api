# herdr-agent2api

给 [herdr-app](https://herdr.dev) 左侧栏底部加一条统计：**token 用量 / 请求数 / 成功率 / 账号可用 / 今日签到**。数据来自自己搭的 [Agent2API](https://github.com/aimod-cc/Agent2API) 面板接口。

和 abs 界面**完全独立**：自己的 mod、自己的布局文件，abs 的代码和 `abs.json` 一个字节都不动。

## 装

```sh
./install.sh
```

然后填 token：

```sh
open ~/.config/herdr-app/agent2api.json   # 把 token 填进去
```

token 从面板拿：浏览器登录管理面板 → F12 → Application → Cookies → `agent2api-panel`，或者 Network 里任意请求头的 `Authorization: Bearer <token>`。

再切到布局 `abs-stats`（`install.sh` 会自动切）。这个布局就是 abs 的布局多一个节点，所以**前提是已经装了 abs**。

## 数据从哪来

| 接口 | 用途 |
|---|---|
| `GET /api/accounts` | 账号列表：`available`（可用数）、`checkedInToday`（今日签到） |
| `GET /api/stats/requests?limit=500` | 外层 `total` 是请求总数；每条带 `totalTokens`、`status`、`ts` |

认证：`Authorization: Bearer <panel token>`。

**已知限制**：`/api/stats/requests` 分页，每页 50、`limit` 最多 500，且不认 `since`/`range`/`hours`。所以「token」和「成功率」是**最近 500 条**的合计，不是全部历史；「请求」是接口给的 `total`（准确）。

## 刷新

5 分钟一次（`parts/stats.js` 里的 `cx.timer.every(300000, ...)`）。统计数字不需要秒级新鲜，拉一次约 340KB。

## 布局怎么加的

`layouts/abs-stats.json` 是 `layouts/abs.json` 的副本，只在 `sidebar-lists` 末尾多一节：

```json
{ "id": "agent2api-stats", "type": "block",
  "content": { "mod": "agent2api", "props": { "part": "stats" } },
  "size": { "px": 76 } }
```

所以 abs 布局以后若有改动，这份副本要手动同步一次。

## token 失效

面板 token 会过期。过期的表现是组件显示「接口取不到（token 可能过期）」，重新取一个 token 填进 `agent2api.json` 即可，不用重装。
