const VERSION = 1;
const TTL = 24 * 60 * 60 * 1000;
const ITERATIONS = 310000;
const encode = (bytes) => btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
const decode = (value) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
const header = ({ version, ownerId, draftId, expiresAt, salt, iv }) =>
  JSON.stringify({ version, ownerId, draftId, expiresAt, salt, iv });

async function key(passphrase, salt, cryptoApi) {
  if (typeof passphrase !== "string" || passphrase.length < 12) throw new Error("Use a draft passphrase of at least 12 characters.");
  const material = await cryptoApi.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return cryptoApi.subtle.deriveKey({ name:"PBKDF2",salt,iterations:ITERATIONS,hash:"SHA-256" },
    material,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}

export async function encryptDraft(ownerId, draftId, data, passphrase, now=Date.now(), cryptoApi=globalThis.crypto) {
  if (!ownerId || !draftId || !cryptoApi?.subtle) throw new Error("Secure draft storage is unavailable.");
  const plain = new TextEncoder().encode(JSON.stringify(data));
  if (plain.length > 128 * 1024) throw new Error("The draft is too large for device storage.");
  const salt=cryptoApi.getRandomValues(new Uint8Array(16));
  const iv=cryptoApi.getRandomValues(new Uint8Array(12));
  const envelope={version:VERSION,ownerId,draftId,expiresAt:now+TTL,salt:encode(salt),iv:encode(iv)};
  const ciphertext=await cryptoApi.subtle.encrypt({name:"AES-GCM",iv,
    additionalData:new TextEncoder().encode(header(envelope))},await key(passphrase,salt,cryptoApi),plain);
  return {...envelope,ciphertext:encode(new Uint8Array(ciphertext))};
}

export async function decryptDraft(envelope, ownerId, passphrase, now=Date.now(), cryptoApi=globalThis.crypto) {
  if (envelope?.version!==VERSION || envelope.ownerId!==ownerId ||
      !Number.isSafeInteger(envelope.expiresAt) || envelope.expiresAt<=now ||
      envelope.expiresAt>now+TTL || typeof envelope.ciphertext!=="string" ||
      envelope.ciphertext.length>256*1024 ||
      typeof envelope.salt!=="string" || envelope.salt.length!==24 ||
      typeof envelope.iv!=="string" || envelope.iv.length!==16) throw new Error("Draft is expired or unavailable for this account.");
  try {
    const salt=decode(envelope.salt),iv=decode(envelope.iv);
    const plaintext=await cryptoApi.subtle.decrypt({name:"AES-GCM",iv,
      additionalData:new TextEncoder().encode(header(envelope))},
      await key(passphrase,salt,cryptoApi),decode(envelope.ciphertext));
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch { throw new Error("Draft could not be unlocked. Check the passphrase and account."); }
}

export const draftStorageKey = (ownerId) => "reflink-encrypted-draft-v1:" + ownerId;

export function readStoredEnvelope(storage, ownerId, now=Date.now()) {
  const storageKey=draftStorageKey(ownerId);
  const stored=storage.getItem(storageKey);
  if (!stored) throw new Error("No encrypted draft is saved for this account.");
  const envelope=JSON.parse(stored);
  if (!Number.isSafeInteger(envelope.expiresAt) || envelope.expiresAt<=now) {
    storage.removeItem(storageKey);
    throw new Error("The saved draft expired and was removed.");
  }
  return envelope;
}

export function restoreDraftData(data, template) {
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!data || !uuid.test(data.clientSubmissionId) || !data.form) throw new Error("Draft format is invalid.");
  const form=Object.fromEntries(Object.keys(template).map((field)=>{
    const value=data.form[field];
    if (typeof value!=="string" || value.length>20000) throw new Error("Draft form is invalid.");
    return [field,value];
  }));
  const diagnoses=data.diagnosisEntries;
  const investigations=data.investigations;
  const categories=data.categories;
  if (!Array.isArray(diagnoses) || diagnoses.length>50 ||
      !Array.isArray(investigations) || investigations.length>50 ||
      !Array.isArray(categories) || categories.length>50) throw new Error("Draft selections are invalid.");
  const strings=(record,fields)=>Object.fromEntries(fields.map((field)=>{
    const value=record?.[field]??"";
    if(typeof value!=="string" || value.length>4000)throw new Error("Draft clinical entry is invalid.");
    return [field,value];
  }));
  return {form,clientSubmissionId:data.clientSubmissionId,
    diagnosisEntries:diagnoses.map((record)=>strings(record,["status","category","diagnosis"])),
    investigations:investigations.map((record)=>strings(record,["category","investigation","result_status",
      "result_value","result_unit","reference_range","interpretation","result_notes"])),
    categories:categories.map((value)=>{
      if(typeof value!=="string" || value.length>4000)throw new Error("Draft category is invalid.");
      return value;
    })};
}
