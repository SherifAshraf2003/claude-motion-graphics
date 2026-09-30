/* Manasetak — 15s promo timeline.
 * Everything on screen is a pure function of time: render(t) can be called for
 * any t in [0, DURATION] in any order, which makes frame-exact rendering trivial.
 *
 * Beat grid: 120 BPM (0.5s per beat). Scene cuts land on beats so the
 * soundtrack in audio/soundtrack.py lines up with the picture.
 *   0.0 – 2.5   S1 hook: "منصة تعليمية كاملة بضغطة زر واحدة" + click
 *   2.5 – 5.0   S2 platform builds itself (custom subdomain + dashboard)
 *   5.0 – 11.0  S3 six-feature montage, one feature per second
 *  11.0 – 13.0  S4 every school grade, prep 1 → secondary 3
 *  13.0 – 15.0  S5 end card + CTA
 */
const DURATION = 15;
window.DURATION = DURATION;

// ---------- math ----------
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const P = (t, a, b) => clamp((t - a) / (b - a));
const lerp = (a, b, p) => a + (b - a) * p;
const E = {
  lin: p => p,
  in3: p => p * p * p,
  out3: p => 1 - Math.pow(1 - p, 3),
  out5: p => 1 - Math.pow(1 - p, 5),
  inOut3: p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
  inOut5: p => (p < 0.5 ? 16 * p ** 5 : 1 - Math.pow(-2 * p + 2, 5) / 2),
  outExpo: p => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p)),
  inExpo: p => (p <= 0 ? 0 : Math.pow(2, 10 * p - 10)),
  outBack: (p, s = 1.70158) => 1 + (s + 1) * Math.pow(p - 1, 3) + s * Math.pow(p - 1, 2),
  outElastic: p => (p <= 0 ? 0 : p >= 1 ? 1 : Math.pow(2, -9 * p) * Math.sin((p * 10 - 0.75) * (2 * Math.PI / 3)) + 1),
};
function rng(seed) { // mulberry32
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- dom helpers ----------
const $ = id => document.getElementById(id);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
function T(el, o) {
  let s = '';
  if (o.px != null) s += `perspective(${o.px}px) `;
  if (o.x != null || o.y != null || o.z != null) s += `translate3d(${o.x || 0}px,${o.y || 0}px,${o.z || 0}px) `;
  if (o.pre) s = o.pre + ' ' + s;
  if (o.rx != null) s += `rotateX(${o.rx}deg) `;
  if (o.ry != null) s += `rotateY(${o.ry}deg) `;
  if (o.r != null) s += `rotate(${o.r}deg) `;
  if (o.s != null) s += `scale(${o.s}) `;
  if (o.sx != null || o.sy != null) s += `scale(${o.sx ?? 1},${o.sy ?? 1}) `;
  el.style.transform = s;
  if (o.o != null) el.style.opacity = clamp(o.o);
  if (o.blur != null) el.style.filter = o.blur > 0.05 ? `blur(${o.blur}px)` : 'none';
}
function show(el, on) { el.style.display = on ? '' : 'none'; return on; }
// masked word-by-word reveal (Arabic words stay intact so letters keep joining)
function words(el, t, tin, tout = 1e9, { st = 0.07, d = 0.7, sto = 0.035, dout = 0.35, rot = 3 } = {}) {
  const ws = el._w || (el._w = $$('.wi', el));
  ws.forEach((w, i) => {
    const pi = E.outExpo(P(t, tin + i * st, tin + i * st + d));
    const po = E.in3(P(t, tout + i * sto, tout + i * sto + dout));
    w.style.transform = `translate3d(0,${((1 - pi) - po) * 115}%,0) rotate(${(1 - pi) * rot}deg)`;
  });
}
function glowDrift(el, t, cx, cy, ax, ay, sp, ph = 0) {
  const w = el.offsetWidth || parseFloat(el.style.width), h = el.offsetHeight || parseFloat(el.style.height);
  T(el, { x: cx - w / 2 + Math.sin(t * sp + ph) * ax, y: cy - h / 2 + Math.cos(t * sp * 0.8 + ph) * ay, s: 1 + 0.08 * Math.sin(t * sp * 1.3 + ph) });
}

// ---------- canvas fx ----------
function makeParticles(n, seed) {
  const r = rng(seed);
  return Array.from({ length: n }, () => ({
    x: r() * 1920, y: r() * 1080, z: 0.3 + r() * 0.7, ph: r() * 6.28, sp: 20 + r() * 50, dr: (r() - 0.5) * 30,
  }));
}
function drawParticles(ctx, parts, t, rgb, alpha = 0.7) {
  for (const p of parts) {
    const y = ((p.y - t * p.sp * p.z) % 1180 + 1180) % 1180 - 50;
    const x = p.x + Math.sin(t * 0.7 + p.ph) * p.dr;
    const tw = 0.55 + 0.45 * Math.sin(t * 3 + p.ph * 3);
    const rad = 1 + p.z * 2.6;
    ctx.globalAlpha = alpha * tw * p.z;
    ctx.fillStyle = `rgb(${rgb})`;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, 6.2832); ctx.fill();
    if (p.z > 0.85) { // soft bokeh halo
      ctx.globalAlpha = alpha * 0.12 * tw;
      ctx.beginPath(); ctx.arc(x, y, rad * 6, 0, 6.2832); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}
function drawFloor(ctx, t, { hy = 690, rgb = '130,150,255', alpha = 0.22, speed = 1.4 } = {}) {
  const cx = 960, S = 390, sp = 0.55;
  ctx.lineWidth = 1.5;
  // receding horizontal lines
  const off = (t * speed) % sp;
  for (let k = 0; k < 44; k++) {
    const z = 0.32 + k * sp - off;
    if (z <= 0.3) continue;
    const y = hy + S / z;
    if (y > 1090) continue;
    const a = alpha * clamp((y - hy) / 260);
    ctx.strokeStyle = `rgba(${rgb},${a})`;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1920, y); ctx.stroke();
  }
  // converging verticals
  const g = ctx.createLinearGradient(0, hy, 0, 1080);
  g.addColorStop(0, `rgba(${rgb},0)`); g.addColorStop(1, `rgba(${rgb},${alpha})`);
  ctx.strokeStyle = g;
  for (let i = -26; i <= 26; i++) {
    const X = i * 0.42;
    ctx.beginPath(); ctx.moveTo(cx + X * S / 30, hy + S / 30); ctx.lineTo(cx + X * S / 0.3, hy + S / 0.3); ctx.stroke();
  }
  // horizon haze
  const hz = ctx.createLinearGradient(0, hy - 60, 0, hy + 90);
  hz.addColorStop(0, `rgba(${rgb},0)`); hz.addColorStop(0.5, `rgba(${rgb},${alpha * 0.6})`); hz.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = hz; ctx.fillRect(0, hy - 60, 1920, 150);
}
const hexRgb = h => { const n = parseInt(h.slice(1), 16); return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`; };

// ---------- feature montage content ----------
const B = window.BRAND;
const sw = (id, on) => `<span class="sw" id="${id}"><b></b><i></i></span>`;
const FEATS = [
  {
    title: 'ارفع محاضراتك', sub: 'فيديوهات وملفات ومذكرات في مكان واحد', icon: 'i-upload', color: B.primary,
    card: `
      <div class="ui" id="f0a" style="left:70px;top:58px;width:620px;height:356px;overflow:hidden">
        <div style="height:250px;position:relative;background:linear-gradient(135deg,var(--primary),var(--primary-deep));overflow:hidden">
          <div style="position:absolute;left:40px;top:26px;direction:ltr;font:900 64px Cairo;color:rgba(255,255,255,.14)">F = m·a</div>
          <div style="position:absolute;right:34px;bottom:30px;direction:ltr;font:800 40px Cairo;color:rgba(255,255,255,.12)">v = u + at</div>
          <div id="f0play" style="position:absolute;left:50%;top:50%;width:104px;height:104px;margin:-52px;border-radius:50%;background:#fff;display:grid;place-items:center;color:var(--primary);font-size:52px;box-shadow:0 0 0 14px rgba(255,255,255,.18)"><svg class="ic" style="stroke:none;margin-left:6px"><use href="#i-play"/></svg></div>
          <div style="position:absolute;left:0;right:0;bottom:0;height:8px;background:rgba(255,255,255,.2)"><div id="f0scrub" style="height:100%;width:0;background:var(--accent);margin-right:0"></div></div>
        </div>
        <div style="padding:14px 28px"><h4>المحاضرة الأولى: قوانين نيوتن</h4><div style="font-size:19px;font-weight:600;color:#7a82a8">فيديو · 45 دقيقة · الباب الأول</div></div>
      </div>
      <div class="ui" id="f0b" style="left:70px;top:440px;width:620px;height:118px;padding:18px 26px;display:flex;gap:18px;align-items:center">
        <div id="f0ib" style="width:74px;height:74px;border-radius:20px;background:#eef1ff;color:var(--primary);display:grid;place-items:center;font-size:38px;position:relative">
          <svg class="ic" id="f0iu"><use href="#i-upload"/></svg><svg class="ic" id="f0ic" style="position:absolute;stroke-width:3"><use href="#i-check"/></svg></div>
        <div style="flex:1">
          <div style="display:flex;justify-content:space-between;align-items:center;height:40px;position:relative">
            <span style="position:relative;font-size:24px;font-weight:800"><span id="f0l1">جارٍ الرفع…</span><span id="f0l2" style="position:absolute;right:0;white-space:nowrap;color:#0e9e78">تم الرفع بنجاح</span></span>
            <span id="f0pct" style="font-size:24px;font-weight:900;color:var(--primary);direction:ltr">0%</span>
          </div>
          <div style="height:12px;border-radius:12px;background:#eceffa;margin-top:8px;overflow:hidden"><div id="f0bar" style="height:100%;width:0;border-radius:12px;background:linear-gradient(90deg,var(--primary-light),var(--primary))"></div></div>
        </div>
      </div>
      ${['MP4', 'PDF', 'مذكرة'].map((n, i) => `<div class="fchip" id="f0c${i}"><svg class="ic"><use href="#i-file"/></svg>${n}</div>`).join('')}
    `,
  },
  {
    title: 'امتحانات وواجبات', sub: 'حدّد شروط اجتياز كل درس', icon: 'i-quiz', color: B.accent,
    card: `
      <div class="ui" id="f1a" style="left:60px;top:48px;width:640px;height:524px;padding:30px 34px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h4>اختبار الدرس الأول</h4><span class="chip" style="background:#fff4dc;color:#b87400">شرط الاجتياز <bdi dir="ltr">50%</bdi></span></div>
        <div style="font-size:34px;font-weight:900;margin:18px 0 14px">ما وحدة قياس القوة؟</div>
        ${['الجول', 'النيوتن', 'الوات', 'الباسكال'].map((o, i) => `
          <div class="opt" id="f1o${i}"><span class="rad"></span><span>${o}</span>${i === 1 ? '<span class="okc" id="f1ok"><svg class="ic"><use href="#i-check"/></svg></span><i class="optok" id="f1hl"></i>' : ''}</div>`).join('')}
      </div>
      <div class="ui" id="f1s" style="left:-44px;top:380px;width:210px;height:210px;border-radius:50%;display:grid;place-items:center">
        <svg viewBox="0 0 100 100" style="position:absolute;inset:14px;width:182px;height:182px;transform:rotate(-90deg)">
          <circle cx="50" cy="50" r="44" fill="none" stroke="#eef0f8" stroke-width="9"/>
          <circle id="f1ring" cx="50" cy="50" r="44" fill="none" stroke="var(--accent)" stroke-width="9" stroke-linecap="round" stroke-dasharray="276.5" stroke-dashoffset="276.5"/>
        </svg>
        <div style="text-align:center;line-height:1.1"><div style="font:900 50px Cairo;direction:ltr"><span id="f1n">0</span><span style="font-size:26px;color:#9aa1c2">/20</span></div><div style="font:800 20px Cairo;color:#0e9e78;margin-top:4px">ناجح</div></div>
      </div>
    `,
  },
  {
    title: 'حماية المحتوى', sub: 'حماية متقدمة لحقوقك الفكرية', icon: 'i-shield', color: B.mint,
    card: `
      <div class="ui" id="f2a" style="left:70px;top:58px;width:620px;height:400px;overflow:hidden;background:#0c1640">
        <div style="position:absolute;inset:0;filter:blur(7px);opacity:.9">
          <div style="position:absolute;inset:0;background:linear-gradient(135deg,#2a3f9e,#101b52)"></div>
          <div style="position:absolute;left:50px;top:60px;width:300px;height:26px;border-radius:10px;background:rgba(255,255,255,.35)"></div>
          <div style="position:absolute;left:50px;top:110px;width:420px;height:18px;border-radius:10px;background:rgba(255,255,255,.2)"></div>
          <div style="position:absolute;left:50px;top:146px;width:360px;height:18px;border-radius:10px;background:rgba(255,255,255,.2)"></div>
          <div style="position:absolute;right:60px;bottom:60px;width:170px;height:170px;border-radius:50%;background:rgba(255,178,36,.5)"></div>
        </div>
        <div id="f2wm" style="position:absolute;left:-200px;top:-200px;width:1100px;height:900px;transform:rotate(-24deg);display:flex;flex-wrap:wrap;gap:34px 60px;align-content:flex-start;direction:ltr;font:700 22px Cairo;color:rgba(255,255,255,.16)">
          ${Array.from({ length: 40 }, () => '<span>© abdullah.manasetak.com</span>').join('')}</div>
        <div id="f2scan" style="position:absolute;left:0;right:0;height:3px;background:var(--mint);box-shadow:0 0 30px 8px var(--mint)"></div>
        <svg id="f2sh" viewBox="0 0 24 24" style="position:absolute;left:50%;top:50%;width:250px;height:250px;margin:-125px;overflow:visible">
          <path id="f2shp" d="M12 2.8l7.5 3v6.2c0 4.6-3.1 7.9-7.5 9.4-4.4-1.5-7.5-4.8-7.5-9.4V5.8z" fill="var(--mint)" fill-opacity="0" stroke="#fff" stroke-width="1.1" stroke-linejoin="round"/>
        </svg>
        <svg id="f2lock" viewBox="0 0 24 24" style="position:absolute;left:50%;top:50%;width:104px;height:104px;margin:-46px 0 0 -52px;overflow:visible;fill:none;stroke:#fff;stroke-width:2.4;stroke-linecap:round">
          <path id="f2shk" d="M8 11V7.5a4 4 0 0 1 8 0V11"/><rect x="5" y="11" width="14" height="10" rx="2.5" fill="#fff"/><circle cx="12" cy="16" r="1.6" fill="var(--mint)" stroke="none"/>
        </svg>
        <i id="f2pulse" class="ring" style="left:50%;top:50%;border-color:var(--mint)"></i>
      </div>
      <div class="ui" id="f2b" style="left:150px;top:488px;width:460px;height:84px;display:flex;align-items:center;justify-content:center;gap:14px;font:800 28px Cairo">
        <span style="width:46px;height:46px;border-radius:50%;background:var(--mint);display:grid;place-items:center;color:#fff;font-size:26px"><svg class="ic" style="stroke-width:3"><use href="#i-check"/></svg></span>محتواك محمي بالكامل</div>
    `,
  },
  {
    title: 'إحصائيات دقيقة', sub: 'تابع أداء كل طالب خطوة بخطوة', icon: 'i-chart', color: B.primaryLight,
    card: `
      <div class="ui" id="f3a" style="left:60px;top:48px;width:640px;height:430px;padding:26px 32px">
        <div style="display:flex;justify-content:space-between;align-items:center"><h4>أداء الطلاب</h4><span class="chip" style="background:#e3faf3;color:#0e9e78"><bdi dir="ltr">+24%</bdi> هذا الشهر</span></div>
        <div style="font-size:20px;font-weight:700;color:#7a82a8;margin-top:6px">متوسط الدرجات</div>
        <div style="font:900 60px Cairo;line-height:1.1;direction:ltr;text-align:right"><span id="f3k">0</span>%</div>
        <svg id="f3svg" viewBox="0 0 576 210" style="position:absolute;left:32px;bottom:26px;width:576px;height:210px;overflow:visible">
          ${[0, 1, 2, 3].map(i => `<line x1="0" x2="576" y1="${10 + i * 60}" y2="${10 + i * 60}" stroke="#eef0f8" stroke-width="2"/>`).join('')}
          ${[0, 1, 2, 3, 4, 5, 6, 7].map(i => `<rect class="f3bar" x="${i * 76 + 6}" y="190" width="44" height="0" rx="10" fill="${i === 7 ? 'var(--primary)' : '#dfe4ff'}"/>`).join('')}
          <path id="f3line" fill="none" stroke="var(--accent)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
          ${[0, 1, 2, 3, 4, 5, 6, 7].map(i => `<circle class="f3dot" r="8" fill="#fff" stroke="var(--accent)" stroke-width="4"/>`).join('')}
        </svg>
      </div>
      <div class="ui" id="f3b" style="left:410px;top:430px;width:300px;height:150px;display:flex;align-items:center;gap:18px;padding:0 26px">
        <svg viewBox="0 0 100 100" style="width:96px;height:96px;transform:rotate(-90deg);flex:none">
          <circle cx="50" cy="50" r="40" fill="none" stroke="#eef0f8" stroke-width="14"/>
          <circle id="f3don" cx="50" cy="50" r="40" fill="none" stroke="var(--mint)" stroke-width="14" stroke-linecap="round" stroke-dasharray="251.3" stroke-dashoffset="251.3"/></svg>
        <div><div style="font:700 19px Cairo;color:#7a82a8">نسبة الحضور</div><div style="font:900 44px Cairo;line-height:1.1;direction:ltr;text-align:right"><span id="f3d">0</span>%</div></div>
      </div>
    `,
  },
  {
    title: 'جدولة تلقائية', sub: 'دروسك منظمة بالترتيب الزمني', icon: 'i-cal', color: B.coral,
    card: `
      <div class="ui" id="f4a" style="left:50px;top:48px;width:660px;height:524px;padding:26px 36px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h4>جدول الدروس <span style="color:#9aa1c2;font-weight:700;font-size:21px">· أكتوبر</span></h4>
          <span style="display:flex;align-items:center;gap:12px;font:800 20px Cairo;color:#58608a">جدولة تلقائية ${sw('f4sw')}</span></div>
        <div class="cal" id="f4cal">
          ${['سبت', 'أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة'].map(d => `<div class="dn">${d}</div>`).join('')}
          ${Array.from({ length: 28 }, (_, i) => `<div class="cell"><em>${i + 1}</em></div>`).join('')}
        </div>
      </div>
    `,
  },
  {
    title: 'إدارة المشرفين', sub: 'صلاحيات كاملة وتحكم في فريق العمل', icon: 'i-users', color: B.accent,
    card: `
      <div class="ui" id="f5a" style="left:50px;top:48px;width:660px;height:524px;padding:28px 34px">
        <div style="display:flex;justify-content:space-between;align-items:center"><h4>فريق العمل</h4>
          <span id="f5add" class="chip" style="background:var(--primary);color:#fff;font-size:20px;padding:6px 18px 8px"><svg class="ic" style="stroke-width:3"><use href="#i-plus"/></svg>إضافة مشرف</span></div>
        <div style="display:flex;justify-content:flex-end;gap:26px;margin:14px 0 2px;padding-left:8px;font:800 17px Cairo;color:#9aa1c2"><span style="width:84px;text-align:center">الطلاب</span><span style="width:84px;text-align:center">الامتحانات</span></div>
        ${[['م', 'أ. محمد سامي', 'مشرف الامتحانات', B.primary], ['س', 'أ. سارة علي', 'مشرفة الطلاب', B.coral], ['ن', 'أ. نور حسن', 'مساعد', B.mint]].map((r, i) => `
          <div class="mrow" id="f5r${i}"><span class="av" style="background:${r[3]}">${r[0]}</span>
            <div style="flex:1"><div style="font:800 25px Cairo">${r[1]}</div><div style="font:600 18px Cairo;color:#7a82a8">${r[2]}</div></div>
            <span style="width:84px;display:grid;place-items:center">${sw('f5s' + i + 'a')}</span><span style="width:84px;display:grid;place-items:center">${sw('f5s' + i + 'b')}</span></div>`).join('')}
      </div>
    `,
  },
];
// feature start times (first one lands as the S3 sheet settles)
const FS = [4.78, 6, 7, 8, 9, 10, 11.2];

const extraCSS = `
.fchip{position:absolute;left:0;top:0;display:flex;align-items:center;gap:10px;background:#fff;color:#10183d;font:800 24px Cairo;padding:10px 20px 12px;border-radius:16px;box-shadow:0 20px 40px -12px rgba(0,0,0,.5)}
.fchip .ic{color:var(--primary);font-size:28px}
.opt{position:relative;display:flex;align-items:center;gap:16px;height:72px;border-radius:18px;border:2px solid #e6e9f5;margin-top:14px;padding:0 22px 4px;font:800 27px Cairo;overflow:hidden}
.opt .rad{width:28px;height:28px;border-radius:50%;border:3px solid #cdd3ea;flex:none;position:relative;z-index:1}
.optok{position:absolute;inset:0;background:#e3faf3;border:3px solid var(--mint);border-radius:16px;opacity:0}
.opt > *:not(.optok){position:relative;z-index:1}
.okc{position:absolute!important;left:20px;width:42px;height:42px;border-radius:50%;background:var(--mint);color:#fff;display:grid;place-items:center;font-size:24px}
.okc .ic{stroke-width:3.2}
.sw{position:relative;display:inline-block;width:62px;height:34px;border-radius:99px;background:#dfe3f2;overflow:hidden;flex:none}
.sw b{position:absolute;inset:0;background:var(--mint);opacity:0}
.sw i{position:absolute;top:4px;right:4px;width:26px;height:26px;border-radius:50%;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.25)}
.cal{display:grid;grid-template-columns:repeat(7,1fr);gap:8px;margin-top:18px;position:relative}
.cal .dn{font:800 16px Cairo;color:#9aa1c2;text-align:center;padding-bottom:2px}
.cal .cell{height:84px;border-radius:14px;background:#f5f6fc;position:relative}
.cal .cell em{position:absolute;top:4px;right:10px;font:700 15px Cairo;font-style:normal;color:#aab0cc}
.lch{position:absolute;left:6px;right:6px;bottom:8px;height:40px;border-radius:11px;color:#fff;font:800 17px Cairo;display:grid;place-items:center;box-shadow:0 8px 16px -6px rgba(0,0,0,.35)}
.mrow{display:flex;align-items:center;gap:18px;height:118px;border-top:1.5px solid #eef0f8}
.av{width:68px;height:68px;border-radius:50%;display:grid;place-items:center;color:#fff;font:900 30px Cairo;flex:none}
`;

// ---------- scene 4 path ----------
const NODES = [
  { x: 1640, y: 735, n: '1', l: 'الصف الأول', g: 0 },
  { x: 1370, y: 690, n: '2', l: 'الصف الثاني', g: 0 },
  { x: 1100, y: 740, n: '3', l: 'الصف الثالث', g: 0 },
  { x: 830, y: 690, n: '1', l: 'الصف الأول', g: 1 },
  { x: 560, y: 740, n: '2', l: 'الصف الثاني', g: 1 },
  { x: 290, y: 695, n: '3', l: 'الصف الثالث', g: 1 },
];
function catmull(pts) {
  let d = `M${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C${c1.x} ${c1.y},${c2.x} ${c2.y},${p2.x} ${p2.y}`;
  }
  return d;
}
const S4_DRAW = [11.2, 12.35];

// ---------- init ----------
const el = {};
let P1, P3, P4, pathLen = 0, nodeFrac = [], f2len = 0, f3len = 0, lineLen = 0;
function init() {
  const st = document.createElement('style'); st.textContent = extraCSS; document.head.appendChild(st);

  // features
  const feats = $('feats'), glows = $('s3glows'), prog = $('s3prog');
  FEATS.forEach((f, k) => {
    const d = document.createElement('div');
    d.className = 'feat'; d.id = 'f' + k; d.style.setProperty('--fc', f.color);
    d.innerHTML = `
      <div class="fcard" id="fc${k}">${f.card}</div>
      <div class="ftext" id="ft${k}">
        <div class="fnum">0${k + 1}</div>
        <div class="ficon" id="fi${k}"><svg class="ic"><use href="#${f.icon}"/></svg></div>
        <h3 class="ftitle" id="fh${k}">${f.title.split(' ').map(w => `<span class="w"><span class="wi">${w}</span></span>`).join(' ')}</h3>
        <p class="fsub" id="fp${k}">${f.sub.split(' ').map(w => `<span class="w"><span class="wi">${w}</span></span>`).join(' ')}</p>
      </div>`;
    feats.appendChild(d);
    const g = document.createElement('div');
    g.className = 'glow'; g.id = 'fg' + k;
    g.style.cssText = `--c:${f.color};width:1200px;height:1200px;opacity:0`;
    glows.appendChild(g);
    prog.insertAdjacentHTML('beforeend', `<div class="seg"><i id="pg${k}"></i></div>`);
  });
  // calendar lesson chips
  const cells = $$('#f4cal .cell');
  const L = [[1, 0], [3, 1], [5, 2], [8, 0], [10, 1], [12, 3], [15, 0], [17, 1], [19, 2], [22, 0], [24, 1], [26, 3]];
  const cols = [B.primary, B.coral, B.mint, B.accent];
  L.forEach(([c, ci], i) => cells[c].insertAdjacentHTML('beforeend', `<div class="lch" id="lc${i}" style="background:${cols[ci]}">درس ${i + 1}</div>`));

  // scene 4 path + nodes
  const pts = [{ x: 1960, y: 760 }, ...NODES, { x: -40, y: 720 }];
  const d = catmull(pts);
  $('s4path').setAttribute('d', d); $('s4ghost').setAttribute('d', d);
  const path = $('s4path'); pathLen = path.getTotalLength();
  path.style.strokeDasharray = pathLen;
  // fraction of path length where each node sits
  const N = 1200;
  NODES.forEach(nd => {
    let best = 0, bd = 1e9;
    for (let i = 0; i <= N; i++) {
      const p = path.getPointAtLength(pathLen * i / N);
      const dd = (p.x - nd.x) ** 2 + (p.y - nd.y) ** 2;
      if (dd < bd) { bd = dd; best = i / N; }
    }
    nodeFrac.push(best);
  });
  const nodes = $('s4nodes');
  NODES.forEach((nd, i) => nodes.insertAdjacentHTML('beforeend',
    `<div class="node" id="nd${i}" style="left:${nd.x}px;top:${nd.y}px;--nc:${nd.g ? B.primaryLight : B.accent}"><div class="nc">${nd.n}</div><div class="nl">${nd.l}</div></div>`));
  [[0, 2, 'المرحلة الإعدادية', B.accent], [3, 5, 'المرحلة الثانوية', B.primaryLight]].forEach(([a, b, txt, c], i) => {
    const x0 = NODES[b].x - 100, x1 = NODES[a].x + 100;
    nodes.insertAdjacentHTML('beforeend', `<div class="grp" id="gp${i}" style="left:${x0}px;width:${x1 - x0}px;color:${c}"><span>${txt}</span><div class="gl"></div></div>`);
  });
  $('s4').appendChild($('s4trav')); // traveler lives outside the collapsing group

  // scene 5 orbit badges
  const orbit = $('s5orbit');
  FEATS.forEach((f, i) => orbit.insertAdjacentHTML('beforeend', `<div class="orb" id="ob${i}" style="--oc:${f.color}"><svg class="ic"><use href="#${f.icon}"/></svg></div>`));

  // misc measurements
  const u = $('s1under'); el.ulen = u.getTotalLength(); u.style.strokeDasharray = el.ulen;
  f2len = $('f2shp').getTotalLength(); $('f2shp').style.strokeDasharray = f2len;

  // analytics line through bar tops
  const vals = [0.34, 0.48, 0.42, 0.6, 0.55, 0.72, 0.66, 0.9];
  el.f3vals = vals;
  const lp = vals.map((v, i) => ({ x: i * 76 + 28, y: 190 - v * 175 - 14 }));
  $('f3line').setAttribute('d', catmull(lp));
  lineLen = $('f3line').getTotalLength(); $('f3line').style.strokeDasharray = lineLen;
  el.f3pts = lp;

  // film grain texture
  const g = document.createElement('canvas'); g.width = g.height = 256;
  const gx = g.getContext('2d'), img = gx.createImageData(256, 256), r = rng(7);
  for (let i = 0; i < img.data.length; i += 4) { const v = r() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
  gx.putImageData(img, 0, 0);
  $('grain').style.backgroundImage = `url(${g.toDataURL()})`;

  P1 = makeParticles(90, 11); P3 = makeParticles(60, 23); P4 = makeParticles(90, 37);
  el.c1 = $('c1').getContext('2d'); el.c3 = $('c3').getContext('2d'); el.c4 = $('c4').getContext('2d');
}

// ---------- cursor ----------
function cursorAt(x, y, s, o) { T($('cursor'), { x: x - 6, y: y - 5, s, o }); }
function bez(p0, p1, p2, t) { const a = 1 - t; return { x: a * a * p0.x + 2 * a * t * p1.x + t * t * p2.x, y: a * a * p0.y + 2 * a * t * p1.y + t * t * p2.y }; }
function renderCursor(t) {
  const c = $('cursor');
  if (t >= 1.25 && t < 2.35) {
    const p = E.inOut3(P(t, 1.3, 1.92));
    const q = bez({ x: 1560, y: 1180 }, { x: 1380, y: 860 }, { x: 990, y: 790 }, p);
    const click = Math.sin(Math.PI * P(t, 1.95, 2.12));
    show(c, true); cursorAt(q.x, q.y, 1 - 0.2 * click, P(t, 1.3, 1.42) * (1 - P(t, 2.12, 2.3)));
  } else if (t >= 13.95 && t < 15) {
    const p = E.inOut3(P(t, 14.0, 14.55));
    const q = bez({ x: 1500, y: 1180 }, { x: 1300, y: 860 }, { x: 990, y: 790 }, p);
    const click = Math.sin(Math.PI * P(t, 14.6, 14.76));
    show(c, true); cursorAt(q.x, q.y, 1 - 0.2 * click, P(t, 14.0, 14.12));
  } else show(c, false);
}

// ---------- scene 1 ----------
function scene1(t) {
  if (!show($('s1'), t < 2.5)) return;
  glowDrift($('s1gA'), t, 700, 420, 160, 60, 0.9);
  glowDrift($('s1gB'), t, 1350, 760, 120, 70, 0.7, 2);
  const ctx = el.c1; ctx.clearRect(0, 0, 1920, 1080);
  drawFloor(ctx, t, { rgb: hexRgb(B.primaryLight), alpha: 0.2 * P(t, 0, 0.6) });
  drawParticles(ctx, P1, t, '255,255,255', 0.6 * P(t, 0, 0.5));
  // light streaks sweeping right → left (reading direction)
  [[0.0, 230, 1.0], [0.18, 610, 0.8], [0.32, 940, 1.1]].forEach(([d, y, sp], i) => {
    const p = E.inOut3(P(t, d, d + 0.9 * sp));
    T($('st' + i), { x: lerp(2000, -900, p), y, o: Math.sin(Math.PI * p) * 0.7 });
  });
  const pp = P(t, 0.08, 0.5);
  T($('s1pill'), { pre: 'translateX(-50%)', y: (1 - E.outBack(pp)) * 30, s: 0.85 + 0.15 * E.outBack(pp), o: P(t, 0.08, 0.3) });
  words($('s1l1'), t, 0.2, 1e9, { st: 0.09, d: 0.75 });
  words($('s1l2'), t, 0.62, 1e9, { st: 0.1, d: 0.75 });
  $('s1under').style.strokeDashoffset = el.ulen * (1 - E.inOut3(P(t, 1.02, 1.42)));
  // button pop + squish on click
  const pb = P(t, 1.12, 1.6), click = Math.sin(Math.PI * P(t, 1.95, 2.12));
  T($('s1btn'), { pre: 'translate(-50%,-50%)', s: E.outBack(pb, 2.4) * (1 - 0.09 * click), o: P(t, 1.12, 1.22) });
  $$('#s1rings .ring').forEach((r, i) => {
    const p = P(t, 1.98 + i * 0.08, 2.5 + i * 0.08);
    T(r, { s: 1 + E.out3(p) * 5, o: p > 0 ? (1 - p) * 0.9 : 0 });
  });
  const ex = E.in3(P(t, 2.02, 2.5));
  T($('s1wrap'), { s: 1 + ex * 0.35, o: 1 - ex, blur: ex * 10 });
}

// ---------- scene 2 ----------
function scene2(t) {
  const s2 = $('s2');
  if (!show(s2, t >= 2.02 && t < 5.02)) return;
  const pr = P(t, 2.02, 2.48);
  s2.style.clipPath = pr < 1 ? `circle(${E.inOut3(pr) * 2250}px at 960px 770px)` : 'none';
  glowDrift($('s2gA'), t, 500, 350, 140, 60, 0.8);
  glowDrift($('s2gB'), t, 1500, 850, 120, 60, 0.9, 1);

  T($('s2eyebrow'), { y: (1 - E.outBack(P(t, 2.42, 2.8))) * 30, o: P(t, 2.42, 2.6) });
  words($('s2h'), t, 2.48, 1e9, { st: 0.08, d: 0.7 });
  words($('s2p'), t, 2.85, 1e9, { st: 0.1, d: 0.6 });

  const pbw = E.outExpo(P(t, 2.15, 3.25));
  const u = t - 2.5;
  T($('browser'), { y: (1 - pbw) * 420 + Math.sin(t * 1.6) * 5, rx: lerp(40, 7, pbw) - u * 0.6, ry: lerp(26, 11, pbw) - u * 1.2, s: lerp(0.85, 1, pbw), o: P(t, 2.15, 2.4) });

  // subdomain typing
  const url = 'abdullah.manasetak.com', n = Math.floor(P(t, 2.95, 3.72) * url.length);
  const typed = url.slice(0, n);
  const cut = Math.min(n, 8);
  $('urltext').innerHTML = `<b>${typed.slice(0, cut)}</b>${typed.slice(cut)}`;
  $('caret').style.opacity = (t < 3.8 || Math.floor(t * 4) % 2 === 0) && t < 4.1 ? 1 : 0;
  const ok = P(t, 3.78, 4.08);
  T($('urlok'), { s: E.outBack(ok, 2.5), o: ok > 0 ? 1 : 0 });

  $$('#browser .side > *').forEach((m, i) => {
    const p = E.out5(P(t, 2.85 + i * 0.055, 3.3 + i * 0.055));
    T(m, { x: -(1 - p) * 40, o: p });
  });
  const ph = E.out5(P(t, 3.0, 3.4)); T($('browser').querySelector('.hello'), { y: (1 - ph) * 24, o: ph });
  $$('#browser .stat').forEach((s, i) => {
    const p = P(t, 3.12 + i * 0.09, 3.6 + i * 0.09);
    T(s, { y: (1 - E.outBack(p)) * 40, s: 0.92 + 0.08 * E.out3(p), o: P(t, 3.12 + i * 0.09, 3.3 + i * 0.09) });
  });
  const vals = [1248, 24, 94];
  vals.forEach((v, i) => { $('cn' + i).textContent = Math.round(v * E.outExpo(P(t, 3.25 + i * 0.09, 4.25))).toLocaleString('en-US'); });
  const psh = E.out5(P(t, 3.35, 3.7)); T($('browser').querySelector('.sech'), { x: -(1 - psh) * 30, o: psh });
  $$('#browser .course').forEach((c, i) => {
    const p = P(t, 3.42 + i * 0.1, 3.95 + i * 0.1);
    T(c, { y: (1 - E.outBack(p)) * 60, o: P(t, 3.42 + i * 0.1, 3.6 + i * 0.1) });
  });
  const t1 = P(t, 3.85, 4.25), t2 = P(t, 4.05, 4.45);
  T($('toast1'), { y: (1 - E.outBack(t1, 2)) * 40 + Math.sin(t * 2) * 6, s: 0.7 + 0.3 * E.outBack(t1, 2), o: P(t, 3.85, 3.95) });
  T($('toast2'), { y: (1 - E.outBack(t2, 2)) * 40 + Math.cos(t * 2) * 6, s: 0.7 + 0.3 * E.outBack(t2, 2), o: P(t, 4.05, 4.15) });

  // push back as the feature sheet slides over
  const ex = E.inOut3(P(t, 4.5, 5.0));
  T($('s2all'), { s: 1 - ex * 0.1, y: -ex * 40 });
  $('s2dim').style.opacity = ex * 0.65;
}

// ---------- scene 3 ----------
function scene3(t) {
  const s3 = $('s3');
  if (!show(s3, t >= 4.5 && t < 11.3)) return;
  const sh = E.inOut3(P(t, 4.5, 5.0));
  T(s3, { y: (1 - sh) * 1080 });
  s3.style.borderRadius = `${(1 - sh) * 70}px ${(1 - sh) * 70}px 0 0`;
  const ctx = el.c3; ctx.clearRect(0, 0, 1920, 1080);
  drawParticles(ctx, P3, t, '255,255,255', 0.45);
  T($('s3head'), { x: -(1 - E.out5(P(t, 4.85, 5.3))) * 40, o: P(t, 4.85, 5.1) });
  const pgo = E.out3(P(t, 4.9, 5.3));
  T($('s3prog'), { pre: 'translateX(-50%)', y: (1 - pgo) * 30, o: pgo });

  FEATS.forEach((f, k) => {
    const s = FS[k], end = FS[k + 1], last = k === FEATS.length - 1;
    const on = t >= s - 0.1 && (last || t < end + 0.02);
    $('pg' + k).style.width = `${E.inOut3(P(t, s, end)) * 100}%`;
    const g = $('fg' + k);
    g.style.opacity = 0.35 * P(t, s - 0.1, s + 0.3) * (last ? 1 : 1 - P(t, end - 0.2, end + 0.1));
    glowDrift(g, t, 520, 560, 80, 60, 1.1, k);
    if (!show($('f' + k), on)) return;
    const v = t - s;
    const out = last ? 0 : E.in3(P(t, end - 0.2, end));
    // text block
    const pi = P(t, s, s + 0.38);
    T($('fi' + k), { s: 0.3 + 0.7 * E.outBack(pi, 2.2), r: (1 - E.out3(pi)) * -30, o: P(t, s, s + 0.1) });
    words($('fh' + k), t, s + 0.05, 1e9, { st: 0.06, d: 0.55 });
    words($('fp' + k), t, s + 0.16, 1e9, { st: 0.04, d: 0.5 });
    T($('ft' + k).querySelector('.fnum'), { y: (1 - E.out5(P(t, s, s + 0.5))) * 60, o: P(t, s, s + 0.3) });
    T($('ft' + k), { y: -out * 90, o: 1 - out, blur: out * 8 });
    // card block
    const pc = E.outExpo(P(t, s - 0.04, s + 0.5));
    T($('fc' + k), { px: 1800, x: -(1 - pc) * 180 - out * 140, y: (1 - pc) * 40, ry: -(1 - pc) * 28 + out * 10, s: (0.9 + 0.1 * pc) * (1 - out * 0.08), o: P(t, s - 0.04, s + 0.12) * (1 - out) });
    FEAT_ANIM[k](v, t);
  });
}

const uiIn = (id, v, a, b, dy = 30) => { const p = P(v, a, b); T($(id), { y: (1 - E.outBack(p, 1.6)) * dy, o: clamp(p * 3) }); };
const swSet = (id, p) => { const s = $(id); s.querySelector('b').style.opacity = p; s.querySelector('i').style.transform = `translateX(${-28 * E.outBack(p, 2)}px)`; };
const FEAT_ANIM = [
  v => { // upload
    uiIn('f0a', v, 0, 0.4); uiIn('f0b', v, 0.08, 0.45);
    ['f0c0', 'f0c1', 'f0c2'].forEach((id, i) => {
      const p = E.inOut3(P(v, 0.02 + i * 0.08, 0.5 + i * 0.08));
      const q = bez({ x: -330, y: 60 + i * 150 }, { x: 60, y: 40 + i * 60 }, { x: 330, y: 170 }, p);
      T($(id), { x: q.x, y: q.y, s: 1 - 0.6 * p, r: (1 - p) * (i - 1) * 12, o: P(v, 0.02 + i * 0.08, 0.1 + i * 0.08) * (1 - P(p, 0.8, 1)) });
    });
    const q = E.inOut3(P(v, 0.24, 0.72)), done = P(v, 0.72, 0.8);
    $('f0bar').style.width = `${q * 100}%`;
    $('f0bar').style.background = done > 0 ? 'var(--mint)' : '';
    $('f0pct').textContent = `${Math.round(q * 100)}%`;
    $('f0pct').style.color = done > 0 ? '#0e9e78' : '';
    $('f0scrub').style.width = `${q * 100}%`;
    T($('f0l1'), { y: -done * 20, o: 1 - done }); T($('f0l2'), { y: (1 - done) * 20, o: done });
    T($('f0iu'), { s: 1 - done, o: 1 - done }); T($('f0ic'), { s: E.outBack(done, 3), o: done });
    $('f0ib').style.background = done > 0.5 ? '#e3faf3' : '#eef1ff'; $('f0ib').style.color = done > 0.5 ? '#0e9e78' : 'var(--primary)';
    T($('f0play'), { s: 1 + 0.06 * Math.sin(v * 12) });
  },
  v => { // exams
    uiIn('f1a', v, 0, 0.4);
    [0, 1, 2, 3].forEach(i => { const p = E.out5(P(v, 0.1 + i * 0.05, 0.4 + i * 0.05)); T($('f1o' + i), { x: -(1 - p) * 40, o: p }); });
    const sel = P(v, 0.42, 0.56);
    $('f1hl').style.opacity = sel;
    T($('f1ok'), { s: E.outBack(P(v, 0.46, 0.64), 3), o: P(v, 0.46, 0.5) });
    const ps = P(v, 0.34, 0.6);
    T($('f1s'), { s: E.outBack(ps, 2), o: P(v, 0.34, 0.4) });
    const r = E.out3(P(v, 0.5, 0.88));
    $('f1ring').style.strokeDashoffset = 276.5 * (1 - 0.9 * r);
    $('f1n').textContent = Math.round(18 * r);
  },
  v => { // protection
    uiIn('f2a', v, 0, 0.4);
    const sp = E.inOut3(P(v, 0.08, 0.45));
    $('f2shp').style.strokeDashoffset = f2len * (1 - sp);
    $('f2shp').setAttribute('fill-opacity', 0.9 * E.out3(P(v, 0.35, 0.55)));
    const lk = P(v, 0.3, 0.5);
    T($('f2lock'), { s: E.outBack(lk, 2.4), o: lk > 0 ? 1 : 0 });
    T($('f2shk'), { y: -5 * (1 - E.outBack(P(v, 0.5, 0.64), 3)) });
    const pu = P(v, 0.62, 0.98);
    T($('f2pulse'), { s: 1 + pu * 2.4, o: pu > 0 ? (1 - pu) : 0 });
    T($('f2scan'), { y: lerp(-20, 420, E.inOut3(P(v, 0.02, 0.7))), o: 1 - P(v, 0.62, 0.72) });
    T($('f2wm'), { pre: 'rotate(-24deg)', x: v * 50 });
    const b = P(v, 0.55, 0.85); T($('f2b'), { y: (1 - E.outBack(b, 2)) * 40, o: clamp(b * 3) });
  },
  v => { // analytics
    uiIn('f3a', v, 0, 0.4); uiIn('f3b', v, 0.32, 0.7, 50);
    $$('#f3svg .f3bar').forEach((b, i) => {
      const h = el.f3vals[i] * 175 * E.outBack(P(v, 0.1 + i * 0.04, 0.45 + i * 0.04), 1.4);
      b.setAttribute('y', 190 - Math.max(0, h)); b.setAttribute('height', Math.max(0, h));
    });
    const lp = E.inOut3(P(v, 0.34, 0.78));
    $('f3line').style.strokeDashoffset = lineLen * (1 - lp);
    $$('#f3svg .f3dot').forEach((d, i) => {
      const p = P(v, 0.34 + i * 0.055, 0.44 + i * 0.055);
      d.setAttribute('cx', el.f3pts[i].x); d.setAttribute('cy', el.f3pts[i].y); d.setAttribute('r', 8 * E.outBack(p, 3));
    });
    $('f3k').textContent = Math.round(87 * E.outExpo(P(v, 0.12, 0.8)));
    const dn = E.out3(P(v, 0.42, 0.9));
    $('f3don').style.strokeDashoffset = 251.3 * (1 - 0.92 * dn); $('f3d').textContent = Math.round(92 * dn);
  },
  v => { // scheduling
    uiIn('f4a', v, 0, 0.4);
    swSet('f4sw', E.out3(P(v, 0.12, 0.26)));
    for (let i = 0; i < 12; i++) {
      const p = P(v, 0.22 + i * 0.035, 0.5 + i * 0.035);
      T($('lc' + i), { y: -(1 - E.outBack(p, 2.2)) * 50, s: 0.6 + 0.4 * E.outBack(p, 2), o: clamp(p * 4) });
    }
  },
  v => { // supervisors
    uiIn('f5a', v, 0, 0.4);
    T($('f5add'), { s: 1 + 0.08 * Math.sin(Math.PI * P(v, 0.2, 0.4)) });
    [0, 1, 2].forEach(i => { const p = E.out5(P(v, 0.08 + i * 0.07, 0.45 + i * 0.07)); T($('f5r' + i), { x: -(1 - p) * 50, o: p }); });
    const order = ['f5s0a', 'f5s0b', 'f5s1a', 'f5s1b', 'f5s2a'];
    order.forEach((id, j) => swSet(id, E.out3(P(v, 0.34 + j * 0.07, 0.46 + j * 0.07))));
    swSet('f5s2b', 0);
  },
];

// ---------- band wipe S3 → S4 ----------
const BAND = [10.75, 11.25];
function bandX(t) { return lerp(2350, -700, E.inOut3(P(t, BAND[0], BAND[1]))); }
function renderBand(t) {
  const b = $('band');
  if (!show(b, t > BAND[0] && t < BAND[1])) return;
  T(b, { pre: 'skewX(-12deg)', x: bandX(t) - 260 });
}

// ---------- scene 4 ----------
function scene4(t) {
  const s4 = $('s4');
  if (!show(s4, t >= BAND[0] && t < 13.25)) return;
  if (t < BAND[1]) {
    const bx = bandX(t);
    s4.style.clipPath = `polygon(${bx + 115}px 0, 2000px 0, 2000px 1080px, ${bx - 115}px 1080px)`;
  } else s4.style.clipPath = 'none';
  glowDrift($('s4g'), t, 960, 760, 200, 60, 0.8);
  const ctx = el.c4; ctx.clearRect(0, 0, 1920, 1080);
  drawFloor(ctx, t, { hy: 640, rgb: hexRgb(B.primaryLight), alpha: 0.16, speed: 1.8 });
  drawParticles(ctx, P4, t, '255,255,255', 0.5);

  words($('s4h'), t, 10.98, 1e9, { st: 0.08, d: 0.7 });
  words($('s4p'), t, 11.18, 1e9, { st: 0.12, d: 0.6 });

  const dp = P(t, S4_DRAW[0], S4_DRAW[1]);
  $('s4path').style.strokeDashoffset = pathLen * (1 - dp);
  const ghostIn = P(t, 11.0, 11.3); $('s4ghost').style.opacity = ghostIn;
  NODES.forEach((nd, i) => {
    const tk = lerp(S4_DRAW[0], S4_DRAW[1], nodeFrac[i]);
    const p = P(t, tk - 0.04, tk + 0.4);
    const n = $('nd' + i);
    T(n.querySelector('.nc'), { s: E.outBack(p, 2.6), o: p > 0 ? 1 : 0 });
    const pl = E.out5(P(t, tk + 0.06, tk + 0.45));
    T(n.querySelector('.nl'), { y: (1 - pl) * 20, o: pl });
    T(n, { y: Math.sin(t * 2.2 + i) * 5 });
  });
  [0, 3].forEach((ni, g) => {
    const tk = lerp(S4_DRAW[0], S4_DRAW[1], nodeFrac[ni]);
    const p = E.out5(P(t, tk, tk + 0.5));
    T($('gp' + g), { y: (1 - p) * 30, o: p });
  });
  // traveler rides the path head, then carries us to the end card
  const pt = $('s4path').getPointAtLength(pathLen * Math.min(dp, 0.985));
  const fly = E.inOut3(P(t, 12.4, 12.82));
  const endP = $('s4path').getPointAtLength(pathLen * 0.985);
  const tx = lerp(dp < 0.985 ? pt.x : endP.x, 960, fly), ty = lerp(dp < 0.985 ? pt.y : endP.y, 540, fly);
  T($('s4trav'), { x: tx, y: ty, s: 1 + fly * 1.6, o: P(t, 11.2, 11.3) });
  const col = E.inOut3(P(t, 12.45, 12.85));
  const all = $('s4all'); all.style.transformOrigin = '960px 600px';
  T(all, { s: 1 - col * 0.35, o: 1 - col, blur: col * 12 });
}

// ---------- scene 5 ----------
function scene5(t) {
  const s5 = $('s5');
  if (!show(s5, t >= 12.78)) return;
  const pr = P(t, 12.8, 13.2);
  s5.style.clipPath = pr < 1 ? `circle(${E.in3(pr) * 2250 + 26 * (pr > 0)}px at 960px 540px)` : 'none';
  glowDrift($('s5gA'), t, 700, 420, 140, 70, 0.8);
  glowDrift($('s5gB'), t, 1320, 700, 120, 60, 0.9, 2);

  const pm = P(t, 12.98, 13.5);
  T($('lmark'), { s: E.outBack(pm, 1.9), r: (1 - E.out3(pm)) * -35, o: P(t, 12.98, 13.05) });
  const pw = E.outExpo(P(t, 13.2, 13.75));
  const lw = $('lword'); lw.style.clipPath = `inset(-20% 0 -20% ${(1 - pw) * 100}%)`;
  T(lw, { x: (1 - pw) * 60 });
  $('lshine').style.left = `${lerp(-120, 280, E.inOut3(P(t, 14.0, 14.45)))}px`;
  words($('s5tag'), t, 13.45, 1e9, { st: 0.09, d: 0.65 });
  const pb = P(t, 13.7, 14.1), click = Math.sin(Math.PI * P(t, 14.6, 14.76));
  T($('s5btn'), { s: E.outBack(pb, 2.2) * (1 - 0.07 * click), o: P(t, 13.7, 13.8) });
  const pu = E.out5(P(t, 13.85, 14.25)); T($('s5url'), { y: (1 - pu) * 20, o: pu });
  $$('#s5rings .ring').forEach((r, i) => {
    const p = P(t, 14.62 + i * 0.1, 15.1 + i * 0.1);
    T(r, { sx: 1 + E.out3(p) * 0.35, sy: 1 + E.out3(p) * 0.9, o: p > 0 ? (1 - p) * 0.8 : 0 });
  });
  const OB = [[330, 250], [1600, 230], [200, 610], [1730, 620], [470, 930], [1460, 940]];
  OB.forEach(([x, y], i) => {
    const p = P(t, 13.25 + i * 0.06, 13.75 + i * 0.06);
    const e = E.outBack(p, 1.8);
    T($('ob' + i), { x: lerp(960, x, E.out5(p)), y: lerp(460, y, E.out5(p)) + Math.sin(t * 2 + i * 1.3) * 10, s: e, r: Math.sin(t * 1.5 + i) * 6, o: clamp(p * 4) });
  });
  const all = $('s5all'); all.style.transformOrigin = '960px 540px';
  T(all, { s: 1.04 - 0.04 * E.out3(P(t, 12.9, 15)) });
}

// ---------- master ----------
function render(t) {
  t = clamp(t, 0, DURATION);
  scene1(t); scene2(t); scene3(t); renderBand(t); scene4(t); scene5(t);
  renderCursor(t);
  $('grain').style.backgroundPosition = `${Math.floor(t * 60 * 37) % 256}px ${Math.floor(t * 60 * 91) % 256}px`;
  $('vignette').style.opacity = t > 12.9 ? 1 - P(t, 12.9, 13.2) * 0.7 : 1;
}
window.render = render;

// Sound-design cue sheet, derived from the same constants that drive the picture,
// so audio/soundtrack.py can place every hit on the exact frame.
window.getCues = () => ({
  bpm: 120,
  duration: DURATION,
  clicks: [1.95, 14.6],
  impacts: [2.03, 12.98],
  whooshes: [2.0, 4.48, 10.72, 12.72],
  risers: [[0, 1.95], [12.0, 12.95]],
  type: Array.from({ length: 22 }, (_, i) => 2.95 + (i + 1) / 22 * 0.77),
  pops: [0.1, 1.12, 2.42, 3.12, 3.21, 3.3, 3.42, 3.52, 3.62, 3.78, 3.85, 4.05, 13.7],
  words: [0.2, 0.29, 0.38, 0.62, 0.72, 0.82],
  feats: FS.slice(0, 6),
  chimes: [FS[0] + 0.72, FS[1] + 0.46],
  lock: [FS[2] + 0.5],
  ticks: [
    ...Array.from({ length: 8 }, (_, i) => FS[3] + 0.1 + i * 0.04),
    ...Array.from({ length: 12 }, (_, i) => FS[4] + 0.22 + i * 0.035),
  ],
  toggles: [FS[4] + 0.12, ...Array.from({ length: 5 }, (_, j) => FS[5] + 0.34 + j * 0.07)],
  nodes: NODES.map((_, i) => lerp(S4_DRAW[0], S4_DRAW[1], nodeFrac[i])),
  logo: 12.98,
  shine: 14.0,
});

// ---------- boot ----------
window.ready = document.fonts.ready.then(() => {
  init(); render(0);
  const q = new URLSearchParams(location.search);
  if (q.has('render')) return;
  if (q.has('t')) { render(parseFloat(q.get('t'))); return; }
  // live preview: loops; space = pause, ←/→ = scrub
  let t0 = performance.now(), paused = false, pt = 0;
  addEventListener('keydown', e => {
    if (e.code === 'Space') { paused = !paused; t0 = performance.now() - pt * 1000; }
    if (e.code === 'ArrowRight') { pt = Math.min(DURATION, pt + 0.1); t0 = performance.now() - pt * 1000; }
    if (e.code === 'ArrowLeft') { pt = Math.max(0, pt - 0.1); t0 = performance.now() - pt * 1000; }
  });
  const loop = now => {
    if (!paused) pt = ((now - t0) / 1000) % DURATION;
    render(pt); requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
});
