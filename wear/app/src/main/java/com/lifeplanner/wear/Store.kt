package com.lifeplanner.wear

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File

/**
 * Données de Life Planner sur la montre, synchronisées avec les mêmes fichiers Drive que le site
 * (lp-tasks.json, lp-habits.json…). Format : { app, store, records: { clé: { at, v } | { at, del: true } } }.
 * Même règle que le site : pour chaque élément, la modification la plus récente (« at ») gagne.
 * Les changements faits sur la montre attendent dans « pending » jusqu'à leur envoi réussi.
 */
object Store {
    val STORES = listOf("tasks", "habits", "workouts", "settings", "xp")

    private val lock = Any()
    private val cache = mutableMapOf<String, JSONObject>()              // type -> records (dernier état connu de Drive)
    private val files = mutableMapOf<String, Pair<String, String>>()    // type -> (id du fichier, modifiedTime)
    private var pending = JSONObject()                                  // type -> { clé: rec } en attente d'envoi
    private val mutex = Mutex()
    private var debounce: Job? = null

    /** Change à chaque modification : les écrans se redessinent. */
    val version = MutableStateFlow(0)
    val syncing = MutableStateFlow(false)
    val lastSync = MutableStateFlow(0L)
    val error = MutableStateFlow("")

    private val dir get() = App.ctx.filesDir

    fun load() {
        for (s in STORES) {
            val f = File(dir, "c-$s.json")
            if (!f.exists()) continue
            runCatching {
                val j = JSONObject(f.readText())
                cache[s] = j.optJSONObject("records") ?: JSONObject()
                if (j.has("id")) files[s] = j.getString("id") to j.optString("mod")
            }
        }
        runCatching { pending = JSONObject(File(dir, "pending.json").readText()) }
        lastSync.value = App.ctx.getSharedPreferences("lp_sync", 0).getLong("last", 0)
    }

    private fun saveCache(s: String) {
        val j = JSONObject().put("records", cache[s] ?: JSONObject())
        files[s]?.let { j.put("id", it.first).put("mod", it.second) }
        File(dir, "c-$s.json").writeText(j.toString())
    }

    private fun savePending() = File(dir, "pending.json").writeText(synchronized(lock) { pending.toString() })

    /** Enregistrement actuel d'un élément (le changement local le plus récent l'emporte). */
    private fun rec(s: String, key: String): JSONObject? = synchronized(lock) {
        val p = pending.optJSONObject(s)?.optJSONObject(key)
        val c = cache[s]?.optJSONObject(key)
        if (p != null && (c == null || p.optLong("at") > c.optLong("at"))) p else c
    }

    fun get(s: String, key: String): Any? {
        val r = rec(s, key) ?: return null
        if (r.optBoolean("del")) return null
        return r.opt("v")
    }

    fun obj(s: String, key: String): JSONObject? = get(s, key) as? JSONObject

    /** Tous les éléments d'un type (sans les supprimés). */
    fun all(s: String): List<Pair<String, Any>> {
        val keys = synchronized(lock) {
            val k = mutableSetOf<String>()
            cache[s]?.keys()?.forEach { k.add(it) }
            pending.optJSONObject(s)?.keys()?.forEach { k.add(it) }
            k
        }
        return keys.mapNotNull { k -> get(s, k)?.let { k to it } }
    }

    fun objects(s: String): List<JSONObject> = all(s).mapNotNull { it.second as? JSONObject }

    private fun stamp(s: String, key: String): Long {
        val prev = rec(s, key)?.optLong("at") ?: 0L
        return maxOf(System.currentTimeMillis(), prev + 1)
    }

    fun put(s: String, key: String, v: Any) = write(s, key, JSONObject().put("at", stamp(s, key)).put("v", v))
    fun del(s: String, key: String) = write(s, key, JSONObject().put("at", stamp(s, key)).put("del", true))

    private fun write(s: String, key: String, r: JSONObject) {
        synchronized(lock) {
            val p = pending.optJSONObject(s) ?: JSONObject().also { pending.put(s, it) }
            p.put(key, r)
        }
        savePending()
        version.value++
        syncSoon()
    }

    fun pendingCount(): Int = synchronized(lock) { STORES.sumOf { pending.optJSONObject(it)?.length() ?: 0 } }

    /** Synchronise quelques secondes après la dernière modification (plusieurs cases cochées = un envoi). */
    fun syncSoon(ms: Long = 2500) {
        debounce?.cancel()
        debounce = App.scope.launch { delay(ms); sync() }
    }

    /** Échange avec Google Drive. Renvoie null si tout va bien, sinon un message (ou « login »). */
    suspend fun sync(): String? = mutex.withLock {
        syncing.value = true
        val res = withContext(Dispatchers.IO) {
            try {
                val remote = Drive.list()
                for (s in STORES) syncStore(s, remote)
                App.ctx.getSharedPreferences("lp_sync", 0).edit().putLong("last", System.currentTimeMillis()).apply()
                null
            } catch (e: AuthException) {
                "login"
            } catch (e: Exception) {
                e.message ?: "Erreur de synchronisation"
            }
        }
        syncing.value = false
        error.value = res ?: ""
        if (res == null) lastSync.value = System.currentTimeMillis()
        version.value++
        res
    }

    private fun syncStore(s: String, remote: Map<String, Drive.FileInfo>) {
        val name = "lp-$s.json"
        val f = remote[name]
        val known = files[s]
        val snap = synchronized(lock) { pending.optJSONObject(s)?.let { JSONObject(it.toString()) } } ?: JSONObject()
        if (f == null && snap.length() == 0) return // rien sur Drive et rien à envoyer

        // Toujours relire Drive juste avant d'envoyer : on ne remplace jamais une modification plus récente
        val changed = f != null && (known == null || known.second != f.mod)
        var doc: JSONObject? = null
        val records = if (f != null && (changed || snap.length() > 0)) {
            doc = Drive.download(f.id)
            doc.optJSONObject("records") ?: JSONObject()
        } else cache[s] ?: JSONObject()

        var dirty = false
        for (key in snap.keys()) {
            val mine = snap.getJSONObject(key)
            val theirs = records.optJSONObject(key)
            if (theirs == null || mine.optLong("at") > theirs.optLong("at")) { records.put(key, mine); dirty = true }
        }

        var info = f?.let { it.id to it.mod }
        if (dirty || f == null) {
            val out = (doc ?: JSONObject().put("app", "lifeplanner").put("store", s)).put("records", records)
            val up = Drive.upload(name, f?.id, out)
            info = up.id to up.mod
        }
        synchronized(lock) {
            cache[s] = records
            if (info != null) files[s] = info
            // On retire de la file seulement ce qui a été envoyé (pas un changement fait pendant l'envoi)
            val p = pending.optJSONObject(s)
            if (p != null) {
                for (key in snap.keys()) if (p.optJSONObject(key)?.optLong("at") == snap.getJSONObject(key).optLong("at")) p.remove(key)
                if (p.length() == 0) pending.remove(s)
            }
        }
        saveCache(s)
        savePending()
    }

    /** Efface toutes les données de la montre (déconnexion). */
    fun clear() {
        synchronized(lock) { cache.clear(); files.clear(); pending = JSONObject() }
        dir.listFiles()?.filter { it.name.startsWith("c-") || it.name == "pending.json" }?.forEach { it.delete() }
        version.value++
    }
}
