package com.lifeplanner.wear

import org.json.JSONArray
import org.json.JSONObject

/** Routines d'étirements : mêmes poses et routines que l'onglet Étirements du site (stretch.js). */
object Stretch {
    class Pose(val name: String, val emoji: String, val zones: List<String>, val how: String, val sides: Boolean = false)
    class Step(val pose: Pose, val sec: Int, val side: String)
    class Routine(val id: String, val name: String, val emoji: String, val steps: List<Pair<String, Int>>) {
        fun expand(): List<Step> = steps.flatMap { (id, sec) ->
            val p = P[id] ?: return@flatMap emptyList()
            if (p.sides) listOf(Step(p, sec, "Côté gauche"), Step(p, sec, "Côté droit")) else listOf(Step(p, sec, ""))
        }
        val seconds get() = expand().sumOf { it.sec }
    }

    val P = mapOf(
        "respiration" to Pose("Respiration ventrale", "🌬️", emptyList(), "Inspire 4 s par le nez en gonflant le ventre, expire 6 s."),
        "chatvache" to Pose("Dos rond, dos creux", "🐈", listOf("dos", "cou"), "À quatre pattes : creuse le dos en inspirant, arrondis en expirant."),
        "enfant" to Pose("Posture de l’enfant", "🙇", listOf("dos", "hanches", "epaules"), "Fesses vers les talons, bras allongés devant, front au sol."),
        "chien" to Pose("Chien tête en bas", "🔺", listOf("jambes", "epaules", "dos"), "Bassin vers le plafond, pousse le sol, dos long."),
        "cobra" to Pose("Cobra doux", "🐍", listOf("dos"), "À plat ventre, soulève doucement la poitrine, bassin au sol."),
        "torsionCouche" to Pose("Torsion couchée", "🔄", listOf("dos", "hanches"), "Sur le dos, genou qui tombe de l’autre côté, bras en croix.", true),
        "genouxPoitrine" to Pose("Genoux à la poitrine", "🤗", listOf("dos", "hanches"), "Sur le dos, serre les genoux et berce-toi doucement."),
        "pigeon" to Pose("Pigeon", "🕊️", listOf("hanches"), "Tibia devant, jambe arrière allongée, penche-toi vers l’avant.", true),
        "quatre" to Pose("Figure 4 couchée", "4️⃣", listOf("hanches"), "Cheville sur le genou opposé, tire la cuisse vers toi.", true),
        "fenteBasse" to Pose("Fente basse", "🧎", listOf("hanches", "jambes"), "Genou au sol, avance le bassin en serrant la fesse.", true),
        "papillon" to Pose("Papillon", "🦋", listOf("hanches"), "Plantes des pieds collées, dos long, penche-toi un peu."),
        "grenouille" to Pose("Grenouille", "🐸", listOf("hanches"), "Genoux très écartés, recule doucement le bassin."),
        "squatProfond" to Pose("Squat profond tenu", "🪑", listOf("hanches", "jambes"), "Descends le plus bas possible, talons au sol."),
        "rotHanche9090" to Pose("Rotation de hanche 90/90", "📐", listOf("hanches"), "Jambes à 90°, bascule les genoux d’un côté à l’autre."),
        "ischioCouche" to Pose("Ischio-jambiers couché", "🦵", listOf("jambes"), "Jambe tendue vers le plafond, tiens l’arrière de la cuisse.", true),
        "pinceAssise" to Pose("Pince assise", "📏", listOf("jambes", "dos"), "Jambes tendues, penche-toi depuis les hanches, dos long."),
        "quadDebout" to Pose("Quadriceps debout", "🦩", listOf("jambes"), "Talon vers la fesse, genoux côte à côte.", true),
        "mollet" to Pose("Mollet au mur", "🧱", listOf("jambes"), "Jambe tendue derrière, talon au sol, penche-toi au mur.", true),
        "adducteurs" to Pose("Fente latérale", "↔️", listOf("jambes", "hanches"), "Pieds écartés, plie un genou, l’autre jambe tendue.", true),
        "ouvertureThoracique" to Pose("Ouverture du thorax", "📖", listOf("dos", "epaules"), "Sur le côté, ouvre le bras du dessus comme un livre.", true),
        "filAiguille" to Pose("Fil dans l’aiguille", "🪡", listOf("epaules", "dos"), "À quatre pattes, glisse un bras sous l’autre.", true),
        "pectoMur" to Pose("Pectoraux au mur", "🚪", listOf("epaules"), "Avant-bras au cadre de porte, avance doucement.", true),
        "bras" to Pose("Épaule croisée", "🤝", listOf("epaules"), "Bras tendu devant toi, tiens-le avec l’autre.", true),
        "triceps" to Pose("Triceps", "🙋", listOf("epaules"), "Main derrière la tête, tire doucement le coude.", true),
        "cercleEpaules" to Pose("Cercles d’épaules", "⭕", listOf("epaules", "cou"), "Grands cercles lents, vers l’arrière puis l’avant."),
        "couLateral" to Pose("Cou sur le côté", "🙆", listOf("cou"), "Oreille vers l’épaule, l’autre épaule descend.", true),
        "couAvant" to Pose("Menton à la poitrine", "🙇‍♂️", listOf("cou"), "Laisse la tête descendre vers la poitrine."),
        "poignets" to Pose("Poignets", "✋", listOf("poignets"), "Bras tendu, tire doucement les doigts vers toi.", true),
        "torsionAssise" to Pose("Torsion assise", "🌀", listOf("dos"), "Grandis-toi en inspirant, tourne en expirant.", true),
        "flexionLaterale" to Pose("Flexion latérale", "🌙", listOf("dos", "epaules"), "Bras au-dessus de la tête, penche-toi sur le côté.", true),
        "legsWall" to Pose("Jambes au mur", "🛌", listOf("jambes", "dos"), "Couché, jambes contre le mur, relâche tout."),
        "bebeHeureux" to Pose("Bébé heureux", "👶", listOf("hanches", "dos"), "Sur le dos, attrape tes pieds, berce-toi."),
        "balancierJambes" to Pose("Balancier de jambes", "🦿", listOf("hanches", "jambes"), "Tiens un appui, balance la jambe d’avant en arrière.", true),
        "rotationsBras" to Pose("Moulinets de bras", "🌀", listOf("epaules"), "Petits cercles qui grandissent, puis l’autre sens."),
        "cadavre" to Pose("Relâchement complet", "😌", emptyList(), "Couché, laisse le corps devenir lourd."),
    )

    val ROUTINES = listOf(
        Routine("reveil", "Réveil en douceur", "🌅", listOf("respiration" to 40, "chatvache" to 45, "enfant" to 40, "chien" to 40, "fenteBasse" to 35, "flexionLaterale" to 30, "cercleEpaules" to 30, "torsionAssise" to 30)),
        Routine("hanches", "Hanches libérées", "🦴", listOf("rotHanche9090" to 60, "fenteBasse" to 45, "pigeon" to 60, "papillon" to 50, "grenouille" to 45, "quatre" to 45, "squatProfond" to 45, "bebeHeureux" to 40)),
        Routine("dos", "Dos soulagé", "🧍", listOf("genouxPoitrine" to 40, "chatvache" to 50, "enfant" to 45, "cobra" to 30, "torsionCouche" to 40, "ouvertureThoracique" to 35, "filAiguille" to 35, "quatre" to 35)),
        Routine("epaules", "Épaules et cou", "🙆", listOf("cercleEpaules" to 30, "couLateral" to 30, "couAvant" to 30, "bras" to 30, "triceps" to 30, "pectoMur" to 35, "filAiguille" to 35, "poignets" to 25)),
        Routine("apres-course", "Après la course", "🏃", listOf("mollet" to 40, "quadDebout" to 35, "ischioCouche" to 40, "fenteBasse" to 35, "quatre" to 35, "adducteurs" to 30, "legsWall" to 60)),
        Routine("apres-haut", "Après le haut du corps", "💪", listOf("pectoMur" to 40, "bras" to 35, "triceps" to 35, "filAiguille" to 35, "ouvertureThoracique" to 35, "enfant" to 45, "poignets" to 25)),
        Routine("apres-bas", "Après le bas du corps", "🦵", listOf("quadDebout" to 40, "ischioCouche" to 45, "pigeon" to 50, "adducteurs" to 35, "mollet" to 35, "papillon" to 40, "genouxPoitrine" to 40)),
        Routine("dodo", "Avant de dormir", "🌙", listOf("respiration" to 60, "enfant" to 60, "torsionCouche" to 50, "quatre" to 45, "bebeHeureux" to 45, "legsWall" to 90, "cadavre" to 90)),
        Routine("bureau", "Pause bureau", "💻", listOf("cercleEpaules" to 30, "couLateral" to 25, "torsionAssise" to 25, "flexionLaterale" to 25, "poignets" to 20, "quadDebout" to 25, "mollet" to 25)),
        Routine("ischios", "Ischios et mollets", "🦿", listOf("balancierJambes" to 30, "ischioCouche" to 50, "pinceAssise" to 60, "chien" to 45, "mollet" to 40, "legsWall" to 60)),
        Routine("complete", "Mobilité complète", "🧘", listOf("respiration" to 40, "cercleEpaules" to 30, "couLateral" to 30, "rotationsBras" to 30, "chatvache" to 45, "filAiguille" to 35, "ouvertureThoracique" to 35, "rotHanche9090" to 60,
            "fenteBasse" to 40, "pigeon" to 50, "papillon" to 45, "ischioCouche" to 40, "quadDebout" to 35, "mollet" to 35, "torsionCouche" to 40, "cadavre" to 60)),
    )

    /** Routine suggérée selon la séance du jour, sinon selon l'heure (comme sur le site). */
    fun suggestion(): Routine {
        val f = Workout.doneToday() ?: Workout.plannedToday()
        val txt = f?.let { (it.str("name") + " " + (it.optJSONArray("exercises")?.objs()?.joinToString(" ") { e -> e.str("name") } ?: "")).lowercase() } ?: ""
        val h = java.time.LocalTime.now().hour
        val id = when {
            Regex("course|vélo|velo|cardio|rameur|corde").containsMatchIn(txt) -> "apres-course"
            Regex("bas du corps|jambe|squat|fente|soulevé|hip thrust|mollet").containsMatchIn(txt) -> "apres-bas"
            Regex("haut du corps|développé|developpe|traction|rowing|curl|épaule|pector|push|pull").containsMatchIn(txt) -> "apres-haut"
            h < 11 -> "reveil"
            h >= 20 -> "dodo"
            else -> "bureau"
        }
        return ROUTINES.first { it.id == id }
    }

    /** Enregistre la routine faite (même forme que le site) et donne les points. */
    fun record(r: Routine, started: Long, seconds: Int, stepsDone: List<Step>) {
        if (seconds < 20) return
        val id = uid()
        val zones = JSONArray(stepsDone.flatMap { it.pose.zones }.distinct())
        Store.put("workouts", id, JSONObject().put("id", id).put("kind", "stretch").put("date", today()).put("routineId", r.id)
            .put("name", r.name).put("emoji", r.emoji).put("startedAt", started).put("seconds", seconds).put("zones", zones))
        Xp.award("stretch:$id", Xp.STRETCH, "Étirements : " + r.name)
    }
}
