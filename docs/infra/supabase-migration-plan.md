# Note Fiorentine — migrazione da Supabase a Neon + Better Auth + Tigris

Data inventario: 2026-11-13  
Branch isolato: `migration/neon-r2-better-auth-2026-11-13`  
Base: `fix/header-visual-editor-integrated-text-editor-2026-11-12`

## Obiettivo e vincoli

Sostituire Supabase per database, autenticazione e file storage, mantenendo Vercel per hosting. Architettura target:
- Neon PostgreSQL per i dati relazionali.
- Neon Managed Better Auth per login e sessioni amministrative.
- Tigris Object Storage (S3-compatible) per immagini, PDF e video, con egress Internet gratuito.
- API server-side su Vercel per operazioni amministrative e letture pubbliche, senza esporre credenziali privilegiate nel browser.

Vincolo prioritario dell'utente: nessun servizio che richieda carta o metodo di pagamento per iniziare. Preferire piani gratuiti senza carta e hard limits; non attivare checkout, billing o upgrade. Nessuna modifica a Supabase Production, DNS o Vercel Production in questa fase. Nessuna credenziale o password deve essere committata.

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

La quantità nota è ampiamente inferiore al limite gratuito Tigris di 5 GB Standard; la dimensione del video Production va verificata. Tigris dichiara egress Internet gratuito e un piano Free mensile con 5 GB storage, 10.000 richieste Class A e 100.000 Class B, senza carta per iniziare. Oltre i limiti il servizio ha tariffe a consumo: non attivare upgrade o billing e fermare gli upload se si raggiungono i limiti.

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
- Il database applicativo è ancora vuoto: nessuna tabella public e nessun dato Supabase sono stati importati.
- La stringa di connessione è stata generata ma non deve essere salvata nel repository o divulgata; resta da configurare come secret nell'ambiente Vercel Preview.
- Nessun bucket media è stato creato: la destinazione media proposta è Tigris, da attivare solo dopo conferma della registrazione gratuita senza carta.
- Non è stato eseguito alcun deploy Vercel né alcun cambiamento Production.

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
5. Creare bucket Tigris staging e copiare file Production, mantenendo path stabili o una mappa path→URL; confrontare numero file, dimensioni e checksum.
6. Implementare API server-side, integrazione Neon Managed Better Auth e permessi amministrativi equivalenti alle policy RLS attuali.
7. Aggiornare homepage, menu e pannello admin dietro variabili ambiente Preview; non esporre segreti Tigris/Neon nel browser.
8. Test automatizzati: tutte le lingue (IT/EN/DE/FR/ES/ZH), contenuti, immagini, video, popup, menu, CRUD admin, upload, permessi, session expiry e rollback.
9. Solo dopo esito positivo e approvazione esplicita, pianificare cutover Production. Mantenere Supabase intatto per rollback finché la nuova architettura è verificata.

## Blocchi esterni / prossime azioni

- Neon è collegato e il progetto staging è stato creato.
- Cloudflare R2 è stato scartato prima del provisioning: l'attivazione richiede un checkout per abbonamento R2 e una carta/metodo di pagamento. Non è stato creato alcun bucket e non va inserito alcun metodo di pagamento.
- Tigris è l'alternativa selezionata sulla base della pagina prezzi ufficiale: [https://www.tigrisdata.com/pricing/](https://www.tigrisdata.com/pricing/). Il piano gratuito dichiara 5 GB Standard, 10.000 richieste Class A e 100.000 Class B al mese, egress gratuito e nessuna carta per iniziare.
- Prossimo passo: creare un account Tigris gratuito senza carta e verificare che la console consenta di creare un bucket senza checkout. Non aggiungere metodi di pagamento, non attivare piani a consumo.
- Nessuna credenziale o password va incollata in chat o committata.
- Prima di importare, completare il backup verificabile di Supabase Production. Non effettuare modifiche a Production durante questa fase.
