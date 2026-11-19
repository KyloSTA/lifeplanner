package com.lifeplanner.wear

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/** Mêmes règles que le site (tasks.js, habits.js, game.js, workout.js) pour que tout reste compatible. */

fun today(): String = LocalDate.now().toString()
fun dayOf(ms: Long): String = Instant.ofEpochMilli(ms).atZone(ZoneId.systemDefault()).toLocalDate().toString()
fun uid(): String = java.lang.Long.toString(System.currentTimeMillis(), 36) + java.lang.Long.toString((Math.random() * 1e8).toLong(), 36)

/** Texte d'un champ (null et absent donnent ""). */
fun JSONObject.str(k: String): String = if (isNull(k)) "" else optString(k, "")
fun JSONObject.copy(): JSONObject = JSONObject(toString())
fun JSONArray.objs(): List<JSONObject> = (0 until length()).mapNotNull { optJSONObject(it) }

/* ---------- Points (journal « xp ») ---------- */
object Xp {
    const val TASK = 10; const val SUB = 3; const val HABIT = 3; const val WORKOUT = 25; const val STRETCH = 10

    fun award(key: String, amount: Int, reason: String) {
        if (Store.get("xp", key) != null) return
        val now = System.currentTimeMillis()
        Store.put("xp", key, JSONObject().put("key", key).put("amount", amount).put("reason", reason).put("at", now).put("day", today()))
    }

    fun revoke(key: String) { if (Store.get("xp", key) != null) Store.del("xp", key) }
}

/* ---------- Missions ---------- */
object Missions {
    /** Missions d'aujourd'hui et en retard (à faire), puis celles faites aujourd'hui. */
    fun forToday(): List<JSONObject> {
        val t = today()
        return Store.objects("tasks").filter { m ->
            val d = m.str("date")
            if (m.optBoolean("done")) m.optLong("doneAt") > 0 && dayOf(m.optLong("doneAt")) == t
            else d.isNotEmpty() && d <= t
        }.sortedWith(compareBy<JSONObject>({ it.optBoolean("done") }, { it.str("date") }, { it.optDouble("order", 1e15) }, { it.optLong("createdAt") }))
    }

    fun isLate(m: JSONObject) = !m.optBoolean("done") && m.str("date").let { it.isNotEmpty() && it < today() }

    fun setDone(m: JSONObject, done: Boolean) {
        val t = m.copy()
        val id = t.getString("id")
        t.put("done", done)
        t.put("doneAt", if (done) System.currentTimeMillis() else JSONObject.NULL)
        if (done) {
            t.optJSONArray("subtasks")?.objs()?.forEach { s ->
                if (!s.optBoolean("done")) {
                    s.put("done", true)
                    Xp.award("sub:$id:${s.str("id")}", Xp.SUB, "Étape : " + s.str("title"))
                }
            }
        }
        Store.put("tasks", id, t)
        if (done) Xp.award("task:$id", Xp.TASK, "Mission : " + t.str("title")) else Xp.revoke("task:$id")
    }
}

/* ---------- Habitudes ---------- */
object Habits {
    /** Habitudes prévues aujourd'hui (jours choisis, pas archivées). */
    fun forToday(): List<JSONObject> {
        val t = today()
        val dow = LocalDate.now().dayOfWeek.value % 7 // 0 = dimanche, comme le site
        return Store.objects("habits").filter { h ->
            if (h.optBoolean("archived")) return@filter false
            val days = h.optJSONArray("days") ?: return@filter false
            (0 until days.length()).any { days.optInt(it, -1) == dow } && dayOf(h.optLong("createdAt")) <= t
        }.sortedBy { it.optDouble("order", 0.0) }
    }

    fun target(h: JSONObject) = h.optInt("target", 1).coerceAtLeast(1)
    fun count(h: JSONObject) = h.optJSONObject("log")?.optInt(today(), 0) ?: 0

    /** Un toucher : +1 (ou cocher) ; quand c'est complet, un toucher remet à zéro. */
    fun bump(h: JSONObject) {
        val x = h.copy()
        val day = today()
        val c = count(x); val tg = target(x)
        val n = if (c >= tg) 0 else c + 1
        val log = x.optJSONObject("log") ?: JSONObject().also { x.put("log", it) }
        if (n > 0) log.put(day, n) else log.remove(day)
        val id = x.getString("id")
        Store.put("habits", id, x)
        val key = "habit:$id:$day"
        if (n >= tg) Xp.award(key, Xp.HABIT, "Habitude : ${x.str("emoji")} ${x.str("name")}") else Xp.revoke(key)
    }
}

/* ---------- Workout ---------- */
object Workout {
    /** Dernière séance terminée (pour l'écran de fin). */
    var lastFinished: JSONObject? = null

    fun plan(): JSONObject = Store.obj("settings", "workoutPlan") ?: JSONObject()
    fun unit(): String = plan().optString("unit", "lb")
    fun rest(): Int = plan().optInt("rest", 90)

    fun templates(): List<JSONObject> = Store.objects("workouts").filter { it.str("kind") == "tpl" }.sortedBy { it.optDouble("order", 0.0) }
    fun logs(): List<JSONObject> = Store.objects("workouts").filter { it.str("kind") == "log" }.sortedByDescending { it.optLong("startedAt") }

    fun plannedToday(): JSONObject? {
        val dow = (LocalDate.now().dayOfWeek.value % 7).toString()
        val id = plan().optJSONObject("days")?.str(dow) ?: return null
        return templates().firstOrNull { it.str("id") == id }
    }

    fun num(v: Any?): Double? = v?.toString()?.replace(',', '.')?.toDoubleOrNull()
    fun fmt(d: Double): String = if (d % 1.0 == 0.0) d.toLong().toString() else "%.1f".format(d).replace(',', '.')

    /** Séries de la dernière séance terminée où l'exercice apparaît. */
    fun lastFor(name: String): List<JSONObject>? {
        val k = name.trim().lowercase()
        for (l in logs()) {
            if (!l.optBoolean("done")) continue
            val ex = l.optJSONArray("exercises")?.objs()?.firstOrNull { it.str("name").trim().lowercase() == k } ?: continue
            val sets = ex.optJSONArray("sets")?.objs()?.filter { it.optBoolean("done") } ?: continue
            if (sets.isNotEmpty()) return sets
        }
        return null
    }

    /** Nouvelle séance (même forme que sur le site), d'après un modèle. */
    fun start(tpl: JSONObject): JSONObject {
        val exs = JSONArray()
        tpl.optJSONArray("exercises")?.objs()?.forEach { e ->
            val name = e.str("name")
            val last = lastFor(name)
            val lastW = last?.mapNotNull { num(it.opt("weight")) }?.maxOrNull()
            val weight: Any = lastW?.takeIf { it > 0 }?.let { fmt(it) } ?: (e.opt("weight")?.takeUnless { it == JSONObject.NULL } ?: "")
            val n = e.optInt("sets", 3).coerceAtLeast(1)
            val sets = JSONArray()
            repeat(n) { sets.put(JSONObject().put("reps", e.opt("reps") ?: "").put("weight", weight).put("done", false)) }
            exs.put(JSONObject().put("name", name).put("target", "${e.opt("sets")}×${e.opt("reps")}").put("note", "").put("sets", sets))
        }
        return JSONObject()
            .put("id", uid()).put("kind", "log").put("date", today()).put("tplId", tpl.str("id"))
            .put("name", tpl.str("name")).put("emoji", tpl.optString("emoji", "🏋️"))
            .put("startedAt", System.currentTimeMillis()).put("finishedAt", JSONObject.NULL)
            .put("done", false).put("note", "").put("exercises", exs)
    }

    /** Termine : retire les séries non faites, calcule les records de poids, enregistre et donne les points. */
    fun finish(log: JSONObject): JSONObject {
        val l = log.copy()
        val kept = JSONArray()
        val prs = JSONArray()
        l.optJSONArray("exercises")?.objs()?.forEach { e ->
            val done = e.optJSONArray("sets")?.objs()?.filter { it.optBoolean("done") } ?: emptyList()
            if (done.isEmpty()) return@forEach
            e.put("sets", JSONArray(done))
            kept.put(e)
            val best = done.filter { !it.optBoolean("warm") }.mapNotNull { num(it.opt("weight")) }.maxOrNull() ?: return@forEach
            val k = e.str("name").trim().lowercase()
            val before = logs().filter { it.optBoolean("done") && it.str("id") != l.str("id") }.flatMap { x ->
                x.optJSONArray("exercises")?.objs()?.filter { it.str("name").trim().lowercase() == k }?.flatMap { ex ->
                    ex.optJSONArray("sets")?.objs()?.filter { it.optBoolean("done") && !it.optBoolean("warm") } ?: emptyList()
                } ?: emptyList()
            }
            val prev = before.mapNotNull { num(it.opt("weight")) }.maxOrNull()
            if (prev != null && best > prev) prs.put(JSONObject().put("ex", e.str("name")).put("kind", "Poids max").put("v", best))
        }
        l.put("exercises", kept).put("done", true).put("finishedAt", System.currentTimeMillis()).put("prs", prs)
        Store.put("workouts", l.getString("id"), l)
        Xp.award("workout:" + l.getString("id"), Xp.WORKOUT, "Entraînement : " + l.str("name"))
        return l
    }

    fun doneToday(): JSONObject? = logs().firstOrNull { it.optBoolean("done") && it.str("date") == today() }
}

/* ---------- Séance en cours (gardée sur la montre jusqu'à la fin) ---------- */
object Session {
    private val prefs get() = App.ctx.getSharedPreferences("lp_session", 0)
    fun load(): JSONObject? = prefs.getString("log", null)?.let { runCatching { JSONObject(it) }.getOrNull() }
    fun save(l: JSONObject?) = prefs.edit().apply { if (l == null) remove("log") else putString("log", l.toString()) }.apply()
    var restEnd: Long
        get() = prefs.getLong("restEnd", 0)
        set(v) = prefs.edit().putLong("restEnd", v).apply()
}
