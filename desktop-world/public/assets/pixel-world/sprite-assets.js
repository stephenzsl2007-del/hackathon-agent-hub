/** Pixel art atlas adapter. All artwork stays in its original, unmodified PNG. */
export function growthStage(progress) {
  if (!Number.isFinite(progress)) return 0;
  return Math.min(4, Math.max(0, Math.floor(progress * 5)));
}

export async function loadPixelArt(manifestURL = new URL('./atlas.json', import.meta.url)) {
  const url = new URL(manifestURL, import.meta.url);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`素材清单读取失败：${response.status}`);
  const manifest = await response.json();
  const images = new Map(await Promise.all(Object.entries(manifest.images).map(async ([key, source]) => {
    const img = new Image();
    img.src = new URL(source.file, url).href;
    await img.decode();
    if (img.naturalWidth !== source.width || img.naturalHeight !== source.height) {
      throw new Error(`素材尺寸与清单不一致：${source.file}`);
    }
    return [key, img];
  })));

  function sprite(id) {
    const item = manifest.sprites[id];
    if (!item) throw new Error(`未知素材：${id}`);
    return item;
  }

  function plantSprite(plantID, stage) {
    const plant = manifest.plants[plantID];
    if (!plant) throw new Error(`未知植物：${plantID}`);
    const index = Number.isFinite(stage) ? Math.max(0, Math.min(4, Math.floor(stage))) : 0;
    return plant.stages[index];
  }

  /** (x,y) is the ground/root position. Keep scale constant through a plant's growth. */
  function drawSprite(ctx, id, x, y, { scale = 1, opacity = 1 } = {}) {
    if (!Number.isFinite(scale) || scale <= 0) return;
    const item = sprite(id);
    const [sx, sy, sw, sh] = item.rect;
    const [ax, ay] = item.anchor;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha *= Math.max(0, Math.min(1, opacity));
    ctx.drawImage(images.get(item.image), sx, sy, sw, sh,
      Math.round(x - ax * scale), Math.round(y - ay * scale),
      Math.max(1, Math.round(sw * scale)), Math.max(1, Math.round(sh * scale)));
    ctx.restore();
  }

  return { manifest, images, sprite, plantSprite, drawSprite };
}
