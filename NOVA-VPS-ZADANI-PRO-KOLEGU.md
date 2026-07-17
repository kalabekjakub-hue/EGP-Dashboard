# Zadání nové VPS pro EuroGoPass Admin

## Cíl

Zřídit samostatnou VPS pro:

- interní EuroGoPass Admin dashboard,
- nepřetržitý Gmail ingest dokladů,
- bezpečné čtení live logu z existující produkční VPS.

Nová VPS bude oddělená od současné produkční VPS s EGP a Wise workery. Na stávající VPS se v rámci objednávky nic nemění.

## Stručně: co má kolega udělat

Kolega má provést pouze tyto úkoly:

1. Přihlásit se k poskytovateli současné VPS.
2. Vytvořit **novou samostatnou VPS** podle parametrů níže.
3. Jako operační systém vybrat čisté **Ubuntu 24.04 LTS**.
4. Při založení vložit uvedený veřejný SSH klíč.
5. Povolit příchozí TCP porty `22`, `80` a `443`.
6. Počkat, až bude nová VPS aktivní.
7. Ověřit, že se lze přihlásit přes SSH klíč jako `root`.
8. Předat Jakubovi veřejnou IPv4 a základní informace uvedené níže.
9. Na VPS zatím nic dalšího neinstalovat.
10. DNS zatím neměnit, dokud nebude VPS technicky ověřena.

Kolega nemá zasahovat do současné VPS `212.192.2.80`.

## Požadovaná konfigurace

Objednat novou VPS ideálně u stejného poskytovatele jako současnou:

| Parametr | Požadavek |
|---|---|
| Operační systém | Ubuntu 24.04 LTS, 64bit |
| CPU | 2 vCPU |
| RAM | 4 GB |
| Disk | minimálně 40 GB SSD/NVMe |
| Veřejná síť | 1× veřejná statická IPv4 |
| Lokalita | Česko nebo blízká Evropa |
| Přístup | SSH pro uživatele `root` |
| Zálohy | Doporučené, pokud je poskytovatel nabízí |

Není potřeba objednávat:

- Windows,
- Plesk nebo cPanel,
- spravovanou databázi,
- další veřejné IP adresy,
- předinstalovaný webový nebo databázový software.

## Detailní postup založení VPS

Názvy tlačítek se mohou podle poskytovatele lišit, ale postup je vždy přibližně stejný.

### 1. Otevření administrace

1. Přihlásit se do účtu poskytovatele, kde je spravována současná VPS.
2. Otevřít sekci typu:
   - `Servers`,
   - `VPS`,
   - `Cloud`,
   - `Instances`,
   - `Virtuální servery`.
3. Zvolit:
   - `Create server`,
   - `New VPS`,
   - `Add instance`,
   - `Objednat VPS`.
4. Nevytvářet snapshot ani klon současné produkční VPS. Potřebujeme nový čistý server.

### 2. Výběr lokality

Vybrat datacentrum v Česku nebo blízké Evropě, například:

- Praha,
- Frankfurt,
- Norimberk,
- Vídeň,
- Varšava.

Pokud poskytovatel nabízí více lokalit bez cenového rozdílu, preferovat Prahu nebo Frankfurt.

### 3. Výběr operačního systému

Vybrat:

```text
Ubuntu 24.04 LTS, 64bit, čistá instalace
```

Nevybírat:

- Ubuntu Desktop,
- Windows Server,
- Debian, pokud je dostupné Ubuntu 24.04,
- předinstalovaný WordPress,
- LAMP/LEMP stack,
- Docker image poskytovatele,
- Plesk nebo cPanel.

Docker a všechny služby se nainstalují později kontrolovaným způsobem.

### 4. Výběr velikosti serveru

Vybrat tarif, který splňuje minimálně:

```text
2 vCPU
4 GB RAM
40 GB SSD nebo NVMe
1 veřejná statická IPv4
```

Pokud poskytovatel nenabízí přesně 40 GB disku, vybrat nejbližší vyšší variantu.

Nevybírat variantu s:

- 1 GB RAM,
- 2 GB RAM,
- sdílenou IPv4 bez možnosti příchozího HTTP/HTTPS provozu.

### 5. Název serveru

Pokud je vyžadován název nebo hostname, použít:

```text
egp-admin
```

Případně:

```text
admin.eurogopass.com
```

Hostname nemění DNS automaticky. Je to pouze interní název serveru.

### 6. Přidání SSH klíče

Pokud je v administraci sekce `SSH keys`, `Security`, `Authentication` nebo `Access`:

1. Zvolit autentizaci pomocí SSH klíče.
2. Kliknout na `Add SSH key`.
3. Jako název klíče použít:

```text
EuroGoPass deployment
```

4. Do pole pro veřejný klíč vložit celý řádek uvedený v následující kapitole.
5. Ověřit, že řádek začíná `ssh-ed25519`.
6. Tento klíč přiřadit k nově vytvářené VPS.

Pokud administrace nabízí současně SSH klíč a root heslo, preferovat SSH klíč. Dočasné heslo může být vygenerováno jako nouzová možnost, ale nemá se posílat běžným chatem.

### 7. Veřejná IP adresa

Ověřit, že server dostane:

```text
1× veřejnou statickou IPv4
```

Nepostačuje pouze:

- interní privátní IP,
- IPv6 bez IPv4,
- sdílená NAT adresa.

### 8. Zálohy

Pokud poskytovatel nabízí automatické zálohy nebo snapshoty:

- doporučeno zapnout,
- ideálně denní záloha,
- uchování alespoň 7 dní.

Pokud jde o výrazně placenou doplňkovou službu, lze ji před objednáním konzultovat. Zálohy nejsou podmínkou prvního spuštění.

### 9. Dokončení objednávky

1. Zkontrolovat zvolenou konfiguraci.
2. Ověřit, že jde o nový server, nikoliv změnu současné VPS.
3. Potvrdit objednávku.
4. Počkat na stav:

```text
Running
Active
Zapnuto
```

Provisioning může trvat několik minut.

## SSH přístup

Při objednávce vložit následující veřejný SSH klíč:

```text
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIIa/15loitXRj89IjJAKLvljmtwlZ3hbMyUfz4hDqm7g egp-worker
```

Jde pouze o veřejný klíč a je bezpečné ho vložit do administrace poskytovatele.

Preferovaná autentizace:

```text
SSH key
```

Pokud poskytovatel neumí přidat SSH klíč při vytvoření serveru:

1. vytvořit VPS s dočasným heslem pro `root`,
2. otevřít webovou konzoli serveru,
3. přidat výše uvedený klíč do `/root/.ssh/authorized_keys`,
4. dočasné heslo neposílat e-mailem ani do běžného chatu.

### Ruční přidání klíče přes webovou konzoli

Použít pouze tehdy, pokud klíč nešel vložit při objednávce:

1. Otevřít webovou/VNC konzoli nové VPS v administraci poskytovatele.
2. Přihlásit se jako `root` dočasným heslem.
3. Spustit:

```bash
mkdir -p /root/.ssh
chmod 700 /root/.ssh
nano /root/.ssh/authorized_keys
```

4. Vložit celý veřejný SSH klíč na jeden řádek.
5. V editoru Nano uložit pomocí `Ctrl+O`, potvrdit Enterem a zavřít `Ctrl+X`.
6. Nastavit oprávnění:

```bash
chmod 600 /root/.ssh/authorized_keys
```

7. Root heslo zatím nevypínat. Zakázání přihlášení heslem se provede až po ověření SSH klíče.

## Firewall poskytovatele

Pokud poskytovatel nabízí externí firewall, povolit:

| Port | Protokol | Účel |
|---|---|---|
| 22 | TCP | SSH správa |
| 80 | TCP | HTTP a vystavení HTTPS certifikátu |
| 443 | TCP | HTTPS dashboard |

Všechny ostatní příchozí porty mohou zůstat zavřené.

Porty dashboardu, Gmail ingestu ani interního monitoru se nemají zveřejňovat přímo do internetu.

Pokud poskytovatel externí firewall nenabízí, tento krok přeskočit. Firewall uvnitř Ubuntu se nastaví při nasazení.

Pokud firewall vyžaduje zdrojovou adresu:

- porty `80` a `443` povolit z `0.0.0.0/0`,
- port `22` lze pro první zprovoznění povolit z `0.0.0.0/0`,
- po nasazení bude SSH dále zabezpečeno klíčem a interním firewallem.

## Co po vytvoření ověřit

Server musí být ve stavu `Running` nebo `Active`.

Ověřit:

- přidělenou veřejnou IPv4,
- Ubuntu 24.04 LTS,
- dostupný SSH port 22,
- přidaný veřejný SSH klíč,
- minimálně 4 GB RAM,
- minimálně 40 GB disku.

### Doporučený test SSH

Pokud má kolega přístup k počítači, kde je uložen odpovídající privátní klíč, ověřit:

```powershell
ssh -i "C:\Users\Jakub\eurogopass-fulfillment-worker\.ssh-deploy\egp_vps" root@NOVA_IP_ADRESA
```

Při prvním připojení potvrdit fingerprint zadáním:

```text
yes
```

Po úspěšném přihlášení spustit:

```bash
hostname
cat /etc/os-release
free -h
df -h /
```

Očekávaný výsledek:

- hostname nové VPS,
- Ubuntu 24.04 LTS,
- přibližně 4 GB RAM,
- minimálně 40 GB disk.

Poté SSH ukončit:

```bash
exit
```

Pokud kolega nemá přístup k privátnímu klíči, stačí potvrdit, že byl veřejný klíč přiřazen. SSH následně ověří Jakub/Codex.

## Co předat Jakubovi

Po zřízení stačí předat:

```text
Veřejná IPv4: x.x.x.x
Poskytovatel: název služby
Hostname VPS: pokud byl nastaven
SSH uživatel: root
SSH klíč přidán: ano/ne
Zálohy aktivní: ano/ne
Firewall poskytovatele: ano/ne
Povolené porty: 22, 80, 443
```

Neposílat:

- privátní SSH klíče,
- root heslo přes běžný chat,
- přihlašovací údaje do účtu poskytovatele,
- recovery kódy.

## Co na nové VPS zatím nedělat

Před předáním IP adresy:

- neinstalovat Docker,
- neinstalovat Nginx, Apache ani Caddy,
- nevytvářet databázi,
- nekopírovat na server `.env` soubory,
- nekopírovat Gmail OAuth údaje,
- nekopírovat Supabase service-role klíč,
- nespouštět dashboard,
- nespouštět Gmail ingest,
- neměnit SSH port,
- nezakazovat root přístup,
- nevypínat přihlášení heslem, dokud není ověřen SSH klíč,
- neměnit současnou produkční VPS,
- neměnit DNS domény.

## DNS – až po potvrzení IP adresy

Po technickém ověření nové VPS se v DNS domény `eurogopass.com` vytvoří:

```text
Typ: A
Název: admin
Hodnota: veřejná IPv4 nové VPS
TTL: Auto nebo 300
```

Výsledná adresa bude:

```text
https://admin.eurogopass.com
```

Tento DNS záznam neovlivní hlavní web `eurogopass.com`, záznam `www` ani e-mailové DNS záznamy.

Pokud pro `admin` již existuje záznam typu `A`, `AAAA` nebo `CNAME`, nejdříve jeho stav konzultovat. Pro stejný název nemají zůstat konfliktní záznamy.

DNS se nemá měnit současně se založením VPS. Nejprve se ověří SSH, firewall a aplikace na nové IP. Teprve potom se přesměruje subdoména.

## Následné technické nasazení

Po předání IP adresy bude na VPS dodatečně provedeno:

1. aktualizace Ubuntu,
2. zabezpečení SSH a firewallu,
3. vytvoření swapu,
4. instalace Dockeru,
5. nasazení EuroGoPass Admin dashboardu,
6. nasazení Gmail ingest služby,
7. nastavení automatických restartů,
8. HTTPS pro `admin.eurogopass.com`,
9. zabezpečené propojení se stávající VPS,
10. napojení produkčního live logu,
11. rotace logů a kontrola health endpointů,
12. end-to-end test Gmailu, dokladů a ručního FULFILLED auditu.
