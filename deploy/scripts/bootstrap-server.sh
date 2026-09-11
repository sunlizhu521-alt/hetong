#!/usr/bin/env bash
set -euo pipefail

required_free_kb=6291456
available_kb=$(df --output=avail / | tail -1 | tr -d ' ')
if (( available_kb < required_free_kb )); then
  echo "部署前可用磁盘不足6GB，停止安装。" >&2
  exit 20
fi

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y \
  git python3 python3-venv python3-pip libreoffice-writer libreoffice-calc \
  poppler-utils fonts-noto-cjk fonts-noto-core

install -d -o ubuntu -g ubuntu -m 0750 /srv/hetong
install -d -o ubuntu -g ubuntu -m 0700 /srv/hetong/data
install -d -o ubuntu -g ubuntu -m 0755 /srv/hetong/frontend

available_after_kb=$(df --output=avail / | tail -1 | tr -d ' ')
if (( available_after_kb < 4194304 )); then
  echo "安装后可用磁盘不足4GB，停止配置服务。" >&2
  exit 21
fi
