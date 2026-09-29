'use strict';
// "Mẫu của tôi": lưu tiêu đề, thế cờ và kịch bản đang soạn (ví dụ vừa nhập từ PGN) thành một mẫu
// trong danh sách "Mẫu có sẵn". Mẫu nằm trong localStorage của trình duyệt này; muốn mang sang máy
// khác thì tải danh sách ra file .json rồi mở lại ở máy kia.
(() => {
  const form = $('mySaveForm'), nameIn = $('myName'), delBtn = $('myDelete'), infoEl = $('myInfo');
  const say = (msg, isErr) => { infoEl.textContent = msg; infoEl.classList.toggle('err', !!isErr); };
  const selected = () => (presetSel.value.startsWith('u:') ? myPresets().find(p => 'u:' + p.id === presetSel.value) : null);
  const sync = () => { delBtn.hidden = !selected(); };
  window.onPresetChange = () => { sync(); form.hidden = true; };
  for (const el of [titleIn, fenIn, scriptIn]) el.addEventListener('input', sync);

  // Mở ô đặt tên (gợi ý sẵn: tên mẫu đang chọn hoặc tiêu đề video).
  function openSave() {
    const cur = selected();
    nameIn.value = cur ? cur.name : (titleIn.value.trim() || 'Mẫu mới');
    form.hidden = false; say('');
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    nameIn.focus(); nameIn.select();
  }
  function save() {
    const name = nameIn.value.trim();
    if (!name) { say('Hãy đặt tên cho mẫu.', true); nameIn.focus(); return; }
    try { parseFEN(fenIn.value); } catch (e) { say(`Thế cờ chưa hợp lệ, chưa lưu được: ${e}`, true); return; }
    const list = myPresets(), item = { name, title: titleIn.value.trim() || name, fen: fenIn.value.trim(), script: scriptIn.value };
    const old = list.find(p => p.name === name);
    if (old) Object.assign(old, item); else list.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ...item });
    try { saveMyPresets(list); } catch (e) { say('Trình duyệt không cho lưu (bộ nhớ đầy hoặc đang ở chế độ ẩn danh).', true); return; }
    renderPresetOptions('u:' + (old || list[list.length - 1]).id);
    form.hidden = true; sync();
    say(old ? `Đã cập nhật mẫu “${name}”.` : `Đã lưu mẫu “${name}” vào danh sách “Mẫu của tôi”.`);
  }
  function remove() {
    const cur = selected(); if (!cur) return;
    if (!confirm(`Xóa mẫu “${cur.name}”? Không hoàn tác được.`)) return;
    try { saveMyPresets(myPresets().filter(p => p.id !== cur.id)); } catch (e) { say('Không xóa được.', true); return; }
    renderPresetOptions('custom'); sync();
    say(`Đã xóa mẫu “${cur.name}”. Nội dung vẫn còn trong các ô bên dưới.`);
  }
  function exportAll() {
    const list = myPresets();
    if (!list.length) { say('Chưa có mẫu nào của bạn để tải xuống.', true); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: 'co-tuong-sa-ban', presets: list }, null, 2)], { type: 'application/json' }));
    a.download = 'mau-co-tuong.json';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    say(`Đã tải xuống ${list.length} mẫu (mau-co-tuong.json).`);
  }
  async function importFile(file) {
    let data;
    try { data = JSON.parse(await file.text()); } catch (e) { say('File này không phải danh sách mẫu (.json).', true); return; }
    const items = (Array.isArray(data) ? data : data && data.presets || []).filter(p => p && p.name && p.fen && typeof p.script === 'string');
    if (!items.length) { say('Không tìm thấy mẫu nào trong file.', true); return; }
    const list = myPresets(); let added = 0, updated = 0;
    for (const p of items) {
      const item = { name: String(p.name), title: String(p.title || p.name), fen: String(p.fen), script: String(p.script) };
      const old = list.find(q => q.name === item.name);
      if (old) { Object.assign(old, item); updated++; } else { list.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ...item }); added++; }
    }
    try { saveMyPresets(list); } catch (e) { say('Trình duyệt không cho lưu.', true); return; }
    renderPresetOptions(presetSel.value); sync();
    say(`Đã thêm ${added} mẫu${updated ? `, cập nhật ${updated} mẫu trùng tên` : ''}.`);
  }

  $('mySave').onclick = openSave;
  $('myConfirm').onclick = save;
  $('myCancel').onclick = () => { form.hidden = true; say(''); };
  nameIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } if (e.key === 'Escape') form.hidden = true; });
  delBtn.onclick = remove;
  $('myExport').onclick = exportAll;
  $('myImport').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) importFile(f); };
  // Nút lưu ngay trong khung PGN, hiện sau khi nhập PGN thành công.
  $('pgnSave').onclick = openSave;
  sync();
})();
