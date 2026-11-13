# Note Fiorentine — migrazione da Supabase a Neon + Better Auth + Neon Object Storage

Data inventario: 2026-11-13  
Branch isolato: `migration/neon-r2-better-auth-2026-11-13`  
Base: `fix/header-visual-editor-integrated-text-editor-2026-11-12`

## Obiettivo e vincoli

Sostituire Supabase per database, autenticazione e file storage, mantenendo Vercel per hosting. Architettura target:
- Neon PostgreSQL per i dati relazionali.
- Neon Managed Better Auth per login e sessioni amministrative.
- Neon Object Storage S3-compatible per immagini, PDF e video.
- API server-side su Vercel per operazioni amministrative e letture pubbliche, senza esporre credenziali privilegiate nel browser.

Vincolo prioritario dell'utente: nessun servizio che richieda carta o metodo di pagamento per iniziare. Preferire piani gratuiti senza carta e limiti espliciti; non attivare checkout, billing o upgrade. Nessuna modifica a Supabase Production, DNS o Vercel Production in questa fase. Nessuna credenziale o password deve essere committata.

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

### Storage Supabase

Production:
- `site-media`: 74 oggetti, 54,933,349 byte registrati nei metadati (circa 52.4 MiB).
- `performance-videos`: 1 oggetto; il conteggio è noto ma il metadato dimensione restituito da Storage è nullo/zero, da verificare prima del trasferimento.

Test:
- `site-media`: 32 oggetti, 5,654,754 byte.
- `performance-videos`: 2 oggetti, 5,348,953 byte.

La dimensione del video Production va verificata prima della copia.

### Auth e sicurezza

- Production: 1 utente Auth, 1 identity, 11 sessioni.
- Test: 1 utente Auth, 1 identity, 237 sessioni.
- Le sessioni Supabase non sono trasferibili come sessioni Better Auth: dopo lo switch gli amministratori dovranno autenticarsi nuovamente.
- L'eventuale riuso degli hash password va verificato per algoritmo e parametri; se incompatibile, prevedere reset password sicuro.
- Tabelle esposte con RLS e policy per lettura pubblica dei contenuti pubblicati e scrittura amministrativa autenticata.
- Production include funzioni SQL `is_admin()` e `normalize_performance_video_sort_order()`; trigger su `performance_videos` per normalizzare l'ordine.
- Test include le stesse funzioni/trigger ma ha alcune policy mancanti o differenti: non copiarne le policy alla cieca.

## Provisioning Neon — staging

- Organizzazione Neon: piano Free.
- Progetto creato: `note-fiorentine-migration` (ID `shiny-violet-24060641`).
- Regione: `aws-eu-central-1`; PostgreSQL 17.
- Branch predefinito: `migration` (ID `br-gentle-morning-bankk7pf`), stato `ready`.
- Database: `note_fiorentine`; ruolo applicativo dedicato `note_fiorentine_admin`.
- Autoscaling configurato tra 0.25 e 1 CU.
- Neon Managed Better Auth provisionato con provider `better_auth`; schema `neon_auth` e relative tabelle verificate.
- Neon Object Storage è abilitato sul branch. Bucket `note-fiorentine-media` creato e verificato con accesso `private`.
- Verificata anche la possibilità di creare un bucket `public_read` in staging; creato un bucket di test vuoto e poi eliminato. Nessun oggetto pubblico di prova è stato caricato: l'ambiente di esecuzione non ha risolto il DNS dell'endpoint storage, quindi non è stato possibile completare il test HTTP anonimo end-to-end.
- Il database applicativo è ancora vuoto: nessuna tabella public e nessun dato Supabase sono stati importati.
- Nessun oggetto media è stato ancora copiato.
- La stringa di connessione è stata generata ma non deve essere salvata nel repository o divulgata; resta da configurare come secret nell'ambiente Vercel Preview.
- Non è stato eseguito alcun deploy Vercel né alcun cambiamento Production.

## Limiti Free Neon: impatto sulla scelta media

La documentazione ufficiale consultata indica per il piano Free:
- 5 GB Object Storage per progetto.
- 5 GB/mese di public network transfer per progetto.
- Il traffico pubblico è condiviso tra Postgres, Object Storage e Functions.
- Al raggiungimento dei limiti Free di compute o trasferimento pubblico, il compute viene sospeso fino al reset mensile o all'upgrade; il piano Free non applica automaticamente overage a pagamento.

Fonti ufficiali: [Neon plans](https://neon.com/docs/introduction/plans) e [Free plan limits](https://neon.com/docs/introduction/plans#what-happens-when-i-hit-free-plan-limits). Le soglie possono cambiare e vanno ricontrollate prima del cutover.

Dato storico del progetto: dashboard Supabase il 12 novembre mostrava 46.776 GB di Cached Egress su All projects (aggregato dei due progetti; non sappiamo la quota attribuibile alla sola Production). Questo valore è molto superiore ai 5 GB/mese di trasferimento pubblico inclusi in Neon Free. Quindi **non è prudente pubblicare direttamente tutti gli asset da Neon senza CDN/cache**. La strategia deve prevedere cache edge con TTL e invalidazione/versioning per ridurre i fetch ripetuti verso Neon. Non promettere egress illimitato o costo zero per traffico superiore alle quote.
- Neon Object Storage raccomanda esplicitamente una CDN davanti agli asset pubblici; il suo endpoint non include una CDN.
- Gli URL presigned sono adatti a oggetti privati e accessi temporanei, non come URL permanenti per tutte le immagini pubbliche del sito.

## Decisione storage e registrazione Tigris

L'utente ha registrato un account Tigris, ma non ha autorizzato né intende inserire metodi di pagamento.
- Tigris non è stato provisionato né usato.
- La migrazione non deve richiedere carta o metodo di pagamento aggiuntivo.

## Dipendenze da rimuovere dal codice

Il sito pubblico usa direttamente Supabase REST e Storage per:
- `site_content`, `menu_categories`, `menu_items`, `homepage_popup`, `events`;
- `site_images`, `gallery_images`, `artist_images`, `performance_videos`, `restaurant_videos`;
- URL pubblici `/storage/v1/object/public/site-media/` e `performance-videos`.

Il pannello `src/src/gestione-immagini.html` usa `@supabase/supabase-js` per sessione, login, verifica `admin_users`, CRUD tabelle e upload/rimozione Storage. La migrazione richiede quindi un adattamento completo del client admin, non una semplice sostituzione degli URL delle immagini.

Il video hero in `src/src/index.html` punta attualmente a un URL del progetto Supabase Test: correggere la sorgente durante la migrazione media.

## Sequenza di migrazione

1. [Completato] Ottenere accesso/provisioning Neon e creare risorse esclusivamente di staging.
2. Eseguire backup verificabile di schema, dati Production, policy, funzioni, trigger e inventario completo degli oggetti Storage (nomi, MIME, dimensioni, checksum).
3. Preparare schema PostgreSQL portabile, preservando UUID, vincoli, indici, default, traduzioni JSON e relazioni.
4. Importare dati Production in Neon staging e confrontare conteggi e checksum logici.
5. Copiare i file Production in Neon Object Storage staging, mantenendo path stabili o una mappa path→URL; confrontare numero file, dimensioni e checksum.
6. Implementare API server-side, integrazione Neon Managed Better Auth e permessi amministrativi equivalenti alle policy RLS attuali.
7. Implementare e testare cache CDN per gli asset pubblici, inclusi TTL, versioning e invalidazione.
8. Aggiornare homepage, menu e pannello admin dietro variabili ambiente Preview; non esporre segreti Neon/S3 nel browser.
9. Test automatizzati: tutte le lingue (IT/EN/DE/FR/ES/ZH), contenuti, immagini, video, popup, menu, CRUD admin, upload, permessi, session expiry e rollback.
10. Solo dopo esito positivo e approvazione esplicita, pianificare cutover Production. Mantenere Supabase intatto per rollback finché la nuova architettura è verificata.

## Prossime azioni

- [Completato] Account Neon collegato e progetto staging creato.
- [Completato] Neon Managed Better Auth provisionato.
- [Completato] Bucket privato Neon staging creato e verificato.
- [Completato] Modalità bucket `public_read` creabile; test HTTP anonimo ancora da eseguire perché l'ambiente corrente non ha risolto il DNS storage.
- [Completato] Account Tigris registrato dall'utente; non è stato creato alcun bucket Tigris né inserito alcun metodo di pagamento.
- Prima di importare i media, definire e verificare una CDN/cache che tenga il consumo entro i 5 GB di trasferimento pubblico del piano Free.
- Completare backup verificabile di Supabase Production prima dell'importazione. Non effettuare modifiche a Production durante questa fase.
- Nessuna credenziale o password va incollata in chat o committata.
