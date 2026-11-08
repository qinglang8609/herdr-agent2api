#!/bin/sh
# 一键安装：把 agent2api 侧栏统计块装进 herdr-app。
#
#   curl -fsSL https://raw.githubusercontent.com/qinglang8609/herdr-agent2api/main/get.sh | sh
#
# 装 token 也一起写（省一次编辑）：
#
#   curl -fsSL https://raw.githubusercontent.com/qinglang8609/herdr-agent2api/main/get.sh | A2A_TOKEN='面板token' sh
#
# 重复运行等于升级：下载最新版覆盖，配置（token）不动。
set -eu

OWNER_REPO="qinglang8609/herdr-agent2api"
BRANCH="${A2A_BRANCH:-main}"
DEST="${A2A_HOME:-$HOME/.local/share/agent2api}"
HOME_DIR="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"

say() { printf '%s\n' "$*"; }
die() { say "安装失败：$*" >&2; exit 1; }

# ── 前置检查 ─────────────────────────────
command -v curl >/dev/null 2>&1 || die "需要 curl"
command -v tar >/dev/null 2>&1 || die "需要 tar"

[ -d "$HOME_DIR" ] || die "找不到 herdr-app 配置目录：$HOME_DIR （请先打开一次 herdr-app）"

say "herdr-app 配置目录: $HOME_DIR"

# ── 下载（GitHub tarball，不需要 git 也不需要 raw） ──
say "下载 $OWNER_REPO@$BRANCH …"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

url="https://github.com/${OWNER_REPO}/archive/refs/heads/${BRANCH}.tar.gz"
curl -fsSL "$url" -o "$TMP/src.tar.gz" || die "下载失败，检查网络：$url"
tar -xzf "$TMP/src.tar.gz" -C "$TMP" || die "解压失败"

# GitHub 的 tarball 带一层 <repo>-<branch> 目录。
src=$(find "$TMP" -maxdepth 1 -type d -name '*-*' | head -1)
[ -n "$src" ] || die "解压后找不到源码目录"
[ -f "$src/mods/agent2api/main.js" ] || die "源码不完整，缺 mods/agent2api/main.js"

# ── 落盘：先解到固定目录，再交给 install.sh ──
rm -rf "$DEST"
mkdir -p "$(dirname "$DEST")"
cp -R "$src" "$DEST"
chmod +x "$DEST/install.sh" "$DEST/sync-layout.sh" 2>/dev/null || true

say "已解压到 ${DEST}，开始安装 …"
exec sh "$DEST/install.sh"
