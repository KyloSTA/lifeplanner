package com.lifeplanner.wear

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.material.Checkbox
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.CompactChip
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.ToggleChip
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/* ---------- Liaison avec Life Planner (faite depuis le PC) ---------- */
@Composable
fun LoginScreen(onDone: () -> Unit) {
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var err by remember { mutableStateOf("") }

    fun check() {
        busy = true; err = ""
        scope.launch {
            Auth.importLink()
            if (Auth.signedIn) {
                val e = Store.sync()
                if (e == null || e != "login") { onDone(); return@launch }
                err = "Google refuse l’autorisation : refais « Lier ma montre »."
            } else err = "Pas encore liée."
            busy = false
        }
    }

    ListScreen {
        item { Title("Life Planner", "Montre à lier") }
        item { Note("Sur ton PC, dans Life Planner : Réglages › Google Agenda › « ⌚ Lier ma montre ». Le fichier créé s’installe ensuite sur la montre.") }
        item {
            Chip(onClick = { if (!busy) check() }, label = { Text(if (busy) "Un instant…" else "Vérifier") },
                colors = ChipDefaults.primaryChipColors(), modifier = Modifier.fillMaxWidth())
        }
        if (err.isNotEmpty()) item { Note("⚠ $err", C.goldText) }
    }
}

/* ---------- Accueil ---------- */
@Composable
fun HomeScreen(go: (String) -> Unit, onSignedOut: () -> Unit) {
    val v by Store.version.collectAsState()
    val syncing by Store.syncing.collectAsState()
    val last by Store.lastSync.collectAsState()
    val error by Store.error.collectAsState()
    val scope = rememberCoroutineScope()
    var confirmOut by remember { mutableStateOf(false) }

    val missions = remember(v) { Missions.forToday() }
    val habits = remember(v) { Habits.forToday() }
    val session = remember(v) { Session.load() }
    val planned = remember(v) { Workout.plannedToday() }
    val doneWk = remember(v) { Workout.doneToday() }
    val sug = remember(v) { Stretch.suggestion() }
    val pending = remember(v) { Store.pendingCount() }

    LaunchedEffect(error) { if (error == "login") onSignedOut() }

    val open = missions.count { !it.optBoolean("done") }
    val hDone = habits.count { Habits.count(it) >= Habits.target(it) }
    ListScreen {
        item { Title("Life Planner") }
        item {
            Chip(onClick = { go("missions") }, modifier = Modifier.fillMaxWidth(),
                label = { Text("✅ Missions") },
                secondaryLabel = { Text(if (open == 0) "Tout est fait 🎉" else "$open à faire" + (missions.count { Missions.isLate(it) }.takeIf { it > 0 }?.let { " · $it en retard" } ?: "")) },
                colors = ChipDefaults.primaryChipColors(backgroundColor = C.burgundy, contentColor = C.text, secondaryContentColor = C.goldText))
        }
        item {
            Chip(onClick = { go("habits") }, modifier = Modifier.fillMaxWidth(),
                label = { Text("🔁 Habitudes") },
                secondaryLabel = { Text(if (habits.isEmpty()) "Rien aujourd’hui" else "$hDone/${habits.size} faites") },
                colors = ChipDefaults.secondaryChipColors())
        }
        item {
            Chip(onClick = { go(if (session != null) "session" else "workout") }, modifier = Modifier.fillMaxWidth(),
                label = { Text(if (session != null) "⏱ Séance en cours" else "🏋️ Workout") },
                secondaryLabel = { Text(session?.str("name") ?: doneWk?.let { "✓ ${it.str("name")} fait" } ?: planned?.let { "${it.str("emoji")} ${it.str("name")}" } ?: "Jour de repos", maxLines = 1, overflow = TextOverflow.Ellipsis) },
                colors = ChipDefaults.secondaryChipColors())
        }
        item {
            Chip(onClick = { go("stretch") }, modifier = Modifier.fillMaxWidth(),
                label = { Text("🧘 Étirements") },
                secondaryLabel = { Text("${sug.emoji} ${sug.name}", maxLines = 1, overflow = TextOverflow.Ellipsis) },
                colors = ChipDefaults.secondaryChipColors())
        }
        item {
            CompactChip(onClick = { scope.launch { Store.sync() } }, label = { Text(if (syncing) "Synchro…" else "↻ Synchroniser") })
        }
        item {
            val t = if (last > 0) SimpleDateFormat("HH:mm", Locale.CANADA_FRENCH).format(Date(last)) else "jamais"
            Note(when {
                error.isNotEmpty() && error != "login" -> "⚠ $error"
                pending > 0 -> "$pending changement${if (pending > 1) "s" else ""} à envoyer · synchro $t"
                else -> "Synchronisé à $t"
            })
        }
        item {
            CompactChip(onClick = {
                if (!confirmOut) confirmOut = true
                else { Auth.signOut(); Store.clear(); Session.save(null); onSignedOut() }
            }, label = { Text(if (confirmOut) "Confirmer ?" else "Se déconnecter", fontSize = 11.sp) }, colors = ChipDefaults.childChipColors())
        }
    }
}

/* ---------- Missions du jour ---------- */
@Composable
fun MissionsScreen() {
    val v by Store.version.collectAsState()
    val list = remember(v) { Missions.forToday() }
    ListScreen {
        item { Title("Missions", "Aujourd’hui") }
        if (list.isEmpty()) item { Note("Rien de prévu aujourd’hui 🎉") }
        items(list, key = { it.str("id") }) { m ->
            val done = m.optBoolean("done")
            val subs = m.optJSONArray("subtasks")?.objs() ?: emptyList()
            val late = Missions.isLate(m)
            val sub: String? = when {
                late -> "En retard · ${m.str("date").substring(5).replace('-', '/')}"
                subs.isNotEmpty() -> "${subs.count { it.optBoolean("done") }}/${subs.size} étapes"
                else -> null
            }
            ToggleChip(
                checked = done,
                onCheckedChange = { Missions.setDone(m, it); if (it) Buzz.tick() },
                label = { Text(m.str("title"), maxLines = 3, overflow = TextOverflow.Ellipsis) },
                secondaryLabel = if (sub != null) { { Text(sub, color = if (late) C.goldText else C.muted) } } else null,
                toggleControl = { Checkbox(checked = done) },
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

/* ---------- Habitudes du jour ---------- */
@Composable
fun HabitsScreen() {
    val v by Store.version.collectAsState()
    val list = remember(v) { Habits.forToday() }
    ListScreen {
        item { Title("Habitudes", "Aujourd’hui") }
        if (list.isEmpty()) item { Note("Aucune habitude prévue aujourd’hui.") }
        items(list, key = { it.str("id") }) { h ->
            val c = Habits.count(h); val t = Habits.target(h); val done = c >= t
            Chip(
                onClick = { Habits.bump(h); Buzz.tick() },
                label = { Text("${h.str("emoji")} ${h.str("name")}", maxLines = 2, overflow = TextOverflow.Ellipsis) },
                secondaryLabel = { Text(if (done) "✓ Fait" + (if (t > 1) " ($c/$t)" else "") else if (t > 1) "$c/$t · touche pour +1" else "Touche pour cocher") },
                colors = if (done) ChipDefaults.primaryChipColors(backgroundColor = C.ok, contentColor = C.text, secondaryContentColor = C.text)
                else ChipDefaults.secondaryChipColors(),
                modifier = Modifier.fillMaxWidth(),
            )
        }
        if (list.isNotEmpty()) item { Note("Une habitude complète : touche encore pour la remettre à zéro.") }
    }
}

/** Action pleine largeur, texte centré (utilisée par plusieurs écrans). */
@Composable
fun WideButton(text: String, onClick: () -> Unit, primary: Boolean = true) {
    Chip(onClick = onClick, modifier = Modifier.fillMaxWidth(),
        label = { Text(text, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth()) },
        colors = if (primary) ChipDefaults.primaryChipColors() else ChipDefaults.secondaryChipColors())
}
