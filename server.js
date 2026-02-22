"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const url = require("url");
const { WebSocket, WebSocketServer } = require("ws");

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || "0.0.0.0";
const SAVE_FILE = process.env.MULTIPLAYER_SAVE_FILE
  ? path.resolve(process.env.MULTIPLAYER_SAVE_FILE)
  : path.join(__dirname, "multiplayer-worlds.json");
const STATIC_ROOT = __dirname;

const BEACH_SPAWN_X = 80;
const REDWOODS_SPAWN_X = 1180;
const PLAYER_SPAWN_Y = 380;
const WORLD_CODE_LENGTH = 6;
const WORLD_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const WORLD_NAME_MAX_LENGTH = 24;
const ZONE_BEACH = "beach";
const ZONE_REDWOODS = "redwoods";

const worlds = new Map();
const sessionsBySocket = new Map();
let saveTimer = null;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8"
};

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function clampResource(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
}

function normalizeZone(zone) {
  return zone === ZONE_REDWOODS ? ZONE_REDWOODS : ZONE_BEACH;
}

function normalizeTool(tool) {
  return tool === "hands" || tool === "pickaxe" || tool === "axe" || tool === "foundation" ? tool : null;
}

function normalizeWorldName(name, index = 0) {
  if (typeof name === "string" && name.trim()) {
    return name.trim().slice(0, WORLD_NAME_MAX_LENGTH);
  }
  return `World ${index + 1}`;
}

function normalizeWorldId(worldId) {
  if (typeof worldId !== "string") return "";
  const trimmed = worldId.trim().toUpperCase();
  if (!trimmed) return "";
  if (!new RegExp(`^[A-Z0-9]{${WORLD_CODE_LENGTH}}$`).test(trimmed)) return "";
  return trimmed;
}

function normalizePlayerKey(playerKey, fallback = "") {
  if (typeof playerKey === "string" && playerKey.trim()) {
    return playerKey.trim().toLowerCase().slice(0, 180);
  }
  return fallback;
}

function normalizeDisplayName(displayName) {
  if (typeof displayName === "string" && displayName.trim()) {
    return displayName.trim().slice(0, 24);
  }
  return "Survivor";
}

function createDefaultCharacterData() {
  return {
    zone: ZONE_BEACH,
    inventory: {
      thatch: 0,
      fiber: 0,
      wood: 0,
      stone: 0,
      flint: 0,
      metal: 0,
      pickaxe: 0,
      axe: 0,
      foundation: 0
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

function normalizeCharacterData(data) {
  const defaults = createDefaultCharacterData();
  const source = data && typeof data === "object" ? data : {};
  const sourceInventory = source.inventory && typeof source.inventory === "object" ? source.inventory : {};
  const sourceHotbar = source.hotbar && typeof source.hotbar === "object" ? source.hotbar : {};
  const normalizeToolCount = (value) => {
    if (value === true) return 1;
    return clampResource(value);
  };

  const normalizedSlots = [];
  for (let i = 0; i < defaults.hotbar.slots.length; i++) {
    const maybeTool = Array.isArray(sourceHotbar.slots) ? sourceHotbar.slots[i] : defaults.hotbar.slots[i];
    normalizedSlots.push(normalizeTool(maybeTool));
  }
  if (!normalizedSlots.includes("hands")) {
    normalizedSlots[0] = "hands";
  }

  const selectedSlot = Number.isInteger(sourceHotbar.selected)
    ? Math.max(0, Math.min(normalizedSlots.length - 1, sourceHotbar.selected))
    : defaults.hotbar.selected;

  return {
    zone: normalizeZone(source.zone),
    inventory: {
      thatch: clampResource(sourceInventory.thatch),
      fiber: clampResource(sourceInventory.fiber),
      wood: clampResource(sourceInventory.wood),
      stone: clampResource(sourceInventory.stone),
      flint: clampResource(sourceInventory.flint),
      metal: clampResource(sourceInventory.metal),
      pickaxe: normalizeToolCount(sourceInventory.pickaxe),
      axe: normalizeToolCount(sourceInventory.axe),
      foundation: normalizeToolCount(sourceInventory.foundation)
    },
    hotbar: {
      slots: normalizedSlots,
      selected: selectedSlot
    },
    craftSelection: source.craftSelection === "axe" || source.craftSelection === "foundation" ? source.craftSelection : "pickaxe",
    selectedInventoryTool: source.selectedInventoryTool === "pickaxe" || source.selectedInventoryTool === "axe" || source.selectedInventoryTool === "foundation"
      ? source.selectedInventoryTool
      : "hands",
    trees: [],
    stones: [],
    pebbles: []
  };
}

function defaultStateFromCharacter(characterData) {
  const zone = normalizeZone(characterData?.zone);
  return {
    x: zone === ZONE_REDWOODS ? REDWOODS_SPAWN_X : BEACH_SPAWN_X,
    y: PLAYER_SPAWN_Y,
    w: 34,
    h: 50,
    facing: 1,
    zone,
    health: 100,
    maxHealth: 100,
    dead: false
  };
}

function normalizePlayerState(state, fallback) {
  const base = fallback && typeof fallback === "object"
    ? fallback
    : defaultStateFromCharacter(createDefaultCharacterData());
  const source = state && typeof state === "object" ? state : {};
  const maxHealth = clampNumber(source.maxHealth, 1, 10000, base.maxHealth);
  const health = clampNumber(source.health, 0, maxHealth, base.health);

  return {
    x: clampNumber(source.x, -10000, 10000, base.x),
    y: clampNumber(source.y, -10000, 10000, base.y),
    w: clampNumber(source.w, 10, 160, base.w),
    h: clampNumber(source.h, 10, 220, base.h),
    facing: source.facing >= 0 ? 1 : -1,
    zone: normalizeZone(source.zone || base.zone),
    health,
    maxHealth,
    dead: !!source.dead || health <= 0
  };
}

function createWorld(worldId, worldName) {
  const now = Date.now();
  return {
    id: worldId,
    name: normalizeWorldName(worldName, worlds.size),
    createdAt: now,
    updatedAt: now,
    characters: new Map(),
    members: new Map()
  };
}

function worldToPersistedRecord(world) {
  const characters = {};
  for (const [playerKey, characterData] of world.characters.entries()) {
    characters[playerKey] = normalizeCharacterData(characterData);
  }
  return {
    id: world.id,
    name: normalizeWorldName(world.name),
    createdAt: Number.isFinite(world.createdAt) ? world.createdAt : Date.now(),
    updatedAt: Number.isFinite(world.updatedAt) ? world.updatedAt : Date.now(),
    characters
  };
}

function persistWorldsNow() {
  const payload = {
    version: 1,
    updatedAt: Date.now(),
    worlds: Array.from(worlds.values()).map((world) => worldToPersistedRecord(world))
  };
  try {
    fs.writeFileSync(SAVE_FILE, JSON.stringify(payload, null, 2), "utf8");
  } catch (error) {
    console.error("[multiplayer] failed to save worlds:", error.message);
  }
}

function schedulePersist() {
  if (saveTimer !== null) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    persistWorldsNow();
  }, 120);
}

function loadWorldsFromDisk() {
  if (!fs.existsSync(SAVE_FILE)) return;
  try {
    const raw = fs.readFileSync(SAVE_FILE, "utf8");
    if (!raw.trim()) return;
    const parsed = JSON.parse(raw);
    const sourceWorlds = Array.isArray(parsed.worlds) ? parsed.worlds : [];

    for (let i = 0; i < sourceWorlds.length; i++) {
      const record = sourceWorlds[i];
      if (!record || typeof record !== "object") continue;

      const worldId = normalizeWorldId(record.id) || generateWorldCode();
      const world = createWorld(worldId, record.name);
      world.createdAt = Number.isFinite(record.createdAt) ? record.createdAt : Date.now();
      world.updatedAt = Number.isFinite(record.updatedAt) ? record.updatedAt : world.createdAt;

      const rawCharacters = record.characters && typeof record.characters === "object"
        ? record.characters
        : {};
      for (const [playerKey, characterData] of Object.entries(rawCharacters)) {
        const normalizedKey = normalizePlayerKey(playerKey);
        if (!normalizedKey) continue;
        world.characters.set(normalizedKey, normalizeCharacterData(characterData));
      }

      worlds.set(world.id, world);
    }
  } catch (error) {
    console.error("[multiplayer] failed to load worlds:", error.message);
  }
}

function randomIdFragment(length = 8) {
  return Math.random().toString(36).slice(2, 2 + length);
}

function generatePlayerId() {
  return `p_${randomIdFragment(9)}${Date.now().toString(36).slice(-4)}`;
}

function generateWorldCode() {
  for (let attempt = 0; attempt < 300; attempt++) {
    let code = "";
    for (let i = 0; i < WORLD_CODE_LENGTH; i++) {
      const index = Math.floor(Math.random() * WORLD_CODE_ALPHABET.length);
      code += WORLD_CODE_ALPHABET[index];
    }
    if (!worlds.has(code)) return code;
  }
  return `W${Date.now().toString(36).toUpperCase().slice(-5)}`;
}

function sendMessage(socket, payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  try {
    socket.send(JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

function sendErrorAndClose(socket, message) {
  sendMessage(socket, { type: "error", message });
  try {
    socket.close();
  } catch {
    // Ignore socket close errors.
  }
}

function writeJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function sendFile(res, filePath) {
  let stats = null;
  try {
    stats = fs.statSync(filePath);
  } catch {
    writeJson(res, 404, { error: "Not found" });
    return;
  }
  if (!stats.isFile()) {
    writeJson(res, 404, { error: "Not found" });
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[extension] || "application/octet-stream";
  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": stats.size
  });
  fs.createReadStream(filePath).pipe(res);
}

function handleHttpRequest(req, res) {
  const method = String(req.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    writeJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const parsed = url.parse(req.url || "/", false);
  let pathname = "/";
  try {
    pathname = decodeURIComponent(parsed.pathname || "/");
  } catch {
    writeJson(res, 400, { error: "Bad request" });
    return;
  }
  if (pathname === "/health") {
    writeJson(res, 200, {
      ok: true,
      worlds: worlds.size,
      uptimeSeconds: Math.floor(process.uptime())
    });
    return;
  }

  const relativePath = pathname === "/"
    ? "index.html"
    : pathname.replace(/^\/+/, "");
  const absolutePath = path.resolve(STATIC_ROOT, relativePath);
  if (!absolutePath.startsWith(STATIC_ROOT)) {
    writeJson(res, 403, { error: "Forbidden" });
    return;
  }

  if (method === "HEAD") {
    let stats = null;
    try {
      stats = fs.statSync(absolutePath);
    } catch {
      writeJson(res, 404, { error: "Not found" });
      return;
    }
    if (!stats.isFile()) {
      writeJson(res, 404, { error: "Not found" });
      return;
    }
    const extension = path.extname(absolutePath).toLowerCase();
    const contentType = MIME_TYPES[extension] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": stats.size
    });
    res.end();
    return;
  }

  sendFile(res, absolutePath);
}

function sessionToNetworkPlayer(session) {
  return {
    playerId: session.playerId,
    name: session.displayName,
    x: session.state.x,
    y: session.state.y,
    w: session.state.w,
    h: session.state.h,
    facing: session.state.facing,
    zone: session.state.zone,
    health: session.state.health,
    maxHealth: session.state.maxHealth,
    dead: session.state.dead
  };
}

function broadcastToWorld(world, payload, excludedPlayerId = "") {
  for (const member of world.members.values()) {
    if (excludedPlayerId && member.playerId === excludedPlayerId) continue;
    sendMessage(member.socket, payload);
  }
}

function detachSession(socket) {
  const session = sessionsBySocket.get(socket);
  if (!session) return;
  sessionsBySocket.delete(socket);

  const world = worlds.get(session.worldId);
  if (!world) return;
  world.members.delete(session.playerId);

  if (session.playerKey) {
    world.characters.set(session.playerKey, normalizeCharacterData(session.characterData));
    world.updatedAt = Date.now();
    schedulePersist();
  }

  broadcastToWorld(world, {
    type: "player_left",
    playerId: session.playerId
  });
}

function handleHello(socket, message) {
  const mode = message?.mode === "join" ? "join" : (message?.mode === "host" ? "host" : "");
  if (!mode) {
    sendErrorAndClose(socket, "Invalid mode. Use host or join.");
    return false;
  }

  let world = null;
  if (mode === "host") {
    const worldName = normalizeWorldName(message?.worldName, worlds.size);
    const worldId = generateWorldCode();
    world = createWorld(worldId, worldName);
    worlds.set(world.id, world);
    schedulePersist();
  } else {
    const worldId = normalizeWorldId(message?.worldId);
    if (!worldId || !worlds.has(worldId)) {
      sendErrorAndClose(socket, "Invite code not found.");
      return false;
    }
    world = worlds.get(worldId);
  }

  const playerId = generatePlayerId();
  const fallbackPlayerKey = `guest_${playerId}`;
  const playerKey = normalizePlayerKey(message?.playerKey, fallbackPlayerKey);
  const displayName = normalizeDisplayName(message?.displayName);

  let characterData = world.characters.get(playerKey);
  if (!characterData) {
    characterData = normalizeCharacterData(message?.characterData);
    world.characters.set(playerKey, characterData);
    world.updatedAt = Date.now();
    schedulePersist();
  } else {
    characterData = normalizeCharacterData(characterData);
    world.characters.set(playerKey, characterData);
  }

  const session = {
    socket,
    playerId,
    playerKey,
    displayName,
    worldId: world.id,
    characterData,
    state: defaultStateFromCharacter(characterData)
  };

  sessionsBySocket.set(socket, session);
  world.members.set(session.playerId, session);

  const otherPlayers = [];
  for (const member of world.members.values()) {
    if (member.playerId === session.playerId) continue;
    otherPlayers.push(sessionToNetworkPlayer(member));
  }

  sendMessage(socket, {
    type: "welcome",
    worldId: world.id,
    worldName: world.name,
    playerId: session.playerId,
    characterData,
    players: otherPlayers
  });

  broadcastToWorld(world, {
    type: "player_joined",
    player: sessionToNetworkPlayer(session)
  }, session.playerId);

  return true;
}

function handleMessage(socket, rawData) {
  let message = null;
  try {
    message = JSON.parse(String(rawData));
  } catch {
    return;
  }
  if (!message || typeof message !== "object") return;

  if (!sessionsBySocket.has(socket)) {
    if (message.type !== "hello") {
      sendErrorAndClose(socket, "Send hello first.");
      return;
    }
    const ok = handleHello(socket, message);
    if (!ok) return;
    return;
  }

  const session = sessionsBySocket.get(socket);
  const world = worlds.get(session.worldId);
  if (!world) return;

  if (message.type === "player_state") {
    session.state = normalizePlayerState(message.state, session.state);
    broadcastToWorld(world, {
      type: "player_state",
      player: sessionToNetworkPlayer(session)
    }, session.playerId);
    return;
  }

  if (message.type === "save_character") {
    session.characterData = normalizeCharacterData(message.characterData);
    world.characters.set(session.playerKey, session.characterData);
    world.updatedAt = Date.now();
    schedulePersist();
    return;
  }
}

loadWorldsFromDisk();

const httpServer = http.createServer((req, res) => {
  handleHttpRequest(req, res);
});
const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (socket) => {
  socket.on("message", (data) => {
    handleMessage(socket, data);
  });

  socket.on("close", () => {
    detachSession(socket);
  });

  socket.on("error", () => {
    detachSession(socket);
  });
});

const hostLabel = HOST === "0.0.0.0" ? "localhost" : HOST;
httpServer.listen(PORT, HOST, () => {
  console.log(`[multiplayer] server running on http://${hostLabel}:${PORT}`);
  console.log(`[multiplayer] websocket endpoint: ws://${hostLabel}:${PORT}`);
  console.log(`[multiplayer] save file: ${SAVE_FILE}`);
  console.log(`[multiplayer] loaded worlds: ${worlds.size}`);
});

function shutdown(signal) {
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  persistWorldsNow();
  console.log(`[multiplayer] shutdown (${signal})`);
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
