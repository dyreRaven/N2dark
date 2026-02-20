const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const VIEW_WIDTH = canvas.width;
const VIEW_HEIGHT = canvas.height;
const WORLD_WIDTH = 2500;

const keys = new Set();
let wantsJump = false;
let wantsInteract = false;
let wantsCraftPickaxe = false;
let wantsCraftAxe = false;
let wantsRespawn = false;
let inventoryOpen = false;
let mapOpen = false;
let pauseMenuOpen = false;
let respawnMenuOpen = false;
let gameStarted = false;
let noticeText = "";
let noticeTimer = 0;
let craftSelection = "pickaxe";
let selectedInventoryTool = "hands";
let currentZone = "beach";
let signedInUser = "";
let menuStatusText = "";
let signedInEmail = "";
let googleAuthReady = false;
let googleSignInPending = false;
let googleSignInRetryTimeoutId = null;
let worldSaves = [];
let selectedWorldId = "";
let activeWorldId = "";
let worldAutoSaveTimer = 0;
let wasInActiveGame = false;
let isMultiplayerGame = false;
let multiplayerSocket = null;
let multiplayerConnected = false;
let multiplayerIsHost = false;
let multiplayerServerUrl = "";
let multiplayerWorldId = "";
let multiplayerWorldName = "";
let multiplayerPlayerId = "";
let multiplayerSendTimer = 0;
let multiplayerSaveTimer = 0;
let suppressMultiplayerCloseNotice = false;
let multiplayerHadServerError = false;
const remotePlayers = new Map();

const PLAYER_SPAWN_X = 80;
const PLAYER_SPAWN_Y = 380;
const REDWOODS_SPAWN_X = 1180;
const PLAYER_RESPAWN_SECONDS = 1.5;
const ZONE_BEACH = "beach";
const ZONE_REDWOODS = "redwoods";
const SIGNED_IN_USER_STORAGE_KEY = "ark2d_signed_in_user";
const GOOGLE_CLIENT_ID = (window.GOOGLE_CLIENT_ID || "").trim();
const GOOGLE_SIGNIN_RETRY_MS = 140;
const GOOGLE_SIGNIN_MAX_RETRIES = 36;
const WORLD_SAVES_STORAGE_PREFIX = "ark2d_world_saves_v1";
const WORLD_NAME_MAX_LENGTH = 24;
const WORLD_AUTOSAVE_SECONDS = 2.5;
const MAX_WORLD_LIST_BUTTONS = 4;
const MENU_HOME = "home";
const MENU_MODE = "mode";
const MENU_SINGLEPLAYER = "singleplayer";
let mainMenuScreen = MENU_HOME;
const MULTIPLAYER_LAST_SERVER_KEY = "ark2d_last_multiplayer_server";
const MULTIPLAYER_SEND_INTERVAL = 0.1;
const MULTIPLAYER_SAVE_INTERVAL = 3;

const inputState = {
  hotbarSlotRects: [],
  musicToggleRect: null,
  mainMenu: {
    playButton: null,
    accountButton: null,
    multiplayerButton: null,
    singleplayerButton: null,
    backButton: null,
    createWorldButton: null,
    worldButtons: []
  },
  mapUi: {
    panel: null,
    beachButton: null,
    redwoodsButton: null,
    closeButton: null
  },
  pauseMenu: {
    panel: null,
    returnButton: null
  },
  respawnMenu: {
    panel: null,
    beachButton: null,
    redwoodsButton: null
  },
  inventoryUi: {
    toolButtons: {},
    assignButtons: [],
    clearSelectedButton: null,
    craftPickaxeButton: null,
    craftAxeButton: null
  }
};

const player = {
  x: PLAYER_SPAWN_X,
  y: PLAYER_SPAWN_Y,
  w: 34,
  h: 50,
  vx: 0,
  vy: 0,
  facing: 1,
  health: 100,
  maxHealth: 100,
  regenCooldown: 0,
  dead: false,
  respawnTimer: 0,
  onGround: false,
  moveAccel: 2600,
  maxSpeed: 300,
  friction: 2200,
  jumpSpeed: 760
};

const gravity = 2100;
const RESOURCE_RESPAWN_SECONDS = 60;
const CREATURE_RESPAWN_SECONDS = 60;
const HEALTH_REGEN_PER_SECOND = 2;
const HEALTH_REGEN_DELAY = 3;
const STONE_NODE_HEALTH = 5;
const METAL_NODE_HEALTH = 7;
const METAL_NODE_CHANCE = 0.1;
const NPC_ATTACK_COOLDOWN = 1;
const RAPTOR_ATTACK_COOLDOWN = 0.7;
const BACKGROUND_MUSIC_FILE = "Spiring - City Life (freetouse.com).mp3";
const DAMAGE_MUSIC_FILE = "Conquest - Blacksmith (freetouse.com).mp3";
const DAMAGE_MUSIC_SECONDS = 10;
const MUSIC_LOOP_DELAY_MS = 5000;

const backgroundMusic = new Audio(BACKGROUND_MUSIC_FILE);
backgroundMusic.loop = false;
backgroundMusic.volume = 0.4;
backgroundMusic.preload = "auto";
const damageMusic = new Audio(DAMAGE_MUSIC_FILE);
damageMusic.loop = false;
damageMusic.volume = 0.45;
damageMusic.preload = "auto";
let backgroundMusicStarted = false;
let musicEnabled = true;
let damageMusicTimer = 0;
let backgroundLoopTimeoutId = null;
let damageLoopTimeoutId = null;
let backgroundWaitingForLoop = false;
let damageWaitingForLoop = false;

function resetAudioPosition(audio) {
  try {
    audio.currentTime = 0;
  } catch {
    // Ignore browser timing errors when metadata is not ready yet.
  }
}

function clearBackgroundLoopTimeout() {
  if (backgroundLoopTimeoutId !== null) {
    clearTimeout(backgroundLoopTimeoutId);
    backgroundLoopTimeoutId = null;
  }
}

function clearDamageLoopTimeout() {
  if (damageLoopTimeoutId !== null) {
    clearTimeout(damageLoopTimeoutId);
    damageLoopTimeoutId = null;
  }
}

function pauseBackgroundMusic(resetPosition = false) {
  backgroundMusic.pause();
  clearBackgroundLoopTimeout();
  backgroundWaitingForLoop = false;
  if (resetPosition) {
    resetAudioPosition(backgroundMusic);
  }
}

function pauseDamageMusic(resetPosition = false) {
  damageMusic.pause();
  clearDamageLoopTimeout();
  damageWaitingForLoop = false;
  if (resetPosition) {
    resetAudioPosition(damageMusic);
  }
}

function startDamageMusic(restartFromStart = false) {
  if (!musicEnabled) return;
  clearDamageLoopTimeout();
  damageWaitingForLoop = false;
  if (restartFromStart) {
    resetAudioPosition(damageMusic);
  } else if (damageMusic.ended) {
    resetAudioPosition(damageMusic);
  }
  if (!backgroundMusic.paused) {
    pauseBackgroundMusic(false);
  }
  const playPromise = damageMusic.play();
  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch(() => {
      // Ignore autoplay rejection; next user input will allow it.
    });
  }
}

function triggerDamageMusic() {
  damageMusicTimer = DAMAGE_MUSIC_SECONDS;
  if (musicEnabled && damageMusic.paused && !damageWaitingForLoop) {
    startDamageMusic(false);
  }
}

function updateDamageMusic(dt) {
  if (damageMusicTimer <= 0) return;
  damageMusicTimer = Math.max(0, damageMusicTimer - dt);

  if (musicEnabled) {
    if (damageMusic.paused && !damageWaitingForLoop) {
      startDamageMusic(false);
    }
  } else if (!damageMusic.paused) {
    pauseDamageMusic(false);
  }

  if (damageMusicTimer <= 0) {
    pauseDamageMusic(true);
    tryStartBackgroundMusic();
  }
}

function tryStartBackgroundMusic() {
  if (!musicEnabled) return;
  if (backgroundWaitingForLoop) return;
  if (damageMusicTimer > 0 || !damageMusic.paused) return;
  if (!backgroundMusic.paused) return;
  if (backgroundMusic.ended) {
    resetAudioPosition(backgroundMusic);
  }
  const playPromise = backgroundMusic.play();
  if (playPromise && typeof playPromise.then === "function" && typeof playPromise.catch === "function") {
    playPromise.then(() => {
      backgroundMusicStarted = true;
    }).catch(() => {
      backgroundMusicStarted = false;
    });
  } else {
    backgroundMusicStarted = true;
  }
}

function toggleBackgroundMusic() {
  musicEnabled = !musicEnabled;
  if (!musicEnabled) {
    pauseBackgroundMusic(false);
    pauseDamageMusic(false);
    return;
  }
  if (damageMusicTimer > 0) {
    startDamageMusic(false);
    return;
  }
  tryStartBackgroundMusic();
}

backgroundMusic.addEventListener("ended", () => {
  backgroundMusicStarted = false;
  if (!musicEnabled) return;
  if (damageMusicTimer > 0 || !damageMusic.paused) return;
  if (backgroundWaitingForLoop) return;

  backgroundWaitingForLoop = true;
  clearBackgroundLoopTimeout();
  backgroundLoopTimeoutId = setTimeout(() => {
    backgroundLoopTimeoutId = null;
    backgroundWaitingForLoop = false;
    if (!musicEnabled) return;
    if (damageMusicTimer > 0 || !damageMusic.paused) return;
    resetAudioPosition(backgroundMusic);
    tryStartBackgroundMusic();
  }, MUSIC_LOOP_DELAY_MS);
});

damageMusic.addEventListener("ended", () => {
  if (!musicEnabled) return;
  if (damageMusicTimer <= 0) return;
  if (damageWaitingForLoop) return;

  damageWaitingForLoop = true;
  clearDamageLoopTimeout();
  damageLoopTimeoutId = setTimeout(() => {
    damageLoopTimeoutId = null;
    damageWaitingForLoop = false;
    if (!musicEnabled) return;
    if (damageMusicTimer <= 0) return;
    startDamageMusic(true);
  }, MUSIC_LOOP_DELAY_MS);
});

const platforms = [
  { x: 0, y: 490, w: WORLD_WIDTH, h: 60 }
];
const GROUND_Y = platforms[0].y;

const inventory = {
  thatch: 0,
  wood: 0,
  stone: 0,
  flint: 0,
  metal: 0,
  pickaxe: false,
  axe: false
};

const hotbar = {
  slots: ["hands", null, null, null, null],
  selected: 0
};

function clampResource(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function normalizeWorldName(name, index = 0) {
  if (typeof name === "string" && name.trim()) {
    return name.trim().slice(0, WORLD_NAME_MAX_LENGTH);
  }
  return `World ${index + 1}`;
}

function createDefaultWorldData() {
  return {
    zone: ZONE_BEACH,
    inventory: {
      thatch: 0,
      wood: 0,
      stone: 0,
      flint: 0,
      metal: 0,
      pickaxe: false,
      axe: false
    },
    hotbar: {
      slots: ["hands", null, null, null, null],
      selected: 0
    },
    craftSelection: "pickaxe",
    selectedInventoryTool: "hands",
    trees: [],
    stones: [],
    pebbles: []
  };
}

function normalizeWorldData(data) {
  const defaults = createDefaultWorldData();
  const source = data && typeof data === "object" ? data : {};
  const sourceInventory = source.inventory && typeof source.inventory === "object" ? source.inventory : {};
  const sourceHotbar = source.hotbar && typeof source.hotbar === "object" ? source.hotbar : {};

  const normalizedSlots = [];
  for (let i = 0; i < defaults.hotbar.slots.length; i++) {
    const tool = Array.isArray(sourceHotbar.slots) ? sourceHotbar.slots[i] : defaults.hotbar.slots[i];
    normalizedSlots.push(tool === "hands" || tool === "pickaxe" || tool === "axe" ? tool : null);
  }
  if (!normalizedSlots.includes("hands")) {
    normalizedSlots[0] = "hands";
  }

  const selectedSlot = Number.isInteger(sourceHotbar.selected)
    ? Math.max(0, Math.min(normalizedSlots.length - 1, sourceHotbar.selected))
    : 0;

  const normalizedTrees = Array.isArray(source.trees) ? source.trees.map((treeState) => ({
    alive: !treeState || treeState.alive !== false,
    health: Number.isFinite(treeState?.health) ? treeState.health : 0,
    respawnTimer: Number.isFinite(treeState?.respawnTimer) ? Math.max(0, treeState.respawnTimer) : 0
  })) : [];

  const normalizedStones = Array.isArray(source.stones) ? source.stones.map((stoneState) => ({
    alive: !stoneState || stoneState.alive !== false,
    health: Number.isFinite(stoneState?.health) ? stoneState.health : 0,
    respawnTimer: Number.isFinite(stoneState?.respawnTimer) ? Math.max(0, stoneState.respawnTimer) : 0,
    isMetal: !!stoneState?.isMetal
  })) : [];

  const normalizedPebbles = Array.isArray(source.pebbles) ? source.pebbles.map((pebbleState) => ({
    picked: !!pebbleState?.picked,
    respawnTimer: Number.isFinite(pebbleState?.respawnTimer) ? Math.max(0, pebbleState.respawnTimer) : 0
  })) : [];

  return {
    zone: source.zone === ZONE_REDWOODS ? ZONE_REDWOODS : ZONE_BEACH,
    inventory: {
      thatch: clampResource(sourceInventory.thatch),
      wood: clampResource(sourceInventory.wood),
      stone: clampResource(sourceInventory.stone),
      flint: clampResource(sourceInventory.flint),
      metal: clampResource(sourceInventory.metal),
      pickaxe: !!sourceInventory.pickaxe,
      axe: !!sourceInventory.axe
    },
    hotbar: {
      slots: normalizedSlots,
      selected: selectedSlot
    },
    craftSelection: source.craftSelection === "axe" ? "axe" : "pickaxe",
    selectedInventoryTool: source.selectedInventoryTool === "pickaxe" || source.selectedInventoryTool === "axe"
      ? source.selectedInventoryTool
      : "hands",
    trees: normalizedTrees,
    stones: normalizedStones,
    pebbles: normalizedPebbles
  };
}

function normalizeWorldRecord(world, index = 0) {
  const record = world && typeof world === "object" ? world : {};
  const id = typeof record.id === "string" && record.id.trim()
    ? record.id.trim()
    : `world_${Date.now()}_${index}_${Math.floor(Math.random() * 100000)}`;
  return {
    id,
    name: normalizeWorldName(record.name, index),
    createdAt: Number.isFinite(record.createdAt) ? Math.max(0, record.createdAt) : Date.now(),
    updatedAt: Number.isFinite(record.updatedAt) ? Math.max(0, record.updatedAt) : 0,
    data: normalizeWorldData(record.data)
  };
}

function getWorldOwnerId() {
  const owner = (signedInEmail || signedInUser || "").trim().toLowerCase();
  return owner || "guest";
}

function getWorldSavesStorageKey() {
  return `${WORLD_SAVES_STORAGE_PREFIX}_${encodeURIComponent(getWorldOwnerId())}`;
}

function loadWorldSavesForCurrentUser() {
  worldSaves = [];
  selectedWorldId = "";
  activeWorldId = "";
  if (!signedInUser) return;

  try {
    const raw = localStorage.getItem(getWorldSavesStorageKey());
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;

    if (Array.isArray(parsed.worlds)) {
      worldSaves = parsed.worlds.map((world, index) => normalizeWorldRecord(world, index));
    }
    if (typeof parsed.selectedWorldId === "string") {
      selectedWorldId = parsed.selectedWorldId;
    }
    if (!worldSaves.some((world) => world.id === selectedWorldId)) {
      selectedWorldId = worldSaves.length > 0 ? worldSaves[0].id : "";
    }
  } catch {
    // Ignore world save load errors.
  }
}

function saveWorldSavesForCurrentUser() {
  if (!signedInUser) return;
  try {
    const payload = {
      version: 1,
      selectedWorldId,
      worlds: worldSaves.map((world, index) => normalizeWorldRecord(world, index))
    };
    localStorage.setItem(getWorldSavesStorageKey(), JSON.stringify(payload));
  } catch {
    // Ignore storage errors.
  }
}

function captureWorldDataFromGame() {
  return normalizeWorldData({
    zone: currentZone,
    inventory: {
      thatch: inventory.thatch,
      wood: inventory.wood,
      stone: inventory.stone,
      flint: inventory.flint,
      metal: inventory.metal,
      pickaxe: inventory.pickaxe,
      axe: inventory.axe
    },
    hotbar: {
      slots: hotbar.slots.slice(),
      selected: hotbar.selected
    },
    craftSelection,
    selectedInventoryTool,
    trees: trees.map((tree) => ({
      alive: tree.alive,
      health: tree.health,
      respawnTimer: tree.respawnTimer
    })),
    stones: stones.map((stone) => ({
      alive: stone.alive,
      health: stone.health,
      respawnTimer: stone.respawnTimer,
      isMetal: stone.isMetal
    })),
    pebbles: pebbles.map((pebble) => ({
      picked: pebble.picked,
      respawnTimer: pebble.respawnTimer
    }))
  });
}

function applyWorldDataToGame(data) {
  const normalized = normalizeWorldData(data);
  currentZone = normalized.zone;

  inventory.thatch = normalized.inventory.thatch;
  inventory.wood = normalized.inventory.wood;
  inventory.stone = normalized.inventory.stone;
  inventory.flint = normalized.inventory.flint;
  inventory.metal = normalized.inventory.metal;
  inventory.pickaxe = normalized.inventory.pickaxe;
  inventory.axe = normalized.inventory.axe;

  for (let i = 0; i < hotbar.slots.length; i++) {
    hotbar.slots[i] = normalized.hotbar.slots[i] ?? null;
  }
  hotbar.selected = normalized.hotbar.selected;
  craftSelection = normalized.craftSelection;
  selectedInventoryTool = normalized.selectedInventoryTool;
  sanitizeHotbarSlots();
  if (!isToolOwned(selectedInventoryTool)) {
    selectedInventoryTool = "hands";
  }

  for (let i = 0; i < trees.length; i++) {
    const tree = trees[i];
    const saved = normalized.trees[i];
    if (!saved) {
      tree.alive = true;
      tree.health = tree.maxHealth;
      tree.respawnTimer = 0;
      continue;
    }
    tree.alive = !!saved.alive;
    tree.respawnTimer = Math.max(0, saved.respawnTimer);
    if (tree.alive) {
      tree.health = Math.max(1, Math.min(tree.maxHealth, Number.isFinite(saved.health) ? saved.health : tree.maxHealth));
    } else {
      tree.health = 0;
    }
  }

  for (let i = 0; i < stones.length; i++) {
    const stone = stones[i];
    const saved = normalized.stones[i];
    if (!saved) {
      stone.alive = true;
      stone.respawnTimer = 0;
      rerollStoneNode(stone);
      continue;
    }
    stone.isMetal = !!saved.isMetal;
    const maxHealth = stone.isMetal ? METAL_NODE_HEALTH : STONE_NODE_HEALTH;
    stone.maxHealth = maxHealth;
    stone.alive = !!saved.alive;
    stone.respawnTimer = Math.max(0, saved.respawnTimer);
    if (stone.alive) {
      stone.health = Math.max(1, Math.min(maxHealth, Number.isFinite(saved.health) ? saved.health : maxHealth));
    } else {
      stone.health = 0;
    }
  }

  for (let i = 0; i < pebbles.length; i++) {
    const pebble = pebbles[i];
    const saved = normalized.pebbles[i];
    pebble.picked = !!saved?.picked;
    pebble.respawnTimer = Math.max(0, saved?.respawnTimer || 0);
  }

  resetDinosaursForZone(currentZone);
}

function getWorldById(worldId) {
  if (!worldId) return null;
  return worldSaves.find((world) => world.id === worldId) || null;
}

function saveCurrentWorld(force = false) {
  if (!signedInUser) return;
  if (!force && !gameStarted) return;
  const world = getWorldById(activeWorldId || selectedWorldId);
  if (!world) return;

  world.data = captureWorldDataFromGame();
  world.updatedAt = Date.now();
  selectedWorldId = world.id;
  saveWorldSavesForCurrentUser();
}

function startGameWithWorld(worldId) {
  if (gameStarted) return;
  if (!signedInUser) {
    setMenuStatus("Sign in first with Google.");
    return;
  }
  const world = getWorldById(worldId);
  if (!world) {
    setMenuStatus("Select or create a world first.");
    return;
  }

  if (multiplayerSocket) {
    disconnectMultiplayer(true);
  } else {
    clearMultiplayerState();
  }
  selectedWorldId = world.id;
  activeWorldId = world.id;
  applyWorldDataToGame(world.data);
  gameStarted = true;
  keys.clear();
  wantsJump = false;
  wantsInteract = false;
  wantsCraftPickaxe = false;
  wantsCraftAxe = false;
  wantsRespawn = false;
  respawnMenuOpen = false;
  inventoryOpen = false;
  mapOpen = false;
  pauseMenuOpen = false;
  respawnPlayer();
  sanitizeHotbarSlots();
  worldAutoSaveTimer = WORLD_AUTOSAVE_SECONDS;
  saveCurrentWorld(true);
  lastTime = performance.now();
  tryStartBackgroundMusic();
}

function createNewWorld() {
  if (!signedInUser) {
    setMenuStatus("Sign in first to create worlds.");
    return;
  }
  const defaultName = `World ${worldSaves.length + 1}`;
  const nameInput = prompt("Create new world name:", defaultName);
  if (nameInput === null) return;
  const name = normalizeWorldName(nameInput, worldSaves.length);
  const now = Date.now();
  const id = `world_${now}_${Math.floor(Math.random() * 1000000)}`;
  const world = {
    id,
    name,
    createdAt: now,
    updatedAt: now,
    data: createDefaultWorldData()
  };
  worldSaves.unshift(world);
  selectedWorldId = id;
  activeWorldId = "";
  saveWorldSavesForCurrentUser();
  setMenuStatus(`Created ${name}.`);
}

function captureCharacterDataFromGame() {
  return normalizeWorldData({
    zone: currentZone,
    inventory: {
      thatch: inventory.thatch,
      wood: inventory.wood,
      stone: inventory.stone,
      flint: inventory.flint,
      metal: inventory.metal,
      pickaxe: inventory.pickaxe,
      axe: inventory.axe
    },
    hotbar: {
      slots: hotbar.slots.slice(),
      selected: hotbar.selected
    },
    craftSelection,
    selectedInventoryTool
  });
}

function applyCharacterDataToGame(data) {
  const normalized = normalizeWorldData(data);
  currentZone = normalized.zone;
  inventory.thatch = normalized.inventory.thatch;
  inventory.wood = normalized.inventory.wood;
  inventory.stone = normalized.inventory.stone;
  inventory.flint = normalized.inventory.flint;
  inventory.metal = normalized.inventory.metal;
  inventory.pickaxe = normalized.inventory.pickaxe;
  inventory.axe = normalized.inventory.axe;
  for (let i = 0; i < hotbar.slots.length; i++) {
    hotbar.slots[i] = normalized.hotbar.slots[i] ?? null;
  }
  hotbar.selected = normalized.hotbar.selected;
  craftSelection = normalized.craftSelection;
  selectedInventoryTool = normalized.selectedInventoryTool;
  sanitizeHotbarSlots();
  if (!isToolOwned(selectedInventoryTool)) {
    selectedInventoryTool = "hands";
  }
  resetDinosaursForZone(currentZone);
}

function resetWorldResourcesToDefault() {
  for (const tree of trees) {
    tree.alive = true;
    tree.health = tree.maxHealth;
    tree.respawnTimer = 0;
  }
  for (const stone of stones) {
    stone.alive = true;
    stone.respawnTimer = 0;
    rerollStoneNode(stone);
  }
  for (const pebble of pebbles) {
    pebble.picked = false;
    pebble.respawnTimer = 0;
  }
}

function getDefaultMultiplayerServerUrl() {
  try {
    const saved = localStorage.getItem(MULTIPLAYER_LAST_SERVER_KEY);
    if (saved && /^wss?:\/\//.test(saved)) {
      return saved;
    }
  } catch {
    // Ignore storage errors.
  }
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const host = location.hostname || "localhost";
  return `${protocol}//${host}:8080`;
}

function saveLastMultiplayerServerUrl(url) {
  try {
    localStorage.setItem(MULTIPLAYER_LAST_SERVER_KEY, url);
  } catch {
    // Ignore storage errors.
  }
}

function hasOpenMultiplayerConnection() {
  return !!(multiplayerSocket && multiplayerSocket.readyState === WebSocket.OPEN && multiplayerConnected);
}

function sendMultiplayerMessage(type, payload = {}, requireConnected = true) {
  if (!multiplayerSocket || multiplayerSocket.readyState !== WebSocket.OPEN) return false;
  if (requireConnected && !multiplayerConnected) return false;
  try {
    multiplayerSocket.send(JSON.stringify({ type, ...payload }));
    return true;
  } catch {
    return false;
  }
}

function sendMultiplayerPlayerState() {
  if (!hasOpenMultiplayerConnection()) return;
  sendMultiplayerMessage("player_state", {
    state: {
      x: player.x,
      y: player.y,
      w: player.w,
      h: player.h,
      facing: player.facing,
      zone: currentZone,
      health: player.health,
      maxHealth: player.maxHealth,
      dead: player.dead
    }
  });
}

function sendMultiplayerCharacterSave() {
  if (!hasOpenMultiplayerConnection()) return;
  sendMultiplayerMessage("save_character", {
    characterData: captureCharacterDataFromGame()
  });
}

function updateMultiplayerNetworking(dt) {
  if (!isMultiplayerGame) return;

  multiplayerSendTimer = Math.max(0, multiplayerSendTimer - dt);
  if (multiplayerSendTimer <= 0) {
    sendMultiplayerPlayerState();
    multiplayerSendTimer = MULTIPLAYER_SEND_INTERVAL;
  }

  multiplayerSaveTimer = Math.max(0, multiplayerSaveTimer - dt);
  if (multiplayerSaveTimer <= 0) {
    sendMultiplayerCharacterSave();
    multiplayerSaveTimer = MULTIPLAYER_SAVE_INTERVAL;
  }
}

function clearRemotePlayers() {
  remotePlayers.clear();
}

function clearMultiplayerState() {
  multiplayerConnected = false;
  multiplayerIsHost = false;
  multiplayerWorldId = "";
  multiplayerWorldName = "";
  multiplayerPlayerId = "";
  multiplayerSendTimer = 0;
  multiplayerSaveTimer = 0;
  multiplayerHadServerError = false;
  activeWorldId = "";
  isMultiplayerGame = false;
  clearRemotePlayers();
}

function disconnectMultiplayer(closeSocket = true) {
  if (closeSocket && multiplayerSocket) {
    suppressMultiplayerCloseNotice = true;
    try {
      if (hasOpenMultiplayerConnection()) {
        sendMultiplayerCharacterSave();
      }
      multiplayerSocket.close();
    } catch {
      // Ignore socket close errors.
    }
  }
  multiplayerSocket = null;
  clearMultiplayerState();
}

function upsertRemotePlayerFromServer(rawPlayer) {
  if (!rawPlayer || typeof rawPlayer !== "object") return;
  const playerId = typeof rawPlayer.playerId === "string" ? rawPlayer.playerId : "";
  if (!playerId || playerId === multiplayerPlayerId) return;

  const current = remotePlayers.get(playerId) || {};
  current.playerId = playerId;
  current.name = typeof rawPlayer.name === "string" && rawPlayer.name.trim() ? rawPlayer.name.trim() : "Survivor";
  current.x = Number.isFinite(rawPlayer.x) ? rawPlayer.x : (current.x ?? 0);
  current.y = Number.isFinite(rawPlayer.y) ? rawPlayer.y : (current.y ?? 0);
  current.w = Number.isFinite(rawPlayer.w) ? rawPlayer.w : 34;
  current.h = Number.isFinite(rawPlayer.h) ? rawPlayer.h : 50;
  current.facing = rawPlayer.facing >= 0 ? 1 : -1;
  current.zone = rawPlayer.zone === ZONE_REDWOODS ? ZONE_REDWOODS : ZONE_BEACH;
  current.health = Number.isFinite(rawPlayer.health) ? rawPlayer.health : 100;
  current.maxHealth = Number.isFinite(rawPlayer.maxHealth) ? rawPlayer.maxHealth : 100;
  current.dead = !!rawPlayer.dead;
  remotePlayers.set(playerId, current);
}

function startMultiplayerGameSession(characterData) {
  isMultiplayerGame = true;
  gameStarted = true;
  keys.clear();
  wantsJump = false;
  wantsInteract = false;
  wantsCraftPickaxe = false;
  wantsCraftAxe = false;
  wantsRespawn = false;
  respawnMenuOpen = false;
  inventoryOpen = false;
  mapOpen = false;
  pauseMenuOpen = false;
  resetWorldResourcesToDefault();
  applyCharacterDataToGame(characterData || createDefaultWorldData());
  respawnPlayer();
  sanitizeHotbarSlots();
  multiplayerSendTimer = MULTIPLAYER_SEND_INTERVAL;
  multiplayerSaveTimer = MULTIPLAYER_SAVE_INTERVAL;
  mainMenuScreen = MENU_HOME;
  lastTime = performance.now();
  tryStartBackgroundMusic();
  sendMultiplayerCharacterSave();
  sendMultiplayerPlayerState();
}

function handleMultiplayerServerMessage(rawData) {
  let message = null;
  try {
    message = JSON.parse(rawData);
  } catch {
    return;
  }
  if (!message || typeof message !== "object") return;

  if (message.type === "error") {
    multiplayerHadServerError = true;
    setMenuStatus(typeof message.message === "string" ? message.message : "Multiplayer error.");
    return;
  }

  if (message.type === "welcome") {
    multiplayerConnected = true;
    multiplayerWorldId = typeof message.worldId === "string" ? message.worldId : "";
    multiplayerWorldName = typeof message.worldName === "string" ? message.worldName : multiplayerWorldId;
    multiplayerPlayerId = typeof message.playerId === "string" ? message.playerId : "";
    clearRemotePlayers();
    if (Array.isArray(message.players)) {
      for (const remote of message.players) {
        upsertRemotePlayerFromServer(remote);
      }
    }
    startMultiplayerGameSession(message.characterData);
    const worldLabel = multiplayerWorldName || "World";
    if (multiplayerIsHost) {
      setMenuStatus(`Hosting ${worldLabel} (Code: ${multiplayerWorldId}).`);
      try {
        alert(`World code: ${multiplayerWorldId}\nShare this code so friends can join.`);
      } catch {
        // Ignore alert failures.
      }
    } else {
      setMenuStatus(`Joined ${worldLabel} (Code: ${multiplayerWorldId}).`);
    }
    return;
  }

  if (message.type === "player_joined" || message.type === "player_state") {
    upsertRemotePlayerFromServer(message.player);
    return;
  }

  if (message.type === "player_left") {
    if (typeof message.playerId === "string") {
      remotePlayers.delete(message.playerId);
    }
  }
}

function beginMultiplayerConnection(mode, serverUrl, worldId, worldName) {
  if (!signedInUser) {
    setMenuStatus("Sign in first with Google.");
    return;
  }
  suppressMultiplayerCloseNotice = false;
  disconnectMultiplayer(true);

  multiplayerIsHost = mode === "host";
  multiplayerServerUrl = serverUrl;
  multiplayerWorldId = worldId || "";
  multiplayerWorldName = worldName || worldId || "";

  let ws = null;
  try {
    ws = new WebSocket(serverUrl);
  } catch {
    setMenuStatus("Invalid server URL.");
    return;
  }

  multiplayerSocket = ws;
  multiplayerConnected = false;
  multiplayerHadServerError = false;
  setMenuStatus(`Connecting to ${serverUrl}...`);

  ws.addEventListener("open", () => {
    saveLastMultiplayerServerUrl(serverUrl);
    sendMultiplayerMessage("hello", {
      mode,
      worldId: multiplayerWorldId,
      worldName: multiplayerWorldName,
      playerKey: (signedInEmail || signedInUser || "").trim().toLowerCase(),
      displayName: signedInUser,
      characterData: captureCharacterDataFromGame()
    }, false);
    setMenuStatus("Waiting for server...");
  });

  ws.addEventListener("message", (event) => {
    handleMultiplayerServerMessage(event.data);
  });

  ws.addEventListener("error", () => {
    if (!gameStarted) {
      setMenuStatus("Multiplayer connection error.");
    }
  });

  ws.addEventListener("close", () => {
    const isCurrentSocket = ws === multiplayerSocket;
    const suppressNotice = suppressMultiplayerCloseNotice;
    if (suppressNotice) {
      suppressMultiplayerCloseNotice = false;
    }
    if (!isCurrentSocket) {
      return;
    }
    const wasInMultiplayerGame = isMultiplayerGame && gameStarted;
    const hadServerError = multiplayerHadServerError;
    multiplayerSocket = null;
    clearMultiplayerState();
    if (suppressNotice) return;
    if (wasInMultiplayerGame) {
      gameStarted = false;
      pauseMenuOpen = false;
      inventoryOpen = false;
      mapOpen = false;
      keys.clear();
      mainMenuScreen = MENU_HOME;
      setMenuStatus("Disconnected from multiplayer.");
      lastTime = performance.now();
    } else if (!gameStarted) {
      if (!hadServerError) {
        setMenuStatus("Could not connect to multiplayer server.");
      }
    }
  });
}

function beginMultiplayerFlow() {
  if (!signedInUser) {
    setMenuStatus("Sign in first with Google.");
    return;
  }
  const modeInput = prompt("Multiplayer: type host or join.", "host");
  if (!modeInput) return;
  const mode = modeInput.trim().toLowerCase();
  if (mode !== "host" && mode !== "join") {
    setMenuStatus("Use host or join.");
    return;
  }

  const serverInput = prompt("Server URL (ws:// or wss://)", getDefaultMultiplayerServerUrl());
  if (!serverInput) return;
  const serverUrl = serverInput.trim();
  if (!/^wss?:\/\//.test(serverUrl)) {
    setMenuStatus("Server URL must start with ws:// or wss://");
    return;
  }

  if (mode === "host") {
    const worldNameInput = prompt("World name:", `World ${worldSaves.length + 1}`);
    if (worldNameInput === null) return;
    const worldName = normalizeWorldName(worldNameInput, worldSaves.length);
    beginMultiplayerConnection("host", serverUrl, "", worldName);
    return;
  }

  const worldIdInput = prompt("World code to join:", selectedWorldId || multiplayerWorldId || "");
  if (!worldIdInput) return;
  const worldId = worldIdInput.trim().toUpperCase();
  beginMultiplayerConnection("join", serverUrl, worldId, "");
}

const trees = [300, 650, 980, 1320, 1660, 2030, 2360].map((x) => ({
  x,
  baseY: GROUND_Y,
  trunkW: 24,
  trunkH: 92,
  health: 4,
  maxHealth: 4,
  alive: true,
  respawnTimer: 0
}));

const redwoodProps = [
  { x: 520, baseY: GROUND_Y, trunkW: 44, trunkH: 210, canopyY: 240 },
  { x: 1240, baseY: GROUND_Y, trunkW: 50, trunkH: 235, canopyY: 215 },
  { x: 1970, baseY: GROUND_Y, trunkW: 46, trunkH: 220, canopyY: 230 }
];

function rollMetalNode() {
  return Math.random() < METAL_NODE_CHANCE;
}

function rerollStoneNode(stone) {
  stone.isMetal = rollMetalNode();
  const nodeHealth = stone.isMetal ? METAL_NODE_HEALTH : STONE_NODE_HEALTH;
  stone.health = nodeHealth;
  stone.maxHealth = nodeHealth;
}

const stones = [460, 820, 1170, 1540, 1880, 2260].map((x) => {
  const stone = {
    x,
    y: GROUND_Y - 30,
    w: 48,
    h: 30,
    health: STONE_NODE_HEALTH,
    maxHealth: STONE_NODE_HEALTH,
    alive: true,
    respawnTimer: 0,
    isMetal: false
  };
  rerollStoneNode(stone);
  return stone;
});

const pebbles = stones.flatMap((stone) => (
  [-28, -14, 4, 18, 30].map((offset, index) => ({
    x: stone.x + offset + index,
    y: GROUND_Y - 8 - (index % 2),
    w: 10,
    h: 8,
    value: 1,
    picked: false,
    respawnTimer: 0
  }))
));

function createZoneSpawnPoints(xs) {
  return xs.map((x, index) => ({
    id: index,
    x,
    minX: Math.max(20, x - 170),
    maxX: Math.min(WORLD_WIDTH - 20, x + 170)
  }));
}

const beachDinoSpawnPoints = createZoneSpawnPoints([220, 520, 820, 1120, 1420, 1720, 2080]);
const redwoodsDinoSpawnPoints = createZoneSpawnPoints([170, 460, 780, 1130, 1470, 1810, 2180]);

function getZoneDinoSpawnPoints(zone = currentZone) {
  return zone === ZONE_REDWOODS ? redwoodsDinoSpawnPoints : beachDinoSpawnPoints;
}

function rollDinoType(zone = currentZone) {
  if (zone === ZONE_REDWOODS) {
    const roll = Math.random();
    if (roll < 0.05) return "thylacoleo";
    if (roll < 0.525) return "parasaur";
    return "raptor";
  }

  const roll = Math.random();
  if (roll < 0.5) return "dodo";
  if (roll < 0.75) return "dilo";
  if (roll < 0.85) return "parasaur";
  if (roll < 0.95) return "trike";
  return "raptor";
}

function createDinoAtSpawn(spawn, forcedType = null, zone = currentZone) {
  const type = forcedType ?? rollDinoType(zone);
  const dir = Math.random() < 0.5 ? -1 : 1;
  const dino = {
    type,
    forcedType: forcedType ?? null,
    spawn,
    spawnX: spawn.x,
    spawnDir: dir,
    x: spawn.x,
    minX: spawn.minX,
    maxX: spawn.maxX,
    speed: 0,
    dir,
    w: 0,
    h: 0,
    y: GROUND_Y,
    groundY: GROUND_Y,
    vy: 0,
    health: 1,
    maxHealth: 1,
    alive: true,
    respawnTimer: 0,
    fleeTimer: 0,
    attackCooldown: 0,
    attackDamage: 0,
    attackInterval: NPC_ATTACK_COOLDOWN,
    attackReachX: 0,
    attackReachY: 0,
    faceDeadzone: 8,
    treePerched: false,
    treePerchX: 0,
    treePerchY: 0,
    aggroTimer: 0,
    anim: Math.random() * Math.PI * 2
  };

  if (type === "dodo") {
    dino.w = 40;
    dino.h = 28;
    dino.y = GROUND_Y - 28;
    dino.speed = 68 + Math.random() * 10;
    dino.health = 20;
    dino.maxHealth = 20;
  } else if (type === "dilo") {
    dino.w = 52;
    dino.h = 34;
    dino.y = GROUND_Y - 34;
    dino.speed = 100 + Math.random() * 14;
    dino.health = 30;
    dino.maxHealth = 30;
    dino.attackDamage = 5;
    dino.attackInterval = NPC_ATTACK_COOLDOWN;
    dino.attackReachX = 56;
    dino.attackReachY = 46;
    dino.faceDeadzone = 10;
  } else if (type === "parasaur") {
    dino.w = 66;
    dino.h = 42;
    dino.y = GROUND_Y - 42;
    dino.speed = 62 + Math.random() * 10;
    dino.health = 150;
    dino.maxHealth = 150;
  } else if (type === "raptor") {
    dino.w = 56;
    dino.h = 36;
    dino.y = GROUND_Y - 36;
    dino.speed = 116 + Math.random() * 12;
    dino.health = 150;
    dino.maxHealth = 150;
    dino.attackDamage = 20;
    dino.attackInterval = RAPTOR_ATTACK_COOLDOWN;
    dino.attackReachX = 60;
    dino.attackReachY = 50;
    dino.faceDeadzone = 12;
  } else if (type === "thylacoleo") {
    dino.w = 62;
    dino.h = 38;
    dino.y = GROUND_Y - 38;
    dino.groundY = dino.y;
    dino.speed = 122 + Math.random() * 10;
    dino.health = 180;
    dino.maxHealth = 180;
    dino.attackDamage = 26;
    dino.attackInterval = 0.85;
    dino.attackReachX = 64;
    dino.attackReachY = 52;
    dino.faceDeadzone = 11;
    if (zone === ZONE_REDWOODS) {
      let nearestTree = redwoodProps[0];
      let nearestDist = Number.POSITIVE_INFINITY;
      for (const tree of redwoodProps) {
        const trunkCenter = tree.x + tree.trunkW / 2;
        const dist = Math.abs(spawn.x - trunkCenter);
        if (dist < nearestDist) {
          nearestTree = tree;
          nearestDist = dist;
        }
      }
      const perchCenterX = nearestTree.x + nearestTree.trunkW / 2;
      dino.treePerched = true;
      dino.treePerchX = Math.round(perchCenterX - dino.w / 2);
      dino.treePerchY = Math.round(nearestTree.canopyY + 10);
      dino.x = dino.treePerchX;
      dino.y = dino.treePerchY;
      dino.minX = Math.max(20, dino.treePerchX - 190);
      dino.maxX = Math.min(WORLD_WIDTH - 20, dino.treePerchX + 190);
    }
  } else {
    dino.w = 78;
    dino.h = 46;
    dino.y = GROUND_Y - 46;
    dino.speed = 47 + Math.random() * 7;
    dino.health = 200;
    dino.maxHealth = 200;
    dino.attackDamage = 35;
    dino.attackInterval = NPC_ATTACK_COOLDOWN;
    dino.attackReachX = 76;
    dino.attackReachY = 54;
    dino.faceDeadzone = 12;
  }

  return dino;
}

const dinosaurs = beachDinoSpawnPoints.map((spawn) => createDinoAtSpawn(spawn, null, ZONE_BEACH));

function resetDinosaursForZone(zone) {
  const zoneSpawns = getZoneDinoSpawnPoints(zone);
  for (let i = 0; i < dinosaurs.length; i++) {
    const dino = dinosaurs[i];
    const spawn = zoneSpawns[i % zoneSpawns.length];
    Object.assign(dino, createDinoAtSpawn(spawn, null, zone));
  }
}

let cameraX = 0;
let lastTime = performance.now();

window.addEventListener("keydown", (event) => {
  const code = event.code;
  const handledKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "KeyE", "KeyF", "KeyC", "KeyM", "KeyR", "Escape", "Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Numpad1", "Numpad2"];
  if (!gameStarted) {
    if (handledKeys.includes(code)) {
      event.preventDefault();
    }
    return;
  }

  if (player.dead) {
    if (!event.repeat && (code === "Digit1" || code === "Numpad1")) {
      respawnPlayer(ZONE_BEACH);
    } else if (!event.repeat && (code === "Digit2" || code === "Numpad2")) {
      respawnPlayer(ZONE_REDWOODS);
    }
    if (handledKeys.includes(code)) {
      event.preventDefault();
    }
    return;
  }

  if (code === "Escape" && !event.repeat && !respawnMenuOpen) {
    pauseMenuOpen = !pauseMenuOpen;
    if (pauseMenuOpen) {
      mapOpen = false;
      inventoryOpen = false;
      wantsJump = false;
      wantsInteract = false;
      wantsCraftPickaxe = false;
      wantsCraftAxe = false;
    }
    keys.clear();
    event.preventDefault();
    return;
  }

  if (pauseMenuOpen) {
    if (handledKeys.includes(code)) {
      event.preventDefault();
    }
    return;
  }

  tryStartBackgroundMusic();
  if (code === "ArrowUp" || code === "Space" || code === "KeyW") {
    wantsJump = true;
  }
  if (code === "KeyF" && !event.repeat) {
    wantsInteract = true;
  }
  if (code === "KeyC" && !event.repeat) {
    if (craftSelection === "axe") wantsCraftAxe = true;
    else wantsCraftPickaxe = true;
  }
  if (code === "KeyE" && !event.repeat) {
    if (!mapOpen) {
      inventoryOpen = !inventoryOpen;
    }
  }
  if (code === "KeyM" && !event.repeat) {
    mapOpen = !mapOpen;
    if (mapOpen) {
      inventoryOpen = false;
    }
  }
  if (code === "KeyR" && !event.repeat) {
    wantsRespawn = true;
  }
  if (code.startsWith("Digit")) {
    const slotIndex = Number(code.slice(5)) - 1;
    if (Number.isInteger(slotIndex) && slotIndex >= 0 && slotIndex < hotbar.slots.length) {
      hotbar.selected = slotIndex;
    }
  }
  keys.add(code);

  if (handledKeys.includes(code)) {
    event.preventDefault();
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

canvas.addEventListener("mousedown", (event) => {
  if (event.button !== 0) return;
  const mouse = getCanvasPoint(event);

  if (!gameStarted) {
    handleMainMenuClick(mouse.x, mouse.y);
    event.preventDefault();
    return;
  }

  if (respawnMenuOpen && player.dead) {
    handleRespawnMenuClick(mouse.x, mouse.y);
    event.preventDefault();
    return;
  }

  if (pauseMenuOpen) {
    handlePauseMenuClick(mouse.x, mouse.y);
    event.preventDefault();
    return;
  }

  tryStartBackgroundMusic();

  if (mapOpen) {
    handleMapClick(mouse.x, mouse.y);
    event.preventDefault();
    return;
  }

  if (pointInRect(mouse.x, mouse.y, inputState.musicToggleRect)) {
    toggleBackgroundMusic();
    event.preventDefault();
    return;
  }

  if (inventoryOpen) {
    handleInventoryClick(mouse.x, mouse.y);
  } else {
    let clickedHotbar = false;
    for (const slotRect of inputState.hotbarSlotRects) {
      if (pointInRect(mouse.x, mouse.y, slotRect)) {
        hotbar.selected = slotRect.slotIndex;
        clickedHotbar = true;
        break;
      }
    }
    if (!clickedHotbar) {
      wantsInteract = true;
    }
  }

  event.preventDefault();
});

canvas.addEventListener("touchstart", () => {
  tryStartBackgroundMusic();
}, { passive: true });

canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

window.addEventListener("beforeunload", () => {
  if (gameStarted) {
    if (isMultiplayerGame) {
      sendMultiplayerCharacterSave();
    } else {
      saveCurrentWorld(true);
    }
  }
});

function overlaps(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

function setNotice(message, duration = 1.8) {
  noticeText = message;
  noticeTimer = duration;
}

function decodeJwtPayload(token) {
  if (typeof token !== "string") return null;
  try {
    const tokenParts = token.split(".");
    if (tokenParts.length < 2) return null;
    let base64 = tokenParts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padding = base64.length % 4;
    if (padding) {
      base64 += "=".repeat(4 - padding);
    }
    const jsonPayload = atob(base64);
    const payload = JSON.parse(jsonPayload);
    if (payload && typeof payload === "object") {
      return payload;
    }
  } catch {
    // Ignore decode errors and return null.
  }
  return null;
}

function hasGoogleClientId() {
  return GOOGLE_CLIENT_ID && !GOOGLE_CLIENT_ID.startsWith("REPLACE_WITH_YOUR_");
}

function hasGoogleAuthSupportedOrigin() {
  return location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
}

function saveSignedInUser() {
  try {
    if (signedInUser) {
      localStorage.setItem(SIGNED_IN_USER_STORAGE_KEY, JSON.stringify({
        name: signedInUser,
        email: signedInEmail
      }));
    } else {
      localStorage.removeItem(SIGNED_IN_USER_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors.
  }
}

function hydrateSignedInUser() {
  try {
    const raw = localStorage.getItem(SIGNED_IN_USER_STORAGE_KEY);
    if (!raw) return;
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    if (parsed && typeof parsed === "object") {
      if (typeof parsed.name === "string" && parsed.name.trim()) {
        signedInUser = parsed.name.trim();
      }
      if (typeof parsed.email === "string") {
        signedInEmail = parsed.email.trim();
      }
      return;
    }
    if (typeof raw === "string" && raw.trim()) {
      // Backward compatibility with the previous plain-string storage format.
      signedInUser = raw.trim();
    }
  } catch {
    // Ignore storage errors.
  }
}

function setMenuStatus(message) {
  menuStatusText = message;
}

function clearGoogleSignInRetry() {
  if (googleSignInRetryTimeoutId !== null) {
    clearTimeout(googleSignInRetryTimeoutId);
    googleSignInRetryTimeoutId = null;
  }
}

function handleGoogleCredentialResponse(response) {
  const payload = decodeJwtPayload(response ? response.credential : "");
  if (!payload) {
    googleSignInPending = false;
    clearGoogleSignInRetry();
    setMenuStatus("Google sign-in failed. Try again.");
    return;
  }
  const email = typeof payload.email === "string" ? payload.email.trim() : "";
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const displayName = name || email || "Google Player";
  signedInUser = displayName;
  signedInEmail = email;
  googleSignInPending = false;
  clearGoogleSignInRetry();
  saveSignedInUser();
  loadWorldSavesForCurrentUser();
  setMenuStatus(`Signed in as ${displayName}.`);
}

function tryInitGoogleAuth() {
  if (googleAuthReady) return;
  if (!hasGoogleClientId()) {
    return;
  }
  if (!hasGoogleAuthSupportedOrigin()) {
    return;
  }
  if (!window.google || !window.google.accounts || !window.google.accounts.id) {
    return;
  }
  try {
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGoogleCredentialResponse,
      auto_select: false,
      cancel_on_tap_outside: true
    });
    googleAuthReady = true;
  } catch {
    setMenuStatus("Google sign-in init failed.");
  }
}

function openGoogleSignInPrompt() {
  if (!googleAuthReady || !window.google || !window.google.accounts || !window.google.accounts.id) {
    return false;
  }

  setMenuStatus("Opening Google sign-in...");
  window.google.accounts.id.prompt((notification) => {
    if (notification.isNotDisplayed && notification.isNotDisplayed()) {
      googleSignInPending = false;
      setMenuStatus("Google prompt blocked. Allow popups/cookies.");
    } else if (notification.isSkippedMoment && notification.isSkippedMoment()) {
      googleSignInPending = false;
      setMenuStatus("Google sign-in skipped. Click Google again.");
    } else if (notification.isDismissedMoment && notification.isDismissedMoment()) {
      googleSignInPending = false;
    }
  });
  return true;
}

function beginGoogleSignInFlow(attempt = 0) {
  if (!googleSignInPending || signedInUser) {
    clearGoogleSignInRetry();
    return;
  }

  tryInitGoogleAuth();
  if (googleAuthReady) {
    clearGoogleSignInRetry();
    openGoogleSignInPrompt();
    return;
  }

  if (attempt >= GOOGLE_SIGNIN_MAX_RETRIES) {
    googleSignInPending = false;
    clearGoogleSignInRetry();
    setMenuStatus("Google sign-in still loading. Click Google again.");
    return;
  }

  clearGoogleSignInRetry();
  googleSignInRetryTimeoutId = setTimeout(() => {
    beginGoogleSignInFlow(attempt + 1);
  }, GOOGLE_SIGNIN_RETRY_MS);
}

function handleAccountMenuAction() {
  if (signedInUser) {
    const wantsSignOut = confirm(`Signed in as ${signedInUser}. Sign out?`);
    if (!wantsSignOut) return;
    if (isMultiplayerGame) {
      returnToTitleScreen();
    }
    if (multiplayerSocket) {
      disconnectMultiplayer(true);
    }
    signedInUser = "";
    signedInEmail = "";
    googleSignInPending = false;
    clearGoogleSignInRetry();
    saveSignedInUser();
    loadWorldSavesForCurrentUser();
    activeWorldId = "";
    mainMenuScreen = MENU_HOME;
    if (window.google && window.google.accounts && window.google.accounts.id) {
      window.google.accounts.id.disableAutoSelect();
    }
    setMenuStatus("Signed out.");
    return;
  }

  if (!hasGoogleClientId()) {
    setMenuStatus("Set GOOGLE_CLIENT_ID in index.html first.");
    return;
  }
  if (!hasGoogleAuthSupportedOrigin()) {
    setMenuStatus("Use localhost/https for Google sign-in.");
    return;
  }

  googleSignInPending = true;
  setMenuStatus("Loading Google sign-in...");
  beginGoogleSignInFlow(0);
}

function dealDamageToPlayer(amount) {
  if (amount <= 0 || player.dead || player.health <= 0) return;
  player.health = Math.max(0, player.health - amount);
  player.regenCooldown = HEALTH_REGEN_DELAY;
  triggerDamageMusic();
}

function startGame() {
  if (!signedInUser) {
    setMenuStatus("Sign in first with Google.");
    return;
  }
  mainMenuScreen = MENU_MODE;
}

function returnToTitleScreen() {
  if (!gameStarted) return;
  let saveMessage = "Returned to title.";
  if (isMultiplayerGame) {
    sendMultiplayerCharacterSave();
    saveMessage = multiplayerWorldName
      ? `Saved survivor in ${multiplayerWorldName}.`
      : "Saved multiplayer survivor.";
    disconnectMultiplayer(true);
  } else {
    saveCurrentWorld(true);
    const world = getWorldById(activeWorldId || selectedWorldId);
    const worldName = world ? world.name : "World";
    saveMessage = `Saved ${worldName}.`;
  }

  gameStarted = false;
  mainMenuScreen = MENU_HOME;
  pauseMenuOpen = false;
  mapOpen = false;
  inventoryOpen = false;
  respawnMenuOpen = false;
  wantsJump = false;
  wantsInteract = false;
  wantsCraftPickaxe = false;
  wantsCraftAxe = false;
  wantsRespawn = false;
  keys.clear();
  player.vx = 0;
  player.vy = 0;
  wasInActiveGame = false;
  setMenuStatus(saveMessage);
  lastTime = performance.now();
}

function handlePauseMenuClick(mouseX, mouseY) {
  if (pointInRect(mouseX, mouseY, inputState.pauseMenu.returnButton)) {
    returnToTitleScreen();
  }
}

function handleMainMenuClick(mouseX, mouseY) {
  if (pointInRect(mouseX, mouseY, inputState.mainMenu.accountButton)) {
    handleAccountMenuAction();
    return;
  }

  if (mainMenuScreen === MENU_HOME) {
    if (pointInRect(mouseX, mouseY, inputState.mainMenu.playButton)) {
      startGame();
    }
    return;
  }

  if (mainMenuScreen === MENU_MODE) {
    if (pointInRect(mouseX, mouseY, inputState.mainMenu.singleplayerButton)) {
      mainMenuScreen = MENU_SINGLEPLAYER;
      return;
    }
    if (pointInRect(mouseX, mouseY, inputState.mainMenu.multiplayerButton)) {
      beginMultiplayerFlow();
      return;
    }
    if (pointInRect(mouseX, mouseY, inputState.mainMenu.backButton)) {
      mainMenuScreen = MENU_HOME;
      return;
    }
    return;
  }

  if (mainMenuScreen === MENU_SINGLEPLAYER) {
    if (pointInRect(mouseX, mouseY, inputState.mainMenu.createWorldButton)) {
      createNewWorld();
      return;
    }
    for (const worldButton of inputState.mainMenu.worldButtons) {
      if (!pointInRect(mouseX, mouseY, worldButton)) continue;
      selectedWorldId = worldButton.worldId;
      startGameWithWorld(worldButton.worldId);
      return;
    }
    if (pointInRect(mouseX, mouseY, inputState.mainMenu.backButton)) {
      mainMenuScreen = MENU_MODE;
      return;
    }
  }
}

function zoneHasDinoSpawns() {
  return currentZone === ZONE_BEACH || currentZone === ZONE_REDWOODS;
}

function getZoneSpawnX(zone = currentZone) {
  return zone === ZONE_REDWOODS ? REDWOODS_SPAWN_X : PLAYER_SPAWN_X;
}

function respawnPlayer(zone = currentZone) {
  const targetZone = zone === ZONE_REDWOODS ? ZONE_REDWOODS : ZONE_BEACH;
  const zoneChanged = currentZone !== targetZone;
  currentZone = targetZone;
  if (zoneChanged) {
    resetDinosaursForZone(targetZone);
  }

  player.x = getZoneSpawnX(targetZone);
  player.y = PLAYER_SPAWN_Y;
  player.vx = 0;
  player.vy = 0;
  player.health = player.maxHealth;
  player.regenCooldown = 0;
  player.dead = false;
  player.respawnTimer = 0;
  player.onGround = false;
  respawnMenuOpen = false;
  pauseMenuOpen = false;
  mapOpen = false;
  inventoryOpen = false;
}

function killPlayer() {
  player.health = 0;
  if (player.dead) return;
  player.dead = true;
  player.respawnTimer = PLAYER_RESPAWN_SECONDS;
  respawnMenuOpen = true;
  pauseMenuOpen = false;
  mapOpen = false;
  inventoryOpen = false;
  player.vx = 0;
  player.vy = 0;
  keys.clear();
}

function fastTravelToZone(zone) {
  if (zone !== ZONE_BEACH && zone !== ZONE_REDWOODS) return;

  const zoneChanged = currentZone !== zone;
  currentZone = zone;
  if (zoneChanged) {
    resetDinosaursForZone(zone);
  }
  mapOpen = false;
  inventoryOpen = false;

  if (player.dead) {
    respawnPlayer(zone);
    cameraX = Math.max(0, Math.min(WORLD_WIDTH - VIEW_WIDTH, player.x - VIEW_WIDTH * 0.35));
    return;
  }

  player.x = getZoneSpawnX(zone);
  player.y = PLAYER_SPAWN_Y;
  player.vx = 0;
  player.vy = 0;
  player.onGround = false;
  cameraX = Math.max(0, Math.min(WORLD_WIDTH - VIEW_WIDTH, player.x - VIEW_WIDTH * 0.35));
}

function handleRespawnMenuClick(mouseX, mouseY) {
  const ui = inputState.respawnMenu;
  if (pointInRect(mouseX, mouseY, ui.beachButton)) {
    respawnPlayer(ZONE_BEACH);
    return;
  }
  if (pointInRect(mouseX, mouseY, ui.redwoodsButton)) {
    respawnPlayer(ZONE_REDWOODS);
  }
}

function handleMapClick(mouseX, mouseY) {
  const ui = inputState.mapUi;

  if (pointInRect(mouseX, mouseY, ui.closeButton)) {
    mapOpen = false;
    return;
  }
  if (pointInRect(mouseX, mouseY, ui.beachButton)) {
    fastTravelToZone(ZONE_BEACH);
    return;
  }
  if (pointInRect(mouseX, mouseY, ui.redwoodsButton)) {
    fastTravelToZone(ZONE_REDWOODS);
    return;
  }

  if (!pointInRect(mouseX, mouseY, ui.panel)) {
    mapOpen = false;
  }
}

function pointInRect(x, y, rect) {
  if (!rect) return false;
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = VIEW_WIDTH / rect.width;
  const scaleY = VIEW_HEIGHT / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY
  };
}

function isToolOwned(tool) {
  if (tool === "hands") return true;
  if (tool === "pickaxe") return inventory.pickaxe;
  if (tool === "axe") return inventory.axe;
  return false;
}

function getToolLabel(tool) {
  if (tool === "hands") return "Hands";
  if (tool === "pickaxe") return "Stone Pickaxe";
  if (tool === "axe") return "Stone Axe";
  return "Empty Slot";
}

function getActiveTool() {
  const selectedTool = hotbar.slots[hotbar.selected];
  return isToolOwned(selectedTool) ? selectedTool : "hands";
}

function assignToolToHotbar(tool, slotIndex) {
  if (slotIndex < 0 || slotIndex >= hotbar.slots.length) return;
  if (!isToolOwned(tool)) {
    setNotice(`${getToolLabel(tool)} is not crafted.`);
    return;
  }

  for (let i = 0; i < hotbar.slots.length; i++) {
    if (i !== slotIndex && hotbar.slots[i] === tool && tool !== "hands") {
      hotbar.slots[i] = null;
    }
  }
  hotbar.slots[slotIndex] = tool;
}

function sanitizeHotbarSlots() {
  for (let i = 0; i < hotbar.slots.length; i++) {
    const tool = hotbar.slots[i];
    if (tool && !isToolOwned(tool)) {
      hotbar.slots[i] = null;
    }
  }
  if (!hotbar.slots.includes("hands")) {
    hotbar.slots[0] = "hands";
  }
  hotbar.selected = Math.max(0, Math.min(hotbar.slots.length - 1, hotbar.selected));
}

function canCraftPickaxe() {
  return inventory.stone >= 3 && inventory.thatch >= 10 && inventory.wood >= 2;
}

function canCraftAxe() {
  return inventory.flint >= 3 && inventory.stone >= 2 && inventory.thatch >= 10 && inventory.wood >= 1;
}

function getNearestTree(maxDistance = 85) {
  let nearest = null;
  let nearestDist = Number.POSITIVE_INFINITY;
  const playerCenterX = player.x + player.w / 2;
  const playerFeetY = player.y + player.h;

  for (const tree of trees) {
    if (!tree.alive) continue;
    const treeCenterX = tree.x + tree.trunkW / 2;
    const dx = Math.abs(playerCenterX - treeCenterX);
    const dy = Math.abs(playerFeetY - tree.baseY);
    if (dx <= maxDistance && dy <= 95 && dx < nearestDist) {
      nearest = tree;
      nearestDist = dx;
    }
  }

  return nearest;
}

function getNearestStone(maxDistance = 85) {
  let nearest = null;
  let nearestDist = Number.POSITIVE_INFINITY;
  const playerCenterX = player.x + player.w / 2;
  const playerFeetY = player.y + player.h;

  for (const stone of stones) {
    if (!stone.alive) continue;
    const stoneCenterX = stone.x + stone.w / 2;
    const stoneCenterY = stone.y + stone.h / 2;
    const dx = playerCenterX - stoneCenterX;
    const dy = playerFeetY - stoneCenterY;
    const dist = Math.hypot(dx, dy);
    if (dist <= maxDistance && dist < nearestDist) {
      nearest = stone;
      nearestDist = dist;
    }
  }

  return nearest;
}

function getNearestPebble(maxDistance = 70) {
  let nearest = null;
  let nearestDist = Number.POSITIVE_INFINITY;
  const playerCenterX = player.x + player.w / 2;
  const playerFeetY = player.y + player.h;

  for (const pebble of pebbles) {
    if (pebble.picked) continue;
    const pebbleCenterX = pebble.x + pebble.w / 2;
    const pebbleCenterY = pebble.y + pebble.h / 2;
    const dx = playerCenterX - pebbleCenterX;
    const dy = playerFeetY - pebbleCenterY;
    const dist = Math.hypot(dx, dy);
    if (dist <= maxDistance && dist < nearestDist) {
      nearest = pebble;
      nearestDist = dist;
    }
  }

  return nearest;
}

function getNearestDodo(maxDistance = 85) {
  if (!zoneHasDinoSpawns()) return null;
  let nearest = null;
  let nearestDist = Number.POSITIVE_INFINITY;
  const playerCenterX = player.x + player.w / 2;
  const playerCenterY = player.y + player.h / 2;

  for (const dodo of dinosaurs) {
    if (!dodo.alive || dodo.type !== "dodo") continue;
    const dodoCenterX = dodo.x + dodo.w / 2;
    const dodoCenterY = dodo.y + dodo.h / 2;
    const dx = playerCenterX - dodoCenterX;
    const dy = playerCenterY - dodoCenterY;
    const dist = Math.hypot(dx, dy);
    if (dist <= maxDistance && dist < nearestDist) {
      nearest = dodo;
      nearestDist = dist;
    }
  }

  return nearest;
}

function getNearestDilophosaur(maxDistance = 90) {
  if (!zoneHasDinoSpawns()) return null;
  let nearest = null;
  let nearestDist = Number.POSITIVE_INFINITY;
  const playerCenterX = player.x + player.w / 2;
  const playerCenterY = player.y + player.h / 2;

  for (const dilo of dinosaurs) {
    if (!dilo.alive || dilo.type !== "dilo") continue;
    const diloCenterX = dilo.x + dilo.w / 2;
    const diloCenterY = dilo.y + dilo.h / 2;
    const dx = playerCenterX - diloCenterX;
    const dy = playerCenterY - diloCenterY;
    const dist = Math.hypot(dx, dy);
    if (dist <= maxDistance && dist < nearestDist) {
      nearest = dilo;
      nearestDist = dist;
    }
  }

  return nearest;
}

function getNearestTriceratops(maxDistance = 110) {
  if (!zoneHasDinoSpawns()) return null;
  let nearest = null;
  let nearestDist = Number.POSITIVE_INFINITY;
  const playerCenterX = player.x + player.w / 2;
  const playerCenterY = player.y + player.h / 2;

  for (const trike of dinosaurs) {
    if (!trike.alive || trike.type !== "trike") continue;
    const trikeCenterX = trike.x + trike.w / 2;
    const trikeCenterY = trike.y + trike.h / 2;
    const dx = playerCenterX - trikeCenterX;
    const dy = playerCenterY - trikeCenterY;
    const dist = Math.hypot(dx, dy);
    if (dist <= maxDistance && dist < nearestDist) {
      nearest = trike;
      nearestDist = dist;
    }
  }

  return nearest;
}

function getNearestParasaur(maxDistance = 105) {
  if (!zoneHasDinoSpawns()) return null;
  let nearest = null;
  let nearestDist = Number.POSITIVE_INFINITY;
  const playerCenterX = player.x + player.w / 2;
  const playerCenterY = player.y + player.h / 2;

  for (const parasaur of dinosaurs) {
    if (!parasaur.alive || parasaur.type !== "parasaur") continue;
    const parasaurCenterX = parasaur.x + parasaur.w / 2;
    const parasaurCenterY = parasaur.y + parasaur.h / 2;
    const dx = playerCenterX - parasaurCenterX;
    const dy = playerCenterY - parasaurCenterY;
    const dist = Math.hypot(dx, dy);
    if (dist <= maxDistance && dist < nearestDist) {
      nearest = parasaur;
      nearestDist = dist;
    }
  }

  return nearest;
}

function getNearestRaptor(maxDistance = 95) {
  if (!zoneHasDinoSpawns()) return null;
  let nearest = null;
  let nearestDist = Number.POSITIVE_INFINITY;
  const playerCenterX = player.x + player.w / 2;
  const playerCenterY = player.y + player.h / 2;

  for (const raptor of dinosaurs) {
    if (!raptor.alive || raptor.type !== "raptor") continue;
    const raptorCenterX = raptor.x + raptor.w / 2;
    const raptorCenterY = raptor.y + raptor.h / 2;
    const dx = playerCenterX - raptorCenterX;
    const dy = playerCenterY - raptorCenterY;
    const dist = Math.hypot(dx, dy);
    if (dist <= maxDistance && dist < nearestDist) {
      nearest = raptor;
      nearestDist = dist;
    }
  }

  return nearest;
}

function getNearestThylacoleo(maxDistance = 100) {
  if (!zoneHasDinoSpawns()) return null;
  let nearest = null;
  let nearestDist = Number.POSITIVE_INFINITY;
  const playerCenterX = player.x + player.w / 2;
  const playerCenterY = player.y + player.h / 2;

  for (const thylacoleo of dinosaurs) {
    if (!thylacoleo.alive || thylacoleo.type !== "thylacoleo") continue;
    const thylacoleoCenterX = thylacoleo.x + thylacoleo.w / 2;
    const thylacoleoCenterY = thylacoleo.y + thylacoleo.h / 2;
    const dx = playerCenterX - thylacoleoCenterX;
    const dy = playerCenterY - thylacoleoCenterY;
    const dist = Math.hypot(dx, dy);
    if (dist <= maxDistance && dist < nearestDist) {
      nearest = thylacoleo;
      nearestDist = dist;
    }
  }

  return nearest;
}

function getInteractionTarget(maxDistance = 90) {
  const candidates = [];

  const tree = getNearestTree(maxDistance);
  if (tree) {
    const treeCenterX = tree.x + tree.trunkW / 2;
    const dist = Math.abs(player.x + player.w / 2 - treeCenterX);
    candidates.push({ type: "tree", entity: tree, dist });
  }

  const stone = getNearestStone(maxDistance);
  if (stone) {
    const stoneCenterX = stone.x + stone.w / 2;
    const dist = Math.abs(player.x + player.w / 2 - stoneCenterX);
    candidates.push({ type: "stone", entity: stone, dist });
  }

  const pebble = getNearestPebble(maxDistance);
  if (pebble) {
    const pebbleCenterX = pebble.x + pebble.w / 2;
    const dist = Math.abs(player.x + player.w / 2 - pebbleCenterX);
    candidates.push({ type: "pebble", entity: pebble, dist });
  }

  const dodo = getNearestDodo(maxDistance);
  if (dodo) {
    const dodoCenterX = dodo.x + dodo.w / 2;
    const dist = Math.abs(player.x + player.w / 2 - dodoCenterX);
    candidates.push({ type: "dodo", entity: dodo, dist });
  }

  const dilo = getNearestDilophosaur(maxDistance);
  if (dilo) {
    const diloCenterX = dilo.x + dilo.w / 2;
    const dist = Math.abs(player.x + player.w / 2 - diloCenterX);
    candidates.push({ type: "dilo", entity: dilo, dist });
  }

  const raptor = getNearestRaptor(maxDistance + 10);
  if (raptor) {
    const raptorCenterX = raptor.x + raptor.w / 2;
    const dist = Math.abs(player.x + player.w / 2 - raptorCenterX);
    candidates.push({ type: "raptor", entity: raptor, dist });
  }

  const thylacoleo = getNearestThylacoleo(maxDistance + 12);
  if (thylacoleo) {
    const thylacoleoCenterX = thylacoleo.x + thylacoleo.w / 2;
    const dist = Math.abs(player.x + player.w / 2 - thylacoleoCenterX);
    candidates.push({ type: "thylacoleo", entity: thylacoleo, dist });
  }

  const trike = getNearestTriceratops(maxDistance + 20);
  if (trike) {
    const trikeCenterX = trike.x + trike.w / 2;
    const dist = Math.abs(player.x + player.w / 2 - trikeCenterX);
    candidates.push({ type: "trike", entity: trike, dist });
  }

  const parasaur = getNearestParasaur(maxDistance + 15);
  if (parasaur) {
    const parasaurCenterX = parasaur.x + parasaur.w / 2;
    const dist = Math.abs(player.x + player.w / 2 - parasaurCenterX);
    candidates.push({ type: "parasaur", entity: parasaur, dist });
  }

  if (candidates.length === 0) return null;
  const typePriority = { pebble: 0, tree: 1, stone: 2, thylacoleo: 3, raptor: 4, dilo: 5, trike: 6, parasaur: 7, dodo: 8 };
  candidates.sort((a, b) => {
    if (a.dist !== b.dist) return a.dist - b.dist;
    return typePriority[a.type] - typePriority[b.type];
  });
  return candidates[0];
}

function craftPickaxe() {
  if (!inventoryOpen) {
    setNotice("Open inventory (E) to craft.");
    return;
  }
  if (inventory.pickaxe) {
    setNotice("Stone pickaxe already crafted.");
    return;
  }
  if (!canCraftPickaxe()) {
    setNotice("Need 3 stone, 10 thatch, 2 wood.");
    return;
  }

  inventory.stone -= 3;
  inventory.thatch -= 10;
  inventory.wood -= 2;
  inventory.pickaxe = true;
  assignToolToHotbar("pickaxe", hotbar.selected);
  setNotice("Crafted Stone Pickaxe.");
}

function craftAxe() {
  if (!inventoryOpen) {
    setNotice("Open inventory (E) to craft.");
    return;
  }
  if (inventory.axe) {
    setNotice("Stone axe already crafted.");
    return;
  }
  if (!canCraftAxe()) {
    setNotice("Need 3 flint, 2 stone, 10 thatch, 1 wood.");
    return;
  }

  inventory.flint -= 3;
  inventory.stone -= 2;
  inventory.thatch -= 10;
  inventory.wood -= 1;
  inventory.axe = true;
  assignToolToHotbar("axe", hotbar.selected);
  setNotice("Crafted Stone Axe.");
}

function handleInventoryClick(mouseX, mouseY) {
  const ui = inputState.inventoryUi;

  if (pointInRect(mouseX, mouseY, ui.craftPickaxeButton)) {
    craftSelection = "pickaxe";
    wantsCraftPickaxe = true;
    return;
  }
  if (pointInRect(mouseX, mouseY, ui.craftAxeButton)) {
    craftSelection = "axe";
    wantsCraftAxe = true;
    return;
  }

  for (const [tool, rect] of Object.entries(ui.toolButtons)) {
    if (pointInRect(mouseX, mouseY, rect)) {
      if (!isToolOwned(tool)) {
        setNotice(`${getToolLabel(tool)} is not crafted.`);
        return;
      }
      selectedInventoryTool = tool;
      return;
    }
  }

  for (const rect of ui.assignButtons) {
    if (pointInRect(mouseX, mouseY, rect)) {
      hotbar.selected = rect.slotIndex;
      if (selectedInventoryTool) {
        assignToolToHotbar(selectedInventoryTool, rect.slotIndex);
      }
      return;
    }
  }

  if (pointInRect(mouseX, mouseY, ui.clearSelectedButton)) {
    if (hotbar.slots[hotbar.selected] === "hands") {
      setNotice("Hands slot cannot be cleared.");
      return;
    }
    hotbar.slots[hotbar.selected] = null;
    setNotice("Cleared selected hotbar slot.", 1.2);
  }
}

function updateDinoRespawns(dt) {
  if (!zoneHasDinoSpawns()) return;
  for (const dino of dinosaurs) {
    if (dino.alive) continue;
    dino.respawnTimer = Math.max(0, dino.respawnTimer - dt);
    if (dino.respawnTimer <= 0) {
      Object.assign(dino, createDinoAtSpawn(dino.spawn, dino.forcedType, currentZone));
    }
  }
}

function updateDodos(dt) {
  if (!zoneHasDinoSpawns()) return;
  for (const dodo of dinosaurs) {
    if (!dodo.alive || dodo.type !== "dodo") continue;

    const moveSpeed = dodo.fleeTimer > 0 ? dodo.speed * 1.15 : dodo.speed;
    dodo.x += dodo.dir * moveSpeed * dt;
    if (dodo.x < dodo.minX) {
      dodo.x = dodo.minX;
      dodo.dir = 1;
    } else if (dodo.x + dodo.w > dodo.maxX) {
      dodo.x = dodo.maxX - dodo.w;
      dodo.dir = -1;
    }

    if (dodo.fleeTimer > 0) {
      dodo.fleeTimer = Math.max(0, dodo.fleeTimer - dt);
    }
    dodo.anim += dt * 8;
  }
}

function updateDilophosaurs(dt) {
  if (!zoneHasDinoSpawns()) return;
  for (const dilo of dinosaurs) {
    if (!dilo.alive || dilo.type !== "dilo") continue;

    const playerCenterX = player.x + player.w / 2;
    const playerCenterY = player.y + player.h / 2;
    const diloCenterX = dilo.x + dilo.w / 2;
    const diloCenterY = dilo.y + dilo.h / 2;
    const dxToPlayer = playerCenterX - diloCenterX;
    const dyToPlayer = playerCenterY - diloCenterY;
    const horizontalDistance = Math.abs(dxToPlayer);
    const verticalDistance = Math.abs(dyToPlayer);
    const aggro = horizontalDistance <= 260 && verticalDistance <= 85;

    if (aggro) {
      if (dxToPlayer > dilo.faceDeadzone) dilo.dir = 1;
      else if (dxToPlayer < -dilo.faceDeadzone) dilo.dir = -1;
      const stopDistanceX = Math.max(22, dilo.attackReachX - 10);
      if (horizontalDistance > stopDistanceX) {
        dilo.x += dilo.dir * dilo.speed * 1.3 * dt;
      }
    } else {
      dilo.x += dilo.dir * dilo.speed * dt;
      if (dilo.x < dilo.minX) {
        dilo.x = dilo.minX;
        dilo.dir = 1;
      } else if (dilo.x + dilo.w > dilo.maxX) {
        dilo.x = dilo.maxX - dilo.w;
        dilo.dir = -1;
      }
    }

    dilo.x = Math.max(dilo.minX, Math.min(dilo.maxX - dilo.w, dilo.x));

    if (dilo.attackCooldown > 0) {
      dilo.attackCooldown = Math.max(0, dilo.attackCooldown - dt);
    }

    const updatedDiloCenterX = dilo.x + dilo.w / 2;
    const updatedDiloCenterY = dilo.y + dilo.h / 2;
    const biteDistanceX = Math.abs(playerCenterX - updatedDiloCenterX);
    const biteDistanceY = Math.abs(playerCenterY - updatedDiloCenterY);
    if (biteDistanceX <= dilo.attackReachX && biteDistanceY <= dilo.attackReachY && dilo.attackCooldown <= 0 && player.health > 0) {
      dealDamageToPlayer(dilo.attackDamage);
      dilo.attackCooldown = dilo.attackInterval;
    }

    dilo.anim += dt * 9;
  }
}

function updateRaptors(dt) {
  if (!zoneHasDinoSpawns()) return;
  for (const raptor of dinosaurs) {
    if (!raptor.alive || raptor.type !== "raptor") continue;

    const playerCenterX = player.x + player.w / 2;
    const playerCenterY = player.y + player.h / 2;
    const raptorCenterX = raptor.x + raptor.w / 2;
    const raptorCenterY = raptor.y + raptor.h / 2;
    const dxToPlayer = playerCenterX - raptorCenterX;
    const dyToPlayer = playerCenterY - raptorCenterY;
    const horizontalDistance = Math.abs(dxToPlayer);
    const verticalDistance = Math.abs(dyToPlayer);
    const aggro = horizontalDistance <= 320 && verticalDistance <= 95;

    if (aggro) {
      if (dxToPlayer > raptor.faceDeadzone) raptor.dir = 1;
      else if (dxToPlayer < -raptor.faceDeadzone) raptor.dir = -1;
      const stopDistanceX = Math.max(24, raptor.attackReachX - 10);
      if (horizontalDistance > stopDistanceX) {
        raptor.x += raptor.dir * raptor.speed * 1.45 * dt;
      }
    } else {
      raptor.x += raptor.dir * raptor.speed * dt;
      if (raptor.x < raptor.minX) {
        raptor.x = raptor.minX;
        raptor.dir = 1;
      } else if (raptor.x + raptor.w > raptor.maxX) {
        raptor.x = raptor.maxX - raptor.w;
        raptor.dir = -1;
      }
    }

    raptor.x = Math.max(raptor.minX, Math.min(raptor.maxX - raptor.w, raptor.x));

    if (raptor.attackCooldown > 0) {
      raptor.attackCooldown = Math.max(0, raptor.attackCooldown - dt);
    }

    const updatedRaptorCenterX = raptor.x + raptor.w / 2;
    const updatedRaptorCenterY = raptor.y + raptor.h / 2;
    const biteDistanceX = Math.abs(playerCenterX - updatedRaptorCenterX);
    const biteDistanceY = Math.abs(playerCenterY - updatedRaptorCenterY);
    if (biteDistanceX <= raptor.attackReachX && biteDistanceY <= raptor.attackReachY && raptor.attackCooldown <= 0 && player.health > 0) {
      dealDamageToPlayer(raptor.attackDamage);
      raptor.attackCooldown = raptor.attackInterval;
    }

    raptor.anim += dt * 9.6;
  }
}

function updateThylacoleos(dt) {
  if (!zoneHasDinoSpawns()) return;
  for (const thylacoleo of dinosaurs) {
    if (!thylacoleo.alive || thylacoleo.type !== "thylacoleo") continue;

    const playerCenterX = player.x + player.w / 2;
    const playerCenterY = player.y + player.h / 2;
    const thylacoleoCenterX = thylacoleo.x + thylacoleo.w / 2;
    const thylacoleoCenterY = thylacoleo.y + thylacoleo.h / 2;
    const dxToPlayer = playerCenterX - thylacoleoCenterX;
    const dyToPlayer = playerCenterY - thylacoleoCenterY;
    const horizontalDistance = Math.abs(dxToPlayer);
    const verticalDistance = Math.abs(dyToPlayer);
    const aggro = horizontalDistance <= 340 && verticalDistance <= 105;

    if (thylacoleo.treePerched) {
      thylacoleo.x = thylacoleo.treePerchX;
      thylacoleo.y = thylacoleo.treePerchY;
      if (thylacoleo.attackCooldown > 0) {
        thylacoleo.attackCooldown = Math.max(0, thylacoleo.attackCooldown - dt);
      }

      const playerBelow = playerCenterY >= thylacoleoCenterY - 2;
      const closeUnderTree = horizontalDistance <= 62;
      if (!player.dead && player.health > 0 && playerBelow && closeUnderTree) {
        thylacoleo.treePerched = false;
        thylacoleo.vy = 280;
        thylacoleo.dir = dxToPlayer >= 0 ? 1 : -1;
      }

      thylacoleo.anim += dt * 6.2;
      continue;
    }

    if (thylacoleo.y < thylacoleo.groundY || thylacoleo.vy > 0) {
      thylacoleo.vy += gravity * 0.72 * dt;
      thylacoleo.y += thylacoleo.vy * dt;
      thylacoleo.x += thylacoleo.dir * thylacoleo.speed * 0.65 * dt;
      if (thylacoleo.y >= thylacoleo.groundY) {
        thylacoleo.y = thylacoleo.groundY;
        thylacoleo.vy = 0;
      }
      thylacoleo.x = Math.max(thylacoleo.minX, Math.min(thylacoleo.maxX - thylacoleo.w, thylacoleo.x));
      if (thylacoleo.attackCooldown > 0) {
        thylacoleo.attackCooldown = Math.max(0, thylacoleo.attackCooldown - dt);
      }
      thylacoleo.anim += dt * 9.4;
      continue;
    }

    if (aggro) {
      if (dxToPlayer > thylacoleo.faceDeadzone) thylacoleo.dir = 1;
      else if (dxToPlayer < -thylacoleo.faceDeadzone) thylacoleo.dir = -1;
      const stopDistanceX = Math.max(26, thylacoleo.attackReachX - 12);
      if (horizontalDistance > stopDistanceX) {
        thylacoleo.x += thylacoleo.dir * thylacoleo.speed * 1.38 * dt;
      }
    } else {
      thylacoleo.x += thylacoleo.dir * thylacoleo.speed * dt;
      if (thylacoleo.x < thylacoleo.minX) {
        thylacoleo.x = thylacoleo.minX;
        thylacoleo.dir = 1;
      } else if (thylacoleo.x + thylacoleo.w > thylacoleo.maxX) {
        thylacoleo.x = thylacoleo.maxX - thylacoleo.w;
        thylacoleo.dir = -1;
      }
    }

    thylacoleo.x = Math.max(thylacoleo.minX, Math.min(thylacoleo.maxX - thylacoleo.w, thylacoleo.x));

    if (thylacoleo.attackCooldown > 0) {
      thylacoleo.attackCooldown = Math.max(0, thylacoleo.attackCooldown - dt);
    }

    const updatedCenterX = thylacoleo.x + thylacoleo.w / 2;
    const updatedCenterY = thylacoleo.y + thylacoleo.h / 2;
    const biteDistanceX = Math.abs(playerCenterX - updatedCenterX);
    const biteDistanceY = Math.abs(playerCenterY - updatedCenterY);
    if (biteDistanceX <= thylacoleo.attackReachX && biteDistanceY <= thylacoleo.attackReachY && thylacoleo.attackCooldown <= 0 && player.health > 0) {
      dealDamageToPlayer(thylacoleo.attackDamage);
      thylacoleo.attackCooldown = thylacoleo.attackInterval;
    }

    thylacoleo.anim += dt * 10.2;
  }
}

function updateTriceratops(dt) {
  if (!zoneHasDinoSpawns()) return;
  for (const trike of dinosaurs) {
    if (!trike.alive || trike.type !== "trike") continue;

    if (trike.attackCooldown > 0) {
      trike.attackCooldown = Math.max(0, trike.attackCooldown - dt);
    }
    if (trike.aggroTimer > 0) {
      trike.aggroTimer = Math.max(0, trike.aggroTimer - dt);
    }

    const playerCenterX = player.x + player.w / 2;
    const playerCenterY = player.y + player.h / 2;
    const trikeCenterX = trike.x + trike.w / 2;
    const trikeCenterY = trike.y + trike.h / 2;
    const dxToPlayer = playerCenterX - trikeCenterX;
    const horizontalDistance = Math.abs(dxToPlayer);

    if (trike.aggroTimer > 0 && !player.dead && player.health > 0) {
      if (dxToPlayer > trike.faceDeadzone) trike.dir = 1;
      else if (dxToPlayer < -trike.faceDeadzone) trike.dir = -1;
      const stopDistanceX = Math.max(28, trike.attackReachX - 12);
      if (horizontalDistance > stopDistanceX) {
        trike.x += trike.dir * trike.speed * 1.35 * dt;
      }
    } else {
      trike.x += trike.dir * trike.speed * dt;
      if (trike.x < trike.minX) {
        trike.x = trike.minX;
        trike.dir = 1;
      } else if (trike.x + trike.w > trike.maxX) {
        trike.x = trike.maxX - trike.w;
        trike.dir = -1;
      }
    }

    trike.x = Math.max(trike.minX, Math.min(trike.maxX - trike.w, trike.x));

    if (trike.aggroTimer > 0 && !player.dead && player.health > 0) {
      const updatedTrikeCenterX = trike.x + trike.w / 2;
      const biteDistanceX = Math.abs(playerCenterX - updatedTrikeCenterX);
      const biteDistanceY = Math.abs(playerCenterY - trikeCenterY);
      if (biteDistanceX <= trike.attackReachX && biteDistanceY <= trike.attackReachY && trike.attackCooldown <= 0) {
        dealDamageToPlayer(trike.attackDamage);
        trike.attackCooldown = trike.attackInterval;
      }
    }

    trike.anim += dt * 6.6;
  }
}

function updateParasaurs(dt) {
  if (!zoneHasDinoSpawns()) return;
  for (const parasaur of dinosaurs) {
    if (!parasaur.alive || parasaur.type !== "parasaur") continue;

    const moveSpeed = parasaur.fleeTimer > 0 ? parasaur.speed * 1.45 : parasaur.speed;
    parasaur.x += parasaur.dir * moveSpeed * dt;
    if (parasaur.x < parasaur.minX) {
      parasaur.x = parasaur.minX;
      parasaur.dir = 1;
    } else if (parasaur.x + parasaur.w > parasaur.maxX) {
      parasaur.x = parasaur.maxX - parasaur.w;
      parasaur.dir = -1;
    }

    if (parasaur.fleeTimer > 0) {
      parasaur.fleeTimer = Math.max(0, parasaur.fleeTimer - dt);
    }
    parasaur.anim += dt * 7.1;
  }
}

function updateResourceRespawns(dt) {
  for (const tree of trees) {
    if (tree.alive) continue;
    tree.respawnTimer = Math.max(0, tree.respawnTimer - dt);
    if (tree.respawnTimer <= 0) {
      tree.alive = true;
      tree.health = tree.maxHealth;
    }
  }

  for (const stone of stones) {
    if (stone.alive) continue;
    stone.respawnTimer = Math.max(0, stone.respawnTimer - dt);
    if (stone.respawnTimer <= 0) {
      stone.alive = true;
      rerollStoneNode(stone);
    }
  }

  for (const pebble of pebbles) {
    if (!pebble.picked) continue;
    pebble.respawnTimer = Math.max(0, pebble.respawnTimer - dt);
    if (pebble.respawnTimer <= 0) {
      pebble.picked = false;
    }
  }
}

function update(dt) {
  if (player.health <= 0) {
    killPlayer();
  }
  if (player.dead) {
    respawnMenuOpen = true;
    player.respawnTimer = Math.max(0, player.respawnTimer - dt);
    player.vx = 0;
    player.vy = 0;
    pauseMenuOpen = false;
    mapOpen = false;
    inventoryOpen = false;
  }
  wantsRespawn = false;
  updateDamageMusic(dt);
  if (!isMultiplayerGame && signedInUser && activeWorldId) {
    worldAutoSaveTimer = Math.max(0, worldAutoSaveTimer - dt);
    if (worldAutoSaveTimer <= 0) {
      saveCurrentWorld(true);
      worldAutoSaveTimer = WORLD_AUTOSAVE_SECONDS;
    }
  }

  if (mapOpen) {
    wantsJump = false;
    wantsInteract = false;
    wantsCraftPickaxe = false;
    wantsCraftAxe = false;
    player.vx = 0;
    player.vy = 0;
    cameraX = Math.max(0, Math.min(WORLD_WIDTH - VIEW_WIDTH, player.x - VIEW_WIDTH * 0.35));
    updateMultiplayerNetworking(dt);
    return;
  }

  if (player.dead) {
    wantsJump = false;
    wantsInteract = false;
    wantsCraftPickaxe = false;
    wantsCraftAxe = false;
    updateResourceRespawns(dt);
    if (noticeTimer > 0) {
      noticeTimer = Math.max(0, noticeTimer - dt);
      if (noticeTimer === 0) {
        noticeText = "";
      }
    }
    updateDinoRespawns(dt);
    updateParasaurs(dt);
    updateDodos(dt);
    updateRaptors(dt);
    updateThylacoleos(dt);
    updateTriceratops(dt);
    updateDilophosaurs(dt);
    cameraX = Math.max(0, Math.min(WORLD_WIDTH - VIEW_WIDTH, player.x - VIEW_WIDTH * 0.35));
    updateMultiplayerNetworking(dt);
    return;
  }

  const left = keys.has("ArrowLeft") || keys.has("KeyA");
  const right = keys.has("ArrowRight") || keys.has("KeyD");
  const inputX = player.dead ? 0 : (right ? 1 : 0) - (left ? 1 : 0);

  if (inputX !== 0) {
    player.vx += inputX * player.moveAccel * dt;
  } else {
    const drag = player.friction * dt;
    if (Math.abs(player.vx) <= drag) {
      player.vx = 0;
    } else {
      player.vx -= Math.sign(player.vx) * drag;
    }
  }
  player.vx = Math.max(-player.maxSpeed, Math.min(player.maxSpeed, player.vx));

  if (wantsJump && player.onGround && !player.dead) {
    player.vy = -player.jumpSpeed;
    player.onGround = false;
  }
  wantsJump = false;

  player.vy += gravity * dt;

  const oldX = player.x;
  const oldY = player.y;

  player.x += player.vx * dt;
  for (const plat of platforms) {
    if (!overlaps(player, plat)) continue;

    if (player.vx > 0 && oldX + player.w <= plat.x) {
      player.x = plat.x - player.w;
      player.vx = 0;
    } else if (player.vx < 0 && oldX >= plat.x + plat.w) {
      player.x = plat.x + plat.w;
      player.vx = 0;
    }
  }

  player.y += player.vy * dt;
  player.onGround = false;
  for (const plat of platforms) {
    if (!overlaps(player, plat)) continue;

    if (player.vy > 0 && oldY + player.h <= plat.y) {
      player.y = plat.y - player.h;
      player.vy = 0;
      player.onGround = true;
    } else if (player.vy < 0 && oldY >= plat.y + plat.h) {
      player.y = plat.y + plat.h;
      player.vy = 0;
    }
  }

  if (player.y > VIEW_HEIGHT + 400) {
    player.x = getZoneSpawnX();
    player.y = PLAYER_SPAWN_Y;
    player.vx = 0;
    player.vy = 0;
  }

  updateResourceRespawns(dt);

  sanitizeHotbarSlots();

  if (wantsCraftPickaxe && !player.dead) {
    craftPickaxe();
  }
  wantsCraftPickaxe = false;
  if (wantsCraftAxe && !player.dead) {
    craftAxe();
  }
  wantsCraftAxe = false;

  if (wantsInteract && !inventoryOpen && !player.dead) {
    const activeTool = getActiveTool();
    const usingAxe = activeTool === "axe" && inventory.axe;
    const usingPickaxe = activeTool === "pickaxe" && inventory.pickaxe;
    const target = getInteractionTarget();
    if (target?.type === "tree") {
      const tree = target.entity;
      let thatchGain = 0;
      let woodGain = 0;
      let treeDamage = 1;

      if (usingAxe) {
        // Axe: faster tree harvesting with mostly wood.
        thatchGain = Math.random() < 0.35 ? 1 : 0;
        woodGain = 3 + Math.floor(Math.random() * 3);
        treeDamage = 3;
      } else if (usingPickaxe) {
        // Pickaxe: mostly thatch from trees.
        thatchGain = 3 + Math.floor(Math.random() * 4);
        woodGain = Math.random() < 0.2 ? 1 : 0;
        treeDamage = 2;
      } else {
        thatchGain = 2 + Math.floor(Math.random() * 2);
        woodGain = Math.random() < 0.45 ? 1 : 0;
      }

      inventory.thatch += thatchGain;
      inventory.wood += woodGain;

      tree.health -= treeDamage;
      if (tree.health <= 0) {
        tree.alive = false;
        tree.health = 0;
        tree.respawnTimer = RESOURCE_RESPAWN_SECONDS;
        if (usingAxe) {
          inventory.wood += 4 + Math.floor(Math.random() * 3);
        } else if (usingPickaxe) {
          inventory.thatch += 2 + Math.floor(Math.random() * 3);
          if (Math.random() < 0.3) inventory.wood += 1;
        } else {
          inventory.wood += 2 + Math.floor(Math.random() * 2);
        }
      }
    } else if (target?.type === "stone") {
      const stone = target.entity;
      if (stone.isMetal && !usingPickaxe) {
        setNotice("Metal node needs a pickaxe.");
      } else if (!(usingPickaxe || usingAxe)) {
        setNotice("Equip pickaxe or axe in hotbar to mine stone.");
      } else {
        if (stone.isMetal) {
          let metalGain = 1 + Math.floor(Math.random() * 2);
          let flintGain = Math.random() < 0.45 ? 1 : 0;
          let totalMetal = metalGain;
          let totalFlint = flintGain;
          inventory.metal += metalGain;
          inventory.flint += flintGain;

          stone.health -= 2;
          if (stone.health <= 0) {
            stone.alive = false;
            stone.health = 0;
            stone.respawnTimer = RESOURCE_RESPAWN_SECONDS;
            const bonusMetal = 2 + Math.floor(Math.random() * 2);
            const bonusFlint = Math.random() < 0.65 ? 1 : 0;
            inventory.metal += bonusMetal;
            inventory.flint += bonusFlint;
            totalMetal += bonusMetal;
            totalFlint += bonusFlint;
          }

          const flintText = totalFlint > 0 ? ` +${totalFlint} flint` : "";
          setNotice(`+${totalMetal} metal${flintText}.`, 1.2);
        } else {
          let flintGain = 0;
          let stoneGain = 0;
          if (usingAxe) {
            // Axe: mostly stone from rocks.
            stoneGain = 2 + Math.floor(Math.random() * 3);
            flintGain = Math.random() < 0.3 ? 1 : 0;
          } else {
            // Pickaxe: mostly flint from rocks.
            flintGain = 2 + Math.floor(Math.random() * 3);
            stoneGain = Math.random() < 0.35 ? 1 : 0;
          }

          let totalFlint = flintGain;
          let totalStone = stoneGain;
          inventory.flint += flintGain;
          inventory.stone += stoneGain;

          const stoneDamage = usingAxe ? 3 : 2;
          stone.health -= stoneDamage;
          if (stone.health <= 0) {
            stone.alive = false;
            stone.health = 0;
            stone.respawnTimer = RESOURCE_RESPAWN_SECONDS;
            const bonusFlint = usingAxe ? (Math.random() < 0.35 ? 1 : 0) : 2 + Math.floor(Math.random() * 2);
            const bonusStone = usingAxe ? 2 + Math.floor(Math.random() * 2) : (Math.random() < 0.45 ? 1 : 0);
            inventory.flint += bonusFlint;
            inventory.stone += bonusStone;
            totalFlint += bonusFlint;
            totalStone += bonusStone;
          }

          const stoneText = totalStone > 0 ? ` +${totalStone} stone` : "";
          setNotice(`+${totalFlint} flint${stoneText}.`, 1.2);
        }
      }
    } else if (target?.type === "pebble") {
      const pebble = target.entity;
      if (!pebble.picked) {
        pebble.picked = true;
        pebble.respawnTimer = RESOURCE_RESPAWN_SECONDS;
        inventory.stone += pebble.value;
        setNotice("+1 stone pebble.");
      }
    } else if (target?.type === "dodo") {
      const dodo = target.entity;
      const dodoDamage = (usingPickaxe || usingAxe) ? 10 : 5;
      dodo.health -= dodoDamage;

      const playerCenterX = player.x + player.w / 2;
      const dodoCenterX = dodo.x + dodo.w / 2;
      dodo.dir = dodoCenterX >= playerCenterX ? 1 : -1;
      dodo.fleeTimer = 2.4;

      if (dodo.health <= 0) {
        dodo.alive = false;
        dodo.health = 0;
        dodo.respawnTimer = CREATURE_RESPAWN_SECONDS;
        setNotice("Dodo knocked out.");
      }
    } else if (target?.type === "dilo") {
      const dilo = target.entity;
      const diloDamage = (usingPickaxe || usingAxe) ? 10 : 5;
      dilo.health -= diloDamage;
      if (dilo.health <= 0) {
        dilo.alive = false;
        dilo.health = 0;
        dilo.respawnTimer = CREATURE_RESPAWN_SECONDS;
        setNotice("Dilophosaur knocked out.");
      }
    } else if (target?.type === "raptor") {
      const raptor = target.entity;
      const raptorDamage = (usingPickaxe || usingAxe) ? 10 : 5;
      raptor.health -= raptorDamage;
      if (raptor.health <= 0) {
        raptor.alive = false;
        raptor.health = 0;
        raptor.respawnTimer = CREATURE_RESPAWN_SECONDS;
        setNotice("Raptor down.");
      }
    } else if (target?.type === "thylacoleo") {
      const thylacoleo = target.entity;
      const thylacoleoDamage = (usingPickaxe || usingAxe) ? 10 : 5;
      thylacoleo.health -= thylacoleoDamage;
      if (thylacoleo.health <= 0) {
        thylacoleo.alive = false;
        thylacoleo.health = 0;
        thylacoleo.respawnTimer = CREATURE_RESPAWN_SECONDS;
        setNotice("Thylacoleo down.");
      }
    } else if (target?.type === "trike") {
      const trike = target.entity;
      const trikeDamage = (usingPickaxe || usingAxe) ? 10 : 5;
      trike.health -= trikeDamage;

      const playerCenterX = player.x + player.w / 2;
      const trikeCenterX = trike.x + trike.w / 2;
      trike.dir = playerCenterX >= trikeCenterX ? 1 : -1;
      trike.aggroTimer = Math.max(trike.aggroTimer, 8);

      if (trike.health <= 0) {
        trike.alive = false;
        trike.health = 0;
        trike.respawnTimer = CREATURE_RESPAWN_SECONDS;
        trike.aggroTimer = 0;
        setNotice("Triceratops down.");
      }
    } else if (target?.type === "parasaur") {
      const parasaur = target.entity;
      const parasaurDamage = (usingPickaxe || usingAxe) ? 10 : 5;
      parasaur.health -= parasaurDamage;

      const playerCenterX = player.x + player.w / 2;
      const parasaurCenterX = parasaur.x + parasaur.w / 2;
      parasaur.dir = parasaurCenterX >= playerCenterX ? 1 : -1;
      parasaur.fleeTimer = 3.8;

      if (parasaur.health <= 0) {
        parasaur.alive = false;
        parasaur.health = 0;
        parasaur.respawnTimer = CREATURE_RESPAWN_SECONDS;
        parasaur.fleeTimer = 0;
        setNotice("Parasaur down.");
      }
    }
  }
  wantsInteract = false;

  if (player.regenCooldown > 0) {
    player.regenCooldown = Math.max(0, player.regenCooldown - dt);
  }
  if (!player.dead && player.health < player.maxHealth && player.regenCooldown <= 0) {
    player.health = Math.min(player.maxHealth, player.health + HEALTH_REGEN_PER_SECOND * dt);
  }

  if (noticeTimer > 0) {
    noticeTimer = Math.max(0, noticeTimer - dt);
    if (noticeTimer === 0) {
      noticeText = "";
    }
  }

  if (player.vx > 10) player.facing = 1;
  else if (player.vx < -10) player.facing = -1;

  player.x = Math.max(0, Math.min(WORLD_WIDTH - player.w, player.x));
  updateDinoRespawns(dt);
  updateParasaurs(dt);
  updateDodos(dt);
  updateRaptors(dt);
  updateThylacoleos(dt);
  updateTriceratops(dt);
  updateDilophosaurs(dt);
  if (player.health <= 0) {
    killPlayer();
  }
  cameraX = Math.max(0, Math.min(WORLD_WIDTH - VIEW_WIDTH, player.x - VIEW_WIDTH * 0.35));
  updateMultiplayerNetworking(dt);
}

function drawCloud(x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(-22, 4, 16, 0, Math.PI * 2);
  ctx.arc(0, 0, 20, 0, Math.PI * 2);
  ctx.arc(25, 6, 14, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawPalmTree(screenX, baseY, scale) {
  ctx.save();
  ctx.translate(screenX, baseY);
  ctx.scale(scale, scale);

  ctx.strokeStyle = "#8f6236";
  ctx.lineWidth = 10;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-12, -56, -22, -112);
  ctx.stroke();

  ctx.strokeStyle = "#2a7a49";
  ctx.lineWidth = 6;
  const topX = -22;
  const topY = -112;
  const leafOffsets = [
    [-2, -56],
    [30, -34],
    [44, -10],
    [24, 16],
    [-10, 24],
    [-38, 10],
    [-46, -18]
  ];
  for (const [ox, oy] of leafOffsets) {
    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.quadraticCurveTo(topX + ox * 0.45, topY + oy * 0.45, topX + ox, topY + oy);
    ctx.stroke();
  }

  ctx.restore();
}

function drawBeachBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, VIEW_HEIGHT);
  sky.addColorStop(0, "#7ed6ff");
  sky.addColorStop(0.55, "#bff0ff");
  sky.addColorStop(1, "#e9fbff");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

  const sunX = VIEW_WIDTH - 150 - cameraX * 0.08;
  const sunY = 96;
  const sun = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 56);
  sun.addColorStop(0, "rgba(255, 244, 170, 0.95)");
  sun.addColorStop(1, "rgba(255, 244, 170, 0)");
  ctx.fillStyle = sun;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 56, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffeb96";
  ctx.beginPath();
  ctx.arc(sunX, sunY, 28, 0, Math.PI * 2);
  ctx.fill();

  drawCloud(170 - cameraX * 0.05, 88, 1.1);
  drawCloud(430 - cameraX * 0.04, 128, 0.9);
  drawCloud(760 - cameraX * 0.06, 76, 1.2);

  const waterTop = 295;
  const water = ctx.createLinearGradient(0, waterTop, 0, VIEW_HEIGHT);
  water.addColorStop(0, "#3ec7e9");
  water.addColorStop(1, "#0f86b0");
  ctx.fillStyle = water;
  ctx.fillRect(0, waterTop, VIEW_WIDTH, VIEW_HEIGHT - waterTop);

  ctx.fillStyle = "rgba(240, 252, 255, 0.88)";
  ctx.beginPath();
  ctx.moveTo(0, waterTop);
  for (let x = 0; x <= VIEW_WIDTH; x += 70) {
    const worldX = x + cameraX * 0.25;
    const y = waterTop - 16 - Math.sin(worldX * 0.006) * 10;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(VIEW_WIDTH, waterTop);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(214, 248, 255, 0.75)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    const waveY = waterTop + 24 + i * 28;
    ctx.beginPath();
    for (let x = 0; x <= VIEW_WIDTH; x += 16) {
      const worldX = x + cameraX * 0.42 + i * 38;
      const y = waveY + Math.sin(worldX * 0.02) * 3;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  ctx.fillStyle = "#f2dc98";
  ctx.fillRect(0, 455, VIEW_WIDTH, VIEW_HEIGHT - 455);

  const palmPositions = [140, 470, 870, 1220];
  for (const worldPalmX of palmPositions) {
    const sx = worldPalmX - cameraX * 0.55;
    if (sx > -120 && sx < VIEW_WIDTH + 120) {
      drawPalmTree(sx, 492, 1);
    }
  }

  ctx.fillStyle = "#efd48e";
  ctx.beginPath();
  ctx.moveTo(0, VIEW_HEIGHT - 14);
  for (let x = 0; x <= VIEW_WIDTH; x += 24) {
    const worldX = x + cameraX * 0.4;
    const y = VIEW_HEIGHT - 14 - Math.sin(worldX * 0.02) * 2;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(VIEW_WIDTH, VIEW_HEIGHT);
  ctx.closePath();
  ctx.fill();
}

function drawRedwoodsBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, VIEW_HEIGHT);
  sky.addColorStop(0, "#7b96a8");
  sky.addColorStop(0.45, "#a6c0a5");
  sky.addColorStop(1, "#d8d3b8");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

  const canopyShade = ctx.createLinearGradient(0, 0, 0, 180);
  canopyShade.addColorStop(0, "rgba(35, 68, 49, 0.75)");
  canopyShade.addColorStop(1, "rgba(35, 68, 49, 0)");
  ctx.fillStyle = canopyShade;
  ctx.fillRect(0, 0, VIEW_WIDTH, 200);

  for (let i = 0; i < 18; i++) {
    const canopyWorldX = i * 150 + 40;
    const sx = canopyWorldX - cameraX * 0.22;
    if (sx < -120 || sx > VIEW_WIDTH + 120) continue;
    const canopyY = 90 + Math.sin((canopyWorldX + cameraX) * 0.004) * 8;
    ctx.fillStyle = "#376b42";
    ctx.beginPath();
    ctx.ellipse(sx, canopyY, 90, 28, 0, 0, Math.PI * 2);
    ctx.ellipse(sx + 36, canopyY + 12, 65, 24, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const haze = ctx.createLinearGradient(0, 180, 0, 470);
  haze.addColorStop(0, "rgba(244, 241, 218, 0.08)");
  haze.addColorStop(1, "rgba(244, 241, 218, 0.58)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, 180, VIEW_WIDTH, 290);

  ctx.fillStyle = "#4f7057";
  ctx.beginPath();
  ctx.moveTo(0, 318);
  for (let x = 0; x <= VIEW_WIDTH; x += 32) {
    const worldX = x + cameraX * 0.2;
    const y = 308 - Math.sin(worldX * 0.009) * 22 - Math.cos(worldX * 0.014) * 10;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(VIEW_WIDTH, 432);
  ctx.lineTo(0, 432);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#446148";
  ctx.beginPath();
  ctx.moveTo(0, 352);
  for (let x = 0; x <= VIEW_WIDTH; x += 28) {
    const worldX = x + cameraX * 0.34;
    const y = 344 - Math.sin(worldX * 0.012) * 18 - Math.cos(worldX * 0.02) * 5;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(VIEW_WIDTH, 448);
  ctx.lineTo(0, 448);
  ctx.closePath();
  ctx.fill();

  for (let i = 0; i < 16; i++) {
    const trunkWorldX = i * 180 + 60;
    const sx = trunkWorldX - cameraX * 0.42;
    if (sx < -90 || sx > VIEW_WIDTH + 90) continue;
    const sway = Math.sin((trunkWorldX + cameraX) * 0.002) * 3;
    ctx.fillStyle = "#5a3927";
    ctx.fillRect(sx + sway, 188, 22, 320);
    ctx.fillStyle = "#3d7447";
    ctx.beginPath();
    ctx.ellipse(sx + 11, 205, 46, 24, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 12; i++) {
    const trunkWorldX = i * 240 + 80;
    const sx = trunkWorldX - cameraX * 0.48;
    if (sx < -80 || sx > VIEW_WIDTH + 80) continue;
    ctx.fillStyle = "#66402c";
    ctx.fillRect(sx, 208, 26, 300);
    ctx.fillStyle = "#335f3d";
    ctx.beginPath();
    ctx.ellipse(sx + 13, 220, 42, 22, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const forestFloor = ctx.createLinearGradient(0, 420, 0, VIEW_HEIGHT);
  forestFloor.addColorStop(0, "#785d3f");
  forestFloor.addColorStop(1, "#584632");
  ctx.fillStyle = forestFloor;
  ctx.fillRect(0, 420, VIEW_WIDTH, VIEW_HEIGHT - 420);

  for (let i = 0; i < 32; i++) {
    const bushWorldX = i * 80 + 20;
    const sx = bushWorldX - cameraX * 0.62;
    if (sx < -40 || sx > VIEW_WIDTH + 40) continue;
    const by = 470 + Math.sin((bushWorldX + cameraX) * 0.013) * 3;
    ctx.fillStyle = "#3f7a3e";
    ctx.beginPath();
    ctx.ellipse(sx, by, 16, 8, 0, 0, Math.PI * 2);
    ctx.ellipse(sx + 9, by - 3, 12, 7, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "rgba(224, 197, 145, 0.28)";
  ctx.beginPath();
  ctx.moveTo(0, 470);
  for (let x = 0; x <= VIEW_WIDTH; x += 20) {
    const worldX = x + cameraX * 0.55;
    const y = 470 + Math.sin(worldX * 0.03) * 2 + Math.cos(worldX * 0.017) * 1.5;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(VIEW_WIDTH, VIEW_HEIGHT);
  ctx.lineTo(0, VIEW_HEIGHT);
  ctx.closePath();
  ctx.fill();
}

function drawBackground() {
  if (currentZone === ZONE_REDWOODS) {
    drawRedwoodsBackground();
    return;
  }
  drawBeachBackground();
}

function drawPebbles(interactionTarget) {
  const targetPebble = interactionTarget?.type === "pebble" ? interactionTarget.entity : null;

  for (const pebble of pebbles) {
    if (pebble.picked) continue;

    const sx = Math.round(pebble.x - cameraX);
    if (sx + pebble.w < -20 || sx > VIEW_WIDTH + 20) continue;

    ctx.fillStyle = "#9aa1ad";
    ctx.beginPath();
    ctx.ellipse(sx + pebble.w / 2, pebble.y + pebble.h / 2, pebble.w / 2, pebble.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#d4d8de";
    ctx.fillRect(sx + 2, pebble.y + 2, 3, 1);

    if (pebble === targetPebble && !inventoryOpen) {
      ctx.strokeStyle = "#fff6d1";
      ctx.lineWidth = 2;
      ctx.strokeRect(sx - 4, pebble.y - 5, pebble.w + 8, pebble.h + 10);
    }
  }
}

function drawTrees(interactionTarget) {
  const targetTree = interactionTarget?.type === "tree" ? interactionTarget.entity : null;
  const redwoodsZone = currentZone === ZONE_REDWOODS;
  const trunkMain = redwoodsZone ? "#6f452b" : "#87512a";
  const trunkShade = redwoodsZone ? "#52321f" : "#6b3f22";
  const leafMain = redwoodsZone ? "#4d7a49" : "#2f9f56";
  const leafAccent = redwoodsZone ? "#5e8a57" : "#46b56c";

  for (const tree of trees) {
    const trunkX = Math.round(tree.x - cameraX);
    if (trunkX + tree.trunkW < -80 || trunkX > VIEW_WIDTH + 80) continue;

    if (!tree.alive) {
      const stumpY = tree.baseY - 16;
      ctx.fillStyle = trunkMain;
      ctx.fillRect(trunkX, stumpY, tree.trunkW, 16);
      ctx.fillStyle = "#e9bf86";
      ctx.fillRect(trunkX + 2, stumpY + 3, tree.trunkW - 4, 5);
      continue;
    }

    const trunkTop = tree.baseY - tree.trunkH;
    const crownX = trunkX + tree.trunkW / 2;
    const crownY = trunkTop - 18;

    ctx.fillStyle = trunkMain;
    ctx.fillRect(trunkX, trunkTop, tree.trunkW, tree.trunkH);
    ctx.fillStyle = trunkShade;
    ctx.fillRect(trunkX + tree.trunkW - 5, trunkTop, 5, tree.trunkH);

    ctx.fillStyle = leafMain;
    ctx.beginPath();
    ctx.arc(crownX - 16, crownY + 12, 20, 0, Math.PI * 2);
    ctx.arc(crownX + 15, crownY + 8, 22, 0, Math.PI * 2);
    ctx.arc(crownX, crownY - 7, 24, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = leafAccent;
    ctx.beginPath();
    ctx.arc(crownX - 4, crownY - 10, 11, 0, Math.PI * 2);
    ctx.fill();

    if (tree === targetTree && !inventoryOpen) {
      ctx.strokeStyle = "#fff6d1";
      ctx.lineWidth = 2;
      ctx.strokeRect(trunkX - 6, trunkTop - 8, tree.trunkW + 12, tree.trunkH + 16);
    }

    if (tree.alive && tree.health < tree.maxHealth) {
      const ratio = tree.health / tree.maxHealth;
      ctx.fillStyle = "rgba(10, 20, 28, 0.7)";
      ctx.fillRect(crownX - 20, trunkTop - 18, 40, 6);
      ctx.fillStyle = "#93e878";
      ctx.fillRect(crownX - 20, trunkTop - 18, 40 * ratio, 6);
    }
  }
}

function drawRedwoodProps() {
  if (currentZone !== ZONE_REDWOODS) return;

  for (const tree of redwoodProps) {
    const trunkX = Math.round(tree.x - cameraX);
    if (trunkX + tree.trunkW < -220 || trunkX > VIEW_WIDTH + 220) continue;

    const trunkTop = tree.baseY - tree.trunkH;
    const centerX = trunkX + tree.trunkW / 2;

    ctx.fillStyle = "#6a3f27";
    ctx.fillRect(trunkX, trunkTop, tree.trunkW, tree.trunkH);
    ctx.fillStyle = "#4f2f1d";
    ctx.fillRect(trunkX + tree.trunkW - 8, trunkTop, 8, tree.trunkH);
    ctx.fillStyle = "#815337";
    for (let y = trunkTop + 12; y < tree.baseY - 8; y += 16) {
      ctx.fillRect(trunkX + 6, y, tree.trunkW - 14, 3);
    }

    ctx.fillStyle = "#52311f";
    ctx.fillRect(trunkX - 10, tree.baseY - 8, 14, 8);
    ctx.fillRect(trunkX + tree.trunkW - 4, tree.baseY - 8, 14, 8);

    const canopyBaseY = tree.canopyY;
    ctx.fillStyle = "#335f38";
    ctx.beginPath();
    ctx.ellipse(centerX, canopyBaseY + 8, 98, 44, 0, 0, Math.PI * 2);
    ctx.ellipse(centerX - 58, canopyBaseY + 24, 66, 30, 0, 0, Math.PI * 2);
    ctx.ellipse(centerX + 62, canopyBaseY + 22, 70, 32, 0, 0, Math.PI * 2);
    ctx.ellipse(centerX - 20, canopyBaseY - 14, 56, 28, 0, 0, Math.PI * 2);
    ctx.ellipse(centerX + 28, canopyBaseY - 18, 52, 26, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(92, 146, 84, 0.6)";
    ctx.beginPath();
    ctx.ellipse(centerX - 16, canopyBaseY, 26, 13, 0, 0, Math.PI * 2);
    ctx.ellipse(centerX + 34, canopyBaseY + 6, 22, 11, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawStones(interactionTarget) {
  const targetStone = interactionTarget?.type === "stone" ? interactionTarget.entity : null;

  for (const stone of stones) {
    const sx = Math.round(stone.x - cameraX);
    if (sx + stone.w < -60 || sx > VIEW_WIDTH + 60) continue;

    if (!stone.alive) {
      ctx.fillStyle = stone.isMetal ? "#6e6672" : "#8d8f96";
      ctx.fillRect(sx + 8, stone.y + stone.h - 8, stone.w - 18, 8);
      ctx.fillStyle = stone.isMetal ? "#91839a" : "#a6aab2";
      ctx.fillRect(sx + 13, stone.y + stone.h - 12, stone.w - 28, 5);
      continue;
    }

    ctx.fillStyle = stone.isMetal ? "#777082" : "#9aa1ad";
    ctx.beginPath();
    ctx.ellipse(sx + 18, stone.y + 20, 17, 12, -0.24, 0, Math.PI * 2);
    ctx.ellipse(sx + 30, stone.y + 16, 15, 11, 0.2, 0, Math.PI * 2);
    ctx.ellipse(sx + 35, stone.y + 23, 12, 9, -0.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = stone.isMetal ? "#cdb4d8" : "#c8ced8";
    ctx.fillRect(sx + 13, stone.y + 12, 7, 2);
    ctx.fillRect(sx + 28, stone.y + 18, 6, 2);
    if (stone.isMetal) {
      ctx.fillStyle = "#f3d98f";
      ctx.fillRect(sx + 24, stone.y + 11, 3, 2);
      ctx.fillRect(sx + 33, stone.y + 17, 2, 2);
    }

    if (stone === targetStone && !inventoryOpen) {
      const activeTool = getActiveTool();
      const canMine = stone.isMetal
        ? (activeTool === "pickaxe" && inventory.pickaxe)
        : (
          (activeTool === "pickaxe" && inventory.pickaxe) ||
          (activeTool === "axe" && inventory.axe)
        );
      ctx.strokeStyle = canMine ? "#fff6d1" : "#ffb07f";
      ctx.lineWidth = 2;
      ctx.strokeRect(sx - 5, stone.y - 6, stone.w + 10, stone.h + 12);
    }

    if (stone.health < stone.maxHealth) {
      const ratio = stone.health / stone.maxHealth;
      ctx.fillStyle = "rgba(10, 20, 28, 0.7)";
      ctx.fillRect(sx + 4, stone.y - 14, stone.w - 8, 6);
      ctx.fillStyle = "#8ec4ff";
      ctx.fillRect(sx + 4, stone.y - 14, (stone.w - 8) * ratio, 6);
    }
  }
}

function drawInteractionPrompt(interactionTarget) {
  // Hidden on purpose: only health and selected bars should stay visible.
}

function drawDodos(interactionTarget) {
  if (!zoneHasDinoSpawns()) return;
  const targetDodo = interactionTarget?.type === "dodo" ? interactionTarget.entity : null;

  for (const dodo of dinosaurs) {
    if (!dodo.alive || dodo.type !== "dodo") continue;

    const sx = Math.round(dodo.x - cameraX);
    if (sx + dodo.w < -40 || sx > VIEW_WIDTH + 40) continue;

    const bob = Math.sin(dodo.anim) * 2;
    const y = Math.round(dodo.y + bob);
    const facing = dodo.dir >= 0 ? 1 : -1;

    ctx.fillStyle = dodo.fleeTimer > 0 ? "#c99764" : "#b88b62";
    ctx.beginPath();
    ctx.ellipse(sx + 20, y + 16, 17, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#d9b18b";
    ctx.beginPath();
    ctx.ellipse(sx + 22, y + 18, 9, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    const neckX = sx + (facing > 0 ? 29 : 8);
    ctx.fillStyle = dodo.fleeTimer > 0 ? "#c99764" : "#b88b62";
    ctx.fillRect(neckX, y + 5, 7, 9);
    ctx.beginPath();
    ctx.arc(neckX + (facing > 0 ? 5 : 2), y + 6, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#f8ce6f";
    ctx.beginPath();
    ctx.moveTo(neckX + (facing > 0 ? 8 : -1), y + 8);
    ctx.lineTo(neckX + (facing > 0 ? 14 : -7), y + 10);
    ctx.lineTo(neckX + (facing > 0 ? 8 : -1), y + 12);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#201812";
    ctx.fillRect(neckX + (facing > 0 ? 5 : 1), y + 5, 2, 2);

    const step = Math.sin(dodo.anim * 1.9) * 2;
    ctx.strokeStyle = "#7a5635";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx + 16, y + 26);
    ctx.lineTo(sx + 16 + step, y + 30);
    ctx.moveTo(sx + 24, y + 26);
    ctx.lineTo(sx + 24 - step, y + 30);
    ctx.stroke();

    if (dodo === targetDodo && !inventoryOpen) {
      ctx.strokeStyle = "#fff6d1";
      ctx.lineWidth = 2;
      ctx.strokeRect(sx - 6, y - 7, dodo.w + 12, dodo.h + 14);
    }
  }
}

function drawDilophosaurs(interactionTarget) {
  if (!zoneHasDinoSpawns()) return;
  const targetDilo = interactionTarget?.type === "dilo" ? interactionTarget.entity : null;

  for (const dilo of dinosaurs) {
    if (!dilo.alive || dilo.type !== "dilo") continue;

    const sx = Math.round(dilo.x - cameraX);
    if (sx + dilo.w < -50 || sx > VIEW_WIDTH + 50) continue;

    const bob = Math.sin(dilo.anim) * 1.8;
    const y = Math.round(dilo.y + bob);
    const facing = dilo.dir >= 0 ? 1 : -1;
    const headX = sx + (facing > 0 ? 38 : 14);
    const jawTipX = headX + (facing > 0 ? 11 : -11);

    ctx.fillStyle = "#4f8c4f";
    ctx.beginPath();
    ctx.ellipse(sx + 24, y + 18, 18, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#42733f";
    ctx.fillRect(sx + 17, y + 7, 8, 12);

    ctx.fillStyle = "#5ea65e";
    ctx.beginPath();
    ctx.arc(headX, y + 10, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#f7f0d7";
    ctx.beginPath();
    ctx.moveTo(headX + (facing > 0 ? 7 : -7), y + 11);
    ctx.lineTo(jawTipX, y + 14);
    ctx.lineTo(headX + (facing > 0 ? 7 : -7), y + 16);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#1d1712";
    ctx.fillRect(headX + (facing > 0 ? 2 : -4), y + 8, 2, 2);

    ctx.fillStyle = "#3f6e3c";
    ctx.beginPath();
    ctx.moveTo(sx + (facing > 0 ? 8 : 40), y + 18);
    ctx.lineTo(sx + (facing > 0 ? -8 : 56), y + 14);
    ctx.lineTo(sx + (facing > 0 ? 8 : 40), y + 23);
    ctx.closePath();
    ctx.fill();

    const step = Math.sin(dilo.anim * 2) * 2;
    ctx.strokeStyle = "#2f4f2d";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx + 19, y + 28);
    ctx.lineTo(sx + 19 + step, y + 32);
    ctx.moveTo(sx + 29, y + 28);
    ctx.lineTo(sx + 29 - step, y + 32);
    ctx.stroke();

    if (dilo === targetDilo && !inventoryOpen) {
      ctx.strokeStyle = "#fff6d1";
      ctx.lineWidth = 2;
      ctx.strokeRect(sx - 6, y - 8, dilo.w + 12, dilo.h + 16);
    }
  }
}

function drawRaptors(interactionTarget) {
  if (!zoneHasDinoSpawns()) return;
  const targetRaptor = interactionTarget?.type === "raptor" ? interactionTarget.entity : null;

  for (const raptor of dinosaurs) {
    if (!raptor.alive || raptor.type !== "raptor") continue;

    const sx = Math.round(raptor.x - cameraX);
    if (sx + raptor.w < -60 || sx > VIEW_WIDTH + 60) continue;

    const bob = Math.sin(raptor.anim) * 1.6;
    const y = Math.round(raptor.y + bob);
    const facing = raptor.dir >= 0 ? 1 : -1;
    const headX = sx + (facing > 0 ? 43 : 15);
    const jawTipX = headX + (facing > 0 ? 14 : -14);

    ctx.fillStyle = "#607997";
    ctx.beginPath();
    ctx.ellipse(sx + 28, y + 19, 20, 13, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#4f6783";
    ctx.fillRect(sx + 20, y + 8, 8, 12);

    ctx.fillStyle = "#738cab";
    ctx.beginPath();
    ctx.arc(headX, y + 11, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#e8efe6";
    ctx.beginPath();
    ctx.moveTo(headX + (facing > 0 ? 7 : -7), y + 11);
    ctx.lineTo(jawTipX, y + 14);
    ctx.lineTo(headX + (facing > 0 ? 7 : -7), y + 17);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#1d1712";
    ctx.fillRect(headX + (facing > 0 ? 2 : -4), y + 8, 2, 2);

    ctx.fillStyle = "#43566b";
    ctx.beginPath();
    ctx.moveTo(sx + (facing > 0 ? 10 : 46), y + 18);
    ctx.lineTo(sx + (facing > 0 ? -9 : 64), y + 14);
    ctx.lineTo(sx + (facing > 0 ? 10 : 46), y + 23);
    ctx.closePath();
    ctx.fill();

    const step = Math.sin(raptor.anim * 2.2) * 2;
    ctx.strokeStyle = "#2f4154";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx + 22, y + 30);
    ctx.lineTo(sx + 22 + step, y + 35);
    ctx.moveTo(sx + 32, y + 30);
    ctx.lineTo(sx + 32 - step, y + 35);
    ctx.stroke();

    if (raptor === targetRaptor && !inventoryOpen) {
      ctx.strokeStyle = "#fff6d1";
      ctx.lineWidth = 2;
      ctx.strokeRect(sx - 6, y - 8, raptor.w + 12, raptor.h + 16);
    }
  }
}

function drawThylacoleos(interactionTarget) {
  if (!zoneHasDinoSpawns()) return;
  const targetThylacoleo = interactionTarget?.type === "thylacoleo" ? interactionTarget.entity : null;

  for (const thylacoleo of dinosaurs) {
    if (!thylacoleo.alive || thylacoleo.type !== "thylacoleo") continue;

    const sx = Math.round(thylacoleo.x - cameraX);
    if (sx + thylacoleo.w < -70 || sx > VIEW_WIDTH + 70) continue;

    const bob = Math.sin(thylacoleo.anim) * 1.5;
    const y = Math.round(thylacoleo.y + bob);
    const facing = thylacoleo.dir >= 0 ? 1 : -1;
    const headX = sx + (facing > 0 ? 46 : 16);

    ctx.fillStyle = "#8c673f";
    ctx.beginPath();
    ctx.ellipse(sx + 31, y + 21, 22, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#7b5636";
    ctx.beginPath();
    ctx.moveTo(sx + (facing > 0 ? 10 : 52), y + 20);
    ctx.lineTo(sx + (facing > 0 ? -14 : 76), y + 14);
    ctx.lineTo(sx + (facing > 0 ? 8 : 54), y + 25);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#936f46";
    ctx.beginPath();
    ctx.arc(headX, y + 12, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#f2e5cd";
    ctx.beginPath();
    ctx.moveTo(headX + 5 * facing, y + 14);
    ctx.lineTo(headX + 14 * facing, y + 17);
    ctx.lineTo(headX + 5 * facing, y + 20);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#201b15";
    ctx.fillRect(headX + (facing > 0 ? 2 : -4), y + 9, 2, 2);

    ctx.strokeStyle = "#62472e";
    ctx.lineWidth = 3;
    const step = Math.sin(thylacoleo.anim * 2.25) * 2;
    ctx.beginPath();
    ctx.moveTo(sx + 24, y + 33);
    ctx.lineTo(sx + 24 + step, y + 40);
    ctx.moveTo(sx + 40, y + 33);
    ctx.lineTo(sx + 40 - step, y + 40);
    ctx.stroke();

    if (thylacoleo === targetThylacoleo && !inventoryOpen) {
      ctx.strokeStyle = "#fff6d1";
      ctx.lineWidth = 2;
      ctx.strokeRect(sx - 7, y - 9, thylacoleo.w + 14, thylacoleo.h + 18);
    }
  }
}

function drawParasaurs(interactionTarget) {
  if (!zoneHasDinoSpawns()) return;
  const targetParasaur = interactionTarget?.type === "parasaur" ? interactionTarget.entity : null;

  for (const parasaur of dinosaurs) {
    if (!parasaur.alive || parasaur.type !== "parasaur") continue;

    const sx = Math.round(parasaur.x - cameraX);
    if (sx + parasaur.w < -70 || sx > VIEW_WIDTH + 70) continue;

    const bob = Math.sin(parasaur.anim) * 1.7;
    const y = Math.round(parasaur.y + bob);
    const facing = parasaur.dir >= 0 ? 1 : -1;
    const headX = sx + (facing > 0 ? 52 : 13);

    ctx.fillStyle = parasaur.fleeTimer > 0 ? "#5fbc6f" : "#4ea561";
    ctx.beginPath();
    ctx.ellipse(sx + 34, y + 24, 24, 15, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#418f54";
    ctx.fillRect(sx + (facing > 0 ? 41 : 20), y + 8, 8, 15);

    ctx.fillStyle = parasaur.fleeTimer > 0 ? "#69cb79" : "#58b66a";
    ctx.beginPath();
    ctx.arc(headX, y + 10, 9, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#3b7245";
    ctx.beginPath();
    ctx.moveTo(headX - 2 * facing, y + 2);
    ctx.lineTo(headX + 8 * facing, y - 10);
    ctx.lineTo(headX + 3 * facing, y + 4);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#f0f6da";
    ctx.beginPath();
    ctx.moveTo(headX + 6 * facing, y + 13);
    ctx.lineTo(headX + 15 * facing, y + 16);
    ctx.lineTo(headX + 6 * facing, y + 18);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#2a261f";
    ctx.fillRect(headX + (facing > 0 ? 2 : -4), y + 8, 2, 2);

    ctx.fillStyle = "#3e804d";
    ctx.beginPath();
    ctx.moveTo(sx + (facing > 0 ? 10 : 56), y + 23);
    ctx.lineTo(sx + (facing > 0 ? -10 : 76), y + 18);
    ctx.lineTo(sx + (facing > 0 ? 10 : 56), y + 28);
    ctx.closePath();
    ctx.fill();

    const step = Math.sin(parasaur.anim * 1.9) * 2.2;
    ctx.strokeStyle = "#2f5542";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sx + 25, y + 36);
    ctx.lineTo(sx + 25 + step, y + 43);
    ctx.moveTo(sx + 40, y + 36);
    ctx.lineTo(sx + 40 - step, y + 43);
    ctx.stroke();

    if (parasaur === targetParasaur && !inventoryOpen) {
      ctx.strokeStyle = "#fff6d1";
      ctx.lineWidth = 2;
      ctx.strokeRect(sx - 6, y - 8, parasaur.w + 12, parasaur.h + 15);
    }
  }
}

function drawTriceratops(interactionTarget) {
  if (!zoneHasDinoSpawns()) return;
  const targetTrike = interactionTarget?.type === "trike" ? interactionTarget.entity : null;

  for (const trike of dinosaurs) {
    if (!trike.alive || trike.type !== "trike") continue;

    const sx = Math.round(trike.x - cameraX);
    if (sx + trike.w < -90 || sx > VIEW_WIDTH + 90) continue;

    const bob = Math.sin(trike.anim) * 1.4;
    const y = Math.round(trike.y + bob);
    const facing = trike.dir >= 0 ? 1 : -1;
    const headX = sx + (facing > 0 ? 62 : 16);

    ctx.fillStyle = trike.aggroTimer > 0 ? "#9a6f55" : "#8b6850";
    ctx.beginPath();
    ctx.ellipse(sx + 39, y + 28, 28, 17, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = trike.aggroTimer > 0 ? "#a77c63" : "#996f59";
    ctx.beginPath();
    ctx.arc(headX, y + 22, 11, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#74605a";
    ctx.beginPath();
    ctx.moveTo(headX - 2 * facing, y + 13);
    ctx.lineTo(headX + 16 * facing, y + 8);
    ctx.lineTo(headX + 2 * facing, y + 27);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "#f3e8cf";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(headX + 7 * facing, y + 17);
    ctx.lineTo(headX + 18 * facing, y + 14);
    ctx.moveTo(headX + 8 * facing, y + 24);
    ctx.lineTo(headX + 20 * facing, y + 24);
    ctx.moveTo(headX + 2 * facing, y + 13);
    ctx.lineTo(headX + 8 * facing, y + 4);
    ctx.stroke();

    ctx.fillStyle = "#2f241f";
    ctx.fillRect(headX + (facing > 0 ? 0 : -2), y + 20, 2, 2);

    const step = Math.sin(trike.anim * 1.5) * 1.7;
    ctx.strokeStyle = "#5a4a43";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(sx + 24, y + 42);
    ctx.lineTo(sx + 24 + step, y + 49);
    ctx.moveTo(sx + 38, y + 42);
    ctx.lineTo(sx + 38 - step, y + 49);
    ctx.moveTo(sx + 50, y + 42);
    ctx.lineTo(sx + 50 + step, y + 49);
    ctx.stroke();

    ctx.fillStyle = "#71574d";
    ctx.beginPath();
    ctx.moveTo(sx + (facing > 0 ? 8 : 70), y + 27);
    ctx.lineTo(sx + (facing > 0 ? -8 : 86), y + 24);
    ctx.lineTo(sx + (facing > 0 ? 8 : 70), y + 32);
    ctx.closePath();
    ctx.fill();

    if (trike === targetTrike && !inventoryOpen) {
      ctx.strokeStyle = "#fff6d1";
      ctx.lineWidth = 2;
      ctx.strokeRect(sx - 8, y - 9, trike.w + 16, trike.h + 17);
    }
  }
}

function drawPlatforms() {
  const redwoodsZone = currentZone === ZONE_REDWOODS;
  const groundMain = redwoodsZone ? "#586944" : "#c79a56";
  const groundTop = redwoodsZone ? "#6da057" : "#f5dfa2";
  const groundBottom = redwoodsZone ? "#3f4f31" : "#af8348";
  const pebbleTint = redwoodsZone ? "rgba(88, 114, 70, 0.42)" : "rgba(255, 232, 170, 0.5)";

  for (const plat of platforms) {
    const sx = Math.round(plat.x - cameraX);
    if (sx + plat.w < 0 || sx > VIEW_WIDTH) continue;

    ctx.fillStyle = groundMain;
    ctx.fillRect(sx, plat.y, plat.w, plat.h);
    ctx.fillStyle = groundTop;
    ctx.fillRect(sx, plat.y, plat.w, 14);

    ctx.fillStyle = groundBottom;
    ctx.fillRect(sx, plat.y + plat.h - 10, plat.w, 10);

    const visibleStart = Math.max(0, sx);
    const visibleEnd = Math.min(VIEW_WIDTH, sx + plat.w);

    if (redwoodsZone) {
      // Thick top grass strip so the entire walkable ground looks grassy.
      ctx.fillStyle = "#4f7d3e";
      ctx.fillRect(sx, plat.y, plat.w, 18);

      // Dense blades across the whole floor edge.
      ctx.strokeStyle = "#7eb264";
      ctx.lineWidth = 2;
      for (let x = visibleStart - 6; x < visibleEnd + 6; x += 9) {
        const worldX = x + Math.floor(cameraX);
        const bladeH = 4 + Math.floor(Math.abs(Math.sin(worldX * 0.11)) * 5);
        ctx.beginPath();
        ctx.moveTo(x, plat.y + 4);
        ctx.lineTo(x, plat.y - bladeH);
        ctx.stroke();
      }
    }

    ctx.fillStyle = pebbleTint;
    for (let x = visibleStart; x < visibleEnd; x += 42) {
      const y = plat.y + 22 + ((x + Math.floor(cameraX)) % 3);
      ctx.fillRect(x, y, 6, 2);
    }
  }
}

function drawPlayer() {
  const x = Math.round(player.x - cameraX);
  const y = Math.round(player.y);
  const facing = player.facing >= 0 ? 1 : -1;
  const stride = player.onGround ? Math.sin(lastTime * 0.02) * 2.4 : 0;

  ctx.save();
  ctx.translate(x + player.w / 2, 0);
  ctx.scale(facing, 1);
  if (player.dead) {
    ctx.globalAlpha = 0.55;
  }

  const px = -player.w / 2;

  ctx.fillStyle = "#f2c6a0";
  ctx.beginPath();
  ctx.arc(px + 17, y + 9, 7, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#4b2e22";
  ctx.beginPath();
  ctx.arc(px + 17, y + 7, 7, Math.PI, 0);
  ctx.lineTo(px + 24, y + 9);
  ctx.lineTo(px + 10, y + 9);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#f2c6a0";
  ctx.fillRect(px + 15, y + 14, 4, 3);

  ctx.fillStyle = "#4f86c9";
  ctx.fillRect(px + 10, y + 17, 14, 14);

  ctx.fillStyle = "#2e5a8e";
  ctx.fillRect(px + 10, y + 31, 14, 6);

  ctx.strokeStyle = "#f2c6a0";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(px + 10, y + 19);
  ctx.lineTo(px + 6, y + 26 + stride * 0.35);
  ctx.moveTo(px + 24, y + 19);
  ctx.lineTo(px + 28, y + 26 - stride * 0.35);
  ctx.stroke();

  ctx.strokeStyle = "#364050";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(px + 14, y + 37);
  ctx.lineTo(px + 13 - stride, y + 48);
  ctx.moveTo(px + 20, y + 37);
  ctx.lineTo(px + 21 + stride, y + 48);
  ctx.stroke();

  ctx.strokeStyle = "#1f2430";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(px + 10 - stride, y + 48);
  ctx.lineTo(px + 15 - stride * 0.7, y + 48);
  ctx.moveTo(px + 19 + stride * 0.7, y + 48);
  ctx.lineTo(px + 24 + stride, y + 48);
  ctx.stroke();

  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(px + 19, y + 9, 2, 2);

  ctx.restore();
}

function drawRemotePlayers() {
  if (!isMultiplayerGame || remotePlayers.size === 0) return;

  for (const remote of remotePlayers.values()) {
    if (!remote || remote.zone !== currentZone) continue;

    const w = Number.isFinite(remote.w) ? Math.max(20, Math.min(56, remote.w)) : player.w;
    const h = Number.isFinite(remote.h) ? Math.max(34, Math.min(72, remote.h)) : player.h;
    const x = Math.round(remote.x - cameraX);
    const y = Math.round(remote.y);
    if (x + w < -80 || x > VIEW_WIDTH + 80) continue;

    const facing = remote.facing >= 0 ? 1 : -1;
    const stride = remote.dead ? 0 : Math.sin((remote.x + lastTime * 0.26) * 0.05) * 2.2;
    const scaleX = w / 34;
    const scaleY = h / 50;

    ctx.save();
    ctx.translate(x + w / 2, 0);
    ctx.scale(facing, 1);
    if (remote.dead) {
      ctx.globalAlpha = 0.5;
    }

    const px = -w / 2;
    ctx.save();
    ctx.translate(px, y);
    ctx.scale(scaleX, scaleY);

    ctx.fillStyle = "#f2c6a0";
    ctx.beginPath();
    ctx.arc(17, 9, 7, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#4b2e22";
    ctx.beginPath();
    ctx.arc(17, 7, 7, Math.PI, 0);
    ctx.lineTo(24, 9);
    ctx.lineTo(10, 9);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#f2c6a0";
    ctx.fillRect(15, 14, 4, 3);

    ctx.fillStyle = "#5f9a4d";
    ctx.fillRect(10, 17, 14, 14);

    ctx.fillStyle = "#3d6f36";
    ctx.fillRect(10, 31, 14, 6);

    ctx.strokeStyle = "#f2c6a0";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(10, 19);
    ctx.lineTo(6, 26 + stride * 0.35);
    ctx.moveTo(24, 19);
    ctx.lineTo(28, 26 - stride * 0.35);
    ctx.stroke();

    ctx.strokeStyle = "#364050";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(14, 37);
    ctx.lineTo(13 - stride, 48);
    ctx.moveTo(20, 37);
    ctx.lineTo(21 + stride, 48);
    ctx.stroke();

    ctx.strokeStyle = "#1f2430";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(10 - stride, 48);
    ctx.lineTo(15 - stride * 0.7, 48);
    ctx.moveTo(19 + stride * 0.7, 48);
    ctx.lineTo(24 + stride, 48);
    ctx.stroke();

    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(19, 9, 2, 2);

    ctx.restore();
    ctx.restore();

    const name = typeof remote.name === "string" && remote.name.trim() ? remote.name.trim() : "Survivor";
    ctx.font = "12px Trebuchet MS, Segoe UI, sans-serif";
    const textWidth = Math.max(52, Math.min(170, ctx.measureText(name).width + 14));
    const tagX = Math.round(x + w / 2 - textWidth / 2);
    const tagY = y - 18;
    ctx.fillStyle = "rgba(23, 32, 38, 0.68)";
    ctx.fillRect(tagX, tagY, textWidth, 15);
    ctx.fillStyle = "#edf7ff";
    ctx.textAlign = "center";
    ctx.fillText(name, x + w / 2, tagY + 12);
    ctx.textAlign = "start";
  }
}

function drawToolIcon(tool, x, y, size, muted = false) {
  const strokePrimary = muted ? "rgba(95, 81, 63, 0.55)" : "#5e4224";
  const strokeMetal = muted ? "rgba(132, 142, 155, 0.5)" : "#9ca4b0";
  const fillHands = muted ? "rgba(194, 138, 83, 0.5)" : "#dfb27d";

  if (tool === "hands") {
    ctx.fillStyle = fillHands;
    ctx.beginPath();
    ctx.ellipse(x + size * 0.5, y + size * 0.56, size * 0.2, size * 0.17, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (tool === "pickaxe") {
    ctx.strokeStyle = strokePrimary;
    ctx.lineWidth = Math.max(3, Math.floor(size * 0.075));
    ctx.beginPath();
    ctx.moveTo(x + size * 0.33, y + size * 0.34);
    ctx.lineTo(x + size * 0.62, y + size * 0.76);
    ctx.stroke();

    ctx.strokeStyle = strokeMetal;
    ctx.lineWidth = Math.max(4, Math.floor(size * 0.09));
    ctx.beginPath();
    ctx.moveTo(x + size * 0.28, y + size * 0.36);
    ctx.lineTo(x + size * 0.68, y + size * 0.25);
    ctx.stroke();
    return;
  }

  if (tool === "axe") {
    ctx.strokeStyle = strokePrimary;
    ctx.lineWidth = Math.max(3, Math.floor(size * 0.075));
    ctx.beginPath();
    ctx.moveTo(x + size * 0.34, y + size * 0.27);
    ctx.lineTo(x + size * 0.62, y + size * 0.78);
    ctx.stroke();

    ctx.fillStyle = strokeMetal;
    ctx.beginPath();
    ctx.moveTo(x + size * 0.37, y + size * 0.3);
    ctx.lineTo(x + size * 0.72, y + size * 0.32);
    ctx.lineTo(x + size * 0.58, y + size * 0.46);
    ctx.lineTo(x + size * 0.4, y + size * 0.42);
    ctx.closePath();
    ctx.fill();
  }
}

function drawHud() {
  ctx.fillStyle = "rgba(76, 56, 28, 0.74)";
  ctx.fillRect(14, 14, 206, 32);
  const healthRatio = Math.max(0, Math.min(1, player.health / player.maxHealth));
  ctx.fillStyle = "rgba(255, 248, 226, 0.28)";
  ctx.fillRect(24, 22, 180, 16);
  ctx.fillStyle = "#ff6b5f";
  ctx.fillRect(24, 22, 180 * healthRatio, 16);
  ctx.strokeStyle = "#ffe4b8";
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 22, 180, 16);
  ctx.fillStyle = "#fff4de";
  ctx.font = "12px Trebuchet MS, Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${Math.round(player.health)}/${player.maxHealth}`, 114, 34);
  ctx.textAlign = "start";
}

function drawMusicToggle() {
  const w = 126;
  const h = 30;
  const x = VIEW_WIDTH - w - 14;
  const y = 14;
  inputState.musicToggleRect = { x, y, w, h };

  ctx.fillStyle = musicEnabled ? "rgba(53, 120, 82, 0.82)" : "rgba(122, 66, 66, 0.82)";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#fff4de";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);

  ctx.fillStyle = "#fff4de";
  ctx.font = "13px Trebuchet MS, Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`Music: ${musicEnabled ? "On" : "Off"}`, x + w / 2, y + 20);
  ctx.textAlign = "start";
}

function drawMainMenu() {
  inputState.mainMenu.playButton = null;
  inputState.mainMenu.accountButton = null;
  inputState.mainMenu.multiplayerButton = null;
  inputState.mainMenu.singleplayerButton = null;
  inputState.mainMenu.backButton = null;
  inputState.mainMenu.createWorldButton = null;
  inputState.mainMenu.worldButtons = [];
  if (!googleAuthReady && hasGoogleClientId()) {
    tryInitGoogleAuth();
  }

  ctx.fillStyle = "rgba(7, 16, 24, 0.52)";
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

  const panelW = 640;
  const panelH = 470;
  const panelX = (VIEW_WIDTH - panelW) / 2;
  const panelY = (VIEW_HEIGHT - panelH) / 2;

  ctx.fillStyle = "rgba(246, 235, 206, 0.97)";
  ctx.fillRect(panelX, panelY, panelW, panelH);
  ctx.strokeStyle = "#7e5d36";
  ctx.lineWidth = 3;
  ctx.strokeRect(panelX, panelY, panelW, panelH);

  ctx.fillStyle = "#5a3b1f";
  ctx.font = "44px Trebuchet MS, Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("2D ARK", panelX + panelW / 2, panelY + 68);
  ctx.font = "16px Trebuchet MS, Segoe UI, sans-serif";
  if (mainMenuScreen === MENU_HOME) {
    ctx.fillText("Sign in with Google, then click Play", panelX + panelW / 2, panelY + 98);
  } else if (mainMenuScreen === MENU_MODE) {
    ctx.fillText("Choose your game mode", panelX + panelW / 2, panelY + 98);
  } else {
    ctx.fillText("Single Player Worlds", panelX + panelW / 2, panelY + 98);
  }

  const accountButton = {
    x: panelX + 74,
    y: panelY + 124,
    w: 170,
    h: 46
  };
  inputState.mainMenu.accountButton = accountButton;
  ctx.fillStyle = "rgba(72, 114, 157, 0.95)";
  ctx.fillRect(accountButton.x, accountButton.y, accountButton.w, accountButton.h);
  ctx.strokeStyle = "#fff4de";
  ctx.lineWidth = 3;
  ctx.strokeRect(accountButton.x, accountButton.y, accountButton.w, accountButton.h);
  ctx.fillStyle = "#fff4de";
  ctx.font = "21px Trebuchet MS, Segoe UI, sans-serif";
  ctx.fillText("Google", accountButton.x + accountButton.w / 2, accountButton.y + 30);

  ctx.fillStyle = "#5a3b1f";
  ctx.font = "16px Trebuchet MS, Segoe UI, sans-serif";
  const accountText = signedInUser ? `Signed in: ${signedInUser}` : "Not signed in";
  ctx.fillText(accountText, panelX + panelW / 2, panelY + 188);
  ctx.font = "13px Trebuchet MS, Segoe UI, sans-serif";
  const promptText = signedInUser ? "Google button: sign out" : "Google button: click once to sign in";
  ctx.fillText(promptText, panelX + panelW / 2, panelY + 210);

  let statusY = panelY + 232;
  if (!hasGoogleAuthSupportedOrigin()) {
    ctx.fillStyle = "#6d2f1d";
    ctx.fillText("Run on localhost/https for Google sign-in", panelX + panelW / 2, statusY);
    statusY += 20;
  } else if (!hasGoogleClientId()) {
    ctx.fillStyle = "#6d2f1d";
    ctx.fillText("Set GOOGLE_CLIENT_ID in index.html", panelX + panelW / 2, statusY);
    statusY += 20;
  }
  if (menuStatusText) {
    ctx.fillStyle = "#6d2f1d";
    ctx.fillText(menuStatusText, panelX + panelW / 2, statusY);
    statusY += 20;
  }

  if (mainMenuScreen === MENU_HOME) {
    const playButton = {
      x: panelX + panelW / 2 - 118,
      y: panelY + 274,
      w: 236,
      h: 64
    };
    inputState.mainMenu.playButton = playButton;
    ctx.fillStyle = "rgba(58, 133, 86, 0.95)";
    ctx.fillRect(playButton.x, playButton.y, playButton.w, playButton.h);
    ctx.strokeStyle = "#fff4de";
    ctx.lineWidth = 3;
    ctx.strokeRect(playButton.x, playButton.y, playButton.w, playButton.h);
    ctx.fillStyle = "#fff4de";
    ctx.font = "32px Trebuchet MS, Segoe UI, sans-serif";
    ctx.fillText("Play", playButton.x + playButton.w / 2, playButton.y + 42);
  } else if (mainMenuScreen === MENU_MODE) {
    const singleButton = {
      x: panelX + panelW / 2 - 180,
      y: panelY + 262,
      w: 360,
      h: 58
    };
    const multiButton = {
      x: panelX + panelW / 2 - 180,
      y: panelY + 332,
      w: 360,
      h: 58
    };
    const backButton = {
      x: panelX + panelW - 74 - 120,
      y: panelY + 124,
      w: 120,
      h: 46
    };
    inputState.mainMenu.singleplayerButton = singleButton;
    inputState.mainMenu.multiplayerButton = multiButton;
    inputState.mainMenu.backButton = backButton;

    ctx.fillStyle = "rgba(58, 133, 86, 0.95)";
    ctx.fillRect(singleButton.x, singleButton.y, singleButton.w, singleButton.h);
    ctx.strokeStyle = "#fff4de";
    ctx.lineWidth = 3;
    ctx.strokeRect(singleButton.x, singleButton.y, singleButton.w, singleButton.h);
    ctx.fillStyle = "#fff4de";
    ctx.font = "28px Trebuchet MS, Segoe UI, sans-serif";
    ctx.fillText("Single Player", singleButton.x + singleButton.w / 2, singleButton.y + 38);

    ctx.fillStyle = "rgba(96, 92, 140, 0.95)";
    ctx.fillRect(multiButton.x, multiButton.y, multiButton.w, multiButton.h);
    ctx.strokeStyle = "#fff4de";
    ctx.lineWidth = 3;
    ctx.strokeRect(multiButton.x, multiButton.y, multiButton.w, multiButton.h);
    ctx.fillStyle = "#fff4de";
    ctx.font = "28px Trebuchet MS, Segoe UI, sans-serif";
    ctx.fillText("Multiplayer", multiButton.x + multiButton.w / 2, multiButton.y + 38);

    ctx.fillStyle = "rgba(118, 86, 59, 0.92)";
    ctx.fillRect(backButton.x, backButton.y, backButton.w, backButton.h);
    ctx.strokeStyle = "#fff4de";
    ctx.lineWidth = 2;
    ctx.strokeRect(backButton.x, backButton.y, backButton.w, backButton.h);
    ctx.fillStyle = "#fff4de";
    ctx.font = "22px Trebuchet MS, Segoe UI, sans-serif";
    ctx.fillText("Back", backButton.x + backButton.w / 2, backButton.y + 31);
  } else if (mainMenuScreen === MENU_SINGLEPLAYER) {
    const createButton = {
      x: panelX + 70,
      y: panelY + 250,
      w: 500,
      h: 48
    };
    const backButton = {
      x: panelX + panelW - 74 - 120,
      y: panelY + 124,
      w: 120,
      h: 46
    };
    inputState.mainMenu.createWorldButton = createButton;
    inputState.mainMenu.backButton = backButton;

    ctx.fillStyle = "rgba(58, 133, 86, 0.95)";
    ctx.fillRect(createButton.x, createButton.y, createButton.w, createButton.h);
    ctx.strokeStyle = "#fff4de";
    ctx.lineWidth = 3;
    ctx.strokeRect(createButton.x, createButton.y, createButton.w, createButton.h);
    ctx.fillStyle = "#fff4de";
    ctx.font = "25px Trebuchet MS, Segoe UI, sans-serif";
    ctx.fillText("Create New World", createButton.x + createButton.w / 2, createButton.y + 33);

    ctx.fillStyle = "#5a3b1f";
    ctx.font = "18px Trebuchet MS, Segoe UI, sans-serif";
    ctx.fillText("World Saves", panelX + panelW / 2, panelY + 320);

    const visibleWorlds = worldSaves.slice(0, MAX_WORLD_LIST_BUTTONS);
    if (visibleWorlds.length === 0) {
      ctx.fillStyle = "#5a3b1f";
      ctx.font = "14px Trebuchet MS, Segoe UI, sans-serif";
      ctx.fillText("No worlds yet. Click Create New World.", panelX + panelW / 2, panelY + 348);
    }

    const rowH = 32;
    for (let i = 0; i < visibleWorlds.length; i++) {
      const world = visibleWorlds[i];
      const row = {
        x: panelX + 70,
        y: panelY + 326 + i * (rowH + 6),
        w: 500,
        h: rowH,
        worldId: world.id
      };
      inputState.mainMenu.worldButtons.push(row);
      const selected = world.id === selectedWorldId;
      ctx.fillStyle = selected ? "rgba(255, 226, 156, 0.92)" : "rgba(104, 82, 52, 0.78)";
      ctx.fillRect(row.x, row.y, row.w, row.h);
      ctx.strokeStyle = selected ? "#fff8d8" : "#e0c58f";
      ctx.lineWidth = selected ? 3 : 2;
      ctx.strokeRect(row.x, row.y, row.w, row.h);

      const updatedText = world.updatedAt ? new Date(world.updatedAt).toLocaleDateString() : "Never";
      ctx.fillStyle = selected ? "#5a3b1f" : "#fff4de";
      ctx.font = "15px Trebuchet MS, Segoe UI, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(world.name, row.x + 10, row.y + 22);
      ctx.textAlign = "right";
      ctx.font = "11px Trebuchet MS, Segoe UI, sans-serif";
      ctx.fillText(`Saved: ${updatedText}`, row.x + row.w - 10, row.y + 21);
      ctx.textAlign = "center";
    }

    ctx.fillStyle = "rgba(118, 86, 59, 0.92)";
    ctx.fillRect(backButton.x, backButton.y, backButton.w, backButton.h);
    ctx.strokeStyle = "#fff4de";
    ctx.lineWidth = 2;
    ctx.strokeRect(backButton.x, backButton.y, backButton.w, backButton.h);
    ctx.fillStyle = "#fff4de";
    ctx.font = "22px Trebuchet MS, Segoe UI, sans-serif";
    ctx.fillText("Back", backButton.x + backButton.w / 2, backButton.y + 31);
  }

  ctx.textAlign = "start";
}

function drawPauseMenu() {
  const ui = inputState.pauseMenu;
  ui.panel = null;
  ui.returnButton = null;
  if (!pauseMenuOpen) return;

  const panelW = 420;
  const panelH = 220;
  const panelX = (VIEW_WIDTH - panelW) / 2;
  const panelY = (VIEW_HEIGHT - panelH) / 2;
  ui.panel = { x: panelX, y: panelY, w: panelW, h: panelH };

  ctx.fillStyle = "rgba(6, 13, 19, 0.58)";
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

  ctx.fillStyle = "rgba(246, 235, 206, 0.97)";
  ctx.fillRect(panelX, panelY, panelW, panelH);
  ctx.strokeStyle = "#7e5d36";
  ctx.lineWidth = 3;
  ctx.strokeRect(panelX, panelY, panelW, panelH);

  ctx.fillStyle = "#5a3b1f";
  ctx.font = "38px Trebuchet MS, Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Paused", panelX + panelW / 2, panelY + 66);
  ctx.font = "14px Trebuchet MS, Segoe UI, sans-serif";
  ctx.fillText("Press Esc to continue", panelX + panelW / 2, panelY + 90);

  const returnButton = {
    x: panelX + 62,
    y: panelY + 122,
    w: panelW - 124,
    h: 58
  };
  ui.returnButton = returnButton;
  ctx.fillStyle = "rgba(97, 69, 44, 0.94)";
  ctx.fillRect(returnButton.x, returnButton.y, returnButton.w, returnButton.h);
  ctx.strokeStyle = "#fff4de";
  ctx.lineWidth = 3;
  ctx.strokeRect(returnButton.x, returnButton.y, returnButton.w, returnButton.h);

  ctx.fillStyle = "#fff4de";
  ctx.font = "24px Trebuchet MS, Segoe UI, sans-serif";
  ctx.fillText("Return To Title Screen", returnButton.x + returnButton.w / 2, returnButton.y + 37);
  ctx.textAlign = "start";
}

function drawRespawnMenu() {
  const ui = inputState.respawnMenu;
  ui.panel = null;
  ui.beachButton = null;
  ui.redwoodsButton = null;
  if (!respawnMenuOpen || !player.dead) return;

  const panelW = 520;
  const panelH = 250;
  const panelX = (VIEW_WIDTH - panelW) / 2;
  const panelY = (VIEW_HEIGHT - panelH) / 2;
  ui.panel = { x: panelX, y: panelY, w: panelW, h: panelH };

  ctx.fillStyle = "rgba(6, 13, 19, 0.62)";
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

  ctx.fillStyle = "rgba(246, 235, 206, 0.97)";
  ctx.fillRect(panelX, panelY, panelW, panelH);
  ctx.strokeStyle = "#7e5d36";
  ctx.lineWidth = 3;
  ctx.strokeRect(panelX, panelY, panelW, panelH);

  ctx.fillStyle = "#5a3b1f";
  ctx.font = "38px Trebuchet MS, Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("You Died", panelX + panelW / 2, panelY + 58);
  ctx.font = "16px Trebuchet MS, Segoe UI, sans-serif";
  ctx.fillText("Choose where to respawn", panelX + panelW / 2, panelY + 86);

  const beachButton = {
    x: panelX + 36,
    y: panelY + 122,
    w: 210,
    h: 82
  };
  const redwoodsButton = {
    x: panelX + panelW - 36 - 210,
    y: panelY + 122,
    w: 210,
    h: 82
  };
  ui.beachButton = beachButton;
  ui.redwoodsButton = redwoodsButton;

  function drawRespawnButton(rect, title, sub, fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = "#fff4de";
    ctx.lineWidth = 3;
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    ctx.fillStyle = "#fff4de";
    ctx.font = "25px Trebuchet MS, Segoe UI, sans-serif";
    ctx.fillText(title, rect.x + rect.w / 2, rect.y + 35);
    ctx.font = "13px Trebuchet MS, Segoe UI, sans-serif";
    ctx.fillText(sub, rect.x + rect.w / 2, rect.y + 58);
  }

  drawRespawnButton(beachButton, "Beach", "Hotkey: 1", "rgba(56, 117, 153, 0.95)");
  drawRespawnButton(redwoodsButton, "Redwoods", "Hotkey: 2", "rgba(76, 120, 84, 0.95)");
  ctx.textAlign = "start";
}

function drawMapOverlay() {
  const ui = inputState.mapUi;
  ui.panel = null;
  ui.beachButton = null;
  ui.redwoodsButton = null;
  ui.closeButton = null;

  if (!mapOpen) return;

  const panelW = 620;
  const panelH = 360;
  const panelX = (VIEW_WIDTH - panelW) / 2;
  const panelY = (VIEW_HEIGHT - panelH) / 2;
  ui.panel = { x: panelX, y: panelY, w: panelW, h: panelH };

  ctx.fillStyle = "rgba(7, 18, 26, 0.58)";
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

  ctx.fillStyle = "rgba(248, 238, 214, 0.97)";
  ctx.fillRect(panelX, panelY, panelW, panelH);
  ctx.strokeStyle = "#7e5d36";
  ctx.lineWidth = 3;
  ctx.strokeRect(panelX, panelY, panelW, panelH);

  ctx.fillStyle = "#5a3b1f";
  ctx.font = "24px Trebuchet MS, Segoe UI, sans-serif";
  ctx.fillText("Fast Travel Map", panelX + 22, panelY + 36);
  ctx.font = "13px Trebuchet MS, Segoe UI, sans-serif";
  ctx.fillText("Press M to close", panelX + panelW - 118, panelY + 36);

  const mapX = panelX + 28;
  const mapY = panelY + 56;
  const mapW = panelW - 56;
  const mapH = panelH - 86;
  const mapBg = ctx.createLinearGradient(0, mapY, 0, mapY + mapH);
  mapBg.addColorStop(0, "#84c7d3");
  mapBg.addColorStop(0.6, "#99c39a");
  mapBg.addColorStop(1, "#d7c28f");
  ctx.fillStyle = mapBg;
  ctx.fillRect(mapX, mapY, mapW, mapH);
  ctx.strokeStyle = "#44646b";
  ctx.lineWidth = 2;
  ctx.strokeRect(mapX, mapY, mapW, mapH);

  ctx.fillStyle = "rgba(39, 101, 117, 0.58)";
  ctx.beginPath();
  ctx.moveTo(mapX + mapW * 0.12, mapY + mapH * 0.78);
  ctx.quadraticCurveTo(mapX + mapW * 0.22, mapY + mapH * 0.7, mapX + mapW * 0.38, mapY + mapH * 0.75);
  ctx.quadraticCurveTo(mapX + mapW * 0.55, mapY + mapH * 0.82, mapX + mapW * 0.68, mapY + mapH * 0.77);
  ctx.quadraticCurveTo(mapX + mapW * 0.82, mapY + mapH * 0.73, mapX + mapW * 0.9, mapY + mapH * 0.81);
  ctx.lineTo(mapX + mapW * 0.9, mapY + mapH);
  ctx.lineTo(mapX + mapW * 0.12, mapY + mapH);
  ctx.closePath();
  ctx.fill();

  const redwoodsButton = {
    x: mapX + mapW / 2 - 95,
    y: mapY + mapH * 0.45 - 17,
    w: 190,
    h: 34
  };
  const beachButton = {
    x: mapX + mapW / 2 - 95,
    y: mapY + mapH - 54,
    w: 190,
    h: 34
  };
  ui.redwoodsButton = redwoodsButton;
  ui.beachButton = beachButton;

  const redwoodsX = redwoodsButton.x + redwoodsButton.w / 2;
  const redwoodsY = redwoodsButton.y + redwoodsButton.h / 2;
  const beachX = beachButton.x + beachButton.w / 2;
  const beachY = beachButton.y + beachButton.h / 2;
  ctx.strokeStyle = "rgba(48, 70, 63, 0.6)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(redwoodsX, redwoodsY + 18);
  ctx.lineTo(beachX, beachY - 18);
  ctx.stroke();

  function drawTravelButton(rect, label, subLabel, active, fill) {
    ctx.fillStyle = active ? "#ffe3a6" : fill;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = active ? "#fff6de" : "#fff0d2";
    ctx.lineWidth = active ? 3 : 2;
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

    ctx.fillStyle = active ? "#6c4a24" : "#fff8ea";
    ctx.font = "14px Trebuchet MS, Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, rect.x + rect.w / 2, rect.y + 15);
    ctx.font = "11px Trebuchet MS, Segoe UI, sans-serif";
    ctx.fillText(subLabel, rect.x + rect.w / 2, rect.y + 28);
    ctx.textAlign = "start";
  }

  drawTravelButton(
    redwoodsButton,
    "Redwoods",
    "47.5% P 47.5% R 5% Thyla",
    currentZone === ZONE_REDWOODS,
    "rgba(76, 120, 84, 0.9)"
  );
  drawTravelButton(
    beachButton,
    "Beach",
    "Default Zone",
    currentZone === ZONE_BEACH,
    "rgba(56, 117, 153, 0.9)"
  );

  ui.closeButton = { x: panelX + panelW - 36, y: panelY + 12, w: 22, h: 22 };
  ctx.fillStyle = "rgba(128, 69, 64, 0.9)";
  ctx.fillRect(ui.closeButton.x, ui.closeButton.y, ui.closeButton.w, ui.closeButton.h);
  ctx.strokeStyle = "#fff6df";
  ctx.lineWidth = 2;
  ctx.strokeRect(ui.closeButton.x, ui.closeButton.y, ui.closeButton.w, ui.closeButton.h);
  ctx.fillStyle = "#fff6df";
  ctx.font = "15px Trebuchet MS, Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("X", ui.closeButton.x + ui.closeButton.w / 2, ui.closeButton.y + 16);
  ctx.textAlign = "start";
}

function drawInventory() {
  if (!inventoryOpen) return;

  if (!isToolOwned(selectedInventoryTool)) {
    selectedInventoryTool = "hands";
  }

  const ui = inputState.inventoryUi;
  ui.toolButtons = {};
  ui.assignButtons = [];
  ui.clearSelectedButton = null;
  ui.craftPickaxeButton = null;
  ui.craftAxeButton = null;

  const panelW = 760;
  const panelH = 390;
  const panelX = (VIEW_WIDTH - panelW) / 2;
  const panelY = (VIEW_HEIGHT - panelH) / 2;

  ctx.fillStyle = "rgba(9, 102, 130, 0.35)";
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

  ctx.fillStyle = "rgba(247, 232, 196, 0.96)";
  ctx.fillRect(panelX, panelY, panelW, panelH);
  ctx.strokeStyle = "#9d6e3d";
  ctx.lineWidth = 3;
  ctx.strokeRect(panelX, panelY, panelW, panelH);

  const bagX = panelX + 18;
  const bagY = panelY + 54;
  const bagW = 322;
  const bagH = 260;
  const craftX = panelX + 358;
  const craftY = panelY + 54;
  const craftW = 384;
  const craftH = 260;
  const manageX = panelX + 18;
  const manageY = panelY + 324;
  const manageW = 724;
  const manageH = 50;

  ctx.fillStyle = "#5a3b1f";
  ctx.font = "22px Trebuchet MS, Segoe UI, sans-serif";
  ctx.fillText("Inventory", panelX + 20, panelY + 34);
  ctx.font = "14px Trebuchet MS, Segoe UI, sans-serif";
  ctx.fillText("Press E to close", panelX + panelW - 110, panelY + 34);

  ctx.fillStyle = "rgba(255, 243, 214, 0.55)";
  ctx.fillRect(bagX, bagY, bagW, bagH);
  ctx.fillRect(craftX, craftY, craftW, craftH);
  ctx.fillRect(manageX, manageY, manageW, manageH);
  ctx.strokeStyle = "#b78a52";
  ctx.lineWidth = 2;
  ctx.strokeRect(bagX, bagY, bagW, bagH);
  ctx.strokeRect(craftX, craftY, craftW, craftH);
  ctx.strokeRect(manageX, manageY, manageW, manageH);

  ctx.fillStyle = "#5a3b1f";
  ctx.font = "18px Trebuchet MS, Segoe UI, sans-serif";
  ctx.fillText("Backpack", bagX + 12, bagY + 24);
  ctx.fillText("Crafting", craftX + 12, craftY + 24);
  ctx.fillText("Hotbar Manager", manageX + 12, manageY + 24);

  const resources = [
    { label: "Thatch", value: inventory.thatch, color: "#d5bf82" },
    { label: "Wood", value: inventory.wood, color: "#9a6938" },
    { label: "Stone", value: inventory.stone, color: "#9aa1ad" },
    { label: "Flint", value: inventory.flint, color: "#cdd2da" },
    { label: "Metal", value: inventory.metal, color: "#d8c07f" }
  ];
  ctx.font = "14px Trebuchet MS, Segoe UI, sans-serif";
  for (let i = 0; i < resources.length; i++) {
    const item = resources[i];
    const rowY = bagY + 52 + i * 23;
    ctx.fillStyle = item.color;
    ctx.fillRect(bagX + 14, rowY - 11, 12, 12);
    ctx.fillStyle = "#5a3b1f";
    ctx.fillText(`${item.label}: ${item.value}`, bagX + 34, rowY);
  }

  const toolDefs = [
    { id: "hands", label: "Hands", owned: true },
    { id: "pickaxe", label: "Stone Pickaxe", owned: inventory.pickaxe },
    { id: "axe", label: "Stone Axe", owned: inventory.axe }
  ];
  const toolBtnW = 92;
  const toolBtnH = 84;
  const toolGap = 10;
  const toolStartX = bagX + 10;
  const toolY = bagY + 152;

  for (let i = 0; i < toolDefs.length; i++) {
    const tool = toolDefs[i];
    const x = toolStartX + i * (toolBtnW + toolGap);
    const rect = { x, y: toolY, w: toolBtnW, h: toolBtnH };
    ui.toolButtons[tool.id] = rect;
    const selected = selectedInventoryTool === tool.id;
    const muted = !tool.owned;

    ctx.fillStyle = selected ? "rgba(255, 236, 173, 0.95)" : "rgba(255, 233, 191, 0.8)";
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = selected ? "#ffe4b8" : "#b78a52";
    ctx.lineWidth = selected ? 3 : 2;
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    drawToolIcon(tool.id, rect.x + 22, rect.y + 14, 46, muted);
    ctx.fillStyle = muted ? "#8c7b63" : "#5a3b1f";
    ctx.font = "12px Trebuchet MS, Segoe UI, sans-serif";
    ctx.fillText(tool.label, rect.x + 8, rect.y + 68);
    if (!tool.owned) {
      ctx.fillStyle = "#a84c3d";
      ctx.fillText("Not Crafted", rect.x + 8, rect.y + 81);
    }
  }

  const selectedLabel = getToolLabel(selectedInventoryTool);
  ctx.fillStyle = "#5a3b1f";
  ctx.font = "13px Trebuchet MS, Segoe UI, sans-serif";
  ctx.fillText(`Selected Tool: ${selectedLabel}`, bagX + 14, bagY + bagH - 14);

  const recipeCardW = 176;
  const recipeCardH = 208;
  const recipeGap = 14;
  const recipeStartX = craftX + 12;
  const recipeY = craftY + 36;
  const recipeCards = [
    {
      id: "pickaxe",
      x: recipeStartX,
      y: recipeY,
      w: recipeCardW,
      h: recipeCardH,
      title: "Stone Pickaxe",
      owned: inventory.pickaxe,
      canCraft: canCraftPickaxe(),
      requirements: [
        { label: "Stone", have: inventory.stone, need: 3 },
        { label: "Thatch", have: inventory.thatch, need: 10 },
        { label: "Wood", have: inventory.wood, need: 2 }
      ]
    },
    {
      id: "axe",
      x: recipeStartX + recipeCardW + recipeGap,
      y: recipeY,
      w: recipeCardW,
      h: recipeCardH,
      title: "Stone Axe",
      owned: inventory.axe,
      canCraft: canCraftAxe(),
      requirements: [
        { label: "Flint", have: inventory.flint, need: 3 },
        { label: "Stone", have: inventory.stone, need: 2 },
        { label: "Thatch", have: inventory.thatch, need: 10 },
        { label: "Wood", have: inventory.wood, need: 1 }
      ]
    }
  ];

  for (const card of recipeCards) {
    const selected = craftSelection === card.id;
    ctx.fillStyle = selected ? "rgba(255, 236, 173, 0.95)" : "rgba(255, 233, 191, 0.78)";
    ctx.fillRect(card.x, card.y, card.w, card.h);
    ctx.strokeStyle = selected ? "#ffe4b8" : "#b78a52";
    ctx.lineWidth = selected ? 3 : 2;
    ctx.strokeRect(card.x, card.y, card.w, card.h);

    ctx.fillStyle = "#5a3b1f";
    ctx.font = "16px Trebuchet MS, Segoe UI, sans-serif";
    ctx.fillText(card.title, card.x + 10, card.y + 22);
    ctx.font = "12px Trebuchet MS, Segoe UI, sans-serif";
    for (let i = 0; i < card.requirements.length; i++) {
      const req = card.requirements[i];
      const enough = req.have >= req.need;
      ctx.fillStyle = enough ? "#2e7a44" : "#a84c3d";
      ctx.fillText(`${req.label}: ${req.have}/${req.need}`, card.x + 10, card.y + 44 + i * 18);
    }

    const button = { x: card.x + 10, y: card.y + card.h - 36, w: card.w - 20, h: 26 };
    if (card.id === "pickaxe") ui.craftPickaxeButton = button;
    if (card.id === "axe") ui.craftAxeButton = button;
    ctx.fillStyle = card.owned ? "#8f9ba8" : (card.canCraft ? "#3c8d57" : "#8b6d47");
    ctx.fillRect(button.x, button.y, button.w, button.h);
    ctx.strokeStyle = "#fff4de";
    ctx.lineWidth = 2;
    ctx.strokeRect(button.x, button.y, button.w, button.h);
    ctx.fillStyle = "#fff4de";
    ctx.font = "13px Trebuchet MS, Segoe UI, sans-serif";
    const buttonText = card.owned ? "Crafted" : (selected ? "Craft [C]" : "Select + Craft");
    ctx.fillText(buttonText, button.x + 42, button.y + 17);

    drawToolIcon(card.id, card.x + card.w - 44, card.y + card.h - 86, 32, !card.owned);
  }

  const slotSize = 52;
  const slotGap = 12;
  const slotStartX = manageX + 246;
  const slotY = manageY - 2;
  for (let i = 0; i < hotbar.slots.length; i++) {
    const x = slotStartX + i * (slotSize + slotGap);
    const rect = { x, y: slotY + 4, w: slotSize, h: slotSize, slotIndex: i };
    ui.assignButtons.push(rect);
    const selected = i === hotbar.selected;
    ctx.fillStyle = selected ? "rgba(255, 226, 156, 0.94)" : "rgba(70, 52, 29, 0.78)";
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = selected ? "#fff8d8" : "#d0b07a";
    ctx.lineWidth = selected ? 3 : 2;
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    drawToolIcon(hotbar.slots[i], rect.x + 10, rect.y + 9, 34, !isToolOwned(hotbar.slots[i]));
    ctx.fillStyle = selected ? "#5a3b1f" : "#fff4de";
    ctx.font = "11px Trebuchet MS, Segoe UI, sans-serif";
    ctx.fillText(String(i + 1), rect.x + 4, rect.y + 12);
  }

  ctx.fillStyle = "#5a3b1f";
  ctx.font = "13px Trebuchet MS, Segoe UI, sans-serif";
  ctx.fillText("Click a tool, then click a hotbar slot to assign it.", manageX + 14, manageY + 42);

  ui.clearSelectedButton = { x: manageX + manageW - 140, y: manageY + 14, w: 122, h: 26 };
  ctx.fillStyle = "rgba(138, 79, 58, 0.95)";
  ctx.fillRect(ui.clearSelectedButton.x, ui.clearSelectedButton.y, ui.clearSelectedButton.w, ui.clearSelectedButton.h);
  ctx.strokeStyle = "#fff4de";
  ctx.lineWidth = 2;
  ctx.strokeRect(ui.clearSelectedButton.x, ui.clearSelectedButton.y, ui.clearSelectedButton.w, ui.clearSelectedButton.h);
  ctx.fillStyle = "#fff4de";
  ctx.font = "13px Trebuchet MS, Segoe UI, sans-serif";
  ctx.fillText("Clear Selected", ui.clearSelectedButton.x + 16, ui.clearSelectedButton.y + 17);
}

function drawHotbar() {
  inputState.hotbarSlotRects = [];

  const slotSize = 56;
  const slotGap = 10;
  const slotCount = hotbar.slots.length;
  const totalW = slotCount * slotSize + (slotCount - 1) * slotGap;
  const startX = (VIEW_WIDTH - totalW) / 2;
  const y = VIEW_HEIGHT - 66;

  for (let i = 0; i < slotCount; i++) {
    const x = startX + i * (slotSize + slotGap);
    const selected = i === hotbar.selected;
    const slotType = hotbar.slots[i];
    const slotRect = { x, y, w: slotSize, h: slotSize, slotIndex: i };
    inputState.hotbarSlotRects.push(slotRect);

    ctx.fillStyle = selected ? "rgba(255, 226, 156, 0.92)" : "rgba(70, 52, 29, 0.78)";
    ctx.fillRect(x, y, slotSize, slotSize);
    ctx.strokeStyle = selected ? "#fff8d8" : "#d0b07a";
    ctx.lineWidth = selected ? 3 : 2;
    ctx.strokeRect(x, y, slotSize, slotSize);

    ctx.fillStyle = selected ? "#5a3b1f" : "#fff4de";
    ctx.font = "11px Trebuchet MS, Segoe UI, sans-serif";
    ctx.fillText(String(i + 1), x + 5, y + 13);
    drawToolIcon(slotType, x + 10, y + 10, 36, !isToolOwned(slotType));
  }

  const selectedType = hotbar.slots[hotbar.selected];
  const selectedName = isToolOwned(selectedType) ? getToolLabel(selectedType) : "Empty Slot";
  ctx.fillStyle = "rgba(36, 53, 61, 0.72)";
  ctx.fillRect((VIEW_WIDTH - 220) / 2, y - 26, 220, 20);
  ctx.fillStyle = "#f7fbff";
  ctx.font = "13px Trebuchet MS, Segoe UI, sans-serif";
  ctx.fillText(`Selected: ${selectedName}`, (VIEW_WIDTH - 220) / 2 + 12, y - 12);
}

function drawNotice() {
  // Hidden on purpose: only health and selected bars should stay visible.
}

function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, 1 / 30);
  lastTime = now;

  if (!gameStarted) {
    if (wasInActiveGame) {
      if (!isMultiplayerGame && activeWorldId) {
        saveCurrentWorld(true);
      }
      wasInActiveGame = false;
    }
    drawBackground();
    drawMainMenu();
    requestAnimationFrame(frame);
    return;
  }

  wasInActiveGame = true;
  if (!pauseMenuOpen) {
    update(dt);
  }
  const interactionTarget = (pauseMenuOpen || inventoryOpen) ? null : getInteractionTarget();
  drawBackground();
  drawPlatforms();
  drawPebbles(interactionTarget);
  drawTrees(interactionTarget);
  drawRedwoodProps();
  drawStones(interactionTarget);
  drawParasaurs(interactionTarget);
  drawTriceratops(interactionTarget);
  drawDodos(interactionTarget);
  drawDilophosaurs(interactionTarget);
  drawRaptors(interactionTarget);
  drawThylacoleos(interactionTarget);
  drawRemotePlayers();
  drawPlayer();
  drawInteractionPrompt(interactionTarget);
  drawHud();
  drawHotbar();
  drawInventory();
  drawMusicToggle();
  drawMapOverlay();
  drawPauseMenu();
  drawRespawnMenu();
  drawNotice();

  requestAnimationFrame(frame);
}

hydrateSignedInUser();
loadWorldSavesForCurrentUser();
tryInitGoogleAuth();
requestAnimationFrame(frame);
