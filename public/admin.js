(function () {
  'use strict';

  const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const RESPONSE_COLS = [
    ['ชื่อ-นามสกุล', (r) => r.prefix + r.first_name + ' ' + r.last_name],
    ['ตำแหน่ง', (r) => r.position],
    ['หน่วยงาน', (r) => r.unit],
    ['จังหวัด', (r) => r.province],
    ['การเข้าร่วม', (r) => r.attendance],
    ['อาหาร', (r) => [r.food, r.allergy && 'แพ้: ' + r.allergy].filter(Boolean).join(' · ')],
    ['ที่พัก', (r) => r.need_lodging],
    ['เข้า–ออก', (r) => (r.check_in ? shortDate(r.check_in) + ' – ' + shortDate(r.check_out) : '')],
    ['ห้อง', (r) => [r.room_type, r.roommate && 'กับ ' + r.roommate].filter(Boolean).join(' ')],
    ['การเดินทาง', (r) => r.travel],
    ['หมายเหตุ', (r) => [r.absence_note, r.lodging_note].filter(Boolean).join(' · ')],
    ['โทร', (r) => r.phone],
    ['อีเมล', (r) => r.email],
    ['อัปเดตล่าสุด', (r) => r.updated_at],
  ];

  const MODE_LABEL = { hybrid: 'On-site และ Online', onsite: 'On-site อย่างเดียว', online: 'Online อย่างเดียว' };
  const params = new URLSearchParams(location.search);
  const apiUrl = (window.APP_CONFIG && window.APP_CONFIG.API_URL) || '';
  // โหมดจำลองใช้ได้เฉพาะตอนทดสอบในเครื่อง บนเว็บจริงจะใช้ Apps Script เสมอ
  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const useMock = isLocal && (params.get('mock') === '1' || !apiUrl);

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  let idToken = ''; // Google ID token จากปุ่ม Sign in with Google (หมดอายุใน ~1 ชั่วโมง)
  let data = null;
  let editingId = null;
  let currentResponses = null;

  /* ---------------------------------------------------------------- API */

  async function call(op, extra) {
    const body = Object.assign({ action: 'admin', id_token: idToken, op }, extra || {});
    let res;
    if (useMock) {
      res = await window.MOCK_API.admin(body);
    } else {
      const r = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body),
      });
      res = await r.json();
    }
    if (res.auth === false && op !== 'login') {
      logout(res.error);
      throw new Error(res.error);
    }
    if (!res.ok) throw new Error(res.error || 'ทำรายการไม่สำเร็จ');
    return res;
  }

  /* ------------------------------------------------------------ helpers */

  function storage(fn) {
    try { return fn(window.sessionStorage); } catch (e) { return null; }
  }

  function toast(msg, isError) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast' + (isError ? ' err' : '');
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { t.hidden = true; }, isError ? 5000 : 2500);
  }

  function thaiDate(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    return d + ' ' + MONTHS[m - 1] + ' ' + (y + 543);
  }

  function shortDate(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    return d + ' ' + MONTHS_SHORT[m - 1] + ' ' + String(y + 543).slice(2);
  }

  function thaiRange(s, e) {
    if (!s) return '';
    if (!e || e === s) return thaiDate(s);
    const a = s.split('-'), b = e.split('-');
    if (a[0] === b[0] && a[1] === b[1]) return Number(a[2]) + '–' + thaiDate(e);
    return thaiDate(s) + ' – ' + thaiDate(e);
  }

  function formLink(id) {
    const u = new URL('/m/' + encodeURIComponent(id), location.origin);
    if (useMock) u.search = '?mock=1';
    return u.href;
  }

  function inviteText(m, link) {
    let s = 'ขอความอนุเคราะห์ตอบรับการเข้าร่วม' + m.name;
    if (m.date_text) s += ' ในวันที่ ' + m.date_text;
    s += ' ผ่านแบบตอบรับออนไลน์';
    if (m.close_date) s += ' ภายในวันที่ ' + thaiDate(m.close_date);
    return s + ' ที่ ' + link;
  }

  async function copyText(text, okMsg) {
    try {
      await navigator.clipboard.writeText(text);
      toast(okMsg);
    } catch (e) {
      window.prompt('คัดลอกข้อความนี้', text);
    }
  }

  function openLinkPanel(m) {
    const link = formLink(m.id);
    $('#linkMeetingName').textContent = m.name + ' (' + m.id + ')';
    $('#linkInput').value = link;
    $('#openLinkBtn').href = link;
    $('#inviteText').value = inviteText(m, link);
    $('#linkPanel').hidden = false;
    showMeetingView('list');
    $('#linkInput').select();
  }

  function el(tag, attrs, children) {
    const n = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === 'text') n.textContent = v;
      else if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    });
    (children || []).forEach((c) => n.append(c));
    return n;
  }

  async function withBusy(btn, fn) {
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก…';
    try { await fn(); } finally { btn.disabled = false; btn.textContent = label; }
  }

  /* --------------------------------------------------------------- login */

  function showLoginError(msg) {
    const err = $('#loginError');
    err.textContent = msg || '';
    err.hidden = !msg;
  }

  async function login(token) {
    idToken = token;
    showLoginError('');
    const res = await call('login');
    storage((s) => s.setItem('rsvp_admin_token', token));
    $('#whoEmail').textContent = res.email || '';
    $('#loginView').hidden = true;
    $('#appView').hidden = false;
    await reload();
  }

  async function onGoogleCredential(resp) {
    try {
      await login(resp.credential);
    } catch (ex) {
      logout(ex.message === 'Failed to fetch' ? 'เชื่อมต่อระบบไม่ได้' : ex.message);
    }
  }

  function logout(message) {
    idToken = '';
    storage((s) => s.removeItem('rsvp_admin_token'));
    if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect();
    $('#appView').hidden = true;
    $('#loginView').hidden = false;
    showLoginError(typeof message === 'string' ? message : '');
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error('โหลดปุ่ม Google ไม่สำเร็จ'));
      document.head.append(s);
    });
  }

  async function setupGoogleSignIn() {
    if (useMock) {
      // โหมดทดสอบ: ปุ่มจำลอง ไม่ติดต่อ Google
      $('#mockLoginBtn').hidden = false;
      $('#mockLoginBtn').addEventListener('click', () => onGoogleCredential({ credential: 'mock-token' }));
      return;
    }
    let clientId = '';
    try {
      const r = await fetch(apiUrl + '?action=adminInit').then((x) => x.json());
      clientId = r.clientId || '';
    } catch (e) {
      showLoginError('เชื่อมต่อระบบไม่ได้');
      return;
    }
    if (!clientId) {
      showLoginError('ยังไม่ได้ตั้งค่า google_client_id ในแท็บ config ของ Google Sheet');
      return;
    }
    try {
      await loadScript('https://accounts.google.com/gsi/client');
    } catch (e) {
      showLoginError(e.message);
      return;
    }
    google.accounts.id.initialize({
      client_id: clientId,
      callback: onGoogleCredential,
      auto_select: true,
      ux_mode: 'popup',
    });
    google.accounts.id.renderButton($('#gsiButton'), {
      theme: 'outline', size: 'large', shape: 'pill', text: 'signin_with', locale: 'th', width: 300,
    });
  }

  async function reload() {
    data = await call('overview');
    renderMeetings();
    renderLists();
    renderUnits();
    renderConfig();
  }

  /* ------------------------------------------------------------ tabs */

  function showTab(name) {
    $$('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    $$('.tab-panel').forEach((p) => { p.hidden = p.dataset.panel !== name; });
  }

  function showMeetingView(view) {
    $('#meetingList').hidden = view !== 'list';
    $('#meetingForm').hidden = view !== 'form';
    $('#responseView').hidden = view !== 'responses';
    window.scrollTo({ top: 0 });
  }

  /* -------------------------------------------------------- meetings */

  function renderMeetings() {
    const tbody = $('#meetingTable tbody');
    tbody.innerHTML = '';
    const list = data.meetings;
    $('#meetingCount').textContent = 'ทั้งหมด ' + list.length + ' การประชุม';
    if (!list.length) {
      tbody.append(el('tr', {}, [el('td', { class: 'empty', colspan: '7', text: 'ยังไม่มีการประชุม กด "เพิ่มการประชุม" เพื่อเริ่ม' })]));
      return;
    }
    list.forEach((m) => {
      const c = m.counts;
      const mode = m.attend_mode || (m.type === 'workshop' ? 'onsite' : 'hybrid');
      let status;
      if (!m.open) status = el('span', { class: 'pill closed', text: m.status === 'ปิด' ? 'ปิดรับ' : 'หมดเวลารับ' });
      else if (m.full) status = el('span', { class: 'pill full', text: mode === 'hybrid' ? 'On-site เต็ม' : 'เต็ม' });
      else status = el('span', { class: 'pill open', text: 'เปิดรับ' });
      const onsiteText = mode === 'online' ? '–' : (m.capacity ? c.onsite + '/' + m.capacity : String(c.onsite));
      tbody.append(el('tr', {}, [
        el('td', { class: 'mcell' }, [
          el('div', { class: 'mname', text: m.name }),
          el('div', { class: 'mid' }, [
            m.id + ' · ',
            el('span', { class: 'pill type', text: m.type === 'workshop' ? 'เชิงปฏิบัติการ' : 'ประชุม' }),
            ' ',
            el('span', { class: 'pill mode', text: MODE_LABEL[mode] }),
          ].concat(m.open && mode !== 'onsite' && !m.online_link
            ? [' ', el('span', { class: 'pill full', text: 'ยังไม่มีลิงก์ออนไลน์' })]
            : [])),
          el('div', { class: 'mlink' }, [
            el('a', { href: formLink(m.id), target: '_blank', rel: 'noopener', text: formLink(m.id) }),
          ]),
          el('div', { class: 'actions' }, [
            el('button', { class: 'btn primary small', type: 'button', text: 'ออกลิงก์', onclick: () => openLinkPanel(m) }),
            el('button', { class: 'btn ghost small', type: 'button', text: 'แก้ไข', onclick: () => openEditor(m) }),
            el('button', { class: 'btn ghost small', type: 'button', text: 'รายชื่อ (' + c.total + ')', onclick: () => openResponses(m) }),
          ]),
        ]),
        el('td', { text: m.date_text || thaiRange(m.date_start, m.date_end) }),
        el('td', {}, [status]),
        el('td', { class: 'num', text: onsiteText }),
        el('td', { class: 'num', text: mode === 'onsite' ? '–' : String(c.online) }),
        el('td', { class: 'num', text: String(c.absent) }),
        el('td', { class: 'num', text: m.type === 'workshop' ? String(c.lodging) : '–' }),
      ]));
    });
  }

  function syncModeFields() {
    const f = $('#meetingForm');
    const online = f.elements.attend_mode.value === 'online';
    $('#capacityField').hidden = online;
    if (online) f.elements.capacity.value = '';
    $('#onlineSection').hidden = f.elements.attend_mode.value === 'onsite';
  }

  function updateLinkPreview() {
    const id = $('#meetingForm').elements.id.value.trim();
    $('#linkPreview').textContent = id ? 'ลิงก์: ' + formLink(id) : '';
  }

  function fillPaySelects() {
    $$('.js-pay').forEach((sel) => {
      sel.innerHTML = '';
      data.payOptions.forEach((o) => sel.append(new Option(o, o)));
    });
  }

  function openEditor(m) {
    const f = $('#meetingForm');
    fillPaySelects();
    f.reset();
    editingId = m ? m.id : null;
    $('#meetingFormTitle').textContent = m ? 'แก้ไขการประชุม' : 'เพิ่มการประชุม';
    $('#meetingError').hidden = true;
    const v = m || { type: 'meeting', attend_mode: 'hybrid', status: 'เปิด', pay_food: 'ผู้จัดรับผิดชอบ', pay_lodging: 'ไม่มี', pay_travel: 'เบิกจากต้นสังกัด' };
    if (!v.attend_mode) v.attend_mode = v.type === 'workshop' ? 'onsite' : 'hybrid';
    if (!m) v.id = data.nextId || '';
    $('#idHint').textContent = m ? 'เปลี่ยนไม่ได้' : 'ระบบออกให้อัตโนมัติ (ยืนยันตอนบันทึก)';
    ['id', 'name', 'type', 'attend_mode', 'date_start', 'date_end', 'date_text', 'venue', 'close_date', 'capacity', 'status',
      'pay_food', 'pay_lodging', 'pay_travel', 'pay_note',
      'online_platform', 'online_link', 'online_user', 'online_password'].forEach((k) => {
      if (v[k] != null) f.elements[k].value = v[k];
    });
    f.elements.date_text.dataset.auto = (!m || m.date_text === thaiRange(m.date_start, m.date_end)) ? '1' : '';
    const del = $('#deleteMeetingBtn');
    del.hidden = !m;
    del.disabled = !!(m && m.counts.total);
    del.title = m && m.counts.total ? 'มีผู้ตอบรับแล้ว ให้เปลี่ยนสถานะเป็นปิดรับแทน' : '';
    $('#linkPanel').hidden = true;
    updateLinkPreview();
    syncModeFields();
    showMeetingView('form');
    f.elements.name.focus();
  }

  function syncDateText() {
    const f = $('#meetingForm');
    if (f.elements.date_text.dataset.auto !== '1') return;
    f.elements.date_text.value = thaiRange(f.elements.date_start.value, f.elements.date_end.value || f.elements.date_start.value);
  }

  async function saveMeeting(e) {
    e.preventDefault();
    const f = $('#meetingForm');
    const meeting = {};
    Array.from(f.elements).forEach((x) => { if (x.name) meeting[x.name] = x.value.trim(); });
    const err = $('#meetingError');
    err.hidden = true;
    const btn = f.querySelector('button[type=submit]');
    await withBusy(btn, async () => {
      try {
        const res = await call('saveMeeting', { meeting, originalId: editingId || '' });
        await reload();
        const saved = data.meetings.find((x) => x.id === (res.id || meeting.id));
        toast(editingId ? 'บันทึกการประชุมแล้ว' : 'สร้างการประชุมและออกลิงก์แล้ว');
        if (saved) openLinkPanel(saved);
        else showMeetingView('list');
      } catch (ex) {
        err.textContent = ex.message;
        err.hidden = false;
      }
    });
  }

  async function deleteMeeting() {
    if (!editingId || !window.confirm('ลบการประชุม ' + editingId + ' ?')) return;
    try {
      await call('deleteMeeting', { id: editingId });
      toast('ลบการประชุมแล้ว');
      await reload();
      showMeetingView('list');
    } catch (ex) {
      toast(ex.message, true);
    }
  }

  /* ------------------------------------------------------- responses */

  async function openResponses(m) {
    $('#responseTitle').textContent = m.name;
    $('#responseCount').textContent = 'กำลังโหลด…';
    $('#responseTable thead').innerHTML = '';
    $('#responseTable tbody').innerHTML = '';
    const sendBtn = $('#sendOnlineBtn');
    const mode = m.attend_mode || (m.type === 'workshop' ? 'onsite' : 'hybrid');
    sendBtn.hidden = mode === 'onsite' || !m.counts.online;
    sendBtn.textContent = 'ส่งข้อมูลประชุมออนไลน์ทางอีเมล (' + m.counts.online + ' คน)';
    showMeetingView('responses');
    try {
      const res = await call('responses', { id: m.id });
      const rows = res.rows.map((arr) => Object.fromEntries(res.headers.map((h, i) => [h, arr[i]])));
      currentResponses = { meeting: m, headers: res.headers, rows: res.rows, objects: rows };
      const c = m.counts;
      $('#responseCount').textContent = 'ตอบรับ ' + rows.length + ' คน · On-site ' + c.onsite +
        (m.type === 'workshop' ? ' · ขอที่พัก ' + c.lodging : ' · Online ' + c.online) + ' · ไม่เข้าร่วม ' + c.absent;
      const head = el('tr', {}, [el('th', { text: '#' })].concat(RESPONSE_COLS.map(([h]) => el('th', { text: h }))));
      $('#responseTable thead').append(head);
      const tbody = $('#responseTable tbody');
      if (!rows.length) {
        tbody.append(el('tr', {}, [el('td', { class: 'empty', colspan: String(RESPONSE_COLS.length + 1), text: 'ยังไม่มีผู้ตอบรับ' })]));
        return;
      }
      rows.forEach((r, i) => {
        tbody.append(el('tr', {}, [el('td', { class: 'num', text: String(i + 1) })]
          .concat(RESPONSE_COLS.map(([, fn]) => el('td', { text: fn(r) || '' })))));
      });
    } catch (ex) {
      $('#responseCount').textContent = ex.message;
    }
  }

  async function sendOnlineInfo(e) {
    if (!currentResponses) return;
    const m = currentResponses.meeting;
    if (!m.online_link) {
      toast('ยังไม่ได้กรอกลิงก์ประชุมออนไลน์ กด "แก้ไข" ที่ประชุมนี้เพื่อกรอกก่อน', true);
      return;
    }
    const msg = 'ส่งอีเมลข้อมูลเข้าประชุมออนไลน์ให้ผู้ลงทะเบียนแบบ Online ' + m.counts.online + ' คน?\n\n' +
      (m.online_platform ? 'ระบบ: ' + m.online_platform + '\n' : '') + 'ลิงก์: ' + m.online_link;
    if (!window.confirm(msg)) return;
    const btn = e.currentTarget;
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'กำลังส่ง…';
    try {
      const res = await call('sendOnlineInfo', { id: m.id });
      const fail = res.failed && res.failed.length ? ' (ส่งไม่สำเร็จ ' + res.failed.length + ': ' + res.failed.join(', ') + ')' : '';
      toast('ส่งอีเมลแล้ว ' + res.sent + ' ฉบับ' + fail, !!fail);
    } catch (ex) {
      toast(ex.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  function downloadCsv() {
    if (!currentResponses) return;
    const esc = (v) => {
      const s = String(v == null ? '' : v);
      const safe = /^[=+\-@]/.test(s) ? "'" + s : s;
      return /[",\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
    };
    const lines = [currentResponses.headers.map(esc).join(',')]
      .concat(currentResponses.rows.map((r) => r.map(esc).join(',')));
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = el('a', { href: URL.createObjectURL(blob), download: currentResponses.meeting.id + '.csv' });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* ------------------------------------------------ lists / units / config */

  function linesOf(name, root) {
    return $('[name="' + name + '"]', root).value.split('\n').map((s) => s.trim()).filter(Boolean);
  }

  function renderLists() {
    const p = $('[data-panel="lists"]');
    ['prefix', 'position', 'food', 'travel'].forEach((k) => {
      $('[name="' + k + '"]', p).value = (data.lists[k] || []).join('\n');
    });
  }

  function renderUnits() {
    const p = $('[data-panel="units"]');
    $('[name="units"]', p).value = data.units.join('\n');
    $('#unitCount').textContent = data.units.length + ' หน่วยงาน';
  }

  function renderConfig() {
    const p = $('[data-panel="config"]');
    Object.entries(data.config).forEach(([k, v]) => {
      const input = $('[name="' + k + '"]', p);
      if (!input) return;
      input.value = k === 'admin_emails' ? String(v || '').split(/[\s,;]+/).filter(Boolean).join('\n') : v;
    });
  }

  async function saveLists(e) {
    const p = $('[data-panel="lists"]');
    const lists = {};
    ['prefix', 'position', 'food', 'travel'].forEach((k) => { lists[k] = linesOf(k, p); });
    await withBusy(e.currentTarget, async () => {
      try { await call('saveLists', { lists }); data.lists = lists; toast('บันทึกตัวเลือกแล้ว'); }
      catch (ex) { toast(ex.message, true); }
    });
  }

  async function saveUnits(e) {
    const units = linesOf('units', $('[data-panel="units"]'));
    await withBusy(e.currentTarget, async () => {
      try {
        const res = await call('saveUnits', { units });
        data.units = units;
        $('#unitCount').textContent = (res.count != null ? res.count : units.length) + ' หน่วยงาน';
        toast('บันทึกหน่วยงานแล้ว');
      } catch (ex) { toast(ex.message, true); }
    });
  }

  async function saveConfig(e) {
    const p = $('[data-panel="config"]');
    const values = {};
    $$('input[name], textarea[name]', p).forEach((i) => { values[i.name] = i.value.trim(); });
    if ('admin_emails' in values) values.admin_emails = values.admin_emails.split(/[\s,;]+/).filter(Boolean).join(', ');
    await withBusy(e.currentTarget, async () => {
      try { await call('saveConfig', { values }); data.config = values; toast('บันทึกการตั้งค่าแล้ว'); }
      catch (ex) { toast(ex.message, true); }
    });
  }

  /* -------------------------------------------------------------- init */

  function init() {
    if (useMock) $('#foot').textContent = 'โหมดทดสอบ: ข้อมูลจำลอง ปุ่มเข้าสู่ระบบเป็นแบบจำลอง';

    $('#logoutBtn').addEventListener('click', () => logout());
    $$('.tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

    $('#newMeetingBtn').addEventListener('click', () => openEditor(null));
    $('#cancelMeetingBtn').addEventListener('click', () => showMeetingView('list'));
    $('#deleteMeetingBtn').addEventListener('click', deleteMeeting);
    $('#meetingForm').addEventListener('submit', saveMeeting);
    $('#meetingForm').elements.date_start.addEventListener('change', syncDateText);
    $('#meetingForm').elements.date_end.addEventListener('change', syncDateText);
    $('#meetingForm').elements.date_text.addEventListener('input', (e) => { e.target.dataset.auto = ''; });
    $('#meetingForm').elements.type.addEventListener('change', (e) => {
      // ค่าเริ่มต้นตามประเภท ผู้ดูแลเปลี่ยนต่อได้
      $('#meetingForm').elements.attend_mode.value = e.target.value === 'workshop' ? 'onsite' : 'hybrid';
      syncModeFields();
    });
    $('#meetingForm').elements.attend_mode.addEventListener('change', syncModeFields);
    $('#closeLinkPanel').addEventListener('click', () => { $('#linkPanel').hidden = true; });
    $('#copyLinkBtn').addEventListener('click', () => copyText($('#linkInput').value, 'คัดลอกลิงก์แล้ว'));
    $('#copyInviteBtn').addEventListener('click', () => copyText($('#inviteText').value, 'คัดลอกข้อความแล้ว'));
    $('#backToListBtn').addEventListener('click', () => showMeetingView('list'));
    $('#csvBtn').addEventListener('click', downloadCsv);
    $('#sendOnlineBtn').addEventListener('click', sendOnlineInfo);
    $('#saveListsBtn').addEventListener('click', saveLists);
    $('#saveUnitsBtn').addEventListener('click', saveUnits);
    $('#saveConfigBtn').addEventListener('click', saveConfig);

    setupGoogleSignIn();
    // ใช้ token เดิมในแท็บนี้ต่อ ถ้ายังไม่หมดอายุ (หมดแล้วจะกลับไปหน้าเข้าสู่ระบบ)
    const saved = storage((s) => s.getItem('rsvp_admin_token'));
    if (saved) login(saved).catch(() => logout());
  }

  init();
})();
