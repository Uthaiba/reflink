const MAX_BYTES = 10 * 1024 * 1024;
const FORMATS = {
  "application/pdf": ["pdf"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "text/plain": ["txt"],
  "text/csv": ["csv"],
};

// Client checks improve feedback; storage policies and server validation remain required.
export function validateInvestigationFile(file) {
  if (!file || !Number.isSafeInteger(file.size) || file.size <= 0) {
    throw new Error("Investigation result file must not be empty.");
  }
  if (file.size > MAX_BYTES) throw new Error("Investigation result file must not exceed 10 MB.");
  const extensions = FORMATS[file.type];
  const extension = String(file.name || "").split(".").pop().toLowerCase();
  if (!extensions || !extensions.includes(extension)) {
    throw new Error("Unsupported investigation document or file extension does not match its type.");
  }
  return extensions[0];
}

export async function validateInvestigationFileContent(file) {
  validateInvestigationFile(file);
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const starts = (signature) => signature.every((byte, index) => bytes[index] === byte);
  let valid = false;
  switch (file.type) {
    case "application/pdf": valid = starts([37, 80, 68, 70, 45]); break;
    case "image/jpeg": valid = starts([255, 216, 255]); break;
    case "image/png": valid = starts([137, 80, 78, 71, 13, 10, 26, 10]); break;
    case "image/webp":
      valid = starts([82, 73, 70, 70]) && bytes.length >= 12 &&
        [87, 69, 66, 80].every((byte, index) => bytes[index + 8] === byte);
      break;
    default: {
      const content = new Uint8Array(await file.arrayBuffer());
      try {
        new TextDecoder("utf-8", { fatal: true }).decode(content);
        valid = !content.some((byte) => byte === 0 || (byte < 32 && ![9, 10, 13].includes(byte)));
      } catch { valid = false; }
    }
  }
  if (!valid) throw new Error("Investigation document content does not match its declared file type.");
}

export function createInvestigationFilePath(referralId, file, randomUUID = () => globalThis.crypto.randomUUID()) {
  const extension = validateInvestigationFile(file);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const attachmentId = randomUUID();
  if (!uuid.test(String(referralId)) || !uuid.test(String(attachmentId))) {
    throw new Error("Cannot create a safe investigation attachment identifier.");
  }
  return `${referralId}/${attachmentId}.${extension}`;
}
