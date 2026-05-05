export interface EncryptedCloudBackupBlob {
  v: 1;
  alg: "PBKDF2-SHA256/AES-256-GCM";
  salt_b64: string;
  iv_b64: string;
  data_b64: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

function base64ToBytes(b64: unknown): Uint8Array {
  const bin = atob(String(b64 || ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveAesKey(
  passphrase: string,
  saltBytes: Uint8Array,
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(String(passphrase || "")),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBytes as BufferSource,
      iterations: 120_000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptJsonToBlob(
  payload: unknown,
  passphrase: string,
): Promise<EncryptedCloudBackupBlob> {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(passphrase, salt);
  const plaintext = enc.encode(JSON.stringify(payload));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      plaintext as BufferSource,
    ),
  );
  return {
    v: 1,
    alg: "PBKDF2-SHA256/AES-256-GCM",
    salt_b64: bytesToBase64(salt),
    iv_b64: bytesToBase64(iv),
    data_b64: bytesToBase64(ct),
  };
}

export async function decryptBlobToJson(
  blob: unknown,
  passphrase: string,
): Promise<unknown> {
  const obj = (
    blob && typeof blob === "object" ? blob : {}
  ) as Partial<EncryptedCloudBackupBlob>;
  if (obj.v !== 1) throw new Error("Непідтримувана версія бекапу.");
  const salt = base64ToBytes(obj.salt_b64);
  const iv = base64ToBytes(obj.iv_b64);
  const data = base64ToBytes(obj.data_b64);
  const key = await deriveAesKey(passphrase, salt);
  const pt = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      data as BufferSource,
    ),
  );
  const dec = new TextDecoder();
  return JSON.parse(dec.decode(pt));
}
