#!/usr/bin/env bash
set -euo pipefail

revision=${1:-main}
repo_dir=/srv/hetong/repo

if [[ ! "$revision" =~ ^[0-9a-f]{40}$ && "$revision" != "main" ]]; then
  echo "无效的部署版本" >&2
  exit 22
fi

if [[ ! -d "$repo_dir/.git" ]]; then
  git clone https://github.com/sunlizhu521-alt/hetong.git "$repo_dir"
fi

git -C "$repo_dir" fetch --prune origin
previous_revision=$(git -C "$repo_dir" rev-parse HEAD 2>/dev/null || true)
git -C "$repo_dir" checkout --detach "$revision"
deployed_revision=$(git -C "$repo_dir" rev-parse HEAD)

if [[ ! -f "$repo_dir/frontend/dist/index.html" ]]; then
  echo "部署版本缺少经过CI验证的前端构建文件。" >&2
  exit 25
fi

if [[ ! -x /srv/hetong/venv/bin/python ]]; then
  python3 -m venv /srv/hetong/venv
fi
/srv/hetong/venv/bin/pip install --disable-pip-version-check -r "$repo_dir/backend/requirements.txt"
printf 'HETONG_VERSION=%s\n' "$deployed_revision" > /srv/hetong/app.env
chmod 0644 /srv/hetong/app.env

install -d -o ubuntu -g ubuntu -m 0755 /srv/hetong/frontend
chmod 0755 /srv/hetong
find /srv/hetong/frontend -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
cp -a "$repo_dir/frontend/dist/." /srv/hetong/frontend/
chown -R ubuntu:ubuntu /srv/hetong

install -m 0644 "$repo_dir/deploy/systemd/hetong.service" /etc/systemd/system/hetong.service
install -m 0644 "$repo_dir/deploy/systemd/hetong-cleanup.service" /etc/systemd/system/hetong-cleanup.service
install -m 0644 "$repo_dir/deploy/systemd/hetong-cleanup.timer" /etc/systemd/system/hetong-cleanup.timer

systemctl daemon-reload
systemctl enable hetong.service
systemctl restart hetong.service
systemctl enable --now hetong-cleanup.timer

healthy=false
for _ in {1..10}; do
  if curl --fail --silent http://127.0.0.1:8010/hetong-api/health | grep -q '"status":"ok"'; then
    healthy=true
    break
  fi
  sleep 1
done
if [[ "$healthy" != true ]]; then
  if [[ -n "$previous_revision" ]]; then
    git -C "$repo_dir" checkout --detach "$previous_revision"
    printf 'HETONG_VERSION=%s\n' "$previous_revision" > /srv/hetong/app.env
    if [[ -f "$repo_dir/frontend/dist/index.html" ]]; then
      find /srv/hetong/frontend -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
      cp -a "$repo_dir/frontend/dist/." /srv/hetong/frontend/
      chown -R ubuntu:ubuntu /srv/hetong/frontend
    fi
    systemctl restart hetong.service
  fi
  echo "新版本健康检查失败，已恢复上一版本。" >&2
  exit 23
fi

curl --fail --silent --show-error http://127.0.0.1:8010/hetong-api/health
