const $ = (selector) => document.querySelector(selector);
const canvas = $("#game"), ctx = canvas.getContext("2d");
const overlay = $("#overlay"), title = $("#overlayTitle"), message = $("#overlayText"), tag = $("#overlayTag");
const startBtn = $("#startBtn"), scorePicker = $("#scorePicker"), targetScore = $("#targetScore"), targetDisplay = $("#targetDisplay");
const loadoutPicker = $("#loadoutPicker"), loadoutEls = [$("#loadout1"), $("#loadout2")];
const draftPool = $("#draftPool"), draftTurnEl = $("#draftTurn");
const scoreEls = [$("#score1"), $("#score2")], soundBtn = $("#soundBtn");
const skillBtns = [...document.querySelectorAll("[data-player][data-skill]")], charges = [$("#charge1"), $("#charge2")];
const W = canvas.width, H = canvas.height, keys = {}, particles = [];
const SKILL_DURATION = 3000;
const SKILLS = {
  overdrive: { label: "오버드라이브", cooldown: 5000, keys: ["Q", "U"] },
  turbo: { label: "터보 볼", cooldown: 5000, keys: ["E", "I"] },
  emp: { label: "EMP", cooldown: 7000, keys: ["R", "O"] },
  flip: { label: "방향 반전", cooldown: 7000, keys: ["F", "P"] },
  cloak: { label: "클로킹", cooldown: 7000, keys: ["G", "["] },
  stasis: { label: "타임 스톱", cooldown: 7000, keys: ["H", "]"] }
};
const SKILL_COOLDOWNS = Object.fromEntries(Object.entries(SKILLS).map(([id, skill]) => [id, skill.cooldown]));
const PLAYER_SKILL_KEYS = [["E", "R", "T"], ["I", "O", "P"]];
let selectedSkills = [new Set(), new Set()];
let skillKeyMaps = [{}, {}];
let draftPicks = [[], []], draftStarter = 0, draftPickCount = 0;
let scores = [0, 0], state = "ready", countdown = 0, winScore = 7, soundOn = true, audio;

for (let i = 1; i <= 10; i++) {
  const option = document.createElement("option");
  option.value = i; option.textContent = `${i}점`; option.selected = i === 7;
  targetScore.append(option);
}

function applyDraft() {
  if (draftPickCount !== 6 || draftPicks.some((picks) => picks.length !== 3)) return false;
  selectedSkills = draftPicks.map((picks) => new Set(picks));
  skillKeyMaps = draftPicks.map((picks, player) =>
    Object.fromEntries(picks.map((skill, index) => [skill, PLAYER_SKILL_KEYS[player][index]]))
  );
  skillBtns.forEach((button) => {
    button.hidden = !selectedSkills[Number(button.dataset.player)].has(button.dataset.skill);
  });
  return true;
}

function renderDraft() {
  const currentPlayer = (draftStarter + draftPickCount) % 2;
  loadoutEls.forEach((container, player) => {
    container.replaceChildren();
    draftPicks[player].forEach((id, index) => {
      const pick = document.createElement("span");
      pick.className = "draft-pick";
      pick.textContent = `${PLAYER_SKILL_KEYS[player][index]} · ${SKILLS[id].label}`;
      container.append(pick);
    });
    if (!draftPicks[player].length) {
      const empty = document.createElement("span");
      empty.className = "draft-empty"; empty.textContent = "아직 선택 없음";
      container.append(empty);
    }
  });
  [...draftPool.children].forEach((button) => {
    button.disabled = draftPicks.some((picks) => picks.includes(button.dataset.skill));
  });
  const complete = draftPickCount === 6;
  draftTurnEl.textContent = complete ? "드래프트 완료!" : `PLAYER ${currentPlayer + 1} 선택 차례 · ${draftPickCount + 1}/6`;
  message.textContent = complete
    ? "스킬 배분이 끝났습니다. 경기를 시작하세요!"
    : `PLAYER ${currentPlayer + 1}이 원하는 스킬 하나를 선택하세요.`;
  startBtn.disabled = !complete;
  startBtn.innerHTML = complete ? '게임 시작 <span>SPACE</span>' : '스킬 선택 중 <span>3개씩</span>';
  if (complete) applyDraft();
}

function chooseDraftSkill(skill) {
  if (draftPickCount >= 6 || draftPicks.some((picks) => picks.includes(skill))) return;
  const currentPlayer = (draftStarter + draftPickCount) % 2;
  draftPicks[currentPlayer].push(skill);
  draftPickCount++;
  tone(currentPlayer === 0 ? 620 : 720, .08);
  renderDraft();
}

function beginDraft(firstPlayer) {
  draftStarter = firstPlayer;
  draftPickCount = 0;
  draftPicks = [[], []];
  draftPool.replaceChildren();
  Object.entries(SKILLS).forEach(([id, skill]) => {
    const button = document.createElement("button");
    button.type = "button"; button.className = "draft-choice";
    button.dataset.skill = id; button.textContent = skill.label;
    button.addEventListener("click", () => chooseDraftSkill(id));
    draftPool.append(button);
  });
  renderDraft();
}

const paddles = [
  { x: 42, y: H / 2 - 55, w: 15, h: 110, baseH: 110, color: "#42f5e9", activeUntil: 0, frozenUntil: 0, cooldowns: {} },
  { x: W - 57, y: H / 2 - 55, w: 15, h: 110, baseH: 110, color: "#ff4fa3", activeUntil: 0, frozenUntil: 0, cooldowns: {} }
];
const ball = {
  x: W / 2, y: H / 2, r: 9, vx: 0, vy: 0, trail: [],
  turboUntil: 0, invisibleUntil: 0, stasisUntil: 0, savedVx: 0, savedVy: 0
};

function tone(freq, duration = .06) {
  if (!soundOn) return;
  audio ||= new (window.AudioContext || window.webkitAudioContext)();
  const osc = audio.createOscillator(), gain = audio.createGain();
  osc.type = "sine"; osc.frequency.value = freq;
  gain.gain.setValueAtTime(.05, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration);
  osc.connect(gain).connect(audio.destination); osc.start(); osc.stop(audio.currentTime + duration);
}

function resetBall(direction = Math.random() > .5 ? 1 : -1) {
  ball.x = W / 2; ball.y = H / 2; ball.trail = [];
  ball.invisibleUntil = 0; ball.stasisUntil = 0; ball.savedVx = 0; ball.savedVy = 0;
  const angle = Math.random() * .7 - .35;
  ball.vx = Math.cos(angle) * 5.3 * direction; ball.vy = Math.sin(angle) * 5.3; countdown = 70;
}

function burst(x, y, color, count = 18) {
  for (let i = 0; i < count; i++) particles.push({
    x, y, vx: (Math.random() - .5) * 8, vy: (Math.random() - .5) * 8, life: 1, color
  });
}

function startGame() {
  const isResume = state === "paused";
  if (state === "ready" || state === "won") {
    if (!applyDraft()) {
      message.textContent = "6개 스킬을 모두 한 개씩 선택한 뒤 시작할 수 있습니다.";
      return;
    }
    winScore = Number(targetScore.value); targetDisplay.textContent = winScore;
    scores = [0, 0]; scoreEls.forEach((el) => el.textContent = "0");
    paddles.forEach((p) => { p.activeUntil = 0; p.frozenUntil = 0; p.cooldowns = {}; p.h = p.baseH; });
  }
  state = "playing"; overlay.classList.add("hidden");
  if (!isResume) {
    paddles.forEach((p) => p.y = H / 2 - p.h / 2);
    resetBall();
  }
  tone(520, .12);
}

function showOverlay(kind) {
  overlay.classList.remove("hidden"); scorePicker.hidden = kind === "pause"; loadoutPicker.hidden = kind === "pause";
  if (kind === "pause") {
    tag.textContent = "GAME PAUSED"; title.textContent = "잠시 멈춤";
    message.textContent = "ESC 또는 SPACE로 경기를 계속하세요."; startBtn.innerHTML = "계속하기 <span>SPACE</span>";
  } else {
    const winnerIndex = scores[0] > scores[1] ? 0 : 1;
    const loserIndex = 1 - winnerIndex;
    tag.textContent = `PLAYER ${loserIndex + 1} PICKS FIRST`;
    title.textContent = `PLAYER ${winnerIndex + 1} 승리!`;
    beginDraft(loserIndex);
  }
}

function activateSkill(player, skill) {
  const now = performance.now(), p = paddles[player];
  if (state !== "playing" || !selectedSkills[player].has(skill) || now < (p.cooldowns[skill] || 0)) return;
  p.cooldowns[skill] = now + SKILL_COOLDOWNS[skill];
  if (skill === "overdrive") {
    p.activeUntil = now + SKILL_DURATION;
    const center = p.y + p.h / 2;
    p.h = p.baseH * 1.75; p.y = Math.max(14, Math.min(H - p.h - 14, center - p.h / 2));
    burst(p.x + (player ? 0 : p.w), p.y + p.h / 2, p.color, 30); tone(760, .2);
  } else if (skill === "turbo") {
    const isStopped = now < ball.stasisUntil;
    const sourceVx = isStopped ? ball.savedVx : ball.vx;
    const sourceVy = isStopped ? ball.savedVy : ball.vy;
    const speed = Math.hypot(sourceVx, sourceVy);
    if (speed > 0) {
      const multiplier = Math.min(1.65, 13.5 / speed);
      if (isStopped) {
        ball.savedVx *= multiplier; ball.savedVy *= multiplier;
      } else {
        ball.vx *= multiplier; ball.vy *= multiplier;
      }
      ball.turboUntil = now + 1400;
    }
    burst(ball.x, ball.y, p.color, 32); tone(940, .2);
  } else if (skill === "emp") {
    const rival = paddles[1 - player];
    rival.frozenUntil = now + 500;
    burst(rival.x + rival.w / 2, rival.y + rival.h / 2, "#dffcff", 36); tone(180, .35);
  } else if (skill === "flip") {
    const isStopped = now < ball.stasisUntil;
    const currentVy = isStopped ? ball.savedVy : ball.vy;
    const flippedVy = (currentVy >= 0 ? -1 : 1) * Math.max(3.5, Math.abs(currentVy));
    if (isStopped) ball.savedVy = flippedVy;
    else ball.vy = flippedVy;
    ball.turboUntil = now + 600;
    burst(ball.x, ball.y, "#b8ff5a", 28); tone(1120, .18);
  } else if (skill === "cloak") {
    ball.invisibleUntil = Math.max(ball.invisibleUntil, now + 1000);
    burst(ball.x, ball.y, "#7c85ff", 18); tone(620, .2);
  } else if (skill === "stasis") {
    if (now >= ball.stasisUntil) {
      ball.savedVx = ball.vx; ball.savedVy = ball.vy;
      ball.vx = 0; ball.vy = 0;
    }
    ball.stasisUntil = Math.max(ball.stasisUntil, now + 700);
    burst(ball.x, ball.y, "#ffffff", 24); tone(110, .4);
  }
}

function updateSkills(now) {
  paddles.forEach((p, i) => {
    const active = now < p.activeUntil;
    if (!active && p.h !== p.baseH) {
      const center = p.y + p.h / 2;
      p.h = p.baseH; p.y = Math.max(14, Math.min(H - p.h - 14, center - p.h / 2));
    }
    const playerButtons = skillBtns.filter((button) => Number(button.dataset.player) === i);
    playerButtons.forEach((button) => {
      const skill = button.dataset.skill;
      const remaining = Math.max(0, (p.cooldowns[skill] || 0) - now);
      button.disabled = remaining > 0 || state !== "playing";
      const label = SKILLS[skill].label;
      const key = skillKeyMaps[i][skill] || "·";
      button.innerHTML = remaining ? `<b>${Math.ceil(remaining / 1000)}s</b> ${label}` : `<b>${key}</b> ${label}`;
    });
    const cooldownRatios = Object.keys(SKILL_COOLDOWNS).map((skill) =>
      Math.max(0, (p.cooldowns[skill] || 0) - now) / SKILL_COOLDOWNS[skill]
    );
    charges[i].style.width = `${(1 - Math.max(...cooldownRatios)) * 100}%`;
    const card = playerButtons[0].closest(".skill-card");
    card.classList.toggle("active", active);
    card.classList.toggle("frozen", now < p.frozenUntil);
  });
}

function update(now) {
  updateSkills(now);
  particles.forEach((p) => { p.x += p.vx; p.y += p.vy; p.vx *= .97; p.vy *= .97; p.life -= .035; });
  for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1);
  if (state !== "playing") return;

  paddles.forEach((p, i) => {
    if (now < p.frozenUntil) return;
    const speed = now < p.activeUntil ? 9.4 : 7.2;
    if (i ? keys.ArrowUp : keys.w) p.y -= speed;
    if (i ? keys.ArrowDown : keys.s) p.y += speed;
    p.y = Math.max(14, Math.min(H - p.h - 14, p.y));
  });
  if (ball.stasisUntil && now >= ball.stasisUntil && ball.vx === 0 && ball.vy === 0) {
    ball.vx = ball.savedVx; ball.vy = ball.savedVy;
    ball.stasisUntil = 0; ball.savedVx = 0; ball.savedVy = 0;
    burst(ball.x, ball.y, "#ffffff", 12); tone(540, .1);
  }
  if (countdown-- > 0) return;
  if (now < ball.stasisUntil) return;
  ball.trail.unshift({ x: ball.x, y: ball.y }); if (ball.trail.length > 12) ball.trail.pop();
  ball.x += ball.vx; ball.y += ball.vy;
  if (ball.y - ball.r < 10 || ball.y + ball.r > H - 10) {
    ball.vy *= -1; ball.y = Math.max(20, Math.min(H - 20, ball.y)); tone(260);
  }
  paddles.forEach((p, i) => {
    const approaching = i === 0 ? ball.vx < 0 : ball.vx > 0;
    if (approaching && ball.x + ball.r > p.x && ball.x - ball.r < p.x + p.w &&
        ball.y + ball.r > p.y && ball.y - ball.r < p.y + p.h) {
      const hit = (ball.y - (p.y + p.h / 2)) / (p.h / 2), nextSpeed = Math.min(12.5, Math.abs(ball.vx) + .45);
      ball.vx = nextSpeed * (i === 0 ? 1 : -1); ball.vy = hit * 7;
      ball.x = i === 0 ? p.x + p.w + ball.r : p.x - ball.r;
      burst(ball.x, ball.y, p.color); tone(420 + nextSpeed * 25);
    }
  });
  if (ball.x < -30 || ball.x > W + 30) {
    const scorer = ball.x < 0 ? 1 : 0;
    scores[scorer]++; scoreEls[scorer].textContent = scores[scorer];
    burst(ball.x < 0 ? 30 : W - 30, ball.y, paddles[scorer].color); tone(150, .25);
    if (scores[scorer] >= winScore) { state = "won"; showOverlay("won"); tone(660, .5); }
    else resetBall(scorer === 0 ? -1 : 1);
  }
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  const grad = ctx.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, W * .65);
  grad.addColorStop(0, "#15172c"); grad.addColorStop(1, "#080914"); ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#282a3d"; ctx.lineWidth = 2; ctx.setLineDash([9, 13]);
  ctx.beginPath(); ctx.moveTo(W / 2, 24); ctx.lineTo(W / 2, H - 24); ctx.stroke();
  ctx.setLineDash([]); ctx.beginPath(); ctx.arc(W / 2, H / 2, 70, 0, Math.PI * 2); ctx.stroke();
  paddles.forEach((p) => { ctx.shadowBlur = 22; ctx.shadowColor = p.color; ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, p.w, p.h); ctx.shadowBlur = 0; });
  const ballVisible = performance.now() >= ball.invisibleUntil;
  if (ballVisible) {
    ball.trail.forEach((t, i) => {
      ctx.globalAlpha = (1 - i / ball.trail.length) * .3; ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(t.x, t.y, ball.r * (1 - i / 18), 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1; ctx.shadowBlur = 22; ctx.shadowColor = performance.now() < ball.turboUntil ? "#ffe66d" : "#fff";
    ctx.fillStyle = performance.now() < ball.turboUntil ? "#ffe66d" : "#fff";
    ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
  }
  particles.forEach((p) => { ctx.globalAlpha = p.life; ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, 4, 4); });
  ctx.globalAlpha = 1;
  if (state === "playing" && countdown > 0) {
    ctx.fillStyle = "#ffffffaa"; ctx.font = "900 13px Montserrat"; ctx.textAlign = "center";
    ctx.fillText(countdown > 35 ? "READY" : "GO!", W / 2, H / 2 + 115);
  }
}

function loop(now) { update(now); draw(); requestAnimationFrame(loop); }
window.addEventListener("keydown", (e) => {
  if (["ArrowUp", "ArrowDown", " "].includes(e.key)) e.preventDefault();
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key; keys[key] = true;
  const skillSlots = { e: [0, 0], r: [0, 1], t: [0, 2], i: [1, 0], o: [1, 1], p: [1, 2] };
  if (!e.repeat && skillSlots[key]) {
    const [player, slot] = skillSlots[key];
    const skill = draftPicks[player][slot];
    if (skill) activateSkill(player, skill);
  }
  if (e.key === " " && state !== "playing") startGame();
  if (e.key === "Escape") {
    if (state === "playing") { state = "paused"; showOverlay("pause"); }
    else if (state === "paused") startGame();
  }
});
window.addEventListener("keyup", (e) => keys[e.key.length === 1 ? e.key.toLowerCase() : e.key] = false);
startBtn.addEventListener("click", startGame);
targetScore.addEventListener("change", () => targetDisplay.textContent = targetScore.value);
soundBtn.addEventListener("click", () => { soundOn = !soundOn; soundBtn.textContent = soundOn ? "🔊 ON" : "🔇 OFF"; });
skillBtns.forEach((btn) => btn.addEventListener("click", () => activateSkill(Number(btn.dataset.player), btn.dataset.skill)));
document.querySelectorAll("[data-key]").forEach((btn) => {
  const key = btn.dataset.key;
  ["pointerdown", "pointerenter"].forEach((evt) => btn.addEventListener(evt, (e) => { if (e.buttons || evt === "pointerdown") { keys[key] = true; e.preventDefault(); } }));
  ["pointerup", "pointerleave", "pointercancel"].forEach((evt) => btn.addEventListener(evt, () => keys[key] = false));
});
beginDraft(0);
updateSkills(performance.now()); requestAnimationFrame(loop);
