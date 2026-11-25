// ข้อมูลจำลองสำหรับทดสอบหน้าเว็บโดยไม่ต่อ Google Sheet
// ลอง ?mock=1&m=ANP-01-2570 (ประชุมทั่วไป) หรือ ?mock=1&m=WS-02-2570 (ประชุมเชิงปฏิบัติการ)
window.MOCK_API = (function () {
  const meetings = {
    'ANP-01-2570': {
      id: 'ANP-01-2570',
      name: 'ประชุมคณะทำงานขับเคลื่อนอนามัยโพล กรมอนามัย ครั้งที่ 1/2570',
      type: 'meeting',
      date_start: '2026-11-11', date_end: '2026-11-11',
      date_text: '11 พฤศจิกายน 2569',
      venue: 'ห้องประชุม กรมอนามัย และออนไลน์',
      online_platform: 'Zoom', online_link: 'https://zoom.us/j/1234567890', online_user: '123 456 7890', online_password: 'demo123',
      close_date: '2026-11-10',
      pay_food: 'ผู้จัดรับผิดชอบ', pay_lodging: 'ไม่มี', pay_travel: 'ไม่มี', pay_note: '',
      open: true, closed_reason: '',
    },
    'WS-02-2570': {
      id: 'WS-02-2570',
      name: 'ประชุมเชิงปฏิบัติการ (ตัวอย่าง)',
      type: 'workshop',
      date_start: '2027-01-20', date_end: '2027-01-22',
      date_text: '20–22 มกราคม 2570',
      venue: 'โรงแรมตัวอย่าง กรุงเทพมหานคร',
      close_date: '2027-01-10',
      pay_food: 'ผู้จัดรับผิดชอบ', pay_lodging: 'ผู้จัดรับผิดชอบ', pay_travel: 'เบิกจากต้นสังกัด',
      pay_note: 'ผู้จัดรับผิดชอบค่าที่พักห้องพักคู่ ผู้ที่เลือกพักเดี่ยวชำระส่วนต่างเอง',
      open: true, closed_reason: '',
    },
    'FULL-01-2570': {
      id: 'FULL-01-2570', name: 'ประชุมที่ On-site เต็มแล้ว (มี Online)', type: 'meeting', attend_mode: 'hybrid', capacity: 1,
      date_start: '2027-02-05', date_end: '2027-02-05', date_text: '5 กุมภาพันธ์ 2570', venue: 'ห้องประชุม กรมอนามัย',
      close_date: '2027-02-01', pay_food: 'ผู้จัดรับผิดชอบ', pay_lodging: 'ไม่มี', pay_travel: 'ไม่มี', pay_note: '',
      open: true, closed_reason: '',
    },
    'FULLWS-01-2570': {
      id: 'FULLWS-01-2570', name: 'ประชุมเชิงปฏิบัติการที่เต็มแล้ว', type: 'workshop', attend_mode: 'onsite', capacity: 1,
      date_start: '2027-02-10', date_end: '2027-02-11', date_text: '10–11 กุมภาพันธ์ 2570', venue: 'โรงแรมตัวอย่าง',
      close_date: '2027-02-01', pay_food: 'ผู้จัดรับผิดชอบ', pay_lodging: 'ผู้จัดรับผิดชอบ', pay_travel: 'เบิกจากต้นสังกัด', pay_note: '',
      open: true, closed_reason: '',
    },
    'ONL-01-2570': {
      id: 'ONL-01-2570', name: 'ประชุมออนไลน์ (ตัวอย่าง)', type: 'meeting', attend_mode: 'online',
      date_start: '2027-02-15', date_end: '2027-02-15', date_text: '15 กุมภาพันธ์ 2570', venue: '',
      close_date: '', pay_food: 'ไม่มี', pay_lodging: 'ไม่มี', pay_travel: 'ไม่มี', pay_note: '',
      open: true, closed_reason: '',
    },
    'OLD-01-2569': {
      id: 'OLD-01-2569', name: 'ประชุมที่ปิดรับแล้ว (ตัวอย่าง)', type: 'meeting',
      date_start: '2026-01-10', date_end: '2026-01-10', date_text: '10 มกราคม 2569', venue: '-',
      close_date: '2026-01-05', pay_food: 'ไม่มี', pay_lodging: 'ไม่มี', pay_travel: 'ไม่มี', pay_note: '',
      open: false, closed_reason: 'เลยกำหนดวันปิดรับการตอบรับแล้ว',
    },
  };
  const units = ['กองแผนงาน', 'ศูนย์อนามัยที่ 1', 'ศูนย์อนามัยที่ 7', 'สำนักงานสาธารณสุขจังหวัดขอนแก่น',
    'สำนักงานสาธารณสุขจังหวัดเชียงใหม่', 'สำนักส่งเสริมสุขภาพ', 'สำนักโภชนาการ'];
  const lists = {
    prefix: ['นาย', 'นาง', 'นางสาว', 'ดร.', 'นพ.', 'พญ.'],
    position: ['นักวิชาการสาธารณสุข', 'พยาบาลวิชาชีพ', 'นักโภชนาการ', 'ผู้อำนวยการ'],
    food: ['อาหารทั่วไป', 'มังสวิรัติ', 'อาหารเจ', 'อาหารอิสลาม (ฮาลาล)'],
    travel: ['รถยนต์ราชการ', 'รถยนต์ส่วนตัว', 'เครื่องบิน', 'รถโดยสารประจำทาง', 'รถไฟ', 'ไม่พักค้าง', 'ไม่เบิกค่าเดินทาง'],
  };
  const config = {
    contact_phone: '02 590 4949', pdpa_retention_years: 5,
    pdpa_policy_url: 'https://hfd.anamai.moph.go.th/th/pdpa', org_name: 'กรมอนามัย',
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---- ฝั่งผู้ดูแล (รหัส: admin) ----
  const HEADERS = ['submitted_at', 'updated_at', 'meeting_id', 'meeting_name', 'prefix', 'first_name', 'last_name',
    'position', 'unit', 'province', 'phone', 'email', 'attendance', 'food', 'allergy', 'absence_note',
    'need_lodging', 'check_in', 'check_out', 'room_type', 'roommate', 'travel', 'lodging_note',
    'ack_expense', 'pay_food', 'pay_lodging', 'pay_travel', 'consent'];
  const responses = [
    { meeting_id: 'WS-02-2570', prefix: 'นาง', first_name: 'สมศรี', last_name: 'ใจดี', position: 'นักวิชาการสาธารณสุข', unit: 'ศูนย์อนามัยที่ 7', province: 'ขอนแก่น', phone: '0812345678', email: 'somsri@example.com', attendance: 'On-site', food: 'อาหารทั่วไป', need_lodging: 'ต้องการ', check_in: '2027-01-19', check_out: '2027-01-22', room_type: 'พักคู่', travel: 'รถยนต์ราชการ', updated_at: '2026-11-20 10:12' },
    { meeting_id: 'WS-02-2570', prefix: 'นาย', first_name: 'ประเสริฐ', last_name: 'มั่นคง', position: 'นักโภชนาการ', unit: 'สำนักโภชนาการ', province: 'นนทบุรี', phone: '0898765432', email: 'prasert@example.com', attendance: 'On-site', food: 'อาหารอิสลาม (ฮาลาล)', allergy: 'ถั่ว', need_lodging: 'ไม่ต้องการ', travel: 'รถยนต์ส่วนตัว', updated_at: '2026-11-21 14:30' },
    { meeting_id: 'WS-02-2570', prefix: 'นางสาว', first_name: 'วันดี', last_name: 'สุขใจ', position: 'พยาบาลวิชาชีพ', unit: 'สำนักงานสาธารณสุขจังหวัดเชียงใหม่', province: 'เชียงใหม่', phone: '0861112222', email: 'wandee@example.com', attendance: 'ไม่เข้าร่วม', absence_note: 'ติดราชการ', updated_at: '2026-11-22 09:05' },
    { meeting_id: 'FULL-01-2570', prefix: 'นาย', first_name: 'เต็ม', last_name: 'แล้ว', position: 'นักวิชาการสาธารณสุข', unit: 'กองแผนงาน', province: 'นนทบุรี', phone: '0800000001', email: 'full1@example.com', attendance: 'On-site', food: 'อาหารทั่วไป', updated_at: '2026-11-23 09:00' },
    { meeting_id: 'FULLWS-01-2570', prefix: 'นาง', first_name: 'เต็ม', last_name: 'สอง', position: 'นักโภชนาการ', unit: 'ศูนย์อนามัยที่ 1', province: 'เชียงใหม่', phone: '0800000002', email: 'full2@example.com', attendance: 'On-site', food: 'อาหารทั่วไป', need_lodging: 'ต้องการ', updated_at: '2026-11-23 09:10' },
    { meeting_id: 'ANP-01-2570', prefix: 'ดร.', first_name: 'อนันต์', last_name: 'รักษ์ดี', position: 'ผู้อำนวยการ', unit: 'กองแผนงาน', province: 'นนทบุรี', phone: '0823334444', email: 'anan@example.com', attendance: 'Online', updated_at: '2026-11-05 08:40' },
  ];
  const unitSheet = units.slice();
  const adminConfig = {
    site_url: location.origin + '/', contact_phone: config.contact_phone, pdpa_retention_years: '5',
    pdpa_policy_url: config.pdpa_policy_url, org_name: config.org_name, email_sender_name: 'กรมอนามัย - ระบบตอบรับการประชุม',
    meeting_id_prefix: 'HIA',
    admin_emails: 'admin@example.com',
  };
  Object.values(meetings).forEach((m) => {
    m.status = m.open ? 'เปิด' : 'ปิด';
    m.capacity = m.capacity || '';
    m.attend_mode = m.attend_mode || (m.type === 'workshop' ? 'onsite' : 'hybrid');
  });

  function seatInfo(m) {
    const cap = Number(m.capacity || 0);
    if (!cap || m.attend_mode === 'online') return { capacity: '', seats_left: null, full: false };
    const taken = responses.filter((r) => r.meeting_id === m.id && r.attendance === 'On-site').length;
    const left = Math.max(cap - taken, 0);
    return { capacity: cap, seats_left: left, full: left <= 0 };
  }

  function nextId() {
    const prefix = String(adminConfig.meeting_id_prefix || 'HIA').toUpperCase();
    const re = new RegExp('^' + prefix + '(\\d+)$');
    let max = 0;
    Object.keys(meetings).forEach((id) => { const x = id.match(re); if (x) max = Math.max(max, Number(x[1])); });
    return prefix + String(max + 1).padStart(3, '0');
  }

  function countsFor(id) {
    const rs = responses.filter((r) => r.meeting_id === id);
    return {
      total: rs.length,
      onsite: rs.filter((r) => r.attendance === 'On-site').length,
      online: rs.filter((r) => r.attendance === 'Online').length,
      absent: rs.filter((r) => r.attendance === 'ไม่เข้าร่วม').length,
      lodging: rs.filter((r) => r.need_lodging === 'ต้องการ').length,
    };
  }

  async function admin(b) {
    await wait(250);
    // จำลอง Google Sign-In: token 'mock-token' = admin@example.com
    if (b.id_token !== 'mock-token') return { ok: false, auth: false, error: 'กรุณาเข้าสู่ระบบด้วย Google' };
    const email = 'admin@example.com';
    switch (b.op) {
      case 'login': return { ok: true, email };
      case 'overview':
        return {
          ok: true,
          meetings: Object.values(meetings)
            .map((m) => Object.assign({}, m, seatInfo(m), { counts: countsFor(m.id) }))
            .sort((a, c) => (a.date_start < c.date_start ? 1 : -1)),
          nextId: nextId(),
          lists, units: unitSheet, config: adminConfig,
          payOptions: ['ผู้จัดรับผิดชอบ', 'เบิกจากต้นสังกัด', 'ไม่มี'],
        };
      case 'saveMeeting': {
        const m = b.meeting;
        if (!m.name) return { ok: false, error: 'กรุณากรอกชื่อการประชุม' };
        if (!m.date_start) return { ok: false, error: 'กรุณาระบุวันเริ่มประชุม' };
        m.id = b.originalId || nextId();
        m.date_end = m.date_end || m.date_start;
        m.capacity = m.capacity ? Number(m.capacity) : '';
        m.open = m.status === 'เปิด';
        m.closed_reason = m.open ? '' : 'การประชุมนี้ปิดรับการตอบรับแล้ว';
        meetings[m.id] = m;
        return { ok: true, id: m.id };
      }
      case 'deleteMeeting':
        if (countsFor(b.id).total) return { ok: false, error: 'ลบไม่ได้ เพราะมีผู้ตอบรับแล้ว' };
        delete meetings[b.id];
        return { ok: true };
      case 'responses':
        return {
          ok: true, headers: HEADERS,
          rows: responses.filter((r) => r.meeting_id === b.id).map((r) => HEADERS.map((h) => r[h] || '')),
        };
      case 'sendOnlineInfo': {
        const m = meetings[b.id];
        if (!m || !m.online_link) return { ok: false, error: 'ยังไม่ได้กรอกลิงก์ประชุมออนไลน์' };
        const n = responses.filter((r) => r.meeting_id === b.id && r.attendance === 'Online').length;
        if (!n) return { ok: false, error: 'ยังไม่มีผู้ลงทะเบียนแบบ Online' };
        return { ok: true, sent: n, failed: [] };
      }
      case 'saveLists': Object.assign(lists, b.lists); return { ok: true };
      case 'saveUnits': unitSheet.splice(0, unitSheet.length, ...b.units); return { ok: true, count: unitSheet.length };
      case 'saveConfig': {
        const list = String(b.values.admin_emails || '').toLowerCase().split(/[\s,;]+/).filter(Boolean);
        if (!list.length) return { ok: false, error: 'ต้องมีอีเมลผู้ดูแลอย่างน้อย 1 รายการ' };
        if (!list.includes(email)) return { ok: false, error: 'ลบอีเมลของตัวเอง (' + email + ') ออกไม่ได้ ให้ผู้ดูแลคนอื่นลบให้' };
        Object.assign(adminConfig, b.values, { admin_emails: list.join(', ') });
        return { ok: true };
      }
    }
    return { ok: false, error: 'ไม่รู้จักคำสั่ง' };
  }

  return {
    admin,
    async init(id) {
      await wait(300);
      const m = meetings[id];
      let pub = null;
      if (m) {
        // เหมือนของจริง: ไม่ส่งลิงก์และรหัสออนไลน์ออกไปที่ฟอร์ม
        const { online_platform, online_link, online_user, online_password, ...rest } = m;
        pub = Object.assign(rest, seatInfo(m), { online_ready: !!online_link });
      }
      return { ok: true, meeting: pub, units, lists, config };
    },
    async submit(data) {
      await wait(600);
      console.log('[mock] ส่งข้อมูล', data);
      return { ok: true, updated: false, emailSent: true };
    },
  };
})();
