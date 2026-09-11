#!/usr/bin/env bash
set -euo pipefail

target=/etc/nginx/conf.d/beihuochuhuojihua.conf
snippet=/etc/nginx/snippets/hetong.locations.conf
include_line="    include $snippet;"

if [[ ! -f "$target" ]]; then
  echo "未找到目标 Nginx 配置：$target" >&2
  exit 26
fi

install -d -m 0755 /etc/nginx/snippets
install -m 0644 /srv/hetong/repo/deploy/nginx/hetong.locations.conf "$snippet"

include_count=$(grep -Fxc "$include_line" "$target" || true)
if [[ "$include_count" -ne 2 ]]; then
  backup="$target.hetong-backup-$(date +%Y%m%d%H%M%S)"
  cp -a "$target" "$backup"
  perl -0pi -e 's/^    include \/etc\/nginx\/snippets\/hetong\.locations\.conf;\n//mg; s/(server \{\n    listen (?:80;|443 ssl;)\n    server_name 129\.211\.9\.242;\n)/$1    include \/etc\/nginx\/snippets\/hetong.locations.conf;\n/g' "$target"
  include_count=$(grep -Fxc "$include_line" "$target" || true)
  if [[ "$include_count" -ne 2 ]]; then
    cp -a "$backup" "$target"
    echo "无法安全定位 HTTP/HTTPS server 块，已恢复原配置。" >&2
    exit 27
  fi
fi

if ! nginx -t; then
  if [[ -n "${backup:-}" ]]; then
    cp -a "$backup" "$target"
  fi
  echo "Nginx 配置检查失败，已恢复原配置。" >&2
  exit 28
fi

systemctl reload nginx
