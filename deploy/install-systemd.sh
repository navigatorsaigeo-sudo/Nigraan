#!/usr/bin/env bash
# Install / refresh the NIGRAAN systemd unit on this DGX.
# Usage: sudo bash deploy/install-systemd.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UNIT_SRC="$ROOT/deploy/agn-nigraan.service"
UNIT_DST=/etc/systemd/system/agn-nigraan.service

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo: sudo bash deploy/install-systemd.sh" >&2
  exit 1
fi

install -m 0644 "$UNIT_SRC" "$UNIT_DST"
systemctl daemon-reload
systemctl enable agn-nigraan.service
systemctl restart agn-nigraan.service
systemctl --no-pager --full status agn-nigraan.service || true
echo "OK: agn-nigraan listening on 0.0.0.0:8787 (Tailscale 100.78.253.98:8787)"
