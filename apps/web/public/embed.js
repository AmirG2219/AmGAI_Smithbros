/*!
 * Smith Bros Floors - website estimate form
 * Add to any page:
 *   <div id="smithbros-estimate-form"></div>
 *   <script src="https://YOUR-APP-DOMAIN/embed.js" defer></script>
 * The form posts to the same domain the script was loaded from (/api/intake).
 * It renders inside a Shadow DOM, so the site's CSS cannot change it and it cannot change the site.
 */
(function () {
  var script = document.currentScript;
  if (!script) {
    var all = document.querySelectorAll('script[src*="embed.js"]');
    script = all[all.length - 1];
  }
  if (!script) return;
  var origin = new URL(script.src).origin;
  var endpoint = script.getAttribute("data-endpoint") || origin + "/api/intake";

  function mount() {
    var host = document.getElementById("smithbros-estimate-form");
    if (!host) {
      host = document.createElement("div");
      host.id = "smithbros-estimate-form";
      script.parentNode.insertBefore(host, script);
    }
    if (host.shadowRoot) return;
    var root = host.attachShadow({ mode: "open" });

    root.innerHTML =
      "<style>" +
      ":host{all:initial;display:block;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#211a16}" +
      "*{box-sizing:border-box}" +
      ".card{background:#f5f0e8;border-radius:14px;padding:28px;max-width:640px;margin:0 auto;border:1px solid #e8dfd0}" +
      ".eyebrow{font-size:11px;letter-spacing:.25em;text-transform:uppercase;color:#a87d53;margin:0}" +
      "h2{font-family:Georgia,'Times New Roman',serif;font-weight:500;font-size:30px;margin:6px 0 20px;line-height:1.15}" +
      ".grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}" +
      "label{display:block;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8a7b6c;margin-bottom:5px}" +
      "input,select,textarea{width:100%;font:inherit;font-size:15px;padding:11px 12px;border:1px solid #e0d6c4;border-radius:8px;background:#fff;color:#211a16}" +
      "input:focus,select:focus,textarea:focus{outline:2px solid #a87d53;outline-offset:0;border-color:#a87d53}" +
      ".full{grid-column:1/-1}" +
      "button{font:inherit;font-size:16px;font-weight:600;width:100%;margin-top:20px;padding:14px;border:0;border-radius:8px;background:#211a16;color:#f5f0e8;cursor:pointer}" +
      "button:hover{background:#a87d53}button:disabled{opacity:.6;cursor:default}" +
      ".err{color:#9b1c1c;font-size:14px;margin:14px 0 0}" +
      ".hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}" +
      ".done{text-align:center;padding:24px 0}.done h2{margin-bottom:8px}.done p{color:#8a7b6c;margin:0}" +
      ".book{display:inline-block;margin-top:20px;padding:13px 22px;border-radius:8px;background:#211a16;color:#f5f0e8;text-decoration:none;font-weight:600}.book:hover{background:#a87d53}" +
      "@media(max-width:560px){.card{padding:20px}.grid{grid-template-columns:1fr}h2{font-size:26px}}" +
      "</style>" +
      '<div class="card"><form novalidate>' +
      '<p class="eyebrow">Smith Bros Floors</p><h2>Request a free estimate</h2>' +
      '<div class="grid">' +
      '<div><label for="first_name">First name *</label><input id="first_name" name="first_name" autocomplete="given-name" required></div>' +
      '<div><label for="last_name">Last name</label><input id="last_name" name="last_name" autocomplete="family-name"></div>' +
      '<div><label for="email">Email *</label><input id="email" name="email" type="email" autocomplete="email" required></div>' +
      '<div><label for="phone">Phone</label><input id="phone" name="phone" type="tel" autocomplete="tel"></div>' +
      '<div><label for="city">City</label><input id="city" name="city" autocomplete="address-level2"></div>' +
      '<div><label for="postal_code">Postal code</label><input id="postal_code" name="postal_code" autocomplete="postal-code"></div>' +
      '<div><label for="project_type">Project type *</label><select id="project_type" name="project_type" required>' +
      '<option value="">Select...</option><option value="new_installation">New installation</option>' +
      '<option value="sand_refinish">Sand &amp; refinish</option><option value="restoration">Restoration</option>' +
      '<option value="commercial">Commercial</option></select></div>' +
      '<div><label for="material">Material *</label><select id="material" name="material" required>' +
      '<option value="">Select...</option><option value="hardwood">Hardwood</option><option value="engineered">Engineered wood</option>' +
      '<option value="laminate">Laminate</option><option value="vinyl">Vinyl</option><option value="tile">Tile</option>' +
      '<option value="unsure">Not sure yet</option></select></div>' +
      '<div><label for="square_footage">Approx. square feet</label><input id="square_footage" name="square_footage" type="number" min="1" step="any" inputmode="decimal"></div>' +
      '<div><label for="timeline">Timeline *</label><select id="timeline" name="timeline" required>' +
      '<option value="">Select...</option><option value="asap">As soon as possible</option><option value="1_3_months">1-3 months</option>' +
      '<option value="3_6_months">3-6 months</option><option value="flexible">Flexible</option></select></div>' +
      '<div class="full"><label for="notes">Anything else we should know?</label><textarea id="notes" name="notes" rows="3"></textarea></div>' +
      "</div>" +
      '<div class="hp" aria-hidden="true"><input name="website" tabindex="-1" autocomplete="off"></div>' +
      '<p class="err" role="alert" hidden></p>' +
      '<button type="submit">Get my estimate</button>' +
      "</form></div>";

    var form = root.querySelector("form");
    var err = root.querySelector(".err");
    var btn = root.querySelector("button");
    // One key per page load: a double click or retry can never create two leads.
    var key =
      window.crypto && crypto.randomUUID
        ? crypto.randomUUID()
        : "k-" + Date.now() + "-" + Math.random().toString(36).slice(2);

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      err.hidden = true;
      var data = {};
      new FormData(form).forEach(function (v, k) { data[k] = v; });
      data.submission_key = key;

      var missing = ["first_name", "email", "project_type", "material", "timeline"].filter(function (k) { return !data[k]; });
      if (missing.length) {
        err.textContent = "Please fill in the fields marked with *.";
        err.hidden = false;
        return;
      }

      btn.disabled = true;
      btn.textContent = "Sending...";
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
        .then(function (r) {
          return r.json().then(function (j) { return { ok: r.ok, body: j }; });
        })
        .then(function (res) {
          if (!res.ok) throw new Error(res.body && res.body.error ? res.body.error : "Something went wrong");
          root.querySelector(".card").innerHTML =
            '<div class="done"><p class="eyebrow">Smith Bros Floors</p><h2>Thank you</h2><p>We have your request and will be in touch shortly.</p></div>';
          var url = res.body && res.body.booking_url;
          if (typeof url === "string" && /^https:\/\//.test(url)) {
            var a = document.createElement("a");
            a.className = "book";
            a.textContent = "Book a free consultation";
            a.setAttribute("href", url);
            a.setAttribute("target", "_blank");
            a.setAttribute("rel", "noopener");
            root.querySelector(".done").appendChild(a);
          }
        })
        .catch(function (ex) {
          err.textContent = ex.message || "We could not send your request. Please try again.";
          err.hidden = false;
          btn.disabled = false;
          btn.textContent = "Get my estimate";
        });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
