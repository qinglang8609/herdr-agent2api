#!/bin/sh
# 用当前的 layouts/abs.json 重新生成 layouts/abs-stats.json（在 sidebar-lists
# 末尾加 agent2api 节点）。abs 那边更新了布局之后跑一次，新布局就能带过来。
# abs.json 本身只读，不改。
set -e

H="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
SRC="$H/layouts/abs.json"
OUT="$H/layouts/abs-stats.json"

[ -f "$SRC" ] || { echo "没有 $SRC —— 先装 abs" >&2; exit 1; }
[ -f "$OUT" ] && cp "$OUT" "$OUT.before-sync"

python3 - "$SRC" "$OUT" <<'PY'
import json, sys
src, out = sys.argv[1], sys.argv[2]
d = json.load(open(src))

def find(n, nid):
    if isinstance(n, dict):
        if n.get("id") == nid:
            return n
        for c in n.get("children") or []:
            r = find(c, nid)
            if r:
                return r
    return None

lists = find(d, "sidebar-lists")
if not lists:
    sys.exit("abs.json 里没有 sidebar-lists 节点，布局结构变了？")

# 先去掉旧的（防止重复加），再加到末尾。
lists["children"] = [c for c in lists.get("children", []) if c.get("id") != "agent2api-stats"]
lists["children"].append({
    "id": "agent2api-stats",
    "type": "block",
    "content": {"mod": "agent2api", "props": {"part": "stats"}},
    "size": {"px": 206},
})

# 终端下面的输入框：插在 thread 的 main 之后。
def find_any(node, nid):
    if isinstance(node, dict):
        if node.get("id") == nid:
            return node
        for kid in node.get("children") or []:
            got = find_any(kid, nid)
            if got:
                return got
    return None

thread = find_any(d, "thread")
if thread:
    thread["children"] = [c for c in thread.get("children", []) if c.get("id") != "composer"]
    thread["children"].append({
        "id": "composer",
        "type": "block",
        "content": {"mod": "composer", "props": {"part": "composer"}},
        "size": {"px": 132},
    })
open(out, "w").write(json.dumps(d, indent=2, ensure_ascii=False))
print(f"已用 {src} 生成 {out}")
PY

# 切过去让它重新加载（切走再切回，布局文件才会重读）。
if command -v herdr-app >/dev/null 2>&1; then
  herdr-app do layout.switch --name abs >/dev/null 2>&1 || true
  herdr-app do layout.switch --name abs-stats >/dev/null 2>&1 || true
fi

echo "好了，当前应该在 abs-stats 布局。"
