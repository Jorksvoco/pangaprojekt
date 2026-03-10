# ═══════════════════════════════════════════════
# NordBank — Flask Backend
# Käivita: python app.py
# Ava brauseris: http://localhost:5000
# ═══════════════════════════════════════════════

from flask import Flask, jsonify, request, send_from_directory

from database import db

app = Flask(__name__, static_folder="static")


def _get_json():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else None


def _parse_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _parse_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _parse_bool(value):
    if isinstance(value, bool):
        return value
    if value in (0, 1):
        return bool(value)
    if isinstance(value, str):
        v = value.strip().lower()
        if v in ("true", "1", "jah", "yes"):
            return True
        if v in ("false", "0", "ei", "no"):
            return False
    return None


# ── Avalehe serveerimine ─────────────────────────
@app.route("/")
def index():
    return send_from_directory("static", "index.html")


# ═══════════════════════════════════════════════
# KLIENDID
# ═══════════════════════════════════════════════


@app.route("/api/kliendid", methods=["GET"])
def get_kliendid():
    """Tagasta kõik kliendid"""
    return jsonify(db.query("SELECT * FROM Kliendid ORDER BY id"))


@app.route("/api/kliendid", methods=["POST"])
def lisa_klient():
    """Lisa uus klient"""
    d = _get_json()
    if d is None:
        return jsonify({"viga": "JSON puudub või on vigane"}), 400
    if not all(
        [d.get("eesnimi"), d.get("perenimi"), d.get("isikukood"), d.get("email")]
    ):
        return jsonify({"viga": "Kohustuslikud väljad puuduvad"}), 400

    olemas = db.query_one(
        "SELECT id FROM Kliendid WHERE isikukood = ?", [d["isikukood"]]
    )
    if olemas:
        return jsonify({"viga": "Selle isikukoodiga klient on juba olemas"}), 409

    id = db.execute(
        "INSERT INTO Kliendid (eesnimi, perenimi, isikukood, email, telefon, aadress) VALUES (?,?,?,?,?,?)",
        [
            d["eesnimi"],
            d["perenimi"],
            d["isikukood"],
            d["email"],
            d.get("telefon", ""),
            d.get("aadress", ""),
        ],
    )
    db.log_sql(
        f"Lisa klient: {d['eesnimi']} {d['perenimi']}",
        f"EXEC dbo.sp_LisaKlient @Eesnimi='{d['eesnimi']}', @Perenimi='{d['perenimi']}', @Isikukood='{d['isikukood']}', @Email='{d['email']}', @KlientID=@out OUTPUT; -- => {id}",
    )
    return jsonify({"id": id, "teade": "Klient lisatud"})


@app.route("/api/kliendid/<int:kid>", methods=["PATCH"])
def uuenda_klient(kid):
    """Aktiveeri või deaktiveeri klient"""
    d = _get_json()
    if d is None:
        return jsonify({"viga": "JSON puudub või on vigane"}), 400
    aktiivne = _parse_bool(d.get("aktiivne"))
    if aktiivne is None:
        return jsonify({"viga": "Vigane aktiivne väärtus (oota true/false)"}), 400

    if not aktiivne:
        # Kontrolli aktiivseid laene
        laen = db.query_one(
            "SELECT id FROM Laenud WHERE klient_id=? AND staatus='AKTIIVNE'", [kid]
        )
        if laen:
            return jsonify({"viga": "Kliendil on aktiivseid laene"}), 400
        # Kontrolli kas kontodel on raha
        raha = db.query_one(
            "SELECT id FROM Kontod WHERE klient_id=? AND saldo>0 AND aktiivne=1", [kid]
        )
        if raha:
            return jsonify(
                {"viga": "Kliendi kontodel on raha — tühjenda enne sulgemist"}
            ), 400

    db.execute("UPDATE Kliendid SET aktiivne=? WHERE id=?", [1 if aktiivne else 0, kid])
    tegevus = "aktiveeritud" if aktiivne else "deaktiveeritud"
    db.log_sql(
        f"Klient #{kid} {tegevus}",
        f"EXEC dbo.sp_UuendaKlient @KlientID={kid}, @Aktiivne={1 if aktiivne else 0};",
    )
    return jsonify({"teade": f"Klient {tegevus}"})


# ═══════════════════════════════════════════════
# KONTOD
# ═══════════════════════════════════════════════


@app.route("/api/kontod", methods=["GET"])
def get_kontod():
    """Tagasta kõik kontod koos klientide nimedega"""
    return jsonify(
        db.query("""
        SELECT k.*, kl.eesnimi || ' ' || kl.perenimi AS klient_nimi
        FROM Kontod k
        JOIN Kliendid kl ON k.klient_id = kl.id
        ORDER BY k.id
    """)
    )


@app.route("/api/kontod", methods=["POST"])
def ava_konto():
    """Ava uus konto"""
    d = _get_json()
    if d is None:
        return jsonify({"viga": "JSON puudub või on vigane"}), 400
    if not d.get("klient_id"):
        return jsonify({"viga": "Klient puudub"}), 400

    import random

    nr = "EE38" + str(random.randint(10**15, 10**16 - 1))

    id = db.execute(
        "INSERT INTO Kontod (nr, klient_id, tyup, valuuta, saldo, intressimaar) VALUES (?,?,?,?,0,?)",
        [
            nr,
            d["klient_id"],
            d.get("tyup", "ARVELDUS"),
            d.get("valuuta", "EUR"),
            d.get("intressimaar", 0),
        ],
    )
    db.log_sql(
        f"Ava konto: klient #{d['klient_id']}",
        f"EXEC dbo.sp_AvaKonto @KlientID={d['klient_id']}, @KontoTüüp='{d.get('tyup', 'ARVELDUS')}', @Valuuta='{d.get('valuuta', 'EUR')}', @KontoID=@out OUTPUT; -- => {id}",
    )
    return jsonify({"id": id, "nr": nr, "teade": "Konto avatud"})


@app.route("/api/kontod/<int:kid>", methods=["PATCH"])
def sulge_konto(kid):
    """Sulge konto"""
    konto = db.query_one("SELECT * FROM Kontod WHERE id=?", [kid])
    if not konto:
        return jsonify({"viga": "Kontot ei leitud"}), 404
    if konto["saldo"] > 0:
        return jsonify(
            {"viga": f"Konto saldo peab olema 0, praegu {konto['saldo']} €"}
        ), 400

    db.execute("UPDATE Kontod SET aktiivne=0 WHERE id=?", [kid])
    db.log_sql(f"Sulge konto #{kid}", f"EXEC dbo.sp_SulgeKonto @KontoID={kid};")
    return jsonify({"teade": "Konto suletud"})


# ═══════════════════════════════════════════════
# TEHINGUD
# ═══════════════════════════════════════════════


@app.route("/api/tehingud", methods=["GET"])
def get_tehingud():
    """Tagasta tehingud filtritega"""
    konto_id = request.args.get("konto_id")
    tyup = request.args.get("tyup")

    sql = """
        SELECT t.*, k.nr AS konto_nr
        FROM Tehingud t
        JOIN Kontod k ON t.konto_id = k.id
        WHERE 1=1
    """
    params = []
    if konto_id:
        sql += " AND t.konto_id = ?"
        params.append(konto_id)
    if tyup:
        sql += " AND t.tyup = ?"
        params.append(tyup)
    sql += " ORDER BY t.id DESC"

    return jsonify(db.query(sql, params))


@app.route("/api/sissemaks", methods=["POST"])
def sissemaks():
    """Tee sissemaks kontole"""
    d = _get_json()
    if d is None:
        return jsonify({"viga": "JSON puudub või on vigane"}), 400
    konto_id = d.get("konto_id")
    summa = _parse_float(d.get("summa"))
    if summa is None:
        return jsonify({"viga": "Vigane summa"}), 400
    kirjeldus = d.get("kirjeldus", "Sissemaks")

    if not konto_id or summa <= 0:
        return jsonify({"viga": "Vigased andmed"}), 400

    konto = db.query_one("SELECT * FROM Kontod WHERE id=? AND aktiivne=1", [konto_id])
    if not konto:
        return jsonify({"viga": "Kontot ei leitud"}), 404

    uus_saldo = round(konto["saldo"] + summa, 2)
    db.execute("UPDATE Kontod SET saldo=? WHERE id=?", [uus_saldo, konto_id])
    db.execute(
        "INSERT INTO Tehingud (konto_id, tyup, summa, saldo_parast, kirjeldus) VALUES (?,?,?,?,?)",
        [konto_id, "KREDIT", summa, uus_saldo, kirjeldus],
    )
    db.log_sql(
        f"Sissemaks {summa} €",
        f"EXEC dbo.sp_Sissemaks @KontoID={konto_id}, @Summa={summa:.2f}, @Kirjeldus='{kirjeldus}';",
    )
    return jsonify({"teade": f"+{summa} € lisatud", "uus_saldo": uus_saldo})


@app.route("/api/valjavaott", methods=["POST"])
def valjavaott():
    """Tee väljavõtt kontolt"""
    d = _get_json()
    if d is None:
        return jsonify({"viga": "JSON puudub või on vigane"}), 400
    konto_id = d.get("konto_id")
    summa = _parse_float(d.get("summa"))
    if summa is None:
        return jsonify({"viga": "Vigane summa"}), 400
    kirjeldus = d.get("kirjeldus", "Väljavõtt")

    if not konto_id or summa <= 0:
        return jsonify({"viga": "Vigased andmed"}), 400

    konto = db.query_one("SELECT * FROM Kontod WHERE id=? AND aktiivne=1", [konto_id])
    if not konto:
        return jsonify({"viga": "Kontot ei leitud"}), 404
    if konto["saldo"] < summa:
        return jsonify({"viga": f"Ebapiisav saldo! Kontol on {konto['saldo']} €"}), 400

    uus_saldo = round(konto["saldo"] - summa, 2)
    db.execute("UPDATE Kontod SET saldo=? WHERE id=?", [uus_saldo, konto_id])
    db.execute(
        "INSERT INTO Tehingud (konto_id, tyup, summa, saldo_parast, kirjeldus) VALUES (?,?,?,?,?)",
        [konto_id, "DEEBET", summa, uus_saldo, kirjeldus],
    )
    db.log_sql(
        f"Väljavõtt {summa} €",
        f"EXEC dbo.sp_Väljavõtt @KontoID={konto_id}, @Summa={summa:.2f}, @Kirjeldus='{kirjeldus}';",
    )
    return jsonify({"teade": f"-{summa} € võetud", "uus_saldo": uus_saldo})


@app.route("/api/ylekan", methods=["POST"])
def ylekan():
    """Teosta ülekanne — mõlemad muutused transaktsiooniga"""
    d = _get_json()
    if d is None:
        return jsonify({"viga": "JSON puudub või on vigane"}), 400
    from_id = d.get("saatja_id")
    to_id = d.get("saaja_id")
    summa = _parse_float(d.get("summa"))
    if summa is None:
        return jsonify({"viga": "Vigane summa"}), 400
    selgitus = d.get("selgitus", "Ülekanne")

    if not from_id or not to_id or summa <= 0:
        return jsonify({"viga": "Vigased andmed"}), 400
    if from_id == to_id:
        return jsonify({"viga": "Saatja ja saaja ei saa olla sama konto"}), 400

    saatja = db.query_one("SELECT * FROM Kontod WHERE id=? AND aktiivne=1", [from_id])
    saaja = db.query_one("SELECT * FROM Kontod WHERE id=? AND aktiivne=1", [to_id])

    if not saatja or not saaja:
        return jsonify({"viga": "Konto ei leitud"}), 404
    if saatja["saldo"] < summa:
        return jsonify({"viga": f"Ebapiisav saldo! Kontol on {saatja['saldo']} €"}), 400

    saatja_saldo = round(saatja["saldo"] - summa, 2)
    saaja_saldo = round(saaja["saldo"] + summa, 2)

    # Mõlemad UPDATE-id korraga — atomaarne
    db.execute("UPDATE Kontod SET saldo=? WHERE id=?", [saatja_saldo, from_id])
    db.execute("UPDATE Kontod SET saldo=? WHERE id=?", [saaja_saldo, to_id])
    db.execute(
        "INSERT INTO Tehingud (konto_id, tyup, summa, saldo_parast, kirjeldus) VALUES (?,?,?,?,?)",
        [from_id, "ÜLEKAN_VÄLJA", summa, saatja_saldo, selgitus],
    )
    db.execute(
        "INSERT INTO Tehingud (konto_id, tyup, summa, saldo_parast, kirjeldus) VALUES (?,?,?,?,?)",
        [to_id, "ÜLEKAN_SISSE", summa, saaja_saldo, selgitus],
    )
    db.log_sql(
        f"Ülekanne {summa} €",
        f"BEGIN TRANSACTION;\n  EXEC dbo.sp_TeostÜlekan @SaatjaKontoID={from_id}, @SaajaKontoID={to_id}, @Summa={summa:.2f}, @Selgitus='{selgitus}';\nCOMMIT;",
    )
    return jsonify({"teade": f"Ülekanne {summa} € teostatud"})


# ═══════════════════════════════════════════════
# LAENUD
# ═══════════════════════════════════════════════


@app.route("/api/laenud", methods=["GET"])
def get_laenud():
    """Tagasta kõik laenud koos maksegraafikuga"""
    laenud = db.query("""
        SELECT l.*, kl.eesnimi || ' ' || kl.perenimi AS klient_nimi
        FROM Laenud l
        JOIN Kliendid kl ON l.klient_id = kl.id
        ORDER BY l.id DESC
    """)
    for laen in laenud:
        laen["graafik"] = db.query(
            "SELECT * FROM Maksegraafik WHERE laen_id=? ORDER BY makse_nr", [laen["id"]]
        )
    return jsonify(laenud)


@app.route("/api/laenud", methods=["POST"])
def uus_laen():
    """Väljasta uus annuiteetlaen"""
    d = _get_json()
    if d is None:
        return jsonify({"viga": "JSON puudub või on vigane"}), 400
    klient_id = d.get("klient_id")
    konto_id = d.get("konto_id")
    summa = _parse_float(d.get("summa"))
    intress = _parse_float(d.get("intress"))
    kuud = _parse_int(d.get("kuud"))
    if summa is None or intress is None or kuud is None:
        return jsonify({"viga": "Vigased andmed"}), 400

    if not all([klient_id, konto_id, summa > 0, kuud > 0]):
        return jsonify({"viga": "Täida kõik väljad"}), 400

    konto = db.query_one(
        "SELECT * FROM Kontod WHERE id=? AND klient_id=? AND tyup='ARVELDUS' AND aktiivne=1",
        [konto_id, klient_id],
    )
    if not konto:
        return jsonify({"viga": "Kliendil puudub sobiv arvelduskonto"}), 400

    # Arvuta kuumaks (annuiteet)
    r = intress / 100 / 12
    if r == 0:
        kuumaks = round(summa / kuud, 2)
    else:
        kuumaks = round(summa * r / (1 - (1 + r) ** -kuud), 2)

    laen_id = db.execute(
        "INSERT INTO Laenud (klient_id, konto_id, summa, jaanuk, intressimaar, kuud, kuumaks, staatus) VALUES (?,?,?,?,?,?,?,'AKTIIVNE')",
        [klient_id, konto_id, summa, summa, intress, kuud, kuumaks],
    )

    # Genereeri maksegraafik
    bal = summa
    for i in range(1, kuud + 1):
        intress_osa = round(bal * r, 2)
        pohiosa = bal if i == kuud else round(kuumaks - intress_osa, 2)
        db.execute(
            "INSERT INTO Maksegraafik (laen_id, makse_nr, pohiosa, intress, kokku, jaanuk, makstud) VALUES (?,?,?,?,?,?,0)",
            [
                laen_id,
                i,
                pohiosa,
                intress_osa,
                round(pohiosa + intress_osa, 2),
                round(max(0, bal - pohiosa), 2),
            ],
        )
        bal = max(0, bal - pohiosa)

    # Krediteeri arvelduskonto laenusummaga
    uus_saldo = round(konto["saldo"] + summa, 2)
    db.execute("UPDATE Kontod SET saldo=? WHERE id=?", [uus_saldo, konto_id])
    db.execute(
        "INSERT INTO Tehingud (konto_id, tyup, summa, saldo_parast, kirjeldus) VALUES (?,?,?,?,?)",
        [konto_id, "LAEN_VÄLJA", summa, uus_saldo, f"Laen #{laen_id} väljastatud"],
    )
    db.log_sql(
        f"Uus laen #{laen_id}",
        f"EXEC dbo.sp_VäljastLaen @KlientID={klient_id}, @ArveldusKontoID={konto_id}, @Summa={summa:.2f}, @IntressimäärA={intress / 100:.4f}, @TähtaegKuudes={kuud}, @LaenID=@out OUTPUT; -- => {laen_id}\n-- Kuumaks: {kuumaks} €",
    )
    return jsonify({"id": laen_id, "kuumaks": kuumaks, "teade": "Laen väljastatud"})


@app.route("/api/laenud/<int:lid>/maks", methods=["POST"])
def laenu_maks(lid):
    """Soorita järgmine kuumakse"""
    d = _get_json()
    if d is None:
        return jsonify({"viga": "JSON puudub või on vigane"}), 400
    konto_id = d.get("konto_id")
    if not konto_id:
        return jsonify({"viga": "Konto puudub"}), 400

    laen = db.query_one("SELECT * FROM Laenud WHERE id=? AND staatus='AKTIIVNE'", [lid])
    if not laen:
        return jsonify({"viga": "Laen ei ole aktiivne"}), 404

    jarmine = db.query_one(
        "SELECT * FROM Maksegraafik WHERE laen_id=? AND makstud=0 ORDER BY makse_nr LIMIT 1",
        [lid],
    )
    if not jarmine:
        return jsonify({"viga": "Kõik maksed on tasutud"}), 400

    konto = db.query_one(
        "SELECT * FROM Kontod WHERE id=? AND tyup='ARVELDUS' AND aktiivne=1", [konto_id]
    )
    if not konto:
        return jsonify({"viga": "Arvelduskonto ei leitud"}), 404
    if konto["saldo"] < jarmine["kokku"]:
        return jsonify(
            {
                "viga": f"Ebapiisav saldo! Kontol on {konto['saldo']} €, vaja {jarmine['kokku']} €"
            }
        ), 400

    uus_saldo = round(konto["saldo"] - jarmine["kokku"], 2)
    uus_jaanuk = round(max(0, laen["jaanuk"] - jarmine["pohiosa"]), 2)

    db.execute("UPDATE Kontod SET saldo=? WHERE id=?", [uus_saldo, konto_id])
    db.execute("UPDATE Maksegraafik SET makstud=1 WHERE id=?", [jarmine["id"]])
    db.execute("UPDATE Laenud SET jaanuk=? WHERE id=?", [uus_jaanuk, lid])
    db.execute(
        "INSERT INTO Tehingud (konto_id, tyup, summa, saldo_parast, kirjeldus) VALUES (?,?,?,?,?)",
        [
            konto_id,
            "LAEN_TAGASI",
            jarmine["kokku"],
            uus_saldo,
            f"Laen #{lid} maks #{jarmine['makse_nr']}",
        ],
    )

    # Kui kõik makstud — sulge laen
    maksmata = db.query_one(
        "SELECT id FROM Maksegraafik WHERE laen_id=? AND makstud=0", [lid]
    )
    if not maksmata:
        db.execute("UPDATE Laenud SET staatus='SULETUD', jaanuk=0 WHERE id=?", [lid])

    db.log_sql(
        f"Laenu maks #{jarmine['makse_nr']} — {jarmine['kokku']} €",
        f"EXEC dbo.sp_MaksaLaenMaks @LaenID={lid}, @ArvelduKontoID={konto_id};\n-- Maks #{jarmine['makse_nr']}: {jarmine['kokku']} € (põhiosa {jarmine['pohiosa']} + intress {jarmine['intress']})",
    )
    return jsonify(
        {"teade": f"Maks {jarmine['kokku']} € teostatud", "uus_saldo": uus_saldo}
    )


# ═══════════════════════════════════════════════
# HOIUINTRESS
# ═══════════════════════════════════════════════


@app.route("/api/intress", methods=["POST"])
def rakenda_intress():
    """Rakenda kuuintress kõigile hoiukontodele"""
    hoius_kontod = db.query(
        "SELECT * FROM Kontod WHERE tyup='HOIUS' AND aktiivne=1 AND saldo>0 AND intressimaar>0"
    )
    kokku = 0
    for k in hoius_kontod:
        intress = round(k["saldo"] * k["intressimaar"] / 100 / 12, 2)
        if intress <= 0:
            continue
        uus_saldo = round(k["saldo"] + intress, 2)
        db.execute("UPDATE Kontod SET saldo=? WHERE id=?", [uus_saldo, k["id"]])
        db.execute(
            "INSERT INTO Tehingud (konto_id, tyup, summa, saldo_parast, kirjeldus) VALUES (?,?,?,?,?)",
            [
                k["id"],
                "INTRESS",
                intress,
                uus_saldo,
                f"Kuuintress {k['intressimaar']}% p.a.",
            ],
        )
        kokku += intress

    db.log_sql(
        "Kuuintress rakendatud",
        f"EXEC dbo.sp_RakendaIntress; -- Kokku +{round(kokku, 2)} €",
    )
    return jsonify(
        {
            "teade": f"Intress rakendatud {len(hoius_kontod)} kontole",
            "kokku": round(kokku, 2),
        }
    )


# ═══════════════════════════════════════════════
# SQL LOGI
# ═══════════════════════════════════════════════


@app.route("/api/sql-logi", methods=["GET"])
def get_sql_logi():
    return jsonify(db.query("SELECT * FROM SqlLogi ORDER BY id DESC"))


@app.route("/api/sql-logi", methods=["DELETE"])
def clear_sql_logi():
    db.execute("DELETE FROM SqlLogi")
    return jsonify({"teade": "Logi tühjendatud"})


# ═══════════════════════════════════════════════
# STATISTIKA (dashboard)
# ═══════════════════════════════════════════════


@app.route("/api/statistika", methods=["GET"])
def statistika():
    def _count(sql):
        row = db.query_one(sql)
        return row["n"] if row else 0

    return jsonify(
        {
            "kliendid": _count("SELECT COUNT(*) AS n FROM Kliendid WHERE aktiivne=1"),
            "kontod": _count("SELECT COUNT(*) AS n FROM Kontod WHERE aktiivne=1"),
            "tehingud": _count("SELECT COUNT(*) AS n FROM Tehingud"),
            "laenud": _count(
                "SELECT COUNT(*) AS n FROM Laenud WHERE staatus='AKTIIVNE'"
            ),
        }
    )


# ═══════════════════════════════════════════════
# KÄIVITAMINE
# ═══════════════════════════════════════════════
if __name__ == "__main__":
    db.init()  # Loo tabelid
    db.seed()  # Lisa näidisandmed (ainult esimesel korral)
    print("✅ NordBank käivitub aadressil http://localhost:5000")
    app.run(debug=True, port=5000)
