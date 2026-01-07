var STORAGE_KEY = "escape_happypandi_save_v2";

function $(id) { return document.getElementById(id); }

function toast(msg) {
    var t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function() { t.classList.remove("show"); }, 1600);
}

function openModal(id) {
    var d = $(id);
    if (d && typeof d.showModal === "function") d.showModal();
}

function closeModal(id) {
    var d = $(id);
    if (d) d.close();
}

function showMessage(title, html) {
    $("modalTitle").textContent = title;
    $("modalBody").innerHTML = html;
    openModal("modalMsg");
}

var gameData = null;

// Estado global (persistente)
var state = {
    roomIndex: 0,
    solved: {}, // roomId -> true
    rooms: {} // roomId -> { inventory: {}, clues: [], flags: {}, activeItem: "" }
};

var currentPuzzle = null;

async function loadData() {
    try {
        var res = await fetch("./data/rooms.json");
        if (!res.ok) throw new Error("No se pudo cargar rooms.json");
        gameData = await res.json();
        if (!gameData || !gameData.rooms || !gameData.rooms.length) throw new Error("rooms.json inválido");
    } catch (e) {
        console.error(e);
        showMessage("Error", "No pude cargar los datos del juego. Revisa que exista <b>data/rooms.json</b> y estés usando un servidor (Live Server / GitHub Pages).");
    }
}

function getRoom() {
    if (!gameData) return null;
    return gameData.rooms[state.roomIndex] || null;
}

function getRoomState(roomId) {
    if (!state.rooms[roomId]) {
        state.rooms[roomId] = { inventory: {}, clues: [], flags: {}, activeItem: "" };
    }
    return state.rooms[roomId];
}

function getItemDef(room, itemId) {
    var items = (room && room.items) ? room.items : [];
    for (var i = 0; i < items.length; i++) {
        if (items[i].id === itemId) return items[i];
    }
    return null;
}

function hasItem(room, itemId) {
    var rs = getRoomState(room.id);
    return !!rs.inventory[itemId];
}

function addItem(room, itemId) {
    var rs = getRoomState(room.id);
    if (rs.inventory[itemId]) return;

    var def = getItemDef(room, itemId);
    if (!def) return;

    rs.inventory[itemId] = true;
    toast("Nuevo objeto: " + def.name);
}

function addItemOnce(room, key, itemId) {
    var rs = getRoomState(room.id);
    if (rs.flags[key]) return;
    rs.flags[key] = true;
    addItem(room, itemId);
}

function addClueOnce(room, key, text) {
    var rs = getRoomState(room.id);
    if (rs.flags[key]) return;
    rs.flags[key] = true;
    rs.clues.push(text);
    toast("Nueva pista ✨");
}

function completeRoom(roomId) {
    state.solved[roomId] = true;
}

function setActiveItem(room, itemId) {
    var rs = getRoomState(room.id);
    if (itemId && !hasItem(room, itemId)) return;
    rs.activeItem = itemId || "";
}

function clearActiveItem(room) {
    setActiveItem(room, "");
}

function getActiveItem(room) {
    var rs = getRoomState(room.id);
    return rs.activeItem || "";
}

/* --------- Puzzle engine --------- */

function showPuzzle(puzzle, room) {
    $("puzzleBox").style.display = "block";
    $("puzzleHint").textContent = puzzle.prompt || "Escribe el código";
    $("puzzleExtra").textContent = "Consejo: sin espacios. Si es suma, usa los valores descubiertos.";
    $("puzzleInput").value = "";
    currentPuzzle = { puzzle: puzzle, room: room };
    setTimeout(function() { $("puzzleInput").focus(); }, 50);
}

function hidePuzzle() {
    $("puzzleBox").style.display = "none";
    currentPuzzle = null;
}

function computeSumPuzzleAnswer(puzzle, room) {
    var sum = 0;
    var ids = puzzle.sumItemIds || [];
    for (var i = 0; i < ids.length; i++) {
        var def = getItemDef(room, ids[i]);
        if (def && typeof def.value === "number") sum += def.value;
    }
    return String(sum);
}

function normalizeInput(s) {
    s = (s || "").toString();
    s = s.replace(/\s+/g, "");
    return s.toUpperCase();
}

function tryPuzzle() {
    if (!currentPuzzle) return;

    var puzzle = currentPuzzle.puzzle;
    var room = currentPuzzle.room;

    var input = normalizeInput($("puzzleInput").value);
    var expected = "";

    if (puzzle.type === "sum") {
        expected = normalizeInput(computeSumPuzzleAnswer(puzzle, room));
    } else {
        expected = normalizeInput(puzzle.answer || "");
    }

    if (input === expected) {
        if (puzzle.onSuccess && puzzle.onSuccess.type === "completeRoom") {
            completeRoom(room.id);
        }
        hidePuzzle();
        showMessage(puzzle.successTitle || "¡Bien!", puzzle.successText || "¡Lo has conseguido!");
        updateUI();
    } else {
        showMessage("Ups…", "No funciona todavía. Revisa las pistas y prueba otra vez. 💪");
    }
}

/* --------- Actions from JSON --------- */

function runAction(room, action) {
    if (!action || !action.type) return;

    if (action.type === "addClueOnce") {
        addClueOnce(room, action.key || ("clue_" + Math.random()), action.text || "");
    }

    if (action.type === "addItemOnce") {
        addItemOnce(room, action.key || ("item_" + Math.random()), action.itemId);
    }

    if (action.type === "showMsg") {
        showMessage(action.title || "Mensaje", action.html || "");
    }

    if (action.type === "openPuzzle") {
        showPuzzle(action.puzzle, room);
    }

    if (action.type === "completeRoom") {
        completeRoom(room.id);
    }
}

function runActions(room, actions) {
    if (!actions) return;
    for (var i = 0; i < actions.length; i++) {
        runAction(room, actions[i]);
    }
}

function matchInteraction(interaction, room, activeItemId) {
    if (!interaction || !interaction.when) return false;

    var w = interaction.when;

    // Inspect
    if (w.type === "inspect") {
        return !activeItemId;
    }

    // Use item
    if (w.type === "useItem") {
        return !!activeItemId && activeItemId === w.itemId;
    }

    return false;
}

function onObjectPressed(obj) {
    var room = getRoom();
    if (!room) return;

    var rs = getRoomState(room.id);
    var activeItemId = rs.activeItem || "";

    // Choose appropriate interaction
    var interactions = obj.interactions || [];
    var selected = null;

    for (var i = 0; i < interactions.length; i++) {
        if (matchInteraction(interactions[i], room, activeItemId)) {
            selected = interactions[i];
            break;
        }
    }

    if (!selected) {
        // If user tried to use an item but no matching interaction, give friendly feedback
        if (activeItemId) {
            var itemDef = getItemDef(room, activeItemId);
            var itemName = itemDef ? itemDef.name : "ese objeto";
            showMessage("No funciona", "Usar <b>" + itemName + "</b> aquí no ayuda. Prueba otro objeto o toca sin item para mirar.");
        } else {
            showMessage("Nada nuevo", "No encuentras nada especial aquí… por ahora.");
        }
        return;
    }

    runActions(room, selected.actions || []);

    // After using an item, we keep it active (kids like it), but you can auto-clear if you prefer:
    // clearActiveItem(room);

    updateUI();
}

/* --------- UI --------- */

function updateUI() {
    var room = getRoom();
    if (!room) return;

    var rs = getRoomState(room.id);

    $("roomName").textContent = "🧩 " + room.name;
    $("roomSubtitle").textContent = room.subtitle || "";
    $("roomTitle").textContent = room.name;
    $("roomDesc").textContent = room.desc || "";
    $("badgeCast").textContent = "👧🧒 Personajes: " + (room.cast || "");
    $("badgeMood").textContent = "✨ Tono: " + (room.mood || "");

    $("chipRoom").textContent = "🏠 Sala " + (state.roomIndex + 1) + "/" + (gameData.rooms.length);
    $("chipGoal").textContent = "🎯 Objetivo: " + (room.goal || "escapar");

    // Objects render
    var grid = $("objectsGrid");
    grid.innerHTML = "";
    var objects = room.objects || [];
    for (var i = 0; i < objects.length; i++) {
        (function(obj) {
            var b = document.createElement("button");
            b.className = "obj";
            b.type = "button";
            b.innerHTML =
                '<div class="objIcon" aria-hidden="true">' + obj.icon + '</div>' +
                '<div>' +
                '<div class="objName">' + obj.name + '</div>' +
                '<div class="objHint">' + obj.hint + '</div>' +
                '</div>';
            b.addEventListener("click", function() { onObjectPressed(obj); });
            grid.appendChild(b);
        })(objects[i]);
    }

    // Inventory render (clickable to set active item)
    var inv = $("inventory");
    inv.innerHTML = "";
    var invCount = 0;

    var items = room.items || [];
    for (var j = 0; j < items.length; j++) {
        var it = items[j];
        if (rs.inventory[it.id]) {
            invCount++;
            (function(itemDef) {
                var btn = document.createElement("button");
                btn.className = "item" + ((rs.activeItem === itemDef.id) ? " active" : "");
                btn.type = "button";
                btn.innerHTML =
                    '<div class="itemIcon" aria-hidden="true">' + itemDef.icon + '</div>' +
                    '<div>' + itemDef.name + '</div>';
                btn.addEventListener("click", function() {
                    if (rs.activeItem === itemDef.id) {
                        rs.activeItem = "";
                    } else {
                        rs.activeItem = itemDef.id;
                    }
                    updateUI();
                });
                inv.appendChild(btn);
            })(it);
        }
    }
    $("invCount").textContent = invCount + (invCount === 1 ? " objeto" : " objetos");

    // Active item bar
    var active = rs.activeItem || "";
    if (active) {
        var def = getItemDef(room, active);
        $("activeItemText").textContent = def ? (def.icon + " " + def.name) : "Item activo";
    } else {
        $("activeItemText").textContent = "Ninguno (toca un item)";
    }

    // Clues
    var cluesEl = $("clues");
    cluesEl.innerHTML = "";
    for (var c = 0; c < rs.clues.length; c++) {
        var li = document.createElement("li");
        li.textContent = rs.clues[c];
        cluesEl.appendChild(li);
    }
    $("clueCount").textContent = rs.clues.length + (rs.clues.length === 1 ? " pista" : " pistas");

    // Progress
    var total = gameData.rooms.length;
    var solvedCount = 0;
    for (var k in state.solved) {
        if (state.solved.hasOwnProperty(k) && state.solved[k]) solvedCount++;
    }
    $("progressText").textContent = "Salas completadas: " + solvedCount + "/" + total + (solvedCount === total ? " — ¡Has escapado!" : "");

    // Next button
    if (state.solved[room.id] && state.roomIndex < total - 1) {
        $("btnSiguiente").style.display = "inline-block";
    } else {
        $("btnSiguiente").style.display = "none";
    }
}

/* --------- Save/Load/Reset --------- */

function saveGame() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        toast("Guardado ✅");
    } catch (_e) {
        showMessage("Ups", "No se pudo guardar en este navegador.");
    }
}

function loadGame() {
    try {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return false;
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
            state = parsed;
            if (typeof state.roomIndex !== "number") state.roomIndex = 0;
            if (!state.solved) state.solved = {};
            if (!state.rooms) state.rooms = {};
            return true;
        }
    } catch (_e) {}
    return false;
}

function resetGame() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (_e) {}
    state = { roomIndex: 0, solved: {}, rooms: {} };
    hidePuzzle();
    updateUI();
    toast("Reiniciado 🧹");
}

function goNextRoom() {
    var room = getRoom();
    if (!room) return;

    if (!state.solved[room.id]) {
        showMessage("Aún no", "Primero hay que completar esta sala. 💪");
        return;
    }

    state.roomIndex++;
    hidePuzzle();
    updateUI();
    toast("Nueva sala 🏠");
}

/* --------- Wire UI --------- */

function wireUI() {
    $("btnAyuda").addEventListener("click", function() { openModal("modalAyuda"); });
    $("btnCerrarAyuda").addEventListener("click", function() { closeModal("modalAyuda"); });
    $("btnEntendido").addEventListener("click", function() { closeModal("modalAyuda"); });

    $("btnCerrarMsg").addEventListener("click", function() { closeModal("modalMsg"); });
    $("btnOkMsg").addEventListener("click", function() { closeModal("modalMsg"); });

    $("btnProbar").addEventListener("click", tryPuzzle);
    $("puzzleInput").addEventListener("keydown", function(e) {
        if (e.key === "Enter") {
            e.preventDefault();
            tryPuzzle();
        }
    });

    $("btnGuardar").addEventListener("click", saveGame);

    $("btnReiniciar").addEventListener("click", function() {
        showMessage("¿Reiniciar?", "Se borrará el progreso guardado. ¿Seguro?");
        var ok = $("btnOkMsg");
        ok.onclick = function() {
            closeModal("modalMsg");
            ok.onclick = function() { closeModal("modalMsg"); };
            resetGame();
        };
    });

    $("btnSiguiente").addEventListener("click", goNextRoom);

    $("btnClearActive").addEventListener("click", function() {
        var room = getRoom();
        if (!room) return;
        clearActiveItem(room);
        updateUI();
    });
}

/* --------- Init --------- */

(function init() {
    wireUI();
    loadData().then(function() {
        var loaded = loadGame();
        if (!loaded) {
            openModal("modalAyuda");
        }
        updateUI();
    });
})();