#!/bin/sh
# 装 agent2api 的侧栏统计块：只动它自己的 mod 和一份独立布局，不碰 abs。
# 已经装过的直接重跑即可：模块覆盖，布局写回。
set -e

SRC=$(cd "$(dirname "$0")" && pwd)
HOME_DIR="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
MODS="$HOME_DIR/mods"

[ -d "$HOME_DIR" ] || { echo "找不到 herdr-app 配置目录：$HOME_DIR" >&2; exit 1; }

# abs-stats 是 abs 布局的副本多一个节点。没有 abs 也能装（组件自己会显示），
# 只是布局里其它节点会是空的 —— 提示一句，不拦。
if [ ! -f "$HOME_DIR/layouts/abs.json" ]; then
  echo "提示：没找到 layouts/abs.json（abs 没装）。"
  echo "      组件本身可以单独显示；想要完整界面就先装 abs，再跑一次本脚本。"
fi

mkdir -p "$MODS" "$HOME_DIR/layouts"

# mod：复制而不是软链（跟 abs 一样，省得 image() 读软链出问题）。
for m in agent2api composer; do
  [ -d "$SRC/mods/$m" ] || continue
  rm -rf "$MODS/$m"
  cp -R "$SRC/mods/$m" "$MODS/$m"
done

# 主题：Eva-Theme 转过来的两套（暗/亮），覆盖同名文件，别的不动。
mkdir -p "$HOME_DIR/themes"
for t in "$SRC"/themes/*.json; do
  [ -f "$t" ] || continue
  cp -f "$t" "$HOME_DIR/themes/$(basename "$t")"
done

# 布局：单独一份 abs-stats.json，abs.json 原样不动。
if [ -f "$HOME_DIR/layouts/abs-stats.json" ]; then
  cp "$HOME_DIR/layouts/abs-stats.json" "$HOME_DIR/layouts/abs-stats.json.before-install"
fi
cp -f "$SRC/layouts/abs-stats.json" "$HOME_DIR/layouts/abs-stats.json"

# token 配置：给了 A2A_TOKEN 就直接写；没给的话，只在没有配置文件时才生成模板。
if [ -n "${A2A_TOKEN:-}" ]; then
  printf '{\n  "base": "%s",\n  "token": "%s"\n}\n' \
    "${A2A_BASE:-https://code.d8gx.com}" "$A2A_TOKEN" > "$HOME_DIR/agent2api.json"
  chmod 600 "$HOME_DIR/agent2api.json"
  echo "token 已写入 $HOME_DIR/agent2api.json"
elif [ ! -f "$HOME_DIR/agent2api.json" ]; then
  cp "$SRC/agent2api.example.json" "$HOME_DIR/agent2api.json"
  chmod 600 "$HOME_DIR/agent2api.json"
  echo "已生成 $HOME_DIR/agent2api.json —— 打开它，把 token 填进去。"
fi

# 切到带这个组件的布局（abs-stats 里其它节点仍然指向 abs）。
if command -v herdr-app >/dev/null 2>&1; then
  herdr-app do layout.switch --name abs-stats >/dev/null 2>&1 || true
fi

echo "装好了：mods/agent2api + layouts/abs-stats.json。abs 没动。"
