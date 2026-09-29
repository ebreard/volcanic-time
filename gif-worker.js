import { GIFEncoder, quantize, applyPalette } from "./vendor/gifenc/index.js";
import { rgb888_to_rgb565 } from "./vendor/gifenc/rgb-packing.js";

let encoder;
let palette;
let paletteLookup;
let frameCount = 0;

self.onmessage = ({ data }) => {
  try {
    if (data.type === "start") {
      encoder = GIFEncoder();
      frameCount = 0;
      palette = quantize(data.sample, 256 - data.colors.length);
      for (const color of data.colors) {
        palette.push([1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16)));
      }
      // Fix each colour-bin mapping once, independent of changing frame content.
      const bins = new Uint8Array(65536 * 4);
      for (let key = 0; key < 65536; key++) {
        bins.set([((key >> 11) & 31) * 8 + 4, ((key >> 5) & 31) * 8 + 4, (key & 31) * 8 + 4, 255], key * 4);
      }
      paletteLookup = applyPalette(bins, palette);
      self.postMessage({ ready: true });
    } else if (data.type === "frame") {
      const indexed = new Uint8Array(data.width * data.height);
      for (let i = 0; i < indexed.length; i++) {
        const offset = i * 4;
        indexed[i] = paletteLookup[rgb888_to_rgb565(data.pixels[offset], data.pixels[offset + 1], data.pixels[offset + 2])];
      }
      encoder.writeFrame(indexed, data.width, data.height, {
        palette: frameCount === 0 ? palette : undefined,
        delay: data.delay,
        repeat: 0,
        dispose: 1,
      });
      frameCount++;
      self.postMessage({ frameCount });
    } else if (data.type === "finish") {
      encoder.finish();
      const bytes = encoder.bytes();
      self.postMessage({ bytes }, [bytes.buffer]);
      encoder = null;
    } else {
      throw new Error("Unrecognized GIF encoding request.");
    }
  } catch (error) {
    self.postMessage({ error: error.message || "GIF encoding failed." });
  }
};
