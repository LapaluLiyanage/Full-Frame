import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../src/sidepanel/sidepanel.js', import.meta.url), 'utf8');
function grab(name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error('missing ' + name);
  let depth = 0;
  for (let j = src.indexOf('{', start); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(start, j + 1); }
  }
}
function grabConst(name) {
  const m = src.match(new RegExp(`const ${name} = (.+?);\\n`));
  if (!m) throw new Error('missing ' + name);
  return m[1];
}
const code =
  `const FILENAME_TEMPLATE = ${grabConst('FILENAME_TEMPLATE')};\n` +
  ['sanitizeSegment','sanitizePath','extFromUrl','buildFilename','quickCandidates'].map(grab).join('\n');
const mk = new Function('state','DEFAULTS', code + '\nreturn {sanitizeSegment,sanitizePath,extFromUrl,buildFilename,quickCandidates};');
const state = { settings: {}, album: { title: 'Trip: Ella / Nuwara <2024>' } };
const M = mk(state, {});

let pass=0, fail=0;
const t=(l,g,w)=>{const ok=JSON.stringify(g)===JSON.stringify(w);ok?pass++:fail++;console.log(`${ok?'PASS':'FAIL'}  ${l}`,ok?'':`\n   got  ${JSON.stringify(g)}\n   want ${JSON.stringify(w)}`);};

t('strips path-illegal chars from album name',
  M.buildFilename({fbid:'123456789'}, 0, 120, 'https://scontent.xx.fbcdn.net/v/big_o.jpg?x=1'),
  'Facebook Albums/Trip- Ella - Nuwara -2024-/001-123456789.jpg');

t('pads index to the album width',
  M.buildFilename({fbid:'9'}, 1233, 1234, 'https://x.fbcdn.net/a.png'),
  'Facebook Albums/Trip- Ella - Nuwara -2024-/1234-9.png');

t('no directory traversal', M.sanitizePath('../../etc/passwd'), 'etc/passwd');
t('no absolute path', M.sanitizePath('/root/x.jpg'), 'root/x.jpg');
t('drops trailing dots (Windows)', M.sanitizeSegment('album name...'), 'album name');
t('unknown extension falls back to jpg', M.extFromUrl('https://x.fbcdn.net/nofileext?a=1'), 'jpg');
t('webp preserved', M.extFromUrl('https://x.fbcdn.net/p.webp?a=1'), 'webp');

t('quick mode drops stp but keeps the signed original as fallback',
  M.quickCandidates('https://scontent.xx.fbcdn.net/v/a.jpg?stp=dst-jpg_s206x206&oh=zz'),
  ['https://scontent.xx.fbcdn.net/v/a.jpg?oh=zz',
   'https://scontent.xx.fbcdn.net/v/a.jpg?stp=dst-jpg_s206x206&oh=zz']);

t('quick mode with no stp yields one candidate',
  M.quickCandidates('https://scontent.xx.fbcdn.net/v/a.jpg?oh=zz'),
  ['https://scontent.xx.fbcdn.net/v/a.jpg?oh=zz']);

t('null thumb is safe', M.quickCandidates(null), []);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
