// Placeholder product illustrations (inline SVG) used until real photos are uploaded.
// Browser-rendered SVGs start at a different id range so gradient ids never clash with server-rendered ones.
let gid = typeof window === 'undefined' ? 0 : 100000;

const defs = (id: number, body: string) =>
  `<linearGradient id="ch${id}" x1="0" x2="1"><stop offset="0" stop-color="#6E747C"/><stop offset=".35" stop-color="#F4F5F7"/><stop offset=".55" stop-color="#B9BEC5"/><stop offset="1" stop-color="#5A6068"/></linearGradient>` +
  `<linearGradient id="bd${id}" x1="0" x2="1"><stop offset="0" stop-color="#0c0d10"/><stop offset=".4" stop-color="${body}"/><stop offset="1" stop-color="#0c0d10"/></linearGradient>`;

export function shock(spring = '#1E6FE8', body = '#2A2E35', res = false): string {
  const id = ++gid;
  const top = 88, bot = 318, n = 9, p = (bot - top) / n;
  let coils = '';
  for (let k = 0; k < n; k++) {
    const y = top + k * p;
    coils += `<path d="M26 ${y + p / 2} L94 ${y + p}" stroke="${spring}" stroke-opacity=".45" stroke-width="9" stroke-linecap="round"/>`;
    coils += `<path d="M26 ${y + p / 2} L94 ${y}" stroke="${spring}" stroke-width="9" stroke-linecap="round"/>`;
  }
  return `<svg viewBox="0 0 ${res ? 140 : 120} 400" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>${defs(id, body)}</defs>
<circle cx="60" cy="30" r="20" fill="url(#ch${id})"/><circle cx="60" cy="30" r="9" fill="#0A0B0D"/>
<rect x="44" y="46" width="32" height="28" rx="5" fill="url(#ch${id})"/><rect x="53" y="74" width="14" height="70" fill="url(#ch${id})"/>
<rect x="38" y="140" width="44" height="196" rx="9" fill="url(#bd${id})"/><rect x="38" y="300" width="44" height="6" fill="#4A8DF5" opacity=".7"/>
${res ? `<path d="M82 170 C 100 170 108 170 108 186" stroke="url(#ch${id})" stroke-width="5" fill="none"/><rect x="96" y="184" width="26" height="110" rx="11" fill="url(#bd${id})"/><rect x="96" y="196" width="26" height="5" fill="url(#ch${id})"/>` : ''}
<rect x="20" y="76" width="80" height="12" rx="4" fill="url(#ch${id})"/>${coils}<rect x="20" y="318" width="80" height="12" rx="4" fill="url(#ch${id})"/>
<rect x="46" y="336" width="28" height="22" rx="4" fill="url(#ch${id})"/><circle cx="60" cy="372" r="20" fill="url(#ch${id})"/><circle cx="60" cy="372" r="9" fill="#0A0B0D"/></svg>`;
}

export function pair(spring?: string, body?: string): string {
  const a = shock(spring, body).replace('<svg ', '<svg x="0" width="120" height="400" ');
  const b = shock(spring, body).replace('<svg ', '<svg x="110" y="20" width="120" height="400" ');
  return `<svg viewBox="0 0 230 420" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${b}${a}</svg>`;
}

export function fork(body = '#2A2E35'): string {
  const id = ++gid;
  const leg = (x: number) =>
    `<rect x="${x}" y="30" width="24" height="230" rx="4" fill="url(#ch${id})"/><rect x="${x - 6}" y="210" width="36" height="160" rx="12" fill="url(#bd${id})"/><rect x="${x - 6}" y="226" width="36" height="5" fill="#4A8DF5" opacity=".7"/><circle cx="${x + 12}" cy="372" r="15" fill="url(#ch${id})"/><circle cx="${x + 12}" cy="372" r="6" fill="#0A0B0D"/>`;
  return `<svg viewBox="0 0 200 400" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>${defs(id, body)}</defs>${leg(40)}${leg(136)}
<rect x="22" y="52" width="156" height="24" rx="8" fill="url(#bd${id})"/><rect x="22" y="110" width="156" height="22" rx="8" fill="url(#bd${id})"/><rect x="90" y="48" width="20" height="90" rx="4" fill="url(#ch${id})"/></svg>`;
}

export function bottle(ml = '200ML'): string {
  const id = ++gid;
  return `<svg viewBox="0 0 160 400" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>${defs(id, '#20242b')}
<linearGradient id="bl${id}" x1="0" x2="1"><stop offset="0" stop-color="#05070a"/><stop offset=".5" stop-color="#151a22"/><stop offset="1" stop-color="#05070a"/></linearGradient></defs>
<rect x="58" y="14" width="44" height="40" rx="6" fill="url(#ch${id})"/>
<path d="M62 54h36v24c26 10 42 30 42 58v232a18 18 0 0 1-18 18H38a18 18 0 0 1-18-18V136c0-28 16-48 42-58Z" fill="url(#bl${id})" stroke="#2A2E35"/>
<path d="M20 150h120v160H20z" fill="#0A0B0D"/><path d="M20 280 L140 190 L140 200 L20 290Z" fill="#1E6FE8" opacity=".55"/>
<text x="80" y="182" text-anchor="middle" font-family="Saira Variable,sans-serif" font-weight="800" font-size="21" fill="url(#ch${id})" letter-spacing="1">VELOCE</text>
<text x="80" y="214" text-anchor="middle" font-family="Saira Variable,sans-serif" font-weight="700" font-size="13" fill="#fff">HYDROPHOBIC</text>
<text x="80" y="230" text-anchor="middle" font-family="Inter Variable,sans-serif" font-size="7.5" fill="#C9CDD2">CAR &amp; BIKE WASH SHAMPOO</text>
<rect x="52" y="292" width="56" height="16" rx="8" fill="#1E6FE8"/><text x="80" y="304" text-anchor="middle" font-family="Saira Variable,sans-serif" font-size="10" font-weight="700" fill="#fff">${ml}</text></svg>`;
}

const SPRINGS = ['#1E6FE8', '#C9CDD2', '#D64545', '#4A8DF5', '#3A3F47'];
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Pick a placeholder illustration from the product's segment/position/name. */
export function productArt(p: { slug: string; name: string; seg: string; pos: string | null }): string {
  if (p.seg === 'care') return bottle(/500/.test(p.name) ? '500ML' : '200ML');
  if (p.pos === 'Front') return fork();
  const spring = SPRINGS[hash(p.slug) % SPRINGS.length];
  if (p.pos === 'Rear pair' || p.pos === 'Front & rear') return pair(spring);
  return shock(spring, '#2A2E35', /mono|apex/i.test(p.name));
}
