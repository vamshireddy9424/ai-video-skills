// Two flat 2D characters drawn in SVG on the overlay: a Tiger and a Detective Panda.
// Bold outlines, flat colour, blinking eyes, hand gestures, and mouths driven by a viseme
// timeline (A closed, B slightly open, C open, D wide, E round, F pucker, G f/v, X rest).
const NS = "http://www.w3.org/2000/svg";
const INK = "#1b1b1b", SW = 7;

function layer() {
  let svg = document.getElementById("toon-layer");
  if (svg) return svg;
  svg = document.createElementNS(NS, "svg");
  svg.id = "toon-layer";
  svg.setAttribute("viewBox", "0 0 1080 1920");
  svg.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;";
  document.getElementById("overlay").prepend(svg);
  return svg;
}

/** Mouth shape at (0,0), width ~w. */
function mouth(shape, w, lip = "#7a1f22") {
  const h = w * 0.5;
  const dark = "#4a0f12", tongue = "#e8737a", teeth = "#ffffff";
  const S = `stroke="${INK}" stroke-width="${SW * 0.8}" stroke-linejoin="round" stroke-linecap="round"`;
  switch (shape) {
    case "A": return `<path d="M${-w / 2},0 Q0,${h * 0.35} ${w / 2},0" fill="none" ${S}/>`; // closed smile
    case "B": return `<path d="M${-w / 2},0 Q0,${h * 0.7} ${w / 2},0 Q0,${h * 0.15} ${-w / 2},0Z" fill="${dark}" ${S}/><path d="M${-w * 0.36},${h * 0.06} Q0,${h * 0.22} ${w * 0.36},${h * 0.06}" fill="none" stroke="${teeth}" stroke-width="${h * 0.16}"/>`;
    case "C": return `<path d="M${-w / 2},0 Q0,${h * 1.25} ${w / 2},0 Q0,${-h * 0.05} ${-w / 2},0Z" fill="${dark}" ${S}/><ellipse cx="0" cy="${h * 0.62}" rx="${w * 0.2}" ry="${h * 0.16}" fill="${tongue}"/>`;
    case "D": return `<path d="M${-w * 0.52},${-h * 0.05} Q0,${h * 1.9} ${w * 0.52},${-h * 0.05} Q0,${-h * 0.2} ${-w * 0.52},${-h * 0.05}Z" fill="${dark}" ${S}/><ellipse cx="0" cy="${h * 1.05}" rx="${w * 0.27}" ry="${h * 0.26}" fill="${tongue}"/><path d="M${-w * 0.4},${h * 0.02} L${w * 0.4},${h * 0.02}" stroke="${teeth}" stroke-width="${h * 0.18}"/>`;
    case "E": return `<ellipse cx="0" cy="${h * 0.45}" rx="${w * 0.3}" ry="${h * 0.62}" fill="${dark}" ${S}/><ellipse cx="0" cy="${h * 0.75}" rx="${w * 0.15}" ry="${h * 0.18}" fill="${tongue}"/>`;
    case "F": return `<ellipse cx="0" cy="${h * 0.3}" rx="${w * 0.16}" ry="${h * 0.3}" fill="${dark}" ${S}/>`;
    case "G": return `<path d="M${-w * 0.42},${h * 0.05} Q0,${h * 0.55} ${w * 0.42},${h * 0.05} Z" fill="${dark}" ${S}/><path d="M${-w * 0.3},${h * 0.08} L${w * 0.3},${h * 0.08}" stroke="${teeth}" stroke-width="${h * 0.2}"/>`;
    default: return `<path d="M${-w * 0.42},0 Q0,${h * 0.28} ${w * 0.42},0" fill="none" ${S}/>`; // X rest
  }
}
const arm = (x0, y0, ang, len, col, hand = "#f4f4f4") => {
  const x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len;
  return `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="${INK}" stroke-width="${SW * 6.2}" stroke-linecap="round"/>
    <line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="${col}" stroke-width="${SW * 4.4}" stroke-linecap="round"/>
    <circle cx="${x1}" cy="${y1}" r="${SW * 3.6}" fill="${hand}" stroke="${INK}" stroke-width="${SW}"/>`;
};
/** Gesture poses: [leftArmAngle, rightArmAngle] in radians (0 = pointing right, PI/2 = down). */
const POSES = {
  rest: [1.95, 1.2],
  point: [1.95, -0.55],
  open: [2.55, 0.6],
  think: [1.95, -1.9],
  wave: [1.95, -1.15],
  both: [3.6, -0.5],
};

function eye(cx, cy, r, blink, look = 0) {
  if (blink) return `<path d="M${cx - r},${cy} Q${cx},${cy + r * 0.45} ${cx + r},${cy}" fill="none" stroke="${INK}" stroke-width="${SW}" stroke-linecap="round"/>`;
  return `<ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${r * 1.12}" fill="#fff" stroke="${INK}" stroke-width="${SW * 0.85}"/>
    <circle cx="${cx + look * r * 0.3}" cy="${cy + r * 0.15}" r="${r * 0.48}" fill="${INK}"/>
    <circle cx="${cx + look * r * 0.3 + r * 0.16}" cy="${cy - r * 0.05}" r="${r * 0.15}" fill="#fff"/>`;
}

/** The Tiger: orange, white muzzle and belly, black stripes. (x, y) = feet centre. */
function tiger({ x, y, s = 1, shape = "X", pose = "rest", blink = false, tilt = 0, bob = 0, look = 0.4 }) {
  const O = "#f5902b", W = "#fff6ea";
  const [la, ra] = POSES[pose] || POSES.rest;
  const body = `
    <path d="M-150,40 Q-200,-170 -95,-260 L95,-260 Q200,-170 150,40 Q0,85 -150,40Z" fill="${O}" stroke="${INK}" stroke-width="${SW}"/>
    <path d="M-80,30 Q-110,-130 -40,-215 L40,-215 Q110,-130 80,30 Q0,55 -80,30Z" fill="${W}"/>
    <path d="M-170,-120 q30,10 40,40 M170,-120 q-30,10 -40,40 M-178,-40 q30,6 36,34 M178,-40 q-30,6 -36,34" stroke="${INK}" stroke-width="${SW * 1.6}" fill="none" stroke-linecap="round"/>
    <path d="M150,10 Q260,-20 250,-140" fill="none" stroke="${INK}" stroke-width="${SW * 5}" stroke-linecap="round"/>
    <path d="M150,10 Q260,-20 250,-140" fill="none" stroke="${O}" stroke-width="${SW * 3.3}" stroke-linecap="round"/>
    <ellipse cx="-70" cy="48" rx="62" ry="30" fill="${O}" stroke="${INK}" stroke-width="${SW}"/>
    <ellipse cx="70" cy="48" rx="62" ry="30" fill="${O}" stroke="${INK}" stroke-width="${SW}"/>`;
  const arms = arm(-128, -205, la, 135, O, W) + arm(128, -205, ra, 135, O, W);
  const head = `
    <g transform="translate(0,${-375 + bob}) rotate(${tilt})">
      <circle cx="-118" cy="-120" r="48" fill="${O}" stroke="${INK}" stroke-width="${SW}"/><circle cx="-118" cy="-120" r="24" fill="${W}"/>
      <circle cx="118" cy="-120" r="48" fill="${O}" stroke="${INK}" stroke-width="${SW}"/><circle cx="118" cy="-120" r="24" fill="${W}"/>
      <ellipse cx="0" cy="0" rx="185" ry="160" fill="${O}" stroke="${INK}" stroke-width="${SW}"/>
      <path d="M-20,-158 l20,55 l20,-55 M-70,-150 l15,40 M70,-150 l-15,40" stroke="${INK}" stroke-width="${SW * 1.8}" fill="none" stroke-linecap="round"/>
      <path d="M-185,-10 q40,6 55,30 M-182,40 q40,0 50,25 M185,-10 q-40,6 -55,30 M182,40 q-40,0 -50,25" stroke="${INK}" stroke-width="${SW * 1.6}" fill="none" stroke-linecap="round"/>
      <ellipse cx="0" cy="62" rx="108" ry="76" fill="${W}" stroke="${INK}" stroke-width="${SW * 0.7}"/>
      ${eye(-62, -32, 30, blink, look)}${eye(62, -32, 30, blink, look)}
      <path d="M-26,22 Q0,10 26,22 Q12,46 0,48 Q-12,46 -26,22Z" fill="#e0566a" stroke="${INK}" stroke-width="${SW * 0.8}" stroke-linejoin="round"/>
      <g transform="translate(0,82)">${mouth(shape, 72)}</g>
    </g>`;
  return `<g transform="translate(${x},${y}) scale(${s})">${body}${arms}${head}</g>`;
}

/** The Detective Panda: fedora, trench coat, magnifying glass in the right hand. */
function panda({ x, y, s = 1, shape = "X", pose = "rest", blink = false, tilt = 0, bob = 0, look = -0.4 }) {
  const C = "#a99a6b", K = "#262626", W = "#ffffff";
  const [la, ra] = POSES[pose] || POSES.rest;
  const rx = 128 + Math.cos(ra) * 135, ry = -205 + Math.sin(ra) * 135;
  const body = `
    <path d="M-160,45 Q-205,-170 -100,-265 L100,-265 Q205,-170 160,45 Q0,90 -160,45Z" fill="${C}" stroke="${INK}" stroke-width="${SW}"/>
    <path d="M-28,-262 L0,-150 L28,-262" fill="${W}" stroke="${INK}" stroke-width="${SW * 0.8}"/>
    <path d="M0,-150 L0,40" stroke="${INK}" stroke-width="${SW * 0.8}"/>
    <rect x="-168" y="-112" width="336" height="30" fill="#6b5a32" stroke="${INK}" stroke-width="${SW * 0.8}"/>
    <rect x="-22" y="-117" width="44" height="40" rx="6" fill="#d6b44c" stroke="${INK}" stroke-width="${SW * 0.7}"/>
    <ellipse cx="-70" cy="52" rx="62" ry="30" fill="${K}" stroke="${INK}" stroke-width="${SW}"/>
    <ellipse cx="70" cy="52" rx="62" ry="30" fill="${K}" stroke="${INK}" stroke-width="${SW}"/>`;
  const glass = `<g transform="translate(${rx},${ry}) rotate(-30)"><line x1="0" y1="0" x2="0" y2="-70" stroke="#5a3d1e" stroke-width="16" stroke-linecap="round"/>
    <circle cx="0" cy="-118" r="52" fill="rgba(170,215,255,0.45)" stroke="${INK}" stroke-width="${SW * 1.4}"/><circle cx="0" cy="-118" r="52" fill="none" stroke="#b08a2a" stroke-width="${SW * 0.7}"/></g>`;
  const arms = arm(-138, -205, la, 135, K, K) + arm(138, -205, ra, 135, K, K) + glass;
  const head = `
    <g transform="translate(0,${-385 + bob}) rotate(${tilt})">
      <circle cx="-125" cy="-105" r="52" fill="${K}" stroke="${INK}" stroke-width="${SW}"/>
      <circle cx="125" cy="-105" r="52" fill="${K}" stroke="${INK}" stroke-width="${SW}"/>
      <ellipse cx="0" cy="0" rx="182" ry="158" fill="${W}" stroke="${INK}" stroke-width="${SW}"/>
      <ellipse cx="-66" cy="-22" rx="52" ry="62" transform="rotate(-18,-66,-22)" fill="${K}"/>
      <ellipse cx="66" cy="-22" rx="52" ry="62" transform="rotate(18,66,-22)" fill="${K}"/>
      ${eye(-62, -26, 26, blink, look)}${eye(62, -26, 26, blink, look)}
      <ellipse cx="0" cy="38" rx="30" ry="20" fill="${K}"/>
      <g transform="translate(0,88)">${mouth(shape, 74)}</g>
      <path d="M-200,-118 Q0,-150 200,-118 L185,-92 Q0,-120 -185,-92Z" fill="#5d5f63" stroke="${INK}" stroke-width="${SW}" stroke-linejoin="round"/>
      <path d="M-120,-110 Q-125,-235 0,-240 Q125,-235 120,-110 Q0,-130 -120,-110Z" fill="#76787d" stroke="${INK}" stroke-width="${SW}" stroke-linejoin="round"/>
      <path d="M-118,-140 Q0,-160 118,-140" fill="none" stroke="#2d2d30" stroke-width="22"/>
    </g>`;
  return `<g transform="translate(${x},${y}) scale(${s})">${body}${arms}${head}</g>`;
}

/** Mouth shape at time t for speaker code ('t'|'p'), from [[t, shape, who], ...]. */
export function shapeAt(vis, t, who) {
  let lo = 0, hi = vis.length - 1, idx = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (vis[m][0] <= t) { idx = m; lo = m + 1; } else hi = m - 1; }
  if (idx < 0) return "X";
  const [t0, s, w] = vis[idx];
  if (w !== who) return "X";
  const next = vis[idx + 1];
  if (!next && t - t0 > 0.25) return "X";
  return s;
}

const blinkAt = (t, seed) => { const p = (t + seed * 1.7) % 3.4; return p > 3.25; };

/**
 * Draw both characters for this frame.
 * state: { t, vis, speaker: 't'|'p'|'', tigerPose, pandaPose, tigerX, show }
 */
export function drawCast(state) {
  const { t, vis, tigerX = 275, pandaX = 805, tigerPose = "rest", pandaPose = "rest", y = 1815, alpha = 1 } = state;
  const ts = shapeAt(vis, t, "t"), ps = shapeAt(vis, t, "p");
  const tTalk = ts !== "X", pTalk = ps !== "X";
  const svg = layer();
  svg.style.opacity = alpha;
  svg.innerHTML =
    `<ellipse cx="${tigerX}" cy="${y + 52}" rx="190" ry="26" fill="rgba(0,0,0,0.10)"/><ellipse cx="${pandaX}" cy="${y + 56}" rx="195" ry="26" fill="rgba(0,0,0,0.10)"/>` +
    tiger({ x: tigerX, y, s: 1.02, shape: ts, pose: tigerPose, blink: blinkAt(t, 1), tilt: tTalk ? Math.sin(t * 5) * 2.5 : -4, bob: tTalk ? Math.abs(Math.sin(t * 9)) * -6 : 0, look: 0.5 }) +
    panda({ x: pandaX, y, s: 1.02, shape: ps, pose: pandaPose, blink: blinkAt(t, 2), tilt: pTalk ? Math.sin(t * 4.3) * 2.5 : 4, bob: pTalk ? Math.abs(Math.sin(t * 8)) * -6 : 0, look: -0.5 });
}

export function hideCast() { const s = document.getElementById("toon-layer"); if (s) s.innerHTML = ""; }
