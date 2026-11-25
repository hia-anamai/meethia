(function () {
  'use strict';

  const OTHER = '__other';
  const ONSITE = 'On-site', ONLINE = 'Online', ABSENT = 'ไม่เข้าร่วม';
  const BANGKOK = 'กรุงเทพมหานคร';
  const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

  const params = new URLSearchParams(location.search);
  // รองรับทั้งลิงก์สั้น /m/<รหัส> และแบบเดิม ?m=<รหัส>
  const pathMatch = location.pathname.match(/\/m\/([^/]+)\/?$/);
  const meetingId = (pathMatch ? decodeURIComponent(pathMatch[1]) : (params.get('m') || '')).trim();
  const apiUrl = (window.APP_CONFIG && window.APP_CONFIG.API_URL) || '';
  // โหมดจำลองใช้ได้เฉพาะตอนทดสอบในเครื่อง บนเว็บจริงจะใช้ Apps Script เสมอ
  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const useMock = isLocal && (params.get('mock') === '1' || !apiUrl);

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const form = $('#form');
  const field = (name) => form.elements[name];

  let meeting = null;
  let config = {};
  let stepIndex = 0;
  let cancelOnly = false; // ที่นั่งเต็ม และผู้ใช้เลือกแจ้งยกเลิก

  const MODE_LABEL = { hybrid: 'On-site และ Online', onsite: 'On-site', online: 'Online' };

  /* ระดับตำแหน่งข้าราชการพลเรือนสามัญ (ก.พ.) แยกตามประเภทตำแหน่ง */
  const NO_LEVEL = '-';
  const LV = {
    academic: ['ปฏิบัติการ', 'ชำนาญการ', 'ชำนาญการพิเศษ', 'เชี่ยวชาญ'],
    expert: ['ปฏิบัติการ', 'ชำนาญการ', 'ชำนาญการพิเศษ', 'เชี่ยวชาญ', 'ทรงคุณวุฒิ'],
    general: ['ปฏิบัติงาน', 'ชำนาญงาน', 'อาวุโส', 'ทักษะพิเศษ'],
    director: ['อำนวยการต้น', 'อำนวยการสูง'],
    executive: ['บริหารต้น', 'บริหารสูง'],
  };
  const LV_GROUP = {
    academic: 'ประเภทวิชาการ', expert: 'ประเภทวิชาการ', general: 'ประเภททั่วไป',
    director: 'ประเภทอำนวยการ', executive: 'ประเภทบริหาร',
  };
  const POSITION_LEVELS = {
    'ผู้อำนวยการ': ['director', 'expert'],
    'รองผู้อำนวยการ': ['expert'],
    'หัวหน้ากลุ่มงาน': ['expert'],
    'แพทย์': ['expert'],
    'ทันตแพทย์': ['expert'],
    'เภสัชกร': ['expert'],
    'นักวิชาการสาธารณสุข': ['expert'],
  };
  // ตำแหน่งบริหารจัดการ ต่อท้ายระดับในวงเล็บ ตำแหน่งในสายงานต่อท้ายติดกัน เช่น นักวิชาการสาธารณสุขชำนาญการ
  const isManagerTitle = (p) => /^(ผู้อำนวยการ|รองผู้อำนวยการ|หัวหน้า)/.test(p);

  function levelGroupsFor(pos) {
    if (POSITION_LEVELS[pos]) return POSITION_LEVELS[pos];
    if (/^(เจ้าพนักงาน|เจ้าหน้าที่|นายช่าง|ช่าง)/.test(pos)) return ['general'];
    if (/^(นัก|พยาบาล|นิติกร)/.test(pos)) return ['academic'];
    return ['expert', 'general', 'director', 'executive'];
  }

  function fillLevel() {
    const sel = field('level');
    const posSel = field('position');
    const pos = selectValue('position');
    sel.innerHTML = '';
    if (!posSel.value) {
      sel.append(new Option('— เลือกตำแหน่งก่อน —', ''));
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    sel.append(new Option('— เลือกระดับ —', ''));
    const groups = posSel.value === OTHER ? ['expert', 'general', 'director', 'executive'] : levelGroupsFor(pos);
    groups.forEach((g) => {
      const og = document.createElement('optgroup');
      og.label = LV_GROUP[g];
      LV[g].forEach((v) => og.append(new Option(v, v)));
      sel.append(og);
    });
    sel.append(new Option('ไม่มีระดับ (พนักงานราชการ / ลูกจ้าง / อื่น ๆ)', NO_LEVEL));
  }

  function positionWithLevel() {
    const pos = selectValue('position');
    const lv = field('level').value;
    if (!lv || lv === NO_LEVEL) return pos;
    return isManagerTitle(pos) ? pos + ' (' + lv + ')' : pos + lv;
  }

  /* ---------------------------------------------------------------- API */

  async function apiInit(id) {
    if (useMock) return window.MOCK_API.init(id);
    const res = await fetch(apiUrl + '?action=init&m=' + encodeURIComponent(id));
    return res.json();
  }

  async function apiSubmit(data) {
    if (useMock) return window.MOCK_API.submit(data);
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // ไม่ทำให้เกิด CORS preflight
      body: JSON.stringify(data),
    });
    return res.json();
  }

  /* ------------------------------------------------------------ helpers */

  function thaiDate(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    return d + ' ' + MONTHS[m - 1] + ' ' + (y + 543);
  }

  function addDays(iso, n) {
    const d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function fillSelect(select, items, opts) {
    opts = opts || {};
    select.innerHTML = '';
    select.append(new Option(opts.placeholder || '— เลือก —', ''));
    items.forEach((v) => select.append(new Option(v, v)));
    if (opts.other !== false) select.append(new Option('อื่น ๆ (ระบุ)', OTHER));
  }

  function radioValue(name) {
    const el = form.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : '';
  }

  function checkedValues(name) {
    return $$('input[name="' + name + '"]:checked', form).map((el) => el.value);
  }

  function travelValue() {
    return checkedValues('travel')
      .map((v) => (v === OTHER ? text('travel_other') : v))
      .filter(Boolean)
      .join(', ');
  }

  function renderTravelOptions(items) {
    const box = $('#travelOptions');
    items.concat([OTHER]).forEach((value) => {
      const l = document.createElement('label');
      l.className = 'choice';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.name = 'travel';
      input.value = value;
      l.append(input, ' ' + (value === OTHER ? 'อื่น ๆ (ระบุ)' : value));
      box.append(l);
    });
  }

  function selectValue(name) {
    const sel = field(name);
    if (sel.value === OTHER) return field(sel.dataset.other).value.trim();
    return sel.value;
  }

  function text(name) {
    return (field(name).value || '').trim();
  }

  function showFatal(title, msg) {
    $('#loading').hidden = true;
    form.hidden = true;
    $('#fatalTitle').textContent = title;
    $('#fatalText').textContent = msg;
    $('#fatal').hidden = false;
  }

  function contactLine() {
    return config.contact_phone ? 'สอบถามเพิ่มเติม โทร ' + config.contact_phone : '';
  }

  /* ---------------------------------------------------------- เงื่อนไข */

  function lodgingEligible() {
    return meeting.type === 'workshop' &&
      radioValue('attendance') === ONSITE &&
      field('province').value && field('province').value !== BANGKOK &&
      meeting.pay_lodging !== 'ไม่มี';
  }

  function activeSteps() {
    const steps = ['consent', 'person', 'attend'];
    if (lodgingEligible()) steps.push('lodging');
    return steps;
  }

  /* ------------------------------------------------------------ render */

  function renderMeeting() {
    $('#meetingName').textContent = meeting.name;
    $('#meetingDate').textContent = meeting.date_text || thaiDate(meeting.date_start);
    $('#meetingVenue').textContent = meeting.venue || (meeting.attend_mode === 'online' ? 'ออนไลน์' : '-');
    if (meeting.close_date) $('#meetingClose').textContent = thaiDate(meeting.close_date);
    else $('#closeRow').hidden = true;
    if (meeting.capacity && meeting.attend_mode !== 'online') {
      $('#meetingSeats').textContent = meeting.full
        ? 'On-site เต็มแล้ว (' + meeting.capacity + ' ที่)'
        : 'On-site เหลือ ' + meeting.seats_left + ' จาก ' + meeting.capacity + ' ที่';
      $('#seatRow').hidden = false;
    }
    $('#meetingType').textContent = meeting.type === 'workshop' ? 'ประชุมเชิงปฏิบัติการ' : 'ประชุม';
    $('#meetingMode').textContent = MODE_LABEL[meeting.attend_mode] || '';
    $('#meetingHeader').hidden = false;
    document.title = 'ตอบรับ: ' + meeting.name;
  }

  function payClass(v) {
    if (v === 'ผู้จัดรับผิดชอบ') return 'pay-org';
    if (v === 'เบิกจากต้นสังกัด') return 'pay-self';
    return '';
  }

  function renderExpense() {
    const rows = [
      ['ค่าอาหารและอาหารว่าง', meeting.pay_food],
      ['ค่าที่พัก', meeting.pay_lodging],
      ['ค่าพาหนะเดินทาง', meeting.pay_travel],
    ];
    const table = $('#expenseTable');
    table.innerHTML = '';
    rows.forEach(([k, v]) => {
      const tr = table.insertRow();
      tr.insertCell().textContent = k;
      const td = tr.insertCell();
      td.textContent = v;
      td.className = payClass(v);
    });
    if (meeting.pay_note) {
      $('#payNote').textContent = meeting.pay_note;
      $('#payNote').hidden = false;
    }
  }

  function renderAttendOptions() {
    const box = $('#attendOptions');
    const mode = meeting.attend_mode || (meeting.type === 'workshop' ? 'onsite' : 'hybrid');
    const opts = [];
    if (!cancelOnly && mode !== 'online') opts.push([ONSITE, 'เข้าร่วมประชุม (On-site)']);
    if (!cancelOnly && mode !== 'onsite') opts.push([ONLINE, 'เข้าร่วมประชุม (Online)']);
    opts.push([ABSENT, cancelOnly ? 'ไม่เข้าร่วมประชุม (แจ้งยกเลิก)' : 'ไม่เข้าร่วมประชุม']);

    if (meeting.full && mode === 'hybrid' && !cancelOnly) {
      box.before(Object.assign(document.createElement('p'), {
        className: 'seat-note',
        textContent: 'ที่นั่ง On-site เต็มแล้ว ท่านยังเข้าร่วมแบบ Online ได้',
      }));
    }
    if (cancelOnly) {
      box.before(Object.assign(document.createElement('p'), {
        className: 'seat-note',
        textContent: 'กรอกด้วยอีเมลเดียวกับที่ลงทะเบียนไว้ ระบบจะเปลี่ยนสถานะของท่านเป็นไม่เข้าร่วม',
      }));
    }

    opts.forEach(([value, label]) => {
      const full = value === ONSITE && meeting.full;
      const l = document.createElement('label');
      l.className = 'choice' + (full ? ' disabled' : '');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'attendance';
      input.value = value;
      input.disabled = full;
      l.append(input, ' ' + label);
      if (full) l.append(Object.assign(document.createElement('span'), { className: 'tag', textContent: 'เต็มแล้ว' }));
      box.append(l);
    });
  }

  function renderLodgingStep() {
    const pay = meeting.pay_lodging;
    $('#lodgingPay').textContent = 'ค่าที่พัก: ' + pay + (meeting.pay_note ? ' — ' + meeting.pay_note : '');
    $('#needLodgingLegend').firstChild.textContent = pay === 'เบิกจากต้นสังกัด'
      ? 'ท่านต้องการให้ผู้จัดประสานจองที่พักหรือไม่ (ท่านชำระเองและเบิกจากต้นสังกัด) '
      : 'ท่านต้องการให้ผู้จัดจองที่พักหรือไม่ ';
    const s = meeting.date_start, e = meeting.date_end || meeting.date_start;
    field('check_in').min = addDays(s, -1);
    field('check_in').max = e;
    field('check_out').min = s;
    field('check_out').max = addDays(e, 1);
    if (!field('check_in').value) field('check_in').value = addDays(s, -1);
    if (!field('check_out').value) field('check_out').value = e;
  }

  function setNextLabel(steps) {
    const last = stepIndex === steps.length - 1;
    const btn = $('#nextBtn');
    btn.textContent = last ? 'ส่งแบบตอบรับ' : 'ต่อไป';
    btn.classList.toggle('submit', last);
  }

  function renderStepper() {
    const steps = activeSteps();
    const ol = $('#stepper');
    ol.innerHTML = '';
    steps.forEach((s, i) => {
      const li = document.createElement('li');
      const num = Object.assign(document.createElement('span'), { className: 'num', textContent: String(i + 1) });
      const lbl = Object.assign(document.createElement('span'), { className: 'lbl', textContent: $('[data-step="' + s + '"]').dataset.title });
      li.append(num, lbl);
      if (i < stepIndex) li.className = 'done';
      if (i === stepIndex) li.className = 'active';
      ol.append(li);
    });
  }

  function showStep() {
    const steps = activeSteps();
    if (stepIndex >= steps.length) stepIndex = steps.length - 1;
    const current = steps[stepIndex];
    $$('.step').forEach((el) => { el.hidden = el.dataset.step !== current; });
    $('#backBtn').style.visibility = stepIndex === 0 ? 'hidden' : 'visible';
    setNextLabel(steps);
    $('#stepError').hidden = true;
    renderStepper();
  }

  function updateConditional() {
    const att = radioValue('attendance');
    $('#onsiteBlock').hidden = att !== ONSITE;
    $('#foodField').hidden = meeting.pay_food === 'ไม่มี';
    $('#absentBlock').hidden = att !== ABSENT;
    const need = radioValue('need_lodging') === 'ต้องการ';
    $('#lodgingDetails').hidden = !need;
    $('#roommateField').hidden = radioValue('room_type') !== 'พักคู่';
    $$('select[data-other]').forEach((sel) => {
      field(sel.dataset.other).hidden = sel.value !== OTHER;
    });
    $('#travelOtherField').hidden = checkedValues('travel').indexOf(OTHER) < 0;
    const steps = activeSteps();
    setNextLabel(steps);
    renderStepper();
  }

  /* ---------------------------------------------------------- validate */

  function fail(msg, name) {
    $$('.invalid').forEach((el) => el.classList.remove('invalid'));
    const box = $('#stepError');
    box.textContent = msg;
    box.hidden = false;
    if (name) {
      const el = form.querySelector('[name="' + name + '"]');
      if (el) {
        if (el.type !== 'radio' && el.type !== 'checkbox') el.classList.add('invalid');
        el.focus({ preventScroll: true });
      }
    }
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return false;
  }

  function requireSelect(name, label) {
    const sel = field(name);
    if (!sel.value) return fail('กรุณาเลือก' + label, name);
    if (sel.value === OTHER && !field(sel.dataset.other).value.trim()) return fail('กรุณาระบุ' + label, sel.dataset.other);
    return true;
  }

  function validateStep(step) {
    $$('.invalid').forEach((el) => el.classList.remove('invalid'));
    if (step === 'consent') {
      if (!radioValue('consent')) return fail('กรุณาเลือกยินยอมหรือไม่ยินยอม', 'consent');
      return true;
    }
    if (step === 'person') {
      if (!requireSelect('prefix', 'คำนำหน้า')) return false;
      if (!text('first_name')) return fail('กรุณากรอกชื่อ', 'first_name');
      if (!text('last_name')) return fail('กรุณากรอกนามสกุล', 'last_name');
      if (!requireSelect('position', 'ตำแหน่ง')) return false;
      if (!field('level').value) return fail('กรุณาเลือกระดับ', 'level');
      if (!text('unit')) return fail('กรุณากรอกหน่วยงาน', 'unit');
      if (!field('province').value) return fail('กรุณาเลือกจังหวัด', 'province');
      const phone = text('phone').replace(/[^0-9]/g, '');
      if (!/^0\d{8,9}$/.test(phone)) return fail('เบอร์โทรศัพท์ต้องเป็นตัวเลข 9–10 หลัก ขึ้นต้นด้วย 0', 'phone');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text('email'))) return fail('รูปแบบอีเมลไม่ถูกต้อง', 'email');
      return true;
    }
    if (step === 'attend') {
      const att = radioValue('attendance');
      if (!att) return fail('กรุณาเลือกรูปแบบการเข้าร่วม', 'attendance');
      if (att !== ABSENT && !field('ack_expense').checked) return fail('กรุณายืนยันว่ารับทราบเงื่อนไขค่าใช้จ่าย', 'ack_expense');
      if (att === ONSITE && meeting.pay_food !== 'ไม่มี' && !requireSelect('food', 'ประเภทอาหาร')) return false;
      return true;
    }
    if (step === 'lodging') {
      const need = radioValue('need_lodging');
      if (!need) return fail('กรุณาระบุความต้องการที่พัก', 'need_lodging');
      if (need === 'ต้องการ') {
        const ci = field('check_in').value, co = field('check_out').value;
        if (!ci) return fail('กรุณาระบุวันเข้าพัก', 'check_in');
        if (!co) return fail('กรุณาระบุวันออก', 'check_out');
        if (co <= ci) return fail('วันออกต้องอยู่หลังวันเข้าพัก', 'check_out');
        if (!radioValue('room_type')) return fail('กรุณาเลือกประเภทห้องพัก', 'room_type');
      }
      const travel = checkedValues('travel');
      if (!travel.length) return fail('กรุณาเลือกการเดินทางอย่างน้อย 1 ข้อ', 'travel');
      if (travel.indexOf(OTHER) >= 0 && !text('travel_other')) return fail('กรุณาระบุการเดินทางอื่น ๆ', 'travel_other');
      return true;
    }
    return true;
  }

  /* ------------------------------------------------------------ submit */

  function collect() {
    const att = radioValue('attendance');
    const lodging = lodgingEligible();
    const need = lodging ? radioValue('need_lodging') : '';
    return {
      meeting_id: meeting.id,
      website: field('website').value,
      consent: radioValue('consent'),
      prefix: selectValue('prefix'),
      first_name: text('first_name'),
      last_name: text('last_name'),
      position: positionWithLevel(),
      unit: text('unit'),
      province: field('province').value,
      phone: text('phone').replace(/[^0-9]/g, ''),
      email: text('email').toLowerCase(),
      ack_expense: field('ack_expense').checked,
      attendance: att,
      food: att === ONSITE && meeting.pay_food !== 'ไม่มี' ? selectValue('food') : '',
      allergy: att === ONSITE ? text('allergy') : '',
      absence_note: att === ABSENT ? text('absence_note') : '',
      need_lodging: need,
      check_in: need === 'ต้องการ' ? field('check_in').value : '',
      check_out: need === 'ต้องการ' ? field('check_out').value : '',
      room_type: need === 'ต้องการ' ? radioValue('room_type') : '',
      roommate: need === 'ต้องการ' && radioValue('room_type') === 'พักคู่' ? text('roommate') : '',
      travel: lodging ? travelValue() : '',
      lodging_note: lodging ? text('lodging_note') : '',
    };
  }

  function renderDone(data, res) {
    form.hidden = true;
    $('#doneTitle').textContent = res.updated ? 'ปรับปรุงข้อมูลการตอบรับแล้ว' : 'ส่งแบบตอบรับเรียบร้อยแล้ว';
    let doneText = res.emailSent === false
      ? 'ระบบบันทึกข้อมูลแล้ว แต่ส่งอีเมลยืนยันไม่สำเร็จ'
      : 'ระบบส่งอีเมลยืนยันไปที่ ' + data.email + ' แล้ว';
    if (data.attendance === ONLINE) {
      doneText += meeting.online_ready && res.emailSent !== false
        ? ' ลิงก์และรหัสเข้าร่วมประชุมออนไลน์อยู่ในอีเมลฉบับนี้'
        : ' ผู้จัดจะส่งลิงก์เข้าร่วมประชุมออนไลน์ให้ทางอีเมลก่อนวันประชุม';
    }
    $('#doneText').textContent = doneText;
    const rows = [
      ['ชื่อ-นามสกุล', data.prefix + data.first_name + ' ' + data.last_name],
      ['หน่วยงาน', data.unit + ' (' + data.province + ')'],
      ['การเข้าร่วม', data.attendance],
      ['ประเภทอาหาร', data.food],
      ['อาหารที่แพ้', data.allergy],
      ['ที่พัก', data.need_lodging],
      ['วันเข้าพัก – วันออก', data.check_in ? thaiDate(data.check_in) + ' – ' + thaiDate(data.check_out) : ''],
      ['ประเภทห้อง', data.room_type],
      ['ผู้พักร่วม', data.roommate],
      ['การเดินทาง', data.travel],
      ['ค่าอาหารและอาหารว่าง', meeting.pay_food],
      ['ค่าที่พัก', meeting.pay_lodging],
      ['ค่าพาหนะเดินทาง', meeting.pay_travel],
    ];
    const table = $('#doneSummary');
    table.innerHTML = '';
    rows.filter((r) => r[1]).forEach(([k, v]) => {
      const tr = table.insertRow();
      tr.insertCell().textContent = k;
      tr.insertCell().textContent = v;
    });
    $('#doneEdit').textContent = 'หากต้องการแก้ไขหรือยกเลิก ให้กรอกแบบตอบรับนี้อีกครั้งด้วยอีเมลเดิม ระบบจะใช้ข้อมูลล่าสุด ' + contactLine();
    $('#done').hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function next() {
    const steps = activeSteps();
    const current = steps[stepIndex];
    if (!validateStep(current)) return;

    if (current === 'consent' && radioValue('consent') === 'ไม่ยินยอม') {
      showFatal('ไม่สามารถลงทะเบียนผ่านแบบฟอร์มนี้ได้',
        'การลงทะเบียนต้องได้รับความยินยอมในการใช้ข้อมูลส่วนบุคคล กรุณาแจ้งการเข้าร่วมประชุมกับผู้จัดโดยตรง ' + contactLine());
      return;
    }

    if (stepIndex < steps.length - 1) {
      stepIndex++;
      if (steps[stepIndex] === 'lodging') renderLodgingStep();
      showStep();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const btn = $('#nextBtn');
    btn.disabled = true;
    $('#backBtn').disabled = true;
    btn.textContent = '';
    btn.append(Object.assign(document.createElement('span'), { className: 'spinner small on-dark' }), 'กำลังส่ง…');
    form.classList.add('is-sending');
    btn.classList.add('is-busy');
    const stopHints = progressHints($('#submitHint'), [
      [3000, 'กำลังบันทึกข้อมูลและส่งอีเมลยืนยัน'],
      [9000, 'ยังทำงานอยู่ อาจใช้เวลาสักครู่ กรุณาอย่าปิดหน้านี้'],
    ]);
    const data = collect();
    try {
      const res = await apiSubmit(data);
      if (!res.ok) throw new Error(res.error || 'ส่งข้อมูลไม่สำเร็จ');
      renderDone(data, res);
    } catch (err) {
      fail(err.message === 'Failed to fetch' ? 'เชื่อมต่อระบบไม่ได้ กรุณาลองใหม่อีกครั้ง' : err.message);
    } finally {
      stopHints();
      form.classList.remove('is-sending');
      btn.classList.remove('is-busy');
      btn.disabled = false;
      $('#backBtn').disabled = false;
      showStepLabelOnly();
    }
  }

  /** เปลี่ยนข้อความสถานะตามเวลาที่รอ คืนฟังก์ชันสำหรับหยุดและล้างข้อความ */
  function progressHints(el, steps) {
    const timers = steps.map(([ms, msg]) => setTimeout(() => { el.textContent = msg; }, ms));
    return () => { timers.forEach(clearTimeout); el.textContent = ''; };
  }

  function showStepLabelOnly() {
    const steps = activeSteps();
    setNextLabel(steps);
  }

  function back() {
    if (stepIndex > 0) stepIndex--;
    showStep();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* -------------------------------------------------------------- init */

  /** หน้าแรก: ชื่อหน่วยงานและเบอร์ติดต่อจากแท็บ config (แก้ได้ที่หน้าผู้ดูแล > ตั้งค่าทั่วไป) */
  function applyWelcome(cfg) {
    const org = cfg.org_name || 'กรมอนามัย';
    $('#welcomeOrg').textContent = org;
    $('#welcomeContactOrg').textContent = org;
    document.title = 'ระบบตอบรับการประชุม · ' + org;
    const card = $('#welcomePhone');
    const phone = String(cfg.contact_phone || '').trim();
    if (phone) {
      $('#welcomePhoneText').textContent = 'โทร ' + phone;
      card.href = 'tel:' + phone.replace(/[^0-9+]/g, '');
      card.classList.remove('is-loading');
      card.removeAttribute('aria-busy');
    }
    return phone;
  }

  async function renderWelcome() {
    // แสดงหน้าแรกทันที: ใช้ค่าที่จำไว้จากครั้งก่อน (ถ้ามี) ระหว่างรอ Apps Script ซึ่งอาจตอบช้าหลายวินาที
    $('#loading').hidden = true;
    $('#welcome').hidden = false;
    const remembered = storageGet('rsvp_welcome');
    if (remembered) applyWelcome(remembered);
    try {
      let data;
      if (useMock) data = await window.MOCK_API.init('');
      else {
        data = await fetch(apiUrl + '?action=config').then((r) => r.json());
        if (!data.ok || !data.config) data = await apiInit(''); // Apps Script รุ่นเก่ายังไม่มี action=config
      }
      if (data && data.ok) {
        config = data.config || {};
        storageSet('rsvp_welcome', { org_name: config.org_name, contact_phone: config.contact_phone });
      }
    } catch (e) { /* แสดงหน้าแรกด้วยค่าที่มี */ }
    const phone = applyWelcome(Object.keys(config).length ? config : (remembered || {}));
    if (!phone) $('#welcomePhone').hidden = true; // ไม่มีเบอร์ให้แสดง ซ่อนการ์ด
  }

  function storageGet(key) {
    try { return JSON.parse(window.localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }

  function storageSet(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ไม่เป็นไร */ }
  }

  async function init() {
    if (useMock) $('#foot').textContent = 'โหมดทดสอบ: ใช้ข้อมูลจำลอง ไม่มีการบันทึกจริง';
    // ข้อความระหว่างรอ Apps Script (หยุดเองเมื่อซ่อนหน้าโหลด)
    const stopLoadingHints = progressHints($('#loadingHint'), [
      [2500, 'กำลังเชื่อมต่อกับระบบ อาจใช้เวลา 5–10 วินาที'],
      [9000, 'ยังโหลดอยู่ ระบบใช้เวลานานขึ้นเมื่อไม่มีผู้ใช้มาสักพัก ขอบคุณที่รอ'],
      [20000, 'ใช้เวลานานกว่าปกติ หากยังไม่ขึ้น ลองรีเฟรชหน้านี้'],
    ]);
    new MutationObserver((_, obs) => {
      if ($('#loading').hidden) { stopLoadingHints(); obs.disconnect(); }
    }).observe($('#loading'), { attributes: true, attributeFilter: ['hidden'] });
    if (!meetingId) {
      await renderWelcome();
      return;
    }
    let data;
    try {
      data = await apiInit(meetingId);
    } catch (err) {
      showFatal('เชื่อมต่อระบบไม่ได้', 'กรุณาลองใหม่อีกครั้ง');
      return;
    }
    if (!data.ok) { showFatal('ระบบขัดข้อง', data.error || ''); return; }
    config = data.config || {};
    if (!data.meeting) {
      showFatal('ไม่พบการประชุม', 'ลิงก์อาจไม่ถูกต้อง กรุณาใช้ลิงก์จากหนังสือเชิญ ' + contactLine());
      return;
    }
    meeting = data.meeting;
    renderMeeting();
    if (!meeting.open) {
      showFatal('ปิดรับการตอบรับแล้ว', (meeting.closed_reason || '') + ' ' + contactLine());
      return;
    }

    $$('.js-org').forEach((el) => { el.textContent = config.org_name || 'กรมอนามัย'; });
    $('#pdpaYears').textContent = config.pdpa_retention_years || 5;
    if (config.pdpa_policy_url) $('#pdpaLink').href = config.pdpa_policy_url;
    else $('#pdpaLinkWrap').hidden = true;

    const lists = data.lists || {};
    fillSelect(field('prefix'), lists.prefix || []);
    fillSelect(field('position'), lists.position || []);
    fillSelect(field('food'), lists.food || []);
    renderTravelOptions(lists.travel || []);
    fillSelect(field('province'), window.PROVINCES, { other: false, placeholder: '— เลือกจังหวัด —' });
    const dl = $('#unitList');
    (data.units || []).forEach((u) => dl.append(new Option(u)));

    renderExpense();

    field('position').addEventListener('change', fillLevel);
    form.addEventListener('change', updateConditional);
    $('#nextBtn').addEventListener('click', next);
    $('#backBtn').addEventListener('click', back);
    form.addEventListener('submit', (e) => { e.preventDefault(); next(); });

    $('#loading').hidden = true;
    if (contactLine()) $('#foot').textContent = (useMock ? $('#foot').textContent + ' · ' : '') + contactLine();

    // On-site อย่างเดียวและเต็มแล้ว: แสดงหน้าแจ้งเต็ม ให้แจ้งยกเลิกได้อย่างเดียว
    if (meeting.full && meeting.attend_mode === 'onsite') {
      $('#fullContact').textContent = contactLine();
      $('#fullView').hidden = false;
      $('#cancelRegBtn').addEventListener('click', () => {
        cancelOnly = true;
        $('#fullView').hidden = true;
        startForm();
      });
      return;
    }
    startForm();
  }

  function startForm() {
    renderAttendOptions();
    form.hidden = false;
    showStep();
    updateConditional();
  }

  init();
})();
