# NordBank — SQLite andmebaas

import sqlite3

DB_FAIL = "nordbank.db"  # Andmebaasi faili nimi


class Database:
    def __init__(self):
        self.fail = DB_FAIL

    def _uhendus(self):
        """Loo ühendus andmebaasiga"""
        uhendus = sqlite3.connect(self.fail)
        uhendus.row_factory = sqlite3.Row  # Tagasta dict-id, mitte tuple-id
        uhendus.execute("PRAGMA foreign_keys = ON")  # Luba võõrvõtmed
        return uhendus

    def query(self, sql, params=[]):
        """Tee SELECT päring, tagasta list"""
        with self._uhendus() as u:
            cursor = u.execute(sql, params)
            return [dict(r) for r in cursor.fetchall()]

    def query_one(self, sql, params=[]):
        """Tee SELECT päring, tagasta üks rida"""
        with self._uhendus() as u:
            cursor = u.execute(sql, params)
            row = cursor.fetchone()
            return dict(row) if row else None

    def execute(self, sql, params=[]):
        """Tee INSERT/UPDATE/DELETE, tagasta viimane ID"""
        with self._uhendus() as u:
            cursor = u.execute(sql, params)
            u.commit()
            return cursor.lastrowid

    def log_sql(self, silt, sql):
        """Salvesta SQL logi andmebaasi"""
        self.execute("INSERT INTO SqlLogi (silt, sql_tekst) VALUES (?, ?)", [silt, sql])

    # ═══════════════════════════════════════════
    # TABELITE LOOMINE
    # ═══════════════════════════════════════════
    def init(self):
        """Loo kõik tabelid kui neid pole"""
        with self._uhendus() as u:
            u.executescript("""
                CREATE TABLE IF NOT EXISTS Kliendid (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    eesnimi     TEXT NOT NULL,
                    perenimi    TEXT NOT NULL,
                    isikukood   TEXT NOT NULL UNIQUE,
                    email       TEXT NOT NULL,
                    telefon     TEXT,
                    aadress     TEXT,
                    aktiivne    INTEGER DEFAULT 1,
                    loodud      DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS Kontod (
                    id           INTEGER PRIMARY KEY AUTOINCREMENT,
                    nr           TEXT NOT NULL UNIQUE,
                    klient_id    INTEGER NOT NULL REFERENCES Kliendid(id),
                    tyup         TEXT NOT NULL CHECK(tyup IN ('ARVELDUS','HOIUS','LAEN')),
                    valuuta      TEXT DEFAULT 'EUR',
                    saldo        REAL DEFAULT 0,
                    intressimaar REAL DEFAULT 0,
                    aktiivne     INTEGER DEFAULT 1,
                    loodud       DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS Tehingud (
                    id           INTEGER PRIMARY KEY AUTOINCREMENT,
                    konto_id     INTEGER NOT NULL REFERENCES Kontod(id),
                    tyup         TEXT NOT NULL,
                    summa        REAL NOT NULL,
                    saldo_parast REAL NOT NULL,
                    kirjeldus    TEXT,
                    kuupaev      DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS Laenud (
                    id           INTEGER PRIMARY KEY AUTOINCREMENT,
                    klient_id    INTEGER NOT NULL REFERENCES Kliendid(id),
                    konto_id     INTEGER NOT NULL REFERENCES Kontod(id),
                    summa        REAL NOT NULL,
                    jaanuk       REAL NOT NULL,
                    intressimaar REAL NOT NULL,
                    kuud         INTEGER NOT NULL,
                    kuumaks      REAL NOT NULL,
                    staatus      TEXT DEFAULT 'AKTIIVNE',
                    loodud       DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS Maksegraafik (
                    id        INTEGER PRIMARY KEY AUTOINCREMENT,
                    laen_id   INTEGER NOT NULL REFERENCES Laenud(id),
                    makse_nr  INTEGER NOT NULL,
                    pohiosa   REAL NOT NULL,
                    intress   REAL NOT NULL,
                    kokku     REAL NOT NULL,
                    jaanuk    REAL NOT NULL,
                    makstud   INTEGER DEFAULT 0
                );

                CREATE TABLE IF NOT EXISTS SqlLogi (
                    id        INTEGER PRIMARY KEY AUTOINCREMENT,
                    silt      TEXT NOT NULL,
                    sql_tekst TEXT NOT NULL,
                    aeg       DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            """)
            u.commit()
        print("✅ Tabelid loodud")

    # ═══════════════════════════════════════════
    # NÄIDISANDMED
    # ═══════════════════════════════════════════
    def seed(self):
        """Lisa näidisandmed kui andmebaas on tühi"""
        olemas = self.query_one("SELECT id FROM Kliendid LIMIT 1")
        if olemas:
            return  # Andmed on juba olemas

        print("🌱 Lisan näidisandmed...")

        # Kliendid
        self.execute(
            "INSERT INTO Kliendid (eesnimi, perenimi, isikukood, email, telefon, aadress) VALUES (?,?,?,?,?,?)",
            [
                "Aleks",
                "Rohtla",
                "49001011234",
                "aleks@email.ee",
                "+372 5000 0001",
                "Tallinn",
            ],
        )
        self.execute(
            "INSERT INTO Kliendid (eesnimi, perenimi, isikukood, email, telefon, aadress) VALUES (?,?,?,?,?,?)",
            [
                "Jorgen",
                "Siimsoo",
                "38505050505",
                "jorgen@email.ee",
                "+372 5000 0002",
                "Tartu",
            ],
        )

        # Kontod
        self.execute(
            "INSERT INTO Kontod (nr, klient_id, tyup, valuuta, saldo) VALUES (?,?,?,?,?)",
            ["EE382200221020145685", 1, "ARVELDUS", "EUR", 4500],
        )
        self.execute(
            "INSERT INTO Kontod (nr, klient_id, tyup, valuuta, saldo) VALUES (?,?,?,?,?)",
            ["EE382200221030267891", 2, "ARVELDUS", "EUR", 3500],
        )
        self.execute(
            "INSERT INTO Kontod (nr, klient_id, tyup, valuuta, saldo, intressimaar) VALUES (?,?,?,?,?,?)",
            ["EE382200221040389012", 1, "HOIUS", "EUR", 10000, 3.5],
        )

        # Tehingud
        for konto_id, tyup, summa, saldo_parast, kirjeldus in [
            (1, "KREDIT", 5000, 5000, "Esialgne sissemaks"),
            (2, "KREDIT", 3000, 3000, "Esialgne sissemaks"),
            (1, "ÜLEKAN_VÄLJA", 500, 4500, "Laen sõbrale"),
            (2, "ÜLEKAN_SISSE", 500, 3500, "Laen sõbrale"),
            (3, "KREDIT", 10000, 10000, "Hoiuse avamine"),
        ]:
            self.execute(
                "INSERT INTO Tehingud (konto_id, tyup, summa, saldo_parast, kirjeldus) VALUES (?,?,?,?,?)",
                [konto_id, tyup, summa, saldo_parast, kirjeldus],
            )

        print("✅ Näidisandmed lisatud")


# Globaalne objekt — imporditakse app.py-sse
db = Database()

