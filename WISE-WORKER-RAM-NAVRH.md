# Návrh: snížení RAM Wise 3DS workeru

## Kontext a cíl

Chceme uvolnit RAM na VPS, aby na něm mohl bezpečně běžet také interní EGP dashboard. Wise worker dnes používá výrazně více paměti, než by měl, protože Node i Chrome běží a procházejí Wise nepřetržitě 24/7.

Naměřeno na produkčním VPS dne 15. 7. 2026:

- VPS: 2 vCPU, 3,8 GB RAM, bez swapu
- `wise-3ds-worker` (Node): přibližně 1,3 GB RAM
- `wise-chrome-cdp.service`: přibližně 1,7 GB RAM
- Wise část celkem: přibližně 3 GB RAM
- uptime 5 dní, 5 516 cyklů a 135 831 řádků logu
- worker i Chrome vykazují postupný růst paměti

Cíl je dostat Wise část v klidu téměř na nulu a během aktivní objednávky přibližně na 500–850 MB.

## Navržené technické řešení

Přejít z nepřetržitého procházení Wise na hybridní režim **wake on order**:

1. Lehký watcher bez Chromu čeká na relevantní změnu v Supabase (`postgres_changes`/Realtime). Jako pojistka může jednou za 30–60 sekund provést levný DB dotaz.
2. Když přijde nová objednávka nebo položka přejde do platebního stavu, watcher spustí `wise-chrome-cdp.service` a Wise worker.
3. Worker otevře existující persistentní Chrome profil, ověří session a obslouží platbu/3DS.
4. Po poslední aktivní objednávce zůstane vzhůru ochranné okno například 15–20 minut. Objednávka obvykle netrvá déle než 10 minut.
5. Pokud není žádná objednávka ve stavu vyžadujícím platbu nebo 3DS, worker bezpečně uloží session a Chrome i Node se ukončí.
6. Každá nová událost aktivní okno prodlouží. Nikdy se nesmí vypnout během rozpracované platby, čekání na OTP/3DS nebo ručního zásahu.

Watcher by měl být samostatný velmi malý proces/systemd service, nikoliv součást procesu, který se vypíná. Alternativou je Supabase Database Webhook volající zabezpečený endpoint na VPS; doporučená je kombinace Realtime + periodický DB fallback, aby ztracené spojení nezablokovalo objednávku.

## Ruční a bezpečnostní režim

- Dashboard musí mít akci „Spustit/udržet Wise worker“ s časově omezeným `manual hold` (např. 30 minut).
- Stav `manual_hold_until` lze držet v DB nebo lokálním stavovém souboru.
- Před uspáním vždy zkontrolovat aktivní objednávky i lokální lock.
- Přidat maximální dobu běhu a alarm, ne slepý restart během platby.
- Zachovat persistentní Chrome profil, protože přihlášení a Turnstile mohou komplikovat studený start.
- Přidat 2GB swap pouze jako pojistku; swap není řešení úniku paměti.

## Další nutné optimalizace

- V idle režimu neprovádět navigaci na Wise každou minutu.
- Recyklovat Chrome/Playwright po dokončeném aktivním okně, čímž se odstraní nahromaděné renderery.
- Nahradit opakované `appendFile()` jedním logovacím streamem a omezit duplicitní debug logy.
- Měřit Node RSS/heap, Chrome cgroup RAM, počet rendererů a dobu studeného startu.
- Nastavit memory guard, který upozorní a provede bezpečnou recyklaci pouze mimo aktivní platbu.

## Doporučený postup implementace

1. Nejdřív změřit studený start, obnovení Wise session a průchod testovací objednávky.
2. Implementovat stavový automat `sleeping → starting → ready → armed → cooldown → sleeping`.
3. Přidat Supabase trigger/watch, periodický fallback a ruční hold.
4. Ověřit scénáře: nová objednávka, více objednávek za sebou, OTP, čekání na 3DS, ruční zásah, restart VPS a výpadek Supabase Realtime.
5. Teprve po ověření zapnout automatické vypínání v produkci.

## Otázky pro technické posouzení

- Je Supabase Realtime pro používané tabulky spolehlivější než Database Webhook, nebo použít obojí?
- Které přesné DB stavy musí držet worker vzhůru?
- Jak dlouho reálně trvá studený start a obnovení přihlášené Wise session?
- Jak bezpečně rozpoznat probíhající ruční zásah?
- Lze Node watcher provozovat samostatně s cílovou spotřebou pod 100 MB?

Očekávaný výsledek: výrazně nižší klidová spotřeba, pravidelná recyklace nahromaděné paměti a dostatečná rezerva pro nasazení EGP dashboardu na stejném VPS.
