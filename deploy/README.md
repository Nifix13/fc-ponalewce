# Wdrożenie na VPS

Zakłada Debiana albo Ubuntu. Wszędzie podmień `janek` i `fcponalewce.pl` na swoje.

## 0. Czego VPS musi mieć

**Node 24 lub nowszy.** Nie 20, nie 22. Projekt stoi na dwóch rzeczach, których
starsze wersje nie mają: wbudowanej bazie `node:sqlite` i uruchamianiu plików
`.ts` bez kompilacji (`npm run sync`). Na Node 20 synchronizacja nie wystartuje.

```
node -v
```

Jeśli starszy — najprościej przez nvm:

```
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
nvm install 24
```

## 1. Wrzucenie kodu

### Przez GitHub (zalecane)

Na laptopie:

```
git remote add origin git@github.com:TWOJ-LOGIN/fc-ponalewce.git
git push -u origin master
```

Na VPS:

```
git clone git@github.com:TWOJ-LOGIN/fc-ponalewce.git
cd fc-ponalewce
```

Każda późniejsza aktualizacja to `git pull && npm ci && npm run build &&
sudo systemctl restart fcponalewce`.

### Albo bezpośrednio, bez GitHuba

Z laptopa, z katalogu projektu:

```
rsync -av --exclude node_modules --exclude .next --exclude .git \
  ./ janek@ADRES-IP:/home/janek/fc-ponalewce/
```

Prościej na raz, ale przy każdej zmianie powtarzasz, i nie masz historii ani
kopii zapasowej.

## 2. Instalacja i budowanie

```
cd ~/fc-ponalewce
npm ci
npm run build
```

Budowanie potrzebuje **więcej pamięci niż działanie** — przy 1 GB RAM może się
nie udać. Wtedy dołóż plik wymiany:

```
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
```

## 3. Hasło do panelu

Plik `.env.local` **nie jest w repozytorium** i słusznie. Utwórz go na VPS:

```
printf 'ADMIN_PASSWORD=twoje-dlugie-haslo\nSESSION_SECRET=%s\n' \
  "$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')" \
  > .env.local
chmod 600 .env.local
```

Na publicznym adresie użyj dłuższego hasła niż na localhoście.

## 4. Pierwsze dane

```
npm run herb    # robi wersję herbu z przezroczystym tłem
npm run sync    # pobiera obie ligi
```

## 5. Usługa

```
sudo cp deploy/fcponalewce.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now fcponalewce
systemctl status fcponalewce
```

Logi na żywo: `journalctl -u fcponalewce -f`

## 6. Domena i HTTPS

W panelu rejestratora (Namecheap) ustaw rekordy **A**: `@` i `www` na adres IP
serwera. Potem:

```
sudo apt install -y caddy
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy sam wyrobi certyfikat. Otwórz porty 80 i 443:

```
sudo ufw allow 80,443/tcp
```

## 7. Codzienna synchronizacja

```
crontab -e
```

i wklej linię z `deploy/sync.cron`.

To jest ważniejsze, niż wygląda: **strzelcy pojedynczych meczów liczą się
z różnicy między migawkami**. Jeśli synchronizacja nie chodzi regularnie,
a zagracie dwa mecze między pobraniami, system nie będzie w stanie rozdzielić,
komu co przypisać — i słusznie odmówi zamiast zgadywać.

## Co przenieść z laptopa, a czego nie

| | |
|---|---|
| `dane.db` | **nie kopiuj** — na VPS powstanie od zera przy pierwszym `npm run sync`. Skopiuj tylko, jeśli masz tam już posty, których nie chcesz stracić. |
| `.env.local` | **nie kopiuj** — utwórz nowy, z innym hasłem |
| `public/uploads/` | skopiuj, jeśli masz tam zdjęcia do postów |
| `public/herb/` | jest w repozytorium, przyjdzie samo |

## Sprawdzenie, czy żyje

```
curl -s -o /dev/null -w '%{http_code}\n' https://fcponalewce.pl
curl -s -o /dev/null -w '%{http_code}\n' https://fcponalewce.pl/panel
```
