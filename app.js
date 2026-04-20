const state = { data: null, tab: "leaderboard", gender: "all", selectedMeetId: null };

async function load() {
  const res = await fetch("./results.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`results.json returned ${res.status}`);
  state.data = await res.json();

  document.getElementById("subtitle").textContent =
    `${state.data.season} Outdoor Track & Field`;
  document.getElementById("updated").textContent = state.data.updatedAt
    ? `Updated ${new Date(state.data.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
    : "No scrape data yet";
  render();
}

function render() {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === state.tab));
  document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === state.tab));
  if (state.tab === "leaderboard") renderLeaderboard();
  if (state.tab === "meets") renderMeets();
}

function allResults() {
  return (state.data?.meets ?? []).flatMap((m) => (m.results ?? []).map((r) => ({ ...r, meet: m })));
}

function renderLeaderboard() {
  const results = allResults().filter((r) => state.gender === "all" || r.gender === state.gender);
  const byAthlete = new Map();
  for (const r of results) {
    const key = r.athleteId ?? r.athlete;
    if (!byAthlete.has(key)) byAthlete.set(key, { name: r.athlete, id: r.athleteId, points: 0, events: new Set() });
    const a = byAthlete.get(key);
    a.points += r.points ?? 0;
    a.events.add(`${r.gender === "women" ? "W" : "M"} ${r.event}`);
  }
  const ranked = [...byAthlete.values()].sort((a, b) => b.points - a.points);
  const meta = document.getElementById("lb-meta");
  meta.textContent = `${results.length} top-8 · ${new Set(results.map((r) => r.meet.meetId)).size} meets`;
  const tbody = document.querySelector("#lb-table tbody");
  tbody.innerHTML = "";
  ranked.forEach((a, i) => {
    const tr = document.createElement("tr");
    if (i < 3) tr.className = "top-row";
    tr.innerHTML = `
      <td><span class="rank">${i + 1}</span></td>
      <td>${a.id ? `<a href="https://www.athletic.net/athlete/${a.id}/track-and-field" target="_blank" rel="noopener">${escape(a.name)}</a>` : escape(a.name)}</td>
      <td class="events">${[...a.events].sort().join(", ")}</td>
      <td><span class="points">${a.points}</span></td>`;
    tbody.appendChild(tr);
  });
  if (!ranked.length) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--gray-700)">No results scraped yet — run <code>npm run scrape</code>.</td></tr>`;
  }
}

function renderMeets() {
  const list = document.getElementById("meet-list");
  list.innerHTML = "";
  const meets = [...(state.data?.meets ?? [])].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  for (const m of meets) {
    const count = (m.results ?? []).length;
    const li = document.createElement("li");
    li.className = "meet-card" + (m.meetId === state.selectedMeetId ? " active" : "");
    li.innerHTML = `
      <h3>${escape(m.name)}</h3>
      <div class="date">${m.date ?? "Date TBD"}</div>
      <div class="count">${count} top-8 result${count === 1 ? "" : "s"}</div>`;
    li.addEventListener("click", () => {
      state.selectedMeetId = m.meetId;
      renderMeets();
    });
    list.appendChild(li);
  }
  renderMeetDetail();
}

function renderMeetDetail() {
  const box = document.getElementById("meet-detail");
  box.innerHTML = "";
  const m = state.data?.meets?.find((x) => x.meetId === state.selectedMeetId);
  if (!m) return;
  const byEvent = new Map();
  for (const r of m.results ?? []) {
    const k = `${r.gender}::${r.event}`;
    if (!byEvent.has(k)) byEvent.set(k, []);
    byEvent.get(k).push(r);
  }
  const sorted = [...byEvent.entries()].sort(([a], [b]) => a.localeCompare(b));
  box.insertAdjacentHTML(
    "beforeend",
    `<h2>${escape(m.name)}</h2>
     <div class="date-line">${m.date ?? ""}</div>
     <div><a class="external-link" href="https://www.athletic.net/TrackAndField/meet/${m.meetId}" target="_blank" rel="noopener">View on athletic.net ↗</a></div>`,
  );
  if (!sorted.length) {
    box.insertAdjacentHTML("beforeend", `<p style="color:var(--gray-700)">No top-8 Highland placements recorded for this meet.</p>`);
    return;
  }
  for (const [key, rows] of sorted) {
    const [gender, event] = key.split("::");
    rows.sort((a, b) => a.place - b.place);
    const items = rows
      .map(
        (r) => `<li>
          <span class="p">${r.place}</span>
          <span class="name">${r.athleteId ? `<a href="https://www.athletic.net/athlete/${r.athleteId}/track-and-field" target="_blank" rel="noopener">${escape(r.athlete)}</a>` : escape(r.athlete)}</span>
          <span class="m">${escape(r.mark ?? "")}</span>
          <span class="pts">+${r.points}</span>
        </li>`,
      )
      .join("");
    box.insertAdjacentHTML(
      "beforeend",
      `<div class="event-block"><h4>${gender === "women" ? "Women" : "Men"} — ${escape(event)}</h4><ul>${items}</ul></div>`,
    );
  }
}

function escape(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

document.querySelectorAll(".tab").forEach((t) =>
  t.addEventListener("click", () => {
    state.tab = t.dataset.tab;
    render();
  }),
);
document.getElementById("lb-gender").addEventListener("change", (e) => {
  state.gender = e.target.value;
  renderLeaderboard();
});

load().catch((err) => {
  document.querySelector("main").innerHTML = `<p style="color:#c0392b;padding:20px">Failed to load results: ${escape(err.message)}</p>`;
});
