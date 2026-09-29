#!/usr/bin/env bash
# Biên dịch Pikafish sang WebAssembly, ra hai bản:
#   engine/pikafish.js     đơn luồng: chạy ở mọi nơi, kể cả khi mở index.html trực tiếp (file://)
#   engine/pikafish-mt.js  đa luồng: cần SharedArrayBuffer, tức trang phải được phục vụ kèm header
#                          COOP/COEP (xem tools/serve.py). Trang tự chọn bản phù hợp.
# Cần Emscripten (emsdk) đã kích hoạt:  source /đường/dẫn/emsdk/emsdk_env.sh
# Chạy:  bash tools/pikafish/build.sh          (cả hai bản)
#        bash tools/pikafish/build.sh st       (chỉ bản đơn luồng)   |   ... mt   (chỉ bản đa luồng)
set -euo pipefail

PIKAFISH_REPO=https://github.com/official-pikafish/Pikafish.git
PIKAFISH_COMMIT=${PIKAFISH_COMMIT:-b562d6a}   # bản đã kiểm thử; đổi để thử bản mới hơn

here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../.." && pwd)
work=${WORK_DIR:-"$root/tools/pikafish/.build"}
variants=${*:-st mt}

command -v em++ >/dev/null || { echo "Không thấy em++. Hãy cài và kích hoạt emsdk trước."; exit 1; }

if [ ! -d "$work/Pikafish" ]; then
  mkdir -p "$work"
  git clone -q "$PIKAFISH_REPO" "$work/Pikafish"
fi

# Ghi bản JS của Emscripten thành một chuỗi: trang nạp bằng thẻ <script> (chạy được cả với file://)
# rồi tạo Web Worker từ chuỗi này.
wrap() {  # wrap <file js> <tên biến> <file ra> <mô tả>
  python3 - "$@" <<'EOF'
import json, pathlib, sys
src, var, out, desc = sys.argv[1:5]
text = pathlib.Path(src).read_text(encoding='utf-8')
out = pathlib.Path(out); out.parent.mkdir(exist_ok=True)
out.write_text(f'// Pikafish (GPLv3, https://github.com/official-pikafish/Pikafish) biên dịch sang WebAssembly {desc}.\n'
               '// Tạo bằng tools/pikafish/build.sh, đừng sửa tay.\n'
               f'window.{var} = ' + json.dumps(text) + ';\n', encoding='utf-8')
print(f'Đã tạo {out} ({out.stat().st_size // 1024} KB)')
EOF
}

common_ld="-sMODULARIZE=1 -sEXPORT_NAME=PikafishModule -sINVOKE_RUN=0 -sSINGLE_FILE=1 -sENVIRONMENT=worker \
  -sEXPORTED_FUNCTIONS=_pf_init,_pf_command -sEXPORTED_RUNTIME_METHODS=ccall,FS -sMAXIMUM_MEMORY=2GB"

for v in $variants; do
  cd "$work/Pikafish"
  git checkout -q -f "$PIKAFISH_COMMIT"
  git clean -qfdx src
  python3 "$here/patch.py" src
  cd src
  # em++ -dumpversion trả về phiên bản Emscripten (6.x) nên Makefile tưởng clang < 16 và thêm cờ cũ không còn hỗ trợ.
  sed -i '/-fexperimental-new-pass-manager/d' Makefile
  if [ "$v" = st ]; then
    # Bỏ -pthread: không cần SharedArrayBuffer / header COOP-COEP.
    sed -i 's/CXXFLAGS += -pthread -msimd128/CXXFLAGS += -msimd128/; s/LDFLAGS += -pthread -sINITIAL_MEMORY=64MB -sALLOW_MEMORY_GROWTH -sSTACK_SIZE=3MB/LDFLAGS += -sINITIAL_MEMORY=128MB -sALLOW_MEMORY_GROWTH -sSTACK_SIZE=8MB/' Makefile
    defs="-DPF_WASM -DPF_SINGLE_THREAD"; extra_ld=""
    out=pikafish.js; var=PIKAFISH_SRC; desc="đơn luồng"
  else
    # Giữ -pthread của bản wasm32 chính thức. Các luồng được tạo sẵn (pool) khi nạp máy, vì trong
    # Web Worker một luồng mới chỉ khởi động được sau khi luồng tạo ra nó trả quyền cho vòng sự kiện,
    # mà Pikafish lại chờ luồng mới ngay khi tạo.
    sed -i 's/LDFLAGS += -pthread -sINITIAL_MEMORY=64MB/LDFLAGS += -pthread -sINITIAL_MEMORY=256MB/' Makefile
    defs="-DPF_WASM"
    extra_ld="-sPTHREAD_POOL_SIZE=Module.pfPoolSize -sPTHREAD_POOL_SIZE_STRICT=2"
    out=pikafish-mt.js; var=PIKAFISH_MT_SRC; desc="đa luồng"
  fi
  # bits=32: wasm32 (nếu không Makefile thêm -m64 thành wasm64, chưa chạy được trên Safari); vẫn định nghĩa
  # IS_64BIT vì Pikafish cần kiểu __int128 (clang hỗ trợ trên wasm32). RTLIB=compiler-rt: bỏ -latomic.
  make -j"$(nproc)" pikafish.js ARCH=wasm32 COMP=clang CXX=em++ bits=32 RTLIB=compiler-rt \
    EXTRACXXFLAGS="$defs -DIS_64BIT" EXTRALDFLAGS="$common_ld $extra_ld"
  wrap pikafish.js "$var" "$root/engine/$out" "$desc"
done
