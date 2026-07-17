# Nastavení `admin.eurogopass.com` ve Vercel DNS

## Cíl

Nasměrovat pouze subdoménu:

```text
admin.eurogopass.com
```

na novou VPS:

```text
195.133.93.51
```

Hlavní web `eurogopass.com`, `www.eurogopass.com` a e-mailové služby musí zůstat beze změny.

## Proč je změna potřeba

Autoritativní DNS domény `eurogopass.com` spravuje Vercel:

```text
ns1.vercel-dns.com
ns2.vercel-dns.com
```

Subdoména byla vytvořena také v Hostmanu, ale veřejný internet používá záznamy uložené ve Vercel DNS. Rozhodující změna se proto musí provést ve Vercelu.

Nameservery celé domény se nesmí měnit.

## Přesný postup

### 1. Přihlášení

1. Otevřít:

```text
https://vercel.com/
```

2. Přihlásit se do účtu nebo týmu, ve kterém je spravován projekt a doména EuroGoPass.

### 2. Otevření domény

1. V horní části Vercelu vybrat správný tým/účet EuroGoPass.
2. Otevřít sekci:

```text
Domains
```

3. Vybrat:

```text
eurogopass.com
```

4. Otevřít sekci:

```text
DNS Records
```

Podle aktuálního rozhraní může být DNS editor přímo v detailu domény.

### 3. Kontrola existujícího záznamu `admin`

V seznamu DNS záznamů vyhledat název:

```text
admin
```

Mohou existovat záznamy typu:

- `A`,
- `AAAA`,
- `CNAME`.

Pro `admin` nesmí po dokončení zůstat žádný konfliktní záznam.

Pokud už záznam `admin` existuje:

1. upravit ho na hodnoty uvedené níže, nebo
2. smazat pouze tento záznam a vytvořit nový.

Nemazat žádné jiné DNS záznamy.

### 4. Vytvoření A záznamu

Vytvořit nový DNS záznam s přesnými hodnotami:

| Pole | Hodnota |
|---|---|
| Type | `A` |
| Name | `admin` |
| Value | `195.133.93.51` |
| TTL | `60`, `Auto` nebo výchozí hodnota |

Výsledný záznam musí znamenat:

```text
admin.eurogopass.com → 195.133.93.51
```

Pokud Vercel požaduje pouze název záznamu, zadat:

```text
admin
```

Nezadávat do pole Name celou doménu, pokud ji Vercel automaticky doplňuje.

### 5. Uložení

Kliknout na:

```text
Save
Add
Create
```

podle aktuálního rozhraní.

## Na co nesahat

Neměnit ani nemazat:

- záznam `@`,
- hlavní A záznam domény,
- `www`,
- MX záznamy,
- Google Workspace/Gmail záznamy,
- SPF,
- DKIM,
- DMARC,
- ověřovací TXT záznamy,
- nameservery:

```text
ns1.vercel-dns.com
ns2.vercel-dns.com
```

Neměnit nastavení hlavního Vercel projektu ani produkční doménu `eurogopass.com`.

## Kontrola před uložením

Před potvrzením musí být správně:

```text
Type: A
Name: admin
Value: 195.133.93.51
```

Pro název `admin` nesmí současně zůstat:

- jiný A záznam se starou IP,
- AAAA záznam,
- CNAME záznam.

## Co předat po dokončení

Po uložení stačí napsat:

```text
Vercel DNS hotovo
```

Ideálně přiložit screenshot DNS záznamu, na kterém je vidět:

```text
admin    A    195.133.93.51
```

Není potřeba posílat přihlašovací údaje do Vercelu.

## Co bude následovat

Po propagaci DNS bude na nové VPS:

1. spuštěna HTTPS proxy,
2. automaticky vystaven certifikát pro `admin.eurogopass.com`,
3. ověřeno přihlášení do dashboardu,
4. ověřen produkční live log,
5. ověřen Gmail ingest,
6. ověřen audit ručního `FULFILLED`.

Propagace Vercel DNS obvykle trvá několik minut. Výjimečně může být potřeba čekat déle podle DNS cache.
