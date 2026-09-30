import assert from 'node:assert/strict';
import test from 'node:test';
import { ffmpegArgumente, ffmpegPfad, reelMoeglich, reelReihenfolge } from '../lib/reel.mjs';

const m = (id, rolle, extra = {}) => ({ id, art: 'bild', rolle, pruefung: 'ok', datenschutz: 'ok', reihenfolge: id, ...extra });

test('Reel nur mit Entwicklung: vorher und nachher, mindestens drei gesichtete Bilder', () => {
  assert.equal(reelMoeglich([m(1, 'vorher'), m(2, 'arbeit'), m(3, 'nachher')]), true);
  assert.equal(reelMoeglich([m(1, 'vorher'), m(2, 'nachher')]), false);
  assert.equal(reelMoeglich([m(1, null), m(2, null), m(3, null)]), false);
  assert.equal(reelMoeglich([m(1, 'vorher'), m(2, 'arbeit'), m(3, 'nachher', { datenschutz: 'ungeprueft' })]), false);
});

test('Das Ergebnis steht am Ende', () => {
  assert.deepEqual(reelReihenfolge([m(1, 'nachher'), m(2, null), m(3, 'vorher'), m(4, 'arbeit')]).map(x => x.id), [3, 4, 2, 1]);
});

test('ffmpeg-Aufruf: jedes Bild als Eingang, Hochkant, stumme Tonspur, streamingfaehig', () => {
  const a = ffmpegArgumente(['/a.jpg', '/b.jpg', '/c.jpg'], '/aus.mp4');
  assert.equal(a.filter(x => x === '-i').length, 4, 'drei Bilder und die stumme Tonspur');
  assert.equal(a.includes('-loop'), false, 'zoompan braucht genau ein Eingangsbild je Foto');
  const filter = a[a.indexOf('-filter_complex') + 1];
  assert.match(filter, /concat=n=3:v=1:a=0,format=yuv420p\[v\]$/);
  assert.match(filter, /s=1080x1920/);
  assert.equal(a[a.indexOf('-map', a.indexOf('-map') + 1) + 1], '3:a');
  assert.equal(a.at(-1), '/aus.mp4'); assert.ok(a.includes('+faststart'));
  assert.throws(() => ffmpegArgumente(['/a.jpg'], '/aus.mp4'), /mindestens zwei/);
  assert.equal(ffmpegPfad(['/gibt/es/nicht']) === null || typeof ffmpegPfad(['/gibt/es/nicht']) === 'string', true);
});
