#!/usr/bin/env bash
set -euo pipefail

if [[ "$SSH_ORIGINAL_COMMAND" =~ ^deploy\ ([0-9a-f]{40})$ ]]; then
  exec sudo /usr/local/sbin/hetong-apply-release "${BASH_REMATCH[1]}"
fi

echo "仅允许部署指定的Git提交。" >&2
exit 24
