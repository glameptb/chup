const adminState = {
  photos: [],
  activePhotoId: null,
  activeFilter: "clean",
  sampleBase: null,
  sampleIntensity: 100,
  effectContrast: 115,
  learnedCoefficients: null,
  backgroundRules: [],
  lastBackgroundDetection: null,
};

const baseValues = { brightness: 1, contrast: 1, saturate: 1, sepia: 0, hue: 0, grayscale: 0 };
const backgroundRuleStorageKey = "glameBackgroundFilterRules";
const defaultBackgroundRules = [
  { id: "red-curtain", label: "Rem do / nau", filterKey: "learned" },
  { id: "pink-pastel", label: "Hong pastel / hoa", filterKey: "dream" },
  { id: "dark-booth", label: "Nen toi", filterKey: "blackMist" },
  { id: "green-wall", label: "Nen xanh", filterKey: "magimir" },
  { id: "neutral", label: "Trung tinh / khong ro", filterKey: "clean" },
];

const adminFilters = {
  clean: { label: "Tự nhiên", values: { ...baseValues } },
  bright: { label: "Sáng da", values: { ...baseValues, brightness: 1.12, contrast: 1.04, saturate: 1.04 } },
  rosy: { label: "Hồng nhẹ", values: { ...baseValues, brightness: 1.08, contrast: 1.03, saturate: 1.18, sepia: 0.08 } },
  blackMist: { label: "Black mist", processor: "blackMist", values: { ...baseValues } },
  dream: { label: "Dream soft glow", processor: "dream", values: { ...baseValues } },
  learned: { label: "AI learned", processor: "learned", values: { ...baseValues } },
  magimir: { label: "Magimir mềm retro", processor: "magimir", values: { ...baseValues, brightness: 1.03, contrast: 1.02, saturate: 0.86, sepia: 0.14, hue: -3, grayscale: 0 } },
  film: { label: "Film", values: { ...baseValues, contrast: 1.12, saturate: 0.82, sepia: 0.18 } },
  bw: { label: "B&W", values: { ...baseValues, contrast: 1.08, grayscale: 1 } },
};

const canvas = document.querySelector("#adminFilterCanvas");
const ctx = canvas.getContext("2d");
const toast = document.querySelector("#adminFilterToast");
const photoGrid = document.querySelector("#adminPhotoGrid");
const filterReadout = document.querySelector("#filterReadout");
const intensityInput = document.querySelector("#sampleIntensityInput");
const intensityValue = document.querySelector("#sampleIntensityValue");
const contrastInput = document.querySelector("#effectContrastInput");
const contrastValue = document.querySelector("#effectContrastValue");
const backgroundReadout = document.querySelector("#backgroundReadout");
const backgroundRuleSelect = document.querySelector("#backgroundRuleSelect");
const backgroundFilterSelect = document.querySelector("#backgroundFilterSelect");

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const lerp = (from, to, amount) => from + (to - from) * amount;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => toast.classList.remove("is-visible"), 2200);
}

function loadBackgroundRules() {
  try {
    const saved = JSON.parse(localStorage.getItem(backgroundRuleStorageKey));
    if (Array.isArray(saved) && saved.length) {
      return defaultBackgroundRules.map((rule) => {
        const override = saved.find((item) => item.id === rule.id);
        return { ...rule, filterKey: override?.filterKey || rule.filterKey };
      });
    }
  } catch {
    // Keep default rules if local storage has invalid data.
  }
  return defaultBackgroundRules.map((rule) => ({ ...rule }));
}

function saveBackgroundRules() {
  localStorage.setItem(backgroundRuleStorageKey, JSON.stringify(adminState.backgroundRules));
}

function getUsableFilterKey(filterKey) {
  if (filterKey === "learned" && !adminState.learnedCoefficients) return "magimir";
  return adminFilters[filterKey] ? filterKey : "clean";
}

function renderBackgroundManager() {
  if (!backgroundRuleSelect || !backgroundFilterSelect) return;
  backgroundRuleSelect.innerHTML = adminState.backgroundRules
    .map((rule) => `<option value="${rule.id}">${rule.label}</option>`)
    .join("");
  backgroundFilterSelect.innerHTML = Object.entries(adminFilters)
    .filter(([key]) => key !== "sample")
    .map(([key, filter]) => `<option value="${key}">${filter.label}</option>`)
    .join("");
  syncBackgroundRuleEditor();
}

function syncBackgroundRuleEditor() {
  if (!backgroundRuleSelect || !backgroundFilterSelect) return;
  const rule = adminState.backgroundRules.find((item) => item.id === backgroundRuleSelect.value) || adminState.backgroundRules[0];
  if (!rule) return;
  backgroundRuleSelect.value = rule.id;
  backgroundFilterSelect.value = getUsableFilterKey(rule.filterKey);
}

function rgbToHsv(red, green, blue) {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;
  if (delta !== 0) {
    if (max === red) hue = ((green - blue) / delta) % 6;
    if (max === green) hue = (blue - red) / delta + 2;
    if (max === blue) hue = (red - green) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  return {
    hue,
    saturation: max === 0 ? 0 : delta / max,
    value: max,
  };
}

function sampleBackgroundStats(image) {
  const sampleCanvas = document.createElement("canvas");
  const maxSize = 220;
  const scale = Math.min(maxSize / image.width, maxSize / image.height, 1);
  sampleCanvas.width = Math.max(1, Math.round(image.width * scale));
  sampleCanvas.height = Math.max(1, Math.round(image.height * scale));
  const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
  sampleCtx.drawImage(image, 0, 0, sampleCanvas.width, sampleCanvas.height);
  const data = sampleCtx.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height).data;
  const marginX = Math.max(12, Math.round(sampleCanvas.width * 0.16));
  const marginY = Math.max(12, Math.round(sampleCanvas.height * 0.16));
  const stats = {
    total: 0,
    luminance: 0,
    saturation: 0,
    redBrown: 0,
    pinkPastel: 0,
    dark: 0,
    green: 0,
    neutral: 0,
  };

  for (let y = 0; y < sampleCanvas.height; y += 1) {
    for (let x = 0; x < sampleCanvas.width; x += 1) {
      const isBorder = x < marginX || x >= sampleCanvas.width - marginX || y < marginY || y >= sampleCanvas.height - marginY;
      if (!isBorder) continue;
      const index = (y * sampleCanvas.width + x) * 4;
      const red = data[index] / 255;
      const green = data[index + 1] / 255;
      const blue = data[index + 2] / 255;
      const hsv = rgbToHsv(red, green, blue);
      const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      stats.total += 1;
      stats.luminance += luminance;
      stats.saturation += hsv.saturation;

      const warmHue = hsv.hue <= 42 || hsv.hue >= 345;
      if (warmHue && hsv.saturation > 0.22 && luminance < 0.58) stats.redBrown += 1;
      if ((hsv.hue >= 315 || hsv.hue <= 24) && hsv.saturation > 0.08 && hsv.saturation < 0.58 && luminance >= 0.48) stats.pinkPastel += 1;
      if (luminance < 0.2) stats.dark += 1;
      if (hsv.hue >= 72 && hsv.hue <= 155 && hsv.saturation > 0.12) stats.green += 1;
      if (hsv.saturation < 0.12 && luminance > 0.34 && luminance < 0.78) stats.neutral += 1;
    }
  }

  Object.keys(stats).forEach((key) => {
    if (key !== "total") stats[key] = stats.total ? stats[key] / stats.total : 0;
  });
  return stats;
}

function detectBackgroundRule(image) {
  const stats = sampleBackgroundStats(image);
  let id = "neutral";
  let confidence = Math.round(Math.max(stats.neutral, 0.28) * 100);
  let reason = `neutral ${Math.round(stats.neutral * 100)}%`;

  const candidates = [
    { id: "pink-pastel", score: stats.pinkPastel, reason: `pink/pastel ${Math.round(stats.pinkPastel * 100)}%` },
    { id: "red-curtain", score: stats.redBrown, reason: `red/brown ${Math.round(stats.redBrown * 100)}%` },
    { id: "dark-booth", score: stats.dark, reason: `dark ${Math.round(stats.dark * 100)}%` },
    { id: "green-wall", score: stats.green, reason: `green ${Math.round(stats.green * 100)}%` },
  ].sort((a, b) => b.score - a.score);

  if (candidates[0].score > 0.18) {
    id = candidates[0].id;
    confidence = Math.round(candidates[0].score * 100);
    reason = candidates[0].reason;
  }

  const rule = adminState.backgroundRules.find((item) => item.id === id) || adminState.backgroundRules.find((item) => item.id === "neutral");
  return { rule, stats, confidence, reason };
}

async function autoDetectCurrentPhoto({ shouldApply = false } = {}) {
  const photo = getActivePhoto();
  if (!photo) {
    showToast("Upload va chon mot anh truoc.");
    return null;
  }
  const image = await loadImage(photo.src);
  const detection = detectBackgroundRule(image);
  const filterKey = getUsableFilterKey(detection.rule.filterKey);
  adminState.lastBackgroundDetection = detection;
  adminState.activeFilter = filterKey;
  if (shouldApply) photo.filterKey = filterKey;
  if (backgroundReadout) {
    backgroundReadout.textContent = `Nhan dien: ${detection.rule.label} (${detection.confidence}%) -> ${adminFilters[filterKey].label}. ${detection.reason}.`;
  }
  if (backgroundRuleSelect) {
    backgroundRuleSelect.value = detection.rule.id;
    syncBackgroundRuleEditor();
  }
  updateFilterButtons();
  renderPhotoGrid();
  await renderPreview();
  showToast(`Da chon ${adminFilters[filterKey].label} cho ${detection.rule.label}.`);
  return detection;
}

async function autoApplyAllByBackground() {
  if (!adminState.photos.length) {
    showToast("Chua co anh de auto apply.");
    return;
  }
  const counts = {};
  for (const photo of adminState.photos) {
    const image = await loadImage(photo.src);
    const detection = detectBackgroundRule(image);
    const filterKey = getUsableFilterKey(detection.rule.filterKey);
    photo.filterKey = filterKey;
    counts[detection.rule.label] = (counts[detection.rule.label] || 0) + 1;
  }
  const firstPhoto = adminState.photos[0];
  adminState.activePhotoId ||= firstPhoto.id;
  const activePhoto = getActivePhoto() || firstPhoto;
  adminState.activeFilter = activePhoto.filterKey || "clean";
  updateFilterButtons();
  renderPhotoGrid();
  await renderPreview();
  if (backgroundReadout) {
    backgroundReadout.textContent = Object.entries(counts)
      .map(([label, count]) => `${label}: ${count}`)
      .join(" · ");
  }
  showToast("Da auto apply filter theo background.");
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function filterToCss(filter) {
  const values = filter?.values || baseValues;
  return [
    `brightness(${values.brightness.toFixed(2)})`,
    `contrast(${values.contrast.toFixed(2)})`,
    `saturate(${values.saturate.toFixed(2)})`,
    `sepia(${values.sepia.toFixed(2)})`,
    `hue-rotate(${values.hue.toFixed(0)}deg)`,
    `grayscale(${values.grayscale.toFixed(2)})`,
  ].join(" ");
}

function mixValues(targetValues, intensity) {
  const amount = clamp(intensity, 0, 100) / 100;
  return {
    brightness: lerp(baseValues.brightness, targetValues.brightness, amount),
    contrast: lerp(baseValues.contrast, targetValues.contrast, amount),
    saturate: lerp(baseValues.saturate, targetValues.saturate, amount),
    sepia: lerp(baseValues.sepia, targetValues.sepia, amount),
    hue: lerp(baseValues.hue, targetValues.hue, amount),
    grayscale: lerp(baseValues.grayscale, targetValues.grayscale, amount),
  };
}

function refreshSampleFilter() {
  if (!adminState.sampleBase) return;
  adminFilters.sample = {
    label: `Ảnh mẫu ${adminState.sampleIntensity}%`,
    values: mixValues(adminState.sampleBase, adminState.sampleIntensity),
  };
  intensityValue.textContent = `${adminState.sampleIntensity}%`;
}

function getActivePhoto() {
  return adminState.photos.find((photo) => photo.id === adminState.activePhotoId) || null;
}

function getActiveFilter() {
  refreshSampleFilter();
  return adminFilters[adminState.activeFilter] || adminFilters.clean;
}

function getPhotoFilter(photo) {
  refreshSampleFilter();
  return adminFilters[photo?.filterKey || adminState.activeFilter] || adminFilters.clean;
}

function buildSampleValuesFromImage(image) {
  const sampleCanvas = document.createElement("canvas");
  const sampleSize = 96;
  sampleCanvas.width = sampleSize;
  sampleCanvas.height = sampleSize;
  const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
  sampleCtx.drawImage(image, 0, 0, sampleSize, sampleSize);

  const pixels = sampleCtx.getImageData(0, 0, sampleSize, sampleSize).data;
  let red = 0;
  let green = 0;
  let blue = 0;
  let saturation = 0;
  let contrast = 0;
  const luminanceValues = [];
  const total = pixels.length / 4;

  for (let index = 0; index < pixels.length; index += 4) {
    const r = pixels[index] / 255;
    const g = pixels[index + 1] / 255;
    const b = pixels[index + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    red += r;
    green += g;
    blue += b;
    saturation += max === 0 ? 0 : (max - min) / max;
    luminanceValues.push(luminance);
  }

  red /= total;
  green /= total;
  blue /= total;
  saturation /= total;
  const luminanceAverage = luminanceValues.reduce((sum, value) => sum + value, 0) / total;
  luminanceValues.forEach((value) => {
    contrast += Math.abs(value - luminanceAverage);
  });
  contrast /= total;

  return {
    brightness: clamp(0.86 + luminanceAverage * 0.52, 0.86, 1.18),
    contrast: clamp(0.94 + contrast * 1.9, 0.94, 1.18),
    saturate: clamp(0.72 + saturation * 1.85, 0.72, 1.42),
    sepia: clamp(Math.max(red - blue, 0) * 0.62, 0, 0.22),
    hue: clamp((green - red) * 24 + (blue - red) * 18, -16, 16),
    grayscale: 0,
  };
}

function applyMagimirLook(targetCtx, width, height) {
  const imageData = targetCtx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const contrastAmount = adminState.effectContrast / 100;

  for (let index = 0; index < data.length; index += 4) {
    let red = data[index] / 255;
    let green = data[index + 1] / 255;
    let blue = data[index + 2] / 255;
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const saturation = max === 0 ? 0 : (max - min) / max;
    const skinLike = red > green * 1.02 && green > blue * 0.9 && luminance > 0.24 && luminance < 0.86;

    // Gentle flash lift without posterizing skin.
    const gamma = skinLike ? 0.92 : 0.98;
    red = Math.pow(red, gamma);
    green = Math.pow(green, gamma);
    blue = Math.pow(blue, gamma);

    const contrast = skinLike ? 0.98 : 1.02;
    red = (red - 0.5) * contrast + 0.5;
    green = (green - 0.5) * contrast + 0.5;
    blue = (blue - 0.5) * contrast + 0.5;

    const warmAmount = skinLike ? 0.04 : 0.032;
    red += warmAmount;
    green += warmAmount * 0.5;
    blue -= warmAmount * 0.28;

    const gray = 0.299 * red + 0.587 * green + 0.114 * blue;
    const desaturate = skinLike ? 0.1 : 0.18;
    red = gray + (red - gray) * (1 - desaturate);
    green = gray + (green - gray) * (1 - desaturate);
    blue = gray + (blue - gray) * (1 - desaturate);

    // Soft highlight compression: prevents the orange/chalky clipping from the previous version.
    if (luminance > 0.48) {
      const highlight = clamp((luminance - 0.48) / 0.42, 0, 1);
      red = red * (1 - 0.035 * highlight) + 0.018 * highlight;
      green = green * (1 - 0.03 * highlight) + 0.014 * highlight;
      blue = blue * (1 - 0.025 * highlight) + 0.008 * highlight;
    }

    // Mild matte shadow floor, not washed out.
    if (luminance < 0.24 && saturation < 0.55) {
      red = red * 0.94 + 0.016;
      green = green * 0.93 + 0.012;
      blue = blue * 0.9 + 0.006;
    }

    // Small creamy skin bias, kept intentionally subtle.
    if (skinLike) {
      red = lerp(red, 0.92, 0.035);
      green = lerp(green, 0.82, 0.026);
      blue = lerp(blue, 0.76, 0.018);
    }

    // Global gentle warm print wash.
    red = red * 1.018 + 0.006;
    green = green * 1.002 + 0.004;
    blue = blue * 0.9;

    data[index] = Math.round(clamp(red, 0, 1) * 255);
    data[index + 1] = Math.round(clamp(green, 0, 1) * 255);
    data[index + 2] = Math.round(clamp(blue, 0, 1) * 255);
  }

  targetCtx.putImageData(imageData, 0, 0);
}

function applyLearnedLook(targetCtx, width, height) {
  if (!adminState.learnedCoefficients) return;
  const coeffs = adminState.learnedCoefficients;
  const imageData = targetCtx.getImageData(0, 0, width, height);
  const data = imageData.data;

  for (let index = 0; index < data.length; index += 4) {
    const r = data[index] / 255;
    const g = data[index + 1] / 255;
    const b = data[index + 2] / 255;
    const featureValues = [r, g, b, r * r, g * g, b * b, r * g, r * b, g * b, 1];

    let outR = 0;
    let outG = 0;
    let outB = 0;
    for (let featureIndex = 0; featureIndex < featureValues.length; featureIndex += 1) {
      outR += featureValues[featureIndex] * coeffs[featureIndex][0];
      outG += featureValues[featureIndex] * coeffs[featureIndex][1];
      outB += featureValues[featureIndex] * coeffs[featureIndex][2];
    }

    data[index] = Math.round(clamp(outR, 0, 1) * 255);
    data[index + 1] = Math.round(clamp(outG, 0, 1) * 255);
    data[index + 2] = Math.round(clamp(outB, 0, 1) * 255);
  }

  targetCtx.putImageData(imageData, 0, 0);
}

function applyDreamSoftGlow(targetCtx, width, height) {
  const amount = clamp(adminState.sampleIntensity, 0, 100) / 100;
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  const sourceCtx = sourceCanvas.getContext("2d");
  sourceCtx.drawImage(targetCtx.canvas, 0, 0);

  const glowCanvas = document.createElement("canvas");
  glowCanvas.width = width;
  glowCanvas.height = height;
  const glowCtx = glowCanvas.getContext("2d");

  const veilBlur = Math.max(10, Math.round(Math.min(width, height) * (0.014 + amount * 0.034)));
  glowCtx.filter = `blur(${veilBlur}px) brightness(${1.0 + amount * 0.08})`;
  glowCtx.drawImage(sourceCanvas, 0, 0);
  glowCtx.filter = "none";

  targetCtx.save();
  targetCtx.globalCompositeOperation = "screen";
  targetCtx.globalAlpha = 0.1 + amount * 0.22;
  targetCtx.drawImage(glowCanvas, 0, 0);
  targetCtx.restore();

  targetCtx.save();
  targetCtx.globalCompositeOperation = "lighten";
  targetCtx.globalAlpha = 0.06 + amount * 0.12;
  targetCtx.drawImage(glowCanvas, 0, 0);
  targetCtx.restore();

  const bloomCanvas = document.createElement("canvas");
  bloomCanvas.width = width;
  bloomCanvas.height = height;
  const bloomCtx = bloomCanvas.getContext("2d");
  bloomCtx.drawImage(sourceCanvas, 0, 0);
  const bloomData = bloomCtx.getImageData(0, 0, width, height);
  const bloomPixels = bloomData.data;
  for (let index = 0; index < bloomPixels.length; index += 4) {
    const red = bloomPixels[index] / 255;
    const green = bloomPixels[index + 1] / 255;
    const blue = bloomPixels[index + 2] / 255;
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    bloomPixels[index + 3] = Math.round(clamp((luminance - 0.5) / 0.38, 0, 1) * 255);
  }
  bloomCtx.putImageData(bloomData, 0, 0);
  const bloomBlur = Math.max(14, Math.round(Math.min(width, height) * (0.02 + amount * 0.04)));
  bloomCtx.filter = `blur(${bloomBlur}px) brightness(${1.02 + amount * 0.14})`;
  bloomCtx.drawImage(bloomCanvas, 0, 0);
  bloomCtx.filter = "none";

  targetCtx.save();
  targetCtx.globalCompositeOperation = "screen";
  targetCtx.globalAlpha = 0.08 + amount * 0.18;
  targetCtx.drawImage(bloomCanvas, 0, 0);
  targetCtx.restore();

  targetCtx.save();
  targetCtx.globalCompositeOperation = "source-over";
  targetCtx.globalAlpha = 0.08 + amount * 0.1;
  targetCtx.drawImage(sourceCanvas, 0, 0);
  targetCtx.restore();
}

function applyBlackMist(targetCtx, width, height) {
  const amount = clamp(adminState.sampleIntensity, 0, 100) / 100;
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  const sourceCtx = sourceCanvas.getContext("2d");
  sourceCtx.drawImage(targetCtx.canvas, 0, 0);

  const bloomCanvas = document.createElement("canvas");
  bloomCanvas.width = width;
  bloomCanvas.height = height;
  const bloomCtx = bloomCanvas.getContext("2d");
  bloomCtx.drawImage(sourceCanvas, 0, 0);

  const bloomData = bloomCtx.getImageData(0, 0, width, height);
  const bloomPixels = bloomData.data;
  for (let index = 0; index < bloomPixels.length; index += 4) {
    const red = bloomPixels[index] / 255;
    const green = bloomPixels[index + 1] / 255;
    const blue = bloomPixels[index + 2] / 255;
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    const mask = clamp((luminance - 0.42) / 0.42, 0, 1);
    bloomPixels[index + 3] = Math.round(mask * 255);
  }
  bloomCtx.putImageData(bloomData, 0, 0);

  const blurRadius = Math.max(8, Math.round(Math.min(width, height) * (0.008 + amount * 0.022)));
  bloomCtx.filter = `blur(${blurRadius}px) brightness(${1.0 + amount * 0.08})`;
  bloomCtx.drawImage(bloomCanvas, 0, 0);
  bloomCtx.filter = "none";

  targetCtx.save();
  targetCtx.globalCompositeOperation = "screen";
  targetCtx.globalAlpha = 0.08 + amount * 0.2;
  targetCtx.drawImage(bloomCanvas, 0, 0);
  targetCtx.restore();

  const imageData = targetCtx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const contrastAmount = (adminState.effectContrast / 100) * (1 - 0.08 * amount);

  for (let index = 0; index < data.length; index += 4) {
    let red = data[index] / 255;
    let green = data[index + 1] / 255;
    let blue = data[index + 2] / 255;
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;

    if (luminance < 0.32) {
      red = red * (1 - 0.08 * amount) + 0.018 * amount;
      green = green * (1 - 0.08 * amount) + 0.016 * amount;
      blue = blue * (1 - 0.07 * amount) + 0.015 * amount;
    }

    red = (red - 0.5) * contrastAmount + 0.5;
    green = (green - 0.5) * contrastAmount + 0.5;
    blue = (blue - 0.5) * contrastAmount + 0.5;

    data[index] = Math.round(clamp(red, 0, 1) * 255);
    data[index + 1] = Math.round(clamp(green, 0, 1) * 255);
    data[index + 2] = Math.round(clamp(blue, 0, 1) * 255);
  }

  targetCtx.putImageData(imageData, 0, 0);
}

function drawFullImage(image, targetCtx, width, height, filter) {
  targetCtx.fillStyle = "#ffffff";
  targetCtx.fillRect(0, 0, width, height);
  targetCtx.filter = filter?.processor ? "none" : filterToCss(filter);
  targetCtx.drawImage(image, 0, 0, width, height);
  targetCtx.filter = "none";
  if (filter?.processor === "magimir") {
    applyMagimirLook(targetCtx, width, height);
  }
  if (filter?.processor === "learned") {
    applyLearnedLook(targetCtx, width, height);
  }
  if (filter?.processor === "dream") {
    applyDreamSoftGlow(targetCtx, width, height);
  }
  if (filter?.processor === "blackMist") {
    applyBlackMist(targetCtx, width, height);
  }
}

async function renderPreview() {
  const photo = getActivePhoto();

  if (!photo) {
    canvas.width = 1200;
    canvas.height = 1600;
    ctx.fillStyle = "#fffaf3";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#756b62";
    ctx.font = "700 42px Inter";
    ctx.textAlign = "center";
    ctx.fillText("Upload ảnh để test filter", canvas.width / 2, canvas.height / 2);
    filterReadout.textContent = `Filter: ${getActiveFilter().label}`;
    return;
  }

  const image = await loadImage(photo.src);
  canvas.width = image.width;
  canvas.height = image.height;
  const activeFilter = getActiveFilter();
  const savedFilter = getPhotoFilter(photo);
  drawFullImage(image, ctx, canvas.width, canvas.height, activeFilter);
  const savedLabel = savedFilter.label === activeFilter.label ? "đã apply" : `ảnh đang lưu: ${savedFilter.label}`;
  filterReadout.textContent = `Đang xem: ${activeFilter.label} · ${savedLabel} · ${photo.name} · ${image.width}x${image.height}px`;
}

function renderPhotoGrid() {
  photoGrid.innerHTML = "";
  if (!adminState.photos.length) {
    photoGrid.innerHTML = '<div class="empty-state">Upload ảnh test để xem filter trước/sau.</div>';
    return;
  }

  adminState.photos.forEach((photo) => {
    const filter = getPhotoFilter(photo);
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = `photo-tile${photo.id === adminState.activePhotoId ? " is-active" : ""}`;
    tile.innerHTML = `
      <img src="${photo.src}" alt="${photo.name}" style="filter: ${filterToCss(filter)}">
      <small>${filter.label}</small>
    `;
    tile.addEventListener("click", () => {
      adminState.activePhotoId = photo.id;
      adminState.activeFilter = photo.filterKey || "clean";
      updateFilterButtons();
      renderPhotoGrid();
      renderPreview();
    });
    photoGrid.appendChild(tile);
  });
}

function updateFilterButtons() {
  document.querySelectorAll("#adminFilterGrid .filter-chip").forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.filter === adminState.activeFilter);
  });
}

function setActiveFilter(filterKey) {
  if (!adminFilters[filterKey]) return;
  adminState.activeFilter = filterKey;
  updateFilterButtons();
  renderPreview();
}

function applyCurrentFilter() {
  const photo = getActivePhoto();
  if (!photo) {
    showToast("Upload và chọn một ảnh trước.");
    return;
  }
  photo.filterKey = adminState.activeFilter;
  renderPhotoGrid();
  renderPreview();
  showToast("Đã apply filter cho ảnh đang chọn.");
}

function applyAllFilter() {
  if (!adminState.photos.length) {
    showToast("Chưa có ảnh để apply.");
    return;
  }
  adminState.photos.forEach((photo) => {
    photo.filterKey = adminState.activeFilter;
  });
  renderPhotoGrid();
  renderPreview();
  showToast("Đã apply filter cho tất cả ảnh.");
}

async function buildFilteredDataUrl(photo) {
  const image = await loadImage(photo.src);
  const output = document.createElement("canvas");
  output.width = image.width;
  output.height = image.height;
  const outputCtx = output.getContext("2d");
  drawFullImage(image, outputCtx, output.width, output.height, getPhotoFilter(photo));
  return output.toDataURL("image/png");
}

async function downloadPhoto(photo, index = 0) {
  if (!photo) return;
  const link = document.createElement("a");
  const safeName = photo.name.replace(/\.[^.]+$/, "");
  link.download = `${safeName}-filter-${String(index + 1).padStart(2, "0")}.png`;
  link.href = await buildFilteredDataUrl(photo);
  link.click();
}

document.querySelector("#adminPhotoInput").addEventListener("change", (event) => {
  const files = [...event.target.files].filter((file) => file.type.startsWith("image/"));
  files.forEach((file) => {
    const photo = {
      id: crypto.randomUUID(),
      name: file.name,
      src: URL.createObjectURL(file),
      filterKey: adminState.activeFilter,
    };
    adminState.photos.push(photo);
    adminState.activePhotoId ||= photo.id;
  });
  event.target.value = "";
  renderPhotoGrid();
  renderPreview();
  showToast(`Đã upload ${files.length} ảnh test.`);
});

document.querySelector("#adminSampleInput").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file || !file.type.startsWith("image/")) return;
  const src = URL.createObjectURL(file);
  try {
    const image = await loadImage(src);
    adminState.sampleBase = buildSampleValuesFromImage(image);
    refreshSampleFilter();
    const sampleButton = document.querySelector("#adminSampleFilterBtn");
    sampleButton.disabled = false;
    document.querySelector("#samplePreview").innerHTML = `<img src="${src}" alt="${file.name}"><strong>${file.name}</strong>`;
    setActiveFilter("sample");
    showToast("Đã tạo filter từ ảnh mẫu.");
  } catch {
    URL.revokeObjectURL(src);
    showToast("Không đọc được ảnh mẫu.");
  }
  event.target.value = "";
});

intensityInput.addEventListener("input", (event) => {
  adminState.sampleIntensity = Number(event.target.value);
  refreshSampleFilter();
  if (adminState.activeFilter === "sample" || adminState.activeFilter === "dream" || adminState.activeFilter === "blackMist") {
    renderPreview();
  }
});

contrastInput.addEventListener("input", (event) => {
  adminState.effectContrast = Number(event.target.value);
  contrastValue.textContent = `${adminState.effectContrast}%`;
  if (adminState.activeFilter === "dream" || adminState.activeFilter === "blackMist") {
    renderPreview();
  }
});

document.querySelectorAll("#adminFilterGrid .filter-chip").forEach((button) => {
  button.addEventListener("click", () => setActiveFilter(button.dataset.filter));
});

document.querySelector("#applyCurrentBtn").addEventListener("click", applyCurrentFilter);
document.querySelector("#applyAllBtn").addEventListener("click", applyAllFilter);
document.querySelector("#downloadCurrentBtn").addEventListener("click", () => downloadPhoto(getActivePhoto()));
document.querySelector("#downloadAllBtn").addEventListener("click", () => {
  adminState.photos.forEach((photo, index) => {
    window.setTimeout(() => downloadPhoto(photo, index), index * 180);
  });
});
document.querySelector("#autoDetectCurrentBtn").addEventListener("click", () => autoDetectCurrentPhoto({ shouldApply: false }));
document.querySelector("#autoApplyByBackgroundBtn").addEventListener("click", autoApplyAllByBackground);
backgroundRuleSelect.addEventListener("change", syncBackgroundRuleEditor);
document.querySelector("#saveBackgroundRuleBtn").addEventListener("click", () => {
  const rule = adminState.backgroundRules.find((item) => item.id === backgroundRuleSelect.value);
  if (!rule) return;
  rule.filterKey = backgroundFilterSelect.value;
  saveBackgroundRules();
  syncBackgroundRuleEditor();
  showToast("Da luu cau hinh auto filter cho chu.");
});
document.querySelector("#resetBackgroundRulesBtn").addEventListener("click", () => {
  localStorage.removeItem(backgroundRuleStorageKey);
  adminState.backgroundRules = loadBackgroundRules();
  renderBackgroundManager();
  showToast("Da reset rule background mac dinh.");
});

async function loadLearnedModel() {
  try {
    const response = await fetch("outputs/magimir_lut/magimir_poly_coeffs.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const model = await response.json();
    adminState.learnedCoefficients = model.coefficients;
    const button = document.querySelector("#adminLearnedFilterBtn");
    button.disabled = false;
    renderBackgroundManager();
    showToast("Đã load AI learned color model.");
  } catch {
    showToast("Chưa load được AI learned model.");
  }
}

adminState.backgroundRules = loadBackgroundRules();
refreshSampleFilter();
renderBackgroundManager();
renderPhotoGrid();
renderPreview();
loadLearnedModel();
