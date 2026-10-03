#!/usr/bin/env bash
# Lấy thư viện mp4-muxer (MIT, https://github.com/Vanilagy/mp4-muxer) về vendor/mp4-muxer.js: đóng gói
# khung hình và âm thanh đã mã hóa bằng WebCodecs thành file MP4, dùng cho "Xuất video" nhanh hơn thời gian thực.
# Trang nạp file này bằng thẻ <script> khi xuất video, kể cả với file://. Cần Node.js + npm.
# Chạy:  bash tools/vendor-mp4-muxer.sh [phiên bản]
set -euo pipefail
VERSION=${1:-5.2.2}
root=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cd "$work"
npm pack "mp4-muxer@$VERSION" --silent >/dev/null
tar xzf "mp4-muxer-$VERSION.tgz"
mkdir -p "$root/vendor"
{ echo "/* mp4-muxer $VERSION (MIT, https://github.com/Vanilagy/mp4-muxer) - lấy bằng tools/vendor-mp4-muxer.sh */"; cat package/build/mp4-muxer.js; } > "$root/vendor/mp4-muxer.js"
echo "Đã tạo vendor/mp4-muxer.js ($(( $(wc -c < "$root/vendor/mp4-muxer.js") / 1024 )) KB, mp4-muxer $VERSION)"
