# -*- coding: utf-8 -*-
"""Erzeugt Logo-Anfragen für beliebig viele Gesellschaften.

Warum vier Namensformen pro Haus: In "X möchte ich empfehlen" steht das Haus
im Akkusativ, nicht im Nominativ. Bei femininen Marken sind beide Formen
gleich ("die Gothaer"), bei maskulinen nicht ("den Volkswohl Bund") — ohne
die Unterscheidung stünde dort ein Grammatikfehler.
"""
import os, shutil, textwrap, json

ZIEL = "/home/user/WBW/versandtexte-vorbereitet"
AUF, ZU, GS = "„", "“", "—"
BREITE = 78

# marke, nominativ, akkusativ (Satzanfang), akkusativ (inline), kategorie, adresse
#
# Adressen aus Websuche, NICHT gegen das Live-Impressum geprueft (Domains sind
# aus dieser Sitzung gesperrt). Bevorzugt wurden Makler-/Vertriebspostfaecher.
# Bewusst NICHT genommen: reine Technik-Postfaecher (BiPRO, Extranet-Zugang,
# IT-Support) und persoenliche Adressen einzelner Mitarbeiter.
GESELLSCHAFTEN = [
    ("Alte Leipziger",   "Die Alte Leipziger",   "Die Alte Leipziger",   "die Alte Leipziger",   "Vorsorge",    "vmp.service@alte-leipziger.de"),
    ("LV 1871",          "Die LV 1871",          "Die LV 1871",          "die LV 1871",          "Vorsorge",    "info@lv1871.de"),
    ("Volkswohl Bund",   "Der Volkswohl Bund",   "Den Volkswohl Bund",   "den Volkswohl Bund",   "Vorsorge",    "info@volkswohl-bund.de"),
    ("Condor",           "Die Condor",           "Die Condor",           "die Condor",           "Vorsorge",    "Makler-Service@condor-versicherungen.de"),
    ("Standard Life",    "Standard Life",        "Standard Life",        "Standard Life",        "Vorsorge",    "kundenservice@standardlife.de"),
    ("Canada Life",      "Canada Life",          "Canada Life",          "Canada Life",          "Vorsorge",    "maklerservice@canadalife.de"),
    ("die Bayerische",   "Die Bayerische",       "Die Bayerische",       "die Bayerische",       "Vorsorge/BU", "mdc@diebayerische.de"),
    ("Stuttgarter",      "Die Stuttgarter",      "Die Stuttgarter",      "die Stuttgarter",      "Vorsorge/BU", "info@stuttgarter.de"),
    ("Nürnberger",       "Die Nürnberger",       "Die Nürnberger",       "die Nürnberger",       "BU",          "info@nuernberger.de"),
    ("HDI",              "Die HDI",              "Die HDI",              "die HDI",              "BU/Komposit", "vertriebshotline@hdi.de"),
    ("Gothaer",          "Die Gothaer",          "Die Gothaer",          "die Gothaer",          "BU/Komposit", "info@gothaer.de"),
    ("Baloise",          "Die Baloise",          "Die Baloise",          "die Baloise",          "BU/Komposit", "info@baloise.de"),
    ("DKV",              "Die DKV",              "Die DKV",              "die DKV",              "PKV",         "service@dkv.com"),
    ("HanseMerkur",      "Die HanseMerkur",      "Die HanseMerkur",      "die HanseMerkur",      "PKV",         "info@hansemerkur.de"),
    ("Münchener Verein", "Der Münchener Verein", "Den Münchener Verein", "den Münchener Verein", "PKV",         "info@muenchener-verein.de"),
    ("SDK",              "Die SDK",              "Die SDK",              "die SDK",              "PKV",         "sdk@sdk.de"),
    ("INTER",            "Die INTER",            "Die INTER",            "die INTER",            "PKV",         "info@inter.de"),
    ("VHV",              "Die VHV",              "Die VHV",              "die VHV",              "Sach/Kfz",    "Makleranbindung@vhv.de"),
    ("Haftpflichtkasse", "Die Haftpflichtkasse", "Die Haftpflichtkasse", "die Haftpflichtkasse", "Sach",        "info@haftpflichtkasse.de"),
    ("InterRisk",        "Die InterRisk",        "Die InterRisk",        "die InterRisk",        "Sach",        "info@interrisk.de"),
    ("AXA",              "Die AXA",              "Die AXA",              "die AXA",              "Komposit",    "service@axa.de"),
    ("Zurich",           "Die Zurich",           "Die Zurich",           "die Zurich",           "Komposit",    "service@zurich.com"),
    ("ERGO",             "Die ERGO",             "Die ERGO",             "die ERGO",             "Komposit",    "service@ergo.de"),
    ("R+V",              "Die R+V",              "Die R+V",              "die R+V",              "Komposit",    "ruv@ruv.de"),
    ("DEVK",             "Die DEVK",             "Die DEVK",             "die DEVK",             "Komposit",    "info@devk.de"),
    ("Württembergische", "Die Württembergische", "Die Württembergische", "die Württembergische", "Komposit",    "info@wuerttembergische.de"),
]

BAUSTEIN_B = (
    "Die Produkte Ihres Hauses vermittle ich bereits seit einiger Zeit und "
    "schätze dabei sowohl die Qualität und Verlässlichkeit Ihres Angebots als "
    "auch die Zusammenarbeit mit Ihrem Haus sehr. {AKK} möchte ich meinen "
    "Kundinnen und Kunden daher auch künftig aktiv empfehlen und vermitteln.")
BAUSTEIN_C = (
    "{NOM} hat in meiner Marktbeobachtung einen ausgezeichneten Ruf, und Ihre "
    "Tarife überzeugen mich in den Bereichen, in denen ich berate. Ihr Haus "
    "möchte ich daher künftig als starken Partner empfehlen und aktiv "
    "Kundinnen und Kunden vermitteln.")

SIGNATUR = """Benedict Hintz
Versicherungsmakler
We Build Wealth
Calvinstraße 3, 10557 Berlin

Mobil: +49 176 43229851
E-Mail: Benedicthintz.business@gmail.com
www.webuildwealth.de

Unabhängiger Makler für Versicherungen und Finanzanlagen.
Registrierungsnummer § 34d GewO: D-5V3H-7KX3I-54
Registrierungsnummer § 34f GewO: D-F-107-RV51-31

Die Eintragungen im Vermittlerregister können bei der DIHK | Deutsche
Industrie- und Handelskammer, Breite Straße 29, 10178 Berlin,
Telefon: 0180 600 585 0 (20 Ct./Anruf aus dem dt. Festnetz, Mobilfunk max.
60 Ct./Anruf) sowie unter www.vermittlerregister.info abgefragt werden.
Schlichtungsstelle für gewerbliche Versicherungs-, Anlage- und
Kreditvermittlung, Barmbeker Straße 2, 22303 Hamburg,
www.schlichtung-finanzberatung.de

Diese E-Mail enthält vertrauliche und/oder rechtlich geschützte Informationen.
Wenn Sie nicht der richtige Adressat sind bzw. für den Empfang nicht autorisiert
sind oder diese E-Mail irrtümlich erhalten haben, informieren Sie bitte den
Absender und vernichten Sie diese Mail. Das unerlaubte Kopieren sowie die
unbefugte Weitergabe dieser Mail ist nicht gestattet."""


def absaetze(nom, akk_gross, akk, baustein):
    beziehung = (BAUSTEIN_B.format(AKK=akk_gross) if baustein == "B"
                 else BAUSTEIN_C.format(NOM=nom))
    weiter = "weiterhin aktiv" if baustein == "B" else "aktiv"
    return [
        "Sehr geehrte Damen und Herren,",
        "mein Name ist Benedict Hintz. Ich bin unabhängiger Versicherungsmakler "
        "mit Erlaubnis nach § 34d Abs. 1 GewO und über den Maklerpool blau "
        "direkt an Ihr Haus angebunden.",
        beziehung,
        "Über meine Webseite We Build Wealth (www.webuildwealth.de) begleite ich "
        "junge, ambitionierte Kundinnen und Kunden beim Vermögensaufbau und "
        "vermittle in diesem Zusammenhang auch passende Versicherungslösungen. "
        f"{akk_gross} möchte ich dabei {weiter} empfehlen und vermitteln.",
        f"Aus diesem Grund bitte ich Sie höflich um die Erlaubnis, Ihr Logo auf "
        f"meiner Webseite in der Rubrik {AUF}Starke Partner{ZU} zeigen zu dürfen. "
        f"Konkret geht es um folgende Nutzung:",
        ("-", f"Ort: ausschließlich auf www.webuildwealth.de, in der Rubrik "
              f"{AUF}Starke Partner{ZU}"),
        ("-", "Darstellung: unverändert, in Originalfarben und -proportionen, "
              "ohne Bearbeitung, Verfremdung oder Kombination mit anderen Zeichen"),
        ("-", "Zweck: Kenntlichmachung der Häuser, deren Produkte ich vermittle"),
        ("-", "Einordnung: Unterhalb der Logos weise ich ausdrücklich darauf hin, "
              "dass die Darstellung weder eine Vertriebsbindung noch eine "
              "Empfehlung durch Ihr Haus bedeutet und ich als Makler auf "
              "Grundlage einer ausgewogenen Marktuntersuchung berate"),
        ("-", "Grenzen: keine Nutzung in bezahlter Werbung, in "
              "Social-Media-Anzeigen oder in Printmaterialien ohne gesonderte "
              "Abstimmung mit Ihnen"),
        ("-", f"Dauer: jederzeit auf Ihren Wunsch widerruflich {GS} ich entferne "
              f"das Logo dann unverzüglich und ohne Rückfrage"),
        "Selbstverständlich halte ich mich an Ihre Marken- und "
        "Gestaltungsvorgaben. Über die Zusendung der aktuellen Logodateien und "
        "Ihres CD-Manuals bzw. der Nutzungsrichtlinien würde ich mich freuen.",
        "Zur Einordnung meiner Tätigkeit:",
        ("-", f"Versicherungsmakler nach § 34d Abs. 1 GewO {GS} "
              f"Registrierungsnummer D-5V3H-7KX3I-54"),
        ("-", f"Finanzanlagenvermittler nach § 34f Abs. 1 Satz 1 Nr. 1 GewO {GS} "
              f"Registrierungsnummer D-F-107-RV51-31"),
        ("-", "Beide Eintragungen jederzeit prüfbar unter "
              "www.vermittlerregister.info"),
        ("-", "Berufshaftpflichtversicherung nach § 34d Abs. 5 GewO in "
              "gesetzlicher Mindestdeckung"),
        ("-", "Anbindung über den Maklerpool blau direkt"),
        ("-", f"Aufsicht: IHK Berlin {GS} Impressum und Erstinformation nach "
              f"§ 15 VersVermV unter www.webuildwealth.de/impressum"),
        f"Ich sehe darin einen Vorteil für beide Seiten: Die Nennung in der "
        f"Rubrik {AUF}Starke Partner{ZU} macht meine Kundinnen und Kunden auf "
        f"{akk} aufmerksam, und ich stelle zugleich transparent dar, mit welchen "
        f"Häusern ich arbeite.",
        "Über eine kurze schriftliche Bestätigung per E-Mail würde ich mich sehr "
        "freuen, damit ich rechtlich auf der sicheren Seite bin. Für Rückfragen "
        "oder eine nähere Abstimmung stehe ich Ihnen jederzeit gerne zur "
        f"Verfügung {GS} telefonisch unter +49 176 43229851 oder per E-Mail.",
        "Sollte für dieses Anliegen eine andere Stelle in Ihrem Haus zuständig "
        "sein, wäre ich Ihnen für eine kurze Weiterleitung dankbar.",
        "Vielen Dank vorab für Ihre Zeit und beste Grüße",
    ]


def bauen(nom, akk_gross, akk, adresse, baustein):
    zeilen = [f"An: {adresse or '[ADRESSE FEHLT]'}",
              "Betreff: Anfrage zur Nutzung Ihres Logos auf webuildwealth.de",
              ""]
    liste = absaetze(nom, akk_gross, akk, baustein)
    for i, a in enumerate(liste):
        if isinstance(a, tuple):
            zeilen += textwrap.wrap(a[1], BREITE, initial_indent="- ",
                                    subsequent_indent="  ")
            if i + 1 == len(liste) or not isinstance(liste[i + 1], tuple):
                zeilen.append("")
        else:
            zeilen += textwrap.wrap(a, BREITE)
            zeilen.append("")
    zeilen.append(SIGNATUR)
    return "\n".join(zeilen) + "\n"


UMLAUTE = str.maketrans({"ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss"})

def dateiname(marke):
    return (marke.lower().translate(UMLAUTE)
                 .replace("+", "-plus-").replace(" ", "-").replace("/", "-") + ".txt")


if __name__ == "__main__":
    shutil.rmtree(ZIEL, ignore_errors=True)
    os.makedirs(ZIEL)
    uebersicht = []
    for i, (marke, nom, akk_gross, akk, kat, adr) in enumerate(GESELLSCHAFTEN, start=1):
        name = f"{i:02d}-{dateiname(marke)}"
        with open(os.path.join(ZIEL, name), "w", encoding="utf-8") as f:
            f.write(bauen(nom, akk_gross, akk, adr, "B"))
        uebersicht.append({"nr": i, "marke": marke, "kategorie": kat,
                           "datei": name, "adresse": adr, "baustein": "B"})
    with open(os.path.join(ZIEL, "_uebersicht.json"), "w", encoding="utf-8") as f:
        json.dump(uebersicht, f, ensure_ascii=False, indent=1)
    print(f"{len(uebersicht)} Texte vorbereitet")
