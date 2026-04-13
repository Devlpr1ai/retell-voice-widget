#!/usr/bin/env node

/**
 * deploy-solar-b2c.js
 *
 * Deploys a B2C Solar/PV lead-qualification conversation flow to Retell AI.
 * Converted from the B2B "ki-skript-solar-b2b-v2" script:
 *   - Sie → Du
 *   - Gatekeeper phase → simple identity check (Vorprüfung)
 *   - B2B qualifications → B2C: Eigenheim, Hauseigentümer, eigenes Haus
 *   - All phases, sub-paths, and objection handling included
 *
 * Usage:
 *   RETELL_API_KEY=... node deploy-solar-b2c.js
 */

const Retell = require("retell-sdk").default;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const RETELL_API_KEY = process.env.RETELL_API_KEY;
if (!RETELL_API_KEY) {
  console.error("Error: RETELL_API_KEY environment variable is required.");
  process.exit(1);
}

const client = new Retell({ apiKey: RETELL_API_KEY });

// ---------------------------------------------------------------------------
// Dynamic variables (defaults – overridden per call via API)
// ---------------------------------------------------------------------------
const DEFAULT_DYNAMIC_VARIABLES = {
  AGENT_NAME: "Daniela",
  FIRMENNAME: "SolarExperts",
  KUNDENNAME: "",
  LEAD_QUELLE: "Website",
  KALENDER_LINK: "",
  BERATER_NAME: "",
};

// ---------------------------------------------------------------------------
// Global Prompt
// ---------------------------------------------------------------------------
const GLOBAL_PROMPT = `Du bist {{AGENT_NAME}}, ein Mitarbeiter von {{FIRMENNAME}} im Bereich Energieberatung.
Du rufst Privatpersonen an, die sich irgendwann für Photovoltaik interessiert haben.
Dein Ziel: Qualifizierung und Termin für ein Beratungsgespräch vereinbaren.

WICHTIGE REGELN:
- Antworte IMMER auf Deutsch.
- Kurze Sätze, maximal 15 Wörter pro Satz.
- Kein Call-Center-Ton. Du klingst wie ein kompetenter Berater, nicht wie ein Verkäufer.
- Verwende natürliche Füllwörter: "genau", "alles klar", "verstehe", "absolut".
- Sprich in der Du-Form.
- Du stellst kluge Fragen statt Monologe zu halten.
- Mach Pausen nach wichtigen Fragen.

Was du NICHT tust:
- Du nennst KEINEN konkreten Preis.
- Du machst KEINE technische Detailberatung am Telefon.
- Du drängst nicht.
- Du sprichst nicht schlecht über Wettbewerber.
- Du übertreibst nicht mit Versprechen.
- Bei maximal 2x demselben Einwand: "Ich verstehe. Soll ich dir einfach die Unterlagen und den Buchungslink per Mail schicken? Dann entscheidest du in Ruhe."`;

// ---------------------------------------------------------------------------
// Node definitions
// ---------------------------------------------------------------------------

function buildNodes() {
  return [
    // =====================================================================
    // PHASE 0: VORPRÜFUNG
    // =====================================================================
    {
      id: "vorpruefung",
      type: "conversation",
      instruction: {
        type: "static_text",
        text: "Hallo, hier ist {{AGENT_NAME}} von {{FIRMENNAME}}. Ich spreche doch mit {{KUNDENNAME}}, richtig?",
      },
      edges: [
        {
          id: "vorpruefung_to_opening",
          destination_node_id: "opening",
          transition_condition: {
            type: "prompt",
            prompt: "Der Anrufer bestätigt, dass er die richtige Person ist.",
          },
        },
        {
          id: "vorpruefung_to_end_wrong",
          destination_node_id: "end_wrong_person",
          transition_condition: {
            type: "prompt",
            prompt: "Es ist die falsche Person, oder der Anrufer sagt, dass {{KUNDENNAME}} nicht erreichbar ist.",
          },
        },
      ],
    },

    // =====================================================================
    // PHASE 1: OPENING
    // =====================================================================
    {
      id: "opening",
      type: "conversation",
      instruction: {
        type: "static_text",
        text: "Hey {{KUNDENNAME}}, hier ist {{AGENT_NAME}} von {{FIRMENNAME}}. Ich ruf kurz an, weil du dich vor einer Weile bei uns gemeldet hattest. Ich glaube, es ging um das Thema Photovoltaik fürs Eigenheim. Ich bin ehrlich gesagt nicht sicher, ob das Thema für dich aktuell noch relevant ist. Deswegen wollt ich einfach mal kurz nachhaken. Passt es gerade für zwei Minuten?",
      },
      edges: [
        {
          id: "opening_to_intentions",
          destination_node_id: "intentions",
          transition_condition: {
            type: "prompt",
            prompt: "Der Anrufer sagt ja, hat Zeit, oder signalisiert Bereitschaft zum Gespräch.",
          },
        },
        {
          id: "opening_to_callback",
          destination_node_id: "callback",
          transition_condition: {
            type: "prompt",
            prompt: "Der Anrufer hat gerade keine Zeit, ist beschäftigt, oder bittet um einen späteren Anruf.",
          },
        },
        {
          id: "opening_to_reaktivierung",
          destination_node_id: "reaktivierung",
          transition_condition: {
            type: "prompt",
            prompt: "Der Anrufer sagt kein Interesse, braucht das nicht, oder lehnt ab.",
          },
        },
        {
          id: "opening_to_datenschutz",
          destination_node_id: "datenschutz",
          transition_condition: {
            type: "prompt",
            prompt: "Der Anrufer fragt woher wir seine Daten haben, oder äußert Datenschutz-Bedenken.",
          },
        },
      ],
    },

    // =====================================================================
    // CALLBACK-PFAD
    // =====================================================================
    {
      id: "callback",
      type: "conversation",
      instruction: {
        type: "prompt",
        text: "Sage: 'Kein Problem. Wann passt es dir besser? Ich ruf gerne nochmal an.' Erfasse den gewünschten Zeitpunkt. Bestätige dann: 'Alles klar, ich melde mich dann bei dir. Bis dann!'",
      },
      edges: [
        {
          id: "callback_to_end",
          destination_node_id: "end_call",
          transition_condition: {
            type: "prompt",
            prompt: "Der Anrufer hat einen Zeitpunkt genannt oder sich verabschiedet.",
          },
        },
      ],
    },

    // =====================================================================
    // REAKTIVIERUNGS-PFAD
    // =====================================================================
    {
      id: "reaktivierung",
      type: "conversation",
      instruction: {
        type: "static_text",
        text: "Alles klar. Kurze Frage: Hast du das Thema PV mittlerweile mit einem anderen Anbieter umgesetzt? Oder ist es einfach nach hinten gerutscht?",
      },
      edges: [
        {
          id: "reaktivierung_to_satisfied",
          destination_node_id: "end_satisfied",
          transition_condition: {
            type: "prompt",
            prompt: "Der Anrufer hat PV bereits umgesetzt und ist zufrieden damit.",
          },
        },
        {
          id: "reaktivierung_to_unsatisfied",
          destination_node_id: "intentions",
          transition_condition: {
            type: "prompt",
            prompt: "Der Anrufer hat PV umgesetzt, ist aber unzufrieden oder hat Probleme.",
          },
        },
        {
          id: "reaktivierung_to_untergegangen",
          destination_node_id: "reaktivierung_untergegangen",
          transition_condition: {
            type: "prompt",
            prompt: "Das Thema ist untergegangen, nach hinten gerutscht, oder der Anrufer hatte keine Zeit dafür.",
          },
        },
      ],
    },
    {
      id: "reaktivierung_untergegangen",
      type: "conversation",
      instruction: {
        type: "static_text",
        text: "Ja, das geht vielen so. Gerade weil sich die Rahmenbedingungen stark verändert haben, lohnt sich ein frischer Blick. Darf ich dir zwei kurze Fragen stellen?",
      },
      edges: [
        {
          id: "untergegangen_to_intentions",
          destination_node_id: "intentions",
          transition_condition: {
            type: "prompt",
            prompt: "Der Anrufer stimmt zu oder signalisiert Bereitschaft.",
          },
        },
        {
          id: "untergegangen_to_end",
          destination_node_id: "end_polite",
          transition_condition: {
            type: "prompt",
            prompt: "Der Anrufer lehnt ab oder will nicht weiter sprechen.",
          },
        },
      ],
    },

    // =====================================================================
    // DATENSCHUTZ-PFAD
    // =====================================================================
    {
      id: "datenschutz",
      type: "conversation",
      instruction: {
        type: "static_text",
        text: "Gute Frage. Du hast dich vor einer Weile selbst bei uns gemeldet. Ich glaube über {{LEAD_QUELLE}}. Wir gehen da gerade nochmal die offenen Anfragen durch. Alles in Ordnung?",
      },
      edges: [
        {
          id: "datenschutz_to_intentions",
          destination_node_id: "intentions",
          transition_condition: {
            type: "prompt",
            prompt: "Der Anrufer akzeptiert die Erklärung, sagt okay, oder hat keine weiteren Bedenken.",
          },
        },
        {
          id: "datenschutz_to_delete",
          destination_node_id: "end_delete",
          transition_condition: {
            type: "prompt",
            prompt: "Der Anrufer ist nicht einverstanden, will gelöscht werden, oder beschwert sich über die Datennutzung.",
          },
        },
      ],
    },

    // =====================================================================
    // PHASE 2: INTENTIONS
    // =====================================================================
    {
      id: "intentions",
      type: "conversation",
      instruction: {
        type: "static_text",
        text: "Okay. Die meisten Eigenheimbesitzer melden sich bei uns aus einem von drei Gründen. Entweder die Stromkosten sind einfach zu hoch geworden. Oder es geht um Unabhängigkeit vom Strommarkt. Oder man will einfach was fürs Klima tun und gleichzeitig sparen. Was trifft bei dir am ehesten zu?",
      },
      edges: [
        {
          id: "intentions_to_vertiefen",
          destination_node_id: "intentions_vertiefen",
          transition_condition: {
            type: "prompt",
            prompt: "Der Anrufer gibt eine inhaltliche Antwort, nennt einen der drei Gründe, oder beschreibt seine Motivation.",
          },
        },
        {
          id: "intentions_to_re_engagement",
          destination_node_id: "re_engagement",
          transition_condition: {
            type: "prompt",
            prompt: "Der Anrufer ist abweisend, gibt keine klare Antwort, oder zeigt wenig Engagement.",
          },
        },
      ],
    },
    {
      id: "intentions_vertiefen",
      type: "conversation",
      instruction: {
        type: "prompt",
        text: "Vertiefe die Antwort des Anrufers mit einer Folgefrage. Mögliche Fragen: 'Was erhoffst du dir konkret? Was wäre das ideale Ergebnis?' oder 'Warum ist das Thema gerade jetzt wieder aktuell?' Halte deine Antwort kurz, maximal 2 Sätze. Reagiere empathisch auf das Gesagte.",
      },
      edges: [
        {
          id: "vertiefen_to_gap",
          destination_node_id: "gap",
          transition_condition: {
            type: "prompt",
            prompt: "Der Anrufer hat seine Motivation erklärt oder auf die Vertiefungsfrage geantwortet.",
          },
        },
      ],
    },

    // =====================================================================
    // RE-ENGAGEMENT-PFAD
    // =====================================================================
    {
      id: "re_engagement",
      type: "conversation",
      instruction: {
        type: "static_text",
        text: "Ich merk, ich hab dich vielleicht kalt erwischt. Lass mich einfach ganz direkt fragen: Wenn du deine Stromkosten um 30 bis 40 Prozent senken könntest. Wäre das relevant für dich?",
      },
      edges: [
        {
          id: "re_engagement_to_gap",
          destination_node_id: "gap",
          transition_condition: {
            type: "prompt",
            prompt: "Der Anrufer zeigt Interesse, sagt ja, oder will mehr wissen.",
          },
        },
        {
          id: "re_engagement_to_end",
          destination_node_id: "end_cold",
          transition_condition: {
            type: "prompt",
            prompt: "Der Anrufer sagt klar nein, hat kein Interesse, oder lehnt ab.",
          },
        },
      ],
    },

    // =====================================================================
    // PHASE 3: GAP (Ist-Zustand + Qualifizierung B2C)
    // =====================================================================
    {
      id: "gap",
      type: "conversation",
      instruction: {
        type: "prompt",
        text: `Qualifiziere den Anrufer im natürlichen Gesprächsfluss. NICHT als Checkliste, sondern organisch.

Beginne mit: "Verstehe. Und was hast du bisher in Richtung Energieoptimierung gemacht? Gibt es schon eine PV-Anlage auf dem Dach, oder ist das Neuland?"

Stelle dann folgende Fragen im Gespräch:
- "Ist das ein eigenes Haus oder zur Miete?" (WICHTIG: Bei Miete ohne Vermieter-Zustimmung → disqualifizieren)
- "Wie groß ist die Dachfläche ungefähr?"
- "Weißt du grob, wie hoch dein jährlicher Stromverbrauch ist?"
- "Was zahlst du aktuell ungefähr pro Jahr an Strom? Und wie hat sich das entwickelt?"
- "Hast du schon mal Angebote eingeholt?"

Vertiefe das Problem mit 1-2 Fragen:
- "Was bedeutet das für dein Haushaltsbudget?"
- "Und wenn sich das in den nächsten 12 Monaten so weiterentwickelt?"

Disqualifiziere höflich wenn: Mieter ohne Vermieter-Zustimmung, Stromverbrauch unter 3000 kWh.`,
      },
      edges: [
        {
          id: "gap_to_qualifizierung",
          destination_node_id: "qualifizierung",
          transition_condition: {
            type: "prompt",
            prompt: "Der Anrufer ist Hauseigentümer mit relevantem Stromverbrauch. Die wichtigsten Qualifizierungsfragen sind beantwortet.",
          },
        },
        {
          id: "gap_to_disqualified",
          destination_node_id: "end_disqualified",
          transition_condition: {
            type: "prompt",
            prompt: "Der Anrufer ist Mieter ohne Vermieter-Zustimmung, hat sehr geringen Stromverbrauch unter 3000 kWh, oder hat bereits PV und ist zufrieden.",
          },
        },
      ],
    },

    // =====================================================================
    // PHASE 4: QUALIFIZIERUNG & ENTSCHEIDER (B2C)
    // =====================================================================
    {
      id: "qualifizierung",
      type: "conversation",
      instruction: {
        type: "prompt",
        text: `Frage nach der Entscheidungssituation und Investitionsbereitschaft.

Sage: "Okay. Mal angenommen, die Zahlen stimmen und eine PV-Anlage rechnet sich bei dir. Entscheidest du das allein, oder muss da noch jemand mit ins Boot? Partner, Partnerin?"

Bei "muss Partner fragen": "Verstehe. Wäre es möglich, dass dein Partner beim Gespräch dabei ist? Dann sparen wir uns eine Runde."

Dann frage: "Und mal ganz offen: Wenn die Wirtschaftlichkeitsrechnung stimmt, also Amortisation in fünf bis sieben Jahren, ist das grundsätzlich etwas, wo du sagst: Da investiere ich?"

Erwähne sachlich: "Ich sag dir auch ehrlich: Die Förderlandschaft ändert sich gerade laufend. Was heute noch verfügbar ist, kann nächstes Quartal anders aussehen. Genau deswegen macht es Sinn, das zeitnah mal durchzurechnen."`,
      },
      edges: [
        {
          id: "qualifizierung_to_terminpitch",
          destination_node_id: "terminpitch",
          transition_condition: {
            type: "prompt",
            prompt: "Der Anrufer ist grundsätzlich investitionsbereit, oder sagt es kommt auf die Zahlen an.",
          },
        },
        {
          id: "qualifizierung_to_end",
          destination_node_id: "end_cold",
          transition_condition: {
            type: "prompt",
            prompt: "Der Anrufer lehnt klar ab, will nicht investieren, oder hat definitiv kein Budget.",
          },
        },
      ],
    },

    // =====================================================================
    // PHASE 5: TERMINPITCH
    // =====================================================================
    {
      id: "terminpitch",
      type: "conversation",
      instruction: {
        type: "static_text",
        text: "Gut. Basierend auf dem, was du mir erzählt hast, sehe ich da echtes Potenzial. Was ich dir vorschlagen würde: Lass uns einen kurzen Termin machen mit unserem Fachberater. Der schaut sich deine Situation konkret an. Verbrauch, Dachfläche, Fördermöglichkeiten. Und zeigt dir, was bei dir realistisch drin ist. Das dauert 20 bis 30 Minuten und ist komplett unverbindlich. Wie klingt das?",
      },
      edges: [
        {
          id: "terminpitch_to_buchung",
          destination_node_id: "termin_buchung",
          transition_condition: {
            type: "prompt",
            prompt: "Der Anrufer stimmt zu, will einen Termin, oder fragt nach verfügbaren Zeiten.",
          },
        },
        {
          id: "terminpitch_to_social_proof",
          destination_node_id: "social_proof",
          transition_condition: {
            type: "prompt",
            prompt: "Der Anrufer ist unsicher, zögert, will sich das überlegen, oder braucht mehr Überzeugung.",
          },
        },
        {
          id: "terminpitch_to_einwand_prioritaeten",
          destination_node_id: "einwand_prioritaeten",
          transition_condition: {
            type: "prompt",
            prompt: "Der Anrufer sagt er hat andere Prioritäten, gerade nicht der richtige Zeitpunkt, oder ist zu beschäftigt.",
          },
        },
        {
          id: "terminpitch_to_einwand_angebote",
          destination_node_id: "einwand_angebote",
          transition_condition: {
            type: "prompt",
            prompt: "Der Anrufer sagt er hat schon Angebote eingeholt oder vergleicht bereits.",
          },
        },
        {
          id: "terminpitch_to_einwand_rechnet_nicht",
          destination_node_id: "einwand_rechnet_nicht",
          transition_condition: {
            type: "prompt",
            prompt: "Der Anrufer sagt PV rechnet sich nicht, ist zu teuer, oder lohnt sich nicht.",
          },
        },
        {
          id: "terminpitch_to_einwand_unterlagen",
          destination_node_id: "einwand_unterlagen",
          transition_condition: {
            type: "prompt",
            prompt: "Der Anrufer will erstmal Unterlagen, Infomaterial, oder etwas zum Lesen.",
          },
        },
        {
          id: "terminpitch_to_einwand_intern",
          destination_node_id: "einwand_intern",
          transition_condition: {
            type: "prompt",
            prompt: "Der Anrufer muss das mit dem Partner besprechen, intern abstimmen, oder kann nicht allein entscheiden.",
          },
        },
        {
          id: "terminpitch_to_einwand_meld_mich",
          destination_node_id: "einwand_meld_mich",
          transition_condition: {
            type: "prompt",
            prompt: "Der Anrufer sagt er meldet sich, ruft zurück, oder will selbst Kontakt aufnehmen.",
          },
        },
      ],
    },

    // =====================================================================
    // TERMIN-BUCHUNG
    // =====================================================================
    {
      id: "termin_buchung",
      type: "conversation",
      instruction: {
        type: "prompt",
        text: `Erfasse den Terminwunsch des Anrufers.

Sage: "Sehr gut. Passt dir eher Anfang oder Ende der Woche? Und vormittags oder nachmittags?"

Nach der Antwort bestätige: "Perfekt, ich trage dich ein. Du bekommst gleich eine Bestätigung per Mail. Und vielen Dank für das offene Gespräch. Wir melden uns nochmal kurz vor dem Termin. Bis dahin!"`,
      },
      edges: [
        {
          id: "buchung_to_end",
          destination_node_id: "end_call",
          transition_condition: {
            type: "prompt",
            prompt: "Der Termin ist bestätigt und der Anrufer wurde verabschiedet.",
          },
        },
      ],
    },

    // =====================================================================
    // SOCIAL-PROOF-PFAD
    // =====================================================================
    {
      id: "social_proof",
      type: "conversation",
      instruction: {
        type: "static_text",
        text: "Verstehe ich. Ich schicke dir gerne vorab eine kurze Case Study. Ein Haushalt, ähnliche Größe wie deiner. Die zeigt dir, welche Einsparungen da konkret erzielt wurden. Und dann entscheidest du, ob ein Gespräch Sinn macht.",
      },
      edges: [
        {
          id: "social_proof_to_email",
          destination_node_id: "email_erfassen",
          transition_condition: {
            type: "prompt",
            prompt: "Der Anrufer reagiert positiv, will die Case Study, oder stimmt zu.",
          },
        },
        {
          id: "social_proof_to_end",
          destination_node_id: "end_polite",
          transition_condition: {
            type: "prompt",
            prompt: "Der Anrufer lehnt auch die Case Study ab.",
          },
        },
      ],
    },

    // =====================================================================
    // E-MAIL ERFASSEN (shared node)
    // =====================================================================
    {
      id: "email_erfassen",
      type: "conversation",
      instruction: {
        type: "prompt",
        text: "Erfasse die E-Mail-Adresse. Sage: 'Wie ist deine E-Mail-Adresse? Dann schick ich dir das rüber.' Wiederhole die Adresse zur Bestätigung. Verabschiede dich dann freundlich: 'Alles klar, ist raus. Wir melden uns in ein paar Tagen nochmal kurz. Bis dann!'",
      },
      edges: [
        {
          id: "email_to_end",
          destination_node_id: "end_call",
          transition_condition: {
            type: "prompt",
            prompt: "Die E-Mail-Adresse wurde erfasst und der Anrufer wurde verabschiedet.",
          },
        },
      ],
    },

    // =====================================================================
    // EINWANDBEHANDLUNG
    // =====================================================================

    // --- "Andere Prioritäten" ---
    {
      id: "einwand_prioritaeten",
      type: "conversation",
      instruction: {
        type: "static_text",
        text: "Verstehe ich. Liegt es daran, dass PV für dich kein Thema ist? Oder ist es zeitlich gerade eng?",
      },
      edges: [
        {
          id: "prioritaeten_to_spaeter",
          destination_node_id: "einwand_termin_spaeter",
          transition_condition: {
            type: "prompt",
            prompt: "Es ist zeitlich eng, der Anrufer hat grundsätzlich Interesse aber gerade keine Kapazität.",
          },
        },
        {
          id: "prioritaeten_to_end",
          destination_node_id: "end_cold",
          transition_condition: {
            type: "prompt",
            prompt: "PV ist generell kein Thema für den Anrufer.",
          },
        },
      ],
    },
    {
      id: "einwand_termin_spaeter",
      type: "conversation",
      instruction: {
        type: "static_text",
        text: "Dann schlage ich vor: Wir machen den Termin in vier bis sechs Wochen. Rein informativ. Dann hast du die Zahlen auf dem Tisch und kannst planen, wenn es soweit ist.",
      },
      edges: [
        {
          id: "spaeter_to_buchung",
          destination_node_id: "termin_buchung",
          transition_condition: {
            type: "prompt",
            prompt: "Der Anrufer stimmt einem späteren Termin zu.",
          },
        },
        {
          id: "spaeter_to_end",
          destination_node_id: "end_cold",
          transition_condition: {
            type: "prompt",
            prompt: "Der Anrufer lehnt auch den späteren Termin ab.",
          },
        },
      ],
    },

    // --- "Schon Angebote eingeholt" ---
    {
      id: "einwand_angebote",
      type: "conversation",
      instruction: {
        type: "static_text",
        text: "Sehr gut, dann bist du ja schon einen Schritt weiter. Warst du mit den Angeboten zufrieden? Wir erleben oft, dass ein Vergleich sich lohnt. Gerade bei Förderungen und Wirtschaftlichkeit gibt es große Unterschiede. Ein kurzer Check kostet dich nichts.",
      },
      edges: [
        {
          id: "angebote_to_buchung",
          destination_node_id: "termin_buchung",
          transition_condition: {
            type: "prompt",
            prompt: "Der Anrufer ist offen für einen Vergleich oder will einen Check.",
          },
        },
        {
          id: "angebote_to_end",
          destination_node_id: "end_cold",
          transition_condition: {
            type: "prompt",
            prompt: "Der Anrufer ist zufrieden mit bestehenden Angeboten und hat kein Interesse an einem Vergleich.",
          },
        },
      ],
    },

    // --- "Rechnet sich nicht" ---
    {
      id: "einwand_rechnet_nicht",
      type: "conversation",
      instruction: {
        type: "static_text",
        text: "Okay. Hat dir das jemand berechnet, oder ist das eher ein Gefühl? Ich frage, weil sich die Rahmenbedingungen in den letzten ein bis zwei Jahren stark verändert haben. Strompreise, Förderungen, Einspeisevergütung. Viele Haushalte, die das vor einem Jahr durchgerechnet haben, kommen heute zu ganz anderen Ergebnissen.",
      },
      edges: [
        {
          id: "rechnet_nicht_to_terminpitch",
          destination_node_id: "terminpitch",
          transition_condition: {
            type: "prompt",
            prompt: "Der Anrufer ist neugierig geworden, will aktuelle Zahlen, oder gesteht ein dass es ein Gefühl war.",
          },
        },
        {
          id: "rechnet_nicht_to_end",
          destination_node_id: "end_cold",
          transition_condition: {
            type: "prompt",
            prompt: "Der Anrufer bleibt bei seiner Meinung, dass es sich nicht rechnet.",
          },
        },
      ],
    },

    // --- "Erstmal Unterlagen" ---
    {
      id: "einwand_unterlagen",
      type: "conversation",
      instruction: {
        type: "static_text",
        text: "Kann ich machen. Nur ehrlich gesagt: Ein pauschaler Flyer sagt dir wenig darüber, was bei dir konkret möglich ist. Deswegen ist eine individuelle Analyse so viel wertvoller. 20 Minuten, und danach hast du Zahlen, die speziell für dein Haus gelten. Darf ich dir einen Termin vorschlagen?",
      },
      edges: [
        {
          id: "unterlagen_to_buchung",
          destination_node_id: "termin_buchung",
          transition_condition: {
            type: "prompt",
            prompt: "Der Anrufer lässt sich überzeugen und will doch einen Termin.",
          },
        },
        {
          id: "unterlagen_to_email",
          destination_node_id: "email_erfassen",
          transition_condition: {
            type: "prompt",
            prompt: "Der Anrufer besteht auf Unterlagen oder will erstmal etwas Schriftliches.",
          },
        },
      ],
    },

    // --- "Muss intern abstimmen / mit Partner besprechen" ---
    {
      id: "einwand_intern",
      type: "conversation",
      instruction: {
        type: "static_text",
        text: "Absolut, das ist ganz normal. Mein Vorschlag: Mach den Beratungstermin trotzdem. Dann hast du eine fundierte Grundlage mit Zahlen, Amortisation und Fördermöglichkeiten, die du in Ruhe besprechen kannst.",
      },
      edges: [
        {
          id: "intern_to_buchung",
          destination_node_id: "termin_buchung",
          transition_condition: {
            type: "prompt",
            prompt: "Der Anrufer stimmt dem Termin zu, auch um Zahlen für die Besprechung zu haben.",
          },
        },
        {
          id: "intern_to_end",
          destination_node_id: "end_cold",
          transition_condition: {
            type: "prompt",
            prompt: "Der Anrufer lehnt den Termin ab und will erst intern sprechen.",
          },
        },
      ],
    },

    // --- "Ich meld mich / Ich ruf zurück" ---
    {
      id: "einwand_meld_mich",
      type: "conversation",
      instruction: {
        type: "static_text",
        text: "Verstehe ich. Darf ich dir einfach den Link zu unserem Buchungskalender schicken? Dann kannst du in Ruhe einen Termin wählen, wenn es passt. Ganz ohne Druck.",
      },
      edges: [
        {
          id: "meld_mich_to_email",
          destination_node_id: "email_erfassen",
          transition_condition: {
            type: "prompt",
            prompt: "Der Anrufer möchte den Link haben oder stimmt zu.",
          },
        },
        {
          id: "meld_mich_to_end",
          destination_node_id: "end_cold",
          transition_condition: {
            type: "prompt",
            prompt: "Der Anrufer lehnt auch den Kalenderlink ab.",
          },
        },
      ],
    },

    // =====================================================================
    // FAREWELL NODES
    // =====================================================================
    {
      id: "end_satisfied",
      type: "conversation",
      instruction: {
        type: "static_text",
        text: "Dann passt ja alles. Freut mich zu hören! Vielen Dank und viel Erfolg mit der Anlage. Schönen Tag noch!",
      },
      edges: [
        {
          id: "satisfied_to_end",
          destination_node_id: "end_call",
          transition_condition: {
            type: "prompt",
            prompt: "Der Anrufer verabschiedet sich oder die Nachricht wurde übermittelt.",
          },
        },
      ],
    },
    {
      id: "end_polite",
      type: "conversation",
      instruction: {
        type: "static_text",
        text: "Alles klar, kein Problem. Falls sich die Situation ändert, melde dich gerne. Vielen Dank für deine Zeit und einen schönen Tag!",
      },
      edges: [
        {
          id: "polite_to_end",
          destination_node_id: "end_call",
          transition_condition: {
            type: "prompt",
            prompt: "Der Anrufer verabschiedet sich oder die Nachricht wurde übermittelt.",
          },
        },
      ],
    },
    {
      id: "end_cold",
      type: "conversation",
      instruction: {
        type: "static_text",
        text: "Verstehe, dann passt es aktuell nicht und das ist völlig in Ordnung. Falls sich die Situation ändert, melde dich gerne. Vielen Dank für deine Zeit und einen schönen Tag!",
      },
      edges: [
        {
          id: "cold_to_end",
          destination_node_id: "end_call",
          transition_condition: {
            type: "prompt",
            prompt: "Der Anrufer verabschiedet sich oder die Nachricht wurde übermittelt.",
          },
        },
      ],
    },
    {
      id: "end_disqualified",
      type: "conversation",
      instruction: {
        type: "static_text",
        text: "Verstehe. Für deine Situation passt unser Angebot leider gerade nicht optimal. Aber falls sich etwas ändert, melde dich gerne jederzeit. Schönen Tag noch!",
      },
      edges: [
        {
          id: "disqualified_to_end",
          destination_node_id: "end_call",
          transition_condition: {
            type: "prompt",
            prompt: "Der Anrufer verabschiedet sich oder die Nachricht wurde übermittelt.",
          },
        },
      ],
    },
    {
      id: "end_delete",
      type: "conversation",
      instruction: {
        type: "static_text",
        text: "Verstehe, kein Problem. Ich lösche deinen Kontakt. Schönen Tag noch!",
      },
      edges: [
        {
          id: "delete_to_end",
          destination_node_id: "end_call",
          transition_condition: {
            type: "prompt",
            prompt: "Der Anrufer verabschiedet sich oder die Nachricht wurde übermittelt.",
          },
        },
      ],
    },
    {
      id: "end_wrong_person",
      type: "conversation",
      instruction: {
        type: "static_text",
        text: "Oh, Entschuldigung für die Störung. Schönen Tag noch!",
      },
      edges: [
        {
          id: "wrong_to_end",
          destination_node_id: "end_call",
          transition_condition: {
            type: "prompt",
            prompt: "Der Anrufer verabschiedet sich oder die Nachricht wurde übermittelt.",
          },
        },
      ],
    },

    // =====================================================================
    // END NODE (terminates call)
    // =====================================================================
    {
      id: "end_call",
      type: "end",
    },
  ];
}

// ---------------------------------------------------------------------------
// Deploy
// ---------------------------------------------------------------------------

async function deploy() {
  const nodes = buildNodes();

  console.log(`\n=== Solar B2C Conversation Flow ===`);
  console.log(`Nodes: ${nodes.length}`);
  console.log(
    `Edges: ${nodes.reduce((sum, n) => sum + (n.edges || []).length, 0)}`
  );

  // --- Step 1: Create conversation flow ---
  console.log("\n[1/2] Creating conversation flow...");

  const flow = await client.conversationFlow.create({
    start_speaker: "agent",
    start_node_id: "vorpruefung",
    model_choice: {
      type: "cascading",
      model: "gpt-4.1",
      high_priority: false,
    },
    model_temperature: 0.3,
    global_prompt: GLOBAL_PROMPT,
    default_dynamic_variables: DEFAULT_DYNAMIC_VARIABLES,
    nodes,
  });

  console.log(`  Flow ID: ${flow.conversation_flow_id}`);

  // --- Step 2: Create agent ---
  console.log("\n[2/2] Creating agent...");

  const agent = await client.agent.create({
    agent_name: "Solar B2C – Terminvereinbarung",
    response_engine: {
      type: "conversation-flow",
      conversation_flow_id: flow.conversation_flow_id,
      version: 0,
    },
    // --- Voice & Language ---
    voice_id: "custom_voice_2506be37aac35b532f9dca2cd7",
    language: "de-DE",
    voice_speed: 0.95,
    voice_temperature: 0.8,
    // --- Conversation behavior ---
    responsiveness: 0.7,                // Response eagerness
    interruption_sensitivity: 0.5,
    enable_backchannel: true,
    // --- Silence & reminders ---
    reminder_trigger_ms: 8000,          // 8 seconds silence
    reminder_max_count: 1,
    // --- Call limits ---
    max_call_duration_ms: 480000,       // 8 minutes
    // --- Voicemail ---
    voicemail_detection: "machine_detection",
    voicemail_message: "Hallo {{KUNDENNAME}}, hier ist {{AGENT_NAME}} von {{FIRMENNAME}}. Ich wollte mich kurz bei dir melden zum Thema Photovoltaik. Ruf gerne zurück oder buch dir direkt einen Termin über unseren Kalender. Bis dann!",
  });

  console.log(`  Agent ID:   ${agent.agent_id}`);
  console.log(`  Agent name: ${agent.agent_name}`);

  // --- Summary ---
  console.log("\n=== Deployment complete ===");
  console.log(`Conversation Flow ID : ${flow.conversation_flow_id}`);
  console.log(`Agent ID             : ${agent.agent_id}`);
  console.log(
    `Dashboard            : https://beta.retellai.com/dashboard/conversation-flow/${flow.conversation_flow_id}`
  );

  console.log("\n--- Dynamic Variables (set per call) ---");
  for (const [k, v] of Object.entries(DEFAULT_DYNAMIC_VARIABLES)) {
    console.log(`  {{${k}}} = "${v}"`);
  }

  console.log("\n--- Node Map ---");
  for (const node of nodes) {
    const edgeCount = (node.edges || []).length;
    const instrType =
      node.type === "end"
        ? "END"
        : node.instruction.type === "static_text"
          ? "STATIC"
          : "PROMPT";
    console.log(`  ${node.id.padEnd(30)} [${instrType}] → ${edgeCount} edges`);
  }
}

deploy().catch((err) => {
  console.error("\nDeployment failed:", err.message || err);
  if (err.status) console.error("Status:", err.status);
  if (err.body) console.error("Body:", JSON.stringify(err.body, null, 2));
  process.exit(1);
});
