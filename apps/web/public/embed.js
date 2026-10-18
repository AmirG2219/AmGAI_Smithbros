/*!
 * Smith Bros Floors - "Get Your Free Estimate" widget
 *
 * Add this ONE line to the website (header or footer):
 *   <script src="https://YOUR-APP-DOMAIN/embed.js" defer></script>
 *
 * Then make any button or link open the form, in any ONE of these ways:
 *   - give it the class  smithbros-open
 *   - or set its link to  #smithbros-estimate
 *   - or add the attribute  data-smithbros-open
 * To show the form inside the page instead of a pop-up, also add  <div id="smithbros-estimate-form"></div>
 *
 * It draws itself inside a Shadow DOM, so the site's CSS cannot change it and it cannot change the site.
 */
(function () {
  "use strict";
  if (window.SmithBros) return; // already loaded

  var script = document.currentScript;
  if (!script) {
    var all = document.querySelectorAll('script[src*="embed.js"]');
    script = all[all.length - 1];
  }
  if (!script) return;
  var origin = new URL(script.src).origin;
  var endpoint = script.getAttribute("data-endpoint") || origin + "/api/intake";
  var logoUrl = script.getAttribute("data-logo") || origin + "/embed-logo.png";

  // ------------------------------------------------------------------ fonts
  // Loaded from our own domain (no third parties). Shadow DOM cannot register fonts, so register them on the page.
  try {
    [
      ["SB Cormorant", "cormorant-garamond.woff2", { style: "normal", weight: "300 700" }],
      ["SB Cormorant", "cormorant-garamond-italic.woff2", { style: "italic", weight: "300 700" }],
      ["SB DM Sans", "dm-sans.woff2", { style: "normal", weight: "100 1000" }],
    ].forEach(function (f) {
      var face = new FontFace(f[0], "url(" + origin + "/fonts/" + f[1] + ")", f[2]);
      face.load().then(function (l) { document.fonts.add(l); }, function () {});
    });
  } catch { /* fall back to Georgia and system fonts */ }

  // ------------------------------------------------------------------ data
  var TYPES = [
    ["new_installation", "New Installation", "Brand new hardwood floors", "hammer"],
    ["sand_refinish", "Sand & Refinish", "Restore existing floors", "refresh"],
    ["restoration", "Restoration / Repair", "Fix damage or wear", "wrench"],
    ["commercial", "Commercial Project", "Offices, retail, or multi-unit", "building"],
  ];
  var ROOMS = [
    ["living_room", "Living Room"], ["bedroom", "Bedroom"], ["kitchen", "Kitchen"], ["hallway", "Hallway"],
    ["basement", "Basement"], ["stairs", "Stairs"], ["commercial", "Commercial"], ["other", "Other"],
  ];
  var TIMELINES = [["asap", "Within 1 month"], ["1_3_months", "1–3 months"], ["3_6_months", "3–6 months"], ["flexible", "Just exploring"]];
  var SPECIES = [
    ["white_oak", "White Oak"], ["red_oak", "Red Oak"], ["maple", "Maple"], ["walnut", "Walnut"],
    ["birch", "Birch"], ["hickory", "Hickory"], ["cherry", "Cherry"],
  ];
  var PATTERNS = [
    ["straight_plank", "Straight Plank", "plank"], ["herringbone", "Herringbone", "herring"],
    ["chevron", "Chevron", "chevron"], ["show_all", "Show Me Everything", "grid"],
  ];
  var FINISHES = [
    ["site_finished", "Site-finished", "Sanded and finished after installation — unlimited colour options"],
    ["pre_finished", "Pre-finished", "Factory coated — faster install, lower disruption"],
    ["no_preference", "No preference", ""],
  ];
  var CONTACTS = [["phone", "Phone call"], ["text", "Text message"], ["email", "Email"]];
  var STEP_TITLES = [
    "What type of project are you planning?",
    "Tell us about the space.",
    "Any preferences on wood or style?",
    "How should we reach you?",
  ];

  // ------------------------------------------------------------------ icons (simple inline SVG)
  function svg(inner, size, extra) {
    return '<svg class="ic" width="' + (size || 22) + '" height="' + (size || 22) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + (extra || "") + ">" + inner + "</svg>";
  }
  var ICONS = {
    hammer: '<path d="M13 4l7 7-3 3-7-7z"/><path d="M10.5 9.5L3 17l4 4 7.5-7.5"/>',
    refresh: '<path d="M20 12a8 8 0 0 1-14 5.3"/><path d="M4 12a8 8 0 0 1 14-5.3"/><path d="M18 3v4h-4"/><path d="M6 21v-4h4"/>',
    wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.4 2.4-2.6-.6-.6-2.6z"/>',
    building: '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 7.5h2M13 7.5h2M9 11.5h2M13 11.5h2"/><path d="M10 21v-4h4v4"/>',
    plank: '<rect x="3" y="4" width="18" height="4" rx="1"/><rect x="3" y="10" width="18" height="4" rx="1"/><rect x="3" y="16" width="18" height="4" rx="1"/>',
    herring: '<path d="M3 19l4.5-14L12 19l4.5-14L21 19"/>',
    chevron: '<path d="M4 9l8-5 8 5"/><path d="M4 15l8-5 8 5"/><path d="M4 21l8-5 8 5"/>',
    grid: '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  };

  // ------------------------------------------------------------------ styles
  var CSS = [
    ":host{all:initial}*{box-sizing:border-box;margin:0}",
    ".sb{font-family:'SB DM Sans',system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#2b211b;font-size:14px;line-height:1.4}",
    ".sb button,.sb input,.sb textarea{font:inherit}.sb input,.sb textarea{color:inherit}",
    ".overlay{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(18,13,10,.74);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);}.anim.overlay{animation:fade .2s ease}",
    ".card{position:relative;width:100%;max-width:476px;max-height:calc(100dvh - 32px);display:flex;flex-direction:column;background:#fcf9f3;border-radius:14px;overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,.45)}.anim .card{animation:rise .25s ease}",
    ".inline .card{max-width:520px;margin:0 auto;box-shadow:none;border:1px solid #e9e1d3;animation:none;max-height:none}",
    ".bar{height:3px;background:#efe7d8;flex:none}.bar i{display:block;height:100%;background:#c9993a;transition:width .3s ease}",
    ".head{display:flex;align-items:center;gap:12px;padding:16px 28px;border-bottom:1px solid #eee6d8;flex:none}",
    ".logo{width:40px;height:40px;border-radius:50%;background:#211a16;color:#d8b66c;display:flex;align-items:center;justify-content:center;font-family:'SB Cormorant',Georgia,serif;font-size:13px;letter-spacing:.06em;font-weight:600;flex:none;overflow:hidden}.logo img{width:100%;height:100%;object-fit:cover}",
    ".ttl{flex:1;font-family:'SB Cormorant',Georgia,'Times New Roman',serif;font-size:21px;font-weight:500}",
    ".x{background:none;border:0;cursor:pointer;color:#6b5e52;padding:6px;border-radius:6px;display:flex}.x:hover{color:#211a16;background:#f1eadc}",
    ".body{padding:22px 28px 8px;overflow-y:auto;flex:1;scrollbar-width:thin;scrollbar-color:#d9ceb9 transparent}",
    ".prompt{font-family:'SB Cormorant',Georgia,serif;font-style:italic;font-size:20px;color:#3d3028;margin-bottom:20px}",
    ".lbl{display:block;font-weight:500;margin:0 0 8px;font-size:14px}.lbl small{font-weight:400;color:#8a7f73;font-size:14px}",
    ".blk{margin-bottom:22px}.hint{font-size:12px;color:#8a7f73;margin-top:6px}",
    ".field{position:relative}.field input,.field textarea{width:100%;padding:12px 14px;border:1px solid #e3dac9;border-radius:8px;background:#fff;outline:none;transition:border-color .15s}.field textarea{resize:vertical;min-height:88px}",
    ".field input:focus,.field textarea:focus{border-color:#c9993a;box-shadow:0 0 0 3px rgba(201,153,58,.15)}",
    ".unit{position:absolute;right:14px;top:50%;transform:translateY(-50%);color:#8a7f73;font-size:13px;pointer-events:none}",
    ".err input,.err textarea{border-color:#e0809f;background:#fff9fb}.msg{color:#d6336c;font-size:12px;margin-top:5px}",
    ".types{display:grid;grid-template-columns:1fr 1fr;gap:12px}",
    ".opt{background:#fff;color:#2b211b;border:1px solid #e9e1d3;cursor:pointer;text-align:center;transition:border-color .15s,background .15s}.opt:hover{border-color:#d8c9a8}",
    ".opt[aria-pressed=true]{border-color:#c9993a;background:#fbf2de;box-shadow:inset 0 0 0 .5px #c9993a}",
    ".card-opt{border-radius:8px;padding:18px 10px 16px;display:flex;flex-direction:column;align-items:center;gap:6px;color:#2b211b}.card-opt .ic{color:#c9993a;margin-bottom:4px}.card-opt b{font-weight:500;font-size:14px}.card-opt span{font-size:12px;color:#8a7f73}",
    ".chips{display:flex;flex-wrap:wrap;gap:8px}.chip{border-radius:999px;padding:8px 15px;font-size:13.5px}.chip[aria-pressed=true]{background:#5a3a2e;border-color:#5a3a2e;color:#fff}",
    ".four{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.sq{border-radius:6px;padding:14px 6px;font-size:13px;color:#4a3d33;min-height:50px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px}.sq[aria-pressed=true]::before{content:'';width:6px;height:6px;border-radius:50%;background:#c9993a}",
    ".pat{border-radius:8px;padding:12px 4px;font-size:12.5px;color:#8a7f73;display:flex;flex-direction:column;align-items:center;gap:6px;min-height:84px;justify-content:center}.pat .ic{color:#c4b5a0}.pat[aria-pressed=true]{color:#2b211b;font-weight:500}.pat[aria-pressed=true] .ic{color:#8a6a3a}",
    ".radios{display:grid;gap:8px}.radio{border-radius:8px;padding:12px 14px;display:flex;align-items:flex-start;gap:12px;text-align:left;width:100%}",
    ".dot{width:16px;height:16px;border-radius:50%;border:1.5px solid #b9ad9d;flex:none;margin-top:2px;position:relative}.radio[aria-pressed=true] .dot{border-color:#c9993a}.radio[aria-pressed=true] .dot::after{content:'';position:absolute;inset:3px;border-radius:50%;background:#c9993a}",
    ".radio b{display:block;font-weight:500;font-size:14px}.radio span{display:block;font-size:12px;color:#8a7f73;margin-top:2px}",
    ".three{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.seg{border-radius:6px;padding:11px 6px;font-size:13px}.seg[aria-pressed=true]{font-weight:500}",
    ".req{color:#d6336c;margin-left:2px}.priv{text-align:center;color:#8a7f73;font-size:12px;margin:2px 0 14px}",
    ".foot{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 28px;border-top:1px solid #eee6d8;background:#fcf9f3;flex:none}",
    ".back{background:none;border:0;cursor:pointer;color:#8a7f73;display:inline-flex;align-items:center;gap:6px;padding:8px 0;font-size:14px}.back:hover{color:#211a16}.back[hidden]{visibility:hidden;display:inline-flex}",
    ".step{margin-left:auto;color:#8a7f73;font-size:12.5px}",
    ".go{background:#c9993a;color:#fff;border:0;border-radius:4px;padding:14px 22px;font-weight:700;font-size:12.5px;letter-spacing:.09em;text-transform:uppercase;cursor:pointer;display:inline-flex;align-items:center;gap:8px;transition:background .15s}.go:hover{background:#b8892f}.go:disabled{opacity:.65;cursor:default}",
    ".done{text-align:center;padding:30px 10px 26px}.tick{width:54px;height:54px;border-radius:50%;background:#fbf2de;color:#c9993a;display:flex;align-items:center;justify-content:center;margin:0 auto 16px}",
    ".done h2{font-family:'SB Cormorant',Georgia,serif;font-weight:500;font-size:30px;margin-bottom:6px}.done p{color:#6b5e52;max-width:340px;margin:0 auto}",
    ".book{display:inline-block;margin-top:22px;padding:14px 24px;border-radius:4px;background:#211a16;color:#f5f0e8;text-decoration:none;font-weight:700;font-size:12.5px;letter-spacing:.09em;text-transform:uppercase}.book:hover{background:#5a3a2e}",
    ".hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}",
    "@keyframes fade{from{opacity:0}to{opacity:1}}@keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}",
    "@media(max-width:520px){.overlay{padding:0;align-items:flex-end}.card{max-height:100dvh;height:auto;border-radius:16px 16px 0 0;max-width:none}.head,.body,.foot{padding-left:18px;padding-right:18px}.four{grid-template-columns:1fr 1fr}.three{grid-template-columns:1fr}.go{padding:14px 16px}}",
    "@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}",
  ].join("");

  // ------------------------------------------------------------------ state
  function fresh() {
    return {
      step: 0, errors: {}, sending: false, key: newKey(), done: false, firstName: "", bookingUrl: null, sendError: "",
      v: { type: "", sqft: "", rooms: [], timeline: "", species: [], pattern: "", finish: "", name: "", phone: "", email: "", contact: "phone", notes: "", website: "" },
    };
  }
  function newKey() {
    return window.crypto && crypto.randomUUID ? crypto.randomUUID() : "k-" + Date.now() + "-" + Math.random().toString(36).slice(2);
  }
  var S = fresh();

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function pressed(on) { return on ? "true" : "false"; }

  // ------------------------------------------------------------------ views
  function viewStep() {
    var v = S.v, e = S.errors, h = "";
    if (S.step === 0) {
      h += '<div class="types" role="group" aria-label="Project type">' + TYPES.map(function (t) {
        return '<button type="button" class="opt card-opt" data-act="type" data-val="' + t[0] + '" aria-pressed="' + pressed(v.type === t[0]) + '">' +
          svg(ICONS[t[3]], 26) + "<b>" + t[1] + "</b><span>" + t[2] + "</span></button>";
      }).join("") + "</div>" + (e.type ? '<p class="msg">' + e.type + "</p>" : "");
    } else if (S.step === 1) {
      h += '<div class="blk"><label class="lbl" for="sb-sqft">Approximate square footage</label><div class="field' + (e.sqft ? " err" : "") + '">' +
        '<input id="sb-sqft" data-in="sqft" inputmode="decimal" placeholder="e.g. 800" value="' + esc(v.sqft) + '"><span class="unit">ft²</span></div>' +
        (e.sqft ? '<p class="msg">' + e.sqft + "</p>" : '<p class="hint">Not sure? We’ll measure for free.</p>') + "</div>" +
        '<div class="blk"><span class="lbl">Which rooms? <small>(select all that apply)</small></span><div class="chips">' + ROOMS.map(function (r) {
          return '<button type="button" class="opt chip" data-act="room" data-val="' + r[0] + '" aria-pressed="' + pressed(v.rooms.indexOf(r[0]) > -1) + '">' + r[1] + "</button>";
        }).join("") + "</div></div>" +
        '<div class="blk"><span class="lbl">When are you looking to start?</span><div class="four" role="group">' + TIMELINES.map(function (t) {
          return '<button type="button" class="opt sq" data-act="timeline" data-val="' + t[0] + '" aria-pressed="' + pressed(v.timeline === t[0]) + '">' + t[1] + "</button>";
        }).join("") + "</div>" + (e.timeline ? '<p class="msg">' + e.timeline + "</p>" : "") + "</div>";
    } else if (S.step === 2) {
      h += '<div class="blk"><span class="lbl">Wood species <small>(optional)</small></span><div class="chips">' + SPECIES.map(function (r) {
        return '<button type="button" class="opt chip" data-act="species" data-val="' + r[0] + '" aria-pressed="' + pressed(v.species.indexOf(r[0]) > -1) + '">' + r[1] + "</button>";
      }).join("") + "</div></div>" +
        '<div class="blk"><span class="lbl">Pattern preference</span><div class="four">' + PATTERNS.map(function (p) {
          return '<button type="button" class="opt pat" data-act="pattern" data-val="' + p[0] + '" aria-pressed="' + pressed(v.pattern === p[0]) + '">' + svg(ICONS[p[2]], 26) + "<span>" + p[1] + "</span></button>";
        }).join("") + "</div></div>" +
        '<div class="blk"><span class="lbl">Finish type</span><div class="radios">' + FINISHES.map(function (f) {
          return '<button type="button" class="opt radio" data-act="finish" data-val="' + f[0] + '" aria-pressed="' + pressed(v.finish === f[0]) + '"><i class="dot"></i><div><b>' + f[1] + "</b>" + (f[2] ? "<span>" + f[2] + "</span>" : "") + "</div></button>";
        }).join("") + "</div></div>";
    } else {
      function field(id, key, label, ph, type, ac) {
        return '<div class="blk"><label class="lbl" for="sb-' + id + '">' + label + '<span class="req">*</span></label><div class="field' + (e[key] ? " err" : "") + '">' +
          '<input id="sb-' + id + '" data-in="' + key + '" type="' + type + '" autocomplete="' + ac + '" placeholder="' + ph + '" value="' + esc(v[key]) + '"></div>' +
          (e[key] ? '<p class="msg">' + e[key] + "</p>" : "") + "</div>";
      }
      h += field("name", "name", "Full name", "Jane Smith", "text", "name") +
        field("phone", "phone", "Phone", "(403) 555-1234", "tel", "tel") +
        field("email", "email", "Email", "jane@example.com", "email", "email") +
        '<div class="blk"><span class="lbl">Best way to reach you</span><div class="three" role="group">' + CONTACTS.map(function (c) {
          return '<button type="button" class="opt seg" data-act="contact" data-val="' + c[0] + '" aria-pressed="' + pressed(v.contact === c[0]) + '">' + c[1] + "</button>";
        }).join("") + "</div></div>" +
        '<div class="blk"><label class="lbl" for="sb-notes">Anything else? <small>(optional)</small></label><div class="field"><textarea id="sb-notes" data-in="notes" placeholder="Address, timeline, concerns, or anything else...">' + esc(v.notes) + "</textarea></div></div>" +
        '<div class="hp" aria-hidden="true"><input data-in="website" tabindex="-1" autocomplete="off" value=""></div>' +
        '<p class="priv">Your information is private. Smith Bros. never shares or sells customer data.</p>' +
        (S.sendError ? '<p class="msg" role="alert" style="text-align:center;margin-bottom:12px">' + esc(S.sendError) + "</p>" : "");
    }
    return h;
  }

  function viewDone() {
    return '<div class="done"><div class="tick">' + svg(ICONS.check, 26) + "</div><h2>Thank you, <span id=\"sb-first\"></span></h2>" +
      "<p>We’ve received your project details and will be in touch shortly.</p></div>";
  }

  function viewCard(modal) {
    var last = S.step === 3;
    var inner =
      '<div class="bar"><i style="width:' + (S.done ? 100 : (S.step + 1) * 25) + '%"></i></div>' +
      '<div class="head"><div class="logo">' + '<img src="' + esc(logoUrl) + '" alt="">' + '</div><div class="ttl" id="sb-title">Get Your Free Estimate</div>' +
      (modal ? '<button type="button" class="x" data-act="close" aria-label="Close">' + svg(ICONS.close, 18) + "</button>" : "") + "</div>" +
      '<div class="body" id="sb-body">' + (S.done ? viewDone() : '<p class="prompt">' + STEP_TITLES[S.step] + "</p>" + viewStep()) + "</div>";
    if (!S.done)
      inner += '<div class="foot"><button type="button" class="back" data-act="back"' + (S.step === 0 ? " hidden" : "") + ">" + svg(ICONS.back, 16) + " Back</button>" +
        '<span class="step">Step ' + (S.step + 1) + " of 4</span>" +
        '<button type="button" class="go" data-act="' + (last ? "submit" : "next") + '"' + (S.sending ? " disabled" : "") + ">" +
        (last ? (S.sending ? "Sending…" : "Request my free estimate") : "Continue " + svg(ICONS.arrow, 14)) + "</button></div>";
    return inner;
  }

  // ------------------------------------------------------------------ logic
  function validate(step) {
    var e = {}, v = S.v;
    if (step === 0 && !v.type) e.type = "Please choose a project type.";
    if (step === 1) {
      if (v.sqft && !(Number(v.sqft) > 0 && Number(v.sqft) < 1000000)) e.sqft = "Please enter a number, like 800.";
      if (!v.timeline) e.timeline = "Please choose when you’d like to start.";
    }
    if (step === 3) {
      if (v.name.trim().length < 2) e.name = "Please enter your name";
      if (v.phone.replace(/\D/g, "").length < 10) e.phone = "Please enter a valid phone number";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) e.email = "Valid email required";
    }
    return e;
  }

  function formatPhone(raw) {
    var d = raw.replace(/\D/g, "");
    if (d.length > 10 && d[0] === "1") d = d.slice(1);
    d = d.slice(0, 10);
    if (d.length < 4) return d;
    if (d.length < 7) return "(" + d.slice(0, 3) + ") " + d.slice(3);
    return "(" + d.slice(0, 3) + ") " + d.slice(3, 6) + "-" + d.slice(6);
  }

  function toggle(arr, val) {
    var i = arr.indexOf(val);
    if (i > -1) arr.splice(i, 1); else arr.push(val);
  }

  function submit() {
    var v = S.v;
    S.sending = true; S.sendError = ""; refreshAll(false);
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        submission_key: S.key, project_type: v.type, square_footage: v.sqft || undefined, rooms: v.rooms, timeline: v.timeline,
        species: v.species, pattern: v.pattern || undefined, finish: v.finish || undefined, full_name: v.name.trim(),
        phone: v.phone, email: v.email.trim(), preferred_contact: v.contact, notes: v.notes.trim() || undefined, website: v.website,
      }),
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error((res.body && res.body.error) || "Something went wrong");
        S.firstName = v.name.trim().split(/\s+/)[0];
        S.bookingUrl = typeof res.body.booking_url === "string" && /^https:\/\//.test(res.body.booking_url) ? res.body.booking_url : null;
        S.done = true; S.sending = false;
        window.dispatchEvent(new CustomEvent("smithbros:submitted"));
        refreshAll(false);
      })
      .catch(function (ex) {
        S.sending = false;
        S.sendError = ex.message || "We couldn’t send your request. Please try again.";
        refreshAll(false);
      });
  }

  // ------------------------------------------------------------------ mounting
  // One UI instance per place the form is drawn (pop-up or inline). State is shared, so they stay in sync.
  function createUI(host, modal) {
    var root = host.attachShadow({ mode: "open" });
    root.innerHTML = "<style>" + CSS + "</style>";
    var wrap = document.createElement("div");
    wrap.className = "sb" + (modal ? "" : " inline");
    root.appendChild(wrap);
    var ui = { root: root, host: host };
    var firstRender = true; // the opening animation plays once, not on every step

    ui.render = function () {
      var body = wrap.querySelector("#sb-body");
      var scroll = body ? body.scrollTop : 0;
      var active = root.activeElement && root.activeElement.getAttribute && root.activeElement.getAttribute("data-in");
      var caret = active && root.activeElement.selectionStart;
      wrap.innerHTML = modal ? '<div class="overlay' + (firstRender ? " anim" : "") + '" data-act="overlay"><div class="card" role="dialog" aria-modal="true" aria-labelledby="sb-title">' + viewCard(true) + "</div></div>" : '<div class="card">' + viewCard(false) + "</div>";
      firstRender = false;
      var im = wrap.querySelector(".logo img");
      if (im) im.addEventListener("error", function () { im.parentNode.textContent = "SB"; });
      var first = wrap.querySelector("#sb-first");
      if (first) first.textContent = S.firstName;
      if (S.done) {
        if (S.bookingUrl) {
          var a = document.createElement("a");
          a.className = "book"; a.textContent = "Book a free consultation";
          a.setAttribute("href", S.bookingUrl); a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener");
          wrap.querySelector(".done").appendChild(a);
        }
      }
      var nb = wrap.querySelector("#sb-body");
      if (nb) nb.scrollTop = scroll;
      if (active) {
        var again = wrap.querySelector('[data-in="' + active + '"]');
        if (again) { again.focus(); try { again.setSelectionRange(caret, caret); } catch { /* not a text field */ } }
      }
    };

    wrap.addEventListener("click", function (ev) {
      var t = ev.target.closest("[data-act]");
      if (!t) return;
      var act = t.getAttribute("data-act"), val = t.getAttribute("data-val");
      if (act === "overlay") { if (ev.target === t && modal) api.close(); return; }
      if (act === "close") return api.close();
      if (act === "type") { S.v.type = val; S.errors = {}; }
      else if (act === "timeline") { S.v.timeline = val; delete S.errors.timeline; }
      else if (act === "pattern") S.v.pattern = S.v.pattern === val ? "" : val;
      else if (act === "finish") S.v.finish = val;
      else if (act === "contact") S.v.contact = val;
      else if (act === "room") toggle(S.v.rooms, val);
      else if (act === "species") toggle(S.v.species, val);
      else if (act === "back") { S.step = Math.max(0, S.step - 1); S.errors = {}; S.sendError = ""; return refreshAll(true); }
      else if (act === "next" || act === "submit") {
        var errs = validate(S.step);
        S.errors = errs;
        if (Object.keys(errs).length) { refreshAll(false); var bad = wrap.querySelector(".err input, .msg"); if (bad && bad.focus) bad.focus(); return; }
        if (act === "submit") return submit();
        S.step += 1; return refreshAll(true);
      }
      // Selection changes update in place, so scroll position and focus are not disturbed.
      var group = t.parentElement && t.parentElement.querySelectorAll("[data-act='" + act + "']");
      if (group) {
        [].forEach.call(group, function (b) {
          var on = act === "room" || act === "species" ? (S.v[act === "room" ? "rooms" : "species"].indexOf(b.getAttribute("data-val")) > -1)
            : act === "type" ? S.v.type === b.getAttribute("data-val")
            : act === "timeline" ? S.v.timeline === b.getAttribute("data-val")
            : act === "pattern" ? S.v.pattern === b.getAttribute("data-val")
            : act === "finish" ? S.v.finish === b.getAttribute("data-val")
            : S.v.contact === b.getAttribute("data-val");
          b.setAttribute("aria-pressed", pressed(on));
        });
      }
      var m = wrap.querySelector(".msg");
      if (m && (act === "type" || act === "timeline")) m.remove();
    });

    wrap.addEventListener("input", function (ev) {
      var k = ev.target.getAttribute && ev.target.getAttribute("data-in");
      if (!k) return;
      var val = ev.target.value;
      if (k === "phone") { val = formatPhone(val); ev.target.value = val; }
      S.v[k] = val;
      if (S.errors[k]) { delete S.errors[k]; var f = ev.target.closest(".field"); if (f) { f.classList.remove("err"); var m = f.parentNode.querySelector(".msg"); if (m) m.remove(); } }
    });

    wrap.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" && ev.target.tagName === "INPUT" && ev.target.getAttribute("data-in") !== "website") {
        ev.preventDefault();
        var b = wrap.querySelector(".go"); if (b && !b.disabled) b.click();
      }
    });

    ui.wrap = wrap;
    return ui;
  }

  var uis = [];
  function refreshAll(focusBody) {
    uis.forEach(function (u) { u.render(); });
    if (focusBody) {
      var u = uis[uis.length - 1];
      var el = u && u.wrap.querySelector(".body input, .body .opt");
      if (el && el.focus && u.modal) el.focus({ preventScroll: true });
      var b = u && u.wrap.querySelector("#sb-body"); if (b) b.scrollTop = 0;
    }
  }

  // ------------------------------------------------------------------ public API
  var popup = null, lastFocus = null, prevOverflow = "";
  function onKey(ev) {
    if (!popup) return;
    if (ev.key === "Escape") { api.close(); return; }
    if (ev.key === "Tab") { // keep keyboard focus inside the pop-up
      var items = popup.wrap.querySelectorAll("button:not([hidden]):not([disabled]), input:not([tabindex='-1']), textarea, a[href]");
      if (!items.length) return;
      var first = items[0], last = items[items.length - 1], cur = popup.root.activeElement;
      if (ev.shiftKey && cur === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && cur === last) { ev.preventDefault(); first.focus(); }
    }
  }

  var api = {
    open: function () {
      if (popup) return;
      if (S.done) S = fresh();
      lastFocus = document.activeElement;
      var host = document.createElement("div");
      host.setAttribute("data-smithbros", "modal");
      document.body.appendChild(host);
      popup = createUI(host, true);
      popup.modal = true;
      uis.push(popup);
      prevOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = "hidden";
      popup.render();
      document.addEventListener("keydown", onKey, true);
      var first = popup.wrap.querySelector(".body .opt, .body input");
      if (first) first.focus({ preventScroll: true });
    },
    close: function () {
      if (!popup) return;
      document.removeEventListener("keydown", onKey, true);
      uis.splice(uis.indexOf(popup), 1);
      popup.host.remove();
      popup = null;
      document.documentElement.style.overflow = prevOverflow;
      if (lastFocus && lastFocus.focus) lastFocus.focus();
      if (S.done) S = fresh();
    },
  };
  window.SmithBros = { open: api.open, close: api.close };

  // Any element with the class, attribute or link below opens the form.
  document.addEventListener("click", function (ev) {
    var t = ev.target.closest && ev.target.closest('.smithbros-open, [data-smithbros-open], a[href="#smithbros-estimate"]');
    if (t) { ev.preventDefault(); api.open(); }
  });

  // Optional: draw the form inside the page instead of as a pop-up.
  function mountInline() {
    var host = document.getElementById("smithbros-estimate-form");
    if (!host || host.shadowRoot) return;
    var ui = createUI(host, false);
    uis.push(ui);
    ui.render();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountInline);
  else mountInline();
})();
