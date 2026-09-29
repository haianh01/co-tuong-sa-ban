#!/usr/bin/env bash
# Biên dịch Pikafish sang WebAssembly đơn luồng rồi ghi ra engine/pikafish.js.
# Cần Emscripten (emsdk) đã kích hoạt:  source /đường/dẫn/emsdk/emsdk_env.sh
# Chạy:  bash tools/pikafish/build.sh
set -euo pipefail

PIKAFISH_REPO=https://github.com/official-pikafish/Pikafish.git
PIKAFISH_COMMIT=${PIKAFISH_COMMIT:-b562d6a}   # bản đã kiểm thử; đổi để thử bản mới hơn

here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../.." && pwd)
work=${WORK_DIR:-"$root/tools/pikafish/.build"}

command -v em++ >/dev/null || { echo "Không thấy em++. Hãy cài và kích hoạt emsdk trước."; exit 1; }

if [ ! -d "$work/Pikafish" ]; then
  mkdir -p "$work"
  git clone -q "$PIKAFISH_REPO" "$work/Pikafish"
fi
cd "$work/Pikafish"
git checkout -q -f "$PIKAFISH_COMMIT"
git clean -qfdx src
python3 "$here/patch.py" src

cd src
# Bản wasm32 chính thức dùng -pthread (cần SharedArrayBuffer và header COOP/COEP);
# bản này bỏ đa luồng để chạy được cả khi mở index.html trực tiếp.
sed -i 's/CXXFLAGS += -pthread -msimd128/CXXFLAGS += -msimd128/; s/LDFLAGS += -pthread -sINITIAL_MEMORY=64MB -sALLOW_MEMORY_GROWTH -sSTACK_SIZE=3MB/LDFLAGS += -sINITIAL_MEMORY=128MB -sALLOW_MEMORY_GROWTH -sSTACK_SIZE=8MB/' Makefile

make -j"$(nproc)" pikafish.js ARCH=wasm32 COMP=clang CXX=em++ \
  EXTRACXXFLAGS="-DPF_WASM" \
  EXTRALDFLAGS="-sMODULARIZE=1 -sEXPORT_NAME=PikafishModule -sINVOKE_RUN=0 -sSINGLE_FILE=1 -sENVIRONMENT=worker \
    -sEXPORTED_FUNCTIONS=_pf_init,_pf_command -sEXPORTED_RUNTIME_METHODS=ccall,FS -sMAXIMUM_MEMORY=2GB"

# Gói thành chuỗi JavaScript: trang nạp bằng thẻ <script> (chạy được cả với file://)
# rồi tạo Web Worker từ chuỗi này.
python3 - "$root/engine/pikafish.js" <<'EOF'
import json, pathlib, sys
src = pathlib.Path('pikafish.js').read_text(encoding='utf-8')
out = pathlib.Path(sys.argv[1]); out.parent.mkdir(exist_ok=True)
out.write_text('// Pikafish (GPLv3, https://github.com/official-pikafish/Pikafish) biên dịch sang WebAssembly đơn luồng.\n'
               '// Tạo bằng tools/pikafish/build.sh, đừng sửa tay.\n'
               'window.PIKAFISH_SRC = ' + json.dumps(src) + ';\n', encoding='utf-8')
print(f'Đã tạo {out} ({out.stat().st_size // 1024} KB)')
EOF
