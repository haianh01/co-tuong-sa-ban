#!/usr/bin/env bash
# Đóng gói thư viện chính thức @anthropic-ai/sdk thành vendor/anthropic-sdk.js (một file, không cần bước
# build khi dùng): trang nạp bằng thẻ <script> khi người dùng bật "Lời thoại bằng Claude", kể cả với file://.
# Cần Node.js + npm. Chạy:  bash tools/vendor-anthropic-sdk.sh [phiên bản]
set -euo pipefail
VERSION=${1:-0.129.0}
root=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cd "$work"
npm init -y >/dev/null
npm install --silent "@anthropic-ai/sdk@$VERSION" esbuild >/dev/null
echo 'import Anthropic from "@anthropic-ai/sdk"; window.Anthropic = Anthropic;' > entry.js
mkdir -p "$root/vendor"
npx esbuild entry.js --bundle --minify --format=iife --platform=browser --target=es2020 \
  --banner:js="/* @anthropic-ai/sdk $VERSION (MIT, https://github.com/anthropics/anthropic-sdk-typescript) - tạo bằng tools/vendor-anthropic-sdk.sh */" \
  --outfile="$root/vendor/anthropic-sdk.js" --log-level=warning
echo "Đã tạo vendor/anthropic-sdk.js ($(( $(wc -c < "$root/vendor/anthropic-sdk.js") / 1024 )) KB, @anthropic-ai/sdk $VERSION)"
