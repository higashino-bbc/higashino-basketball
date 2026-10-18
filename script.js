(function () {
  const fallback = window.SITE_CONTENT || { news: [], results: [], schedule: [], links: {} };
  const feeds = window.SHEET_FEEDS || {};
  const $ = (selector) => document.querySelector(selector);
  const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const clean = (v) => String(v ?? "").trim();

  function parseCSV(text) {
    const rows = []; let row = []; let cell = ""; let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') quoted = false;
        else cell += c;
      } else {
        if (c === '"') quoted = true;
        else if (c === ",") { row.push(cell); cell = ""; }
        else if (c === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
        else cell += c;
      }
    }
    if (cell.length || row.length) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
    if (!rows.length) return [];
    const headers = rows.shift().map((h) => clean(h).replace(/^\uFEFF/, ""));
    return rows.filter((r) => r.some((v) => clean(v) !== "")).map((r) => {
      const item = {};
      headers.forEach((h, i) => { if (h) item[h] = clean(r[i]); });
      return item;
    });
  }

 async function loadSheet(key) {
  const url = clean(feeds[key]);
  if (!url) return null;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error("HTTP " + response.status);

    const buffer = await response.arrayBuffer();
    let text = new TextDecoder("utf-8").decode(buffer);

    if (text.includes("\uFFFD")) {
      text = new TextDecoder("shift_jis").decode(buffer);
    }

    if (/^\s*</.test(text)) throw new Error("CSVではない応答");
    return parseCSV(text);
  } catch (error) {
    console.warn("Google Sheets feed unavailable:", key, error);
    return null;
  }
}

  const renderNews = (items) => {
    $("#newsList").innerHTML = (items || []).filter((x) => !["no", "非表示"].includes(clean(x.show).toLowerCase())).map((item) => `
      <article class="news-card"><div class="news-meta"><time>${escapeHTML(item.date)}</time><span>${escapeHTML(item.category || "INFO")}</span></div>
      <h3>${escapeHTML(item.title)}</h3><p>${escapeHTML(item.text)}</p></article>`).join("") || '<p class="empty-state">お知らせは準備中です。</p>';
  };
  const renderResults = (items) => {
    $("#resultsList").innerHTML = (items || []).filter((x) => !["no", "非表示"].includes(clean(x.show).toLowerCase())).map((item) => `
      <article class="result-row"><div class="result-date">${escapeHTML(item.date)}<small>${escapeHTML(item.event)}</small></div>
      <div class="result-match"><strong>${escapeHTML(item.opponent)}</strong>${item.note ? `<small>${escapeHTML(item.note)}</small>` : ""}</div>
      <div class="result-score"><strong>${escapeHTML(item.score)}</strong><span class="result-badge ${clean(item.outcome).toUpperCase() === "WIN" ? "win" : clean(item.outcome).toUpperCase() === "LOSS" ? "loss" : "other"}">${escapeHTML(item.outcome || "RESULT")}</span></div></article>`).join("") || '<p class="empty-state">試合結果は準備中です。</p>';
  };
  const renderSchedule = (items) => {
    $("#scheduleList").innerHTML = (items || []).filter((x) => !["no", "非表示"].includes(clean(x.show).toLowerCase())).map((item) => `
      <article class="schedule-row"><div class="schedule-date">${escapeHTML(item.date)}</div><div class="schedule-content"><span>${escapeHTML(item.type || "INFO")}</span><h3>${escapeHTML(item.title)}</h3><p>${escapeHTML(item.detail)}</p></div><div class="schedule-arrow">↗</div></article>`).join("") || '<p class="empty-state">活動予定は準備中です。</p>';
  };

  const renderVideos = (items) => {
    const container = $("#videosList");
    if (!container) return;

    container.innerHTML = (items || [])
      .filter((item) => !["no", "非表示"].includes(clean(item.show).toLowerCase()))
      .map((item) => {
        const title = escapeHTML(item["動画名"] || item.title || "練習動画");
        const url = clean(item["動画URL"] || item.url);
        const description = escapeHTML(item["説明"] || item.description || "");

        if (!/^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(url)) {
          return "";
        }

        return `
          <article class="video-card">
            <h3>${title}</h3>
            <p>${description}</p>
            <a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">
              動画を見る ↗
            </a>
          </article>`;
      }).join("") || '<p class="empty-state">練習動画は準備中です。</p>';
  };

  const setLink = (selector, url, fallback) => {
    const link = $(selector);
    if (!link) return;
    if (url && /^https:\/\//i.test(url)) link.href = url;
    else if (fallback) { link.href = fallback; link.removeAttribute("target"); }
    else { link.href = "#"; link.addEventListener("click", (event) => { event.preventDefault(); alert("リンク先は準備中です。Googleスプレッドシートの Links シートにURLを設定してください。"); }); }
  };


  async function init() {
    const [news, results, schedule, linksRows, videos] = await Promise.all([
      loadSheet("news"),
      loadSheet("results"),
      loadSheet("schedule"),
      loadSheet("links"),
      loadSheet("videos")
    ]);

    renderNews(news === null ? fallback.news : news);
    renderResults(results === null ? fallback.results : results);
    renderSchedule(schedule === null ? fallback.schedule : schedule);
    renderVideos(videos === null ? (fallback.videos || []) : videos);
    const links = { ...(fallback.links || {}) };
    if (linksRows) linksRows.forEach((row) => {
      const key = clean(row.key).toLowerCase();
      if (["youtube", "instagram", "experience"].includes(key)) links[key] = clean(row.url);
    });
    setLink("#youtubeLink", links.youtube);
    setLink("#instagramLink", links.instagram);
    setLink("#experienceLink", links.experience, "mailto:REPLACE_WITH_SCHOOL_CONTACT");
    $("#year").textContent = new Date().getFullYear();
  }

  const toggle = $("#menuToggle");
  const nav = $("#mainNav");
  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(open));
    toggle.textContent = open ? "✕" : "☰";
  });
  nav.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => {
    nav.classList.remove("is-open"); toggle.setAttribute("aria-expanded", "false"); toggle.textContent = "☰";
  }));
  init();
})();
