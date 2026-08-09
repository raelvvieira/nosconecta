// Gera os ícones do PWA sem nenhuma dependência.
//
// O projeto não tem nenhum arquivo de imagem: a identidade é gradiente CSS +
// lucide-react + a inicial do usuário num <div>. PWA exige PNG de verdade, e
// não dá pra instalar sharp/canvas (o registry npm está fora de alcance neste
// ambiente, e os dois são pacotes nativos que não rodariam no Worker mesmo).
//
// Então o PNG é escrito à mão: zlib vem do próprio Node, o resto é IHDR/IDAT/
// IEND com CRC32. O desenho é puramente matemático — quadrado com o gradiente
// da marca e um "N" em polígonos —, com supersampling 4x4 pra não sair
// serrilhado.
//
// Rodar:  node scripts/generate-icons.mjs
//
// Trocar por uma logo desenhada depois é só substituir os PNG em public/.

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

// --gradient-primary de src/styles.css (o token canônico, não a variante
// hardcoded nas telas mobile).
const STOPS = [
  { at: 0.0, rgb: [0xf5, 0x5f, 0x95] },
  { at: 0.5, rgb: [0xff, 0x7a, 0x59] },
  { at: 1.0, rgb: [0xff, 0xb0, 0x86] },
];

// ---------- PNG ----------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // filtro adaptativo
  ihdr[12] = 0; // sem entrelaçamento

  // Cada scanline leva um byte de filtro na frente; 0 = None, que comprime
  // bem o suficiente para um gradiente e mantém o encoder trivial.
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- desenho ----------

function gradientAt(t) {
  const clamped = Math.min(1, Math.max(0, t));
  for (let i = 1; i < STOPS.length; i++) {
    const a = STOPS[i - 1];
    const b = STOPS[i];
    if (clamped <= b.at) {
      const k = (clamped - a.at) / (b.at - a.at);
      return [
        Math.round(a.rgb[0] + (b.rgb[0] - a.rgb[0]) * k),
        Math.round(a.rgb[1] + (b.rgb[1] - a.rgb[1]) * k),
        Math.round(a.rgb[2] + (b.rgb[2] - a.rgb[2]) * k),
      ];
    }
  }
  return STOPS[STOPS.length - 1].rgb;
}

/** Retângulo de cantos arredondados: dentro quando a distância assinada <= 0. */
function insideRoundedRect(x, y, radius) {
  const dx = Math.abs(x - 0.5) - (0.5 - radius);
  const dy = Math.abs(y - 0.5) - (0.5 - radius);
  if (dx <= 0 || dy <= 0) return Math.max(dx, dy) <= radius;
  return Math.hypot(dx, dy) <= radius;
}

function insidePolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * O "N": duas hastes verticais e a diagonal ligando o topo da esquerda ao pé
 * da direita. `scale` encolhe a letra em torno do centro (o maskable precisa
 * do desenho dentro dos 80% centrais, que é a zona que o Android não recorta).
 */
function insideLetter(x, y, scale) {
  const cx = 0.5;
  const cy = 0.5;
  const sx = (x - cx) / scale + cx;
  const sy = (y - cy) / scale + cy;

  const left = 0.315;
  const right = 0.685;
  const top = 0.315;
  const bottom = 0.685;
  const w = 0.082;

  if (sx >= left && sx <= left + w && sy >= top && sy <= bottom) return true;
  if (sx >= right - w && sx <= right && sy >= top && sy <= bottom) return true;
  return insidePolygon(sx, sy, [
    [left, top],
    [left + w, top],
    [right, bottom],
    [right - w, bottom],
  ]);
}

/**
 * @param {number} size
 * @param {{ radius: number, letterScale: number }} opts
 *   radius 0 = quadrado cheio (maskable e apple-touch, que o sistema recorta
 *   sozinho); > 0 arredonda os cantos com transparência fora.
 */
function drawIcon(size, { radius, letterScale }) {
  const rgba = Buffer.alloc(size * size * 4);
  const SS = 4; // supersampling por eixo

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) / size;
          const y = (py + (sy + 0.5) / SS) / size;

          if (radius > 0 && !insideRoundedRect(x, y, radius)) continue;

          if (insideLetter(x, y, letterScale)) {
            r += 255;
            g += 255;
            b += 255;
          } else {
            // 135deg no CSS vai do canto superior esquerdo ao inferior
            // direito; projetar em (x+y)/2 dá exatamente esse eixo.
            const [gr, gg, gb] = gradientAt((x + y) / 2);
            r += gr;
            g += gg;
            b += gb;
          }
          a += 255;
        }
      }

      const samples = SS * SS;
      const i = (py * size + px) * 4;
      if (a === 0) continue;
      // Cor média só sobre as amostras cobertas, senão a borda escurece.
      const covered = a / 255;
      rgba[i] = Math.round(r / covered);
      rgba[i + 1] = Math.round(g / covered);
      rgba[i + 2] = Math.round(b / covered);
      rgba[i + 3] = Math.round(a / samples);
    }
  }

  return encodePng(size, size, rgba);
}

// ---------- saída ----------

mkdirSync(OUT, { recursive: true });

const files = [
  ["icon-192.png", 192, { radius: 0.22, letterScale: 1 }],
  ["icon-512.png", 512, { radius: 0.22, letterScale: 1 }],
  // Maskable: sem cantos (o sistema recorta) e letra um pouco menor, dentro
  // da zona segura de 80% que o Android garante não cortar. Um quadrado
  // inscrito nesse círculo tem ~56% da largura, então o "N" a ~31% sobra
  // margem de folga sem virar um pontinho no meio do ícone.
  ["icon-maskable-512.png", 512, { radius: 0, letterScale: 0.85 }],
  // iOS aplica a própria máscara e não aceita transparência.
  ["apple-touch-icon.png", 180, { radius: 0, letterScale: 0.92 }],
  ["favicon.png", 64, { radius: 0.22, letterScale: 1.12 }],
];

for (const [name, size, opts] of files) {
  const png = drawIcon(size, opts);
  writeFileSync(join(OUT, name), png);
  console.log(`${name.padEnd(24)} ${size}x${size}  ${(png.length / 1024).toFixed(1)} KB`);
}
