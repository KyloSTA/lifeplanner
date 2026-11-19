package com.lifeplanner.wear

import android.content.Context
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.AutoCenteringParams
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.ScalingLazyListScope
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.Colors
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.PositionIndicator
import androidx.wear.compose.material.Scaffold
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.TimeText
import androidx.wear.compose.navigation.SwipeDismissableNavHost
import androidx.wear.compose.navigation.composable
import androidx.wear.compose.navigation.rememberSwipeDismissableNavController

/** Couleurs de Life Planner : noir, or et bordeaux. */
object C {
    val gold = Color(0xFFC9A24A)
    val goldText = Color(0xFFE6CC8A)
    val burgundy = Color(0xFF7A1E2C)
    val surface = Color(0xFF1F1A1B)
    val ok = Color(0xFF2F8A5B)
    val muted = Color(0xFFA89E98)
    val text = Color(0xFFF2EDE6)
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme(colors = Colors(primary = C.gold, primaryVariant = C.goldText, secondary = C.burgundy, surface = C.surface, onPrimary = Color.Black, onSecondary = Color.White, onSurface = C.text, onBackground = C.text)) {
                val nav = rememberSwipeDismissableNavController()
                SwipeDismissableNavHost(navController = nav, startDestination = if (Auth.signedIn) "home" else "login") {
                    composable("login") { LoginScreen(onDone = { nav.navigate("home") { popUpTo("login") { inclusive = true } } }) }
                    composable("home") { HomeScreen(go = { nav.navigate(it) }, onSignedOut = { nav.navigate("login") { popUpTo("home") { inclusive = true } } }) }
                    composable("missions") { MissionsScreen() }
                    composable("habits") { HabitsScreen() }
                    composable("workout") { WorkoutScreen(go = { nav.navigate(it) }) }
                    composable("session") { SessionScreen(onEnd = { nav.navigate("summary") { popUpTo("home") } }, onCancel = { nav.popBackStack("home", false) }) }
                    composable("summary") { SummaryScreen(onClose = { nav.popBackStack("home", false) }) }
                    composable("stretch") { StretchScreen(go = { nav.navigate(it) }) }
                    composable("player/{id}") { e -> PlayerScreen(e.arguments?.getString("id") ?: "", onClose = { nav.popBackStack() }) }
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        if (Auth.signedIn) Store.syncSoon(300) // à chaque ouverture : on récupère les changements du site
    }
}

/* ---------- Petits outils d'interface ---------- */

/** Écran en liste défilante (ronde) avec l'heure en haut et l'indicateur de défilement. */
@Composable
fun ListScreen(content: ScalingLazyListScope.() -> Unit) {
    val state = rememberScalingLazyListState()
    Scaffold(timeText = { TimeText() }, positionIndicator = { PositionIndicator(scalingLazyListState = state) }) {
        ScalingLazyColumn(
            modifier = Modifier.fillMaxSize(),
            state = state,
            autoCentering = AutoCenteringParams(itemIndex = 0),
            content = content,
        )
    }
}

@Composable
fun Title(text: String, sub: String = "") {
    androidx.compose.foundation.layout.Column(Modifier.fillMaxWidth().padding(bottom = 4.dp), horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally) {
        Text(text, color = C.gold, fontWeight = FontWeight.Bold, fontSize = 16.sp, textAlign = TextAlign.Center)
        if (sub.isNotEmpty()) Text(sub, color = C.muted, fontSize = 12.sp, textAlign = TextAlign.Center)
    }
}

@Composable
fun Note(text: String, color: Color = C.muted) {
    Text(text, color = color, fontSize = 12.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp))
}

/** Garde l'écran allumé tant que cet écran est affiché (séance, routine). */
@Composable
fun KeepScreenOn() {
    val view = LocalView.current
    DisposableEffect(Unit) {
        view.keepScreenOn = true
        onDispose { view.keepScreenOn = false }
    }
}

/** Vibration : court = série cochée, long = fin du repos ou pose suivante. */
object Buzz {
    private fun vibrator(): Vibrator = if (Build.VERSION.SDK_INT >= 31)
        (App.ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
    else @Suppress("DEPRECATION") (App.ctx.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator)

    private fun play(vararg ms: Long) = runCatching { vibrator().vibrate(VibrationEffect.createWaveform(longArrayOf(0, *ms), -1)) }
    fun tick() = play(40)
    fun step() = play(180)
    fun alarm() = play(350, 150, 350, 150, 350)
}

fun clock(sec: Long): String = "%d:%02d".format(sec.coerceAtLeast(0) / 60, sec.coerceAtLeast(0) % 60)
