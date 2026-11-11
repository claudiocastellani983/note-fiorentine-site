const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test.describe('Supporto Vimeo in tutte le sezioni video', () => {
  const home = read('src/src/index.html');
  const menu = read('src/src/menu.html');
  const admin = read('admin/src/index.html');
  const migration = read('supabase/migrations/20261111_video_url_vimeo_support.sql');

  test('Admin consente link Vimeo sia per musica dal vivo sia per video ambienti', () => {
    expect(admin).toContain("'Musica dal vivo':{table:'performance_videos'");
    expect(admin).toContain("'video_url','Link video Vimeo/YouTube (opzionale)','url'");
    expect(admin).toContain("'Video ambienti':{table:'restaurant_videos'");
    expect(admin).toContain("'video_url','Link video Vimeo/YouTube','url',1");
    expect(admin).toContain("'vimeo.com','player.vimeo.com'");
    expect(admin).toContain("fieldsToVerify=['title','description','video_path','video_url'");
  });

  test('Home e galleria artisti incorporano Vimeo e conservano i video caricati', () => {
    expect(home).toContain('extractVimeoId(videoSource)');
    expect(home).toContain('https://player.vimeo.com/video/');
    expect(home).toContain('video_url,video_orientation');
    expect(home).toContain("publicUrl('performance-videos',item.video_path)");
    expect(home).toContain('nfExternalVideoEmbed(item.video_url)');
  });

  test('Menu supporta Vimeo nella sezione delle performance', () => {
    expect(menu).toContain('video_path,video_url,translations');
    expect(menu).toContain('https://player.vimeo.com/video/');
    expect(menu).toContain("media=document.createElement('iframe')");
    expect(menu).toContain("media=document.createElement('video')");
  });

  test('La migrazione aggiunge video_url senza rimuovere i campi legacy', () => {
    expect(migration).toContain('alter table public.performance_videos add column if not exists video_url text');
    expect(migration).toContain('alter table public.restaurant_videos add column if not exists video_url text');
    expect(migration).toContain('youtube_url resta disponibile');
  });
});
