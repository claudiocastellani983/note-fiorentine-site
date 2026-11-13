# Note Fiorentine — migrazione da Supabase a Neon + Better Auth + Cloudflare R2

Data inventario: 2026-11-13  
Branch isolato: `migration/neon-r2-better-auth-2026-11-13`  
Base: `fix/header-visual-editor-integrated-text-editor-2026-11-12`

## Obiettivo e vincoli

Sostituire Supabase per database, autenticazione e file storage, mantenendo Vercel per hosting. Architettura target proposta:
- Neon PostgreSQL per i dati relazionali.
- Better Auth per login e sessioni amministrative.
- Cloudflare R2 per immagini, PDF e video; URL pubblici/CDN separati dal database.
- API server-side su Vercel per operazioni amministrative e letture pubbliche, senza esporre credenziali privilegiate nel browser.

Nessuna modifica a Supabase Production, DNS, Vercel Production o dati pubblicati è autorizzata in questa fase. Nessuna credenziale o password deve essere committata.

## Inventario Supabase

Progetti rilevati nell'organizzazione NoteFiorentine:
- Production: `nculgrwlzjitggjcgbpp`, regione `eu-central-1`, PostgreSQL 17.
- Test: `iuxskknbopboynjlsxbk`, regione `eu-central-1`, PostgreSQL 17.

### Tabelle public — Production

| Tabella | Righe |
|---|---:|
| admin_users | 1 |
| artist_images | 4 |
| events | 0 |
| gallery_images | 15 |
| homepage_popup | 1 |
| menu_categories | 7 |
| menu_items | 47 |
| performance_videos | 2 |
| restaurant_videos | 1 |
| site_content | 1 |
| site_images | 9 |
| **Totale** | **87** |

### Tabelle public — Test

| Tabella | Righe |
|---|---:|
| admin_users | 1 |
| artist_images | 4 |
| events | 0 |
| gallery_images | 11 |
| homepage_popup | 1 |
| menu_categories | 6 |
| menu_items | 47 |
| performance_videos | 2 |
| restaurant_videos | 0 |
| site_content | 1 |
| site_images | 9 |
| **Totale** | **82** |

Production è la fonte autorevole per i contenuti live; Test contiene alcune differenze e non deve sovrascrivere Production.

### Storage

Production:
- `site-media`: 74 oggetti, 54,933,349 byte registrati nei metadati (circa 52.4 MiB).
- `performance-videos`: 1 oggetto; il conteggio è noto ma il metadato dimensione restituito da Storage è nullo/zero, da verificare prima del trasferimento.

Test:
- `site-media`: 32 oggetti, 5,654,754 byte.
- `performance-videos`: 2 oggetti, 5,348,953 byte.

La quantità rilevata rientra ampiamente nel limite di storage gratuito R2 indicato nella valutazione iniziale, ma la dimensione del video Production va verificata. Il traffico egress deve essere monitorato separatamente.

### Auth e sicurezza

- Production: 1 utente Auth, 1 identity, 11 sessioni.
- Test: 1 utente Auth, 1 identity, 237 sessioni.
- Le sessioni Supabase non sono trasferibili come sessioni Better Auth: dopo lo switch gli amministratori dovranno autenticarsi nuovamente.
- L'eventuale riuso degli hash password va verificato per algoritmo e parametri; se incompatibile, prevedere reset password sicuro.
- Tabelle esposte con RLS e policy per lettura pubblica dei contenuti pubblicati e scrittura amministrativa autenticata.
- Production include funzioni SQL `is_admin()` e `normalize_performance_video_sort_order()`; trigger su `performance_videos` per normalizzare l'ordine.
- Test include le stesse funzioni/trigger ma ha alcune policy mancanti o differenti: non copiarne le policy alla cieca.

## Dipendenze da rimuovere dal codice

Il sito pubblico usa direttamente Supabase REST e Storage per:
- `site_content`, `menu_categories`, `menu_items`, `homepage_popup`, `events`;
- `site_images`, `gallery_images`, `artist_images`, `performance_videos`, `restaurant_videos`;
- URL pubblici `/storage/v1/object/public/site-media/` e `performance-videos`.

Il pannello `src/src/gestione-immagini.html` usa `@supabase/supabase-js` per sessione, login, verifica `admin_users`, CRUD tabelle e upload/rimozione Storage. La migrazione richiede quindi un adattamento completo del client admin, non una semplice sostituzione degli URL delle immagini.

Il video hero in `src/src/index.html` punta attualmente a un URL del progetto Supabase Test: correggere la sorgente durante la migrazione media.

## Sequenza di migrazione

1. Ottenere accesso/provisioning dei servizi Neon e Cloudflare R2 e creare risorse esclusivamente di staging.
2. Eseguire backup verificabile di schema, dati Production, policy, funzioni, trigger e inventario completo degli oggetti Storage (nomi, MIME, dimensioni, checksum).
3. Preparare schema PostgreSQL portabile, preserving UUID, vincoli, indici, default, traduzioni JSON e relazioni.
4. Importare dati Production in Neon staging e confrontare conteggi e checksum logici.
5. Copiare file Production in R2 staging, mantenendo path stabili o una mappa path→URL; confrontare numero file, dimensioni e checksum.
6. Implementare API server-side, Better Auth e permessi amministrativi equivalenti alle policy RLS attuali.
7. Aggiornare homepage, menu e pannello admin dietro variabili ambiente Preview; non esporre segreti R2/Neon nel browser.
8. Test automatizzati: tutte le lingue (IT/EN/DE/FR/ES/ZH), contenuti, immagini, video, popup, menu, CRUD admin, upload, permessi, session expiry e rollback.
9. Solo dopo esito positivo e approvazione esplicita, pianificare cutover Production. Mantenere Supabase intatto per rollback finché la nuova architettura è verificata.

## Blocchi esterni

Non risultano collegamenti o credenziali Neon e Cloudflare R2 disponibili in questa sessione. Senza tali accessi non è possibile creare i database/bucket, trasferire i file, impostare i segreti Vercel o verificare il nuovo login. Non inserire mai credenziali nel repository o nella chat.
