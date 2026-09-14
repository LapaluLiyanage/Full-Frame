import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../src/content/content.js', import.meta.url), 'utf8');

// Pull the pure functions out of the IIFE and evaluate them standalone.
function grab(name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error('missing ' + name);
  let depth = 0, i = src.indexOf('{', start);
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(start, j + 1); }
  }
  throw new Error('unbalanced ' + name);
}

const code = [ 'decodeEntities', 'enclosingObject', 'unescapeJsonUrl', 'pickBestImage', 'parsePhotoHref' ]
  .map(grab).join('\n\n');

globalThis.location = { origin: 'https://www.facebook.com', href: 'https://www.facebook.com/media/set/?set=a.999' };
const albumIdFromUrl = () => 'a.999';
const fn = new Function('albumIdFromUrl', code + '\nreturn {decodeEntities,unescapeJsonUrl,pickBestImage,parsePhotoHref};');
const M = fn(albumIdFromUrl);

let pass = 0, fail = 0;
const t = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`, ok ? '' : `\n   got  ${JSON.stringify(got)}\n   want ${JSON.stringify(want)}`);
};

// --- parsePhotoHref -------------------------------------------------
t('photo/?fbid + set',
  M.parsePhotoHref('/photo/?fbid=1234567890&set=a.999'),
  { fbid: '1234567890', set: 'a.999' });

t('photo.php legacy',
  M.parsePhotoHref('https://www.facebook.com/photo.php?fbid=9876543210'),
  { fbid: '9876543210', set: 'a.999' });

t('/user/photos/a.111/222 path form',
  M.parsePhotoHref('/someuser/photos/a.111222333/444555666/'),
  { fbid: '444555666', set: 'a.111222333' });

t('rejects non-photo link', M.parsePhotoHref('/groups/12345/'), null);
t('rejects off-site link', M.parsePhotoHref('https://evil.example/photo/?fbid=123456'), null);
t('rejects short fbid', M.parsePhotoHref('/photo/?fbid=12'), null);

// --- pickBestImage --------------------------------------------------
const html = `
<meta property="og:image" content="https://scontent.xx.fbcdn.net/v/t1/og_720x720.jpg?stp=dst-jpg_s720x720&amp;oh=aa" />
<script>{"photo_image":{"uri":"https:\\/\\/scontent.xx.fbcdn.net\\/v\\/t1\\/small_n.jpg?stp=dst-jpg_s206x206","width":206,"height":206},
"image":{"width":2048,"height":1536,"uri":"https:\\/\\/scontent.xx.fbcdn.net\\/v\\/t1\\/big_o.jpg?_nc_cat=1\\u0026oh=zz"},
"icon":{"uri":"https:\\/\\/static.xx.fbcdn.net\\/rsrc.php\\/ui.png","width":16,"height":16}}</script>`;

const best = M.pickBestImage(html);
t('picks the 2048px original', best.url, 'https://scontent.xx.fbcdn.net/v/t1/big_o.jpg?_nc_cat=1&oh=zz');
t('reports its dimensions', [best.w, best.h], [2048, 1536]);

t('ignores UI sprites on static.fbcdn',
  M.pickBestImage('{"uri":"https:\\/\\/static.xx.fbcdn.net\\/rsrc.php\\/x.png"}'),
  null);

t('falls back to og:image',
  M.pickBestImage('<meta property="og:image" content="https://scontent.xx.fbcdn.net/a.jpg?x=1&amp;y=2">').url,
  'https://scontent.xx.fbcdn.net/a.jpg?x=1&y=2');

t('returns null on a login wall', M.pickBestImage('<html><body>login</body></html>'), null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
