var STORAGE_KEY = "escape_happypandi_save_v1";

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

// Estado
var state = {
    roomIndex: 0,
    inventory: {}, // itemId -> true
    clues: [], // array strings
    flags: {}, // onceKeys
    solved: {} // roomId -> true
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

function getItemDef(room, itemId) {
    var items = (room && room.items) ? room.items : [];
    for (var i = 0; i < items.length; i++) {
        if (items[i].id === itemId) return items[i];
    }
    return null;
}

function hasItem(itemId) {
    return !!state.inventory[itemId];
}

function addItem(room, itemId) {
    if (hasItem(itemId)) return;
    var def = getItemDef(room, itemId);
    if (!def) return;
    state.inventory[itemId] = true;
    toast("Nuevo objeto: " + def.name);
}

function addClueOnce(onceKey, text) {
    if (state.flags[onceKey]) return;
    state.flags[onceKey] = true;
    state.clues.push(text);
    toast("Nueva pista ✨");
}

function completeRoom(roomId) {
    state.solved[roomId] = true;
}

function showPuzzle(puzzle, room) {
    $("puzzleBox").style.display = "block";
    $("puzzleHint").textContent = puzzle.prompt || "Escribe el código";
    $("puzzleExtra").textContent = "Consejo: escribe solo números/letras, sin espacios.";
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
        if (def && typeof def.value === "number") {
            sum += def.value;
        }
    }
    return String(sum);
}

function tryPuzzle() {
    if (!currentPuzzle) return;

    var puzzle = currentPuzzle.puzzle;
    var room = currentPuzzle.room;

    var input = $("puzzleInput").value;
    input = (input || "").toString().replace(/\s+/g, "").toUpperCase();

    var expected = "";
    if (puzzle.type === "sum") {
        expected = computeSumPuzzleAnswer(puzzle, room).toUpperCase();
    } else {
        expected = String(puzzle.answer || "").toUpperCase();
    }

    if (input === expected) {
        // onSuccess
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

function runActions(obj, room) {
    var actions = obj.actions || [];
    for (var i = 0; i < actions.length; i++) {
        var a = actions[i];

        if (a.type === "addClue") {
            addClueOnce(a.onceKey || (obj.id + "_clue_" + i), a.text || "");
        }

        if (a.type === "addItem") {
            if (a.onceKey) {
                if (state.flags[a.onceKey]) continue;
                state.flags[a.onceKey] = true;
            }
            addItem(room, a.itemId);
        }

        if (a.type === "openPuzzle") {
            showPuzzle(a.puzzle, room);
        }
    }
}

function onObjectClick(obj) {
    var room = getRoom();
    if (!room) return;

    // Requires item?
    if (obj.requiresItem && !hasItem(obj.requiresItem)) {
        showMessage("Bloqueado", obj.lockedText || "Necesitas un objeto del inventario.");
        return;
    }

    runActions(obj, room);
    updateUI();
}

function updateUI() {
    var room = getRoom();
    if (!room) return;

    $("roomName").textContent = "🧩 " + room.name;
    $("roomSubtitle").textContent = room.subtitle || "";

    $("roomTitle").textContent = room.name;
    $("roomDesc").textContent = room.desc;

    $("badgeCast").textContent = "👧🧒 Personajes: " + (room.cast || "");
    $("badgeMood").textContent = "✨ Tono: " + (room.mood || "");

    $("chipRoom").textContent = "🏠 Sala " + (state.roomIndex + 1) + "/" + (gameData.rooms.length);

    // Objects
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
            b.addEventListener("click", function() { onObjectClick(obj); });
            grid.appendChild(b);
        })(objects[i]);
    }

    // Inventory
    var inv = $("inventory");
    inv.innerHTML = "";
    var invCount = 0;
    var items = room.items || [];
    for (var j = 0; j < items.length; j++) {
        if (state.inventory[items[j].id]) {
            invCount++;
            var div = document.createElement("div");
            div.className = "item";
            div.innerHTML =
                '<div class="itemIcon" aria-hidden="true">' + items[j].icon + '</div>' +
                '<div>' + items[j].name + '</div>';
            inv.appendChild(div);
        }
    }
    $("invCount").textContent = invCount + (invCount === 1 ? " objeto" : " objetos");

    // Clues
    var clues = $("clues");
    clues.innerHTML = "";
    for (var c = 0; c < state.clues.length; c++) {
        var li = document.createElement("li");
        li.textContent = state.clues[c];
        clues.appendChild(li);
    }
    $("clueCount").textContent = state.clues.length + (state.clues.length === 1 ? " pista" : " pistas");

    // Progress
    var totalRooms = gameData.rooms.length;
    var solvedCount = 0;
    for (var k in state.solved) {
        if (state.solved.hasOwnProperty(k) && state.solved[k]) solvedCount++;
    }
    $("progressText").textContent = "Salas completadas: " + solvedCount + "/" + totalRooms;

    // Next button
    if (state.solved[room.id] && state.roomIndex < totalRooms - 1) {
        $("btnSiguiente").style.display = "inline-block";
    } else {
        $("btnSiguiente").style.display = "none";
    }
}

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
            if (!state.inventory) state.inventory = {};
            if (!state.clues) state.clues = [];
            if (!state.flags) state.flags = {};
            if (!state.solved) state.solved = {};
            if (typeof state.roomIndex !== "number") state.roomIndex = 0;
            return true;
        }
    } catch (_e) {}
    return false;
}

function resetGame() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (_e) {}
    state = { roomIndex: 0, inventory: {}, clues: [], flags: {}, solved: {} };
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
    state.clues = [];
    state.inventory = {};
    state.flags = {};
    updateUI();
    toast("Nueva sala 🏠");
}

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
}

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