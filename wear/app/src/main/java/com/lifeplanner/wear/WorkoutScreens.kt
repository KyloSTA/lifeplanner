package com.lifeplanner.wear

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.CircularProgressIndicator
import androidx.wear.compose.material.CompactButton
import androidx.wear.compose.material.CompactChip
import androidx.wear.compose.material.ButtonDefaults
import androidx.wear.compose.material.Text
import kotlinx.coroutines.delay
import org.json.JSONObject

/* ---------- Choisir une séance ---------- */
@Composable
fun WorkoutScreen(go: (String) -> Unit) {
    val v by Store.version.collectAsState()
    val tpls = remember(v) { Workout.templates() }
    val planned = remember(v) { Workout.plannedToday() }
    val done = remember(v) { Workout.doneToday() }
    val list = remember(tpls, planned) { listOfNotNull(planned) + tpls.filter { it.str("id") != planned?.str("id") } }
    ListScreen {
        item { Title("Workout", done?.let { "✓ ${it.str("name")} fait aujourd’hui" } ?: if (planned != null) "Au programme aujourd’hui" else "Jour de repos") }
        if (list.isEmpty()) item { Note("Aucun modèle de séance : crée-les dans Life Planner (Corps › Workout).") }
        items(list, key = { it.str("id") }) { t ->
            val n = t.optJSONArray("exercises")?.length() ?: 0
            Chip(
                onClick = { Session.save(Workout.start(t)); Session.restEnd = 0; go("session") },
                label = { Text("${t.str("emoji")} ${t.str("name")}", maxLines = 2, overflow = TextOverflow.Ellipsis) },
                secondaryLabel = { Text((if (t == planned) "Aujourd’hui · " else "") + "$n exercice${if (n > 1) "s" else ""}") },
                colors = if (t == planned) ChipDefaults.primaryChipColors(backgroundColor = C.burgundy, contentColor = C.text, secondaryContentColor = C.goldText) else ChipDefaults.secondaryChipColors(),
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

/* ---------- Séance en cours : une série à la fois ---------- */
@Composable
fun SessionScreen(onEnd: () -> Unit, onCancel: () -> Unit = onEnd) {
    KeepScreenOn()
    var log by remember { mutableStateOf(Session.load()) }
    val l = log
    if (l == null) {
        ListScreen { item { Note("Aucune séance en cours.") } }
        return
    }
    val unit = remember { Workout.unit() }
    val step = if (unit == "kg") 2.5 else 5.0
    val exs = l.optJSONArray("exercises")?.objs() ?: emptyList()
    var ei by remember { mutableIntStateOf(exs.indexOfFirst { e -> e.optJSONArray("sets")?.objs()?.any { !it.optBoolean("done") } == true }.coerceAtLeast(0)) }
    var restEnd by remember { mutableLongStateOf(Session.restEnd) }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    var confirm by remember { mutableStateOf("") }

    LaunchedEffect(restEnd) {
        while (restEnd > System.currentTimeMillis()) { now = System.currentTimeMillis(); delay(250) }
        if (restEnd > 0) {
            if (System.currentTimeMillis() - restEnd < 15_000) Buzz.alarm() // fin du repos : série suivante
            restEnd = 0; Session.restEnd = 0
        }
    }

    fun update(fn: (JSONObject) -> Unit) { val c = l.copy(); fn(c); Session.save(c); log = c }
    fun setsOf(o: JSONObject, i: Int) = o.optJSONArray("exercises")?.optJSONObject(i)?.optJSONArray("sets")?.objs() ?: emptyList()

    // Repos entre deux séries : plein écran, minuterie et vibration à la fin
    if (restEnd > now) {
        val total = Workout.rest().coerceAtLeast(1) * 1000f
        val left = restEnd - now
        Box(Modifier.fillMaxSize().background(Color.Black), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(progress = (left / total).coerceIn(0f, 1f), modifier = Modifier.fillMaxSize().padding(4.dp), indicatorColor = C.gold, trackColor = C.surface, strokeWidth = 6.dp)
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("Repos", color = C.muted, fontSize = 13.sp)
                Text(clock((left + 999) / 1000), fontSize = 34.sp, fontWeight = FontWeight.Bold, color = C.text)
                val nxt = exs.getOrNull(ei)?.str("name") ?: ""
                Text("Ensuite : $nxt", color = C.goldText, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(horizontal = 28.dp))
                Spacer(Modifier.height(6.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    CompactButton(onClick = { restEnd += 15_000; Session.restEnd = restEnd }, colors = ButtonDefaults.secondaryButtonColors()) { Text("+15") }
                    CompactButton(onClick = { restEnd = 0; Session.restEnd = 0 }) { Text("▶") }
                }
            }
        }
        return
    }

    val e = exs.getOrNull(ei)
    val sets = setsOf(l, ei)
    val si = sets.indexOfFirst { !it.optBoolean("done") }
    val allDone = exs.all { x -> x.optJSONArray("sets")?.objs()?.all { it.optBoolean("done") } != false }
    val prev = e?.let { Workout.lastFor(it.str("name")) }

    ListScreen {
        if (e == null) {
            item { Note("Cette séance n’a pas d’exercice.") }
        } else {
            item { Title(e.str("name"), "Exercice ${ei + 1}/${exs.size}" + if (si >= 0) " · Série ${si + 1}/${sets.size}" else " · ✓ fait") }
            if (si >= 0) {
                val s = sets[si]
                val p = prev?.getOrNull(si)
                if (p != null) item { Note("Précédent : " + (Workout.num(p.opt("weight"))?.let { "${Workout.fmt(it)} $unit × " } ?: "") + p.str("reps")) }
                val w = Workout.num(s.opt("weight"))
                val showW = w != null || Workout.num(p?.opt("weight")) != null
                if (showW) item {
                    Stepper(value = "${w?.let { Workout.fmt(it) } ?: "—"} $unit",
                        minus = { update { c -> val x = setsOf(c, ei)[si]; x.put("weight", Workout.fmt(((Workout.num(x.opt("weight")) ?: 0.0) - step).coerceAtLeast(0.0))) } },
                        plus = { update { c -> val x = setsOf(c, ei)[si]; x.put("weight", Workout.fmt((Workout.num(x.opt("weight")) ?: Workout.num(p?.opt("weight")) ?: 0.0) + step)) } })
                }
                val reps = s.str("reps")
                val r = reps.trim().toIntOrNull()
                item {
                    if (r != null) Stepper(value = "$r reps",
                        minus = { update { c -> setsOf(c, ei)[si].put("reps", (r - 1).coerceAtLeast(0).toString()) } },
                        plus = { update { c -> setsOf(c, ei)[si].put("reps", (r + 1).toString()) } })
                    else Text(reps.ifBlank { "—" }, fontSize = 20.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
                }
                item {
                    Chip(onClick = {
                        update { c -> setsOf(c, ei)[si].put("done", true) }
                        Buzz.step()
                        val after = log!!
                        val more = (after.optJSONArray("exercises")?.objs() ?: emptyList()).any { x -> x.optJSONArray("sets")?.objs()?.any { !it.optBoolean("done") } == true }
                        if (setsOf(after, ei).all { it.optBoolean("done") }) {
                            val nextEi = (after.optJSONArray("exercises")?.objs() ?: emptyList()).indexOfFirst { x -> x.optJSONArray("sets")?.objs()?.any { !it.optBoolean("done") } == true }
                            if (nextEi >= 0) ei = nextEi
                        }
                        if (more) { restEnd = System.currentTimeMillis() + Workout.rest() * 1000L; Session.restEnd = restEnd; now = System.currentTimeMillis() }
                    }, label = { Text("✓  Série faite", fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth()) },
                        colors = ChipDefaults.primaryChipColors(backgroundColor = C.ok, contentColor = Color.White), modifier = Modifier.fillMaxWidth())
                }
            } else {
                item { Note(if (allDone) "Toutes les séries sont faites 💪" else "Exercice terminé.") }
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    CompactChip(onClick = { if (ei > 0) ei-- }, enabled = ei > 0, label = { Text("◀") }, colors = ChipDefaults.secondaryChipColors())
                    CompactChip(onClick = { update { c -> val arr = c.optJSONArray("exercises")?.optJSONObject(ei)?.optJSONArray("sets"); val last = arr?.optJSONObject(arr.length() - 1); arr?.put(JSONObject().put("reps", last?.opt("reps") ?: "").put("weight", last?.opt("weight") ?: "").put("done", false)) } },
                        label = { Text("+ Série") }, colors = ChipDefaults.secondaryChipColors())
                    CompactChip(onClick = { if (ei < exs.size - 1) ei++ }, enabled = ei < exs.size - 1, label = { Text("▶") }, colors = ChipDefaults.secondaryChipColors())
                }
            }
        }
        item {
            Chip(onClick = {
                if (confirm != "finish") { confirm = "finish"; return@Chip }
                Workout.lastFinished = Workout.finish(l)
                Session.save(null); Session.restEnd = 0
                Buzz.alarm()
                onEnd()
            }, label = { Text(if (confirm == "finish") "Confirmer la fin ?" else "🏁 Terminer la séance", textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth()) },
                colors = if (allDone) ChipDefaults.primaryChipColors() else ChipDefaults.secondaryChipColors(), modifier = Modifier.fillMaxWidth())
        }
        item {
            CompactChip(onClick = {
                if (confirm != "cancel") { confirm = "cancel"; return@CompactChip }
                Session.save(null); Session.restEnd = 0
                onCancel()
            }, label = { Text(if (confirm == "cancel") "Confirmer ?" else "Annuler la séance", fontSize = 11.sp) }, colors = ChipDefaults.childChipColors())
        }
    }
}

/** Valeur avec boutons − et + (charge, répétitions). */
@Composable
fun Stepper(value: String, minus: () -> Unit, plus: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center, modifier = Modifier.fillMaxWidth()) {
        CompactButton(onClick = minus, colors = ButtonDefaults.secondaryButtonColors()) { Text("−", fontSize = 18.sp) }
        Text(value, fontSize = 18.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, modifier = Modifier.width(92.dp))
        CompactButton(onClick = plus, colors = ButtonDefaults.secondaryButtonColors()) { Text("+", fontSize = 18.sp) }
    }
}

/* ---------- Fin de séance ---------- */
@Composable
fun SummaryScreen(onClose: () -> Unit) {
    val l = Workout.lastFinished
    ListScreen {
        item { Title("🏁 Bravo !", l?.str("name") ?: "") }
        if (l != null) {
            val min = ((l.optLong("finishedAt") - l.optLong("startedAt")) / 60000).coerceAtLeast(0)
            val sets = l.optJSONArray("exercises")?.objs()?.sumOf { it.optJSONArray("sets")?.length() ?: 0 } ?: 0
            item { Note("$min min · $sets série${if (sets > 1) "s" else ""}", C.text) }
            val prs = l.optJSONArray("prs")?.objs() ?: emptyList()
            prs.forEach { p -> item { Note("🏆 ${p.str("ex")} : ${Workout.fmt(p.optDouble("v"))} ${Workout.unit()}", C.goldText) } }
            item { Note("Envoyée à Life Planner (Historique).") }
        }
        item { WideButton("OK", onClose) }
    }
}

/* ---------- Étirements ---------- */
@Composable
fun StretchScreen(go: (String) -> Unit) {
    val v by Store.version.collectAsState()
    val sug = remember(v) { Stretch.suggestion() }
    val list = remember(sug) { listOf(sug) + Stretch.ROUTINES.filter { it.id != sug.id } }
    ListScreen {
        item { Title("Étirements") }
        items(list, key = { it.id }) { r ->
            Chip(onClick = { go("player/${r.id}") },
                label = { Text("${r.emoji} ${r.name}", maxLines = 2, overflow = TextOverflow.Ellipsis) },
                secondaryLabel = { Text((if (r == sug) "Suggérée · " else "") + "${(r.seconds + 30) / 60} min") },
                colors = if (r == sug) ChipDefaults.primaryChipColors(backgroundColor = C.burgundy, contentColor = C.text, secondaryContentColor = C.goldText) else ChipDefaults.secondaryChipColors(),
                modifier = Modifier.fillMaxWidth())
        }
    }
}

/** Routine guidée : anneau qui se vide, vibration à chaque pose, côtés gauche et droit. */
@Composable
fun PlayerScreen(id: String, onClose: () -> Unit) {
    val r = remember { Stretch.ROUTINES.firstOrNull { it.id == id } }
    if (r == null) { ListScreen { item { Note("Routine introuvable.") } }; return }
    KeepScreenOn()
    val steps = remember { r.expand() }
    val prep = 5f
    var i by remember { mutableIntStateOf(-1) } // -1 : « Prépare-toi »
    var left by remember { mutableFloatStateOf(prep) }
    var paused by remember { mutableStateOf(false) }
    var elapsed by remember { mutableFloatStateOf(0f) }
    var finished by remember { mutableStateOf(false) }
    val started = remember { System.currentTimeMillis() }

    fun goTo(n: Int) {
        if (n >= steps.size) {
            finished = true
            Stretch.record(r, started, elapsed.toInt(), steps)
            Buzz.alarm()
        } else { i = n; left = steps[n].sec.toFloat(); Buzz.step() }
    }
    LaunchedEffect(paused, finished) {
        while (!paused && !finished) {
            delay(250)
            left -= 0.25f
            if (i >= 0) elapsed += 0.25f
            if (left <= 0f) goTo(i + 1)
        }
    }
    // Arrêtée en cours de route : au moins une minute faite compte quand même
    DisposableEffect(Unit) { onDispose { if (!finished && elapsed >= 60f) Stretch.record(r, started, elapsed.toInt(), steps.take(i + 1)) } }

    Box(Modifier.fillMaxSize().background(Color.Black), contentAlignment = Alignment.Center) {
        if (finished) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(16.dp)) {
                Text("🧘", fontSize = 36.sp)
                Text("Bien joué !", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = C.text)
                Text("${r.name} · ${(elapsed / 60).toInt().coerceAtLeast(1)} min", color = C.muted, fontSize = 12.sp, textAlign = TextAlign.Center)
                Spacer(Modifier.height(8.dp))
                CompactChip(onClick = onClose, label = { Text("Terminer") }, colors = ChipDefaults.primaryChipColors())
            }
            return@Box
        }
        val s = steps[i.coerceAtLeast(0)]
        val dur = if (i < 0) prep else s.sec.toFloat()
        CircularProgressIndicator(progress = (left / dur).coerceIn(0f, 1f), modifier = Modifier.fillMaxSize().padding(4.dp), indicatorColor = C.gold, trackColor = C.surface, strokeWidth = 6.dp)
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(horizontal = 26.dp)) {
            Text(if (i < 0) "Prépare-toi" else "${i + 1}/${steps.size}", color = C.muted, fontSize = 11.sp)
            Text(s.pose.emoji, fontSize = 30.sp)
            Text(s.pose.name, fontSize = 14.sp, fontWeight = FontWeight.Bold, color = C.text, textAlign = TextAlign.Center, maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (s.side.isNotEmpty()) Text(s.side, fontSize = 11.sp, color = C.goldText, fontWeight = FontWeight.Bold)
            Text(if (paused) "En pause" else "${kotlin.math.ceil(left).toInt()}", fontSize = if (paused) 14.sp else 26.sp, fontWeight = FontWeight.Bold, color = if (paused) C.goldText else C.text)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                CompactButton(onClick = { if (i > 0) goTo(i - 1) }, enabled = i > 0, colors = ButtonDefaults.secondaryButtonColors()) { Text("⏮", fontSize = 12.sp) }
                CompactButton(onClick = { paused = !paused }) { Text(if (paused) "▶" else "⏸", fontSize = 12.sp) }
                CompactButton(onClick = { goTo(i + 1) }, colors = ButtonDefaults.secondaryButtonColors()) { Text("⏭", fontSize = 12.sp) }
            }
        }
    }
}
