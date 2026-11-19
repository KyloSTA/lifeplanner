package com.lifeplanner.wear

import android.app.Application
import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/** Point d'entrée : contexte et portée des tâches de fond de l'app. */
class LpApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        App.ctx = this
        if (Auth.importLink()) Store.clear() // nouvelle liaison : on repart des données de Drive
        Store.load()
    }
}

object App {
    lateinit var ctx: Context
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
}

class HttpResult(val code: Int, val body: String) {
    fun json(): JSONObject = runCatching { JSONObject(body) }.getOrElse { JSONObject() }
    val ok get() = code in 200..299
}

object Http {
    fun request(url: String, method: String = "GET", headers: Map<String, String> = emptyMap(), body: ByteArray? = null): HttpResult {
        val c = URL(url).openConnection() as HttpURLConnection
        // HttpURLConnection ne connaît pas PATCH : les API Google acceptent POST + X-HTTP-Method-Override
        if (method == "PATCH") {
            c.requestMethod = "POST"
            c.setRequestProperty("X-HTTP-Method-Override", "PATCH")
        } else c.requestMethod = method
        c.connectTimeout = 15_000
        c.readTimeout = 30_000
        headers.forEach { (k, v) -> c.setRequestProperty(k, v) }
        if (body != null) {
            c.doOutput = true
            c.outputStream.use { it.write(body) }
        }
        val code = c.responseCode
        val text = (if (code in 200..299) c.inputStream else c.errorStream)?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
        c.disconnect()
        return HttpResult(code, text)
    }

    fun form(url: String, params: Map<String, String>): HttpResult {
        val body = params.entries.joinToString("&") { "${it.key}=${URLEncoder.encode(it.value, "UTF-8")}" }
        return request(url, "POST", mapOf("Content-Type" to "application/x-www-form-urlencoded"), body.toByteArray())
    }
}

/**
 * Connexion Google de la montre : une autorisation durable créée par Life Planner sur le PC
 * (Réglages › Google Agenda › « ⌚ Lier ma montre »), limitée au dossier de synchro dans Drive (drive.appdata).
 * Le fichier de liaison (link.json) est copié une fois dans les fichiers de l'app, importé puis effacé.
 */
object Auth {
    private const val TOKEN_URL = "https://oauth2.googleapis.com/token"
    private val prefs get() = App.ctx.getSharedPreferences("lp_auth", Context.MODE_PRIVATE)

    val signedIn get() = prefs.getString("refresh", null) != null

    /** Importe le fichier de liaison s'il est là. true = une nouvelle liaison a été importée. */
    fun importLink(): Boolean {
        val f = java.io.File(App.ctx.filesDir, "link.json")
        if (!f.exists()) return false
        val ok = runCatching {
            val j = JSONObject(f.readText())
            val cid = j.getString("clientId"); val secret = j.getString("clientSecret"); val refresh = j.getString("refresh")
            prefs.edit().clear().putString("cid", cid).putString("secret", secret).putString("refresh", refresh).apply()
        }.isSuccess
        f.delete() // le fichier ne sert qu'une fois
        return ok
    }

    private fun keep(j: JSONObject) {
        val e = prefs.edit()
            .putString("access", j.getString("access_token"))
            .putLong("exp", System.currentTimeMillis() + (j.optLong("expires_in", 3600) - 60) * 1000)
        if (j.has("refresh_token")) e.putString("refresh", j.getString("refresh_token"))
        e.apply()
    }

    /** Jeton d'accès valide (renouvelé en silence), ou null s'il faut se reconnecter. */
    fun token(): String? {
        val p = prefs
        val access = p.getString("access", null)
        if (access != null && p.getLong("exp", 0) > System.currentTimeMillis()) return access
        val refresh = p.getString("refresh", null) ?: return null
        val r = Http.form(TOKEN_URL, mapOf(
            "client_id" to (p.getString("cid", null) ?: return null), "client_secret" to (p.getString("secret", null) ?: return null),
            "refresh_token" to refresh, "grant_type" to "refresh_token",
        ))
        val j = r.json()
        if (r.ok) { keep(j); return j.getString("access_token") }
        if (r.code in 400..499 && j.has("error")) signOut() // révoqué ou expiré : il faudra se reconnecter
        return null
    }

    fun forgetAccess() = prefs.edit().remove("access").apply()
    fun signOut() = prefs.edit().clear().apply()
}

class AuthException : Exception("login")

/** Dossier privé de l'app dans Google Drive (appDataFolder) : les fichiers de synchro lp-<type>.json. */
object Drive {
    private const val API = "https://www.googleapis.com/drive/v3"
    private const val UPLOAD = "https://www.googleapis.com/upload/drive/v3"

    class FileInfo(val id: String, val mod: String)

    private fun call(url: String, method: String = "GET", headers: Map<String, String> = emptyMap(), body: ByteArray? = null): HttpResult {
        val t = Auth.token() ?: throw AuthException()
        val r = Http.request(url, method, headers + ("Authorization" to "Bearer $t"), body)
        if (r.code == 401) { Auth.forgetAccess(); throw AuthException() }
        if (!r.ok) throw Exception("Google Drive : " + r.json().optJSONObject("error")?.optString("message", "erreur ${r.code}"))
        return r
    }

    fun list(): Map<String, FileInfo> {
        val q = URLEncoder.encode("name contains 'lp-' and not name contains 'lp-blob-'", "UTF-8")
        val j = call("$API/files?spaces=appDataFolder&q=$q&fields=files(id,name,modifiedTime)&pageSize=100").json()
        val arr = j.optJSONArray("files") ?: return emptyMap()
        return (0 until arr.length()).associate { i ->
            val f = arr.getJSONObject(i)
            f.getString("name") to FileInfo(f.getString("id"), f.optString("modifiedTime"))
        }
    }

    fun download(id: String): JSONObject = call("$API/files/$id?alt=media").json()

    fun upload(name: String, id: String?, data: JSONObject): FileInfo {
        val body = data.toString().toByteArray(Charsets.UTF_8)
        val r = if (id != null) {
            call("$UPLOAD/files/$id?uploadType=media&fields=id,modifiedTime", "PATCH", mapOf("Content-Type" to "application/json"), body)
        } else {
            val b = "lpw" + System.nanoTime()
            val meta = JSONObject().put("name", name).put("parents", org.json.JSONArray().put("appDataFolder")).put("mimeType", "application/json")
            val multipart = "--$b\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n$meta\r\n--$b\r\nContent-Type: application/json\r\n\r\n".toByteArray() + body + "\r\n--$b--".toByteArray()
            call("$UPLOAD/files?uploadType=multipart&fields=id,modifiedTime", "POST", mapOf("Content-Type" to "multipart/related; boundary=$b"), multipart)
        }
        val j = r.json()
        return FileInfo(j.getString("id"), j.optString("modifiedTime"))
    }
}
