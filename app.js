import { createReliefLayer } from "./relief.js?v=4";
import { VolcanoSound } from "./sonification.js?v=10";
import unlocatedEruptions from "./unlocated-eruptions.js";
import { installSonificationHelp } from "./sonification-help.js?v=2";
import { installVolcanoSearch } from "./volcano-search.js";
import { recordMp4 } from "./mp4-export.js?v=3";
import volumeOn from "./vendor/lucide/volume-2.js";
import volumeOff from "./vendor/lucide/volume-x.js";
import infoIcon from "./vendor/lucide/info.js";

(() => {
  "use strict";

  const source = window.VOLCANIC_TIME_DATA;
  // Holocene only: the GVP Holocene list also holds a few records dated before
  // 9,700 BCE (11,700 years before 2000 CE), which are left out.
  const holoceneStart = -9700;
  const holoceneRows = source.eruptions.filter(row => row[5] >= holoceneStart);
  const eruptions = holoceneRows.map((row, index) => {
    const volcano = source.volcanoes[row[1]];
    return {
      idx: index, n: row[0], v: row[1], year: row[2], month: row[3], day: row[4], t: row[5],
      precision: row[6], dateModifier: row[7], uncertainty: row[8], vei: row[9],
      veiModifier: row[10], category: row[11], area: row[12], evidence: row[13],
      endYear: row[14], endMonth: row[15], endDay: row[16], name: volcano[0],
      country: volcano[1], region: volcano[2], type: volcano[3], tectonic: volcano[4],
      rock: volcano[5], lat: volcano[6], lon: volcano[7],
    };
  }).concat(unlocatedEruptions.filter(event => event.t >= holoceneStart)).sort((a, b) => a.t - b.t || a.n - b.n);
  eruptions.forEach((event, index) => { event.idx = index; });
  const meta = {
    ...source.meta,
    mappedEruptions: holoceneRows.length,
    knownVei: holoceneRows.filter(row => row[9] != null).length,
    dayPrecision: holoceneRows.filter(row => row[6] === 2).length,
  };
  const minYear = eruptions[0].t;
  const maxYear = eruptions[eruptions.length - 1].t + 1 / 365;
  const plateBoundaryUrl = "https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_boundaries.json";
  // Lava ramp from deep crimson to white: even lightness steps, kept clear of the blue map.
  const veiColors = ["#c52a38", "#c52a38", "#e93f2d", "#fa6e22", "#ff9625", "#ffbd34", "#f7e36d", "#fffced", "#ffffff"];
  const unknownColor = "#d8dfe6";
  const veiColor = vei => vei == null ? unknownColor : veiColors[Math.min(8, vei)];
  // Map linework. "colour" is the original look; "grey" leaves colour to the eruptions.
  const mapPalettes = {
    grey: {
      graticule: "rgba(200,206,212,.07)",
      land: [[0, "rgba(44,49,54,.96)"], [.42, "rgba(58,63,68,.96)"], [.72, "rgba(64,68,72,.94)"], [1, "rgba(40,45,50,.96)"]],
      sheen: [[0, "rgba(160,166,172,.14)"], [.55, "rgba(110,116,122,.05)"], [1, "rgba(20,24,28,0)"]],
      coast: "rgba(214,219,224,.2)", coastNoRelief: "rgba(214,219,224,.5)", coastWidth: 1, coastGlow: null,
      plates: "rgba(222,226,230,.3)", plateWidth: 1, plateGlow: null,
      exportLand: "#30353a", exportCoast: "rgba(214,219,224,.28)",
      halo: [[0, "rgba(255,255,255,.42)"], [.22, "rgba(230,234,238,.14)"], [1, "rgba(30,34,38,0)"]],
      haloRing: "rgba(226,230,234,.6)",
    },
    colour: {
      graticule: "rgba(122,184,255,.18)",
      land: [[0, "rgba(34,63,78,.96)"], [.42, "rgba(58,91,91,.96)"], [.72, "rgba(73,108,84,.94)"], [1, "rgba(31,53,66,.96)"]],
      sheen: [[0, "rgba(132,171,142,.22)"], [.55, "rgba(84,122,118,.08)"], [1, "rgba(18,31,42,0)"]],
      coast: "rgba(194,228,221,.34)", coastNoRelief: "rgba(194,228,221,.72)", coastWidth: 1.15, coastGlow: "rgba(84,135,152,.5)",
      plates: "rgba(214,232,248,.45)", plateWidth: 1.05, plateGlow: "rgba(122,184,255,.72)",
      exportLand: "#223d4d", exportCoast: "#83aeca",
      halo: [[0, "rgba(161,227,255,.5)"], [.22, "rgba(122,184,255,.18)"], [1, "rgba(36,60,84,0)"]],
      haloRing: "rgba(122,184,255,.72)",
    },
  };
  let mapPalette = mapPalettes.colour;
  const volcanoSummaries = new Map();
  for (const event of eruptions) {
    if (!Number.isFinite(event.lon) || !Number.isFinite(event.lat)) continue;
    const summary = volcanoSummaries.get(event.v) || { event, count: 0, maxVei: null };
    summary.count++;
    if (event.vei != null) summary.maxVei = summary.maxVei == null ? event.vei : Math.max(summary.maxVei, event.vei);
    summary.event = event;
    volcanoSummaries.set(event.v, summary);
  }
  // Highest VEI last, so large eruptions sit on top of their neighbours.
  const overviewSummaries = [...volcanoSummaries.values()].sort((a, b) => (a.maxVei ?? -1) - (b.maxVei ?? -1));
  const dotOutline = "rgba(6,9,12,.8)";

  function drawDot(ctx, x, y, radius, vei, alpha, outline = 1) {
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    if (vei == null) {
      // Unknown VEI is an open ring, so it never reads as a small eruption.
      const ring = Math.max(1.2, radius * .4);
      ctx.arc(x, y, radius - ring / 2, 0, Math.PI * 2);
      ctx.strokeStyle = dotOutline; ctx.lineWidth = ring + outline * 2; ctx.stroke();
      ctx.strokeStyle = unknownColor; ctx.lineWidth = ring; ctx.stroke();
      return;
    }
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = veiColors[Math.min(8, vei)];
    ctx.fill();
    ctx.strokeStyle = dotOutline;
    ctx.lineWidth = outline;
    ctx.stroke();
  }

  const mapCanvas = document.querySelector("#map");
  const mapCtx = mapCanvas.getContext("2d", { alpha: true });
  const leftStack = document.querySelector(".left-stack");
  const rightStack = document.querySelector(".right-stack");
  const mapActionBar = document.querySelector(".map-action-bar");
  const transport = document.querySelector(".transport");
  const statsPanel = document.querySelector(".stats");
  const browserPanel = document.querySelector(".browser-panel");
  const legendPanel = document.querySelector(".legend");
  const timelineCanvas = document.querySelector("#timeline");
  const timelineCtx = timelineCanvas.getContext("2d");
  const playButton = document.querySelector("#playButton");
  const scrubber = document.querySelector("#scrubber");
  const speedSelect = document.querySelector("#speedSelect");
  const modeButton = document.querySelector("#modeButton");
  const soundButton = document.querySelector("#soundButton");
  const soundVolume = document.querySelector("#soundVolume");
  const soundStatus = document.querySelector("#soundStatus");
  const sound = new VolcanoSound();
  // Select sound on now; create/resume the audio context only from a user gesture.
  sound.enabled = true;
  installSonificationHelp(document.querySelector('#sonificationHelp'), document.querySelector('#sonificationTooltip'));
  let soundRecovery = null;
  document.querySelector("#aboutButton").prepend(createIcon(infoIcon));
  const eventCard = document.querySelector("#eventCard");
  const aboutDialog = document.querySelector("#aboutDialog");
  const searchInput = document.querySelector("#searchInput");
  const veiFilter = document.querySelector("#veiFilter");
  const precisionFilter = document.querySelector("#precisionFilter");
  const resultsList = document.querySelector("#resultsList");
  const browserSummary = document.querySelector("#browserSummary");
  const countryList = document.querySelector("#countryList");
  const zoomInButton = document.querySelector("#zoomIn");
  const zoomOutButton = document.querySelector("#zoomOut");
  const resetMapButton = document.querySelector("#resetMap");
  const exportLogo = document.querySelector(".brand-logo");
  const exportStatus = document.querySelector("#exportStatus");
  const mp4Dialog = document.querySelector("#mp4Dialog");
  const mp4Sound = document.querySelector("#mp4Sound");
  let exporting = false;
  let exportAbort = null;
  const cancelExportButton = document.querySelector("#cancelExportButton");

  const schedule = [
    { from: minYear, to: 1500, rate: (1500 - minYear) / 60 },
    { from: 1500, to: 1800, rate: 300 / 22.5 },
    { from: 1800, to: 1950, rate: 150 / 30 },
    { from: 1950, to: 2000, rate: 50 / 30 },
    { from: 2000, to: maxYear, rate: (maxYear - 2000) / 30 },
  ].filter(segment => segment.to > segment.from);
  const totalNominalSeconds = schedule.reduce((sum, segment) => sum + (segment.to - segment.from) / segment.rate, 0);

  let world = null;
  const relief = createReliefLayer();
  let plateBoundaries = null;
  let landPaths = [];
  let plateBoundaryPaths = [];
  let width = 0;
  let height = 0;
  let dpr = 1;
  let playing = false;
  let eventMode = false;
  let eventBudget = 0;
  let reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let currentYear = minYear;
  let speed = Number(speedSelect.value);
  let lastFrame = performance.now();
  let eventIndex = 0;
  let activePulses = [];
  let recentEvents = [];
  let lastStatsUpdate = 0;
  let finalOverview = false;
  let timelineBins = [];
  let browserResults = [];
  let highlightedEvents = [];
  let countryRows = new Map();
  const defaultMapCenter = { lon: 0, lat: 0, zoom: 1 };
  let mapCenterLon = defaultMapCenter.lon;
  let mapCenterLat = defaultMapCenter.lat;
  let mapZoom = defaultMapCenter.zoom;
  let dragState = null;
  let suppressMapClick = false;

  function enhanceSelect(select) {
    const options = Array.from(select.options);
    const label = select.closest("label")?.querySelector("span")?.textContent || select.getAttribute("aria-label") || "Menu";
    const shell = document.createElement("div");
    const button = document.createElement("button");
    const list = document.createElement("div");
    const optionButtons = options.map(option => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "select-option";
      item.dataset.value = option.value;
      item.setAttribute("role", "option");
      item.textContent = option.textContent;
      list.appendChild(item);
      return item;
    });
    shell.className = "select-menu";
    button.type = "button";
    button.className = "select-trigger";
    button.setAttribute("aria-haspopup", "listbox");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", label);
    list.className = "select-list";
    list.setAttribute("role", "listbox");
    shell.append(button, list);
    select.classList.add("native-select");
    select.setAttribute("aria-hidden", "true");
    select.tabIndex = -1;
    select.after(shell);

    const close = () => {
      shell.classList.remove("open");
      button.setAttribute("aria-expanded", "false");
    };
    const refresh = () => {
      const selected = options.find(option => option.value === select.value) || options[0];
      button.textContent = selected.textContent;
      for (const item of optionButtons) {
        const active = item.dataset.value === select.value;
        item.classList.toggle("selected", active);
        item.setAttribute("aria-selected", String(active));
      }
    };
    button.addEventListener("click", event => {
      event.stopPropagation();
      document.querySelectorAll(".select-menu.open").forEach(menu => {
        if (menu !== shell) {
          menu.classList.remove("open");
          menu.querySelector(".select-trigger")?.setAttribute("aria-expanded", "false");
        }
      });
      const opened = shell.classList.toggle("open");
      button.setAttribute("aria-expanded", String(opened));
    });
    for (const item of optionButtons) {
      item.addEventListener("click", () => {
        select.value = item.dataset.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        refresh();
        close();
      });
    }
    select.addEventListener("change", refresh);
    document.addEventListener("click", close);
    document.addEventListener("keydown", event => { if (event.key === "Escape") close(); });
    refresh();
  }

  [veiFilter, precisionFilter, speedSelect].forEach(enhanceSelect);

  function segmentFor(year) {
    return schedule.find(segment => year < segment.to) || schedule[schedule.length - 1];
  }

  function clockRate(year) {
    return segmentFor(year).rate;
  }

  function yearToNominalSeconds(year) {
    let seconds = 0;
    for (const segment of schedule) {
      if (year >= segment.to) seconds += (segment.to - segment.from) / segment.rate;
      else if (year > segment.from) {
        seconds += (year - segment.from) / segment.rate;
        break;
      } else break;
    }
    return seconds;
  }

  function nominalSecondsToYear(seconds) {
    let remaining = Math.max(0, seconds);
    for (const segment of schedule) {
      const duration = (segment.to - segment.from) / segment.rate;
      if (remaining <= duration) return segment.from + remaining * segment.rate;
      remaining -= duration;
    }
    return maxYear;
  }

  function yearToProgress(year) {
    return yearToNominalSeconds(year) / totalNominalSeconds;
  }

  function progressToYear(progress) {
    return nominalSecondsToYear(progress * totalNominalSeconds);
  }

  function mapBounds(w = width, h = height) {
    const mobile = w <= 900;
    let leftPad = 18;
    let rightPad = 18;
    let topPad;
    let bottomPad;
    if (!mobile) {
      const gutter = clamp(w * 0.018, 22, 34);
      const leftEdge = leftStack?.getBoundingClientRect().right || clamp(w * 0.25, 328, 384);
      const rightEdge = rightStack ? w - rightStack.getBoundingClientRect().left : clamp(w * 0.22, 286, 342);
      leftPad = Math.ceil(leftEdge + gutter);
      rightPad = Math.ceil(rightEdge + gutter);
      topPad = Math.max(202, h * 0.23);
      const actionRect = mapActionBar?.getBoundingClientRect();
      const actionClearance = actionRect && actionRect.top > 0 ? Math.ceil(h - actionRect.top + 18) : 246;
      bottomPad = Math.max(246, actionClearance);
    } else {
      const statsRect = statsPanel?.getBoundingClientRect();
      const legendRect = legendPanel?.getBoundingClientRect();
      const topEdge = Math.max(statsRect?.bottom || 0, legendRect?.bottom || 0, h * 0.34);
      const browserVisible = browserPanel && getComputedStyle(browserPanel).display !== "none";
      const bottomAnchor = browserVisible ? browserPanel.getBoundingClientRect().top : mapActionBar?.getBoundingClientRect().top;
      topPad = Math.ceil(Math.max(h < 640 ? 232 : 294, topEdge + 14));
      bottomPad = bottomAnchor && bottomAnchor > 0 ? Math.ceil(h - bottomAnchor + 14) : 218;
    }
    const availableWidth = Math.max(260, w - leftPad - rightPad);
    const availableHeight = Math.max(mobile ? 60 : 180, h - topPad - bottomPad);
    const mapWidth = Math.min(availableWidth, availableHeight * 2.32);
    const mapHeight = Math.min(availableHeight, mapWidth * 0.46);
    return {
      left: leftPad + (availableWidth - mapWidth) / 2,
      top: topPad,
      mapWidth,
      mapHeight,
    };
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function wrapLongitude(lon) {
    return (lon % 360 + 360) % 360;
  }

  function signedLongitudeDelta(lon, center = mapCenterLon) {
    return ((lon - center + 540) % 360) - 180;
  }

  function project(lon, lat) {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return [NaN, NaN];
    const { left, top, mapWidth, mapHeight } = mapBounds();
    const scaleX = mapWidth * mapZoom;
    const scaleY = mapHeight * mapZoom;
    return [
      left + mapWidth / 2 + signedLongitudeDelta(lon) / 360 * scaleX,
      top + mapHeight / 2 + (mapCenterLat - lat) / 180 * scaleY,
    ];
  }

  function unproject(x, y) {
    const { left, top, mapWidth, mapHeight } = mapBounds();
    const lon = wrapLongitude(mapCenterLon + (x - (left + mapWidth / 2)) / (mapWidth * mapZoom) * 360);
    const lat = mapCenterLat - (y - (top + mapHeight / 2)) / (mapHeight * mapZoom) * 180;
    return { lon, lat: clamp(lat, -90, 90) };
  }

  function rebuildProjectedLayers() {
    rebuildLandPaths();
    rebuildPlateBoundaryPaths();
  }

  function clampMapCenter() {
    const maxLat = Math.max(0, 90 - 90 / mapZoom);
    mapCenterLat = clamp(mapCenterLat, -maxLat, maxLat);
    mapCenterLon = wrapLongitude(mapCenterLon);
  }

  function panMapByPixels(deltaX, deltaY) {
    const { mapWidth, mapHeight } = mapBounds();
    if (!mapWidth || !mapHeight) return;
    mapCenterLon -= deltaX / (mapWidth * mapZoom) * 360;
    mapCenterLat += deltaY / (mapHeight * mapZoom) * 180;
    clampMapCenter();
    rebuildProjectedLayers();
  }

  function zoomMap(nextZoom, anchorX = width / 2, anchorY = height / 2) {
    const { left, top, mapWidth, mapHeight } = mapBounds();
    if (!mapWidth || !mapHeight) return;
    const anchor = unproject(anchorX, anchorY);
    mapZoom = clamp(nextZoom, 1, 8);
    mapCenterLon = anchor.lon - (anchorX - (left + mapWidth / 2)) / (mapWidth * mapZoom) * 360;
    mapCenterLat = anchor.lat + (anchorY - (top + mapHeight / 2)) / (mapHeight * mapZoom) * 180;
    clampMapCenter();
    rebuildProjectedLayers();
  }

  function resetMapView() {
    mapCenterLon = defaultMapCenter.lon;
    mapCenterLat = defaultMapCenter.lat;
    mapZoom = defaultMapCenter.zoom;
    rebuildProjectedLayers();
  }

  function buildLinePath(coordinates) {
    const path = new Path2D();
    let previousX = null;
    const seamThreshold = mapBounds().mapWidth * mapZoom * .48;
    coordinates.forEach((point, index) => {
      const [x, y] = project(point[0], point[1]);
      if (index === 0 || previousX == null || Math.abs(x - previousX) > seamThreshold) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
      previousX = x;
    });
    return path;
  }

  function rebuildLandPaths() {
    landPaths = [];
    if (!world) return;
    for (const feature of world.features) {
      const geometry = feature.geometry;
      const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
      const path = new Path2D();
      for (const polygon of polygons) {
        for (const ring of polygon) {
          let previousX = null;
          let split = false;
          const seamThreshold = mapBounds().mapWidth * mapZoom * .48;
          ring.forEach((point, i) => {
            const [x, y] = project(point[0], point[1]);
            if (i === 0 || previousX == null || Math.abs(x - previousX) > seamThreshold) {
              path.moveTo(x, y);
              if (i !== 0) split = true;
            } else {
              path.lineTo(x, y);
            }
            previousX = x;
          });
          if (!split) path.closePath();
        }
      }
      landPaths.push(path);
    }
  }

  function rebuildPlateBoundaryPaths() {
    plateBoundaryPaths = [];
    if (!plateBoundaries) return;
    for (const feature of plateBoundaries.features || []) {
      const geometry = feature.geometry;
      if (!geometry) continue;
      const lines = geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates || [];
      for (const coordinates of lines) {
        if (coordinates?.length > 1) plateBoundaryPaths.push(buildLinePath(coordinates));
      }
    }
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    updateMapActionClearance();
    mapCanvas.width = Math.floor(width * dpr);
    mapCanvas.height = Math.floor(height * dpr);
    mapCanvas.style.width = `${width}px`;
    mapCanvas.style.height = `${height}px`;
    mapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const timelineRect = timelineCanvas.getBoundingClientRect();
    timelineCanvas.width = Math.max(1, Math.floor(timelineRect.width * dpr));
    timelineCanvas.height = Math.max(1, Math.floor(timelineRect.height * dpr));
    timelineCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    rebuildProjectedLayers();
    buildTimelineBins();
    drawTimeline();
  }

  function updateMapActionClearance() {
    const mobile = width <= 900;
    const transportRect = transport?.getBoundingClientRect();
    const actionGap = mobile ? 12 : 18;
    const actionBottom = transportRect ? height - transportRect.top + actionGap : mobile ? 152 : 190;
    document.documentElement.style.setProperty("--map-action-bottom", `${Math.ceil(actionBottom)}px`);

    if (!mobile) {
      document.documentElement.style.removeProperty("--browser-bottom");
      return;
    }

    const actionRect = mapActionBar?.getBoundingClientRect();
    const browserBottom = actionRect ? height - actionRect.top + 10 : actionBottom + 56;
    document.documentElement.style.setProperty("--browser-bottom", `${Math.ceil(browserBottom)}px`);
  }

  function drawBackground(ctx, w, h) {
    const gradient = ctx.createLinearGradient(0, 0, w, h);
    gradient.addColorStop(0, "#19171d");
    gradient.addColorStop(.25, "#42302b");
    gradient.addColorStop(.6, "#1b3345");
    gradient.addColorStop(1, "#0d1722");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  }

  function drawBaseMap() {
    mapCtx.clearRect(0, 0, width, height);
    drawBackground(mapCtx, width, height);

    const bounds = mapBounds();
    mapCtx.save();
    mapCtx.beginPath();
    mapCtx.rect(bounds.left, bounds.top, bounds.mapWidth, bounds.mapHeight);
    mapCtx.clip();

    relief.draw(mapCtx, bounds, mapCenterLon, mapCenterLat, mapZoom);

    const palette = mapPalette;
    mapCtx.lineWidth = 1;
    mapCtx.strokeStyle = palette.graticule;
    for (let lon = -180; lon <= 540; lon += 30) {
      const [x1, y1] = project(lon, -82);
      const [x2, y2] = project(lon, 82);
      mapCtx.beginPath(); mapCtx.moveTo(x1, y1); mapCtx.lineTo(x2, y2); mapCtx.stroke();
    }
    for (let lat = -60; lat <= 60; lat += 30) {
      const [, y1] = project(mapCenterLon, lat);
      const x1 = bounds.left, x2 = bounds.left + bounds.mapWidth;
      mapCtx.beginPath(); mapCtx.moveTo(x1, y1); mapCtx.lineTo(x2, y1); mapCtx.stroke();
    }

    const landGradient = mapCtx.createLinearGradient(bounds.left, bounds.top, bounds.left + bounds.mapWidth, bounds.top + bounds.mapHeight);
    for (const [stop, color] of palette.land) landGradient.addColorStop(stop, color);
    mapCtx.save();
    mapCtx.shadowColor = "rgba(2,8,14,.48)";
    mapCtx.shadowBlur = 14;
    mapCtx.shadowOffsetY = 5;
    mapCtx.fillStyle = landGradient;
    if (!relief.ready) for (const path of landPaths) mapCtx.fill(path);
    mapCtx.restore();

    const landSheen = mapCtx.createRadialGradient(
      bounds.left + bounds.mapWidth * .58, bounds.top + bounds.mapHeight * .32, 0,
      bounds.left + bounds.mapWidth * .58, bounds.top + bounds.mapHeight * .32, bounds.mapWidth * .68
    );
    for (const [stop, color] of palette.sheen) landSheen.addColorStop(stop, color);
    mapCtx.fillStyle = landSheen;
    if (!relief.ready) for (const path of landPaths) mapCtx.fill(path);

    mapCtx.strokeStyle = relief.ready ? palette.coast : palette.coastNoRelief;
    mapCtx.lineWidth = palette.coastWidth;
    for (const path of landPaths) mapCtx.stroke(path);

    if (palette.coastGlow) {
      mapCtx.save();
      mapCtx.globalAlpha = .28;
      mapCtx.strokeStyle = palette.coastGlow;
      mapCtx.lineWidth = 2.6;
      for (const path of landPaths) mapCtx.stroke(path);
      mapCtx.restore();
    }

    if (plateBoundaryPaths.length) {
      mapCtx.save();
      mapCtx.globalCompositeOperation = "source-over";
      mapCtx.strokeStyle = palette.plates;
      mapCtx.lineWidth = palette.plateWidth;
      mapCtx.setLineDash([5, 5]);
      for (const path of plateBoundaryPaths) mapCtx.stroke(path);
      mapCtx.setLineDash([]);
      if (palette.plateGlow) {
        mapCtx.globalAlpha = .32;
        mapCtx.strokeStyle = palette.plateGlow;
        mapCtx.lineWidth = 2.4;
        for (const path of plateBoundaryPaths) mapCtx.stroke(path);
      }
      mapCtx.restore();
    }
    mapCtx.restore();
  }

  function drawOverview() {
    mapCtx.save();
    mapCtx.globalCompositeOperation = "source-over";
    for (const summary of overviewSummaries) {
      const event = summary.event;
      const [x, y] = project(event.lon, event.lat);
      if (!pointInMap(x, y)) continue;
      const color = veiColor(summary.maxVei);
      const radius = Math.min(8, 2.3 + Math.sqrt(summary.count) * .33 + (summary.maxVei || 0) * .2);
      drawDot(mapCtx, x, y, radius, summary.maxVei, summary.maxVei == null ? .85 : .95);
      if ((summary.maxVei || 0) >= 6) {
        mapCtx.globalAlpha = .5;
        mapCtx.strokeStyle = color;
        mapCtx.lineWidth = 1;
        mapCtx.beginPath(); mapCtx.arc(x, y, radius + 3, 0, Math.PI * 2); mapCtx.stroke();
      }
    }
    mapCtx.restore();
  }

  function browserHasActiveFilter() {
    return Boolean(searchInput.value.trim()) || veiFilter.value !== "any" || precisionFilter.value !== "any";
  }

  function eventSearchText(event) {
    return [
      event.name, event.country, event.region, event.type, event.tectonic, event.rock,
      event.area, event.evidence, event.v, event.n, event.vei == null ? "vei unknown" : `vei ${event.vei}`,
    ].filter(Boolean).join(" ").toLowerCase();
  }

  function matchesBrowser(event) {
    const query = searchInput.value.trim().toLowerCase();
    if (volcanoSearch.selectedId !== null) {
      if (String(event.v) !== volcanoSearch.selectedId) return false;
    } else if (query && !eventSearchText(event).includes(query)) return false;
    if (veiFilter.value === "unknown") {
      if (event.vei != null) return false;
    } else if (veiFilter.value !== "any") {
      if (event.vei == null || event.vei < Number(veiFilter.value)) return false;
    }
    if (precisionFilter.value === "day" && event.precision !== 2) return false;
    if (precisionFilter.value === "month" && event.precision < 1) return false;
    if (precisionFilter.value === "year" && event.precision !== 0) return false;
    return true;
  }

  function pointInMap(x, y, padding = 5) {
    const { left, top, mapWidth, mapHeight } = mapBounds();
    return x >= left - padding && x <= left + mapWidth + padding && y >= top - padding && y <= top + mapHeight + padding;
  }

  function browserEventIsVisible(event) {
    return browserHasActiveFilter() && (finalOverview || event.t <= currentYear);
  }

  function drawBrowserHighlights() {
    if (!highlightedEvents.length) return;
    mapCtx.save();
    mapCtx.globalCompositeOperation = "source-over";
    for (const event of highlightedEvents) {
      if (!browserEventIsVisible(event)) continue;
      const [x, y] = project(event.lon, event.lat);
      if (!pointInMap(x, y)) continue;
      const color = veiColor(event.vei);
      const radius = 2.8 + (event.vei == null ? 0 : Math.min(6, event.vei) * .38);
      drawDot(mapCtx, x, y, radius, event.vei, browserHasActiveFilter() ? .95 : .6);
      if (browserHasActiveFilter()) {
        mapCtx.globalAlpha = .45;
        mapCtx.strokeStyle = color;
        mapCtx.lineWidth = 1;
        mapCtx.beginPath(); mapCtx.arc(x, y, radius + 3, 0, Math.PI * 2); mapCtx.stroke();
      }
    }
    mapCtx.restore();
  }

  function renderBrowser() {
    const filtered = eruptions.filter(matchesBrowser).sort((a, b) => activityTime(b) - activityTime(a) || b.t - a.t || b.n - a.n);
    browserResults = filtered;
    highlightedEvents = browserHasActiveFilter() ? filtered.slice(0, 450) : [];
    const limit = 70;
    const shown = filtered.slice(0, limit);
    const noun = filtered.length === 1 ? "eruption" : "eruptions";
    browserSummary.textContent = browserHasActiveFilter()
      ? `${filtered.length.toLocaleString()} matching ${noun}; first ${shown.length} shown.`
      : `Latest ${shown.length} known activity dates; use filters to narrow the catalog.`;
    resultsList.replaceChildren();
    for (const event of shown) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      const formatted = activityLabel(event);
      const name = document.createElement("span");
      const date = document.createElement("span");
      const meta = document.createElement("span");
      const vei = document.createElement("span");
      button.type = "button";
      button.className = "result-button";
      button.dataset.index = String(event.idx);
      name.className = "result-name";
      name.textContent = event.name;
      date.className = "result-date";
      date.textContent = formatted;
      meta.className = "result-meta";
      vei.className = "result-vei";
      vei.textContent = event.vei == null ? "VEI ?" : `VEI ${event.vei}`;
      meta.append(vei, [event.country, event.region].filter(Boolean).join(" · "));
      button.append(name, date, meta);
      item.appendChild(button);
      resultsList.appendChild(item);
    }
  }

  function drawPulse(pulse, now) {
    const life = reducedMotion ? 700 : 2500;
    const age = now - pulse.born;
    if (age > life) return false;
    const progress = age / life;
    const [x, y] = project(pulse.event.lon, pulse.event.lat);
    if (!pointInMap(x, y, 18)) return true;
    const vei = pulse.event.vei;
    const color = veiColor(vei);
    const base = 2.2 + (vei == null ? 1 : Math.pow(vei + 1, 0.9));
    const radius = reducedMotion ? base * 1.25 : base + progress * (8 + base * .8);
    const alpha = Math.pow(1 - progress, 1.5);

    mapCtx.save();
    mapCtx.globalCompositeOperation = "source-over";
    const halo = mapCtx.createRadialGradient(x, y, 0, x, y, base * 3.8);
    for (const [stop, tint] of mapPalette.halo) halo.addColorStop(stop, tint);
    mapCtx.globalAlpha = Math.min(.26, alpha * .32);
    mapCtx.fillStyle = halo;
    mapCtx.beginPath(); mapCtx.arc(x, y, base * 2.25, 0, Math.PI * 2); mapCtx.fill();

    mapCtx.globalAlpha = Math.min(.24, alpha * .28);
    mapCtx.strokeStyle = mapPalette.haloRing;
    mapCtx.lineWidth = .8;
    mapCtx.beginPath(); mapCtx.arc(x, y, radius * .74, 0, Math.PI * 2); mapCtx.stroke();

    mapCtx.globalAlpha = alpha * (pulse.event.precision === 0 ? .62 : .92);
    mapCtx.strokeStyle = color;
    mapCtx.lineWidth = pulse.event.precision === 0 ? 1.1 : 1.6;
    if (pulse.event.precision === 0) mapCtx.setLineDash([3, 5]);
    mapCtx.beginPath(); mapCtx.arc(x, y, radius, 0, Math.PI * 2); mapCtx.stroke();
    mapCtx.setLineDash([]);
    drawDot(mapCtx, x, y, Math.max(2.6, base * .5), vei, Math.min(1, alpha + .2));
    mapCtx.restore();
    return true;
  }

  function formatYear(year) {
    const rounded = Math.floor(year);
    return rounded <= 0 ? { value: rounded === 0 ? 1 : Math.abs(rounded), era: "BCE" } : { value: rounded, era: "CE" };
  }

  function updateReadout() {
    if (finalOverview) {
      document.querySelector("#year").textContent = "ALL";
      document.querySelector("#era").textContent = `${Math.abs(Math.floor(minYear)).toLocaleString()} BCE — ${Math.floor(maxYear)} CE`;
      document.querySelector("#dateDetail").textContent = `${eruptions.length.toLocaleString()} records · ${meta.mappedEruptions.toLocaleString()} mapped`;
      document.querySelector("#rateLabel").textContent = "Complete catalog";
      scrubber.value = 10000;
      return;
    }
    const formatted = formatYear(currentYear);
    document.querySelector("#year").textContent = formatted.value.toLocaleString("en-GB", { useGrouping: false });
    document.querySelector("#era").textContent = formatted.era;
    const rate = clockRate(currentYear) * speed;
    let label;
    if (rate >= 10) label = `${Math.round(rate)} years / sec`;
    else if (rate >= 1) label = `${rate.toFixed(1)} years / sec`;
    else label = `${Math.round(rate * 365)} days / sec`;
    document.querySelector("#rateLabel").textContent = eventMode ? `${Math.round(12 * speed)} events / sec` : label;
    document.querySelector("#dateDetail").textContent = playing ? "catalog playback" : (currentYear <= minYear + 1 ? "earliest cataloged records" : "paused");
    scrubber.value = Math.round(yearToProgress(currentYear) * 10000);
  }

  function lowerBound(time) {
    let low = 0, high = eruptions.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (eruptions[mid].t < time) low = mid + 1; else high = mid;
    }
    return low;
  }

  function resetTo(year) {
    sound.stop();
    finalOverview = false;
    currentYear = Math.max(minYear, Math.min(maxYear, year));
    eventIndex = lowerBound(currentYear);
    eventBudget = 0;
    activePulses = [];
    recentEvents = [];
    updateReadout();
    drawTimeline();
    updateCountryRanking();
  }

  function createIcon(paths) {
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const [key, value] of Object.entries({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) icon.setAttribute(key, value);
    for (const [tag, attributes] of paths) {
      const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
      for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
      icon.appendChild(element);
    }
    return icon;
  }

  function updateSoundControls(message = "") {
    const enabled = sound.enabled;
    const label = enabled ? "Mute eruption sound" : "Enable eruption sound";
    soundButton.setAttribute("aria-pressed", String(enabled));
    soundButton.setAttribute("aria-label", label);
    soundButton.title = message || label;
    soundButton.replaceChildren(createIcon(enabled ? volumeOn : volumeOff));
    soundStatus.textContent = message || (enabled ? "Eruption sound on" : "Eruption sound muted");
  }

  function handleSoundError(error) {
    sound.setEnabled(false);
    updateSoundControls(error.message || "Audio unavailable; tap Sound to retry");
  }

  function recoverSound() {
    if (soundRecovery) return;
    updateSoundControls("Restoring interrupted audio");
    document.querySelector("#dateDetail").textContent = "Restoring audio";
    soundRecovery = sound.resume().then(() => {
      updateSoundControls();
      updateReadout();
    }).catch(() => {
      if (!sound.enabled || !sound.volume) return;
      setPlaying(false, "Resume timeline");
      updateSoundControls("Audio interrupted; press Play to resume");
      document.querySelector("#dateDetail").textContent = "Press Play to resume audio";
    }).finally(() => { soundRecovery = null; });
  }

  function addEventsThrough(targetYear, now, elapsed) {
    const frameEvents = [];
    let nextIndex = eventIndex;
    while (nextIndex < eruptions.length && eruptions[nextIndex].t <= targetYear) {
      frameEvents.push(eruptions[nextIndex++]);
    }
    try {
      sound.playEvents(frameEvents, mapCenterLon, mapZoom, {
        fromYear: currentYear, toYear: targetYear, duration: elapsed,
        ...(!eventMode ? { offsetFor: event => (yearToNominalSeconds(event.t) - yearToNominalSeconds(currentYear)) / speed } : {}),
      });
    } catch (error) {
      setPlaying(false, "Resume timeline");
      handleSoundError(error);
      return false;
    }
    eventIndex = nextIndex;
    for (const event of frameEvents) {
      activePulses.push({ event, born: now });
      recentEvents.push(event);
    }
    if (recentEvents.length > 260) recentEvents.splice(0, recentEvents.length - 260);
    return true;
  }

  function makeCountryRow(country) {
    const row = document.createElement("li");
    const rank = document.createElement("span");
    const name = document.createElement("span");
    const bar = document.createElement("span");
    const label = document.createElement("span");
    const count = document.createElement("span");
    row.className = "country-row";
    rank.className = "country-rank";
    name.className = "country-name";
    bar.className = "country-bar";
    label.className = "country-label";
    count.className = "country-count";
    label.textContent = country;
    name.append(bar, label, count);
    row.append(rank, name);
    countryList.appendChild(row);
    return { row, rank, label, count, bar };
  }

  function updateCountryRanking() {
    const rowStep = 18;
    const capacity = Math.max(0, Math.floor((countryList.getBoundingClientRect().height + 1) / rowStep));
    const limit = finalOverview ? eruptions.length : lowerBound(currentYear + .0001);
    const counts = new Map();
    for (let i = 0; i < limit; i++) {
      if (!Number.isFinite(eruptions[i].lon) || !Number.isFinite(eruptions[i].lat)) continue;
      const country = eruptions[i].country || "Unknown";
      counts.set(country, (counts.get(country) || 0) + 1);
    }
    const ranked = [...counts]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, capacity);
    const maxCount = ranked[0]?.[1] || 1;
    const active = new Set();
    ranked.forEach(([country, value], index) => {
      active.add(country);
      const entry = countryRows.get(country) || makeCountryRow(country);
      countryRows.set(country, entry);
      entry.row.style.setProperty("--y", `${index * rowStep}px`);
      entry.row.style.setProperty("--o", "1");
      entry.row.removeAttribute("aria-hidden");
      entry.row.setAttribute("aria-label", `${index + 1}. ${country}, ${value.toLocaleString()} recorded eruptions`);
      entry.rank.textContent = `${index + 1}`;
      entry.label.textContent = country;
      entry.count.textContent = value.toLocaleString();
      entry.bar.style.setProperty("--w", `${Math.max(5, value / maxCount * 100)}%`);
    });
    for (const [country, entry] of countryRows) {
      if (active.has(country)) continue;
      entry.row.style.setProperty("--o", "0");
      entry.row.style.setProperty("--y", `${capacity * rowStep}px`);
      entry.row.setAttribute("aria-hidden", "true");
    }
  }

  function updateStats(now) {
    if (now - lastStatsUpdate < 350) return;
    lastStatsUpdate = now;
    if (finalOverview) {
      document.querySelector("#visibleCount").textContent = meta.mappedEruptions.toLocaleString();
      document.querySelector("#largestRecent").textContent = `VEI ${Math.max(...eruptions.filter(event => event.vei != null).map(event => event.vei))}`;
      document.querySelector("#datePrecisionStat").textContent = `${meta.dayPrecision.toLocaleString()} day-dated`;
      updateCountryRanking();
      return;
    }
    const windowStart = currentYear - Math.max(10, clockRate(currentYear) * 3);
    const start = lowerBound(windowStart);
    const end = lowerBound(currentYear + .0001);
    const windowEvents = eruptions.slice(start, end);
    document.querySelector("#visibleCount").textContent = windowEvents.length.toLocaleString();
    const known = windowEvents.filter(event => event.vei != null);
    const max = known.length ? Math.max(...known.map(event => event.vei)) : null;
    document.querySelector("#largestRecent").textContent = max == null ? "—" : `VEI ${max}`;
    const day = windowEvents.filter(event => event.precision === 2).length;
    const month = windowEvents.filter(event => event.precision === 1).length;
    const year = windowEvents.filter(event => event.precision === 0).length;
    document.querySelector("#datePrecisionStat").textContent = windowEvents.length ? `${day} day · ${month} month · ${year} year` : "No event in window";
    updateCountryRanking();
  }

  function setPlaying(nextPlaying, label = "Play timeline", finishTails = false) {
    playing = nextPlaying;
    if (finishTails) sound.playing = false;
    else sound.setPlaying(playing);
    playButton.textContent = playing ? "Ⅱ" : "▶";
    playButton.setAttribute("aria-label", playing ? "Pause timeline" : label);
    updateReadout();
  }

  function tick(now) {
    const elapsed = Math.min(.1, (now - lastFrame) / 1000);
    lastFrame = now;
    const audioReady = !sound.enabled || !sound.volume || sound.context?.state === "running";
    if (playing && !audioReady) recoverSound();
    if (playing && audioReady) {
      if (eventMode) {
        eventBudget += 12 * speed * elapsed;
        const count = Math.floor(eventBudget);
        if (count) {
          eventBudget -= count;
          const nextIndex = Math.min(eruptions.length - 1, eventIndex + count - 1);
          const target = eruptions[nextIndex]?.t ?? maxYear;
          if (addEventsThrough(target, now, elapsed)) currentYear = target;
        }
      } else {
        const target = nominalSecondsToYear(yearToNominalSeconds(currentYear) + speed * elapsed);
        if (addEventsThrough(target, now, elapsed)) currentYear = target;
      }
      if (currentYear >= maxYear || eventIndex >= eruptions.length) {
        currentYear = maxYear;
        setPlaying(false, "Replay timeline", true);
        finalOverview = true;
      }
      updateReadout();
      drawTimeline();
    }
    drawBaseMap();
    if (finalOverview) drawOverview();
    drawBrowserHighlights();
    activePulses = activePulses.filter(pulse => drawPulse(pulse, now));
    updateStats(now);
    requestAnimationFrame(tick);
  }

  function buildTimelineBins() {
    const rect = timelineCanvas.getBoundingClientRect();
    const w = rect.width;
    timelineBins = new Array(Math.max(80, Math.floor(w / 4))).fill(0);
    for (const event of eruptions) {
      const i = Math.min(timelineBins.length - 1, Math.max(0, Math.floor(yearToProgress(event.t) * timelineBins.length)));
      timelineBins[i]++;
    }
  }

  function drawTimeline() {
    const rect = timelineCanvas.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    if (!w || !h || !timelineBins.length) return;
    timelineCtx.clearRect(0, 0, w, h);
    const peak = Math.max(...timelineBins.map(value => Math.log1p(value)));
    timelineBins.forEach((value, i) => {
      const bar = peak ? Math.log1p(value) / peak * (h - 10) : 0;
      const x = i / timelineBins.length * w;
      timelineCtx.fillStyle = "rgba(113,144,167,.35)";
      timelineCtx.fillRect(x, h - bar, Math.max(1, w / timelineBins.length - .4), bar);
    });
    const progress = finalOverview ? 1 : yearToProgress(currentYear);
    timelineCtx.fillStyle = "rgba(255,113,75,.12)";
    timelineCtx.fillRect(0, 0, progress * w, h);
    timelineCtx.strokeStyle = "#e08a3c";
    timelineCtx.lineWidth = 1.5;
    timelineCtx.beginPath(); timelineCtx.moveTo(progress * w, 0); timelineCtx.lineTo(progress * w, h); timelineCtx.stroke();
  }

  function dateValue(year, month, day) {
    if (year == null) return null;
    const monthIndex = month ? month - 1 : 0;
    const dayIndex = day ? day - 1 : 0;
    return year + monthIndex / 12 + dayIndex / 365;
  }

  function activityTime(event) {
    return dateValue(event.endYear, event.endMonth, event.endDay) ?? event.t;
  }

  function datePartsLabel(year, month, day, modifier = "") {
    const formatted = formatYear(year);
    const months = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const pieces = [];
    if (day) pieces.push(String(day));
    if (month) pieces.push(months[month]);
    pieces.push(String(formatted.value), formatted.era);
    return `${modifier ? modifier + " " : ""}${pieces.join(" ")}`;
  }

  function dateLabel(event) {
    return datePartsLabel(event.year, event.month, event.day, event.dateModifier);
  }

  function endDateLabel(event) {
    if (event.endYear == null) return "";
    return datePartsLabel(event.endYear, event.endMonth, event.endDay);
  }

  function activityLabel(event) {
    const start = dateLabel(event);
    const end = endDateLabel(event);
    if (!end || activityTime(event) <= event.t + .002) return start;
    return `${start} → through ${end}`;
  }

  function showEvent(event) {
    const color = veiColor(event.vei);
    const badge = document.querySelector("#eventVei");
    badge.textContent = event.vei == null ? "VEI UNKNOWN" : `VEI ${event.vei}${event.veiModifier || ""}`;
    badge.style.color = color;
    document.querySelector("#eventName").textContent = event.name;
    document.querySelector("#eventPlace").textContent = [event.country, event.area].filter(Boolean).join(" · ");
    const uncertainty = event.precision === 2 ? "Known to day" : event.precision === 1 ? "Known to month" : "Known to year only";
    const rows = [
      ["Start", dateLabel(event)],
      ...(endDateLabel(event) ? [["End/latest", endDateLabel(event)]] : []),
      ["Precision", event.uncertainty ? `${uncertainty} (±${event.uncertainty})` : uncertainty],
      ["Evidence", event.evidence || "Not reported"],
      ["Volcano type", event.type || "Not reported"],
      ["Tectonic setting", event.tectonic || "Not reported"],
      ["Dominant rock", event.rock || "Not reported"],
    ];
    const details = document.querySelector("#eventDetails");
    details.replaceChildren();
    for (const [term, value] of rows) {
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = term;
      dd.textContent = value;
      details.append(dt, dd);
    }
    document.querySelector("#gvpLink").href = Number.isFinite(event.v) ? `https://volcano.si.edu/volcano.cfm?vn=${event.v}` : 'https://volcano.si.edu/';
    eventCard.hidden = false;
  }

  function nearestRecentEvent(clientX, clientY) {
    if (!pointInMap(clientX, clientY, 0)) return null;
    let nearest = null, distance = 28;
    const candidates = browserHasActiveFilter() && highlightedEvents.length
      ? highlightedEvents.filter(browserEventIsVisible)
      : finalOverview ? [...volcanoSummaries.values()].map(summary => summary.event) : recentEvents.slice(-160);
    for (const event of candidates) {
      const [x, y] = project(event.lon, event.lat);
      const d = Math.hypot(x - clientX, y - clientY);
      if (d < distance) { nearest = event; distance = d; }
    }
    return nearest;
  }

  function exportView() {
    return { lon: mapCenterLon, lat: mapCenterLat, zoom: mapZoom };
  }

  function clipExportMap(ctx, w, h) {
    ctx.beginPath();
    ctx.rect(w * .04, h * .12, w * .92, Math.min(h * .66, w * .92 * .46));
    ctx.clip();
  }

  function exportPoint(lon, lat, w, h, view) {
    const mapWidth = w * .92;
    const mapHeight = Math.min(h * .66, mapWidth * .46);
    const mapLeft = (w - mapWidth) / 2;
    const mapTop = h * .12;
    return [
      mapLeft + mapWidth / 2 + signedLongitudeDelta(lon, view.lon) / 360 * mapWidth * view.zoom,
      mapTop + mapHeight / 2 + (view.lat - lat) / 180 * mapHeight * view.zoom,
    ];
  }

  function drawExportLine(ctx, coordinates, w, h, view) {
    let previousX = null;
    const seamThreshold = w * .42 * view.zoom;
    coordinates.forEach((point, index) => {
      const p = exportPoint(point[0], point[1], w, h, view);
      if (index === 0 || previousX == null || Math.abs(p[0] - previousX) > seamThreshold) ctx.moveTo(...p);
      else ctx.lineTo(...p);
      previousX = p[0];
    });
  }

  function drawExportBase(ctx, w, h, view) {
    drawBackground(ctx, w, h);
    ctx.save();
    clipExportMap(ctx, w, h);
    const reliefWidth = w * .92;
    relief.draw(ctx, {
      left: (w - reliefWidth) / 2,
      top: h * .12,
      mapWidth: reliefWidth,
      mapHeight: Math.min(h * .66, reliefWidth * .46),
    }, view.lon, view.lat, view.zoom);
    ctx.strokeStyle = mapPalette.graticule;
    ctx.lineWidth = 1;
    for (let lon = -150; lon <= 150; lon += 30) {
      const a = exportPoint(lon, -82, w, h, view), b = exportPoint(lon, 82, w, h, view);
      ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
    }
    for (let lat = -60; lat <= 60; lat += 30) {
      const a = exportPoint(-180, lat, w, h, view), b = exportPoint(180, lat, w, h, view);
      ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
    }
    if (!world) { ctx.restore(); return; }
    ctx.fillStyle = mapPalette.exportLand;
    ctx.strokeStyle = mapPalette.exportCoast;
    ctx.lineWidth = .8;
    for (const feature of world.features) {
      const geometry = feature.geometry;
      const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
      ctx.beginPath();
      for (const polygon of polygons) {
        for (const ring of polygon) {
          let previousX = null;
          ring.forEach((point, i) => {
            const p = exportPoint(point[0], point[1], w, h, view);
            if (i === 0 || previousX == null || Math.abs(p[0] - previousX) > w * .42) ctx.moveTo(...p);
            else ctx.lineTo(...p);
            previousX = p[0];
          });
        }
      }
      if (!relief.ready) ctx.fill();
      ctx.stroke();
    }
    if (plateBoundaries) {
      ctx.save();
      ctx.strokeStyle = mapPalette.plates;
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      for (const feature of plateBoundaries.features || []) {
        const geometry = feature.geometry;
        if (!geometry) continue;
        const lines = geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates || [];
        for (const coordinates of lines) {
          ctx.beginPath();
          drawExportLine(ctx, coordinates, w, h, view);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function drawExportOverview(ctx, w, h, view) {
    ctx.save();
    clipExportMap(ctx, w, h);
    ctx.globalCompositeOperation = "source-over";
    for (const summary of overviewSummaries) {
      const p = exportPoint(summary.event.lon, summary.event.lat, w, h, view);
      const radius = Math.min(8.5, 2.4 + Math.sqrt(summary.count) * .34 + (summary.maxVei || 0) * .2);
      drawDot(ctx, p[0], p[1], radius, summary.maxVei, summary.maxVei == null ? .85 : .95);
    }
    ctx.restore();
  }

  // One-line VEI key in the gap between the map and the credit lines.
  function drawExportKey(ctx, w, h) {
    const size = Math.round(w * .0105);
    const r = w * .0042;
    const y = h * .12 + Math.min(h * .66, w * .92 * .46) + h * .035;
    let x = w * .04;
    ctx.save();
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#c4ced8";
    ctx.font = `600 ${size}px system-ui, sans-serif`;
    ctx.fillText("VEI", x, y);
    x += ctx.measureText("VEI").width + w * .012;
    ctx.font = `400 ${size}px system-ui, sans-serif`;
    for (const [label, vei] of [["Unknown", null], ["0–1", 0], ["2", 2], ["3", 3], ["4", 4], ["5", 5], ["6", 6], ["7–8", 7]]) {
      drawDot(ctx, x + r, y, r, vei, 1, w / 1920);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#c4ced8";
      ctx.fillText(label, x + r * 2 + w * .004, y);
      x += r * 2 + w * .004 + ctx.measureText(label).width + w * .014;
    }
    if (plateBoundaries) {
      const dash = 5 * w / 1920;
      x += w * .006;
      ctx.strokeStyle = mapPalette.plates;
      ctx.lineWidth = Math.max(1, w / 1600);
      ctx.setLineDash([dash, dash]);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w * .022, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillText("Plate boundaries", x + w * .028, y);
    }
    ctx.restore();
  }

  function drawExportLabels(ctx, w, h, title, detail) {
    drawExportKey(ctx, w, h);
    ctx.save();
    ctx.fillStyle = "#f0f5fb";
    ctx.font = `600 ${Math.round(w * .028)}px system-ui, sans-serif`;
    ctx.fillText(title, w * .04, h * .09, w * .92);
    ctx.fillStyle = "#8fa1b2";
    const creditSize = Math.max(11, Math.round(w * .012));
    ctx.font = `400 ${creditSize}px system-ui, sans-serif`;
    ctx.fillText(detail, w * .04, h * .875, w * .64);
    ctx.fillText("Smithsonian GVP · VOTW 5.3.5 / 5.4.0", w * .04, h * .94, w * .64);
    // Author credit in the same style, on the GVP line, flush with the map's right edge.
    const credit = "ECP Breard";
    const creditX = w * .96 - ctx.measureText(credit).width;
    ctx.fillText(credit, creditX, h * .94);
    const logoSize = h * .08;
    const logoX = creditX - w * .01 - logoSize;
    const logoY = h * .94 - creditSize * .36 - logoSize / 2;
    const ratio = Math.min(logoSize / exportLogo.naturalWidth, logoSize / exportLogo.naturalHeight);
    const logoW = exportLogo.naturalWidth * ratio, logoH = exportLogo.naturalHeight * ratio;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(exportLogo, logoX + (logoSize - logoW) / 2, logoY + (logoSize - logoH) / 2, logoW, logoH);
    ctx.restore();
  }

  function finalExportCanvas(w = 1920, h = 1080, view = exportView()) {
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    drawExportBase(ctx, w, h, view);
    drawExportOverview(ctx, w, h, view);
    drawExportLabels(ctx, w, h, "ALL CONFIRMED HOLOCENE ERUPTIONS", `${meta.mappedEruptions.toLocaleString()} eruptions · ${volcanoSummaries.size.toLocaleString()} volcanoes · colour shows maximum recorded VEI`);
    return canvas;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = filename;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function exportPng() {
    if (exporting) return;
    const button = document.querySelector("#pngButton");
    const view = exportView();
    setExportBusy(true);
    button.textContent = "Rendering…";
    try {
      await prepareExport();
      const canvas = finalExportCanvas(1920, 1080, view);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("PNG could not be created. Please retry.");
      downloadBlob(blob, "volcanic-time-all-eruptions.png");
      exportStatus.textContent = "Full HD PNG exported with ECP Breard logo and credit.";
    } catch (error) {
      reportExportError(button, error);
    } finally {
      setExportBusy(false);
    }
  }

  function setExportBusy(busy) {
    exporting = busy;
    for (const [id, label, format] of [["pngButton", "Export PNG", "PNG"], ["gifButton", "Export GIF", "GIF"], ["mp4Button", "Export MP4", "MP4"]]) {
      const button = document.getElementById(id);
      button.disabled = busy;
      if (busy) button.title = "";
      if (!busy) button.textContent = button.title ? `Retry ${format}` : label;
    }
    if (busy) exportStatus.textContent = "Preparing export…";
  }

  function createExportAnimation(canvas, view, nominalTiming = false) {
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const base = document.createElement("canvas"); base.width = w; base.height = h;
    drawExportBase(base.getContext("2d"), w, h, view);
    let index = 0, active = [], previousYear = minYear, previousElapsed = 0;
    return (progress, elapsed, final) => {
      const year = progressToYear(progress);
      const events = [];
      while (index < eruptions.length && eruptions[index].t <= year) {
        const event = eruptions[index++];
        events.push(event);
        active.push({ event, born: elapsed });
      }
      ctx.drawImage(base, 0, 0);
      if (final) {
        drawExportOverview(ctx, w, h, view);
        drawExportLabels(ctx, w, h, "ALL ERUPTIONS", `${meta.mappedEruptions.toLocaleString()} confirmed eruptions · colour shows maximum VEI`);
      } else {
        ctx.save();
        clipExportMap(ctx, w, h);
        for (const pulse of active) {
          if (!Number.isFinite(pulse.event.lon) || !Number.isFinite(pulse.event.lat)) continue;
          const age = (elapsed - pulse.born) / .09;
          if (age >= 7) continue;
          const p = exportPoint(pulse.event.lon, pulse.event.lat, w, h, view);
          const color = veiColor(pulse.event.vei);
          const scale = w / 640;
          const radius = (1.5 + (pulse.event.vei || 1) * .28 + age * 1.25) * scale;
          const fade = Math.max(0, 1 - age / 7);
          ctx.globalAlpha = fade * .75;
          ctx.strokeStyle = color; ctx.lineWidth = 1.1 * scale;
          ctx.beginPath(); ctx.arc(p[0], p[1], radius, 0, Math.PI * 2); ctx.stroke();
          drawDot(ctx, p[0], p[1], 1.9 * scale, pulse.event.vei, Math.min(1, fade * 1.2), .6 * scale);
        }
        ctx.restore();
        const label = formatYear(year);
        drawExportLabels(ctx, w, h, `${label.value} ${label.era}`, "Confirmed Holocene eruptions · colour shows VEI");
      }
      active = active.filter(pulse => elapsed - pulse.born < .63).slice(-700);
      const timing = { fromYear: previousYear, toYear: year, duration: elapsed - previousElapsed };
      if (nominalTiming) {
        const fromSeconds = yearToNominalSeconds(previousYear);
        timing.offsetFor = event => yearToNominalSeconds(event.t) - fromSeconds;
      }
      previousYear = year;
      previousElapsed = elapsed;
      return { events, timing };
    };
  }

  async function exportMp4() {
    if (exporting) return;
    const button = document.querySelector("#mp4Button");
    const view = exportView();
    const recordingSound = mp4Sound.checked ? new VolcanoSound() : null;
    setPlaying(false);
    exportAbort = new AbortController();
    setExportBusy(true);
    cancelExportButton.hidden = false;
    button.textContent = "MP4…";
    resize();
    try {
      // Initialize audio directly from the export gesture, before loading assets.
      if (recordingSound) {
        recordingSound.setVolume(sound.volume > 0 ? sound.volume : .45);
        await recordingSound.setEnabled(true);
      }
      await prepareExport();
      exportAbort.signal.throwIfAborted();
      const canvas = document.createElement("canvas"); canvas.width = 1920; canvas.height = 1080;
      exportStatus.textContent = recordingSound ? "Recording MP4 at 1x with sonification." : "Recording silent MP4 at 1x.";
      const blob = await recordMp4({
        canvas, view, audio: recordingSound, signal: exportAbort.signal, duration: totalNominalSeconds,
        renderFrame: createExportAnimation(canvas, view, true),
        onProgress: percent => { button.textContent = `MP4 ${percent}%`; },
      });
      downloadBlob(blob, `volcanic-time-hd-1x-${recordingSound ? "sound" : "silent"}.mp4`);
      exportStatus.textContent = `Full HD MP4 exported at 1x ${recordingSound ? "with sonification" : "without audio"}, ECP Breard logo and credit.`;
    } catch (error) {
      if (error.name === "AbortError") exportStatus.textContent = "MP4 export cancelled.";
      else reportExportError(button, error);
    } finally {
      try { await recordingSound?.dispose(); }
      finally {
        exportAbort = null;
        cancelExportButton.hidden = true;
        setExportBusy(false);
        resize();
      }
    }
  }

  async function prepareExport() {
    setPlaying(false);
    await document.fonts?.ready;
    try { await exportLogo.decode(); }
    catch { throw new Error("The logo could not load. Reload the page and retry."); }
    if (!relief.ready) await relief.load();
  }

  function reportExportError(button, error) {
    button.title = error.message || "Export failed. Please retry.";
    exportStatus.textContent = button.title;
  }

  function gifWorkerRequest(worker, message, transfer = []) {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onError);
        worker.removeEventListener("messageerror", onError);
      };
      const onMessage = event => {
        cleanup();
        if (event.data.error) reject(new Error(event.data.error));
        else resolve(event.data);
      };
      const onError = () => { cleanup(); reject(new Error("GIF encoding failed. Please retry.")); };
      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", onError);
      worker.addEventListener("messageerror", onError);
      try { worker.postMessage(message, transfer); }
      catch (error) { cleanup(); reject(error); }
    });
  }

  async function exportGif() {
    if (exporting) return;
    const button = document.querySelector("#gifButton");
    const view = exportView();
    setExportBusy(true);
    button.textContent = "GIF 0%";
    let worker;
    try {
      await prepareExport();
      const w = 1920, h = 1080, frames = 72;
      const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const renderFrame = createExportAnimation(canvas, view);
      // One shared palette avoids flickering relief colours between frames.
      const sampleCanvas = document.createElement("canvas"); sampleCanvas.width = 480; sampleCanvas.height = 270;
      const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
      sampleCtx.drawImage(finalExportCanvas(w, h, view), 0, 0, 480, 270);
      const sample = sampleCtx.getImageData(0, 0, 480, 270).data;
      worker = new Worker(new URL("./gif-worker.js?v=1", import.meta.url), { type: "module" });
      await gifWorkerRequest(worker, { type: "start", sample, colors: [...veiColors, unknownColor] }, [sample.buffer]);
      for (let frame = 0; frame < frames; frame++) {
        const final = frame === frames - 1;
        const progress = final ? 1 : frame / (frames - 2);
        renderFrame(progress, frame * .09, final);
        const image = ctx.getImageData(0, 0, w, h);
        await gifWorkerRequest(worker, { type: "frame", pixels: image.data, width: w, height: h, delay: final ? 1800 : 90 }, [image.data.buffer]);
        button.textContent = `GIF ${Math.round((frame + 1) / frames * 100)}%`;
      }
      const result = await gifWorkerRequest(worker, { type: "finish" });
      downloadBlob(new Blob([result.bytes], { type: "image/gif" }), "volcanic-time-hd.gif");
      exportStatus.textContent = "Full HD GIF exported with ECP Breard logo and credit. GIF has no audio.";
    } catch (error) {
      reportExportError(button, error);
    } finally {
      worker?.terminate();
      setExportBusy(false);
    }
  }

  playButton.addEventListener("click", async event => {
    event.preventDefault();
    if (playing) {
      setPlaying(false);
      return;
    }
    playButton.disabled = true;
    soundButton.disabled = true;
    playButton.setAttribute("aria-busy", "true");
    try {
      if (sound.enabled) {
        updateSoundControls("Loading drums and soft piano");
        await sound.setEnabled(true);
        updateSoundControls();
      }
      if (document.hidden) return;
      if (currentYear >= maxYear - .01) resetTo(minYear);
      setPlaying(true);
    } catch (error) {
      handleSoundError(error);
    } finally {
      playButton.disabled = false;
      soundButton.disabled = false;
      playButton.removeAttribute("aria-busy");
    }
  });

  scrubber.addEventListener("input", () => {
    const targetYear = progressToYear(Number(scrubber.value) / 10000);
    setPlaying(false);
    resetTo(targetYear);
  });
  speedSelect.addEventListener("change", () => { speed = Number(speedSelect.value); updateReadout(); });
  modeButton.addEventListener("click", () => {
    eventMode = !eventMode;
    modeButton.textContent = eventMode ? "Event rhythm" : "Calendar time";
    modeButton.setAttribute("aria-pressed", String(eventMode));
    updateReadout();
  });
  document.querySelector("#overviewButton").addEventListener("click", () => {
    setPlaying(false, "Replay timeline");
    finalOverview = true;
    currentYear = maxYear;
    eventIndex = eruptions.length;
    activePulses = [];
    updateReadout(); drawTimeline();
  });
  const reduceMotionButton = document.querySelector("#reduceMotion");
  reduceMotionButton.setAttribute("aria-pressed", String(reducedMotion));
  installSonificationHelp(reduceMotionButton, document.querySelector("#motionTooltip"), { pinOnClick: false });
  reduceMotionButton.addEventListener("click", event => {
    reducedMotion = !reducedMotion;
    event.currentTarget.setAttribute("aria-pressed", String(reducedMotion));
  });
  const greyMapButton = document.querySelector("#greyMap");
  function setMapPalette(name) {
    mapPalette = mapPalettes[name];
    relief.grey = name === "grey";
    document.documentElement.dataset.map = name;
    greyMapButton.setAttribute("aria-pressed", String(name === "grey"));
  }
  setMapPalette("colour");
  installSonificationHelp(greyMapButton, document.querySelector("#mapTooltip"), { pinOnClick: false });
  greyMapButton.addEventListener("click", () => {
    setMapPalette(mapPalette === mapPalettes.grey ? "colour" : "grey");
  });
  soundButton.addEventListener("click", async () => {
    soundButton.disabled = true;
    soundButton.setAttribute("aria-busy", "true");
    soundStatus.textContent = sound.enabled ? "Muting sound" : "Loading drums and soft piano";
    try {
      await sound.setEnabled(!sound.enabled);
      updateSoundControls();
    } catch (error) {
      handleSoundError(error);
    } finally {
      soundButton.disabled = false;
      soundButton.removeAttribute("aria-busy");
    }
  });
  soundVolume.addEventListener("input", () => {
    sound.setVolume(Number(soundVolume.value) / 100);
    soundVolume.setAttribute("aria-valuetext", `${soundVolume.value}%`);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { setPlaying(false); updateReadout(); }
  });
  window.addEventListener("pagehide", () => sound.stop());
  updateSoundControls();
  document.querySelector("#aboutButton").addEventListener("click", () => aboutDialog.showModal());
  document.querySelector("#pngButton").addEventListener("click", exportPng);
  document.querySelector("#gifButton").addEventListener("click", exportGif);
  document.querySelector("#mp4Button").addEventListener("click", () => {
    if (exporting) return;
    const seconds = Math.round(totalNominalSeconds + 3);
    document.querySelector("#mp4Duration").textContent = `${Math.floor(seconds / 60)} min ${seconds % 60} sec`;
    mp4Dialog.showModal();
  });
  document.querySelector("#mp4Start").addEventListener("click", () => {
    mp4Dialog.close();
    exportMp4();
  });
  cancelExportButton.addEventListener("click", () => exportAbort?.abort());
  document.querySelector("#closeCard").addEventListener("click", () => { eventCard.hidden = true; });
  const volcanoSearch = installVolcanoSearch(searchInput, document.querySelector("#volcanoOptions"), eruptions, renderBrowser);
  veiFilter.addEventListener("change", renderBrowser);
  precisionFilter.addEventListener("change", renderBrowser);
  document.querySelector("#clearFilters").addEventListener("click", () => {
    searchInput.value = "";
    volcanoSearch.clear();
    veiFilter.value = "any";
    precisionFilter.value = "any";
    renderBrowser();
  });
  resultsList.addEventListener("click", event => {
    const button = event.target.closest(".result-button");
    if (!button) return;
    const selected = eruptions[Number(button.dataset.index)];
    if (!selected) return;
    setPlaying(false);
    resetTo(selected.t);
    activePulses.push({ event: selected, born: performance.now() });
    recentEvents.push(selected);
    showEvent(selected);
  });
  mapCanvas.addEventListener("pointerdown", event => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    dragState = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false };
    mapCanvas.setPointerCapture(event.pointerId);
    mapCanvas.classList.add("dragging");
  });
  mapCanvas.addEventListener("pointermove", event => {
    if (!dragState || dragState.id !== event.pointerId) return;
    const deltaX = event.clientX - dragState.x;
    const deltaY = event.clientY - dragState.y;
    if (!deltaX && !deltaY) return;
    if (Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY) > 4) dragState.moved = true;
    dragState.x = event.clientX;
    dragState.y = event.clientY;
    panMapByPixels(deltaX, deltaY);
  });
  mapCanvas.addEventListener("pointerup", event => {
    if (!dragState || dragState.id !== event.pointerId) return;
    suppressMapClick = dragState.moved;
    dragState = null;
    mapCanvas.classList.remove("dragging");
    if (mapCanvas.hasPointerCapture(event.pointerId)) mapCanvas.releasePointerCapture(event.pointerId);
  });
  mapCanvas.addEventListener("pointercancel", event => {
    if (dragState?.id === event.pointerId) dragState = null;
    mapCanvas.classList.remove("dragging");
  });
  mapCanvas.addEventListener("dblclick", () => {
    resetMapView();
  });
  mapCanvas.addEventListener("wheel", event => {
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * .0012);
    zoomMap(mapZoom * factor, event.clientX, event.clientY);
  }, { passive: false });
  mapCanvas.addEventListener("click", event => {
    if (suppressMapClick) {
      suppressMapClick = false;
      return;
    }
    const selected = nearestRecentEvent(event.clientX, event.clientY);
    if (selected) showEvent(selected);
  });
  zoomInButton.addEventListener("click", () => zoomMap(mapZoom * 1.45));
  zoomOutButton.addEventListener("click", () => zoomMap(mapZoom / 1.45));
  resetMapButton.addEventListener("click", resetMapView);
  window.addEventListener("resize", resize);
  new ResizeObserver(updateCountryRanking).observe(countryList);
  window.addEventListener("load", resize);
  document.fonts?.ready.then(resize).catch(() => {});

  document.querySelector("#dataVersion").textContent = `${meta.mappedEruptions.toLocaleString()} mapped eruptions · ${meta.knownVei.toLocaleString()} with recorded VEI · latest activity sorted by end/latest date where available · eruption export VOTW 5.3.5 (24 Apr 2026) · volcano locations VOTW 5.4.0 (27 Sep 2026) · plate boundaries from PB2002.`;

  fetch("world.geojson").then(response => {
    if (!response.ok) throw new Error("Map geometry unavailable");
    return response.json();
  }).then(geometry => {
    world = geometry;
    resize();
  }).catch(() => resize());

  relief.load().then(metadata => {
    if (!metadata) return;
    document.querySelector("#dataVersion").append(` ${metadata.attribution}`);
  });

  fetch(plateBoundaryUrl).then(response => response.ok ? response.json() : null).then(boundaries => {
    plateBoundaries = boundaries;
    rebuildPlateBoundaryPaths();
  }).catch(() => {});

  const labelYears = [minYear, -5000, 1500, 1800, 1950, maxYear];
  document.querySelectorAll('.timeline-labels span').forEach((label, index) => {
    const date = formatYear(labelYears[index]);
    label.textContent = `${date.value.toLocaleString()}${date.era === 'BCE' ? ' BCE' : ''}`;
    label.style.left = `${yearToProgress(labelYears[index]) * 100}%`;
    label.style.transform = `translateX(${index === 0 ? 0 : index === labelYears.length - 1 ? -100 : -50}%)`;
  });
  resetTo(minYear);
  renderBrowser();
  requestAnimationFrame(tick);
})();
