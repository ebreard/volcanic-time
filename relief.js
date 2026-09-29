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

// Near-grey, darker copy of the relief, so colour on the map belongs to the eruptions.
function mutedRelief(source, saturation = .12, brightness = .78) {
  const canvas = document.createElement("canvas");
  canvas.width = source.naturalWidth;
  canvas.height = source.naturalHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(source, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = pixels.data;
  for (let i = 0; i < data.length; i += 4) {
    const luma = .2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2];
    for (let c = i; c < i + 3; c++) data[c] = (luma + (data[c] - luma) * saturation) * brightness;
  }
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}

export function createReliefLayer() {
  let image = null;
  let greyImage = null;
  return {
    grey: false,
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
        try { greyImage = mutedRelief(candidate); } catch { greyImage = null; }
        image = candidate;
        return metadata;
      } catch {
        return null;
      }
    },
    draw(ctx, bounds, centerLon, centerLat, zoom) {
      if (!image) return false;
      const source = this.grey && greyImage ? greyImage : image;
      ctx.save();
      ctx.beginPath();
      ctx.rect(bounds.left, bounds.top, bounds.mapWidth, bounds.mapHeight);
      ctx.clip();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      for (const rect of reliefCopies(bounds, centerLon, centerLat, zoom)) {
        ctx.drawImage(source, rect.x, rect.y, rect.width, rect.height);
      }
      ctx.restore();
      return true;
    },
  };
}
