(function () {
  const LANG_KEY = "emc-lang";
  const MAP_CATEGORY_KEY = "emc-map-category";
  const GEOJSON_URL =
    "https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@v5.1.2/geojson/ne_110m_admin_0_countries.geojson";

  /** 站内路由统一使用 consumer 前缀，便于收藏与对外分享 */
  const HASH_HOME = "#/consumer";
  function hashCountry(slug) {
    return "#/consumer/country/" + encodeURIComponent(slug);
  }

  let mapInstance = null;
  let homeGeoLayer = null;

  function getLang() {
    return localStorage.getItem(LANG_KEY) === "en" ? "en" : "zh";
  }

  function setLang(lang) {
    localStorage.setItem(LANG_KEY, lang === "en" ? "en" : "zh");
    render();
  }

  function t(obj) {
    const lang = getLang();
    if (!obj) return "";
    if (typeof obj === "string") return obj;
    return obj[lang] || obj.zh || obj.en || "";
  }

  const metricsMeta = {
    marketVolumeMmUsd: {
      zh: "市场体量（人口×人均消费支出，百万美元）",
      en: "Market size (pop. × per-capita consumer spend, USD mn)",
    },
    perCapitaGdpKUsd: { zh: "人均 GDP（千美元）", en: "GDP per capita (USD thousands)" },
    gdpGrowthPct: { zh: "GDP 增速（%）", en: "GDP growth (%)" },
    populationK: { zh: "人口（千人）", en: "Population (thousands)" },
    consumerExpPerCapitaKUsd: {
      zh: "人均消费者支出（千美元）",
      en: "Per-capita consumer expenditure (USD thousands)",
    },
    medianAge: { zh: "中位年龄 / 平均年龄（岁）", en: "Median / mean age (years)" },
    householdSize: { zh: "家庭规模（人）", en: "Household size (persons)" },
    gini: { zh: "基尼系数（%）", en: "Gini index (%)" },
    easeBiz: {
      zh: "营商环境参考值（原研究表格，横向比较用）",
      en: "Business environment proxy (study table, for cross-country use)",
    },
  };

  function formatMetric(key, val) {
    if (val == null) return "—";
    if (key === "marketVolumeMmUsd") return val.toLocaleString();
    if (key === "populationK") return val.toLocaleString();
    if (key === "gdpGrowthPct" || key === "gini" || key === "easeBiz") return String(val);
    if (
      key === "perCapitaGdpKUsd" ||
      key === "consumerExpPerCapitaKUsd" ||
      key === "medianAge" ||
      key === "householdSize"
    )
      return String(val);
    return String(val);
  }

  function parseRoute() {
    const h = (location.hash || "").replace(/^#/, "");
    const parts = h.split("/").filter(Boolean);

    if (parts[0] === "consumer") {
      if (parts[1] === "country" && parts[2]) {
        return { name: "country", slug: decodeURIComponent(parts[2]) };
      }
      return { name: "home" };
    }

    if (parts[0] === "country" && parts[1]) {
      return { name: "country", slug: decodeURIComponent(parts[1]) };
    }

    return { name: "home" };
  }

  function goCountry(slug) {
    location.hash = hashCountry(slug);
  }

  function getSelectedMapCategory() {
    const keys = ["overview", ...window.EMC_DATA.categories.map((c) => c.key)];
    const raw = localStorage.getItem(MAP_CATEGORY_KEY);
    if (raw && keys.includes(raw)) return raw;
    return "overview";
  }

  function setSelectedMapCategory(k) {
    localStorage.setItem(MAP_CATEGORY_KEY, k);
  }

  function getCategoryValueRange(catKey) {
    const vals = window.EMC_DATA.countries.map((c) => c.consumption[catKey] ?? 0);
    return { min: Math.min(...vals), max: Math.max(...vals) };
  }

  function choroplethRgb(t) {
    t = Math.max(0, Math.min(1, t));
    const r = Math.round(238 + (44 - 238) * t);
    const g = Math.round(242 + (74 - 242) * t);
    const b = Math.round(247 + (110 - 247) * t);
    return `rgb(${r},${g},${b})`;
  }

  function colorForShare(val, min, max) {
    if (max <= min) return choroplethRgb(0.5);
    return choroplethRgb((val - min) / (max - min));
  }

  function geoStyleForFeature(feature, categoryKey) {
    const iso = feature.properties && feature.properties.ISO_A3;
    if (!iso || iso === "-99") {
      return {
        fillColor: "#dcdad6",
        fillOpacity: 0.95,
        color: "#cbc8c3",
        weight: 0.35,
        className: "emc-geo emc-geo--outside",
      };
    }
    const sample = window.EMC_DATA.countries.find((c) => c.iso3 === iso);
    if (!sample) {
      return {
        fillColor: "#dcdad6",
        fillOpacity: 0.95,
        color: "#cbc8c3",
        weight: 0.35,
        className: "emc-geo emc-geo--outside",
      };
    }
    if (categoryKey === "overview") {
      return {
        fillColor: "#9eb4cc",
        fillOpacity: 0.92,
        color: "#6d849e",
        weight: 0.55,
        className: "emc-geo emc-geo--sample",
      };
    }
    const { min, max } = getCategoryValueRange(categoryKey);
    const v = sample.consumption[categoryKey] ?? 0;
    return {
      fillColor: colorForShare(v, min, max),
      fillOpacity: 0.92,
      color: "#f7f6f3",
      weight: 0.35,
      className: "emc-geo emc-geo--sample emc-geo--choropleth",
    };
  }

  function updateLayerTooltips(geoLayer, categoryKey) {
    const lang = getLang();
    geoLayer.eachLayer((layer) => {
      const f = layer.feature;
      const iso = f.properties && f.properties.ISO_A3;
      const admin = (f.properties && (f.properties.NAME || f.properties.ADMIN)) || "";
      const sample = iso ? window.EMC_DATA.countries.find((c) => c.iso3 === iso) : null;
      let tip = admin;
      if (sample) {
        const label = t(sample.name);
        if (categoryKey === "overview") {
          tip = `${label} — ${lang === "zh" ? "点击进入" : "Click to open"}`;
        } else {
          const v = sample.consumption[categoryKey] ?? 0;
          tip = `${label} · ${v}%`;
        }
      } else {
        tip = `${admin} — ${lang === "zh" ? "样本外" : "Outside sample"}`;
      }
      layer.unbindTooltip();
      layer.bindTooltip(tip, { sticky: true, direction: "auto", opacity: 0.95 });
    });
  }

  function updateMapLegend(root, categoryKey) {
    const el = root.querySelector("#map-legend");
    if (!el) return;
    const lang = getLang();
    if (categoryKey === "overview") {
      el.innerHTML = `
        <div class="legend-overview">
          <span class="legend-swatch legend-swatch--sample"></span>
          <span>${lang === "zh" ? "研究样本（15 国）" : "Sample (15 economies)"}</span>
          <span class="legend-gap"></span>
          <span class="legend-swatch legend-swatch--outside"></span>
          <span>${lang === "zh" ? "研究范围外" : "Outside sample"}</span>
        </div>`;
      return;
    }
    const { min, max } = getCategoryValueRange(categoryKey);
    const catObj = window.EMC_DATA.categories.find((c) => c.key === categoryKey);
    const title = t(catObj);
    const lowRgb = choroplethRgb(0);
    const highRgb = choroplethRgb(1);
    el.innerHTML = `
      <div class="legend-choropleth">
        <div class="legend-choropleth-title">${title}</div>
        <div class="legend-choropleth-bar" style="background:linear-gradient(90deg, ${lowRgb}, ${highRgb})"></div>
        <div class="legend-choropleth-scale"><span>${min}%</span><span>${max}%</span></div>
      </div>`;
  }

  function applyHomeCategory(root, geoLayer, categoryKey) {
    setSelectedMapCategory(categoryKey);
    root.querySelectorAll("[data-map-category]").forEach((btn) => {
      btn.setAttribute("aria-pressed", btn.getAttribute("data-map-category") === categoryKey);
    });
    geoLayer.eachLayer((layer) => {
      layer.setStyle(geoStyleForFeature(layer.feature, categoryKey));
    });
    updateLayerTooltips(geoLayer, categoryKey);
    updateMapLegend(root, categoryKey);
  }

  function destroyMap() {
    if (mapInstance) {
      mapInstance.remove();
      mapInstance = null;
    }
    homeGeoLayer = null;
  }

  function buildNormalizedBars(country) {
    const keys = window.EMC_DATA.categories.map((c) => c.key);
    const raw = keys.map((k) => ({ key: k, v: country.consumption[k] || 0 }));
    const sum = raw.reduce((a, b) => a + b.v, 0) || 1;
    return raw.map((r) => ({ ...r, pct: (r.v / sum) * 100 }));
  }

  function renderHeader(active) {
    const lang = getLang();
    const site = window.EMC_DATA.site;
    return `
      <header class="site-header">
        <a href="#/consumer" class="brand" style="text-decoration:none;color:inherit;border:none;">
          <span class="brand-title">${t(site.title)}</span>
          <span class="brand-sub">${t(site.subtitle)}</span>
        </a>
        <div class="header-actions">
          ${active !== "home" ? `<a class="nav-home" href="#/consumer">${lang === "zh" ? "← 返回地图" : "← Map"}</a>` : ""}
          <div class="lang-toggle" role="group" aria-label="Language">
            <button type="button" aria-pressed="${lang === "zh"}" data-lang="zh">中文</button>
            <button type="button" aria-pressed="${lang === "en"}" data-lang="en">EN</button>
          </div>
        </div>
      </header>
    `;
  }

  function attachHeaderHandlers(root) {
    root.querySelectorAll(".lang-toggle button").forEach((btn) => {
      btn.addEventListener("click", () => setLang(btn.getAttribute("data-lang")));
    });
  }

  function renderHome(root) {
    const lang = getLang();
    const site = window.EMC_DATA.site;
    const selectedCat = getSelectedMapCategory();

    const overviewLabel = t(site.mapOverviewLabel);
    const categoryStripLabel = t(site.mapCategoryLabel);

    const pills = [
      `<button type="button" class="category-pill" data-map-category="overview" aria-pressed="${selectedCat === "overview"}">${overviewLabel}</button>`,
      ...window.EMC_DATA.categories.map(
        (c) =>
          `<button type="button" class="category-pill" data-map-category="${c.key}" aria-pressed="${selectedCat === c.key}">${t(c)}</button>`
      ),
    ].join("");

    root.innerHTML = `
      ${renderHeader("home")}
      <main>
        <section class="hero">
          <h1>${t(site.title)}</h1>
          <p class="lead">${t(site.homeLead)}</p>
        </section>
        <section class="category-strip panel">
          <p class="category-strip-label">${categoryStripLabel}</p>
          <div class="category-pills" role="group" aria-label="${lang === "zh" ? "消费支出类别" : "Expenditure categories"}">
            ${pills}
          </div>
        </section>
        <section class="map-section map-section--loading" aria-label="World map">
          <div class="map-toolbar">
            <div id="map-legend" class="map-legend" aria-live="polite"></div>
            <p class="map-hint">${t(site.mapHint)}</p>
          </div>
          <div class="map-wrap">
            <div id="map" role="application"></div>
            <div class="map-loading-overlay" id="map-loading-overlay">${t(site.mapLoading)}</div>
          </div>
        </section>
      </main>
    `;
    attachHeaderHandlers(root);

    requestAnimationFrame(() => {
      destroyMap();
      mapInstance = L.map("map", {
        scrollWheelZoom: true,
        worldCopyJump: true,
      }).setView([24, 45], 2);

      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 19,
      }).addTo(mapInstance);

      mapInstance.attributionControl.addAttribution(
        '<a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth</a>'
      );

      const mapSection = root.querySelector(".map-section");
      const loadingOverlay = root.querySelector("#map-loading-overlay");

      fetch(GEOJSON_URL)
        .then((r) => {
          if (!r.ok) throw new Error(String(r.status));
          return r.json();
        })
        .then((data) => {
          const cat = getSelectedMapCategory();
          homeGeoLayer = L.geoJSON(data, {
            style: (feat) => geoStyleForFeature(feat, cat),
            onEachFeature: (feature, layer) => {
              layer.on("click", (e) => {
                const iso = feature.properties && feature.properties.ISO_A3;
                const sample = iso && window.EMC_DATA.countries.find((c) => c.iso3 === iso);
                if (sample) {
                  L.DomEvent.stopPropagation(e);
                  goCountry(sample.slug);
                }
              });
            },
          }).addTo(mapInstance);

          updateLayerTooltips(homeGeoLayer, cat);
          updateMapLegend(root, cat);

          if (mapSection) mapSection.classList.remove("map-section--loading");
          if (loadingOverlay) loadingOverlay.remove();

          mapInstance.invalidateSize();

          root.querySelectorAll("[data-map-category]").forEach((btn) => {
            btn.addEventListener("click", () => {
              const key = btn.getAttribute("data-map-category");
              if (!key || !homeGeoLayer) return;
              applyHomeCategory(root, homeGeoLayer, key);
            });
          });
        })
        .catch(() => {
          destroyMap();
          if (mapSection) mapSection.classList.remove("map-section--loading");
          if (loadingOverlay) loadingOverlay.remove();
          const wrap = root.querySelector(".map-wrap");
          if (wrap)
            wrap.innerHTML = `<p class="map-error">${
              lang === "zh" ? "国界数据加载失败，请检查网络后刷新。" : "Could not load boundaries. Check your connection and refresh."
            }</p>`;
        });
    });
  }

  function renderCountry(root, slug) {
    const lang = getLang();
    const c = window.EMC_DATA.countries.find((x) => x.slug === slug);
    if (!c) {
      root.innerHTML = `${renderHeader("country")}<main><p class="empty-state">${lang === "zh" ? "未找到该国家。" : "Country not found."}</p></main>`;
      attachHeaderHandlers(root);
      destroyMap();
      return;
    }

    const bars = buildNormalizedBars(c);
    const barRows = bars
      .sort((a, b) => b.pct - a.pct)
      .map((row) => {
        const cat = window.EMC_DATA.categories.find((x) => x.key === row.key);
        const label = t(cat);
        const w = Math.max(2, row.pct);
        return `
          <div class="bar-row">
            <span class="bar-name">${label}</span>
            <div class="bar-track" aria-hidden="true"><div class="bar-fill" style="width:${w}%"></div></div>
            <span class="bar-pct">${row.pct.toFixed(1)}%</span>
          </div>
        `;
      })
      .join("");

    const metricHtml = Object.keys(metricsMeta)
      .map((key) => {
        return `
          <div class="metric">
            <span class="metric-label">${t(metricsMeta[key])}</span>
            <span class="metric-value">${formatMetric(key, c.metrics[key])}</span>
          </div>
        `;
      })
      .join("");

    const linksHtml = (c.links || [])
      .map(
        (lnk) => `
      <li><a href="${lnk.url}" target="_blank" rel="noopener noreferrer">${t(lnk)}</a></li>`
      )
      .join("");

    const bullets = (c.bullets[lang] || []).map((x) => `<li>${x}</li>`).join("");

    const sourcesTitle = lang === "zh" ? "数据来源与更新说明" : "Data sources & refresh";
    const sourcesIntro =
      lang === "zh"
        ? "权威宏观与人口序列请以世界银行、IMF 及各国统计机构最新发布为准；本页消费支出结构占比与核心指标表引自课题研究报告（原始数据库含 Euromonitor），展示口径与论文图表一致。"
        : "For live macro and demographic series, rely on the World Bank, IMF, and national statistical offices. Expenditure shares and headline indicators follow the research report (including Euromonitor-sourced tables) and match the published charts.";

    const globalSources = window.EMC_DATA.globalSources[lang]
      .map((line, i) => `<li>${line}</li>`)
      .join("");

    root.innerHTML = `
      ${renderHeader("country")}
      <main>
        <section class="hero">
          <h1>${t(c.name)}</h1>
          <p class="lead">${lang === "zh" ? "区域：" : "Region: "} ${t(c.region)} · ${t(c.stage)}</p>
        </section>
        <div class="country-layout">
          <aside class="panel">
            <span class="stage-pill">${t(c.stage)}</span>
            <h2>${lang === "zh" ? "基本信息" : "Country snapshot"}</h2>
            <div class="metric-grid">
              ${metricHtml}
            </div>
            <h2 style="margin-top:1.25rem;font-size:1rem;">${lang === "zh" ? "权威参考链接" : "Authoritative references"}</h2>
            <ul class="link-list">${linksHtml}</ul>
          </aside>
          <div class="panel chart-block">
            <h2>${lang === "zh" ? "消费支出结构" : "Consumer expenditure structure"}</h2>
            <p class="chart-note">${lang === "zh" ? "条形长度为分项占比（在原研究百分比基础上归一化为 100%，便于图形对比）。" : "Bar lengths show shares normalized to sum to 100% for chart readability (same underlying breakdown as the study)."}</p>
            <div class="bars">${barRows}</div>
            <section class="highlights">
              <h3>${lang === "zh" ? "特点与要点" : "Highlights"}</h3>
              <div class="narrative"><p>${t(c.narrative)}</p></div>
              <ul>${bullets}</ul>
            </section>
          </div>
        </div>
        <footer class="sources-footer panel">
          <h2>${sourcesTitle}</h2>
          <p class="chart-note" style="margin-bottom:1rem;">${sourcesIntro}</p>
          <ol>${globalSources}</ol>
        </footer>
      </main>
    `;
    attachHeaderHandlers(root);
    destroyMap();
    document.title = `${t(c.name)} · ${t(window.EMC_DATA.site.title)}`;
  }

  function render() {
    const root = document.getElementById("app");
    const route = parseRoute();
    document.documentElement.lang = getLang() === "en" ? "en" : "zh-CN";

    if (route.name === "country") {
      renderCountry(root, route.slug);
    } else {
      document.title =
        getLang() === "zh"
          ? window.EMC_DATA.site.title.zh
          : window.EMC_DATA.site.title.en;
      renderHome(root);
    }
  }

  window.addEventListener("hashchange", render);
  window.addEventListener("DOMContentLoaded", () => {
    const raw = (location.hash || "").replace(/^#/, "");
    const parts = raw.split("/").filter(Boolean);
    if (parts[0] === "country" && parts[1]) {
      const slug = decodeURIComponent(parts[1]);
      history.replaceState(
        null,
        "",
        `${location.pathname}${location.search}#/consumer/country/${encodeURIComponent(slug)}`
      );
      render();
      return;
    }
    if (!location.hash || location.hash === "#" || location.hash === "#/") {
      location.hash = HASH_HOME;
      return;
    }
    render();
  });
})();

