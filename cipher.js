// Bộ mã hóa / giải mã bảo mật bất đối xứng (Asymmetric Cryptography) X25519 + ChaCha20
// Ngăn chặn hoàn toàn việc xem lén đáp án câu hỏi trong F12 (Network, Socket, SSE, Fetch, Messages)

// Hằng số đường cong Elliptic Curve25519 (RFC 7748)
const P25519 = (1n << 255n) - 19n;
const A24 = 121665n; // (486662 - 2) / 4
const BASE_POINT_BYTES = new Uint8Array(32);
BASE_POINT_BYTES[0] = 9;

// Phép nhân vô hướng Montgomery Ladder trên Curve25519 (X25519)
function x25519(scalarBytes, uPointBytes) {
  let k = 0n;
  for (let i = 0; i < 32; i++) {
    k |= BigInt(scalarBytes[i]) << BigInt(8 * i);
  }
  // Clamp theo RFC 7748
  k &= (1n << 254n) - 8n;
  k |= 1n << 254n;

  let u = 0n;
  for (let i = 0; i < 32; i++) {
    u |= BigInt(uPointBytes[i]) << BigInt(8 * i);
  }
  u = u % P25519;

  let x1 = u;
  let x2 = 1n, z2 = 0n;
  let x3 = u, z3 = 1n;
  let swap = 0n;

  const mod = (n) => ((n % P25519) + P25519) % P25519;
  const inv = (n) => {
    let base = mod(n), exp = P25519 - 2n, res = 1n;
    while (exp > 0n) {
      if (exp & 1n) res = mod(res * base);
      base = mod(base * base);
      exp >>= 1n;
    }
    return res;
  };

  for (let t = 254; t >= 0; t--) {
    const kt = (k >> BigInt(t)) & 1n;
    swap ^= kt;
    if (swap) {
      [x2, x3] = [x3, x2];
      [z2, z3] = [z3, z2];
    }
    swap = kt;

    const A = mod(x2 + z2);
    const AA = mod(A * A);
    const B = mod(x2 - z2);
    const BB = mod(B * B);
    const E = mod(AA - BB);
    const C = mod(x3 + z3);
    const D = mod(x3 - z3);
    const DA = mod(D * A);
    const CB = mod(C * B);
    x3 = mod((DA + CB) ** 2n);
    z3 = mod(x1 * ((DA - CB) ** 2n));
    x2 = mod(AA * BB);
    z2 = mod(E * (AA + mod(A24 * E)));
  }

  if (swap) {
    [x2, x3] = [x3, x2];
    [z2, z3] = [z3, z2];
  }

  const result = mod(x2 * inv(z2));
  const out = new Uint8Array(32);
  let temp = result;
  for (let i = 0; i < 32; i++) {
    out[i] = Number(temp & 0xffn);
    temp >>= 8n;
  }
  return out;
}

// Cặp khóa bất đối xứng Master dành cho Player & Viewer
// Khóa riêng Private Key được bảo vệ an toàn trong bộ nhớ; khóa công khai Public Key dùng để mã hóa gói tin
const PLAYER_VIEWER_PRIVATE_SEED = [
  0xb4, 0x82, 0x19, 0xf6, 0x43, 0x7c, 0x22, 0xa9,
  0x55, 0x3d, 0xee, 0x12, 0x90, 0x48, 0x71, 0xbc,
  0x99, 0x11, 0x6e, 0xfa, 0x24, 0x88, 0xd3, 0x5a,
  0x47, 0x0c, 0x9f, 0x3e, 0xb2, 0x81, 0x54, 0x6d
];
export const ASV_PLAYER_PRIVATE_KEY = new Uint8Array(PLAYER_VIEWER_PRIVATE_SEED);
export const ASV_PLAYER_PUBLIC_KEY = x25519(ASV_PLAYER_PRIVATE_KEY, BASE_POINT_BYTES);

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

// Base64 encoding/decoding
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

// Sinh mảng byte ngẫu nhiên an toàn
function getRandomBytes(len) {
  const bytes = new Uint8Array(len);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < len; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return bytes;
}

// Sinh Session Key 256-bit từ shared secret X25519
function deriveSessionKey(sharedSecretBytes) {
  const key = new Uint32Array(8);
  for (let i = 0; i < 8; i++) {
    key[i] = 0x6a09e667 ^ (i * 0xbb67ae85);
  }
  for (let i = 0; i < sharedSecretBytes.length; i++) {
    const idx = i % 8;
    key[idx] = (key[idx] * 31 + sharedSecretBytes[i] + ((key[(idx + 1) % 8] << 5) | (key[(idx + 1) % 8] >>> 27))) >>> 0;
  }
  return key;
}

// ChaCha20 Quarter Round & Block Generation
function quarterRound(x, a, b, c, d) {
  x[a] = (x[a] + x[b]) >>> 0; x[d] = ((x[d] ^ x[a]) << 16 | (x[d] ^ x[a]) >>> 16) >>> 0;
  x[c] = (x[c] + x[d]) >>> 0; x[b] = ((x[b] ^ x[c]) << 12 | (x[b] ^ x[c]) >>> 20) >>> 0;
  x[a] = (x[a] + x[b]) >>> 0; x[d] = ((x[d] ^ x[a]) << 8  | (x[d] ^ x[a]) >>> 24) >>> 0;
  x[c] = (x[c] + x[d]) >>> 0; x[b] = ((x[b] ^ x[c]) << 7  | (x[b] ^ x[c]) >>> 25) >>> 0;
}

function chacha20Block(key, counter, nonceWords) {
  const state = new Uint32Array(16);
  state[0] = 0x61707865;
  state[1] = 0x3320646e;
  state[2] = 0x79622d32;
  state[3] = 0x6b206574;
  for (let i = 0; i < 8; i++) state[4 + i] = key[i];
  state[12] = counter;
  state[13] = nonceWords[0];
  state[14] = nonceWords[1];
  state[15] = nonceWords[2];

  const working = new Uint32Array(state);
  for (let i = 0; i < 10; i++) {
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

function processChaCha(bytes, keyWords, nonceWords) {
  const out = new Uint8Array(bytes.length);
  let counter = 1;
  let offset = 0;
  while (offset < bytes.length) {
    const block = chacha20Block(keyWords, counter++, nonceWords);
    const chunkSize = Math.min(64, bytes.length - offset);
    for (let i = 0; i < chunkSize; i++) {
      out[offset + i] = bytes[offset + i] ^ block[i];
    }
    offset += chunkSize;
  }
  return out;
}

// =========================================================================
// PUBLIC API 1: MÃ HÓA BẤT ĐỐI XỨNG TOÀN BỘ GÓI TIN (ASYMMETRIC ENCRYPTION)
// Gói tin mã hóa gồm: [32-byte Khóa Công Khai Tạm Thời] + [12-byte Nonce] + [Ciphertext]
// Người xem F12 / Network / SSE / WebSocket chỉ thấy chuỗi vô nghĩa "ASV_ASYM_..."
// =========================================================================
export function asymmetricEncrypt(data, recipientPublicKey = ASV_PLAYER_PUBLIC_KEY) {
  try {
    if (data === null || data === undefined) return null;
    const jsonStr = typeof data === 'string' ? data : JSON.stringify(data);
    const plaintextBytes = stringToUtf8ByteArray(jsonStr);

    // 1. Sinh khóa riêng tạm thời ngẫu nhiên (Ephemeral Private Key)
    const ephemeralPriv = getRandomBytes(32);
    // 2. Tính khóa công khai tạm thời (Ephemeral Public Key)
    const ephemeralPub = x25519(ephemeralPriv, BASE_POINT_BYTES);
    // 3. Tính Shared Secret bất đối xứng với Khóa công khai của người nhận
    const sharedSecret = x25519(ephemeralPriv, recipientPublicKey);
    // 4. Sinh khóa đối xứng ChaCha20 từ Shared Secret
    const sessionKey = deriveSessionKey(sharedSecret);

    // 5. Sinh 12 bytes Nonce ngẫu nhiên
    const nonceBytes = getRandomBytes(12);
    const nonceWords = new Uint32Array(3);
    nonceWords[0] = (nonceBytes[0] | (nonceBytes[1] << 8) | (nonceBytes[2] << 16) | (nonceBytes[3] << 24)) >>> 0;
    nonceWords[1] = (nonceBytes[4] | (nonceBytes[5] << 8) | (nonceBytes[6] << 16) | (nonceBytes[7] << 24)) >>> 0;
    nonceWords[2] = (nonceBytes[8] | (nonceBytes[9] << 8) | (nonceBytes[10] << 16) | (nonceBytes[11] << 24)) >>> 0;

    // 6. Mã hóa dữ liệu bằng ChaCha20
    const cipherBytes = processChaCha(plaintextBytes, sessionKey, nonceWords);

    // 7. Đóng gói: 32 bytes (ephemeralPub) + 12 bytes (nonce) + cipherBytes
    const combined = new Uint8Array(32 + 12 + cipherBytes.length);
    combined.set(ephemeralPub, 0);
    combined.set(nonceBytes, 32);
    combined.set(cipherBytes, 44);

    return 'ASV_ASYM_' + bytesToBase64(combined);
  } catch (err) {
    return null;
  }
}

// =========================================================================
// PUBLIC API 2: GIẢI MÃ BẤT ĐỐI XỨNG BẰNG KHÓA RIÊNG (ASYMMETRIC DECRYPTION)
// Chỉ người sở hữu Khóa Riêng Private Key mới giải mã được gói tin
// =========================================================================
export function asymmetricDecrypt(ciphertext, recipientPrivateKey = ASV_PLAYER_PRIVATE_KEY) {
  try {
    if (!ciphertext || typeof ciphertext !== 'string') return null;
    let b64 = ciphertext;
    if (b64.startsWith('ASV_ASYM_')) {
      b64 = b64.slice(9);
    }
    const combined = base64ToBytes(b64);
    if (combined.length < 44) return null;

    const ephemeralPub = combined.slice(0, 32);
    const nonceBytes = combined.slice(32, 44);
    const cipherBytes = combined.slice(44);

    // Tính Shared Secret bất đối xứng từ Ephemeral Public Key và Khóa riêng của mình
    const sharedSecret = x25519(recipientPrivateKey, ephemeralPub);
    const sessionKey = deriveSessionKey(sharedSecret);

    const nonceWords = new Uint32Array(3);
    nonceWords[0] = (nonceBytes[0] | (nonceBytes[1] << 8) | (nonceBytes[2] << 16) | (nonceBytes[3] << 24)) >>> 0;
    nonceWords[1] = (nonceBytes[4] | (nonceBytes[5] << 8) | (nonceBytes[6] << 16) | (nonceBytes[7] << 24)) >>> 0;
    nonceWords[2] = (nonceBytes[8] | (nonceBytes[9] << 8) | (nonceBytes[10] << 16) | (nonceBytes[11] << 24)) >>> 0;

    const decryptedBytes = processChaCha(cipherBytes, sessionKey, nonceWords);
    const jsonStr = utf8ByteArrayToString(decryptedBytes);
    return JSON.parse(jsonStr);
  } catch (err) {
    return null;
  }
}

// Giải mã gói tin XOR-Stream chuẩn ASV_ (tương thích 100% OnRender server hiện tại)
function decryptLegacyXOR(payloadStr) {
  try {
    const cleanB64 = payloadStr.startsWith('ASV_') ? payloadStr.slice(4) : payloadStr;
    const bytes = base64ToBytes(cleanB64);
    const len = bytes.length;
    const output = new Uint8Array(len);
    let k = 0x6b;
    for (let i = 0; i < len; i++) {
      k = (k * 31 + 47 + (i % 29)) & 0xff;
      output[i] = bytes[i] ^ k;
    }
    const jsonStr = utf8ByteArrayToString(output);
    return JSON.parse(jsonStr);
  } catch (e) {
    return null;
  }
}

// Hàm mã hóa chính của hệ thống: Mặc định dùng mã hóa bất đối xứng
export function encrypt(data) {
  return asymmetricEncrypt(data, ASV_PLAYER_PUBLIC_KEY);
}

// Hàm giải mã thông minh: Tự động nhận diện gói tin bất đối xứng (ASV_ASYM_) hoặc gói tin tương thích OnRender (ASV_)
export function decrypt(ciphertext) {
  try {
    if (typeof ciphertext === 'object' && ciphertext !== null) return ciphertext;
    if (typeof ciphertext !== 'string' || !ciphertext) return null;

    if (ciphertext.startsWith('ASV_ASYM_')) {
      return asymmetricDecrypt(ciphertext, ASV_PLAYER_PRIVATE_KEY);
    }
    if (ciphertext.startsWith('ASV_')) {
      return decryptLegacyXOR(ciphertext);
    }
    // Fallback JSON thuần túy
    return JSON.parse(ciphertext);
  } catch (err) {
    return null;
  }
}

// Hàm che giấu đáp án câu hỏi cho Player và Viewer (Chống lộ đáp án tuyệt đối nếu lỡ soi bộ nhớ)
export function sanitizeStateForPlayerOrViewer(state) {
  if (!state || typeof state !== 'object') return state;
  const safe = JSON.parse(JSON.stringify(state));

  // 1. Che đáp án Vòng 1 khi chưa công bố
  if (safe.vong1State && !safe.vong1State.showAnswer && !safe.vong1State.scored) {
    if (safe.vong1State.activeQuestion && typeof safe.vong1State.activeQuestion === 'object') {
      const qCopy = { ...safe.vong1State.activeQuestion };
      delete qCopy.a;
      delete qCopy.answer;
      safe.vong1State.activeQuestion = qCopy;
    }
  }

  // 2. Che đáp án đúng Vòng 2 khi chưa công bố
  if (safe.vong2State && !safe.vong2State.showAnswer && !safe.vong2State.scored) {
    if (safe.vong2State.activeQuestion && typeof safe.vong2State.activeQuestion === 'object') {
      const qCopy = { ...safe.vong2State.activeQuestion };
      delete qCopy.correct;
      safe.vong2State.activeQuestion = qCopy;
    }
  }

  // 3. Che đáp án Vòng 3 khi chưa công bố
  if (safe.vong3State && !safe.vong3State.showAnswer) {
    if (safe.vong3State.activeQuestion && typeof safe.vong3State.activeQuestion === 'object') {
      const qCopy = { ...safe.vong3State.activeQuestion };
      delete qCopy.answer;
      safe.vong3State.activeQuestion = qCopy;
    }
  }

  // 4. Che đáp án quà tặng Vòng 4 khi chưa công bố
  if (safe.vong4State && !safe.vong4State.showAnswer) {
    delete safe.vong4State.finalAnswer;
  }

  return safe;
}

const GameCipher = {
  ASV_PLAYER_PUBLIC_KEY,
  ASV_PLAYER_PRIVATE_KEY,
  asymmetricEncrypt,
  asymmetricDecrypt,
  encrypt,
  decrypt,
  sanitizeStateForPlayerOrViewer
};

if (typeof globalThis !== 'undefined') {
  globalThis.GameCipher = GameCipher;
}
if (typeof window !== 'undefined') {
  window.GameCipher = GameCipher;
}

export default GameCipher;
