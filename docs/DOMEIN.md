# ClimoraWeather — eigen domein en DNS, stap voor stap

De site is statisch, dus hij kan overal gratis draaien. Hieronder: eerst de **gratis** routes (direct werkend), daarna hoe je een **eigen domein** zoals `climora.nl` of `nl.climora.com` eraan koppelt.

> Eerlijk vooraf: een echte `.nl`, `.com` of `.it` is **niet gratis** — die kost circa € 5–15 per jaar bij een registrar. Gratis zijn: de `github.io`-url (direct), een `pages.dev`-subdomein, of een domein via [eu.org](https://nic.eu.org) (gratis, maar langzame goedkeuring).

---

## Stap 1 — Gratis publiceren (5 minuten, geen domein nodig)

**GitHub Pages** host de site gratis en onbeperkt:

1. Ga in GitHub naar **Settings → Pages**.
2. Bij **Source**: kies *Deploy from a branch*, selecteer je branch en `/ (root)`, klik **Save**.
3. Na ± 1 minuut staat de site op:
   `https://<jouw-gebruikersnaam>.github.io/climora/`

Alternatieve gratis hosts (zelfde bestanden, eigen gratis subdomein):

| Host | Gratis adres | Hoe |
|---|---|---|
| [Cloudflare Pages](https://developers.cloudflare.com/pages/) | `climora.pages.dev` | Repo koppelen → deploy |
| [Netlify](https://docs.netlify.com/) | `climora.netlify.app` | Repo koppelen → deploy |
| [Vercel](https://vercel.com/docs) | `climora.vercel.app` | Repo koppelen → deploy |

---

## Stap 2 — Eigen domein aanvragen

1. Kies een registrar, bijvoorbeeld [TransIP](https://www.transip.nl/domeinnaam/) (nl), [Cloudflare Registrar](https://www.cloudflare.com/products/registrar/) (tegen kostprijs) of [Namecheap](https://www.namecheap.com/).
2. Zoek je naam op en koop: `climora.nl`, `climora.com`, `climora.it`, enz.
3. Subdomeinen zoals `nl.climora.com` zijn **inbegrepen** — die maak je zelf aan in het DNS-paneel van je registrar (zie stap 3). Je hoeft dus alleen het hoofddomein te kopen.

---

## Stap 3 — DNS instellen

In het DNS-paneel van je registrar voeg je deze records toe (vervang `<gebruikersnaam>` door je GitHub-gebruikersnaam):

**Hoofd- en taaldomeinen → GitHub Pages:**

| Type | Naam | Waarde | Doel |
|---|---|---|---|
| `A` | `@` | `185.199.108.153` | climora.nl |
| `A` | `@` | `185.199.109.153` | (idem, tweede IP) |
| `A` | `@` | `185.199.110.153` | (idem, derde IP) |
| `A` | `@` | `185.199.111.153` | (idem, vierde IP) |
| `CNAME` | `www` | `<gebruikersnaam>.github.io.` | www.climora.nl |
| `CNAME` | `nl` | `<gebruikersnaam>.github.io.` | nl.climora.com |
| `CNAME` | `en` | `<gebruikersnaam>.github.io.` | en.climora.com |
| `CNAME` | `de` | `<gebruikersnaam>.github.io.` | de.climora.com |

De vier `A`-records zijn de officiële [GitHub Pages-IP's](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site). DNS-doorgifte duurt meestal 5–60 minuten.

**Zelf hosten (Raspberry Pi/VPS)?** Gebruik dan in plaats van de GitHub-IP's het IP van je server, en zet [Caddy](https://caddyserver.com/docs/) erachter voor automatische HTTPS — zie het meegeleverde [`Caddyfile.example`](Caddyfile.example).

---

## Stap 4 — Domein koppelen in GitHub

1. Maak in de repository een bestand `CNAME` aan (in de root) met één regel: je hoofddomein, bijvoorbeeld `climora.nl`.
   *(Of vul het domein in bij **Settings → Pages → Custom domain** — GitHub maakt het bestand dan zelf.)*
2. Wacht tot de DNS-check groen wordt, zet dan **Enforce HTTPS** aan.
3. Klaar: `https://climora.nl` en alle subdomeinen (`nl.`, `en.`, `de.`) dienen nu de site met een geldig certificaat.

**Taal per subdomein is automatisch:** de site leest de hostnaam — `nl.climora.com` opent in het Nederlands, `de.…` in het Duits, `en.…` in het Engels. Een bezoeker die zelf een andere taal kiest, krijgt die voorrang.

---

## Problemen oplossen

- **"DNS check unsuccessful"** → record bestaat nog niet lang genoeg, of de waarde klopt niet; controleer exacte spelling (punt achter `github.io.` mag, maar hoeft niet).
- **Verkeerd certificaat** → zet eerst *Enforce HTTPS* uit, wacht 30 min, weer aan.
- **Apex werkt, subdomein niet** (of omgekeerd) → `A`-records zijn voor de apex (`@`), `CNAME` voor subdomeinen; die kun je niet inwisselen.
- **Site unreachable via eigen server** → poorten 80/443 moeten openstaan en je router moet port-forwarden naar je server; Caddy regelt de certificaten via [Let's Encrypt](https://letsencrypt.org/).
