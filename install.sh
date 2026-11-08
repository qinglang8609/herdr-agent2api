#!/bin/sh
# 装 agent2api 的侧栏统计块：只动它自己的 mod 和一份独立布局，不碰 abs。
# 已经装过的直接重跑即可：模块覆盖，布局写回。
set -e

SRC=$(cd "$(dirname "$0")" && pwd)
HOME_DIR="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
MODS="$HOME_DIR/mods"

[ -d "$HOME_DIR" ] || { echo "找不到 herdr-app 配置目录：$HOME_DIR" >&2; exit 1; }

mkdir -p "$MODS" "$HOME_DIR/layouts"

# mod：复制而不是软链（跟 abs 一样，省得 image() 读软链出问题）。
rm -rf "$MODS/agent2api"
cp -R "$SRC/mods/agent2api" "$MODS/agent2api"

# 布局：单独一份 abs-stats.json，abs.json 原样不动。
if [ -f "$HOME_DIR/layouts/abs-stats.json" ]; then
  cp "$HOME_DIR/layouts/abs-stats.json" "$HOME_DIR/layouts/abs-stats.json.before-install"
fi
cp -f "$SRC/layouts/abs-stats.json" "$HOME_DIR/layouts/abs-stats.json"

# token 配置：没有才生成，不覆盖你已经填好的。
if [ ! -f "$HOME_DIR/agent2api.json" ]; then
  cp "$SRC/agent2api.example.json" "$HOME_DIR/agent2api.json"
  chmod 600 "$HOME_DIR/agent2api.json"
  echo "已生成 $HOME_DIR/agent2api.json —— 打开它，把 token 填进去。"
fi

# 切到带这个组件的布局（abs-stats 里其它节点仍然指向 abs）。
if command -v herdr-app >/dev/null 2>&1; then
  herdr-app do layout.switch --name abs-stats >/dev/null 2>&1 || true
fi

echo "装好了：mods/agent2api + layouts/abs-stats.json。abs 没动。"
