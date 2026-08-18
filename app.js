const GROUPS = ['A', 'B', 'C', 'D'];

const GROUP_META = {
  A: { label: 'Group A', tier: 'Top tier', color: 'orange' },
  B: { label: 'Group B', tier: 'Second tier', color: 'green' },
  C: { label: 'Group C', tier: 'Third tier', color: 'blue' },
  D: { label: 'Group D', tier: 'Fourth tier', color: 'purple' },
};

const DEFAULT_PLAYERS = {
  A: ['Troy', 'Paul', 'Jay', 'Kevin', 'Brock'],
  B: ['Bud', 'Rick', 'Brad', 'Peyton', 'Owen'],
  C: ['Todd', 'Bennie', 'Donnie', 'Joey', 'Jeremy'],
  D: ['David', 'Jason', 'Kade', 'William', 'Ray'],
};

const LEGACY_DEFAULT_PLAYERS = {
  A: ['Morgan', 'Casey', 'Jordan', 'Riley', 'Taylor'],
  B: ['Avery', 'Jamie', 'Drew', 'Cameron', 'Finley'],
  C: ['Parker', 'Reese', 'Quinn', 'Blake', 'Sage'],
  D: ['Rowan', 'Emery', 'Skyler', 'Charlie', 'Dakota'],
};

const RANKS = [0, 1, 2, 3, 4];
let rotationPatterns;

const DAY_NAMES = ['Friday foursomes', 'Saturday foursomes', 'Sunday foursomes'];
const STORAGE_KEY = 'fairway-four-roster-v1';

let roster = loadRoster();
let selectedDay = 0;
let draggedPlayer = null;
let toastTimer;

const rosterGrid = document.querySelector('#roster-grid');
const teamGrid = document.querySelector('#team-grid');
const dayTitle = document.querySelector('#day-title');
const toast = document.querySelector('#toast');
const puttCourse = document.querySelector('#putt-course');
const puttBall = document.querySelector('#putt-ball');
const puttCup = document.querySelector('#putt-cup');
const puttGuide = document.querySelector('#putt-guide');
const puttTrail = document.querySelector('#putt-trail');
const puttPowerBar = document.querySelector('#putt-power-bar');
const puttStatus = document.querySelector('#putt-status');
const puttHint = document.querySelector('#putt-drag-hint');
const puttReset = document.querySelector('#putt-reset');

let puttAim = null;
let puttBusy = false;

function cloneDefaultRoster() {
  return Object.fromEntries(GROUPS.map((group) => [group, DEFAULT_PLAYERS[group].map((name) => ({ name }))]));
}

function rosterMatchesNames(candidate, expected) {
  return GROUPS.every(
    (group) => candidate[group].map((player) => player.name).join('\u0000') === expected[group].join('\u0000'),
  );
}

function loadRoster() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (
      saved &&
      GROUPS.every(
        (group) =>
          Array.isArray(saved[group]) &&
          saved[group].length === 5 &&
          saved[group].every((player) => player && typeof player.name === 'string'),
      )
    ) {
      if (rosterMatchesNames(saved, LEGACY_DEFAULT_PLAYERS)) return cloneDefaultRoster();
      return saved;
    }
  } catch {
    // A fresh roster is the safest fallback when storage is unavailable or malformed.
  }
  return cloneDefaultRoster();
}

function saveRoster() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(roster));
  } catch {
    // The planner remains fully usable when browser storage is blocked.
  }
}

function escapeHTML(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderRoster() {
  rosterGrid.innerHTML = GROUPS.map((group) => {
    const meta = GROUP_META[group];
    const players = roster[group];

    return `
      <article class="group-card" data-group="${group}">
        <div class="group-card-header">
          <div class="group-name">
            <span class="group-letter" aria-hidden="true">${group}</span>
            <div>
              <div class="group-title">${meta.label}</div>
              <div class="group-subtitle">${meta.tier}</div>
            </div>
          </div>
          <span class="group-count">05 players</span>
        </div>
        <div class="player-list" role="list" aria-label="${meta.label} rankings">
          ${players
            .map(
              (player, index) => `
                <div class="player-card" draggable="true" tabindex="0" role="listitem" data-group="${group}" data-index="${index}" aria-label="${group} rank ${index + 1}, ${escapeHTML(player.name || 'unnamed player')}">
                  <span class="player-rank">0${index + 1}</span>
                  <span class="drag-grip" aria-hidden="true">⠿</span>
                  <input class="player-input" type="text" maxlength="28" value="${escapeHTML(player.name)}" placeholder="Player name" aria-label="${meta.label}, rank ${index + 1} name" data-group="${group}" data-index="${index}" />
                  <button class="move-button move-up" type="button" title="Move ${escapeHTML(player.name || 'player')} up" aria-label="Move ${escapeHTML(player.name || 'player')} up" data-group="${group}" data-index="${index}" ${index === 0 ? 'disabled' : ''}>↑</button>
                  <button class="move-button move-down" type="button" title="Move ${escapeHTML(player.name || 'player')} down" aria-label="Move ${escapeHTML(player.name || 'player')} down" data-group="${group}" data-index="${index}" ${index === players.length - 1 ? 'disabled' : ''}>↓</button>
                </div>
              `,
            )
            .join('')}
        </div>
      </article>
    `;
  }).join('');

  rosterGrid.querySelectorAll('.player-input').forEach((input) => {
    input.addEventListener('input', (event) => {
      const field = event.currentTarget;
      roster[field.dataset.group][Number(field.dataset.index)].name = field.value;
      saveRoster();
      renderTeams();
    });
  });

  rosterGrid.querySelectorAll('.move-button').forEach((button) => {
    button.addEventListener('click', () => {
      movePlayer(button.dataset.group, Number(button.dataset.index), button.classList.contains('move-up') ? -1 : 1);
    });
  });

  rosterGrid.querySelectorAll('.player-card').forEach((card) => {
    card.addEventListener('dragstart', (event) => {
      draggedPlayer = { group: card.dataset.group, index: Number(card.dataset.index) };
      card.classList.add('is-dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', `${card.dataset.group}:${card.dataset.index}`);
    });
    card.addEventListener('dragend', () => {
      draggedPlayer = null;
      card.classList.remove('is-dragging');
      rosterGrid.querySelectorAll('.is-drop-target').forEach((target) => target.classList.remove('is-drop-target'));
    });
    card.addEventListener('dragover', (event) => {
      if (draggedPlayer && draggedPlayer.group === card.dataset.group) {
        event.preventDefault();
        card.classList.add('is-drop-target');
      }
    });
    card.addEventListener('dragleave', () => card.classList.remove('is-drop-target'));
    card.addEventListener('drop', (event) => {
      event.preventDefault();
      card.classList.remove('is-drop-target');
      if (draggedPlayer && draggedPlayer.group === card.dataset.group) {
        reorderPlayer(draggedPlayer.group, draggedPlayer.index, Number(card.dataset.index));
      }
    });
    card.addEventListener('keydown', (event) => {
      if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      movePlayer(card.dataset.group, Number(card.dataset.index), event.key === 'ArrowUp' ? -1 : 1);
    });
  });
}

function movePlayer(group, index, direction) {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= roster[group].length) return;
  reorderPlayer(group, index, targetIndex);
}

function reorderPlayer(group, fromIndex, toIndex) {
  const players = roster[group];
  const [movedPlayer] = players.splice(fromIndex, 1);
  players.splice(toIndex, 0, movedPlayer);
  saveRoster();
  renderRoster();
  renderTeams();
  rosterGrid.querySelector(`.player-card[data-group="${group}"][data-index="${toIndex}"]`)?.focus();
  showToast(`${movedPlayer.name || 'Player'} is now ranked ${toIndex + 1} in Group ${group}.`);
}

function shuffle(values) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function getPermutations(values) {
  if (values.length <= 1) return [values];
  const permutations = [];
  values.forEach((value, index) => {
    const remainder = [...values.slice(0, index), ...values.slice(index + 1)];
    getPermutations(remainder).forEach((permutation) => permutations.push([value, ...permutation]));
  });
  return permutations;
}

function createBalancedDayVariants() {
  const variants = [];
  const permutations = getPermutations(RANKS);

  permutations.forEach((groupB) => {
    permutations.forEach((groupC) => {
      const groupD = RANKS.map((rank, teamIndex) => 8 - rank - groupB[teamIndex] - groupC[teamIndex]);
      if (!groupD.every((rank) => RANKS.includes(rank)) || new Set(groupD).size !== 5) return;
      variants.push(RANKS.map((rank, teamIndex) => [rank, groupB[teamIndex], groupC[teamIndex], groupD[teamIndex]]));
    });
  });

  return variants;
}

function getPairKeys(day) {
  const pairs = [];
  day.forEach((team) => {
    for (let leftGroup = 0; leftGroup < team.length; leftGroup += 1) {
      for (let rightGroup = leftGroup + 1; rightGroup < team.length; rightGroup += 1) {
        pairs.push(`${leftGroup}:${team[leftGroup]}|${rightGroup}:${team[rightGroup]}`);
      }
    }
  });
  return pairs;
}

function buildRandomRotation() {
  const variants = createBalancedDayVariants();

  function search(dayIndex, usedPairs, days) {
    if (dayIndex === 3) return days;

    const candidates = shuffle(variants).filter((candidate) => {
      const candidatePairs = getPairKeys(candidate);
      return candidatePairs.every((pair) => !usedPairs.has(pair));
    });

    for (const candidate of candidates) {
      const nextPairs = new Set(usedPairs);
      getPairKeys(candidate).forEach((pair) => nextPairs.add(pair));
      const result = search(dayIndex + 1, nextPairs, [...days, shuffle(candidate).map((team) => [...team])]);
      if (result) return result;
    }

    return null;
  }

  const rotation = search(0, new Set(), []);
  if (!rotation) throw new Error('Unable to create a balanced three-day rotation');
  return rotation;
}

function getTeamKeys(day) {
  return day.map((team) => team
    .map((rankIndex, groupIndex) => `${groupIndex}:${rankIndex}`)
    .sort()
    .join('|'));
}

function buildNewRotation() {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const nextRotation = buildRandomRotation();
    if (!rotationPatterns || nextRotation.every((day, dayIndex) => {
      const previousTeams = new Set(getTeamKeys(rotationPatterns[dayIndex]));
      return getTeamKeys(day).every((team) => !previousTeams.has(team));
    })) {
      return nextRotation;
    }
  }

  throw new Error('Unable to create a fresh three-day rotation');
}

function getScore(groupIndex, rankIndex) {
  return 20 - groupIndex * 5 - rankIndex;
}

function buildTeams(dayIndex) {
  return rotationPatterns[dayIndex].map((teamPattern) =>
    teamPattern.map((rankIndex, groupIndex) => ({
      group: GROUPS[groupIndex],
      name: roster[GROUPS[groupIndex]][rankIndex].name.trim() || `${GROUPS[groupIndex]}${rankIndex + 1}`,
      rank: rankIndex + 1,
      score: getScore(groupIndex, rankIndex),
    })),
  );
}

function renderTeams() {
  const teams = buildTeams(selectedDay);
  dayTitle.textContent = DAY_NAMES[selectedDay];

  teamGrid.innerHTML = teams.map((team, teamIndex) => {
    const total = team.reduce((sum, player) => sum + player.score, 0);
    return `
      <article class="team-card">
        <div class="team-card-top">
          <span class="team-index">TEAM 0${teamIndex + 1}</span>
          <span class="team-score">${total}<small>score</small></span>
        </div>
        <div class="team-players">
          ${team.map((player) => `
            <div class="team-player" title="Group ${player.group}, rank ${player.rank}">
              <span class="team-player-badge">${player.group}</span>
              <span class="team-player-name">${escapeHTML(player.name)}</span>
            </div>
          `).join('')}
        </div>
        <div class="team-meter" aria-label="Team score ${total} out of 42"><span></span></div>
      </article>
    `;
  }).join('');
}

function setDay(dayIndex) {
  selectedDay = dayIndex;
  document.querySelectorAll('.day-tab').forEach((tab) => {
    const isActive = Number(tab.dataset.day) === dayIndex;
    tab.classList.toggle('is-active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
  });
  renderTeams();
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('is-visible');
  toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2300);
}

function getCoursePoint(element) {
  const courseRect = puttCourse.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  return {
    x: elementRect.left - courseRect.left + elementRect.width / 2,
    y: elementRect.top - courseRect.top + elementRect.height / 2,
  };
}

function getPointerPoint(event) {
  const courseRect = puttCourse.getBoundingClientRect();
  return { x: event.clientX - courseRect.left, y: event.clientY - courseRect.top };
}

function setPuttPower(power) {
  puttPowerBar.style.setProperty('--putt-power', `${Math.round(power * 100)}%`);
}

function drawPuttGuide(origin, direction, power) {
  const angle = Math.atan2(direction.y, direction.x);
  const length = 35 + power * 105;
  puttGuide.style.left = `${origin.x}px`;
  puttGuide.style.top = `${origin.y}px`;
  puttGuide.style.bottom = 'auto';
  puttGuide.style.width = `${length}px`;
  puttGuide.style.transform = `rotate(${angle}rad)`;
  puttGuide.classList.add('is-visible');
  setPuttPower(power);
}

function clearPuttGuide() {
  puttGuide.classList.remove('is-visible');
  setPuttPower(0);
}

function resetPutt() {
  puttAim = null;
  puttBusy = false;
  puttBall.style.left = '25%';
  puttBall.style.top = '75%';
  puttBall.classList.remove('is-aiming', 'is-sunk');
  puttCup.classList.remove('is-sunk');
  puttTrail.style.width = '0';
  puttTrail.style.transform = '';
  clearPuttGuide();
  puttHint.classList.remove('is-hidden');
  puttStatus.textContent = 'Ready on the tee';
}

function takePutt(shot) {
  const courseRect = puttCourse.getBoundingClientRect();
  const cup = getCoursePoint(puttCup);
  const toCup = { x: cup.x - shot.origin.x, y: cup.y - shot.origin.y };
  const distanceToCup = Math.hypot(toCup.x, toCup.y);
  const targetDirection = { x: toCup.x / distanceToCup, y: toCup.y / distanceToCup };
  const aimDot = Math.max(-1, Math.min(1, shot.direction.x * targetDirection.x + shot.direction.y * targetDirection.y));
  const aimError = Math.acos(aimDot);
  const travel = 30 + shot.power * 170;
  const isHoled = aimError < 0.18 && shot.power > 0.55 && travel >= distanceToCup - 18;
  const end = isHoled
    ? cup
    : {
        x: Math.min(courseRect.width - 10, Math.max(10, shot.origin.x + shot.direction.x * travel)),
        y: Math.min(courseRect.height - 10, Math.max(10, shot.origin.y + shot.direction.y * travel)),
      };

  const travelX = end.x - shot.origin.x;
  const travelY = end.y - shot.origin.y;
  const travelDistance = Math.hypot(travelX, travelY);
  const travelAngle = Math.atan2(travelY, travelX);
  puttTrail.style.left = `${shot.origin.x}px`;
  puttTrail.style.top = `${shot.origin.y}px`;
  puttTrail.style.bottom = 'auto';
  puttTrail.style.width = `${travelDistance}px`;
  puttTrail.style.transform = `rotate(${travelAngle}rad)`;
  puttBall.style.left = `${end.x - puttBall.offsetWidth / 2}px`;
  puttBall.style.top = `${end.y - puttBall.offsetHeight / 2}px`;
  puttBall.classList.remove('is-aiming');
  puttBusy = true;
  puttBall.addEventListener('transitionend', () => { puttBusy = false; }, { once: true });
  clearPuttGuide();

  if (isHoled) {
    puttCup.classList.add('is-sunk');
    puttBall.classList.add('is-sunk');
    puttStatus.textContent = 'Holed it — reset for another go';
    return;
  }

  puttStatus.textContent = aimError >= 0.18 ? 'Off the line — try another read' : 'Short putt — draw a little more power';
}

function takePerfectPutt() {
  if (puttBusy || puttCup.classList.contains('is-sunk')) return;
  const origin = getCoursePoint(puttBall);
  const cup = getCoursePoint(puttCup);
  const vector = { x: cup.x - origin.x, y: cup.y - origin.y };
  const distance = Math.hypot(vector.x, vector.y);
  takePutt({ origin, direction: { x: vector.x / distance, y: vector.y / distance }, power: 1 });
}

function beginPutt(event) {
  if (puttBusy || puttCup.classList.contains('is-sunk')) return;
  const origin = getCoursePoint(puttBall);
  const point = getPointerPoint(event);
  if (Math.hypot(point.x - origin.x, point.y - origin.y) > 30) return;
  puttAim = { pointerId: event.pointerId, origin, direction: { x: 0, y: -1 }, power: 0 };
  puttCourse.setPointerCapture(event.pointerId);
  puttBall.classList.add('is-aiming');
  puttHint.classList.add('is-hidden');
  puttStatus.textContent = 'Draw your line';
  event.preventDefault();
}

function updatePuttAim(event) {
  if (!puttAim || event.pointerId !== puttAim.pointerId) return;
  const point = getPointerPoint(event);
  const vector = { x: puttAim.origin.x - point.x, y: puttAim.origin.y - point.y };
  const distance = Math.min(110, Math.hypot(vector.x, vector.y));
  const direction = distance ? { x: vector.x / distance, y: vector.y / distance } : { x: 0, y: -1 };
  puttAim.direction = direction;
  puttAim.power = distance / 110;
  drawPuttGuide(puttAim.origin, direction, puttAim.power);
  event.preventDefault();
}

function finishPutt(event) {
  if (!puttAim || event.pointerId !== puttAim.pointerId) return;
  const shot = puttAim;
  puttAim = null;
  try { puttCourse.releasePointerCapture(event.pointerId); } catch { /* Pointer may already be released. */ }
  if (shot.power < 0.08) {
    puttBall.classList.remove('is-aiming');
    clearPuttGuide();
    puttHint.classList.remove('is-hidden');
    puttStatus.textContent = 'Ready on the tee';
    return;
  }
  takePutt(shot);
  event.preventDefault();
}

function cancelPuttAim() {
  if (!puttAim) return;
  puttAim = null;
  puttBall.classList.remove('is-aiming');
  clearPuttGuide();
  puttHint.classList.remove('is-hidden');
  puttStatus.textContent = 'Ready on the tee';
}

puttCourse.addEventListener('pointerdown', beginPutt);
puttCourse.addEventListener('pointermove', updatePuttAim);
puttCourse.addEventListener('pointerup', finishPutt);
puttCourse.addEventListener('pointercancel', cancelPuttAim);
puttCourse.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  takePerfectPutt();
});
puttReset.addEventListener('click', resetPutt);

document.querySelectorAll('.day-tab').forEach((tab) => {
  tab.addEventListener('click', () => setDay(Number(tab.dataset.day)));
});

document.querySelector('#generate-button').addEventListener('click', () => {
  rotationPatterns = buildNewRotation();
  setDay(0);
  document.querySelector('#results-title').scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'start',
  });
  showToast('New three-day rotation generated. Every teammate pairing is fresh.');
});

document.querySelector('#reset-button').addEventListener('click', () => {
  roster = cloneDefaultRoster();
  saveRoster();
  renderRoster();
  renderTeams();
  showToast('Roster reset to the starter lineup.');
});

rotationPatterns = buildRandomRotation();
renderRoster();
renderTeams();
