/**
 * ระบบตอบรับการประชุม — Apps Script ที่ผูกกับ Google Sheet
 *
 * ติดตั้ง: เปิด Google Sheet > ส่วนขยาย > Apps Script > วางไฟล์นี้
 *   1) เรียกฟังก์ชัน setup() หนึ่งครั้ง เพื่อสร้างแท็บและข้อมูลตั้งต้น
 *   2) ทำให้ใช้งานได้ > การทำให้ใช้งานได้รายการใหม่ > เว็บแอป
 *      ดำเนินการในฐานะ: ฉัน · ผู้ที่มีสิทธิ์เข้าถึง: ทุกคน
 *   3) นำ URL ที่ลงท้ายด้วย /exec ไปใส่ใน public/config.js
 */

const SHEET = {
  MEETINGS: 'meetings',
  RESPONSES: 'responses',
  UNITS: 'units',
  LISTS: 'lists',
  CONFIG: 'config',
  SUMMARY: 'summary',
};

const MEETING_HEADERS = [
  'meeting_id', 'meeting_name', 'meeting_type', 'date_start', 'date_end', 'date_text',
  'venue', 'close_date', 'capacity', 'status',
  'pay_food', 'pay_lodging', 'pay_travel', 'pay_note', 'link', 'attend_mode',
  'online_platform', 'online_link', 'online_user', 'online_password',
];

// ข้อมูลเข้าประชุมออนไลน์: ไม่ส่งออกทาง API สาธารณะ ส่งทางอีเมลให้ผู้เข้าร่วมแบบ Online เท่านั้น
const ONLINE_FIELDS = ['online_platform', 'online_link', 'online_user', 'online_password'];

// รูปแบบการเข้าร่วม: hybrid = On-site และ Online · onsite = On-site อย่างเดียว · online = Online อย่างเดียว
const MODES = ['hybrid', 'onsite', 'online'];

const RESPONSE_HEADERS = [
  'submitted_at', 'updated_at', 'meeting_id', 'meeting_name',
  'prefix', 'first_name', 'last_name', 'position', 'unit', 'province', 'phone', 'email',
  'attendance', 'food', 'allergy', 'absence_note',
  'need_lodging', 'check_in', 'check_out', 'room_type', 'roommate', 'travel', 'lodging_note',
  'ack_expense', 'pay_food', 'pay_lodging', 'pay_travel', 'consent',
];

const PAY_OPTIONS = ['ผู้จัดรับผิดชอบ', 'เบิกจากต้นสังกัด', 'ไม่มี'];
const ATTEND = { ONSITE: 'On-site', ONLINE: 'Online', NO: 'ไม่เข้าร่วม' };
const ROOM_TYPES = ['พักคู่', 'พักเดี่ยว'];
const BANGKOK = 'กรุงเทพมหานคร';

const PROVINCES = [
  'กรุงเทพมหานคร', 'กระบี่', 'กาญจนบุรี', 'กาฬสินธุ์', 'กำแพงเพชร', 'ขอนแก่น', 'จันทบุรี',
  'ฉะเชิงเทรา', 'ชลบุรี', 'ชัยนาท', 'ชัยภูมิ', 'ชุมพร', 'เชียงราย', 'เชียงใหม่', 'ตรัง', 'ตราด',
  'ตาก', 'นครนายก', 'นครปฐม', 'นครพนม', 'นครราชสีมา', 'นครศรีธรรมราช', 'นครสวรรค์',
  'นนทบุรี', 'นราธิวาส', 'น่าน', 'บึงกาฬ', 'บุรีรัมย์', 'ปทุมธานี', 'ประจวบคีรีขันธ์',
  'ปราจีนบุรี', 'ปัตตานี', 'พระนครศรีอยุธยา', 'พะเยา', 'พังงา', 'พัทลุง', 'พิจิตร', 'พิษณุโลก',
  'เพชรบุรี', 'เพชรบูรณ์', 'แพร่', 'ภูเก็ต', 'มหาสารคาม', 'มุกดาหาร', 'แม่ฮ่องสอน', 'ยโสธร',
  'ยะลา', 'ร้อยเอ็ด', 'ระนอง', 'ระยอง', 'ราชบุรี', 'ลพบุรี', 'ลำปาง', 'ลำพูน', 'เลย',
  'ศรีสะเกษ', 'สกลนคร', 'สงขลา', 'สตูล', 'สมุทรปราการ', 'สมุทรสงคราม', 'สมุทรสาคร',
  'สระแก้ว', 'สระบุรี', 'สิงห์บุรี', 'สุโขทัย', 'สุพรรณบุรี', 'สุราษฎร์ธานี', 'สุรินทร์',
  'หนองคาย', 'หนองบัวลำภู', 'อ่างทอง', 'อำนาจเจริญ', 'อุดรธานี', 'อุตรดิตถ์', 'อุทัยธานี',
  'อุบลราชธานี',
];

// หน่วยงานในสังกัดกรมอนามัย 37 แห่ง ตามหน้า "หน่วยงานในสังกัดกรมอนามัย"
// https://anamai.moph.go.th/th/web-link (ตรวจเมื่อ 25 พ.ย. 2569)
const DOH_UNITS = [
  // ส่วนกลาง
  'สำนักงานเลขานุการกรม', 'สำนักคณะกรรมการผู้ทรงคุณวุฒิ', 'กองการเจ้าหน้าที่', 'กองคลัง', 'กองแผนงาน',
  'กองกฎหมาย', 'กลุ่มตรวจสอบภายใน', 'กลุ่มพัฒนาระบบบริหาร',
  'สำนักส่งเสริมสุขภาพ', 'สำนักทันตสาธารณสุข', 'สำนักโภชนาการ', 'สำนักอนามัยการเจริญพันธุ์',
  'สำนักอนามัยผู้สูงอายุ', 'สำนักอนามัยสิ่งแวดล้อม', 'สำนักสุขาภิบาลอาหารและน้ำ',
  'กองกิจกรรมทางกายเพื่อสุขภาพ', 'กองประเมินผลกระทบต่อสุขภาพ', 'กองส่งเสริมความรอบรู้และสื่อสารสุขภาพ',
  'กองอนามัยฉุกเฉิน', 'กองห้องปฏิบัติการสาธารณสุข', 'ศูนย์ความร่วมมือระหว่างประเทศ',
  'ศูนย์ทันตสาธารณสุขระหว่างประเทศ', 'สถาบันเวชศาสตร์วิถีชีวิต',
  // ส่วนภูมิภาค
  'ศูนย์อนามัยที่ 1', 'ศูนย์อนามัยที่ 2', 'ศูนย์อนามัยที่ 3', 'ศูนย์อนามัยที่ 4', 'ศูนย์อนามัยที่ 5',
  'ศูนย์อนามัยที่ 6', 'ศูนย์อนามัยที่ 7', 'ศูนย์อนามัยที่ 8', 'ศูนย์อนามัยที่ 9', 'ศูนย์อนามัยที่ 10',
  'ศูนย์อนามัยที่ 11', 'ศูนย์อนามัยที่ 12', 'สถาบันพัฒนาสุขภาวะเขตเมือง',
  'ศูนย์อนามัยกลุ่มชาติพันธุ์ ชายขอบ และแรงงานข้ามชาติ',
];

/* ------------------------------------------------------------------ API */

function doGet(e) {
  try {
    const action = (e.parameter.action || 'init').trim();
    if (action === 'init') {
      const id = (e.parameter.m || '').trim();
      const meeting = id ? getMeeting_(id) : null;
      return json_({
        ok: true,
        meeting: meeting ? Object.assign(publicMeeting_(meeting), seatInfo_(meeting)) : null,
        units: getUnits_(),
        lists: getLists_(),
        config: publicConfig_(),
      });
    }
    if (action === 'config') {
      // หน้าแรก: ชื่อหน่วยงานและเบอร์ติดต่ออย่างเดียว (ไม่อ่านรายชื่อหน่วยงาน/คำตอบ จึงเร็วกว่า init)
      return json_({ ok: true, config: publicConfig_() });
    }
    if (action === 'adminInit') {
      // Client ID ไม่ใช่ความลับ หน้าผู้ดูแลต้องใช้เพื่อแสดงปุ่ม Sign in with Google
      return json_({ ok: true, clientId: String(getConfig_().google_client_id || '').trim() });
    }
    return json_({ ok: false, error: 'ไม่รู้จักคำสั่ง' });
  } catch (err) {
    return json_({ ok: false, error: 'ระบบขัดข้อง: ' + err.message });
  }
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'ข้อมูลไม่ถูกต้อง' });
  }
  if (body.action === 'admin') return json_(admin_(body));
  return register_(body);
}

function register_(body) {
  const lock = LockService.getScriptLock();
  try {
    if (body.website) return json_({ ok: true }); // honeypot กันบอต

    lock.waitLock(20000);
    const meeting = getMeeting_(String(body.meeting_id || '').trim());
    if (!meeting) return json_({ ok: false, error: 'ไม่พบการประชุมนี้ กรุณาใช้ลิงก์จากหนังสือเชิญ' });

    const state = meetingState_(meeting);
    if (!state.open) return json_({ ok: false, error: state.reason });

    const r = validate_(body, meeting);
    if (r.error) return json_({ ok: false, error: r.error });

    const result = upsertResponse_(r.data, meeting);
    if (result.error) return json_({ ok: false, error: result.error });
    invalidateUnits_(r.data.unit);

    let emailSent = false;
    try {
      sendConfirmation_(r.data, meeting, result.updated);
      emailSent = true;
    } catch (mailErr) {
      console.error('ส่งอีเมลไม่สำเร็จ', mailErr);
    }
    return json_({ ok: true, updated: result.updated, emailSent: emailSent });
  } catch (err) {
    return json_({ ok: false, error: 'ระบบขัดข้อง: ' + err.message });
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ------------------------------------------------------------- อ่านข้อมูล */

function ss_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function tz_() {
  return ss_().getSpreadsheetTimeZone() || 'Asia/Bangkok';
}

function isoDate_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  }
  return String(v).trim();
}

function readTable_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  const values = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  const headers = values[0].map(String);
  return values.slice(1).map(function (row, i) {
    const o = { _row: i + 2 };
    headers.forEach(function (h, c) { o[h] = row[c]; });
    return o;
  });
}

function getConfig_() {
  const rows = readTable_(SHEET.CONFIG);
  const cfg = {};
  rows.forEach(function (r) { if (r.key) cfg[String(r.key).trim()] = r.value; });
  return cfg;
}

function publicConfig_() {
  const c = getConfig_();
  return {
    contact_phone: String(c.contact_phone || ''),
    pdpa_retention_years: Number(c.pdpa_retention_years || 5),
    pdpa_policy_url: String(c.pdpa_policy_url || ''),
    org_name: String(c.org_name || 'กรมอนามัย'),
  };
}

function getMeeting_(id) {
  if (!id) return null;
  const rows = readTable_(SHEET.MEETINGS);
  return rows.find(function (r) { return String(r.meeting_id).trim() === id; }) || null;
}

function meetingState_(m) {
  if (String(m.status).trim() === 'ปิด') {
    return { open: false, reason: 'การประชุมนี้ปิดรับการตอบรับแล้ว' };
  }
  const close = isoDate_(m.close_date);
  const today = Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd');
  if (close && today > close) {
    return { open: false, reason: 'เลยกำหนดวันปิดรับการตอบรับแล้ว' };
  }
  return { open: true, reason: '' };
}

function publicMeeting_(m) {
  const state = meetingState_(m);
  return {
    id: String(m.meeting_id).trim(),
    name: String(m.meeting_name || ''),
    type: String(m.meeting_type || 'meeting').trim(),
    attend_mode: attendMode_(m),
    online_ready: !!String(m.online_link || '').trim(), // บอกแค่ว่ามีลิงก์แล้ว ไม่ส่งตัวลิงก์ออกไป
    date_start: isoDate_(m.date_start),
    date_end: isoDate_(m.date_end) || isoDate_(m.date_start),
    date_text: String(m.date_text || ''),
    venue: String(m.venue || ''),
    close_date: isoDate_(m.close_date),
    pay_food: String(m.pay_food || 'ไม่มี'),
    pay_lodging: String(m.pay_lodging || 'ไม่มี'),
    pay_travel: String(m.pay_travel || 'ไม่มี'),
    pay_note: String(m.pay_note || ''),
    open: state.open,
    closed_reason: state.reason,
  };
}

function attendMode_(m) {
  const v = String(m.attend_mode || '').trim();
  if (MODES.indexOf(v) >= 0) return v;
  return String(m.meeting_type || '').trim() === 'workshop' ? 'onsite' : 'hybrid';
}

function allowedAttend_(mode) {
  if (mode === 'onsite') return [ATTEND.ONSITE, ATTEND.NO];
  if (mode === 'online') return [ATTEND.ONLINE, ATTEND.NO];
  return [ATTEND.ONSITE, ATTEND.ONLINE, ATTEND.NO];
}

/** ที่นั่ง On-site: capacity ว่าง = ไม่จำกัด, ประชุม Online อย่างเดียวไม่จำกัด */
function seatInfo_(m, rows) {
  const cap = Number(m.capacity || 0);
  if (!cap || attendMode_(m) === 'online') return { capacity: '', seats_left: null, full: false };
  const id = String(m.meeting_id).trim();
  const taken = (rows || readTable_(SHEET.RESPONSES)).filter(function (r) {
    return String(r.meeting_id).trim() === id && r.attendance === ATTEND.ONSITE;
  }).length;
  const left = Math.max(cap - taken, 0);
  return { capacity: cap, seats_left: left, full: left <= 0 };
}

// รายชื่อหน่วยงานเก็บไว้ชั่วคราว 10 นาที เพื่อไม่ต้องอ่านแท็บ responses ทั้งแท็บทุกครั้งที่มีคนเปิดฟอร์ม
const UNITS_CACHE_KEY = 'units_v1';
const UNITS_CACHE_SECONDS = 600;

function getUnits_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get(UNITS_CACHE_KEY);
  if (hit) {
    try { return JSON.parse(hit); } catch (e) { /* อ่านใหม่จากชีต */ }
  }
  const list = readUnits_();
  try {
    cache.put(UNITS_CACHE_KEY, JSON.stringify(list), UNITS_CACHE_SECONDS);
  } catch (e) {
    // ค่าที่ใหญ่เกิน 100 KB เก็บใน cache ไม่ได้ ก็อ่านจากชีตทุกครั้งแทน
  }
  return list;
}

/** ล้าง cache เมื่อมีหน่วยงานใหม่ ให้รายการในฟอร์มอัปเดตทันที */
function invalidateUnits_(unit) {
  const cache = CacheService.getScriptCache();
  if (unit) {
    const hit = cache.get(UNITS_CACHE_KEY);
    if (hit && JSON.parse(hit).indexOf(unit) >= 0) return; // มีอยู่แล้ว ไม่ต้องล้าง
  }
  cache.remove(UNITS_CACHE_KEY);
}

function readUnits_() {
  const set = {};
  readTable_(SHEET.UNITS).forEach(function (r) {
    const u = String(r.unit || '').trim();
    if (u) set[u] = true;
  });
  readTable_(SHEET.RESPONSES).forEach(function (r) {
    const u = String(r.unit || '').trim();
    if (u) set[u] = true;
  });
  return Object.keys(set).sort(function (a, b) { return a.localeCompare(b, 'th'); });
}

function getLists_() {
  const sh = ss_().getSheetByName(SHEET.LISTS);
  const out = { prefix: [], position: [], food: [], travel: [] };
  if (!sh || sh.getLastRow() < 2) return out;
  const values = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  const headers = values[0].map(String);
  headers.forEach(function (h, c) {
    if (!(h in out)) return;
    for (let i = 1; i < values.length; i++) {
      const v = String(values[i][c] || '').trim();
      if (v) out[h].push(v);
    }
  });
  return out;
}

/* ---------------------------------------------------------- ตรวจข้อมูล */

function clean_(v, max) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 200);
}

function validate_(b, meeting) {
  const m = publicMeeting_(meeting);
  const d = {
    meeting_id: m.id,
    meeting_name: m.name,
    consent: clean_(b.consent, 20),
    prefix: clean_(b.prefix, 40),
    first_name: clean_(b.first_name, 80),
    last_name: clean_(b.last_name, 80),
    position: clean_(b.position, 120),
    unit: clean_(b.unit, 200),
    province: clean_(b.province, 60),
    phone: clean_(b.phone, 20).replace(/[^0-9]/g, ''),
    email: clean_(b.email, 120).toLowerCase(),
    ack_expense: b.ack_expense ? 'รับทราบ' : '',
    attendance: clean_(b.attendance, 20),
    food: '', allergy: '', absence_note: '',
    need_lodging: '', check_in: '', check_out: '', room_type: '', roommate: '', travel: '', lodging_note: '',
    pay_food: m.pay_food, pay_lodging: m.pay_lodging, pay_travel: m.pay_travel,
  };

  if (d.consent !== 'ยินยอม') return { error: 'ต้องให้ความยินยอมก่อนลงทะเบียน' };
  const required = [['prefix', 'คำนำหน้า'], ['first_name', 'ชื่อ'], ['last_name', 'นามสกุล'],
    ['position', 'ตำแหน่ง'], ['unit', 'หน่วยงาน'], ['province', 'จังหวัด'], ['phone', 'เบอร์โทรศัพท์'], ['email', 'อีเมล']];
  for (let i = 0; i < required.length; i++) {
    if (!d[required[i][0]]) return { error: 'กรุณากรอก' + required[i][1] };
  }
  if (PROVINCES.indexOf(d.province) < 0) return { error: 'จังหวัดไม่ถูกต้อง' };
  if (!/^0\d{8,9}$/.test(d.phone)) return { error: 'เบอร์โทรศัพท์ต้องเป็นตัวเลข 9–10 หลัก ขึ้นต้นด้วย 0' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return { error: 'รูปแบบอีเมลไม่ถูกต้อง' };
  const allowed = allowedAttend_(m.attend_mode);
  if (allowed.indexOf(d.attendance) < 0) return { error: 'กรุณาเลือกรูปแบบการเข้าร่วม' };
  if (d.attendance !== ATTEND.NO && !d.ack_expense) return { error: 'กรุณายืนยันว่ารับทราบเงื่อนไขค่าใช้จ่าย' };

  if (d.attendance === ATTEND.ONSITE) {
    d.food = clean_(b.food, 80);
    d.allergy = clean_(b.allergy, 200);
    if (m.pay_food !== 'ไม่มี' && !d.food) return { error: 'กรุณาเลือกประเภทอาหาร' };
  }
  if (d.attendance === ATTEND.NO) {
    d.absence_note = clean_(b.absence_note, 500);
  }

  if (lodgingEligible_(m, d)) {
    d.need_lodging = clean_(b.need_lodging, 20);
    if (['ต้องการ', 'ไม่ต้องการ'].indexOf(d.need_lodging) < 0) return { error: 'กรุณาระบุความต้องการที่พัก' };
    d.travel = clean_(b.travel, 300); // หลายข้อ คั่นด้วย ", "
    if (!d.travel) return { error: 'กรุณาระบุการเดินทาง' };
    d.lodging_note = clean_(b.lodging_note, 500);
    if (d.need_lodging === 'ต้องการ') {
      d.check_in = clean_(b.check_in, 10);
      d.check_out = clean_(b.check_out, 10);
      d.room_type = clean_(b.room_type, 60);
      d.roommate = clean_(b.roommate, 120);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.check_in) || !/^\d{4}-\d{2}-\d{2}$/.test(d.check_out)) {
        return { error: 'กรุณาระบุวันเข้าพักและวันออก' };
      }
      if (d.check_out <= d.check_in) return { error: 'วันออกต้องอยู่หลังวันเข้าพัก' };
      if (ROOM_TYPES.indexOf(d.room_type) < 0) return { error: 'กรุณาเลือกประเภทห้องพัก' };
      if (d.room_type !== 'พักคู่') d.roommate = '';
    }
  }
  return { data: d };
}

function lodgingEligible_(m, d) {
  return m.type === 'workshop' &&
    d.attendance === ATTEND.ONSITE &&
    d.province !== BANGKOK &&
    m.pay_lodging !== 'ไม่มี';
}

/* ---------------------------------------------------------- บันทึกข้อมูล */

function safeCell_(v) {
  const s = String(v == null ? '' : v);
  // กันสูตรที่ฝังมากับข้อความ และเก็บเลขที่ขึ้นต้นด้วย 0 เป็นข้อความ
  if (/^[=+\-@]/.test(s) || /^0\d+$/.test(s)) return "'" + s;
  return s;
}

function upsertResponse_(d, meeting) {
  const sh = ss_().getSheetByName(SHEET.RESPONSES);
  const now = new Date();
  const rows = readTable_(SHEET.RESPONSES);

  const existing = rows.find(function (r) {
    return String(r.meeting_id).trim() === d.meeting_id &&
      String(r.email).trim().toLowerCase() === d.email;
  });

  // ที่นั่งนับเฉพาะ On-site; คนที่ลงทะเบียนไว้แล้วแก้ข้อมูลตัวเองได้โดยไม่ถูกนับซ้ำ
  const cap = Number(meeting.capacity || 0);
  const mode = attendMode_(meeting);
  if (cap > 0 && mode !== 'online' && d.attendance === ATTEND.ONSITE) {
    const taken = rows.filter(function (r) {
      return String(r.meeting_id).trim() === d.meeting_id &&
        r.attendance === ATTEND.ONSITE &&
        r !== existing;
    }).length;
    if (taken >= cap) {
      return { error: 'ขออภัย ที่นั่ง On-site เต็มแล้ว' + (mode === 'hybrid' ? ' กรุณาเลือกเข้าร่วมแบบ Online' : '') };
    }
  }

  const record = Object.assign({}, d, {
    submitted_at: existing ? existing.submitted_at : now,
    updated_at: now,
  });
  const values = RESPONSE_HEADERS.map(function (h) {
    const v = record[h];
    return (v instanceof Date) ? v : safeCell_(v);
  });

  if (existing) {
    sh.getRange(existing._row, 1, 1, values.length).setValues([values]);
  } else {
    sh.appendRow(values);
  }
  return { updated: !!existing };
}

/* ------------------------------------------------------------ อีเมลยืนยัน */

function esc_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function thaiDate_(iso) {
  if (!iso) return '';
  const months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const p = iso.split('-');
  return Number(p[2]) + ' ' + months[Number(p[1]) - 1] + ' ' + (Number(p[0]) + 543);
}

function onlineInfo_(m) {
  const o = {};
  ONLINE_FIELDS.forEach(function (k) { o[k] = String(m[k] == null ? '' : m[k]).trim(); });
  return o;
}

function onlineInfoHtml_(info) {
  if (!info.online_link) {
    return '<p style="margin-top:16px"><b>การเข้าร่วมประชุมออนไลน์</b><br>ผู้จัดจะส่งลิงก์เข้าร่วมประชุมออนไลน์ให้ทางอีเมลนี้ก่อนวันประชุม</p>';
  }
  const line = function (k, v) { return v ? esc_(k) + ': <b>' + esc_(v) + '</b><br>' : ''; };
  let html = '<div style="margin-top:16px;padding:12px 16px;background:#e5f3ee;border-radius:8px">';
  html += '<b>ข้อมูลเข้าร่วมประชุมออนไลน์</b><br>';
  html += line('ระบบ', info.online_platform);
  html += 'ลิงก์: <a href="' + esc_(info.online_link) + '">' + esc_(info.online_link) + '</a><br>';
  html += line('User / Meeting ID', info.online_user);
  html += line('Password / Passcode', info.online_password);
  html += '<span style="color:#555;font-size:12px">กรุณาอย่าส่งต่อข้อมูลนี้ให้ผู้ที่ไม่ได้ลงทะเบียน</span></div>';
  return html;
}

function sendConfirmation_(d, meeting, updated) {
  const m = publicMeeting_(meeting);
  const cfg = publicConfig_();
  const row = function (k, v) {
    return v ? '<tr><td style="padding:4px 12px 4px 0;color:#555">' + esc_(k) + '</td><td style="padding:4px 0">' + esc_(v) + '</td></tr>' : '';
  };

  let html = '<div style="font-family:Tahoma,sans-serif;font-size:14px;line-height:1.6">';
  html += '<p>เรียน ' + esc_(d.prefix + d.first_name + ' ' + d.last_name) + '</p>';
  html += '<p>' + (updated ? 'ระบบได้ปรับปรุงข้อมูลการตอบรับของท่านแล้ว' : 'ขอบคุณที่ตอบรับการประชุม') + '</p>';
  html += '<table style="border-collapse:collapse">';
  html += row('การประชุม', m.name);
  html += row('วันที่', m.date_text);
  html += row('สถานที่', m.venue);
  html += row('การเข้าร่วม', d.attendance);
  html += row('ประเภทอาหาร', d.food);
  html += row('ที่พัก', d.need_lodging);
  if (d.need_lodging === 'ต้องการ') {
    html += row('วันเข้าพัก – วันออก', thaiDate_(d.check_in) + ' – ' + thaiDate_(d.check_out));
    html += row('ประเภทห้อง', d.room_type);
    html += row('ผู้พักร่วม', d.roommate);
  }
  html += row('การเดินทาง', d.travel);
  html += '</table>';
  if (d.attendance === ATTEND.ONLINE) html += onlineInfoHtml_(onlineInfo_(meeting));
  html += '<p style="margin-top:16px"><b>เงื่อนไขค่าใช้จ่าย</b><br>';
  html += 'ค่าอาหารและอาหารว่าง: ' + esc_(m.pay_food) + '<br>';
  html += 'ค่าที่พัก: ' + esc_(m.pay_lodging) + '<br>';
  html += 'ค่าพาหนะเดินทาง: ' + esc_(m.pay_travel);
  if (m.pay_note) html += '<br>' + esc_(m.pay_note);
  html += '</p>';
  if (d.need_lodging === 'ต้องการ') {
    html += '<p>ผู้จัดจะแจ้งรายละเอียดที่พักทางอีเมลก่อนวันประชุม</p>';
  }
  html += '<p>หากต้องการแก้ไขหรือยกเลิก ให้กรอกแบบตอบรับอีกครั้งด้วยอีเมลเดิม ระบบจะใช้ข้อมูลล่าสุด';
  if (cfg.contact_phone) html += ' หรือติดต่อ ' + esc_(cfg.contact_phone);
  html += '</p></div>';

  MailApp.sendEmail({
    to: d.email,
    subject: (updated ? '[แก้ไข] ' : '') + 'ยืนยันการตอบรับ: ' + m.name,
    htmlBody: html,
    name: getConfig_().email_sender_name || cfg.org_name,
  });
}

/* ----------------------------------------------------- ตั้งค่าครั้งแรก */

function setup() {
  const ss = ss_();

  const ensure = function (name, headers) {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
    return sh;
  };

  // config
  const cfg = ensure(SHEET.CONFIG, ['key', 'value', 'คำอธิบาย']);
  if (cfg.getLastRow() === 1) {
    cfg.getRange(2, 1, 7, 3).setValues([
      ['meeting_id_prefix', 'HIA', 'ตัวอักษรนำหน้ารหัสประชุมที่ระบบออกให้ (HIA001, HIA002, …)'],
      ['site_url', 'https://YOUR-SITE.netlify.app/', 'ที่อยู่เว็บบน Netlify ใช้สร้างลิงก์ในแท็บ meetings'],
      ['contact_phone', '02 590 4949', 'เบอร์ติดต่อที่แสดงในแบบตอบรับและอีเมล'],
      ['pdpa_retention_years', 5, 'ระยะเวลาเก็บข้อมูลส่วนบุคคล (ปี)'],
      ['pdpa_policy_url', 'https://hfd.anamai.moph.go.th/th/pdpa', 'ลิงก์นโยบายคุ้มครองข้อมูลส่วนบุคคล'],
      ['org_name', 'กรมอนามัย', 'ชื่อหน่วยงานผู้จัด'],
      ['email_sender_name', 'กรมอนามัย - ระบบตอบรับการประชุม', 'ชื่อผู้ส่งอีเมลยืนยัน'],
    ]);
  }

  // meetings
  // เริ่มว่าง: ประชุมแรกที่เพิ่มจากหน้าผู้ดูแลจะได้รหัส HIA001
  const mt = ensure(SHEET.MEETINGS, MEETING_HEADERS);
  mt.getRange('D2:E').setNumberFormat('yyyy-mm-dd');
  mt.getRange('H2:H').setNumberFormat('yyyy-mm-dd');
  mt.getRange('Q2:T').setNumberFormat('@');
  mt.getRange('O2').setFormula('=ARRAYFORMULA(IF(A2:A="",,VLOOKUP("site_url",config!A:B,2,FALSE)&"m/"&A2:A))');

  const rule = function (list) {
    return SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(false).build();
  };
  mt.getRange('C2:C').setDataValidation(rule(['meeting', 'workshop']));
  mt.getRange('J2:J').setDataValidation(rule(['เปิด', 'ปิด']));
  mt.getRange('K2:M').setDataValidation(rule(PAY_OPTIONS));
  mt.getRange('P2:P').setDataValidation(rule(MODES));
  mt.getRange('P1').setNote('hybrid = On-site และ Online\nonsite = On-site อย่างเดียว\nonline = Online อย่างเดียว');
  mt.getRange('I1').setNote('จำนวนที่นั่ง On-site (ว่าง = ไม่จำกัด)');
  mt.getRange('D2:E').setDataValidation(SpreadsheetApp.newDataValidation().requireDate().build());
  mt.getRange('H2:H').setDataValidation(SpreadsheetApp.newDataValidation().requireDate().build());

  // responses
  const rs = ensure(SHEET.RESPONSES, RESPONSE_HEADERS);
  rs.getRange('K:K').setNumberFormat('@');

  // lists
  const ls = ensure(SHEET.LISTS, ['prefix', 'position', 'food', 'travel']);
  if (ls.getLastRow() === 1) {
    const cols = [
      ['นาย', 'นาง', 'นางสาว', 'ดร.', 'นพ.', 'พญ.', 'ทพ.', 'ทพญ.'],
      ['ผู้อำนวยการ', 'รองผู้อำนวยการ', 'หัวหน้ากลุ่มงาน',
        'นักวิชาการสาธารณสุข', 'พยาบาลวิชาชีพ', 'นักโภชนาการ', 'แพทย์', 'ทันตแพทย์', 'เภสัชกร',
        'นักวิทยาศาสตร์การแพทย์', 'นักกายภาพบำบัด', 'นักจิตวิทยา', 'นักวิชาการศึกษา',
        'นักวิเคราะห์นโยบายและแผน', 'นักวิชาการสถิติ', 'นักวิชาการคอมพิวเตอร์', 'นักจัดการงานทั่วไป',
        'นักทรัพยากรบุคคล', 'นักวิชาการเงินและบัญชี', 'นักวิชาการพัสดุ', 'นักประชาสัมพันธ์', 'นิติกร',
        'เจ้าพนักงานสาธารณสุข', 'เจ้าพนักงานทันตสาธารณสุข', 'เจ้าพนักงานธุรการ'],
      ['อาหารทั่วไป', 'มังสวิรัติ', 'อาหารเจ', 'อาหารอิสลาม (ฮาลาล)'],
      ['รถยนต์ราชการ', 'รถยนต์ส่วนตัว', 'เครื่องบิน', 'รถโดยสารประจำทาง', 'รถไฟ'],
    ];
    const n = Math.max.apply(null, cols.map(function (c) { return c.length; }));
    const grid = [];
    for (let i = 0; i < n; i++) grid.push(cols.map(function (c) { return c[i] || ''; }));
    ls.getRange(2, 1, n, 4).setValues(grid);
    ls.getRange('F1').setValue('ตัวเลือก "อื่น ๆ (ระบุ)" ระบบเพิ่มให้เองทุกรายการ แก้หรือเพิ่มรายการในคอลัมน์ A–D ได้เลย');
  }

  // units
  const us = ensure(SHEET.UNITS, ['unit']);
  if (us.getLastRow() === 1) {
    const units = DOH_UNITS.slice();
    PROVINCES.filter(function (p) { return p !== BANGKOK; })
      .forEach(function (p) { units.push('สำนักงานสาธารณสุขจังหวัด' + p); });
    us.getRange(2, 1, units.length, 1).setValues(units.map(function (u) { return [u]; }));
    us.getRange('C1').setValue('หน่วยงานในสังกัดกรมอนามัย 37 แห่ง (anamai.moph.go.th/th/web-link) + สสจ. 76 จังหวัด แก้ไขได้ หน่วยงานที่ผู้ตอบพิมพ์เองจะถูกรวมเข้ารายการให้อัตโนมัติ');
  }

  // summary
  const sm = ensure(SHEET.SUMMARY, ['meeting_id', 'meeting_name', 'ตอบทั้งหมด', 'On-site', 'Online',
    'ไม่เข้าร่วม', 'ขอที่พัก', 'พักเดี่ยว', 'อาหารพิเศษ']);
  const col = function (h) { return 'responses!' + letter_(RESPONSE_HEADERS.indexOf(h) + 1) + '2:' + letter_(RESPONSE_HEADERS.indexOf(h) + 1); };
  const ID = col('meeting_id');
  const count = function (extra) {
    return '=MAP(A2:A,LAMBDA(id,IF(id="",,COUNTIFS(' + ID + ',id' + (extra ? ',' + extra : '') + '))))';
  };
  sm.getRange('A2').setFormula('=IFERROR(FILTER(meetings!A2:B,meetings!A2:A<>""),"")');
  sm.getRange('C2').setFormula(count(''));
  sm.getRange('D2').setFormula(count(col('attendance') + ',"On-site"'));
  sm.getRange('E2').setFormula(count(col('attendance') + ',"Online"'));
  sm.getRange('F2').setFormula(count(col('attendance') + ',"ไม่เข้าร่วม"'));
  sm.getRange('G2').setFormula(count(col('need_lodging') + ',"ต้องการ"'));
  sm.getRange('H2').setFormula(count(col('room_type') + ',"พักเดี่ยว*"'));
  sm.getRange('I2').setFormula(count(col('food') + ',"<>",' + col('food') + ',"<>อาหารทั่วไป"'));

  const first = ss.getSheetByName('Sheet1') || ss.getSheetByName('ชีต1');
  if (first && first.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(first);

  ss.setActiveSheet(mt);

  // เพิ่มค่าที่ยังไม่มีใน config (รัน setup ซ้ำกับชีตเดิมได้ ไม่ทับค่าที่มีอยู่)
  const owner = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  const have = readTable_(SHEET.CONFIG).map(function (r) { return String(r.key).trim(); });
  [
    ['google_client_id', '', 'OAuth Client ID (Web) จาก Google Cloud Console สำหรับปุ่ม Sign in with Google ในหน้าผู้ดูแล'],
    ['admin_emails', owner, 'อีเมล Google ของผู้ดูแล คั่นด้วยจุลภาค (แก้ได้จากหน้าผู้ดูแล แท็บตั้งค่าทั่วไป)'],
  ].forEach(function (row) {
    if (have.indexOf(row[0]) < 0) cfg.appendRow(row);
  });

  const msg = 'ตั้งค่าเสร็จแล้ว ผู้ดูแลเริ่มต้น: ' + (owner || '(ไม่ทราบอีเมลเจ้าของ)') +
    ' · ใส่ google_client_id ในแท็บ config ก่อนเข้าหน้าผู้ดูแล';
  console.log(msg);
  return msg;
}

/* ------------------------------------------------------- API ผู้ดูแล */

// ค่าที่แก้ได้จากหน้าผู้ดูแล (google_client_id แก้ได้เฉพาะในชีต เพื่อไม่ให้ตั้งผิดจนเข้าระบบไม่ได้)
const CONFIG_KEYS = ['site_url', 'contact_phone', 'pdpa_retention_years', 'pdpa_policy_url', 'org_name', 'email_sender_name', 'meeting_id_prefix', 'admin_emails'];

function idPrefix_() {
  const p = String(getConfig_().meeting_id_prefix || 'HIA').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return p || 'HIA';
}

/** รหัสถัดไป: <prefix><เลข 3 หลัก> ต่อจากเลขสูงสุดของ prefix เดียวกัน เช่น HIA001, HIA002 */
function nextMeetingId_(rows) {
  const prefix = idPrefix_();
  const re = new RegExp('^' + prefix + '(\\d+)$');
  let max = 0;
  (rows || readTable_(SHEET.MEETINGS)).forEach(function (r) {
    const m = String(r.meeting_id).trim().toUpperCase().match(re);
    if (m) max = Math.max(max, Number(m[1]));
  });
  return prefix + String(max + 1).padStart(3, '0');
}

function admin_(b) {
  const auth = verifyAdmin_(b.id_token);
  if (!auth.ok) return { ok: false, auth: false, error: auth.error };
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    switch (b.op) {
      case 'login': return { ok: true, email: auth.email };
      case 'overview': return adminOverview_();
      case 'saveMeeting': return adminSaveMeeting_(b.meeting || {}, String(b.originalId || '').trim());
      case 'deleteMeeting': return adminDeleteMeeting_(String(b.id || '').trim());
      case 'responses': return adminResponses_(String(b.id || '').trim());
      case 'sendOnlineInfo': return adminSendOnlineInfo_(String(b.id || '').trim());
      case 'saveLists': return adminSaveLists_(b.lists || {});
      case 'saveUnits': return adminSaveUnits_(b.units || []);
      case 'saveConfig': return adminSaveConfig_(b.values || {}, auth.email);
    }
    return { ok: false, error: 'ไม่รู้จักคำสั่ง' };
  } catch (err) {
    return { ok: false, error: 'ระบบขัดข้อง: ' + err.message };
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

/* ------------------------------------------------ เข้าสู่ระบบด้วย Google */

function parseEmails_(v) {
  return String(v || '').toLowerCase().split(/[\s,;]+/).map(function (s) { return s.trim(); }).filter(Boolean);
}

/** รายชื่อผู้ดูแล: config.admin_emails; ถ้าว่าง ให้เจ้าของสคริปต์เป็นผู้ดูแลคนเดียว (กันล็อกตัวเองออก) */
function adminEmails_() {
  const list = parseEmails_(getConfig_().admin_emails);
  if (list.length) return list;
  const owner = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  return owner ? [owner] : [];
}

/**
 * ตรวจ Google ID token จากปุ่ม Sign in with Google
 * ยืนยันกับ Google (tokeninfo): ผู้ออก, Client ID ของเรา, อีเมลยืนยันแล้ว, ยังไม่หมดอายุ แล้วจึงเทียบรายชื่อผู้ดูแล
 */
function verifyAdmin_(token) {
  token = String(token || '');
  if (!token) return { ok: false, error: 'กรุณาเข้าสู่ระบบด้วย Google' };
  const clientId = String(getConfig_().google_client_id || '').trim();
  if (!clientId) return { ok: false, error: 'ยังไม่ได้ตั้งค่า google_client_id ในแท็บ config ของ Google Sheet' };

  const cache = CacheService.getScriptCache();
  const ck = 'idt_' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token)).slice(0, 40);
  let info = null;
  const hit = cache.get(ck);
  if (hit) {
    info = JSON.parse(hit);
  } else {
    const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token),
      { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return { ok: false, error: 'การเข้าสู่ระบบหมดอายุหรือไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่' };
    const t = JSON.parse(res.getContentText());
    info = { iss: t.iss, aud: t.aud, email: t.email, email_verified: t.email_verified, exp: Number(t.exp) };
  }
  const now = Math.floor(Date.now() / 1000);
  if (['accounts.google.com', 'https://accounts.google.com'].indexOf(info.iss) < 0 || info.aud !== clientId) {
    return { ok: false, error: 'การเข้าสู่ระบบไม่ถูกต้อง' };
  }
  if (!(info.email_verified === true || info.email_verified === 'true')) return { ok: false, error: 'อีเมล Google ยังไม่ได้ยืนยัน' };
  if (!(info.exp > now)) return { ok: false, error: 'การเข้าสู่ระบบหมดอายุ กรุณาเข้าสู่ระบบใหม่' };
  if (!hit) cache.put(ck, JSON.stringify(info), Math.max(1, Math.min(300, info.exp - now)));

  const email = String(info.email || '').toLowerCase();
  if (adminEmails_().indexOf(email) < 0) return { ok: false, error: 'บัญชี ' + email + ' ไม่มีสิทธิ์ผู้ดูแล' };
  return { ok: true, email: email };
}

function lastRowIn_(sh, col) {
  const n = sh.getLastRow();
  if (n < 2) return 1;
  const vals = sh.getRange(1, col, n, 1).getValues();
  for (let i = vals.length - 1; i >= 0; i--) {
    if (String(vals[i][0]).trim() !== '') return i + 1;
  }
  return 1;
}

function toDate_(iso) {
  return iso ? new Date(iso + 'T00:00:00') : '';
}

function thaiRange_(s, e) {
  if (!s) return '';
  if (!e || e === s) return thaiDate_(s);
  const a = s.split('-'), b = e.split('-');
  if (a[0] === b[0] && a[1] === b[1]) return Number(a[2]) + '–' + thaiDate_(e);
  return thaiDate_(s) + ' – ' + thaiDate_(e);
}

function countsByMeeting_() {
  const out = {};
  readTable_(SHEET.RESPONSES).forEach(function (r) {
    const id = String(r.meeting_id).trim();
    const c = out[id] || (out[id] = { total: 0, onsite: 0, online: 0, absent: 0, lodging: 0 });
    c.total++;
    if (r.attendance === ATTEND.ONSITE) c.onsite++;
    if (r.attendance === ATTEND.ONLINE) c.online++;
    if (r.attendance === ATTEND.NO) c.absent++;
    if (r.need_lodging === 'ต้องการ') c.lodging++;
  });
  return out;
}

function adminOverview_() {
  const counts = countsByMeeting_();
  const responses = readTable_(SHEET.RESPONSES);
  const meetings = readTable_(SHEET.MEETINGS)
    .filter(function (m) { return String(m.meeting_id).trim(); })
    .map(function (m) {
      const p = Object.assign(publicMeeting_(m), seatInfo_(m, responses));
      p.status = String(m.status || 'เปิด');
      p.capacity = m.capacity === '' ? '' : Number(m.capacity);
      Object.assign(p, onlineInfo_(m));
      p.counts = counts[p.id] || { total: 0, onsite: 0, online: 0, absent: 0, lodging: 0 };
      return p;
    })
    .sort(function (a, b) { return a.date_start < b.date_start ? 1 : -1; });
  const cfg = getConfig_();
  const config = {};
  CONFIG_KEYS.forEach(function (k) { config[k] = cfg[k] == null ? '' : String(cfg[k]); });
  return {
    ok: true,
    meetings: meetings,
    nextId: nextMeetingId_(),
    lists: getLists_(),
    units: readTable_(SHEET.UNITS).map(function (r) { return String(r.unit || '').trim(); }).filter(String),
    config: config,
    payOptions: PAY_OPTIONS,
  };
}

function adminSaveMeeting_(m, originalId) {
  const isoRe = /^\d{4}-\d{2}-\d{2}$/;
  const d = {
    id: '', // ประชุมใหม่: ระบบออกรหัสให้ด้านล่าง · แก้ไข: ใช้รหัสเดิม (เปลี่ยนไม่ได้)
    name: clean_(m.name, 300),
    type: clean_(m.type, 20),
    attend_mode: clean_(m.attend_mode, 10),
    date_start: clean_(m.date_start, 10),
    date_end: clean_(m.date_end, 10),
    date_text: clean_(m.date_text, 100),
    venue: clean_(m.venue, 300),
    close_date: clean_(m.close_date, 10),
    capacity: m.capacity === '' || m.capacity == null ? '' : Number(m.capacity),
    status: clean_(m.status, 10) || 'เปิด',
    pay_food: clean_(m.pay_food, 30),
    pay_lodging: clean_(m.pay_lodging, 30),
    pay_travel: clean_(m.pay_travel, 30),
    pay_note: clean_(m.pay_note, 500),
    online_platform: clean_(m.online_platform, 60),
    online_link: String(m.online_link || '').trim().slice(0, 500),
    online_user: clean_(m.online_user, 120),
    online_password: clean_(m.online_password, 120),
  };
  if (d.online_link && !/^https:\/\/\S+$/.test(d.online_link)) return { ok: false, error: 'ลิงก์ประชุมออนไลน์ต้องขึ้นต้นด้วย https://' };
  if (!d.name) return { ok: false, error: 'กรุณากรอกชื่อการประชุม' };
  if (['meeting', 'workshop'].indexOf(d.type) < 0) return { ok: false, error: 'ประเภทการประชุมไม่ถูกต้อง' };
  if (!d.attend_mode) d.attend_mode = d.type === 'workshop' ? 'onsite' : 'hybrid';
  if (MODES.indexOf(d.attend_mode) < 0) return { ok: false, error: 'รูปแบบการเข้าร่วมไม่ถูกต้อง' };
  if (!isoRe.test(d.date_start)) return { ok: false, error: 'กรุณาระบุวันเริ่มประชุม' };
  if (!d.date_end) d.date_end = d.date_start;
  if (!isoRe.test(d.date_end) || d.date_end < d.date_start) return { ok: false, error: 'วันสิ้นสุดต้องไม่ก่อนวันเริ่ม' };
  if (d.close_date && !isoRe.test(d.close_date)) return { ok: false, error: 'วันปิดรับไม่ถูกต้อง' };
  if (d.capacity !== '' && (!isFinite(d.capacity) || d.capacity < 0)) return { ok: false, error: 'จำนวนรับต้องเป็นตัวเลข' };
  if (['เปิด', 'ปิด'].indexOf(d.status) < 0) return { ok: false, error: 'สถานะไม่ถูกต้อง' };
  if ([d.pay_food, d.pay_lodging, d.pay_travel].some(function (v) { return PAY_OPTIONS.indexOf(v) < 0; })) {
    return { ok: false, error: 'กรุณาเลือกเงื่อนไขค่าใช้จ่ายให้ครบ' };
  }
  if (!d.date_text) d.date_text = thaiRange_(d.date_start, d.date_end);

  const sh = ss_().getSheetByName(SHEET.MEETINGS);
  const rows = readTable_(SHEET.MEETINGS);
  let existing = null;
  if (originalId) {
    existing = rows.find(function (r) { return String(r.meeting_id).trim() === originalId; });
    if (!existing) return { ok: false, error: 'ไม่พบการประชุมเดิม' };
    d.id = originalId;
  } else {
    d.id = nextMeetingId_(rows); // อยู่ภายใต้ LockService ใน admin_ จึงไม่ได้เลขซ้ำ
  }

  const values = [[
    d.id, safeCell_(d.name), d.type, toDate_(d.date_start), toDate_(d.date_end), safeCell_(d.date_text),
    safeCell_(d.venue), toDate_(d.close_date), d.capacity, d.status,
    d.pay_food, d.pay_lodging, d.pay_travel, safeCell_(d.pay_note),
  ]];
  const row = existing ? existing._row : lastRowIn_(sh, 1) + 1;
  sh.getRange(row, 1, 1, 14).setValues(values);
  sh.getRange(row, MEETING_HEADERS.indexOf('attend_mode') + 1).setValue(d.attend_mode);
  const onlineCol = MEETING_HEADERS.indexOf('online_platform') + 1;
  sh.getRange(row, onlineCol, 1, ONLINE_FIELDS.length).setNumberFormat('@')
    .setValues([ONLINE_FIELDS.map(function (k) { return d.attend_mode === 'onsite' ? '' : d[k]; })]);
  sh.getRange(row, 4, 1, 2).setNumberFormat('yyyy-mm-dd');
  sh.getRange(row, 8).setNumberFormat('yyyy-mm-dd');
  return { ok: true, id: d.id };
}

function adminDeleteMeeting_(id) {
  if (countsByMeeting_()[id]) return { ok: false, error: 'ลบไม่ได้ เพราะมีผู้ตอบรับแล้ว ให้เปลี่ยนสถานะเป็น "ปิด" แทน' };
  const m = getMeeting_(id);
  if (!m) return { ok: false, error: 'ไม่พบการประชุม' };
  ss_().getSheetByName(SHEET.MEETINGS).deleteRow(m._row);
  return { ok: true };
}

function adminResponses_(id) {
  const fmt = function (v) {
    if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd HH:mm');
    return v == null ? '' : String(v);
  };
  const rows = readTable_(SHEET.RESPONSES)
    .filter(function (r) { return String(r.meeting_id).trim() === id; })
    .map(function (r) { return RESPONSE_HEADERS.map(function (h) { return fmt(r[h]); }); });
  return { ok: true, headers: RESPONSE_HEADERS, rows: rows };
}

/** ส่งข้อมูลเข้าประชุมออนไลน์ให้ผู้ลงทะเบียนแบบ Online ทุกคนของประชุมนี้ */
function adminSendOnlineInfo_(id) {
  const meeting = getMeeting_(id);
  if (!meeting) return { ok: false, error: 'ไม่พบการประชุม' };
  const info = onlineInfo_(meeting);
  if (!info.online_link) return { ok: false, error: 'ยังไม่ได้กรอกลิงก์ประชุมออนไลน์' };
  const m = publicMeeting_(meeting);
  const people = readTable_(SHEET.RESPONSES).filter(function (r) {
    return String(r.meeting_id).trim() === id && r.attendance === ATTEND.ONLINE && r.email;
  });
  if (!people.length) return { ok: false, error: 'ยังไม่มีผู้ลงทะเบียนแบบ Online' };
  if (MailApp.getRemainingDailyQuota() < people.length) {
    return { ok: false, error: 'โควตาอีเมลวันนี้เหลือไม่พอ (ต้องส่ง ' + people.length + ' ฉบับ)' };
  }
  const cfg = getConfig_();
  let sent = 0;
  const failed = [];
  people.forEach(function (r) {
    let html = '<div style="font-family:Tahoma,sans-serif;font-size:14px;line-height:1.6">';
    html += '<p>เรียน ' + esc_(r.prefix + r.first_name + ' ' + r.last_name) + '</p>';
    html += '<p>ข้อมูลสำหรับเข้าร่วม' + esc_(m.name) + (m.date_text ? ' วันที่ ' + esc_(m.date_text) : '') + '</p>';
    html += onlineInfoHtml_(info);
    if (cfg.contact_phone) html += '<p>สอบถามเพิ่มเติม โทร ' + esc_(cfg.contact_phone) + '</p>';
    html += '</div>';
    try {
      MailApp.sendEmail({
        to: String(r.email).trim(),
        subject: 'ลิงก์เข้าร่วมประชุมออนไลน์: ' + m.name,
        htmlBody: html,
        name: cfg.email_sender_name || cfg.org_name || 'กรมอนามัย',
      });
      sent++;
    } catch (e) {
      failed.push(String(r.email));
    }
  });
  return { ok: true, sent: sent, failed: failed };
}

function adminSaveLists_(lists) {
  const keys = ['prefix', 'position', 'food', 'travel'];
  const cols = keys.map(function (k) {
    return (Array.isArray(lists[k]) ? lists[k] : [])
      .map(function (v) { return clean_(v, 120); }).filter(String).slice(0, 200);
  });
  if (cols.some(function (c) { return !c.length; })) return { ok: false, error: 'แต่ละรายการต้องมีตัวเลือกอย่างน้อย 1 ข้อ' };
  const sh = ss_().getSheetByName(SHEET.LISTS);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 4).clearContent();
  const n = Math.max.apply(null, cols.map(function (c) { return c.length; }));
  const grid = [];
  for (let i = 0; i < n; i++) grid.push(cols.map(function (c) { return safeCell_(c[i] || ''); }));
  sh.getRange(2, 1, n, 4).setValues(grid);
  return { ok: true };
}

function adminSaveUnits_(units) {
  const seen = {};
  const list = (Array.isArray(units) ? units : [])
    .map(function (u) { return clean_(u, 200); })
    .filter(function (u) { if (!u || seen[u]) return false; seen[u] = true; return true; })
    .slice(0, 2000);
  const sh = ss_().getSheetByName(SHEET.UNITS);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 1).clearContent();
  if (list.length) sh.getRange(2, 1, list.length, 1).setValues(list.map(function (u) { return [safeCell_(u)]; }));
  invalidateUnits_();
  return { ok: true, count: list.length };
}

function adminSaveConfig_(values, currentEmail) {
  if ('admin_emails' in values) {
    const list = parseEmails_(values.admin_emails);
    const bad = list.filter(function (e) { return !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); });
    if (bad.length) return { ok: false, error: 'อีเมลผู้ดูแลไม่ถูกต้อง: ' + bad.join(', ') };
    if (!list.length) return { ok: false, error: 'ต้องมีอีเมลผู้ดูแลอย่างน้อย 1 รายการ' };
    if (list.indexOf(currentEmail) < 0) return { ok: false, error: 'ลบอีเมลของตัวเอง (' + currentEmail + ') ออกไม่ได้ ให้ผู้ดูแลคนอื่นลบให้' };
    values.admin_emails = list.filter(function (e, i) { return list.indexOf(e) === i; }).join(', ');
  }
  const years = Number(values.pdpa_retention_years);
  if (!(years >= 1 && years <= 20)) return { ok: false, error: 'ระยะเวลาเก็บข้อมูลต้องอยู่ระหว่าง 1–20 ปี' };
  if (values.site_url && !/^https?:\/\//.test(values.site_url)) return { ok: false, error: 'ที่อยู่เว็บต้องขึ้นต้นด้วย https://' };
  if ('meeting_id_prefix' in values) {
    values.meeting_id_prefix = String(values.meeting_id_prefix || '').trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9]{0,9}$/.test(values.meeting_id_prefix)) {
      return { ok: false, error: 'ตัวอักษรนำหน้ารหัสประชุมใช้ A–Z และตัวเลข 1–10 ตัว ขึ้นต้นด้วยตัวอักษร' };
    }
  }
  const sh = ss_().getSheetByName(SHEET.CONFIG);
  const rows = readTable_(SHEET.CONFIG);
  CONFIG_KEYS.forEach(function (k) {
    if (!(k in values)) return;
    const v = k === 'pdpa_retention_years' ? years : safeCell_(clean_(values[k], k === 'admin_emails' ? 2000 : 300));
    const r = rows.find(function (x) { return String(x.key).trim() === k; });
    if (r) sh.getRange(r._row, 2).setValue(v);
    else sh.appendRow([k, v, '']);
  });
  return { ok: true };
}

function letter_(n) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * ลบคำตอบของการประชุมที่จบไปแล้วเกินระยะเวลาเก็บข้อมูล (config: pdpa_retention_years)
 * ตั้งให้รันอัตโนมัติเดือนละครั้งได้ที่ ทริกเกอร์ > เพิ่มทริกเกอร์ > ตามเวลา
 */
function purgeExpiredResponses() {
  const years = Number(getConfig_().pdpa_retention_years || 5);
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - years);
  const cutoffIso = Utilities.formatDate(cutoff, tz_(), 'yyyy-MM-dd');

  const ended = {};
  readTable_(SHEET.MEETINGS).forEach(function (m) {
    const end = isoDate_(m.date_end) || isoDate_(m.date_start);
    ended[String(m.meeting_id).trim()] = end;
  });

  const sh = ss_().getSheetByName(SHEET.RESPONSES);
  const rows = readTable_(SHEET.RESPONSES);
  let removed = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    const end = ended[String(rows[i].meeting_id).trim()];
    if (end && end < cutoffIso) {
      sh.deleteRow(rows[i]._row);
      removed++;
    }
  }
  console.log('ลบคำตอบที่หมดอายุ ' + removed + ' แถว');
  return removed;
}

/** เรียกครั้งเดียวเพื่ออนุญาตสิทธิ์ส่งอีเมลก่อน deploy */
function authorizeMail() {
  MailApp.getRemainingDailyQuota();
}
