const $ = (selector) => document.querySelector(selector);
const canvas = $("#game"), ctx = canvas.getContext("2d");
const overlay = $("#overlay"), title = $("#overlayTitle"), message = $("#overlayText"), tag = $("#overlayTag");
const startBtn = $("#startBtn"), draftSettings = $("#draftSettings"), targetScore = $("#targetScore"), targetDisplay = $("#targetDisplay");
const banCountSelect = $("#banCount"), gameModeSelect = $("#gameMode"), difficultySelect = $("#difficulty");
const difficultyPicker = $("#difficultyPicker"), draftPlayer2Label = $("#draftPlayer2Label");
const player2Label = $("#player2Label"), player2SkillLabel = $("#player2SkillLabel"), player2SkillKeys = $("#player2SkillKeys");
const loadoutPicker = $("#loadoutPicker"), loadoutEls = [$("#loadout1"), $("#loadout2")];
const banEls = [$("#bans1"), $("#bans2")], draftPool = $("#draftPool");
const draftPhaseEl = $("#draftPhase"), draftTurnEl = $("#draftTurn");
const scoreEls = [$("#score1"), $("#score2")], soundBtn = $("#soundBtn");
const skillBtns = [...document.querySelectorAll("[data-player][data-skill]")], charges = [$("#charge1"), $("#charge2")];
const W = canvas.width, H = canvas.height, keys = {}, particles = [];
const SKILL_DURATION = 3000;
const SKILLS = {
  overdrive: { label: "오버드라이브", cooldown: 5000, keys: ["Q", "U"] },
  turbo: { label: "터보 볼", cooldown: 5000, keys: ["E", "I"] },
  emp: { label: "EMP", cooldown: 7000, keys: ["R", "O"] },
  flip: { label: "방향 반전", cooldown: 7000, keys: ["F", "P"] },
  cloak: { label: "클로킹", cooldown: 10000, keys: ["G", "["] },
  stasis: { label: "타임 스톱", cooldown: 7000, keys: ["H", "]"] },
  blink: { label: "블링크", cooldown: 8000 },
  reverse: { label: "리버스 기어", cooldown: 9000 },
  curve: { label: "커브 샷", cooldown: 7000 },
  deflector: { label: "디플렉터", cooldown: 10000 },
  minimize: { label: "미니멀라이즈", cooldown: 9000 },
  afterimage: { label: "애프터이미지", cooldown: 8000 }
};
const SKILL_COOLDOWNS = Object.fromEntries(Object.entries(SKILLS).map(([id, skill]) => [id, skill.cooldown]));
const PLAYER_SKILL_KEYS = [["E", "R", "T"], ["I", "O", "P"]];
let selectedSkills = [new Set(), new Set()];
let skillKeyMaps = [{}, {}];
let draftPicks = [[], []], draftBans = [[], []], draftStarter = 0, draftStep = 0, draftPhase = "ban";
let banCount = 3;
let gameMode = "multi", aiDifficulty = "normal", aiDraftTimer = 0, draftGeneration = 0;
let aiTargetY = H / 2, aiNextThinkAt = 0, aiNextSkillAt = 0;
let scores = [0, 0], state = "ready", countdown = 0, winScore = 7, soundOn = true, audio;

const AI_LEVELS = {
  easy: { speed: 3.8, reaction: 300, error: 85, prediction: 0, skillDelay: 3200 },
  normal: { speed: 5.5, reaction: 150, error: 35, prediction: .55, skillDelay: 2300 },
  hard: { speed: 7, reaction: 70, error: 10, prediction: 1, skillDelay: 1500 }
};

for (let i = 1; i <= 10; i++) {
  const option = document.createElement("option");
  option.value = i; option.textContent = `${i}점`; option.selected = i === 7;
  targetScore.append(option);
}

for (let i = 0; i <= 3; i++) {
  const option = document.createElement("option");
  option.value = i; option.textContent = `${i}개씩`; option.selected = i === banCount;
  banCountSelect.append(option);
}

function applyDraft() {
  if (draftPhase !== "complete" || draftPicks.some((picks) => picks.length !== 3)) return false;
  selectedSkills = draftPicks.map((picks) => new Set(picks));
  skillKeyMaps = draftPicks.map((picks, player) =>
    Object.fromEntries(picks.map((skill, index) => [skill, PLAYER_SKILL_KEYS[player][index]]))
  );
  skillBtns.forEach((button) => {
    button.hidden = !selectedSkills[Number(button.dataset.player)].has(button.dataset.skill);
  });
  return true;
}

function scheduleAiDraft(currentPlayer) {
  clearTimeout(aiDraftTimer);
  if (gameMode !== "single" || currentPlayer !== 1 || draftPhase === "complete") return;
  const generation = draftGeneration;
  aiDraftTimer = setTimeout(() => {
    if (generation !== draftGeneration || gameMode !== "single") return;
    const available = Object.keys(SKILLS).filter((skill) =>
      !draftBans.some((bans) => bans.includes(skill)) &&
      !draftPicks.some((picks) => picks.includes(skill))
    );
    const skill = available[Math.floor(Math.random() * available.length)];
    if (skill) chooseDraftSkill(skill, true);
  }, 450);
}

function renderDraft() {
  const complete = draftPhase === "complete";
  const currentPlayer = (draftStarter + draftStep) % 2;
  const aiTurn = gameMode === "single" && currentPlayer === 1 && !complete;
  const banSteps = banCount * 2;
  loadoutEls.forEach((container, player) => {
    container.replaceChildren();
    draftPicks[player].forEach((id, index) => {
      const pick = document.createElement("span");
      pick.className = "draft-pick";
      const key = gameMode === "single" && player === 1 ? "AI" : PLAYER_SKILL_KEYS[player][index];
      pick.textContent = `${key} · ${SKILLS[id].label}`;
      container.append(pick);
    });
    if (!draftPicks[player].length) {
      const empty = document.createElement("span");
      empty.className = "draft-empty"; empty.textContent = "아직 선택 없음";
      container.append(empty);
    }
    banEls[player].replaceChildren();
    draftBans[player].forEach((id) => {
      const ban = document.createElement("span");
      ban.className = "draft-ban";
      ban.textContent = SKILLS[id].label;
      banEls[player].append(ban);
    });
    if (!draftBans[player].length) {
      const empty = document.createElement("span");
      empty.className = "draft-empty"; empty.textContent = "아직 밴 없음";
      banEls[player].append(empty);
    }
  });
  [...draftPool.children].forEach((button) => {
    const id = button.dataset.skill;
    const banned = draftBans.some((bans) => bans.includes(id));
    const picked = draftPicks.some((picks) => picks.includes(id));
    button.disabled = banned || picked || complete || aiTurn;
    button.classList.toggle("banned", banned);
    button.classList.toggle("picked", picked);
    button.dataset.phase = draftPhase;
  });
  if (draftPhase === "ban") {
    draftPhaseEl.textContent = `BAN PHASE · ${draftStep}/${banSteps}`;
    draftTurnEl.textContent = aiTurn ? "AI 밴 선택 중" : `PLAYER ${currentPlayer + 1} 밴 차례`;
    message.textContent = aiTurn ? "AI가 제외할 스킬을 고르고 있습니다." : `PLAYER ${currentPlayer + 1}이 제외할 스킬을 선택하세요.`;
  } else if (draftPhase === "pick") {
    draftPhaseEl.textContent = `PICK PHASE · ${draftStep}/6`;
    draftTurnEl.textContent = aiTurn ? "AI 스킬 선택 중" : `PLAYER ${currentPlayer + 1} 선택 차례`;
    message.textContent = aiTurn ? "AI가 사용할 스킬을 고르고 있습니다." : `PLAYER ${currentPlayer + 1}이 사용할 스킬을 선택하세요.`;
  } else {
    draftPhaseEl.textContent = "DRAFT COMPLETE";
    draftTurnEl.textContent = "밴과 선택 완료!";
    message.textContent = "스킬 배분이 끝났습니다. 경기를 시작하세요!";
  }
  startBtn.disabled = !complete;
  startBtn.innerHTML = complete
    ? '게임 시작 <span>SPACE</span>'
    : draftPhase === "ban" ? `밴 진행 중 <span>${banCount}개씩</span>` : '스킬 선택 중 <span>3개씩</span>';
  if (complete) applyDraft();
  scheduleAiDraft(currentPlayer);
}

function chooseDraftSkill(skill, automated = false) {
  const currentPlayer = (draftStarter + draftStep) % 2;
  if (draftPhase === "complete" ||
      (gameMode === "single" && currentPlayer === 1 && !automated) ||
      draftBans.some((bans) => bans.includes(skill)) ||
      draftPicks.some((picks) => picks.includes(skill))) return;
  if (draftPhase === "ban") draftBans[currentPlayer].push(skill);
  else draftPicks[currentPlayer].push(skill);
  draftStep++;
  tone(currentPlayer === 0 ? 620 : 720, .08);
  const phaseSteps = draftPhase === "ban" ? banCount * 2 : 6;
  if (draftStep === phaseSteps) {
    if (draftPhase === "ban") {
      draftPhase = "pick";
      draftStep = 0;
    } else {
      draftPhase = "complete";
    }
  }
  renderDraft();
}

function beginDraft(firstPlayer) {
  clearTimeout(aiDraftTimer);
  draftGeneration++;
  draftStarter = gameMode === "single" ? 0 : firstPlayer;
  draftStep = 0;
  draftPhase = banCount === 0 ? "pick" : "ban";
  draftPicks = [[], []];
  draftBans = [[], []];
  selectedSkills = [new Set(), new Set()];
  skillKeyMaps = [{}, {}];
  skillBtns.forEach((button) => button.hidden = true);
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
  { x: 42, y: H / 2 - 55, w: 15, h: 110, baseH: 110, color: "#42f5e9", activeUntil: 0, frozenUntil: 0, reversedUntil: 0, shrunkenUntil: 0, shieldUntil: 0, cooldowns: {} },
  { x: W - 57, y: H / 2 - 55, w: 15, h: 110, baseH: 110, color: "#ff4fa3", activeUntil: 0, frozenUntil: 0, reversedUntil: 0, shrunkenUntil: 0, shieldUntil: 0, cooldowns: {} }
];
const ball = {
  x: W / 2, y: H / 2, r: 9, vx: 0, vy: 0, trail: [],
  turboUntil: 0, invisibleUntil: 0, cloakStartedAt: 0, cloakRevealStep: 0,
  stasisUntil: 0, curveUntil: 0, curveForce: 0,
  decoyUntil: 0, decoys: [], savedVx: 0, savedVy: 0
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
  ball.invisibleUntil = 0; ball.cloakStartedAt = 0; ball.cloakRevealStep = 0;
  ball.stasisUntil = 0; ball.savedVx = 0; ball.savedVy = 0;
  ball.curveUntil = 0; ball.curveForce = 0; ball.decoyUntil = 0; ball.decoys = [];
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
      message.textContent = `밴 ${banCount}개씩과 스킬 선택 3개씩을 마친 뒤 시작할 수 있습니다.`;
      return;
    }
    winScore = Number(targetScore.value); targetDisplay.textContent = winScore;
    scores = [0, 0]; scoreEls.forEach((el) => el.textContent = "0");
    paddles.forEach((p) => {
      p.activeUntil = 0; p.frozenUntil = 0; p.reversedUntil = 0;
      p.shrunkenUntil = 0; p.shieldUntil = 0; p.cooldowns = {}; p.h = p.baseH;
    });
    aiTargetY = H / 2; aiNextThinkAt = 0; aiNextSkillAt = performance.now() + 1200;
  }
  state = "playing"; overlay.classList.add("hidden");
  if (!isResume) {
    paddles.forEach((p) => p.y = H / 2 - p.h / 2);
    resetBall();
  }
  tone(520, .12);
}

function showOverlay(kind) {
  overlay.classList.remove("hidden"); draftSettings.hidden = kind === "pause"; loadoutPicker.hidden = kind === "pause";
  if (kind === "pause") {
    tag.textContent = "GAME PAUSED"; title.textContent = "잠시 멈춤";
    message.textContent = "ESC 또는 SPACE로 경기를 계속하세요."; startBtn.innerHTML = "계속하기 <span>SPACE</span>";
  } else {
    const winnerIndex = scores[0] > scores[1] ? 0 : 1;
    const loserIndex = 1 - winnerIndex;
    tag.textContent = gameMode === "single" ? "PLAYER 1 PICKS FIRST" : `PLAYER ${loserIndex + 1} PICKS FIRST`;
    title.textContent = gameMode === "single" && winnerIndex === 1 ? "AI 승리!" : `PLAYER ${winnerIndex + 1} 승리!`;
    beginDraft(loserIndex);
  }
}

function syncPaddleSize(p, now) {
  const targetH = p.baseH * (now < p.activeUntil ? 1.75 : 1) * (now < p.shrunkenUntil ? .5 : 1);
  if (p.h === targetH) return;
  const center = p.y + p.h / 2;
  p.h = targetH;
  p.y = Math.max(14, Math.min(H - p.h - 14, center - p.h / 2));
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
    ball.cloakStartedAt = now; ball.cloakRevealStep = 0;
    burst(ball.x, ball.y, "#7c85ff", 18); tone(620, .2);
  } else if (skill === "stasis") {
    if (now >= ball.stasisUntil) {
      ball.savedVx = ball.vx; ball.savedVy = ball.vy;
      ball.vx = 0; ball.vy = 0;
    }
    ball.stasisUntil = Math.max(ball.stasisUntil, now + 700);
    burst(ball.x, ball.y, "#ffffff", 24); tone(110, .4);
  } else if (skill === "blink") {
    p.y = Math.max(14, Math.min(H - p.h - 14, ball.y - p.h / 2));
    burst(p.x + p.w / 2, p.y + p.h / 2, p.color, 34); tone(1280, .14);
  } else if (skill === "reverse") {
    const rival = paddles[1 - player];
    rival.reversedUntil = Math.max(rival.reversedUntil, now + 1500);
    burst(rival.x + rival.w / 2, rival.y + rival.h / 2, "#ffb04a", 30); tone(210, .3);
  } else if (skill === "curve") {
    const paddleCenter = p.y + p.h / 2;
    const delta = paddleCenter - ball.y;
    ball.curveForce = Math.abs(delta) < 10 ? (ball.vy >= 0 ? -.24 : .24) : Math.sign(delta) * .24;
    ball.curveUntil = now + 1000;
    ball.turboUntil = now + 1000;
    burst(ball.x, ball.y, "#9dff74", 28); tone(1040, .22);
  } else if (skill === "deflector") {
    p.shieldUntil = now + 2000;
    burst(player === 0 ? 24 : W - 24, H / 2, p.color, 38); tone(360, .3);
  } else if (skill === "minimize") {
    const rival = paddles[1 - player];
    rival.shrunkenUntil = Math.max(rival.shrunkenUntil, now + 2000);
    syncPaddleSize(rival, now);
    burst(rival.x + rival.w / 2, rival.y + rival.h / 2, "#d37cff", 34); tone(150, .28);
  } else if (skill === "afterimage") {
    ball.decoyUntil = Math.max(ball.decoyUntil, now + 1500);
    ball.decoys = [-.55, .55].map((angle) => ({
      x: ball.x,
      y: ball.y,
      vx: ball.vx * Math.cos(angle) - ball.vy * Math.sin(angle),
      vy: ball.vx * Math.sin(angle) + ball.vy * Math.cos(angle),
      trail: []
    }));
    burst(ball.x, ball.y, "#77ddff", 24); tone(820, .25);
  }
}

function updateSkills(now) {
  paddles.forEach((p, i) => {
    const active = now < p.activeUntil;
    syncPaddleSize(p, now);
    const playerButtons = skillBtns.filter((button) => Number(button.dataset.player) === i);
    playerButtons.forEach((button) => {
      const skill = button.dataset.skill;
      const remaining = Math.max(0, (p.cooldowns[skill] || 0) - now);
      button.disabled = remaining > 0 || state !== "playing" || (gameMode === "single" && i === 1);
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
    card.classList.toggle("reversed", now < p.reversedUntil);
    card.classList.toggle("shielded", now < p.shieldUntil);
  });
}

function reflectedY(y) {
  const top = 20, range = H - 40, cycle = range * 2;
  const offset = ((y - top) % cycle + cycle) % cycle;
  return top + (offset > range ? cycle - offset : offset);
}

function updateAi(now) {
  const config = AI_LEVELS[aiDifficulty];
  const cloakElapsed = now - ball.cloakStartedAt;
  const ballRevealed = now >= ball.invisibleUntil ||
    (cloakElapsed >= 300 && cloakElapsed < 390) ||
    (cloakElapsed >= 650 && cloakElapsed < 740);
  if (now >= aiNextThinkAt && ballRevealed) {
    const travelTime = ball.vx > 0 ? Math.max(0, (paddles[1].x - ball.x) / ball.vx) : 0;
    const predicted = ball.y + ball.vy * travelTime * config.prediction;
    aiTargetY = reflectedY(predicted) + (Math.random() * 2 - 1) * config.error;
    aiNextThinkAt = now + config.reaction;
  }
  if (now >= aiNextSkillAt) {
    const readySkills = draftPicks[1].filter((skill) => now >= (paddles[1].cooldowns[skill] || 0));
    if (readySkills.length) activateSkill(1, readySkills[Math.floor(Math.random() * readySkills.length)]);
    aiNextSkillAt = now + config.skillDelay + Math.random() * config.skillDelay * .5;
  }
  const center = paddles[1].y + paddles[1].h / 2;
  return Math.abs(aiTargetY - center) < 8 ? 0 : aiTargetY < center ? -1 : 1;
}

function update(now) {
  updateSkills(now);
  if (now < ball.invisibleUntil && ball.cloakStartedAt) {
    const revealTimes = [300, 650];
    if (ball.cloakRevealStep < revealTimes.length &&
        now - ball.cloakStartedAt >= revealTimes[ball.cloakRevealStep]) {
      burst(ball.x, ball.y, "#7c85ff", 12);
      ball.cloakRevealStep++;
    }
  }
  particles.forEach((p) => { p.x += p.vx; p.y += p.vy; p.vx *= .97; p.vy *= .97; p.life -= .035; });
  for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1);
  if (state !== "playing") return;

  const aiDirection = gameMode === "single" ? updateAi(now) : 0;
  paddles.forEach((p, i) => {
    if (now < p.frozenUntil) return;
    const aiControlled = gameMode === "single" && i === 1;
    const speed = aiControlled
      ? AI_LEVELS[aiDifficulty].speed * (now < p.activeUntil ? 1.3 : 1)
      : now < p.activeUntil ? 9.4 : 7.2;
    const upPressed = aiControlled ? aiDirection < 0 : i ? keys.ArrowUp : keys.w;
    const downPressed = aiControlled ? aiDirection > 0 : i ? keys.ArrowDown : keys.s;
    const reversed = now < p.reversedUntil;
    if (reversed ? downPressed : upPressed) p.y -= speed;
    if (reversed ? upPressed : downPressed) p.y += speed;
    p.y = Math.max(14, Math.min(H - p.h - 14, p.y));
  });
  if (ball.stasisUntil && now >= ball.stasisUntil && ball.vx === 0 && ball.vy === 0) {
    ball.vx = ball.savedVx; ball.vy = ball.savedVy;
    ball.stasisUntil = 0; ball.savedVx = 0; ball.savedVy = 0;
    burst(ball.x, ball.y, "#ffffff", 12); tone(540, .1);
  }
  if (countdown-- > 0) return;
  if (now < ball.stasisUntil) return;
  if (now < ball.decoyUntil) {
    ball.decoys.forEach((decoy) => {
      decoy.trail.unshift({ x: decoy.x, y: decoy.y });
      if (decoy.trail.length > 12) decoy.trail.pop();
      decoy.x += decoy.vx; decoy.y += decoy.vy;
      if (decoy.y - ball.r < 10 || decoy.y + ball.r > H - 10) {
        decoy.vy *= -1;
        decoy.y = Math.max(20, Math.min(H - 20, decoy.y));
      }
      if (decoy.x < -ball.r) decoy.x = W + ball.r;
      else if (decoy.x > W + ball.r) decoy.x = -ball.r;
    });
  }
  if (now < ball.curveUntil) ball.vy = Math.max(-9, Math.min(9, ball.vy + ball.curveForce));
  else ball.curveForce = 0;
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
  paddles.forEach((p, i) => {
    if (now >= p.shieldUntil) return;
    const shieldX = i === 0 ? 25 : W - 25;
    const hitsShield = i === 0
      ? ball.vx < 0 && ball.x - ball.r <= shieldX
      : ball.vx > 0 && ball.x + ball.r >= shieldX;
    if (!hitsShield) return;
    ball.vx = Math.abs(ball.vx) * (i === 0 ? 1 : -1);
    ball.x = i === 0 ? shieldX + ball.r : shieldX - ball.r;
    p.shieldUntil = 0;
    burst(shieldX, ball.y, p.color, 42); tone(720, .25);
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
  const now = performance.now();
  paddles.forEach((p, i) => {
    if (now < p.shieldUntil) {
      const shieldX = i === 0 ? 25 : W - 25;
      ctx.globalAlpha = .78 + Math.sin(now / 70) * .18;
      ctx.strokeStyle = p.color; ctx.lineWidth = 5; ctx.shadowBlur = 24; ctx.shadowColor = p.color;
      ctx.beginPath(); ctx.moveTo(shieldX, 50); ctx.lineTo(shieldX, H - 50); ctx.stroke();
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    }
    ctx.shadowBlur = 22; ctx.shadowColor = p.color; ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.w, p.h); ctx.shadowBlur = 0;
    if (now < p.reversedUntil) {
      ctx.strokeStyle = "#ffb04a"; ctx.lineWidth = 3;
      ctx.strokeRect(p.x - 4, p.y - 4, p.w + 8, p.h + 8);
    }
  });
  const cloaked = now < ball.invisibleUntil;
  const cloakElapsed = now - ball.cloakStartedAt;
  const cloakFlash = cloaked && (
    (cloakElapsed >= 300 && cloakElapsed < 390) ||
    (cloakElapsed >= 650 && cloakElapsed < 740)
  );
  if (!cloaked) {
    ball.trail.forEach((t, i) => {
      ctx.globalAlpha = (1 - i / ball.trail.length) * .3; ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(t.x, t.y, ball.r * (1 - i / 18), 0, Math.PI * 2); ctx.fill();
    });
    if (now < ball.decoyUntil) {
      ball.decoys.forEach((decoy) => {
        decoy.trail.forEach((t, i) => {
          ctx.globalAlpha = (1 - i / decoy.trail.length) * .3; ctx.fillStyle = "#fff";
          ctx.beginPath(); ctx.arc(t.x, t.y, ball.r * (1 - i / 18), 0, Math.PI * 2); ctx.fill();
        });
        const decoyColor = now < ball.turboUntil ? "#ffe66d" : "#fff";
        ctx.globalAlpha = 1; ctx.shadowBlur = 22; ctx.shadowColor = decoyColor; ctx.fillStyle = decoyColor;
        ctx.beginPath(); ctx.arc(decoy.x, decoy.y, ball.r, 0, Math.PI * 2); ctx.fill();
      });
      ctx.shadowBlur = 0;
    }
  }
  if (!cloaked || cloakFlash) {
    ctx.globalAlpha = cloakFlash ? .72 : 1;
    ctx.shadowBlur = 22; ctx.shadowColor = now < ball.turboUntil ? "#ffe66d" : "#fff";
    ctx.shadowColor = cloakFlash ? "#7c85ff" : ctx.shadowColor;
    ctx.fillStyle = cloakFlash ? "#b8bdff" : now < ball.turboUntil ? "#ffe66d" : "#fff";
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
    if (skill && !(gameMode === "single" && player === 1)) activateSkill(player, skill);
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
gameModeSelect.addEventListener("change", () => {
  gameMode = gameModeSelect.value;
  difficultyPicker.hidden = gameMode !== "single";
  draftPlayer2Label.textContent = gameMode === "single" ? "AI PLAYER" : "PLAYER 2";
  player2Label.textContent = gameMode === "single" ? "AI PLAYER" : "PLAYER 2";
  player2SkillLabel.textContent = gameMode === "single" ? "AI SKILLS" : "PLAYER 2 SKILLS";
  player2SkillKeys.textContent = gameMode === "single" ? "AUTO" : "I · O · P";
  tag.textContent = gameMode === "single" ? "SOLO VS AI" : "LOCAL MULTIPLAYER";
  beginDraft(0);
});
difficultySelect.addEventListener("change", () => {
  aiDifficulty = difficultySelect.value;
  aiNextThinkAt = 0;
});
banCountSelect.addEventListener("change", () => {
  banCount = Number(banCountSelect.value);
  beginDraft(draftStarter);
});
soundBtn.addEventListener("click", () => { soundOn = !soundOn; soundBtn.textContent = soundOn ? "🔊 ON" : "🔇 OFF"; });
skillBtns.forEach((btn) => btn.addEventListener("click", () => activateSkill(Number(btn.dataset.player), btn.dataset.skill)));
document.querySelectorAll("[data-key]").forEach((btn) => {
  const key = btn.dataset.key;
  ["pointerdown", "pointerenter"].forEach((evt) => btn.addEventListener(evt, (e) => { if (e.buttons || evt === "pointerdown") { keys[key] = true; e.preventDefault(); } }));
  ["pointerup", "pointerleave", "pointercancel"].forEach((evt) => btn.addEventListener(evt, () => keys[key] = false));
});
beginDraft(0);
updateSkills(performance.now()); requestAnimationFrame(loop);
