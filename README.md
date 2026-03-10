NordBank — Panga süsteem

NordBank on lihtne Flaskil põhinev pangasüsteemi veebirakendus, mis võimaldab hallata kliente, pangakontosid, tehinguid ja laene. Rakendus kasutab SQLite andmebaasi ning sisaldab ka SQL päringute logi funktsionaalsust.

• Funktsionaalsus

Rakendus toetab järgmisi panganduse põhioperatsioone.

• Kliendid
- Uue kliendi lisamine
- Kliendi aktiveerimine või deaktiveerimine
- Klientide nimekirja vaatamine

• Kontod
- Uue pangakonto avamine
- Konto sulgemine
- Kontode nimekirja vaatamine

• Tehingud
- Sissemakse tegemine
- Raha väljavõtmine
- Raha ülekandmine kontode vahel
- Tehingute ajaloo vaatamine

• Laenud
- Annuiteetlaenu loomine
- Automaatne maksegraafiku arvutamine
- Igakuise kuumakse arvutamine
- Laenumaksete tegemine

• SQL logi
- Kõik genereeritud SQL päringud salvestatakse
- SQL logi vaatamine
- SQL logi kustutamine

• Nõuded

- Python 3.10 või uuem
- Flask

• Paigaldus

1. Soovi korral loo virtuaalkeskkond.

2. Paigalda Flask:

pip install flask

• Käivitamine

1. Käivita server:

python app.py

2. Ava brauseris:

http://localhost:5000

Rakendus loob automaatselt SQLite andmebaasi faili **nordbank.db**, kui seda veel ei eksisteeri. Esimesel käivitamisel lisatakse ka näidisandmed.

• API ülevaade

GET /api/statistika  

GET /api/kliendid  
POST /api/kliendid  
PATCH /api/kliendid/<id>  

GET /api/kontod  
POST /api/kontod  
PATCH /api/kontod/<id>  

GET /api/tehingud  
POST /api/sissemaks  
POST /api/valjavaott  
POST /api/ylekan  

GET /api/laenud  
POST /api/laenud  
POST /api/laenud/<id>/maks  

GET /api/sql-logi  
DELETE /api/sql-logi  

• Märkused

- Frontend asub failis **static/index.html**
- Andmebaas on SQLite ja salvestatakse faili **nordbank.db**
- SQL päringute logi aitab jälgida kõiki süsteemi poolt genereeritud päringuid
