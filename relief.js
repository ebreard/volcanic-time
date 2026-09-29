// Equirectangular imagery: west to east, north to south, including both poles.
export function reliefCopies(bounds, centerLon, centerLat, zoom) {
  const { left, top, mapWidth, mapHeight } = bounds;
  if (!(mapWidth > 0 && mapHeight > 0 && zoom >= 1)) return [];
  const lon = ((centerLon + 180) % 360 + 360) % 360 - 180;
  const w = mapWidth * zoom;
  const h = mapHeight * zoom;
  const x = left + mapWidth / 2 - (lon + 180) / 360 * w;
  const y = top + mapHeight / 2 + (centerLat - 90) / 180 * h;
  const first = Math.floor((left - x) / w);
  const copies = [];
  for (let index = first; x + index * w < left + mapWidth; index++) {
    copies.push({ x: x + index * w, y, width: w, height: h });
  }
  return copies;
}

export function createReliefLayer() {
  let image = null;
  return {
    get ready() { return image !== null; },
    async load() {
      try {
        const response = await fetch(new URL("./relief.json", import.meta.url), { cache: "no-cache" });
        if (!response.ok) return null;
        const metadata = await response.json();
        if (!metadata.image) return null;
        const candidate = new Image();
        candidate.src = new URL(metadata.image, import.meta.url).href;
        await candidate.decode();
        if (candidate.naturalWidth !== candidate.naturalHeight * 2) return null;
        image = candidate;
        return metadata;
      } catch {
        return null;
      }
    },
    draw(ctx, bounds, centerLon, centerLat, zoom) {
      if (!image) return false;
      ctx.save();
      ctx.beginPath();
      ctx.rect(bounds.left, bounds.top, bounds.mapWidth, bounds.mapHeight);
      ctx.clip();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      for (const rect of reliefCopies(bounds, centerLon, centerLat, zoom)) {
        ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
      }
      ctx.restore();
      return true;
    },
  };
}
