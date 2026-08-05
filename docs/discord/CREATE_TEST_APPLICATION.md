# Utworzenie aplikacji Discord dla V2 LAB (P1)

Discord **nie udostępnia** publicznego API do utworzenia nowej aplikacji/bota bez konta w [Developer Portal](https://discord.com/developers/applications).  
Tego kroku **nie da się zautomatyzować z Cursora / CI**. Wykonujesz go raz w przeglądarce (konto Discord z dostępem do guildu testowego).

Guild docelowy instalacji:

```text
1534228693017432124
```

## Czego NIE robić

- Nie wklejaj tokenu ani Application ID do czatu, PR, issue ani screenshotu z widocznym tokenem.
- Nie włączaj privileged intents.
- Nie zaznaczaj uprawnienia **Administrator**.
- Nie instaluj bota na innych serwerach niż powyższy guild testowy.

## Krok A — nowa aplikacja

1. Zaloguj się na Discord w przeglądarce tym samym kontem, którym zarządzasz guildem testowym.
2. Otwórz: https://discord.com/developers/applications
3. Kliknij **New Application**.
4. Nazwa (przykład): `V2 LAB Test` (możesz zmienić później).
5. Zaakceptuj Terms → **Create**.

## Krok B — Application ID

1. W menu po lewej: **General Information** (czasem **Settings → General**).
2. Skopiuj **APPLICATION ID** (długi numer / snowflake).
3. Zapisz go lokalnie na później jako `DISCORD_APPLICATION_ID` — **jeszcze nie wysyłaj do Cursora**, dopóki nie skończysz całej checklisty poniżej.

## Krok C — Bot user + token

1. W menu: **Bot**.
2. Jeśli nie ma bota: **Add Bot** → Confirm.
3. **Privileged Gateway Intents** — wszystko **WYŁĄCZONE**:
   - Presence Intent → OFF
   - Server Members Intent → OFF
   - Message Content Intent → OFF
4. Opcjonalnie: wyłącz publiczny bot (`Public Bot` OFF), jeśli chcesz ograniczyć zaproszenia.
5. Kliknij **Reset Token** / **View Token** → skopiuj token **raz**.
6. Zapisz lokalnie jako `DISCORD_TOKEN` (menedżer haseł / lokalny plik poza Gitem).  
   Jeśli token wycieknie → natychmiast **Reset Token**.

## Krok D — OAuth2: zaproszenie tylko na guild testowy

1. Menu: **OAuth2 → URL Generator** (w starszym UI: OAuth2 → URL Generator).
2. **Scopes** zaznacz wyłącznie:
   - `bot`
   - `applications.commands`
3. **Bot Permissions** zaznacz wyłącznie:
   - View Channels
   - Send Messages
   - Embed Links
   - Read Message History
4. **Nie** zaznaczaj Administrator ani Manage Roles / Ban Members itd.
5. Skopiuj wygenerowany URL na dole strony.
6. Otwórz URL w przeglądarce.
7. W selektorze serwera wybierz **wyłącznie** serwer o ID `1534228693017432124` (włącz Developer Mode w Discord → prawy przycisk na serwer → Copy Server ID, żeby potwierdzić).
8. Autoryzuj instalację.

## Krok E — Twoje User ID (operator)

1. W kliencie Discord: **Ustawienia użytkownika → Zaawansowane → Tryb dewelopera** → ON.
2. Prawy przycisk na **swojej awatarze / nazwie** → **Kopiuj ID użytkownika**.
3. Zapisz lokalnie jako `DISCORD_TEST_OPERATOR_IDS`.

## Krok F — Bot User ID (nie sekret)

1. W Developer Portal → **Bot** albo na serwerze: prawy przycisk na bocie → **Kopiuj ID**.
2. Zapisz lokalnie (przyda się do raportu live testu). To **nie** jest token.

## Checklist przed powrotem do Cursora

Masz lokalnie (poza Gitem):

- [ ] Application ID
- [ ] Bot token
- [ ] Własne User ID
- [ ] Bot jest członkiem wyłącznie guildu `1534228693017432124`
- [ ] Privileged intents OFF
- [ ] Brak uprawnienia Administrator

Potem w czacie Cursor napisz tylko:

```text
Aplikacja Discord utworzona. Mam lokalnie Application ID, Token i User ID.
```

**Nie wklejaj** jeszcze wartości, dopóki agent nie poprosi o wpisanie ich do lokalnego `.env` (albo o podanie samych ID bez tokenu — Application ID i User ID nie są sekretami; **token zawsze tylko do `.env`**).

## Co robi Cursor po Twoim sygnale

1. Pomoże uzupełnić lokalny `.env` (Ty wklejasz sekrety do pliku, nie do czatu).
2. `pnpm discord:test:generate-secret`
3. `pnpm discord:test:doctor` → `register` → `start`
4. Live test na guildzie.

## Automatyzacja — granica

| Działanie                             | Automatyzowalne?                                         |
| ------------------------------------- | -------------------------------------------------------- |
| Utworzenie Application / Bot w Portal | **Nie** (tylko UI Discord)                               |
| Generowanie invite URL                | Częściowo (szablon poniżej) po posiadaniu Application ID |
| Rejestracja komend guild              | Tak — `pnpm discord:test:register` (wymaga tokenu)       |
| Start Gateway                         | Tak — `pnpm discord:test:start`                          |
| Testy CI bez tokenu                   | Tak — `DISCORD_ENABLED=false`                            |

### Szablon invite (po uzyskaniu Application ID)

Zastąp `APP_ID` swoim Application ID. Permissions bitfield = ViewChannel + SendMessages + EmbedLinks + ReadMessageHistory = `2048 + 64 + 16384 + 65536` = `83968`:

```text
https://discord.com/api/oauth2/authorize?client_id=APP_ID&permissions=83968&scope=bot%20applications.commands
```

Otwórz ten link i wybierz wyłącznie guild testowy.
