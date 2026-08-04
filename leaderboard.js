const STORAGE_KEY = "picklerank-state-v3";
const REMOTE_URL_KEY = "picklerank-google-script-url";
const DEFAULT_REMOTE_URL = "https://script.google.com/macros/s/AKfycbyrXOf6efsRBEDt1HO1bXmYWHGyvyqXBRpuRP2CKvuFLiRTWiJ7CybTLE-8ui5WbyNq/exec";
const BASE_RATING = 3.5;
const MIN_RATING = 2;
const MAX_RATING = 8;

const defaultState = {
  teams: [],
  members: [],
  matches: [],
};

async function loadState() {
  const remoteUrl = localStorage.getItem(REMOTE_URL_KEY) || DEFAULT_REMOTE_URL;
  if (remoteUrl) {
    try {
      const url = new URL(remoteUrl);
      url.searchParams.set("t", Date.now());
      const response = await fetch(url.toString());
      const remoteState = await response.json();
      if (response.ok && remoteState) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(remoteState));
        return normalizeState(remoteState);
      }
    } catch {
      // Fallback to local cache below.
    }
  }

  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (stored) return normalizeState(stored);
  } catch {
    return defaultState;
  }
  return defaultState;
}

function normalizeState(input) {
  return {
    teams: input.teams || [],
    members: input.members || [],
    matches: (input.matches || []).filter((match) => match.teamAId && match.teamBId),
  };
}

function getMember(state, memberId) {
  return state.members.find((member) => member.id === memberId);
}

function ratingKey(player) {
  if (player.memberId) return `member:${player.memberId}`;
  return `guest:${player.name.trim().toLowerCase()}`;
}

function ratingLabel(state, player) {
  if (player.memberId) return getMember(state, player.memberId)?.name || player.name || "Hội viên";
  return player.name;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function average(values) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (!valid.length) return BASE_RATING;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function matchWeight(type) {
  if (type === "tournament") return 1.25;
  if (type === "club") return 1.1;
  return 1;
}

function expectedShare(ratingA, ratingB) {
  const winProbability = 1 / (1 + 10 ** ((ratingB - ratingA) / 1.2));
  return clamp(0.5 + (winProbability - 0.5) * 0.72, 0.16, 0.84);
}

function ratingDelta(actualShare, expected, participantMatches, type) {
  const stability = Math.max(0.42, 1 / Math.sqrt(participantMatches + 1));
  return (actualShare - expected) * 0.18 * stability * matchWeight(type);
}

function createRatingRow(state, player) {
  return {
    key: ratingKey(player),
    name: ratingLabel(state, player),
    type: player.memberId ? "Hội viên CLB" : "Khách ngoài CLB",
    singles: BASE_RATING,
    doubles: BASE_RATING,
    singlesMatches: 0,
    doublesMatches: 0,
  };
}

function ensureRating(state, rows, player) {
  const key = ratingKey(player);
  if (!rows.has(key)) rows.set(key, createRatingRow(state, player));
  return rows.get(key);
}

function buildRatings(state, matches = state.matches) {
  const rows = new Map();

  state.members.forEach((member) => {
    ensureRating(state, rows, { memberId: member.id, name: member.name });
  });

  matches.forEach((match) => {
    const field = match.format === "doubles" ? "doubles" : "singles";
    const countField = match.format === "doubles" ? "doublesMatches" : "singlesMatches";
    const sideA = (match.playersA || []).map((player) => ensureRating(state, rows, player));
    const sideB = (match.playersB || []).map((player) => ensureRating(state, rows, player));
    if (!sideA.length || !sideB.length) return;

    const totalPoints = match.scoreA + match.scoreB;
    if (!totalPoints) return;

    const ratingA = average(sideA.map((row) => row[field]));
    const ratingB = average(sideB.map((row) => row[field]));
    const actualA = match.scoreA / totalPoints;
    const deltaA = ratingDelta(actualA, expectedShare(ratingA, ratingB), average(sideA.map((row) => row[countField])), match.type);

    sideA.forEach((row) => {
      row[field] = clamp(row[field] + deltaA, MIN_RATING, MAX_RATING);
      row[countField] += 1;
    });

    sideB.forEach((row) => {
      row[field] = clamp(row[field] - deltaA, MIN_RATING, MAX_RATING);
      row[countField] += 1;
    });
  });

  return rows;
}

function overallRating(row) {
  return average([row.singles, row.doubles]);
}

function sortedCurrentRows(state) {
  return [...buildRatings(state).values()].sort((a, b) => {
    return overallRating(b) - overallRating(a) || b.singlesMatches + b.doublesMatches - (a.singlesMatches + a.doublesMatches);
  });
}

function monthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function monthlyGainers(state) {
  const start = monthStart();
  const previousMatches = state.matches.filter((match) => new Date(match.createdAt) < start);
  const currentRatings = buildRatings(state);
  const previousRatings = buildRatings(state, previousMatches);

  return [...currentRatings.values()]
    .map((row) => {
      const previous = previousRatings.get(row.key);
      const previousValue = previous ? overallRating(previous) : BASE_RATING;
      return {
        ...row,
        gain: overallRating(row) - previousValue,
      };
    })
    .filter((row) => row.gain > 0)
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 3);
}

function renderPodium(rows) {
  const order = [1, 0, 2];
  const labels = ["#2", "#1", "#3"];
  const fallback = '<div class="empty-state">Chưa có dữ liệu xếp hạng.</div>';
  if (!rows.length) {
    document.querySelector("#podiumGrid").innerHTML = fallback;
    return;
  }

  document.querySelector("#podiumGrid").innerHTML = order
    .map((rowIndex, visualIndex) => {
      const row = rows[rowIndex];
      if (!row) return '<div class="podium-card is-empty"></div>';
      return `
        <article class="podium-card rank-${rowIndex + 1}">
          <span>${labels[visualIndex]}</span>
          <strong>${escapeHtml(row.name)}</strong>
          <em>${overallRating(row).toFixed(3)}</em>
          <small>Đơn ${row.singles.toFixed(3)} · Đôi ${row.doubles.toFixed(3)}</small>
        </article>
      `;
    })
    .join("");
}

function renderGainers(rows) {
  const container = document.querySelector("#gainList");
  if (!rows.length) {
    container.innerHTML = '<div class="empty-state">Chưa có người chơi tăng điểm trong tháng này.</div>';
    return;
  }

  container.innerHTML = rows
    .map(
      (row, index) => `
        <article class="gain-card">
          <span>${index + 1}</span>
          <div>
            <strong>${escapeHtml(row.name)}</strong>
            <small>${escapeHtml(row.type)}</small>
          </div>
          <em>+${row.gain.toFixed(3)}</em>
        </article>
      `
    )
    .join("");
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

async function render() {
  const state = await loadState();
  const now = new Date();
  document.querySelector("#displayDate").textContent = now.toLocaleDateString("vi-VN");
  document.querySelector("#displayCount").textContent = `${state.matches.length} trận đã lưu`;
  document.querySelector("#monthLabel").textContent = `Tháng ${now.getMonth() + 1}/${now.getFullYear()}`;
  renderPodium(sortedCurrentRows(state).slice(0, 3));
  renderGainers(monthlyGainers(state));
}

async function exportImage() {
  const button = document.querySelector("#exportImageBtn");
  if (!window.html2canvas) {
    alert("Chưa tải được thư viện xuất ảnh. Hãy kiểm tra kết nối internet rồi thử lại.");
    return;
  }

  button.disabled = true;
  button.textContent = "Đang xuất...";

  try {
    await document.fonts?.ready;
    const target = document.querySelector(".display-screen");
    const canvas = await window.html2canvas(target, {
      backgroundColor: "#f6faf3",
      scale: Math.min(2, window.devicePixelRatio || 1),
      useCORS: true,
    });
    const link = document.createElement("a");
    link.download = `bang-xep-hang-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  } catch (error) {
    alert("Không xuất được ảnh. Hãy thử lại sau.");
  } finally {
    button.disabled = false;
    button.textContent = "Xuất ảnh PNG";
  }
}

render();
window.setInterval(render, 15000);
document.querySelector("#exportImageBtn").addEventListener("click", exportImage);
