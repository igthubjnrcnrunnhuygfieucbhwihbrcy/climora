# Climora Registrar

**Gratis domeinregistrar** — zoek, registreer en beheer domeinnamen (€0,00) in honderden extensies: `.nl`, `.com`, `.it`, `.de`, `.eu`, `.ai`, `.io` en meer.

## Functionaliteit

- **Domeinzoeken** over de hele TLD-catalogus (200+ extensies), inclusief IDN (bijv. `münchen.de`)
- **Gratis registratie** — alle TLD's staan op €0,00; geen betaalgegevens nodig
- **Accounts** met veilige wachtwoordopslag (PBKDF2-HMAC-SHA256) en getekende sessietokens
- **DNS-beheer** — A, AAAA, CNAME, MX, TXT, NS, CAA en SRV-records per domein
- **Nameservers**, auto-verlenging, WHOIS-privacy, gratis verlengen en vrijgeven
- **Pluggable registry-adapter** — sandbox nu, echte registries (EPP) later

## Quick start

```bash
pip install -e ".[dev]"
uvicorn src.registrar.main:app --reload
```

Open http://localhost:8000 — zoeken, account maken, registreren, beheren.

### Docker

```bash
docker compose up --build
```

## Architectuur

```
src/registrar/
├── main.py            FastAPI-app + statische frontend
├── config.py          Omgevingsinstellingen
├── database.py        SQLAlchemy-engine/sessies
├── models.py          User, Domain, DnsRecord
├── security.py        PBKDF2-wachtwoorden + HMAC-tokens
├── tlds.py            TLD-catalogus (200+ extensies met restrictions)
├── schemas.py         Pydantic-schemas
├── deps.py            Auth-dependency
├── services/registry.py   Registry-adapter (sandbox-implementatie)
├── routers/           auth, domains, dns
└── static/            Frontend (HTML/CSS/JS, geen build step)
```

## API

| Endpoint | Methode | Beschrijving |
|---|---|---|
| `/api/v1/tlds` | GET | Volledige TLD-catalogus |
| `/api/v1/domains/search?q=` | GET | Beschikbaarheid zoeken |
| `/api/v1/domains/register/{domein}` | POST | Gratis registreren (ingelogd) |
| `/api/v1/domains/mine` | GET | Mijn domeinen |
| `/api/v1/domains/{domein}` | GET/PATCH/DELETE | Detail, vlaggen, vrijgeven |
| `/api/v1/domains/{domein}/nameservers` | PUT | Nameservers instellen |
| `/api/v1/domains/{domein}/renew` | POST | +1 jaar verlengen (gratis) |
| `/api/v1/domains/{domein}/dns` | GET/POST | DNS-records lezen/aanmaken |
| `/api/v1/domains/{domein}/dns/{id}` | PUT/DELETE | DNS-record wijzigen/verwijderen |
| `/api/v1/auth/*` | POST/GET | Registreren, inloggen, uitloggen, wie ben ik |

## TLD-restricties

Sommige landcode-extensies hebben in het echt voorwaarden; de catalogus markeert die:

- `none` — vrij registreerbaar (o.a. `.nl`, `.com`, `.de`, `.be`)
- `eu_residency` — EU-ingezetene/-bedrijf vereist (o.a. `.eu`, `.it`, `.fr`)
- `local_presence` — lokale aanwezigheid vereist (o.a. `.au`, `.jp`, `.no`)

Beperkte TLD's zijn in de app alleen te registreren na verificatie.

## Echte registries aansluiten (productie)

Deze sandbox-simuleert de registrylaag. Om écht gratis (of betaald) te registreren bij
`.nl` (SIDN), `.com`/`.net` (Verisign), `.it` (IIT-CNR) e.a. is nodig:

1. **ICANN-accreditatie** (voor gTLD's) en/of **registrarovereenkomsten** per ccTLD
2. **EPP-connectie** (RFC 5730/5731) met registry-credentials per TLD
3. Implementatie van `RegistryAdapter` in `src/registrar/services/registry.py`
   met `is_available`, `register` en `release` via EPP
4. Verificatie van beperkte TLD's (`eu_residency`, `local_presence`)

## Tests

```bash
pytest
```
