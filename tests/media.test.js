import test from 'node:test';
import assert from 'node:assert/strict';
import {linkedMedia, preparePhoto} from '../src/media.js';
import {validatePhotos} from '../worker/photos.js';
import {validateEvent} from '../worker/validation.js';
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1sAAAAASUVORK5CYII=';
test('events can have no URL, with existing time and HTTPS validation retained', () => {
  const event = {title:'降雨',description:'',occurred_at:'2026-09-13T06:07:00Z'};
  assert.equal(validateEvent(event).url,'');
  assert.equal(validateEvent({...event,url:'  '}).url,'');
  assert.throws(()=>validateEvent({...event,url:'javascript:alert(1)'}));
  assert.throws(()=>validateEvent({...event,occurred_at:'invalid'}));
});
test('direct image links use image rendering, including query strings', () => {
  assert.equal(linkedMedia('https://example.com/photo.JPG?version=1').kind,'image');
  assert.equal(linkedMedia('https://example.com/article').kind,'web');
  for(const url of ['', 'invalid','javascript:alert(1)','http://example.com/a.png','https://user:pass@example.com']) assert.equal(linkedMedia(url).kind,'none');
});
test('Drive share URLs become previews and retain resource keys', () => {
  assert.deepEqual(linkedMedia('https://drive.google.com/file/d/abc-123/view?usp=sharing&resourcekey=secret'),{kind:'drive',src:'https://drive.google.com/file/d/abc-123/preview?resourcekey=secret'});
  assert.equal(linkedMedia('https://drive.google.com/open?id=abc').src,'https://drive.google.com/file/d/abc/preview');
  assert.equal(linkedMedia('https://drive.google.com/file/u/0/d/abc/preview?pli=1').src,'https://drive.google.com/file/d/abc/preview');
  assert.equal(linkedMedia('https://drive.google.com/file/u/12/d/abc/view').src,'https://drive.google.com/file/d/abc/preview');
  assert.equal(linkedMedia('https://drive.google.com.evil.test/file/d/abc/view').kind,'web');
});
test('photos validate bytes, limit quantity and size, reject active file types', () => {
  assert.equal(validatePhotos([png])[0].mime,'image/png');
  assert.equal(validatePhotos(['existing-id'])[0].id,'existing-id');
  assert.equal(validatePhotos(undefined),undefined);
  assert.throws(()=>validatePhotos(Array(6).fill(png)));
  assert.throws(()=>validatePhotos({}));
  assert.throws(()=>validatePhotos(['data:image/svg+xml;base64,PHN2Zz4=']));
  assert.throws(()=>validatePhotos(['data:image/jpeg;base64,PHNjcmlwdD4=']));
  assert.throws(()=>validatePhotos(['data:image/png;base64,'+'a'.repeat(1400000)]));
});
test('client rejects unsupported and oversized files before decoding', async () => {
  await assert.rejects(preparePhoto({type:'image/svg+xml',size:1}));
  await assert.rejects(preparePhoto({type:'image/jpeg',size:10*1024*1024+1}));
});
