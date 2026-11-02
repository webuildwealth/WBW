"""Erzeugt den Cashflow-Rechner als .xlsx (Vorlage fuer Google Sheets).

Aufruf:  python build_cashflow_rechner.py [ausgabe.xlsx]
"""
import sys
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import CellIsRule, FormulaRule
from openpyxl.chart import BarChart, Reference
from openpyxl.comments import Comment

OUT = sys.argv[1] if len(sys.argv) > 1 else "Cashflow-Rechner.xlsx"

# ---------- Stil (Farben der Website finanz-medizin.com) ----------
FONT = "Arial"
NAVY = "071B32"
NAVY_500 = "1E5A88"
NAVY_050 = "EDF2F7"
IVORY = "F4F0EF"
BONE = "E3DCD6"
RED = "751524"
INPUT_FILL = PatternFill("solid", fgColor="FFF2CC")   # Eingabefelder
HEAD_FILL = PatternFill("solid", fgColor=NAVY)
SECTION_FILL = PatternFill("solid", fgColor=NAVY_050)
TOTAL_FILL = PatternFill("solid", fgColor=IVORY)
THIN = Side(style="thin", color=BONE)
BOX = Border(top=THIN, bottom=THIN, left=THIN, right=THIN)

EUR = '#,##0.00 "€";-#,##0.00 "€";"–"'
EUR0 = '#,##0 "€";-#,##0 "€";"–"'
PCT = '0.0%;-0.0%;"–"'

def f(bold=False, size=10, color="000000", italic=False):
    return Font(name=FONT, bold=bold, size=size, color=color, italic=italic)

def title(ws, text, sub=None):
    ws["A1"] = text
    ws["A1"].font = f(True, 16, NAVY)
    if sub:
        ws["A2"] = sub
        ws["A2"].font = f(size=10, color="3D5064", italic=True)
    ws.sheet_view.showGridLines = False

def header_row(ws, row, labels):
    for i, lab in enumerate(labels, start=1):
        c = ws.cell(row=row, column=i, value=lab)
        c.font = f(True, 10, "FFFFFF")
        c.fill = HEAD_FILL
        c.alignment = Alignment(vertical="center", wrap_text=True)
        c.border = BOX
    ws.row_dimensions[row].height = 22

def input_cell(c, fmt=None):
    c.fill = INPUT_FILL
    c.font = f(color="0000FF")
    c.border = BOX
    if fmt:
        c.number_format = fmt

def calc_cell(c, fmt=None, bold=False):
    c.font = f(bold=bold)
    c.border = BOX
    if fmt:
        c.number_format = fmt

# ---------- Stammdaten ----------
TURNUS = [("monatlich", 12), ("vierteljährlich", 4), ("halbjährlich", 2), ("jährlich", 1)]
ARTEN = ["Fixkosten", "Variable Kosten", "Sparen & Vorsorge"]

EINNAHMEN = [
    ("Arbeitseinkommen", [
        ("Nettogehalt (ich)", "monatlich", "Betrag, der auf dem Konto ankommt"),
        ("Nettogehalt (Partner/in)", "monatlich", ""),
        ("Gewinnentnahme Praxis (Selbstständige)", "monatlich", "Privatentnahme nach Steuern"),
        ("Urlaubs- und Weihnachtsgeld (netto)", "jährlich", ""),
        ("Bonus oder Prämie (netto)", "jährlich", ""),
    ]),
    ("Nebeneinkommen", [
        ("Dienste, Vertretungen, Honorare", "monatlich", "z. B. Notdienst, Gutachten"),
        ("Sonstige Nebentätigkeit", "monatlich", ""),
    ]),
    ("Staatliche Leistungen", [
        ("Kindergeld", "monatlich", ""),
        ("Elterngeld", "monatlich", ""),
    ]),
    ("Vermögen", [
        ("Mieteinnahmen (kalt)", "monatlich", ""),
        ("Zinsen und Dividenden", "jährlich", "nach Abgeltungsteuer"),
    ]),
    ("Sonstige Einnahmen", [
        ("Unterhalt (erhalten)", "monatlich", ""),
        ("Sonstiges", "monatlich", ""),
    ]),
]

FIX, VAR, SPA = ARTEN
AUSGABEN = [
    ("Wohnen", [
        ("Miete (warm) oder Kreditrate Eigenheim", "monatlich", FIX, ""),
        ("Nebenkosten bzw. Hausgeld", "monatlich", FIX, "falls nicht in der Warmmiete"),
        ("Strom", "monatlich", FIX, ""),
        ("Heizung oder Gas", "monatlich", FIX, "falls separat"),
        ("Internet und Festnetz", "monatlich", FIX, ""),
        ("Rundfunkbeitrag", "vierteljährlich", FIX, ""),
        ("Grundsteuer", "vierteljährlich", FIX, "nur bei Eigentum"),
        ("Instandhaltungsrücklage", "monatlich", FIX, "nur bei Eigentum"),
    ]),
    ("Versicherungen", [
        ("Krankenversicherung (Eigenanteil)", "monatlich", FIX, "PKV oder freiwillig GKV, falls nicht vom Gehalt abgezogen"),
        ("Berufsunfähigkeitsversicherung", "monatlich", FIX, ""),
        ("Privathaftpflicht", "jährlich", FIX, ""),
        ("Hausratversicherung", "jährlich", FIX, ""),
        ("Wohngebäudeversicherung", "jährlich", FIX, "nur bei Eigentum"),
        ("Risikolebensversicherung", "monatlich", FIX, ""),
        ("Rechtsschutzversicherung", "jährlich", FIX, ""),
        ("Zahn- oder Krankenzusatzversicherung", "monatlich", FIX, ""),
        ("Unfallversicherung", "jährlich", FIX, ""),
    ]),
    ("Mobilität", [
        ("Kreditrate oder Leasing Auto", "monatlich", FIX, ""),
        ("Kfz-Versicherung", "jährlich", FIX, ""),
        ("Kfz-Steuer", "jährlich", FIX, ""),
        ("Tanken oder Laden", "monatlich", VAR, ""),
        ("Wartung, Reparaturen, TÜV", "jährlich", VAR, ""),
        ("ÖPNV oder Deutschlandticket", "monatlich", FIX, ""),
        ("Parken, Taxi, Carsharing", "monatlich", VAR, ""),
    ]),
    ("Lebenshaltung", [
        ("Lebensmittel und Haushalt", "monatlich", VAR, ""),
        ("Drogerie und Körperpflege", "monatlich", VAR, ""),
        ("Kleidung und Schuhe", "monatlich", VAR, ""),
        ("Gesundheit, Apotheke, Zuzahlungen", "monatlich", VAR, ""),
        ("Friseur", "monatlich", VAR, ""),
        ("Handyvertrag", "monatlich", FIX, ""),
    ]),
    ("Kinder", [
        ("Kita, Schule, Betreuung", "monatlich", FIX, ""),
        ("Vereine, Musikunterricht, Nachhilfe", "monatlich", FIX, ""),
        ("Taschengeld", "monatlich", FIX, ""),
        ("Kinderbedarf und Spielzeug", "monatlich", VAR, ""),
    ]),
    ("Beruf", [
        ("Versorgungswerk oder Rentenversicherung", "monatlich", FIX, "nur falls selbst gezahlt, nicht vom Gehalt abgezogen"),
        ("Kammerbeitrag", "jährlich", FIX, ""),
        ("Berufshaftpflicht", "jährlich", FIX, ""),
        ("Berufsverband und Fachliteratur", "jährlich", FIX, ""),
        ("Fortbildungen und Kongresse", "jährlich", VAR, ""),
    ]),
    ("Freizeit", [
        ("Restaurant, Lieferdienste, Ausgehen", "monatlich", VAR, ""),
        ("Streaming und Abos", "monatlich", FIX, ""),
        ("Fitnessstudio und Sport", "monatlich", FIX, ""),
        ("Hobbys", "monatlich", VAR, ""),
        ("Urlaub und Reisen", "jährlich", VAR, ""),
        ("Geschenke und Feiertage", "jährlich", VAR, ""),
        ("Haustier", "monatlich", VAR, ""),
    ]),
    ("Kredite und Verpflichtungen", [
        ("Ratenkredit", "monatlich", FIX, ""),
        ("Kreditkarte (Rückzahlung)", "monatlich", FIX, ""),
        ("Studienkredit oder BAföG", "monatlich", FIX, ""),
        ("Unterhalt (gezahlt)", "monatlich", FIX, ""),
    ]),
    ("Sparen und Vorsorge", [
        ("Notgroschen (Tagesgeld)", "monatlich", SPA, ""),
        ("ETF- oder Fondssparplan", "monatlich", SPA, ""),
        ("Private Altersvorsorge (Rürup, Riester, private Rente)", "monatlich", SPA, ""),
        ("Betriebliche Altersvorsorge (Eigenanteil)", "monatlich", SPA, "nur falls nicht schon vom Gehalt abgezogen"),
        ("Bausparvertrag", "monatlich", SPA, ""),
        ("Sondertilgung Immobilie", "jährlich", SPA, ""),
        ("Sparen für Kinder", "monatlich", SPA, ""),
    ]),
    ("Sonstiges", [
        ("Spenden und Mitgliedschaften", "monatlich", VAR, ""),
        ("Steuerberatung oder Lohnsteuerhilfe", "jährlich", FIX, ""),
        ("Kontoführungsgebühren", "monatlich", FIX, ""),
        ("Unvorhergesehenes", "monatlich", VAR, ""),
    ]),
]

SPARE_ROWS = 8          # leere, vorbereitete Zeilen am Ende jeder Tabelle
LAST = 1000             # Formeln summieren bis Zeile 1000

wb = Workbook()

# ================= Listen (Nachschlagewerte) =================
wsL = wb.active
wsL.title = "Listen"
title(wsL, "Listen", "Werte für die Auswahlfelder. Bitte nur ändern, wenn neue Kategorien gebraucht werden.")
wsL["A3"], wsL["B3"] = "Turnus", "Zahlungen pro Jahr"
wsL["D3"] = "Art der Ausgabe"
wsL["F3"] = "Kategorien Ausgaben"
wsL["H3"] = "Kategorien Einnahmen"
for col in "ABDFH":
    c = wsL[f"{col}3"]
    c.font = f(True, 10, "FFFFFF"); c.fill = HEAD_FILL; c.border = BOX
for i, (t, n) in enumerate(TURNUS, start=4):
    wsL[f"A{i}"] = t; wsL[f"B{i}"] = n
    calc_cell(wsL[f"A{i}"]); calc_cell(wsL[f"B{i}"], "0")
for i, a in enumerate(ARTEN, start=4):
    wsL[f"D{i}"] = a; calc_cell(wsL[f"D{i}"])
for i, (k, _) in enumerate(AUSGABEN, start=4):
    wsL[f"F{i}"] = k; calc_cell(wsL[f"F{i}"])
for i, (k, _) in enumerate(EINNAHMEN, start=4):
    wsL[f"H{i}"] = k; calc_cell(wsL[f"H{i}"])
T_END = 3 + len(TURNUS)
A_END = 3 + len(ARTEN)
KA_END = 3 + len(AUSGABEN)
KE_END = 3 + len(EINNAHMEN)
for col, w in zip("ABCDEFGH", [18, 20, 3, 20, 3, 30, 3, 26]):
    wsL.column_dimensions[col].width = w

TURNUS_KEYS = f"Listen!$A$4:$A${T_END}"
TURNUS_VALS = f"Listen!$B$4:$B${T_END}"

def monthly_formula(r, amount_col="C", turnus_col="D"):
    a, t = f"{amount_col}{r}", f"{turnus_col}{r}"
    return (f'=IF(OR({a}="",{t}=""),0,'
            f'{a}*INDEX({TURNUS_VALS},MATCH({t},{TURNUS_KEYS},0))/12)')

# ================= Einnahmen =================
wsE = wb.create_sheet("Einnahmen")
title(wsE, "Einnahmen", "Nettobeträge eintragen, also das, was tatsächlich auf dem Konto ankommt.")
wsE["B4"] = "Summe Einnahmen"; wsE["B4"].font = f(True, 11, NAVY)
FIRST = 7
wsE["E4"] = f"=SUM(E{FIRST}:E{LAST})"; wsE["F4"] = f"=SUM(F{FIRST}:F{LAST})"
for c in ("E4", "F4"):
    calc_cell(wsE[c], EUR, bold=True); wsE[c].fill = TOTAL_FILL
wsE["E3"], wsE["F3"] = "pro Monat", "pro Jahr"
for c in ("E3", "F3"):
    wsE[c].font = f(size=9, color="6B7B8C"); wsE[c].alignment = Alignment(horizontal="right")
header_row(wsE, 6, ["Kategorie", "Position", "Betrag (€)", "Turnus", "Pro Monat (€)", "Pro Jahr (€)", "Hinweis"])

r = FIRST
for kat, items in EINNAHMEN:
    for pos, turnus, note in items:
        wsE[f"A{r}"] = kat; input_cell(wsE[f"A{r}"])
        wsE[f"B{r}"] = pos; input_cell(wsE[f"B{r}"])
        input_cell(wsE[f"C{r}"], EUR)
        wsE[f"D{r}"] = turnus; input_cell(wsE[f"D{r}"])
        wsE[f"E{r}"] = monthly_formula(r); calc_cell(wsE[f"E{r}"], EUR)
        wsE[f"F{r}"] = f"=E{r}*12"; calc_cell(wsE[f"F{r}"], EUR)
        wsE[f"G{r}"] = note or None; wsE[f"G{r}"].font = f(size=9, color="6B7B8C")
        r += 1
for _ in range(SPARE_ROWS):
    for col in "ABC":
        input_cell(wsE[f"{col}{r}"], EUR if col == "C" else None)
    wsE[f"D{r}"] = "monatlich"; input_cell(wsE[f"D{r}"])
    wsE[f"E{r}"] = monthly_formula(r); calc_cell(wsE[f"E{r}"], EUR)
    wsE[f"F{r}"] = f"=E{r}*12"; calc_cell(wsE[f"F{r}"], EUR)
    r += 1
E_LAST_ROW = r - 1

dv = DataValidation(type="list", formula1=f"={TURNUS_KEYS}", allow_blank=True)
dv.add(f"D{FIRST}:D{LAST}"); wsE.add_data_validation(dv)
dv = DataValidation(type="list", formula1=f"=Listen!$H$4:$H${KE_END}", allow_blank=True)
dv.add(f"A{FIRST}:A{LAST}"); wsE.add_data_validation(dv)
for col, w in zip("ABCDEFG", [24, 42, 14, 16, 15, 15, 44]):
    wsE.column_dimensions[col].width = w
wsE.freeze_panes = "A7"

# ================= Ausgaben =================
wsA = wb.create_sheet("Ausgaben")
title(wsA, "Ausgaben", "Jeden Betrag in dem Turnus eintragen, in dem er gezahlt wird. Der Rechner verteilt ihn auf den Monat.")
wsA["B4"] = "Summe Ausgaben (inkl. Sparen)"; wsA["B4"].font = f(True, 11, NAVY)
wsA["F4"] = f"=SUM(F{FIRST}:F{LAST})"; wsA["G4"] = f"=SUM(G{FIRST}:G{LAST})"
for c in ("F4", "G4"):
    calc_cell(wsA[c], EUR, bold=True); wsA[c].fill = TOTAL_FILL
wsA["F3"], wsA["G3"] = "pro Monat", "pro Jahr"
for c in ("F3", "G3"):
    wsA[c].font = f(size=9, color="6B7B8C"); wsA[c].alignment = Alignment(horizontal="right")
header_row(wsA, 6, ["Kategorie", "Position", "Betrag (€)", "Turnus", "Art", "Pro Monat (€)", "Pro Jahr (€)", "Hinweis"])

r = FIRST
for kat, items in AUSGABEN:
    for pos, turnus, art, note in items:
        wsA[f"A{r}"] = kat; input_cell(wsA[f"A{r}"])
        wsA[f"B{r}"] = pos; input_cell(wsA[f"B{r}"])
        input_cell(wsA[f"C{r}"], EUR)
        wsA[f"D{r}"] = turnus; input_cell(wsA[f"D{r}"])
        wsA[f"E{r}"] = art; input_cell(wsA[f"E{r}"])
        wsA[f"F{r}"] = monthly_formula(r); calc_cell(wsA[f"F{r}"], EUR)
        wsA[f"G{r}"] = f"=F{r}*12"; calc_cell(wsA[f"G{r}"], EUR)
        wsA[f"H{r}"] = note or None; wsA[f"H{r}"].font = f(size=9, color="6B7B8C")
        r += 1
for _ in range(SPARE_ROWS):
    for col in "ABCE":
        input_cell(wsA[f"{col}{r}"], EUR if col == "C" else None)
    wsA[f"D{r}"] = "monatlich"; input_cell(wsA[f"D{r}"])
    wsA[f"F{r}"] = monthly_formula(r); calc_cell(wsA[f"F{r}"], EUR)
    wsA[f"G{r}"] = f"=F{r}*12"; calc_cell(wsA[f"G{r}"], EUR)
    r += 1

dv = DataValidation(type="list", formula1=f"={TURNUS_KEYS}", allow_blank=True)
dv.add(f"D{FIRST}:D{LAST}"); wsA.add_data_validation(dv)
dv = DataValidation(type="list", formula1=f"=Listen!$D$4:$D${A_END}", allow_blank=True)
dv.add(f"E{FIRST}:E{LAST}"); wsA.add_data_validation(dv)
dv = DataValidation(type="list", formula1=f"=Listen!$F$4:$F${KA_END}", allow_blank=True)
dv.add(f"A{FIRST}:A{LAST}"); wsA.add_data_validation(dv)
for col, w in zip("ABCDEFGH", [26, 50, 14, 16, 18, 15, 15, 44]):
    wsA.column_dimensions[col].width = w
wsA.freeze_panes = "A7"

# ================= Übersicht =================
wsU = wb.create_sheet("Übersicht", 0)
title(wsU, "Cashflow-Übersicht", "Wird automatisch aus den Tabellen Einnahmen und Ausgaben berechnet. Hier nur die gelben Felder ausfüllen.")
EM = f"Einnahmen!$E${FIRST}:$E${LAST}"
AM = f"Ausgaben!$F${FIRST}:$F${LAST}"
AART = f"Ausgaben!$E${FIRST}:$E${LAST}"
AKAT = f"Ausgaben!$A${FIRST}:$A${LAST}"

header_row(wsU, 4, ["", "Monatlicher Cashflow", "Pro Monat", "Pro Jahr", "Anteil an Einnahmen"])
wsU["A4"].fill = PatternFill(None); wsU["A4"].border = Border()
rows = [
    (5, "Einnahmen (netto)", f"=SUM({EM})"),
    (6, "Fixkosten", f"=SUMIFS({AM},{AART},Listen!$D$4)"),
    (7, "Variable Kosten", f"=SUMIFS({AM},{AART},Listen!$D$5)"),
    (8, "Sparen & Vorsorge", f"=SUMIFS({AM},{AART},Listen!$D$6)"),
    (9, "Ausgaben ohne Zuordnung", f"=SUM({AM})-C6-C7-C8"),
    (10, "Freier Cashflow (nach Sparen)", "=C5-C6-C7-C8-C9"),
]
for rr, lab, form in rows:
    wsU[f"B{rr}"] = lab; calc_cell(wsU[f"B{rr}"])
    wsU[f"C{rr}"] = form; calc_cell(wsU[f"C{rr}"], EUR0)
    wsU[f"D{rr}"] = f"=C{rr}*12"; calc_cell(wsU[f"D{rr}"], EUR0)
    wsU[f"E{rr}"] = f"=IF($C$5=0,0,C{rr}/$C$5)"; calc_cell(wsU[f"E{rr}"], PCT)
wsU["B9"].comment = Comment("Ausgaben, bei denen in der Spalte Art nichts ausgewählt ist. Sollte 0 sein.", "Cashflow-Rechner")
for col in "BCDE":
    wsU[f"{col}5"].font = f(True)
    wsU[f"{col}10"].font = f(True, 11, NAVY)
    wsU[f"{col}10"].fill = TOTAL_FILL
wsU["B11"] = "Sparquote inkl. freiem Cashflow"; calc_cell(wsU["B11"])
wsU["E11"] = "=IF($C$5=0,0,(C8+C10)/$C$5)"; calc_cell(wsU["E11"], PCT, bold=True)
for col in "CD":
    calc_cell(wsU[f"{col}11"])

# Bewertungstext zum Cashflow
wsU["B12"] = "Ergebnis"; calc_cell(wsU["B12"])
wsU["C12"] = ('=IF(C5=0,"Bitte zuerst Einnahmen eintragen",'
              'IF(C10<0,"Es wird mehr ausgegeben als eingenommen",'
              'IF(C10=0,"Einnahmen und Ausgaben gleichen sich genau aus",'
              '"Jeden Monat bleibt Geld übrig")))')
wsU.merge_cells("C12:E12")
calc_cell(wsU["C12"], bold=True)
for col in "DE":
    wsU[f"{col}12"].border = BOX

# Ampel für freien Cashflow
wsU.conditional_formatting.add("C10:E10", CellIsRule(operator="lessThan", formula=["0"], font=Font(name=FONT, bold=True, color="A5293B"), fill=PatternFill("solid", fgColor="FAF0F1")))
wsU.conditional_formatting.add("C10:D10", CellIsRule(operator="greaterThan", formula=["0"], font=Font(name=FONT, bold=True, color="1E7B34"), fill=PatternFill("solid", fgColor="E6F4EA")))
wsU.conditional_formatting.add("C12:E12", FormulaRule(formula=["$C$10<0"], font=Font(name=FONT, bold=True, color="A5293B")))
wsU.conditional_formatting.add("C12:E12", FormulaRule(formula=["AND($C$5>0,$C$10>0)"], font=Font(name=FONT, bold=True, color="1E7B34")))

# 50-30-20 Orientierung
header_row(wsU, 14, ["", "Orientierung: 50-30-20-Regel", "Ihr Anteil", "Richtwert", "Einschätzung"])
wsU["A14"].fill = PatternFill(None); wsU["A14"].border = Border()
orient = [
    (15, "Fixkosten (höchstens)", "=E6", 0.5, '=IF($C$5=0,"",IF(C15<=D15,"im Rahmen","über Richtwert"))'),
    (16, "Variable Kosten (höchstens)", "=E7", 0.3, '=IF($C$5=0,"",IF(C16<=D16,"im Rahmen","über Richtwert"))'),
    (17, "Sparen & Vorsorge inkl. freiem Cashflow (mindestens)", "=E11", 0.2, '=IF($C$5=0,"",IF(C17>=D17,"erreicht","unter Richtwert"))'),
]
for rr, lab, ist, richt, status in orient:
    wsU[f"B{rr}"] = lab; calc_cell(wsU[f"B{rr}"])
    wsU[f"C{rr}"] = ist; calc_cell(wsU[f"C{rr}"], PCT)
    wsU[f"D{rr}"] = richt; input_cell(wsU[f"D{rr}"], "0%")
    wsU[f"E{rr}"] = status; calc_cell(wsU[f"E{rr}"], bold=True)
wsU["D15"].comment = Comment("Richtwert nach der verbreiteten 50-30-20-Faustregel (50 % Fixkosten, 30 % Wünsche, 20 % Sparen). Kann angepasst werden.", "Cashflow-Rechner")
wsU.conditional_formatting.add("E15:E17", FormulaRule(formula=['OR(E15="im Rahmen",E15="erreicht")'], font=Font(name=FONT, bold=True, color="1E7B34")))
wsU.conditional_formatting.add("E15:E17", FormulaRule(formula=['OR(E15="über Richtwert",E15="unter Richtwert")'], font=Font(name=FONT, bold=True, color="A5293B")))

# Notgroschen
header_row(wsU, 19, ["", "Notgroschen", "Wert", "", ""])
wsU["A19"].fill = PatternFill(None); wsU["A19"].border = Border()
notg = [
    (20, "Monatliche Lebenshaltungskosten (Fix + Variabel)", "=C6+C7+C9", EUR0, False),
    (21, "Gewünschte Reserve in Monaten", 3, "0", True),
    (22, "Ziel-Notgroschen", "=C20*C21", EUR0, False),
    (23, "Aktueller Notgroschen (Tagesgeld, Girokonto)", None, EUR0, True),
    (24, "Noch fehlend", "=MAX(0,C22-C23)", EUR0, False),
    (25, "Reserve reicht für (Monate)", "=IF(C20=0,0,C23/C20)", '0.0;-0.0;"–"', False),
]
for rr, lab, val, fmt, is_input in notg:
    wsU[f"B{rr}"] = lab; calc_cell(wsU[f"B{rr}"])
    wsU[f"C{rr}"] = val
    (input_cell if is_input else calc_cell)(wsU[f"C{rr}"], fmt)
wsU["C21"].comment = Comment("Faustregel: 3 bis 6 Monatsausgaben. Selbstständige und Alleinverdiener eher 6 Monate.", "Cashflow-Rechner")
calc_cell(wsU["C22"], EUR0, bold=True)
wsU.conditional_formatting.add("C24", CellIsRule(operator="greaterThan", formula=["0"], font=Font(name=FONT, bold=True, color="A5293B")))

# Ausgaben nach Kategorie (Datenbasis für das Diagramm)
header_row(wsU, 27, ["", "Ausgaben nach Kategorie", "Pro Monat", "Pro Jahr", "Anteil an Einnahmen"])
wsU["A27"].fill = PatternFill(None); wsU["A27"].border = Border()
rr = 28
for i in range(len(AUSGABEN)):
    lr = 4 + i
    wsU[f"B{rr}"] = f"=Listen!$F${lr}"; calc_cell(wsU[f"B{rr}"])
    wsU[f"B{rr}"].font = f(color="008000")
    wsU[f"C{rr}"] = f"=SUMIFS({AM},{AKAT},B{rr})"; calc_cell(wsU[f"C{rr}"], EUR0)
    wsU[f"D{rr}"] = f"=C{rr}*12"; calc_cell(wsU[f"D{rr}"], EUR0)
    wsU[f"E{rr}"] = f"=IF($C$5=0,0,C{rr}/$C$5)"; calc_cell(wsU[f"E{rr}"], PCT)
    rr += 1
KAT_LAST = rr - 1
wsU[f"B{rr}"] = "Summe"; calc_cell(wsU[f"B{rr}"], bold=True)
wsU[f"C{rr}"] = f"=SUM(C28:C{KAT_LAST})"; calc_cell(wsU[f"C{rr}"], EUR0, bold=True)
wsU[f"D{rr}"] = f"=SUM(D28:D{KAT_LAST})"; calc_cell(wsU[f"D{rr}"], EUR0, bold=True)
wsU[f"E{rr}"] = f"=IF($C$5=0,0,C{rr}/$C$5)"; calc_cell(wsU[f"E{rr}"], PCT, bold=True)
for col in "BCDE":
    wsU[f"{col}{rr}"].fill = TOTAL_FILL
SUM_ROW = rr

chart = BarChart()
chart.type = "bar"
chart.title = "Ausgaben pro Monat nach Kategorie"
chart.legend = None
chart.add_data(Reference(wsU, min_col=3, min_row=27, max_row=KAT_LAST), titles_from_data=True)
chart.set_categories(Reference(wsU, min_col=2, min_row=28, max_row=KAT_LAST))
chart.y_axis.numFmt = '#,##0 "€"'
chart.x_axis.scaling.orientation = "maxMin"
chart.height, chart.width = 9, 15
chart.series[0].graphicalProperties.solidFill = NAVY_500
wsU.add_chart(chart, "G4")

for col, w in zip("ABCDE", [2, 50, 16, 16, 22]):
    wsU.column_dimensions[col].width = w

# ================= Anleitung =================
wsI = wb.create_sheet("Anleitung", 0)
title(wsI, "Cashflow-Rechner", "Finanz-Medizin · We Build Wealth")
lines = [
    ("So funktioniert der Rechner", "h"),
    ("1. Im Blatt Einnahmen alle Nettoeinkünfte eintragen.", ""),
    ("2. Im Blatt Ausgaben jeden Betrag so eintragen, wie er gezahlt wird, und den passenden Turnus wählen. Eine Jahresprämie also als Jahresbetrag mit Turnus jährlich.", ""),
    ("3. Positionen, die nicht zutreffen, einfach leer lassen. Eigene Positionen in die leeren gelben Zeilen am Ende jeder Tabelle schreiben und Kategorie, Turnus und Art auswählen.", ""),
    ("4. Im Blatt Übersicht den aktuellen Notgroschen eintragen. Alles andere rechnet sich automatisch.", ""),
    ("", ""),
    ("Legende", "h"),
    ("Gelb hinterlegt, blaue Schrift", "legend_input"),
    ("Weiß, schwarze Schrift", "legend_calc"),
    ("", ""),
    ("Beispiel", "h"),
]
r = 4
for text, kind in lines:
    c = wsI[f"A{r}"]
    c.value = text or None
    if kind == "h":
        c.font = f(True, 12, NAVY)
    elif kind == "legend_input":
        input_cell(c)
        wsI[f"B{r}"] = "Eingabefeld: hier eigene Werte eintragen oder auswählen"
        wsI[f"B{r}"].font = f()
    elif kind == "legend_calc":
        calc_cell(c)
        wsI[f"B{r}"] = "Formel: wird automatisch berechnet, bitte nicht überschreiben"
        wsI[f"B{r}"].font = f()
    else:
        c.font = f()
        c.alignment = Alignment(wrap_text=True, vertical="top")
        wsI.merge_cells(f"A{r}:F{r}")
        if len(text) > 95:
            wsI.row_dimensions[r].height = 28
    r += 1
ex_head = r
for i, lab in enumerate(["Kategorie", "Position", "Betrag (€)", "Turnus", "Art", "Pro Monat (€)"], start=1):
    c = wsI.cell(row=ex_head, column=i, value=lab)
    c.font = f(True, 10, "FFFFFF"); c.fill = HEAD_FILL; c.border = BOX
ex = ex_head + 1
wsI[f"A{ex}"] = "Mobilität"; input_cell(wsI[f"A{ex}"])
wsI[f"B{ex}"] = "Kfz-Versicherung"; input_cell(wsI[f"B{ex}"])
wsI[f"C{ex}"] = 720; input_cell(wsI[f"C{ex}"], EUR)
wsI[f"D{ex}"] = "jährlich"; input_cell(wsI[f"D{ex}"])
wsI[f"E{ex}"] = "Fixkosten"; input_cell(wsI[f"E{ex}"])
wsI[f"F{ex}"] = monthly_formula(ex); calc_cell(wsI[f"F{ex}"], EUR)
wsI[f"A{ex+1}"] = "Der Jahresbeitrag von 720 € wird als 60 € pro Monat in den Cashflow eingerechnet."
wsI[f"A{ex+1}"].font = f(size=9, color="6B7B8C", italic=True)

r = ex + 3
wsI[f"A{r}"] = "Was die Übersicht zeigt"; wsI[f"A{r}"].font = f(True, 12, NAVY)
for text in [
    "Freier Cashflow: was nach allen Ausgaben und dem regelmäßigen Sparen pro Monat übrig bleibt.",
    "50-30-20-Regel: verbreitete Faustregel für die Aufteilung des Nettoeinkommens. Die Richtwerte lassen sich anpassen.",
    "Notgroschen: Rücklage für 3 bis 6 Monate Lebenshaltungskosten, damit Reparaturen oder Einkommensausfälle nicht über Kredite laufen.",
]:
    r += 1
    wsI[f"A{r}"] = text; wsI[f"A{r}"].font = f()
    wsI[f"A{r}"].alignment = Alignment(wrap_text=True, vertical="top")
    wsI.merge_cells(f"A{r}:F{r}")
    wsI.row_dimensions[r].height = 28
r += 2
wsI[f"A{r}"] = "Hinweis: Der Rechner dient der eigenen Orientierung und ersetzt keine individuelle Beratung."
wsI[f"A{r}"].font = f(size=9, color="6B7B8C", italic=True)
for col, w in zip("ABCDEF", [30, 52, 14, 16, 16, 16]):
    wsI.column_dimensions[col].width = w

# Reihenfolge: Anleitung, Übersicht, Einnahmen, Ausgaben, Listen
wb._sheets = [wb["Anleitung"], wb["Übersicht"], wb["Einnahmen"], wb["Ausgaben"], wb["Listen"]]
wb.active = 0
for ws in wb.worksheets:
    ws.sheet_properties.tabColor = {"Anleitung": NAVY, "Übersicht": RED, "Einnahmen": NAVY_500, "Ausgaben": NAVY_500, "Listen": "6B7B8C"}[ws.title]

wb.save(OUT)
print("gespeichert:", OUT)
