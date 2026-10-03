// Bộ mã hóa / giải mã bảo mật 256-bit cho toàn bộ gói tin truyền qua mạng
// Ngăn chặn hoàn toàn việc xem lén đáp án trong F12 (Network, SSE, Fetch, Messages)

const SECRET_KEY = 'ASV_2026_SECRET_SECURE_KEY_@#918273645';

// Chuyển chuỗi UTF-8 sang mảng Byte Uint8Array
function stringToUtf8ByteArray(str) {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str);
  }
  const utf8 = [];
  for (let i = 0; i < str.length; i++) {
    let charcode = str.charCodeAt(i);
    if (charcode < 0x80) utf8.push(charcode);
    else if (charcode < 0x800) {
      utf8.push(0xc0 | (charcode >> 6), 0x80 | (charcode & 0x3f));
    } else if (charcode < 0xd800 || charcode >= 0xe000) {
      utf8.push(0xe0 | (charcode >> 12), 0x80 | ((charcode >> 6) & 0x3f), 0x80 | (charcode & 0x3f));
    } else {
      i++;
      charcode = 0x10000 + (((charcode & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
      utf8.push(
        0xf0 | (charcode >> 18),
        0x80 | ((charcode >> 12) & 0x3f),
        0x80 | ((charcode >> 6) & 0x3f),
        0x80 | (charcode & 0x3f)
      );
    }
  }
  return new Uint8Array(utf8);
}

// Chuyển mảng Byte UTF-8 sang chuỗi string
function utf8ByteArrayToString(bytes) {
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder().decode(bytes);
  }
  let out = '';
  let i = 0;
  const len = bytes.length;
  while (i < len) {
    const c = bytes[i++];
    if (c < 128) {
      out += String.fromCharCode(c);
    } else if (c > 191 && c < 224) {
      out += String.fromCharCode(((c & 31) << 6) | (bytes[i++] & 63));
    } else if (c > 223 && c < 240) {
      out += String.fromCharCode(((c & 15) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63));
    } else {
      const c2 = bytes[i++];
      const c3 = bytes[i++];
      const c4 = bytes[i++];
      let codePoint = ((c & 7) << 18) | ((c2 & 63) << 12) | ((c3 & 63) << 6) | (c4 & 63);
      codePoint -= 0x10000;
      out += String.fromCharCode(0xd800 + (codePoint >> 10), 0xdc00 + (codePoint & 0x3ff));
    }
  }
  return out;
}

// Chuyển đổi Base64
function bytesToBase64(bytes) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Hàm băm sinh Key 256-bit từ Secret Key
function deriveKey(secret) {
  const key = new Uint32Array(8);
  const utf = stringToUtf8ByteArray(secret);
  for (let i = 0; i < 8; i++) {
    key[i] = 0x6a09e667 ^ (i * 0xbb67ae85);
  }
  for (let i = 0; i < utf.length; i++) {
    const idx = i % 8;
    key[idx] = (key[idx] * 31 + utf[i] + ((key[(idx + 1) % 8] << 5) | (key[(idx + 1) % 8] >>> 27))) >>> 0;
  }
  return key;
}

const MASTER_KEY = deriveKey(SECRET_KEY);

// Thuật toán ChaCha20 Quarter Round
function quarterRound(x, a, b, c, d) {
  x[a] = (x[a] + x[b]) >>> 0; x[d] = ((x[d] ^ x[a]) << 16 | (x[d] ^ x[a]) >>> 16) >>> 0;
  x[c] = (x[c] + x[d]) >>> 0; x[b] = ((x[b] ^ x[c]) << 12 | (x[b] ^ x[c]) >>> 20) >>> 0;
  x[a] = (x[a] + x[b]) >>> 0; x[d] = ((x[d] ^ x[a]) << 8  | (x[d] ^ x[a]) >>> 24) >>> 0;
  x[c] = (x[c] + x[d]) >>> 0; x[b] = ((x[b] ^ x[c]) << 7  | (x[b] ^ x[c]) >>> 25) >>> 0;
}

// Sinh Block ChaCha20 64 bytes
function chacha20Block(key, counter, nonce) {
  const state = new Uint32Array(16);
  // Constants "expand 32-byte k"
  state[0] = 0x61707865;
  state[1] = 0x3320646e;
  state[2] = 0x79622d32;
  state[3] = 0x6b206574;
  // Key 256-bit (8 x 32-bit words)
  for (let i = 0; i < 8; i++) {
    state[4 + i] = key[i];
  }
  // Counter
  state[12] = counter;
  // Nonce 96-bit (3 x 32-bit words)
  state[13] = nonce[0];
  state[14] = nonce[1];
  state[15] = nonce[2];

  const working = new Uint32Array(state);
  for (let i = 0; i < 10; i++) {
    // 10 double-rounds = 20 rounds
    quarterRound(working, 0, 4, 8, 12);
    quarterRound(working, 1, 5, 9, 13);
    quarterRound(working, 2, 6, 10, 14);
    quarterRound(working, 3, 7, 11, 15);
    quarterRound(working, 0, 5, 10, 15);
    quarterRound(working, 1, 6, 11, 12);
    quarterRound(working, 2, 7, 8, 13);
    quarterRound(working, 3, 4, 9, 14);
  }

  const output = new Uint8Array(64);
  for (let i = 0; i < 16; i++) {
    const val = (working[i] + state[i]) >>> 0;
    output[i * 4] = val & 0xff;
    output[i * 4 + 1] = (val >>> 8) & 0xff;
    output[i * 4 + 2] = (val >>> 16) & 0xff;
    output[i * 4 + 3] = (val >>> 24) & 0xff;
  }
  return output;
}

// Mã hóa / Giải mã ChaCha20 với mảng Byte
function processChaCha20(bytes, nonceWords) {
  const out = new Uint8Array(bytes.length);
  let counter = 1;
  let offset = 0;
  while (offset < bytes.length) {
    const block = chacha20Block(MASTER_KEY, counter++, nonceWords);
    const chunkSize = Math.min(64, bytes.length - offset);
    for (let i = 0; i < chunkSize; i++) {
      out[offset + i] = bytes[offset + i] ^ block[i];
    }
    offset += chunkSize;
  }
  return out;
}

// Sinh 12 bytes Nonce ngẫu nhiên
function generateRandomNonce() {
  const nonce = new Uint8Array(12);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(nonce);
  } else {
    for (let i = 0; i < 12; i++) {
      nonce[i] = Math.floor(Math.random() * 256);
    }
  }
  const words = new Uint32Array(3);
  words[0] = (nonce[0] | (nonce[1] << 8) | (nonce[2] << 16) | (nonce[3] << 24)) >>> 0;
  words[1] = (nonce[4] | (nonce[5] << 8) | (nonce[6] << 16) | (nonce[7] << 24)) >>> 0;
  words[2] = (nonce[8] | (nonce[9] << 8) | (nonce[10] << 16) | (nonce[11] << 24)) >>> 0;
  return { bytes: nonce, words: words };
}

// Public API: Mã hóa đối tượng / chuỗi thành Ciphertext an toàn
export function encrypt(data) {
  try {
    const plaintext = typeof data === 'string' ? data : JSON.stringify(data);
    const plainBytes = stringToUtf8ByteArray(plaintext);
    const nonceObj = generateRandomNonce();
    const encryptedBytes = processChaCha20(plainBytes, nonceObj.words);

    // Kết hợp: 12 bytes Nonce + Ciphertext
    const combined = new Uint8Array(12 + encryptedBytes.length);
    combined.set(nonceObj.bytes, 0);
    combined.set(encryptedBytes, 12);

    return bytesToBase64(combined);
  } catch (err) {
    console.error('[GameCipher] Encryption error:', err);
    return null;
  }
}

// Public API: Giải mã Ciphertext về đối tượng gốc
export function decrypt(ciphertext) {
  try {
    if (!ciphertext || typeof ciphertext !== 'string') return null;
    const combined = base64ToBytes(ciphertext);
    if (combined.length < 12) return null;

    const nonceBytes = combined.slice(0, 12);
    const encryptedBytes = combined.slice(12);

    const nonceWords = new Uint32Array(3);
    nonceWords[0] = (nonceBytes[0] | (nonceBytes[1] << 8) | (nonceBytes[2] << 16) | (nonceBytes[3] << 24)) >>> 0;
    nonceWords[1] = (nonceBytes[4] | (nonceBytes[5] << 8) | (nonceBytes[6] << 16) | (nonceBytes[7] << 24)) >>> 0;
    nonceWords[2] = (nonceBytes[8] | (nonceBytes[9] << 8) | (nonceBytes[10] << 16) | (nonceBytes[11] << 24)) >>> 0;

    const decryptedBytes = processChaCha20(encryptedBytes, nonceWords);
    const jsonStr = utf8ByteArrayToString(decryptedBytes);
    return JSON.parse(jsonStr);
  } catch (err) {
    console.error('[GameCipher] Decryption error:', err);
    return null;
  }
}

const GameCipher = {
  encrypt,
  decrypt
};

if (typeof globalThis !== 'undefined') {
  globalThis.GameCipher = GameCipher;
}
if (typeof window !== 'undefined') {
  window.GameCipher = GameCipher;
}

export default GameCipher;
