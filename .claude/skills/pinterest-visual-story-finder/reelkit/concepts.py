"""Themen-Lexikon: gesprochene Wörter (DE/EN) -> Konzepte -> Bildmotive.

Jedes Motiv hat:
  art    Kennung des Offline-Generators (reelkit/art.py), Fallback wenn kein lizenziertes Bild vorliegt
  q      englische Suchanfrage für lizenzierte Quellen (Openverse/Wikimedia) und Pinterest-Moodboard
  tags   Schlagwörter für den Abgleich mit eigenen Assets (assets/assets.json oder Dateinamen)
Erweitern: einfach Einträge ergänzen; Trigger sind Wortanfänge (klein, Umlaute erlaubt).
"""

CONCEPTS = {
    "money": {
        "triggers": ["geld", "dollar", "euro", "cent", "bargeld", "schein", "münze", "money", "cash", "bucks", "kohle"],
        "motifs": [
            {"art": "dollar_note", "q": "single dollar bill crumpled black paper", "tags": ["dollar", "money", "bill", "geld"]},
            {"art": "cash_pile", "q": "room full of money vintage photograph", "tags": ["cash", "money", "pile", "geld"]},
            {"art": "coins", "q": "old coins still life painting", "tags": ["coins", "münzen", "money"]},
            {"art": "horse", "q": "baroque painting white horse gold harness", "tags": ["horse", "pferd", "luxury"]},
        ],
    },
    "past": {
        "triggers": ["früher", "damals", "großeltern", "opa", "oma", "vergangen", "geschichte", "19", "historisch",
                     "past", "ago", "history", "grandpa", "grandparents"],
        "motifs": [
            {"art": "old_photo", "q": "1950s american street photograph", "tags": ["vintage", "1950s", "history", "früher"]},
            {"art": "newspaper", "q": "vintage newspaper 1950s", "tags": ["newspaper", "zeitung", "vintage"]},
            {"art": "clock", "q": "antique pocket watch dark still life", "tags": ["clock", "uhr", "time"]},
            {"art": "horse", "q": "naive drawing horse crayon", "tags": ["horse", "pferd", "naive"]},
        ],
    },
    "inflation": {
        "triggers": ["inflation", "preis", "teuer", "kaufkraft", "entwert", "verteuer", "wertverlust", "price",
                     "expensive", "purchasing", "cost"],
        "motifs": [
            {"art": "price_tag", "q": "vintage price tag grocery store", "tags": ["price", "preis", "tag"]},
            {"art": "chart_up", "q": "inflation surreal collage", "tags": ["inflation", "chart", "prices"]},
            {"art": "flame", "q": "burning money dark photography", "tags": ["burning", "money", "fire"]},
            {"art": "dollar_note", "q": "melting money surreal art", "tags": ["money", "melting", "dollar"]},
        ],
    },
    "everyday": {
        "triggers": ["brot", "brötchen", "kaffee", "zeitung", "kino", "einkauf", "supermarkt", "milch", "benzin",
                     "lebensmittel", "bread", "coffee", "grocer", "milk", "gas", "cinema", "ticket"],
        "motifs": [
            {"art": "bread", "q": "bread still life oil painting", "tags": ["bread", "brot", "still life"]},
            {"art": "coffee", "q": "vintage diner coffee cup photograph", "tags": ["coffee", "kaffee", "diner"]},
            {"art": "cart", "q": "1950s supermarket photography", "tags": ["supermarket", "grocery", "cart"]},
            {"art": "newspaper", "q": "old newspaper stand vintage", "tags": ["newspaper", "zeitung"]},
        ],
    },
    "wealth": {
        "triggers": ["=reich", "=reiche", "=reichen", "=reicher", "reichtum", "vermögen", "millionär", "million", "luxus", "wohlstand", "elite", "wealth", "rich",
                     "luxury", "millionaire", "rolex"],
        "motifs": [
            {"art": "villa", "q": "old money mansion vintage photograph", "tags": ["villa", "mansion", "luxury"]},
            {"art": "crown", "q": "royal crown baroque painting", "tags": ["crown", "krone", "royal"]},
            {"art": "gold_bars", "q": "gold bars dark editorial", "tags": ["gold", "bars", "wealth"]},
            {"art": "horse", "q": "baroque painting white horse gold harness", "tags": ["horse", "pferd", "luxury"]},
        ],
    },
    "saving": {
        "triggers": ["spar", "konto", "rücklage", "sparbuch", "zurücklegen", "saving", "savings", "account"],
        "motifs": [
            {"art": "piggy", "q": "vintage piggy bank photograph", "tags": ["piggy", "sparschwein", "saving"]},
            {"art": "coins", "q": "jar of coins still life", "tags": ["coins", "jar", "saving"]},
            {"art": "bank", "q": "old bank building columns photograph", "tags": ["bank", "columns"]},
            {"art": "key", "q": "antique key dark aesthetic", "tags": ["key", "schlüssel", "safe"]},
        ],
    },
    "investing": {
        "triggers": ["invest", "aktie", "etf", "börse", "rendite", "dividend", "portfolio", "fonds", "anleg",
                     "stock", "market", "shares"],
        "motifs": [
            {"art": "chart_up", "q": "1920s stock exchange photograph", "tags": ["stock", "chart", "börse"]},
            {"art": "tree", "q": "giant old tree misty painting", "tags": ["tree", "growth", "baum"]},
            {"art": "chess", "q": "chess king dark cinematic", "tags": ["chess", "strategy", "schach"]},
            {"art": "bank", "q": "wall street vintage photograph", "tags": ["wall street", "bank"]},
        ],
    },
    "growth": {
        "triggers": ["zinseszins", "wachs", "vermehr", "verdoppel", "exponent", "compound", "grow", "double"],
        "motifs": [
            {"art": "tree", "q": "tree growing from coins surreal", "tags": ["tree", "growth"]},
            {"art": "chart_up", "q": "compound interest vintage illustration", "tags": ["chart", "growth"]},
            {"art": "ladder", "q": "ladder to the sky surreal art", "tags": ["ladder", "leiter", "growth"]},
            {"art": "sun_landscape", "q": "sunrise landscape oil painting", "tags": ["sunrise", "landscape"]},
        ],
    },
    "realestate": {
        "triggers": ["immobilie", "wohnung", "haus", "häuser", "miete", "eigenheim", "grundstück", "house", "apartment",
                     "rent", "property", "real estate"],
        "motifs": [
            {"art": "house", "q": "vintage suburban house 1950s photograph", "tags": ["house", "haus", "home"]},
            {"art": "villa", "q": "old villa overgrown cinematic", "tags": ["villa", "mansion"]},
            {"art": "key", "q": "house key vintage", "tags": ["key", "schlüssel"]},
            {"art": "sun_landscape", "q": "farmland painting golden hour", "tags": ["land", "landscape"]},
        ],
    },
    "gold": {
        "triggers": ["gold", "silber", "sachwert", "edelmetall", "rohstoff", "silver", "commodit"],
        "motifs": [
            {"art": "gold_bars", "q": "gold bars dark editorial photography", "tags": ["gold", "bars"]},
            {"art": "crown", "q": "golden crown still life painting", "tags": ["crown", "gold"]},
            {"art": "coins", "q": "ancient gold coins", "tags": ["coins", "gold"]},
            {"art": "scale", "q": "antique balance scale gold", "tags": ["scale", "waage"]},
        ],
    },
    "debt": {
        "triggers": ["schuld", "kredit", "darlehen", "überzieh", "=rate", "=raten", "ratenkredit", "debt", "loan", "credit", "owe"],
        "motifs": [
            {"art": "chains", "q": "chains dark surreal photography", "tags": ["chains", "ketten", "debt"]},
            {"art": "wave", "q": "great wave storm painting", "tags": ["wave", "storm", "sea"]},
            {"art": "chart_down", "q": "falling man surreal art", "tags": ["falling", "chart"]},
            {"art": "key", "q": "padlock rusty dark", "tags": ["lock", "padlock"]},
        ],
    },
    "time": {
        "triggers": ["zeit", "jahr", "jahrzehnt", "rente", "ruhestand", "zukunft", "=uhr", "time", "year",
                     "decade", "retire", "future"],
        "motifs": [
            {"art": "hourglass", "q": "hourglass vanitas painting", "tags": ["hourglass", "sanduhr", "time"]},
            {"art": "clock", "q": "melting clock surreal", "tags": ["clock", "uhr"]},
            {"art": "sun_landscape", "q": "lonely road horizon film photography", "tags": ["horizon", "road"]},
            {"art": "old_photo", "q": "old couple vintage photograph", "tags": ["vintage", "old"]},
        ],
    },
    "work": {
        "triggers": ["arbeit", "job", "gehalt", "lohn", "arzt", "ärzt", "praxis", "beruf", "chef", "einkommen",
                     "verdien", "angestellt", "work", "salary", "doctor", "income", "earn"],
        "motifs": [
            {"art": "ladder", "q": "corporate ladder surreal", "tags": ["ladder", "career"]},
            {"art": "clock", "q": "factory clock vintage photograph", "tags": ["clock", "work"]},
            {"art": "chess", "q": "pawn chess piece dark", "tags": ["pawn", "chess"]},
            {"art": "old_photo", "q": "1950s office workers photograph", "tags": ["office", "work"]},
        ],
    },
    "spending": {
        "triggers": ["ausgeb", "konsum", "kauf", "auto", "urlaub", "shopping", "spend", "buy", "car", "vacation"],
        "motifs": [
            {"art": "cart", "q": "shopping cart surreal", "tags": ["cart", "shopping"]},
            {"art": "flame", "q": "burning money dark", "tags": ["burning", "money"]},
            {"art": "cash_pile", "q": "money flying away surreal", "tags": ["money", "flying"]},
            {"art": "crown", "q": "luxury lifestyle vintage aesthetic", "tags": ["luxury"]},
        ],
    },
    "risk": {
        "triggers": ["angst", "risiko", "crash", "krise", "verlust", "verlier", "pleite", "gefahr", "fear", "risk",
                     "crisis", "lose", "loss"],
        "motifs": [
            {"art": "wave", "q": "storm at sea painting dark", "tags": ["storm", "wave", "sea"]},
            {"art": "chart_down", "q": "1929 stock market crash photograph", "tags": ["crash", "chart"]},
            {"art": "flame", "q": "fire dark cinematic", "tags": ["fire", "flame"]},
            {"art": "hourglass", "q": "broken hourglass", "tags": ["hourglass"]},
        ],
    },
    "freedom": {
        "triggers": ["frei", "freiheit", "unabhängig", "ziel", "traum", "freedom", "free", "independent",
                     "dream", "goal"],
        "motifs": [
            {"art": "sun_landscape", "q": "open field film photography", "tags": ["landscape", "field", "freedom"]},
            {"art": "villa", "q": "villa by the sea vintage", "tags": ["villa", "sea"]},
            {"art": "horse", "q": "wild horse running painting", "tags": ["horse", "pferd", "freedom"]},
            {"art": "key", "q": "open door light surreal", "tags": ["door", "key"]},
        ],
    },
    "tax": {
        "triggers": ["steuer", "finanzamt", "abgabe", "staat", "tax", "government"],
        "motifs": [
            {"art": "bank", "q": "government building columns vintage", "tags": ["building", "columns"]},
            {"art": "scale", "q": "scales of justice painting", "tags": ["scale", "justice"]},
            {"art": "newspaper", "q": "old tax document vintage", "tags": ["document", "paper"]},
            {"art": "coins", "q": "coins falling dark", "tags": ["coins"]},
        ],
    },
    "knowledge": {
        "triggers": ["wissen", "lern", "versteh", "system", "geheim", "wahrheit", "know", "learn", "understand",
                     "secret", "truth"],
        "motifs": [
            {"art": "key", "q": "antique key dark aesthetic", "tags": ["key"]},
            {"art": "chess", "q": "chess king cinematic", "tags": ["chess"]},
            {"art": "newspaper", "q": "old book pages vintage", "tags": ["book", "paper"]},
            {"art": "sun_landscape", "q": "lighthouse painting", "tags": ["light"]},
        ],
    },
}

# Reihenfolge der Bildästhetiken pro Collage – entspricht dem Referenz-Reel:
# dunkel/fotografisch, vintage/analog, naiv/Zeichnung, barock/Gemälde.
STYLE_ROTATION = ["dark", "vintage", "naive", "baroque"]

STYLE_QUERY_SUFFIX = {
    "dark": "dark editorial photography",
    "vintage": "vintage photograph",
    "naive": "naive art drawing",
    "baroque": "oil painting",
    "luxury": "luxury aesthetic",
    "surreal": "surreal art",
}

DEFAULT_CONCEPT = "money"

# Hinweis zu Triggern: Einträge sind Wortanfänge ("geld" trifft "Geldes"). Mehrdeutige Stämme
# exakt markieren ("=reich" trifft "reich", aber nicht "reicht"/"erreichen").
