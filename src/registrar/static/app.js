const API = "/api/v1";
let currentUser = null;
let token = localStorage.getItem("climora_token") || null;
let currentDomain = null;

const $ = (id) => document.getElementById(id);

function toast(msg, isError = false) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.toggle("error", isError);
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 3500);
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...options, headers });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `Fout ${res.status}`);
  return data;
}

function show(view) {
  for (const v of ["search", "dashboard", "auth"]) {
    $(`view-${v}`).classList.toggle("hidden", v !== view);
  }
  $("nav-search").classList.toggle("active", view === "search");
  $("nav-dashboard").classList.toggle("active", view === "dashboard");
}

function renderAuthArea() {
  const area = $("auth-area");
  if (currentUser) {
    area.innerHTML = `<span class="meta" style="color:var(--muted);margin:0 8px">${currentUser.email}</span>
      <button class="nav-btn" id="btn-logout">Uitloggen</button>`;
    $("btn-logout").onclick = async () => {
      await api("/auth/logout", { method: "POST" }).catch(() => {});
      token = null;
      localStorage.removeItem("climora_token");
      currentUser = null;
      renderAuthArea();
      show("search");
    };
  } else {
    area.innerHTML = `<button class="nav-btn" id="btn-login">Inloggen</button>`;
    $("btn-login").onclick = () => show("auth");
  }
}

function resultCard(hit) {
  const div = document.createElement("div");
  div.className = `result-card ${hit.available ? "" : "unavailable"}`;
  const price = hit.price === 0 ? "€0,00 / jaar" : `€${hit.price.toFixed(2).replace(".", ",")} / jaar`;
  const badge = hit.available
    ? `<span class="badge free">Beschikbaar · ${price}</span>`
    : `<span class="badge warn">Bezet</span>`;
  const warn = hit.restriction !== "none" ? `<div class="meta">⚠ ${hit.restriction_label}</div>` : "";
  div.innerHTML = `
    <div>
      <div class="domain">${hit.domain}</div>
      ${badge}${warn}
    </div>`;
  if (hit.available) {
    const btn = document.createElement("button");
    btn.className = "btn small";
    btn.textContent = "Registreer";
    btn.onclick = () => registerDomain(hit.domain);
    div.appendChild(btn);
  }
  return div;
}

async function doSearch(q) {
  const box = $("search-results");
  box.innerHTML = "<p style='color:var(--muted)'>Bezig met zoeken…</p>";
  try {
    const data = await api(`/domains/search?q=${encodeURIComponent(q)}&limit=48`);
    box.innerHTML = "";
    if (!data.results.length) {
      box.innerHTML = "<p style='color:var(--muted)'>Geen resultaten.</p>";
      return;
    }
    for (const hit of data.results) box.appendChild(resultCard(hit));
  } catch (err) {
    box.innerHTML = "";
    toast(err.message, true);
  }
}

async function registerDomain(name) {
  if (!currentUser) {
    toast("Maak eerst een (gratis) account aan", true);
    show("auth");
    return;
  }
  try {
    await api(`/domains/register/${encodeURIComponent(name)}`, { method: "POST" });
    toast(`${name} geregistreerd — gratis! 🎉`);
    loadDashboard();
    show("dashboard");
  } catch (err) {
    toast(err.message, true);
  }
}

async function loadDashboard() {
  if (!currentUser) { show("auth"); return; }
  const list = $("domain-list");
  const manager = $("domain-manager");
  manager.classList.add("hidden");
  try {
    const domains = await api("/domains/mine");
    list.innerHTML = "";
    if (!domains.length) {
      list.innerHTML = "<p style='color:var(--muted)'>Nog geen domeinen. Zoek er één en registreer gratis!</p>";
      return;
    }
    for (const d of domains) {
      const row = document.createElement("div");
      row.className = "domain-row";
      row.innerHTML = `
        <div>
          <div class="name">${d.name}</div>
          <div class="meta">status: ${d.status} · verloopt: ${new Date(d.expires_at).toLocaleDateString("nl-NL")}</div>
        </div>`;
      const btn = document.createElement("button");
      btn.className = "btn small secondary";
      btn.textContent = "Beheer";
      btn.onclick = () => openManager(d.name);
      row.appendChild(btn);
      list.appendChild(row);
    }
  } catch (err) {
    toast(err.message, true);
  }
}

async function openManager(name) {
  currentDomain = name;
  const manager = $("domain-manager");
  manager.classList.remove("hidden");
  try {
    const d = await api(`/domains/${encodeURIComponent(name)}`);
    manager.innerHTML = `
      <div class="manager-card" style="max-width:none">
        <h3>${d.name}</h3>
        <p class="hint">Verloopt: ${new Date(d.expires_at).toLocaleDateString("nl-NL")} ·
          auto-verlenging: ${d.auto_renew ? "aan" : "uit"} · WHOIS-privacy: ${d.whois_privacy ? "aan" : "uit"}</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0">
          <button class="btn small secondary" id="btn-renew">Verleng (+1 jaar, gratis)</button>
          <button class="btn small secondary" id="btn-autorenew">Auto-verlenging: ${d.auto_renew ? "uit" : "aan"}</button>
          <button class="btn small danger" id="btn-release">Domein vrijgeven</button>
        </div>
        <label>Nameservers (één per regel)
          <textarea id="ns-input" rows="3" style="width:100%">${d.nameservers || ""}</textarea>
        </label>
        <button class="btn small" id="btn-ns-save" style="margin-top:8px">Nameservers opslaan</button>
        <h4 style="margin-top:24px">DNS-records</h4>
        <table class="dns-table" id="dns-table">
          <thead><tr><th>Type</th><th>Naam</th><th>Waarde</th><th>TTL</th><th>Prio</th><th></th></tr></thead>
          <tbody></tbody>
        </table>
        <div class="dns-form">
          <select id="dns-type">
            ${["A", "AAAA", "CNAME", "MX", "TXT", "NS", "CAA", "SRV"].map(t => `<option>${t}</option>`).join("")}
          </select>
          <input id="dns-name" placeholder="naam (@ = root)" />
          <input id="dns-value" placeholder="waarde" />
          <input id="dns-ttl" type="number" value="3600" />
          <input id="dns-prio" type="number" placeholder="prio (MX/SRV)" />
          <button class="btn small" id="dns-add">Toevoegen</button>
        </div>
      </div>`;
    renderDnsRows(d.dns_records);
    $("btn-renew").onclick = () => api(`/domains/${encodeURIComponent(name)}/renew`, { method: "POST" })
      .then(() => { toast("Verlengd met 1 jaar"); openManager(name); });
    $("btn-autorenew").onclick = () =>
      api(`/domains/${encodeURIComponent(name)}`, { method: "PATCH", body: JSON.stringify({ auto_renew: !d.auto_renew }) })
        .then(() => { toast("Bijgewerkt"); openManager(name); });
    $("btn-ns-save").onclick = () => {
      const ns = $("ns-input").value.split("\n").map(s => s.trim()).filter(Boolean);
      api(`/domains/${encodeURIComponent(name)}/nameservers`, { method: "PUT", body: JSON.stringify({ nameservers: ns }) })
        .then(() => toast("Nameservers opgeslagen"))
        .catch(e => toast(e.message, true));
    };
    $("btn-release").onclick = () => {
      if (!confirm(`${name} echt vrijgeven?`)) return;
      api(`/domains/${encodeURIComponent(name)}`, { method: "DELETE" })
        .then(() => { toast("Domein vrijgegeven"); loadDashboard(); })
        .catch(e => toast(e.message, true));
    };
    $("dns-add").onclick = addDnsRecord;
  } catch (err) {
    toast(err.message, true);
  }
}

function renderDnsRows(records) {
  const tbody = document.querySelector("#dns-table tbody");
  tbody.innerHTML = "";
  if (!records.length) {
    tbody.innerHTML = "<tr><td colspan='6' style='color:var(--muted)'>Nog geen DNS-records.</td></tr>";
    return;
  }
  for (const r of records) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${r.record_type}</td><td>${r.name}</td><td>${r.value}</td>
      <td>${r.ttl}</td><td>${r.priority ?? "—"}</td>`;
    const td = document.createElement("td");
    const btn = document.createElement("button");
    btn.className = "btn small danger";
    btn.textContent = "Verwijder";
    btn.onclick = () =>
      api(`/domains/${encodeURIComponent(currentDomain)}/dns/${r.id}`, { method: "DELETE" })
        .then(() => openManager(currentDomain))
        .catch(e => toast(e.message, true));
    td.appendChild(btn);
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
}

async function addDnsRecord() {
  const body = {
    record_type: $("dns-type").value,
    name: $("dns-name").value.trim() || "@",
    value: $("dns-value").value.trim(),
    ttl: parseInt($("dns-ttl").value) || 3600,
    priority: $("dns-prio").value === "" ? null : parseInt($("dns-prio").value),
  };
  try {
    await api(`/domains/${encodeURIComponent(currentDomain)}/dns`, { method: "POST", body: JSON.stringify(body) });
    toast("DNS-record toegevoegd");
    openManager(currentDomain);
  } catch (err) {
    toast(err.message, true);
  }
}

$("search-form").onsubmit = (e) => {
  e.preventDefault();
  const q = $("search-input").value.trim();
  if (q) doSearch(q);
};

$("nav-search").onclick = () => show("search");
$("nav-dashboard").onclick = () => (currentUser ? loadDashboard().then(() => show("dashboard")) : show("auth"));
$("tab-login").onclick = () => {
  $("tab-login").classList.add("active");
  $("tab-register").classList.remove("active");
  $("login-form").classList.remove("hidden");
  $("register-form").classList.add("hidden");
};
$("tab-register").onclick = () => {
  $("tab-register").classList.add("active");
  $("tab-login").classList.remove("active");
  $("register-form").classList.remove("hidden");
  $("login-form").classList.add("hidden");
};

$("login-form").onsubmit = async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const data = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: fd.get("email"), password: fd.get("password") }),
    });
    token = data.access_token;
    localStorage.setItem("climora_token", token);
    currentUser = data.user;
    renderAuthArea();
    loadDashboard();
    show("dashboard");
  } catch (err) {
    toast(err.message, true);
  }
};

$("register-form").onsubmit = async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const data = await api("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email: fd.get("email"), password: fd.get("password"), name: fd.get("name") || "" }),
    });
    token = data.access_token;
    localStorage.setItem("climora_token", token);
    currentUser = data.user;
    renderAuthArea();
    toast("Welkom! Account aangemaakt.");
    show("search");
  } catch (err) {
    toast(err.message, true);
  }
};

(async function init() {
  renderAuthArea();
  if (token) {
    try {
      currentUser = await api("/auth/me");
      renderAuthArea();
    } catch {
      token = null;
      localStorage.removeItem("climora_token");
      renderAuthArea();
    }
  }
})();
