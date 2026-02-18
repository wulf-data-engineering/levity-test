import fs from 'node:fs/promises';
import path from 'node:path';

const file = path.resolve('build/fallback.html');
let html = await fs.readFile(file, 'utf8');

// 1) Head: add flag + minimal CSS
const headInject = `
  <style id="cf-splash-style">
    #cf-splash{min-height:100vh;display:grid;place-items:center}
  </style>
`;
html = html.replace('</head>', `${headInject}</head>`);

// 2) Body: add a visible splash immediately after <body ...>
html = html.replace(/<body([^>]*)>/i, `<body$1><div id="cf-splash">SPLASH</div>`);

await fs.writeFile(file, html, 'utf8');
console.log('Injected splash into fallback.html');
