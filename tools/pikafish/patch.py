#!/usr/bin/env python3
"""Vá mã nguồn Pikafish để chạy đơn luồng trong Web Worker (không cần SharedArrayBuffer).

- Thread: không tạo luồng thật; mọi việc (kể cả tìm kiếm) chạy ngay trên luồng gọi.
- UCI: vòng lặp đọc lệnh từ hàng đợi thay cho stdin, xử lý hết hàng đợi thì trả về.
- main.cpp: xuất hai hàm pf_init() và pf_command(cmd) cho JavaScript gọi.
Mọi thay đổi nằm trong #ifdef PF_WASM nên bản build thường không bị ảnh hưởng.
Chạy:  python3 patch.py <thư mục src của Pikafish>
"""
import pathlib, sys

src = pathlib.Path(sys.argv[1])


def patch(name, old, new):
    p = src / name
    s = p.read_text(encoding='utf-8')
    if 'PF_WASM' in s and new in s:
        return
    if s.count(old) != 1:
        sys.exit(f'Không vá được {name}: không tìm thấy đoạn cần sửa (Pikafish đã đổi mã?)')
    p.write_text(s.replace(old, new), encoding='utf-8')


# ---------- thread.h ----------
patch('thread.h', '    NativeThread              stdThread;\n',
      '#ifndef PF_WASM\n    NativeThread              stdThread;\n#endif\n')

# ---------- thread.cpp ----------
patch('thread.cpp', '''    totalNuma(totalNumaCount),
    stdThread(
      create_native_thread(NativeThreadOptions{}.setLargeStack(true), &Thread::idle_loop, this)) {

    if (!stdThread.joinable())
    {
        std::cerr << "Failed to create search thread\\n";
        std::exit(EXIT_FAILURE);
    }
''', '''    totalNuma(totalNumaCount)
#ifndef PF_WASM
    ,
    stdThread(
      create_native_thread(NativeThreadOptions{}.setLargeStack(true), &Thread::idle_loop, this))
#endif
{
#ifdef PF_WASM
    searching = false;  // no native thread: jobs run synchronously on the caller
#else
    if (!stdThread.joinable())
    {
        std::cerr << "Failed to create search thread\\n";
        std::exit(EXIT_FAILURE);
    }
#endif
''')
patch('thread.cpp', '''    exit = true;
    start_searching();
    stdThread.join();
}''', '''#ifndef PF_WASM
    exit = true;
    start_searching();
    stdThread.join();
#endif
}''')
patch('thread.cpp', '''void Thread::run_custom_job(std::function<void()> f) {
''', '''void Thread::run_custom_job(std::function<void()> f) {
#ifdef PF_WASM
    f();
    return;
#endif
''')

# ---------- uci.cpp ----------
patch('uci.cpp', '''        if (cli.argc == 1
            && !getline(std::cin, cmd))  // Wait for an input or an end-of-file (EOF) indication
            cmd = "quit";
''', '''#ifdef PF_WASM
        if (pf_pending_commands().empty())
            return;
        cmd = pf_pending_commands().front();
        pf_pending_commands().pop_front();
#else
        if (cli.argc == 1
            && !getline(std::cin, cmd))  // Wait for an input or an end-of-file (EOF) indication
            cmd = "quit";
#endif
''')
patch('uci.cpp', 'void UCIEngine::loop() {\n', '''#ifdef PF_WASM
std::deque<std::string>& pf_pending_commands() {
    static std::deque<std::string> q;
    return q;
}
#endif

void UCIEngine::loop() {
''')
patch('uci.cpp', '#include "uci.h"\n', '#include "uci.h"\n\n#include <deque>\n')

# ---------- main.cpp ----------
main = src / 'main.cpp'
s = main.read_text(encoding='utf-8')
if 'pf_command' not in s:
    s += '''
#ifdef PF_WASM
    #include <deque>
    #include <emscripten/emscripten.h>

namespace Stockfish {
std::deque<std::string>& pf_pending_commands();
}

static std::unique_ptr<UCIEngine> pf_uci;

// Called once from JavaScript after pikafish.nnue has been written to the virtual file system.
extern "C" EMSCRIPTEN_KEEPALIVE void pf_init() {
    std::cout << engine_info() << std::endl;
    Attacks::init();
    Position::init();
    static char  arg0[] = "pikafish";
    static char* argv[] = {arg0, nullptr};
    pf_uci              = std::make_unique<UCIEngine>(CommandLine(1, argv));
}

// Runs one UCI command. "go" blocks until the search is finished (use movetime or depth).
extern "C" EMSCRIPTEN_KEEPALIVE void pf_command(const char* cmd) {
    Stockfish::pf_pending_commands().emplace_back(cmd);
    pf_uci->loop();
}
#endif
'''
    main.write_text(s, encoding='utf-8')
print('Đã vá Pikafish cho WebAssembly đơn luồng.')
