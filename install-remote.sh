#!/bin/sh
# 一条命令装（不需要 clone、不需要 GitHub 账号，仓库是 public）：
#
#   curl -fsSL https://raw.githubusercontent.com/qinglang8609/herdr-agent2api/main/install-remote.sh | sh
#
# 想顺手把 token 也写进去（省得装完再编辑一次）：
#
#   curl -fsSL https://raw.githubusercontent.com/qinglang8609/herdr-agent2api/main/install-remote.sh | sh -s '你的面板token'
#
set -e

TOKEN_ARG="${1:-}"
DIR=$(mktemp -d)
trap 'rm -rf "$DIR"' EXIT

echo "拉取 herdr-agent2api…"
git clone -q --depth 1 https://github.com/qinglang8609/herdr-agent2api.git "$DIR/repo"

if [ -n "$TOKEN_ARG" ]; then
  A2A_TOKEN="$TOKEN_ARG" sh "$DIR/repo/install.sh"
else
  sh "$DIR/repo/install.sh"
fi
