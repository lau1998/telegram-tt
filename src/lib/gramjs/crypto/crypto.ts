import AES from '@cryptography/aes';

const SHA_1_BLOCK_SIZE = 64;
const SHA_1_DIGEST_SIZE = 20;
const SHA_1_PADDING_SIZE = 9;
const SHA_1_INITIAL_STATE = [
  0x67452301,
  0xefcdab89,
  0x98badcfe,
  0x10325476,
  0xc3d2e1f0,
];
const SHA_256_DIGEST_SIZE = 32;
const SHA_256_INITIAL_STATE = [
  0x6a09e667,
  0xbb67ae85,
  0x3c6ef372,
  0xa54ff53a,
  0x510e527f,
  0x9b05688c,
  0x1f83d9ab,
  0x5be0cd19,
];
const SHA_256_ROUND_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];
const SHA_512_BLOCK_SIZE = 128;
const SHA_512_MASK = (1n << 64n) - 1n;
const SHA_512_INITIAL_STATE = [
  0x6a09e667f3bcc908n, 0xbb67ae8584caa73bn, 0x3c6ef372fe94f82bn, 0xa54ff53a5f1d36f1n,
  0x510e527fade682d1n, 0x9b05688c2b3e6c1fn, 0x1f83d9abfb41bd6bn, 0x5be0cd19137e2179n,
];
const SHA_512_ROUND_CONSTANTS = [
  0x428a2f98d728ae22n, 0x7137449123ef65cdn, 0xb5c0fbcfec4d3b2fn, 0xe9b5dba58189dbbcn,
  0x3956c25bf348b538n, 0x59f111f1b605d019n, 0x923f82a4af194f9bn, 0xab1c5ed5da6d8118n,
  0xd807aa98a3030242n, 0x12835b0145706fben, 0x243185be4ee4b28cn, 0x550c7dc3d5ffb4e2n,
  0x72be5d74f27b896fn, 0x80deb1fe3b1696b1n, 0x9bdc06a725c71235n, 0xc19bf174cf692694n,
  0xe49b69c19ef14ad2n, 0xefbe4786384f25e3n, 0x0fc19dc68b8cd5b5n, 0x240ca1cc77ac9c65n,
  0x2de92c6f592b0275n, 0x4a7484aa6ea6e483n, 0x5cb0a9dcbd41fbd4n, 0x76f988da831153b5n,
  0x983e5152ee66dfabn, 0xa831c66d2db43210n, 0xb00327c898fb213fn, 0xbf597fc7beef0ee4n,
  0xc6e00bf33da88fc2n, 0xd5a79147930aa725n, 0x06ca6351e003826fn, 0x142929670a0e6e70n,
  0x27b70a8546d22ffcn, 0x2e1b21385c26c926n, 0x4d2c6dfc5ac42aedn, 0x53380d139d95b3dfn,
  0x650a73548baf63den, 0x766a0abb3c77b2a8n, 0x81c2c92e47edaee6n, 0x92722c851482353bn,
  0xa2bfe8a14cf10364n, 0xa81a664bbc423001n, 0xc24b8b70d0f89791n, 0xc76c51a30654be30n,
  0xd192e819d6ef5218n, 0xd69906245565a910n, 0xf40e35855771202an, 0x106aa07032bbd1b8n,
  0x19a4c116b8d2d0c8n, 0x1e376c085141ab53n, 0x2748774cdf8eeb99n, 0x34b0bcb5e19b48a8n,
  0x391c0cb3c5c95a63n, 0x4ed8aa4ae3418acbn, 0x5b9cca4f7763e373n, 0x682e6ff3d6b2b8a3n,
  0x748f82ee5defb2fcn, 0x78a5636f43172f60n, 0x84c87814a1f0ab72n, 0x8cc702081a6439ecn,
  0x90befffa23631e28n, 0xa4506cebde82bde9n, 0xbef9a3f7b2c67915n, 0xc67178f2e372532bn,
  0xca273eceea26619cn, 0xd186b8c721c0c207n, 0xeada7dd6cde0eb1en, 0xf57d4f7fee6ed178n,
  0x06f067aa72176fban, 0x0a637dc5a2c898a6n, 0x113f9804bef90daen, 0x1b710b35131c471bn,
  0x28db77f523047d84n, 0x32caab7b40c72493n, 0x3c9ebe0a15c9bebcn, 0x431d67c49c100d4cn,
  0x4cc5d4becb3e42b6n, 0x597f299cfc657e2an, 0x5fcb6fab3ad6faecn, 0x6c44198c4a475817n,
];

class Counter {
  public counter: Uint8Array;

  constructor(initialValue: Uint8Array) {
    this.counter = new Uint8Array(initialValue);
  }

  increment() {
    for (let i = 15; i >= 0; i--) {
      if (this.counter[i] === 255) {
        this.counter[i] = 0;
      } else {
        this.counter[i]++;
        break;
      }
    }
  }
}

class CTR {
  private _counter: Counter;

  private _carryBlock: Uint8Array | undefined;

  private _carryOffset: number;

  private _aes: AES;

  constructor(key: Uint8Array, counter: Counter | Uint8Array) {
    if (!(counter instanceof Counter)) {
      counter = new Counter(counter);
    }

    this._counter = counter;

    this._carryBlock = undefined;
    this._carryOffset = 0;

    this._aes = new AES(key);
  }

  update(plainText: Uint8Array) {
    return this.encrypt(plainText);
  }

  encrypt(plain: Uint8Array): Uint8Array {
    const aes = this._aes;
    const ctr = this._counter;

    const src = plain;
    const n = src.length;

    const dst = new Uint8Array(n);

    let pos = 0;

    // 1) Consume any carried keystream from the previous call
    if (this._carryBlock) {
      const take = Math.min(16 - this._carryOffset, n);
      for (let j = 0; j < take; j++) {
        dst[pos + j] = src[pos + j] ^ this._carryBlock[this._carryOffset + j];
      }
      pos += take;
      this._carryOffset += take;

      if (this._carryOffset === 16) {
        this._carryBlock = undefined;
        this._carryOffset = 0;
      }
    }

    // Temporary keystream block for this call
    const keystream = new Uint8Array(16);

    // 2) Full 16-byte blocks
    while (pos + 16 <= n) {
      const words = aes.encrypt(ctr.counter);
      writeU32WordsBE(words, keystream);
      ctr.increment();

      for (let j = 0; j < 16; j++) {
        dst[pos + j] = src[pos + j] ^ keystream[j];
      }
      pos += 16;
    }

    // 3) Tail (<16 bytes) — store carryover for next call
    if (pos < n) {
      const words = aes.encrypt(ctr.counter);
      writeU32WordsBE(words, keystream);
      ctr.increment();

      let used = 0;
      for (; pos < n; pos++, used++) {
        dst[pos] = src[pos] ^ keystream[used];
      }
      this._carryBlock = keystream;
      this._carryOffset = used;
    }

    return dst;
  }
}

export type CtrImpl = CTR;

// endregion
export function createDecipheriv(algorithm: string, key: Uint8Array, iv: Uint8Array) {
  if (algorithm.includes('ECB')) {
    throw new Error('Not supported');
  } else {
    return new CTR(key, iv);
  }
}

export function createCipheriv(algorithm: string, key: Uint8Array, iv: Uint8Array) {
  if (algorithm.includes('ECB')) {
    throw new Error('Not supported');
  } else {
    return new CTR(key, iv);
  }
}

export function randomBytes(count: number) {
  const bytes = new Uint8Array(count);
  crypto.getRandomValues(bytes);
  return bytes;
}

class Hash {
  private data = new Uint8Array(0);

  constructor(private algorithm: 'sha1' | 'sha256') { }

  update(data: ArrayLike<number>) {
    // We shouldn't be needing new Uint8Array but it doesn't
    // work without it
    this.data = new Uint8Array(data);
  }

  /**
   * 优先使用 Web Crypto 计算摘要，并在 HTTP 等非安全上下文中使用兼容实现
   */
  async digest() {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) {
      return this.algorithm === 'sha1' ? computeSha1(this.data) : computeSha256(this.data);
    }

    const algorithm = this.algorithm === 'sha1' ? 'SHA-1' : 'SHA-256';
    return new Uint8Array(await subtle.digest(algorithm, this.data));
  }
}

export async function pbkdf2(password: Uint8Array<ArrayBuffer>, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return computePbkdf2Sha512(password, salt, iterations);

  const passwordKey = await subtle.importKey('raw', password, { name: 'PBKDF2' }, false, ['deriveBits']);
  return new Uint8Array(await subtle.deriveBits({
    name: 'PBKDF2',
    hash: 'SHA-512',
    salt,
    iterations,
  }, passwordKey, 512));
}

export function createHash(algorithm: 'sha1' | 'sha256') {
  return new Hash(algorithm);
}

function writeU32WordsBE(words: Uint32Array, out: Uint8Array) {
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  for (let i = 0; i < words.length; i++) {
    view.setUint32(i * 4, words[i], false);
  }
}

/**
 * 为 SHA 系列算法补齐消息填充，并以大端序写入原始位长度
 * @param data 待计算摘要的字节数据
 */
function padShaMessage(data: Uint8Array) {
  const paddedLength = Math.ceil((data.length + SHA_1_PADDING_SIZE) / SHA_1_BLOCK_SIZE) * SHA_1_BLOCK_SIZE;
  const padded = new Uint8Array(paddedLength);
  padded.set(data);
  padded[data.length] = 0x80;

  const bitLength = BigInt(data.length) * 8n;
  const view = new DataView(padded.buffer);
  view.setBigUint64(paddedLength - 8, bitLength, false);
  return padded;
}

/**
 * 在浏览器未提供 Web Crypto 时计算 SHA-1 摘要
 * @param data 待计算摘要的字节数据
 */
function computeSha1(data: Uint8Array) {
  const padded = padShaMessage(data);
  const view = new DataView(padded.buffer);
  const state = [...SHA_1_INITIAL_STATE];
  const words = new Uint32Array(80);

  for (let offset = 0; offset < padded.length; offset += SHA_1_BLOCK_SIZE) {
    for (let index = 0; index < 16; index++) {
      words[index] = view.getUint32(offset + index * 4, false);
    }
    for (let index = 16; index < words.length; index++) {
      words[index] = rotateLeft(words[index - 3] ^ words[index - 8] ^ words[index - 14] ^ words[index - 16], 1);
    }

    let [first, second, third, fourth, fifth] = state;
    for (let index = 0; index < words.length; index++) {
      const round = Math.floor(index / SHA_1_DIGEST_SIZE);
      const choice = round === 0 ? (second & third) | (~second & fourth)
        : round === 1 || round === 3 ? second ^ third ^ fourth
          : (second & third) | (second & fourth) | (third & fourth);
      const constant = round === 0 ? 0x5a827999 : round === 1 ? 0x6ed9eba1 : round === 2 ? 0x8f1bbcdc : 0xca62c1d6;
      const next = (rotateLeft(first, 5) + choice + fifth + constant + words[index]) >>> 0;
      fifth = fourth;
      fourth = third;
      third = rotateLeft(second, 30);
      second = first;
      first = next;
    }

    state[0] = (state[0] + first) >>> 0;
    state[1] = (state[1] + second) >>> 0;
    state[2] = (state[2] + third) >>> 0;
    state[3] = (state[3] + fourth) >>> 0;
    state[4] = (state[4] + fifth) >>> 0;
  }

  return writeDigest(state, SHA_1_DIGEST_SIZE);
}

/**
 * 在浏览器未提供 Web Crypto 时计算 SHA-256 摘要
 * @param data 待计算摘要的字节数据
 */
function computeSha256(data: Uint8Array) {
  const padded = padShaMessage(data);
  const view = new DataView(padded.buffer);
  const state = [...SHA_256_INITIAL_STATE];
  const words = new Uint32Array(64);

  for (let offset = 0; offset < padded.length; offset += SHA_1_BLOCK_SIZE) {
    for (let index = 0; index < 16; index++) {
      words[index] = view.getUint32(offset + index * 4, false);
    }
    for (let index = 16; index < words.length; index++) {
      const first = words[index - 15];
      const second = words[index - 2];
      const sigma0 = rotateRight(first, 7) ^ rotateRight(first, 18) ^ (first >>> 3);
      const sigma1 = rotateRight(second, 17) ^ rotateRight(second, 19) ^ (second >>> 10);
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0;
    }

    let [first, second, third, fourth, fifth, sixth, seventh, eighth] = state;
    for (let index = 0; index < words.length; index++) {
      const sigma1 = rotateRight(fifth, 6) ^ rotateRight(fifth, 11) ^ rotateRight(fifth, 25);
      const choice = (fifth & sixth) ^ (~fifth & seventh);
      const temporary1 = (eighth + sigma1 + choice + SHA_256_ROUND_CONSTANTS[index] + words[index]) >>> 0;
      const sigma0 = rotateRight(first, 2) ^ rotateRight(first, 13) ^ rotateRight(first, 22);
      const majority = (first & second) ^ (first & third) ^ (second & third);
      const temporary2 = (sigma0 + majority) >>> 0;

      eighth = seventh;
      seventh = sixth;
      sixth = fifth;
      fifth = (fourth + temporary1) >>> 0;
      fourth = third;
      third = second;
      second = first;
      first = (temporary1 + temporary2) >>> 0;
    }

    state[0] = (state[0] + first) >>> 0;
    state[1] = (state[1] + second) >>> 0;
    state[2] = (state[2] + third) >>> 0;
    state[3] = (state[3] + fourth) >>> 0;
    state[4] = (state[4] + fifth) >>> 0;
    state[5] = (state[5] + sixth) >>> 0;
    state[6] = (state[6] + seventh) >>> 0;
    state[7] = (state[7] + eighth) >>> 0;
  }

  return writeDigest(state, SHA_256_DIGEST_SIZE);
}

/**
 * 将哈希状态字按大端序转换为摘要字节
 * @param state 哈希计算后的 32 位状态字
 * @param digestSize 目标摘要长度
 */
function writeDigest(state: number[], digestSize: number) {
  const digest = new Uint8Array(digestSize);
  writeU32WordsBE(Uint32Array.from(state), digest);
  return digest;
}

/**
 * 对无符号 32 位整数执行循环左移
 * @param value 原始数值
 * @param bits 移动位数
 */
function rotateLeft(value: number, bits: number) {
  return (value << bits) | (value >>> (32 - bits));
}

/**
 * 对无符号 32 位整数执行循环右移
 * @param value 原始数值
 * @param bits 移动位数
 */
function rotateRight(value: number, bits: number) {
  return (value >>> bits) | (value << (32 - bits));
}

/**
 * 在浏览器未提供 Web Crypto 时计算 PBKDF2-HMAC-SHA-512 派生密钥
 * @param password 用户密码经过前置哈希后的字节数据
 * @param salt Telegram 服务端提供的盐值
 * @param iterations 服务端指定的迭代次数
 */
function computePbkdf2Sha512(password: Uint8Array, salt: Uint8Array, iterations: number) {
  const block = new Uint8Array(salt.length + 4);
  block.set(salt);
  block[block.length - 1] = 1;

  let current = computeHmacSha512(password, block);
  const derived = new Uint8Array(current);
  for (let iteration = 1; iteration < iterations; iteration++) {
    current = computeHmacSha512(password, current);
    for (let index = 0; index < derived.length; index++) {
      derived[index] ^= current[index];
    }
  }

  return derived;
}

/**
 * 使用 SHA-512 计算 HMAC，供 PBKDF2 的每轮派生使用
 * @param key HMAC 密钥
 * @param data 当前轮参与计算的数据
 */
function computeHmacSha512(key: Uint8Array, data: Uint8Array) {
  const normalizedKey = key.length > SHA_512_BLOCK_SIZE ? computeSha512(key) : key;
  const innerKey = new Uint8Array(SHA_512_BLOCK_SIZE);
  const outerKey = new Uint8Array(SHA_512_BLOCK_SIZE);
  innerKey.set(normalizedKey);
  outerKey.set(normalizedKey);

  for (let index = 0; index < SHA_512_BLOCK_SIZE; index++) {
    innerKey[index] ^= 0x36;
    outerKey[index] ^= 0x5c;
  }

  const inner = new Uint8Array(innerKey.length + data.length);
  inner.set(innerKey);
  inner.set(data, innerKey.length);
  const innerDigest = computeSha512(inner);
  const outer = new Uint8Array(outerKey.length + innerDigest.length);
  outer.set(outerKey);
  outer.set(innerDigest, outerKey.length);
  return computeSha512(outer);
}

/**
 * 使用 BigInt 精确模拟 64 位运算，计算 SHA-512 摘要
 * @param data 待计算摘要的字节数据
 */
function computeSha512(data: Uint8Array) {
  const paddedLength = Math.ceil((data.length + 17) / SHA_512_BLOCK_SIZE) * SHA_512_BLOCK_SIZE;
  const padded = new Uint8Array(paddedLength);
  padded.set(data);
  padded[data.length] = 0x80;
  new DataView(padded.buffer).setBigUint64(paddedLength - 8, BigInt(data.length) * 8n, false);

  const view = new DataView(padded.buffer);
  const state = [...SHA_512_INITIAL_STATE];
  const words = new Array<bigint>(80);

  for (let offset = 0; offset < padded.length; offset += SHA_512_BLOCK_SIZE) {
    for (let index = 0; index < 16; index++) {
      words[index] = view.getBigUint64(offset + index * 8, false);
    }
    for (let index = 16; index < words.length; index++) {
      const first = words[index - 15];
      const second = words[index - 2];
      const sigma0 = rotateRight64(first, 1n) ^ rotateRight64(first, 8n) ^ (first >> 7n);
      const sigma1 = rotateRight64(second, 19n) ^ rotateRight64(second, 61n) ^ (second >> 6n);
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) & SHA_512_MASK;
    }

    let [first, second, third, fourth, fifth, sixth, seventh, eighth] = state;
    for (let index = 0; index < words.length; index++) {
      const sigma1 = rotateRight64(fifth, 14n) ^ rotateRight64(fifth, 18n) ^ rotateRight64(fifth, 41n);
      const choice = (fifth & sixth) ^ (~fifth & seventh);
      const temporary1 = (eighth + sigma1 + choice + SHA_512_ROUND_CONSTANTS[index] + words[index]) & SHA_512_MASK;
      const sigma0 = rotateRight64(first, 28n) ^ rotateRight64(first, 34n) ^ rotateRight64(first, 39n);
      const majority = (first & second) ^ (first & third) ^ (second & third);
      const temporary2 = (sigma0 + majority) & SHA_512_MASK;

      eighth = seventh;
      seventh = sixth;
      sixth = fifth;
      fifth = (fourth + temporary1) & SHA_512_MASK;
      fourth = third;
      third = second;
      second = first;
      first = (temporary1 + temporary2) & SHA_512_MASK;
    }

    state[0] = (state[0] + first) & SHA_512_MASK;
    state[1] = (state[1] + second) & SHA_512_MASK;
    state[2] = (state[2] + third) & SHA_512_MASK;
    state[3] = (state[3] + fourth) & SHA_512_MASK;
    state[4] = (state[4] + fifth) & SHA_512_MASK;
    state[5] = (state[5] + sixth) & SHA_512_MASK;
    state[6] = (state[6] + seventh) & SHA_512_MASK;
    state[7] = (state[7] + eighth) & SHA_512_MASK;
  }

  const digest = new Uint8Array(64);
  const digestView = new DataView(digest.buffer);
  state.forEach((value, index) => digestView.setBigUint64(index * 8, value, false));
  return digest;
}

/**
 * 对无符号 64 位整数执行循环右移
 * @param value 原始数值
 * @param bits 移动位数
 */
function rotateRight64(value: bigint, bits: bigint) {
  return ((value >> bits) | (value << (64n - bits))) & SHA_512_MASK;
}
