#!/usr/bin/env python3
"""
VMA-Zeiterfassung Automationssystem
Erzeugt fertige Zeitnachweise pro Mitarbeiter nach Regeln für Brandenburg
"""

import sys
from datetime import datetime, timedelta
from pathlib import Path
from openpyxl import load_workbook
from openpyxl.utils import get_column_letter
import holidays
import random
import csv
from typing import Dict, List, Tuple, Optional

# ============================================================================
# KONSTANTEN & KONFIGURATION
# ============================================================================

EMPLOYEES = {
    'Thomas': {
        'fullname': 'Thomas Rückheim',
        'max_hours': 173.30,
        'type': 'fulltime',
        'vma_target': (18, 20),  # Zielbereich VMA-Tage
        'style': 'high_vma',  # viele Tage 8,10-8,50, manche kurze Tage
        'short_range': (330, 410),  # Kurztage 5,30-6,50
    },
    'Ben': {
        'fullname': 'Ben Jason Pinske',
        'max_hours': 162.50,
        'type': 'fulltime_lower',
        'vma_target': (12, 16),
        'style': 'medium_vma',
        'short_range': (360, 410),  # meist 6,00-8,50
    },
    'Rufat': {
        'fullname': 'Rufat Guseynov',
        'max_hours': 156.00,
        'type': 'flexible',
        'vma_target': (12, 14),  # ca. 13
        'style': 'flexible',
        'short_range': (320, 410),  # Kurztage 5,20-6,50
    },
    'Hayatin': {
        'fullname': 'Hayatin Yuscen',
        'max_hours': 112.00,
        'type': 'flex_part_time',
        'vma_target': (10, 13),
        'style': 'irregular',
        'short_range': (490, 530),  # nur lange Einsatztage
    },
}

# Spalten für Tage (B=1, C=2, ... AF=31)
# Bug 2026-09-24: war faelschlich range(4,35) = D bis AH -> 2-Spalten-Offset,
# alle Werte landeten 2 Kalendertage zu spaet. Zeile 12 (Tagesformel) bestaetigt
# B12 = Tag 1: DATE($D$3,$E$3,COLUMN()-1) mit COLUMN()=2 ergibt Tag 1.
DAYS_COLUMNS = [get_column_letter(i) for i in range(2, 33)]  # B bis AF

# Zeilen
ROW_YEAR = 3
ROW_MONTH = 3
COL_YEAR = 'D'
COL_MONTH = 'E'
ROW_DAYS = 12
ROW_WEEKDAYS = 13
ROW_WORK_TIME = 14
ROW_PAID_LEAVE = 15
ROW_HOLIDAYS = 16
ROW_SICK = 17
ROW_OTHER_ABSENCE = 18
ROW_VMA_DAY = 20
ROW_VMA_EUR = 21


# ============================================================================
# HILFSFUNKTIONEN: HH,MM-FORMAT KONVERTIERUNG
# ============================================================================

def hhmm_to_minutes(value: float) -> int:
    """Konvertiert HH,MM-Format (z.B. 8.35) zu Minuten"""
    if value is None or value == "" or value == "-":
        return 0
    value = float(value)
    hours = int(value)
    minutes = round((value - hours) * 100)  # Die Dezimalstellen sind Minuten
    return hours * 60 + minutes

def minutes_to_hhmm(minutes: int) -> float:
    """Konvertiert Minuten zurück zu HH,MM-Format"""
    if minutes <= 0:
        return 0.0
    hours = minutes // 60
    mins = minutes % 60
    return float(f"{hours}.{mins:02d}")

def add_minutes_hhmm(val1: float, val2: float) -> float:
    """Addiert zwei HH,MM-Werte korrekt"""
    m1 = hhmm_to_minutes(val1)
    m2 = hhmm_to_minutes(val2)
    return minutes_to_hhmm(m1 + m2)

def compare_hhmm(val: float, threshold: float) -> bool:
    """Vergleicht zwei HH,MM-Werte (val > threshold)"""
    return hhmm_to_minutes(val) > hhmm_to_minutes(threshold)

# ============================================================================
# FEIERTAGE BRANDENBURG
# ============================================================================

def get_brandenburg_holidays(year: int, month: int) -> Dict[int, str]:
    """Gibt Feiertage für Brandenburg als Dict {Tag: Name} zurück"""
    de_holidays = holidays.Germany(state='BB', years=year)
    result = {}
    for date, name in de_holidays.items():
        if date.year == year and date.month == month:
            result[date.day] = name
    return result

# ============================================================================
# ABWESENHEITEN LADEN
# ============================================================================

def read_absences_from_file(filepath: Path, year: int, month: int) -> Dict[str, List[Tuple[int, str, float]]]:
    """
    Liest Abwesenheiten aus CSV/XLSX
    Format: Mitarbeiter, Startdatum (dd.mm.yyyy), Enddatum (dd.mm.yyyy), Art (krank|urlaub), Stunden_pro_Tag
    Gibt zurück: {employee: [(day, type, hours), ...]}
    """
    result = {}

    if not filepath.exists():
        return result

    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                emp = row.get('Mitarbeiter', '').strip()
                start_str = row.get('Startdatum', '').strip()  # dd.mm.yyyy
                end_str = row.get('Enddatum', '').strip()
                absence_type = row.get('Art', '').strip().lower()  # krank, urlaub
                hours = float(row.get('Stunden_pro_Tag', '8.00'))

                if not emp or not start_str:
                    continue

                # Parse Daten
                try:
                    start_date = datetime.strptime(start_str, '%d.%m.%Y').date()
                    end_date = datetime.strptime(end_str, '%d.%m.%Y').date() if end_str else start_date
                except:
                    continue

                # Nur Tage des Zielmonats
                current = start_date
                while current <= end_date:
                    if current.year == year and current.month == month:
                        if emp not in result:
                            result[emp] = []
                        result[emp].append((current.day, absence_type, hours))
                    current += timedelta(days=1)

    except Exception as e:
        print(f"Fehler beim Lesen von {filepath}: {e}")

    return result

# ============================================================================
# STUNDENGENERIERUNG PRO MITARBEITER
# ============================================================================

def generate_hours_for_employee(
    employee_key: str,
    year: int,
    month: int,
    holidays_dict: Dict[int, str],
    absences: Dict[str, List[Tuple[int, str, float]]],
) -> Dict[int, Dict[str, float]]:
    """
    Generiert realistische Stunden für einen Mitarbeiter.
    Gibt zurück: {day: {work, leave, holiday, sick, other}}
    """
    emp_config = EMPLOYEES[employee_key]
    max_hours = emp_config['max_hours']
    emp_absences = absences.get(employee_key, [])

    # Absence-Lookup
    absence_map = {}  # day -> (type, hours)
    for day, abs_type, abs_hours in emp_absences:
        absence_map[day] = (abs_type, abs_hours)

    # Bestimme Tage im Monat
    import calendar
    num_days = calendar.monthrange(year, month)[1]

    result = {}
    total_minutes = 0
    vma_days = 0
    week_minutes = {}  # week_start_date -> minutes
    current_week_monday = None
    current_week_minutes = 0
    week_days = []

    # Hayatin: feste Zahl Einsatztage (10-13 laut Vorgabe), zufaellig verteilt
    einsatztage = None
    if emp_config['style'] == 'irregular':
        frei = [d for d in range(1, num_days + 1)
                if datetime(year, month, d).weekday() < 5
                and d not in holidays_dict and d not in absence_map]
        max_tage = hhmm_to_minutes(max_hours) // 510  # Tage a ca. 8,30
        anzahl = min(len(frei), max_tage, random.randint(12, 13))
        # hoechstens 4 Einsatztage pro Woche, sonst reisst die 40:00-Grenze
        random.shuffle(frei)
        einsatztage, pro_woche = set(), {}
        for d in frei:
            woche = datetime(year, month, d).isocalendar()[1]
            if len(einsatztage) < anzahl and pro_woche.get(woche, 0) < 4:
                einsatztage.add(d)
                pro_woche[woche] = pro_woche.get(woche, 0) + 1

    for day in range(1, num_days + 1):
        date = datetime(year, month, day).date()
        weekday = date.weekday()  # 0=Mo, 6=So

        # Wochenstart (Montag)
        if weekday == 0:
            if current_week_monday is not None:
                week_minutes[current_week_monday] = current_week_minutes
            current_week_monday = date
            current_week_minutes = 0
            week_days = []

        result[day] = {'work': 0.0, 'leave': 0.0, 'holiday': 0.0, 'sick': 0.0, 'other': 0.0}

        # 1. Prüfe Feiertag
        # Feiertag am Wochenende: keine Stunden eintragen (Vorgabe)
        if day in holidays_dict and weekday < 5:
            # Feiertag: Grundsätzlich 8,00 wenn Mitarbeiter normalerweise arbeitet
            # Aber nur wenn nicht bereits Absence vorhanden
            if day not in absence_map:
                result[day]['holiday'] = 8.0
            else:
                # Feiertag + Krankheit: Feiertag gewinnt
                abs_type, abs_hours = absence_map[day]
                result[day]['holiday'] = abs_hours
            continue

        # 2. Prüfe Abwesenheit (Urlaub oder Krankheit)
        if day in absence_map:
            abs_type, abs_hours = absence_map[day]
            if abs_type == 'urlaub':
                result[day]['leave'] = abs_hours
            elif abs_type == 'krank':
                result[day]['sick'] = abs_hours
            else:
                result[day]['other'] = abs_hours
            continue

        # 3. Normalarbeitstag - generiere realistische Stunden
        if weekday >= 5:  # Sa/So: normalerweise kein Arbeitstag
            continue
        if einsatztage is not None and day not in einsatztage:
            continue

        # Generiere Stunden basierend auf Mitarbeiterprofil
        work_hours = _generate_daily_hours(
            employee_key, day, weekday, year, month, num_days
        )

        if work_hours > 0:
            work_minutes = hhmm_to_minutes(work_hours)

            # Prüfe Wochenlimit 40:00 (2400 Minuten)
            if current_week_minutes + work_minutes > 2400:  # Über Limit
                allowed = 2400 - current_week_minutes
                # Kurztag nie unter den Kurztag-Bereich des Mitarbeiters: fehlende Minuten in 5er-Schritten
                # vom laengsten frueheren Tag derselben Woche nehmen
                while allowed < emp_config['short_range'][0]:
                    longest = max(week_days, key=lambda d: hhmm_to_minutes(result[d]['work']), default=None)
                    if longest is None or hhmm_to_minutes(result[longest]['work']) <= emp_config['short_range'][0]:
                        break
                    result[longest]['work'] = minutes_to_hhmm(hhmm_to_minutes(result[longest]['work']) - 5)
                    current_week_minutes -= 5
                    total_minutes -= 5
                    allowed += 5
                work_minutes = (max(0, min(work_minutes, allowed)) // 5) * 5

            week_days.append(day)
            current_week_minutes += work_minutes
            result[day]['work'] = minutes_to_hhmm(work_minutes)
            total_minutes += work_minutes

            # Prüfe VMA (> 8,00)
            if compare_hhmm(result[day]['work'], 8.0):
                vma_days += 1

    # Letzte Woche
    if current_week_monday is not None:
        week_minutes[current_week_monday] = current_week_minutes

    # Monatsgrenze: zuerst einzelne Tage (Freitage vorn) zu Kurztagen im
    # Bereich des Mitarbeiters machen, Rest in 5er-Schritten vom laengsten Tag.
    # So bleiben die uebrigen Tage ueber 8,00 und behalten die VMA.
    short_lo, short_hi = emp_config['short_range']
    limit = hhmm_to_minutes(max_hours)

    def mins(d):
        return hhmm_to_minutes(result[d]['work'])

    def overage():
        return sum(mins(d) for d in result if result[d]['work'] > 0) - limit

    work_days = [d for d in result if result[d]['work'] > 0]
    # 1. Lange Tage zuerst kuerzen - kostet keine VMA-Tage. Jeder Tag hat
    # eine eigene Untergrenze 8,05-8,25 und es wird zufaellig gekuerzt,
    # sonst landen alle Tage auf demselben Wert (z.B. ueberall 8,15).
    untergrenze = {d: random.randrange(485, 506, 5) for d in work_days}
    while overage() > 0:
        lang = [d for d in work_days if mins(d) > untergrenze[d]]
        if not lang:
            break
        d = random.choice(lang)
        result[d]['work'] = minutes_to_hhmm(mins(d) - 5)
    # 2. Reicht das nicht: einzelne Tage (Freitage vorn) zu Kurztagen
    kandidaten = sorted(work_days, key=lambda d: (datetime(year, month, d).weekday() != 4, random.random()))
    for d in kandidaten:
        if overage() <= 0:
            break
        if mins(d) <= short_hi:
            continue
        ziel = random.randrange(short_lo, short_hi + 1, 5)
        result[d]['work'] = minutes_to_hhmm(max(ziel, mins(d) - overage()))
    while overage() > 0:
        # VMA-Tage (ueber 8,00) nicht unter 8,05 kuerzen, sonst geht die VMA verloren
        kuerzbar = [d for d in work_days
                    if mins(d) - 5 >= (485 if mins(d) > 480 else short_lo)]
        if not kuerzbar:
            break
        d = random.choice(kuerzbar)
        result[d]['work'] = minutes_to_hhmm(mins(d) - 5)

    return result

def _generate_daily_hours(
    employee_key: str,
    day: int,
    weekday: int,
    year: int,
    month: int,
    num_days: int,
) -> float:
    """Generiert realistische Stundenanzahl für einen Tag"""
    emp = EMPLOYEES[employee_key]
    style = emp['style']


    # Alle Werte in vollen 5-Minuten-Schritten (Vorbild: echte Referenzdatei
    # nutzt ausschliesslich :00/:05/:10/.../:55, nie krumme Minuten wie :13).
    # randrange(a, b+1, 5) statt randint(a, b) - a und b muessen Vielfache
    # von 5 sein (sind sie in allen Bereichen unten bereits).
    kurz = random.randrange(emp['short_range'][0], emp['short_range'][1] + 1, 5)

    # Tagesbereiche nach der echten Referenzdatei (Thomas Juni: meist
    # 8,05-8,30, einzelne 8,40, kurze Tage 6,40-7,05). Hoehere Werte
    # verbrauchen das Monatsbudget und kosten VMA-Tage.
    if style == 'high_vma':  # Thomas: viele VMA-Tage, einzelne kurze Tage
        r = random.random()
        if r < 0.80:
            mins = random.randrange(485, 511, 5)   # 8,05-8,30
        elif r < 0.92:
            mins = random.randrange(510, 531, 5)   # 8,30-8,50
        else:
            mins = kurz
        return minutes_to_hhmm(mins)

    elif style == 'medium_vma':  # Ben: gemischt, haeufig kurze Freitage
        r = random.random()
        if weekday == 4 and r < 0.6:
            mins = kurz
        elif r < 0.75:
            mins = random.randrange(485, 511, 5)   # 8,05-8,30
        elif r < 0.85:
            mins = random.randrange(510, 531, 5)   # 8,30-8,50
        else:
            mins = kurz
        return minutes_to_hhmm(mins)

    elif style == 'flexible':  # Rufat: viele mittlere Tage, Freitage oft kuerzer
        r = random.random()
        if weekday == 4 and r < 0.5:
            mins = kurz
        elif r < 0.80:
            mins = random.randrange(490, 526, 5)   # 8,10-8,45
        elif r < 0.88:
            mins = random.randrange(525, 531, 5)   # 8,45-8,50
        else:
            mins = kurz
        return minutes_to_hhmm(mins)

    elif style == 'irregular':  # Hayatin: Einsatztage werden vorab gewaehlt
        return minutes_to_hhmm(random.randrange(490, 531, 5))  # 8,10-8,50

    return 0.0

    return 0.0

# ============================================================================
# EXCEL-VERARBEITUNG
# ============================================================================

def load_template(template_path: Path) -> Tuple:
    """Lädt die VMA-Vorlage"""
    if not template_path.exists():
        raise FileNotFoundError(f"Vorlage nicht gefunden: {template_path}")
    wb = load_workbook(template_path)
    ws = wb.active
    return wb, ws

def set_month_year(ws, year: int, month: int):
    """Setzt D3 (Jahr) und E3 (Monat)"""
    ws[f'{COL_YEAR}{ROW_YEAR}'] = year
    ws[f'{COL_MONTH}{ROW_MONTH}'] = month

def write_data_to_worksheet(
    ws,
    year: int,
    month: int,
    data: Dict[int, Dict[str, float]],
    holidays_dict: Dict[int, str],
):
    """
    Schreibt Stundendaten in die Zeilen
    data: {day: {work, leave, holiday, sick, other}}

    Die Vorlage ist eine bereits ausgefuellte Datei eines frueheren Monats
    (echte Zahlen aus Juni), kein leeres Formular. Deshalb MUESSEN die
    Eingabezeilen zuerst geleert/zurueckgesetzt werden - sonst bleiben alte
    Werte an Tagen stehen, die der neue Monat nicht (mehr) befuellt (z.B.
    Krankheitstage, an denen 'work' bewusst 0 ist und daher nie geschrieben
    wuerde). Bug 2026-09-24: fehlende Reset-Schritt fuehrte dazu, dass an
    Kranktagen weiterhin die alte Arbeitszeit aus der Vorlage sichtbar war.
    """
    for col in DAYS_COLUMNS:  # immer alle 31 Tagesspalten (B bis AF) zuruecksetzen
        # Arbeitszeit (Zeile 14) und bezahlter Urlaub (Zeile 15) sind reine
        # Eingabefelder ohne Formel-Default -> auf leer zuruecksetzen.
        ws[f'{col}{ROW_WORK_TIME}'] = None
        ws[f'{col}{ROW_PAID_LEAVE}'] = None
        # Feiertag/Krankheit/Sonstige haben einen Formel-Default ("-" wenn
        # der Tag existiert, sonst leer) -> Formel wiederherstellen statt
        # nur zu leeren, damit das Template-Verhalten erhalten bleibt.
        ws[f'{col}{ROW_HOLIDAYS}'] = f'=IF({col}$12="","","-")'
        ws[f'{col}{ROW_SICK}'] = f'=IF({col}$12="","","-")'
        ws[f'{col}{ROW_OTHER_ABSENCE}'] = f'=IF({col}$12="","","-")'

    import calendar
    num_days = calendar.monthrange(year, month)[1]

    for day in range(1, num_days + 1):
        col = DAYS_COLUMNS[day - 1]  # B für Tag 1
        day_data = data[day]

        # Arbeitszeit (Zeile 14)
        if day_data['work'] > 0:
            ws[f'{col}{ROW_WORK_TIME}'] = day_data['work']

        # Bezahlter Urlaub (Zeile 15)
        if day_data['leave'] > 0:
            ws[f'{col}{ROW_PAID_LEAVE}'] = day_data['leave']

        # Feiertag (Zeile 16)
        if day_data['holiday'] > 0:
            ws[f'{col}{ROW_HOLIDAYS}'] = day_data['holiday']

        # Krankheit (Zeile 17)
        if day_data['sick'] > 0:
            ws[f'{col}{ROW_SICK}'] = day_data['sick']

        # Sonstige Fehlzeiten (Zeile 18)
        if day_data['other'] > 0:
            ws[f'{col}{ROW_OTHER_ABSENCE}'] = day_data['other']

def fix_number_formats(ws):
    # xlsx speichert Formate in US-Notation: '0,00' heisst dort Tausendertrenner
    # und wird als '008' angezeigt. '0.00' zeigt deutsches Excel als '8,40'.
    for row in ws.iter_rows():
        for cell in row:
            if cell.number_format == '0,00':
                cell.number_format = '0.00'

def validate_workbook(
    ws,
    year: int,
    month: int,
    employee_key: str,
    data: Dict[int, Dict[str, float]],
) -> Dict:
    """Validiert die Datei und gibt Report zurück"""
    emp = EMPLOYEES[employee_key]
    max_hours = emp['max_hours']

    import calendar
    num_days = calendar.monthrange(year, month)[1]

    # Berechne Summen
    total_work_minutes = 0
    total_leave_minutes = 0
    total_holiday_minutes = 0
    total_sick_minutes = 0
    total_other_minutes = 0
    vma_days = 0
    holiday_days = 0
    leave_days = 0
    sick_days = 0

    weekly_totals = {}
    current_week = None
    current_week_start_day = None

    for day in range(1, num_days + 1):
        date = datetime(year, month, day).date()
        weekday = date.weekday()

        if weekday == 0:  # Montag
            if current_week is not None:
                weekly_totals[current_week_start_day] = current_week
            current_week = 0
            current_week_start_day = day

        day_data = data[day]

        work_min = hhmm_to_minutes(day_data['work'])
        leave_min = hhmm_to_minutes(day_data['leave'])
        holiday_min = hhmm_to_minutes(day_data['holiday'])
        sick_min = hhmm_to_minutes(day_data['sick'])
        other_min = hhmm_to_minutes(day_data['other'])

        total_work_minutes += work_min
        total_leave_minutes += leave_min
        total_holiday_minutes += holiday_min
        total_sick_minutes += sick_min
        total_other_minutes += other_min

        if current_week is not None:
            current_week += work_min

        if holiday_min > 0:
            holiday_days += 1
        if leave_min > 0:
            leave_days += 1
        if sick_min > 0:
            sick_days += 1

        # VMA-Tag: Arbeitszeit > 8,00
        if day_data['work'] > 0 and compare_hhmm(day_data['work'], 8.0):
            vma_days += 1

    if current_week is not None:
        weekly_totals[current_week_start_day] = current_week

    # Konvertiere zurück zu HH,MM
    total_hours = minutes_to_hhmm(total_work_minutes)
    total_max = max_hours
    diff_to_max = minutes_to_hhmm(hhmm_to_minutes(total_max) - total_work_minutes)

    # Wochenlimit-Prüfung
    week_ok = all(mins <= 2400 for mins in weekly_totals.values())

    # Auffälligkeiten
    issues = []
    if total_work_minutes > hhmm_to_minutes(max_hours):
        issues.append(f"⚠ Gesamtstunden ({total_hours}) überschreiten Maximum ({total_max})")
    if not week_ok:
        issues.append(f"⚠ Mindestens eine Woche überschreitet 40:00")

    return {
        'employee': emp['fullname'],
        'month': month,
        'year': year,
        'max_hours': total_max,
        'actual_hours': total_hours,
        'diff_to_max': diff_to_max,
        'vma_days': vma_days,
        'holidays': holiday_days,
        'leave_days': leave_days,
        'sick_days': sick_days,
        'work_days': sum(1 for d in data.values() if d['work'] > 0),
        'week_ok': week_ok,
        'issues': issues,
        'status': 'OK' if not issues else 'WARNUNG',
    }

# ============================================================================
# HAUPTFUNKTION
# ============================================================================

def create_vma_file(
    template_path: Path,
    employee_key: str,
    year: int,
    month: int,
    output_dir: Path,
    absences_file: Optional[Path] = None,
) -> Tuple[Path, Dict]:
    """
    Erstellt eine VMA-Datei für einen Mitarbeiter.
    """
    # 1. Lade Vorlage
    wb, ws = load_template(template_path)

    # 2. Hole Feiertage
    holidays_dict = get_brandenburg_holidays(year, month)

    # 3. Lade Abwesenheiten
    absences = {}
    if absences_file and absences_file.exists():
        absences = read_absences_from_file(absences_file, year, month)

    # 4. Generiere Stunden
    # Zufall bis zu 30x wiederholen, die Version naechst am VMA-Ziel nehmen
    lo, hi = EMPLOYEES[employee_key]['vma_target']
    def abstand(d):
        werte = [hhmm_to_minutes(t['work']) for t in d.values() if t['work'] > 0]
        vma = sum(1 for m in werte if m > 480)
        ziel = 0 if lo <= vma <= hi else min(abs(vma - lo), abs(vma - hi))
        # auffaellige Wiederholung (ein Wert an mehr als 30% der Tage) verwerfen
        haeufigster = max((werte.count(m) for m in set(werte)), default=0)
        return ziel + (1 if haeufigster > max(4, len(werte) * 0.3) else 0)
    data = None
    for _ in range(30):
        versuch = generate_hours_for_employee(
            employee_key, year, month, holidays_dict, absences
        )
        if data is None or abstand(versuch) < abstand(data):
            data = versuch
        if abstand(data) == 0:
            break

    # 5. Setze Monat/Jahr, Name und Monatstext (A9/H3 sind feste Texte der
    # Vorlage, keine Formeln - sonst steht Thomas/06-26 in jeder Datei)
    set_month_year(ws, year, month)
    ws['A9'] = EMPLOYEES[employee_key]['fullname']
    ws['H3'] = f'für Monat {month:02d}/{year % 100:02d}'

    # 6. Schreibe Daten
    write_data_to_worksheet(ws, year, month, data, holidays_dict)
    fix_number_formats(ws)

    # 7. Validiere
    report = validate_workbook(ws, year, month, employee_key, data)

    # 8. Exportiere
    import calendar
    month_names_de = {
        1: 'Januar', 2: 'Februar', 3: 'Maerz', 4: 'April', 5: 'Mai', 6: 'Juni',
        7: 'Juli', 8: 'August', 9: 'September', 10: 'Oktober', 11: 'November', 12: 'Dezember'
    }
    month_name = month_names_de.get(month, calendar.month_name[month])
    emp_short = employee_key
    output_file = output_dir / f"Zeiterfassung_{month_name}_{year}_{emp_short}_fertig.xlsx"

    wb.save(output_file)
    wb.close()

    return output_file, report

# ============================================================================
# CLI & WRAPPER
# ============================================================================

def main():
    if len(sys.argv) < 4:
        print("Nutzung: python3 vma_automation.py <Monat> <Jahr> <Mitarbeiter> [--template <path>] [--output <dir>] [--absences <path>]")
        print("Beispiel: python3 vma_automation.py 6 2026 Thomas")
        sys.exit(1)

    month = int(sys.argv[1])
    year = int(sys.argv[2])
    employee_key = sys.argv[3]

    template_path = Path("/root/.claude/uploads/dd47e704-857a-5cf7-a908-774f0efd089b/91a63829-Zeiterfassung_Juni_2026_Thomas_fertig.xlsx")
    output_dir = Path.cwd()
    absences_file = None

    # Parse optionale Argumente
    i = 4
    while i < len(sys.argv):
        if sys.argv[i] == '--template':
            template_path = Path(sys.argv[i+1])
            i += 2
        elif sys.argv[i] == '--output':
            output_dir = Path(sys.argv[i+1])
            i += 2
        elif sys.argv[i] == '--absences':
            absences_file = Path(sys.argv[i+1])
            i += 2
        else:
            i += 1

    if employee_key not in EMPLOYEES:
        print(f"Unbekannter Mitarbeiter: {employee_key}")
        print(f"Verfügbar: {', '.join(EMPLOYEES.keys())}")
        sys.exit(1)

    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n{'='*80}")
    print(f"VMA-GENERIERUNG")
    print(f"{'='*80}")
    print(f"Mitarbeiter: {EMPLOYEES[employee_key]['fullname']}")
    print(f"Monat/Jahr: {month}/{year}")
    print(f"Vorlage: {template_path.name}")
    print()

    try:
        output_file, report = create_vma_file(
            template_path, employee_key, year, month, output_dir, absences_file
        )

        print(f"✓ Datei erstellt: {output_file.name}")
        print()
        print("VALIDIERUNGSBERICHT:")
        print("-" * 60)
        print(f"Mitarbeiter: {report['employee']}")
        print(f"Monat/Jahr: {report['month']}/{report['year']}")
        print(f"Max. Stunden: {report['max_hours']}")
        print(f"Eingetragene Stunden: {report['actual_hours']}")
        print(f"Differenz: {report['diff_to_max']} unter Max")
        print(f"VMA-Tage: {report['vma_days']}")
        print(f"Feiertage: {report['holidays']}")
        print(f"Urlaubstage: {report['leave_days']}")
        print(f"Kranktage: {report['sick_days']}")
        print(f"Wochenlimit OK: {'Ja' if report['week_ok'] else 'Nein'}")
        print(f"Status: {report['status']}")
        if report['issues']:
            print("\nAuffälligkeiten:")
            for issue in report['issues']:
                print(f"  {issue}")
        print("-" * 60)

    except Exception as e:
        print(f"✗ Fehler: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == '__main__':
    main()
