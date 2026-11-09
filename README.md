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

配置里填**面板的账号密码**就行，插件自己登录：

```json
{
  "base": "https://code.d8gx.com",
  "username": "你的账号",
  "password": "你的密码"
}
```

文件权限是 600，只在本机。登录后的 refresh 会被插件写回这个文件的 `refresh` 字段，**不用管它**。

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

## abs 更新之后怎么办

`layouts/abs-stats.json` 是 `abs.json` 的副本多一个节点。abs 那边更新布局后，这份副本不会自动跟，跑一次：

```sh
./sync-layout.sh
```

它用当前的 `abs.json` 重新生成 `abs-stats.json`（旧的备份成 `.before-sync`），最后切一下布局让改动重载。`abs.json` 只读不改。

除此之外不会互相影响：abs 的 `install.sh` 只动 `mods/abs` 和 `layouts/abs.json`，碰不到 `mods/agent2api`、`layouts/abs-stats.json` 和 `agent2api.json`。

## 接口

| 接口 | 用途 |
|---|---|
| `GET /api/stats/summary` | `overview.tokens / requests / successful`、`models[]`、`cacheRates.last1h.rate` |
| `GET /api/accounts` | 每个账号的 `available`、`checkedInToday` |
| `GET /api/accounts/usage/snapshot` | `data.quotaSources` 里每账号一行 `id:"account"`、`label:"总积分"`，加总就是所有账号的积分总数（60 秒拉一次） |

**为什么积分用 snapshot 不用 `usage`**：`/api/accounts/usage` 是逐账号实时查，23 个账号要 **4 秒**；`usage/snapshot` 是最近一次定时查询的快照，只要 **0.15 秒**。数值一样（都出自服务端 `limiter::sources::rows_for`）。

两个都带 `Authorization: Bearer <panel token>`，用 `curl --compressed` 拉（原始 39KB，压缩后约 5.4KB）。15 秒刷新一次，一次约 0.12 秒。

**注意**：面板的「签到中心」走的是桌面客户端的 Tauri 能力（`window.workbuddyDesktop.getCheckinCenter`），不是 HTTP 接口，所以浏览器/curl 拿不到签到汇总 —— 只能数 `/api/accounts` 里每个账号的 `checkedInToday`。

## 一键装（这台机器已经有 herdr-app + abs）

```sh
gh repo clone qinglang8609/herdr-agent2api /tmp/a2a \
  && A2A_TOKEN='面板token粘这里' sh /tmp/a2a/install.sh \
  && rm -rf /tmp/a2a
```

- 给了 `A2A_TOKEN` 就直接写进 `~/.config/herdr-app/agent2api.json`（600 权限），一步到位
- 不给就生成模板，装完自己填
- 面板换域名了用 `A2A_BASE='https://别的域名'`
- 没有 `gh` 就用 `git clone https://github.com/qinglang8609/herdr-agent2api.git /tmp/a2a`

装完会自动切到 `abs-stats` 布局；没切过去就手动 `herdr-app do layout.switch --name abs-stats`。

## 登录是插件自己管的

面板的凭据是「access 2 小时 + refresh 30 天」（`access.rs:96`）。插件：

1. 用配置里的账号密码登一次，拿到两个令牌
2. access 快过期（提前 5 分钟）就调 `POST /api/panel/refresh` 换新
3. 续期是**轮换**的：每次换出一把新 refresh、寿命重新算 30 天 —— 所以只要这台机器开着，就不会再掉线
4. 新 refresh 原子写回 `agent2api.json`（旧值再用一次会被判重放、整条会话链作废）

机器关了超过 30 天才会需要重新登录，那时插件会用配置里的账号密码自动登，不用你动手。

**注意**：密码是明文存在 `~/.config/herdr-app/agent2api.json`（600 权限），不进任何仓库。
