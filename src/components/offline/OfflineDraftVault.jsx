import { useCallback, useEffect, useState } from "react";
import {
  createOrUnlockOfflineVault,
  deleteEncryptedOfflineDraft,
  listEncryptedOfflineDrafts,
  offlineVaultExists,
  saveEncryptedOfflineDraft,
} from "../../lib/offlineDraftVault.js";
import "./OfflineDraftVault.css";

function formatSavedAt(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Saved draft" : date.toLocaleString();
}

export default function OfflineDraftVault({ userId, draft, onRestore, hasAttachments = false }) {
  const [vaultExists, setVaultExists] = useState(null);
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [vaultKey, setVaultKey] = useState(null);
  const [drafts, setDrafts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    offlineVaultExists()
      .then((exists) => {
        if (active) setVaultExists(exists);
      })
      .catch((loadError) => {
        if (active) setError(loadError?.message || "Encrypted local storage is unavailable.");
      });
    return () => {
      active = false;
    };
  }, []);

  const refreshDrafts = useCallback(async (key = vaultKey) => {
    if (!key || !userId) return;
    const records = await listEncryptedOfflineDrafts(key, userId);
    setDrafts(records);
  }, [userId, vaultKey]);

  useEffect(() => {
    if (!vaultKey) return undefined;

    let idleTimer;
    const lockVault = () => {
      setVaultKey(null);
      setDrafts([]);
      setMessage("Local vault locked.");
    };
    const resetIdleTimer = () => {
      globalThis.clearTimeout(idleTimer);
      idleTimer = globalThis.setTimeout(lockVault, 5 * 60 * 1000);
    };
    const handleVisibility = () => {
      if (document.hidden) lockVault();
      else resetIdleTimer();
    };

    ["pointerdown", "keydown", "touchstart"].forEach((eventName) => {
      document.addEventListener(eventName, resetIdleTimer, { passive: true });
    });
    document.addEventListener("visibilitychange", handleVisibility);
    resetIdleTimer();

    return () => {
      globalThis.clearTimeout(idleTimer);
      ["pointerdown", "keydown", "touchstart"].forEach((eventName) => {
        document.removeEventListener(eventName, resetIdleTimer);
      });
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [vaultKey]);

  const handleUnlock = async () => {
    setError("");
    setMessage("");
    if (!userId) {
      setError("A signed-in REFLINK account is required to use the local vault.");
      return;
    }
    if (passphrase.length < 16) {
      setError("Use a local vault passphrase of at least 16 characters.");
      return;
    }
    if (!vaultExists && passphrase !== confirmPassphrase) {
      setError("The local vault passphrases do not match.");
      return;
    }

    setBusy(true);
    try {
      const result = await createOrUnlockOfflineVault(passphrase);
      setVaultKey(result.key);
      const records = await listEncryptedOfflineDrafts(result.key, userId);
      setDrafts(records);
      setVaultExists(true);
      setMessage(result.created
        ? "Encrypted local vault created. Keep your passphrase safe; it cannot be recovered."
        : "Local vault unlocked.");
      setPassphrase("");
      setConfirmPassphrase("");
    } catch (unlockError) {
      setError(unlockError?.message || "Unable to unlock the local vault.");
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    setError("");
    setMessage("");
    if (!vaultKey || !userId) {
      setError("Unlock the local vault before saving.");
      return;
    }
    if (hasAttachments) {
      setError("Remove investigation attachments before saving offline. File attachments are not included in local drafts.");
      return;
    }

    setBusy(true);
    try {
      await saveEncryptedOfflineDraft(vaultKey, userId, draft);
      await refreshDrafts(vaultKey);
      setMessage("Draft encrypted and saved on this device. It has not been submitted or sent to a facility.");
    } catch (saveError) {
      setError(saveError?.message || "Unable to save the encrypted draft.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id) => {
    setError("");
    setBusy(true);
    try {
      await deleteEncryptedOfflineDraft(id);
      await refreshDrafts();
      setMessage("Encrypted local draft deleted.");
    } catch (deleteError) {
      setError(deleteError?.message || "Unable to delete the local draft.");
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = (savedDraft) => {
    onRestore(savedDraft);
    setMessage("Draft restored into the referral form. Review all details before submitting.");
    setError("");
  };

  const handleLock = () => {
    setVaultKey(null);
    setDrafts([]);
    setMessage("Local vault locked.");
    setPassphrase("");
    setConfirmPassphrase("");
  };

  return (
    <section className="reflink-offline-vault" aria-labelledby="reflink-offline-vault-title">
      <div className="reflink-offline-vault-heading">
        <div>
          <span className="reflink-offline-vault-eyebrow">DEVICE-ONLY STORAGE</span>
          <h3 id="reflink-offline-vault-title">Encrypted offline drafts</h3>
          <p>Save and restore referral drafts on this device. Nothing is sent to a facility until you submit online.</p>
        </div>
        {vaultKey && (
          <button type="button" className="reflink-vault-lock" onClick={handleLock}>
            Lock vault
          </button>
        )}
      </div>

      {!vaultKey ? (
        <div className="reflink-vault-unlock">
          <label htmlFor="reflink-vault-passphrase">Local vault passphrase</label>
          <input
            id="reflink-vault-passphrase"
            type="password"
            autoComplete="new-password"
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
            placeholder="At least 16 characters"
            minLength={16}
          />
          {!vaultExists && (
            <>
              <label htmlFor="reflink-vault-confirm">Confirm passphrase</label>
              <input
                id="reflink-vault-confirm"
                type="password"
                autoComplete="new-password"
                value={confirmPassphrase}
                onChange={(event) => setConfirmPassphrase(event.target.value)}
                placeholder="Re-enter local passphrase"
                minLength={16}
              />
            </>
          )}
          <button type="button" onClick={handleUnlock} disabled={busy || vaultExists === null}>
            {busy ? "Opening vault…" : vaultExists ? "Unlock local vault" : "Create encrypted vault"}
          </button>
          <p className="reflink-vault-security-note">
            Your passphrase is never stored. Drafts are encrypted with AES-256-GCM using a PBKDF2-derived key and automatically locked after five minutes of inactivity or when this tab is hidden. If you forget the passphrase, encrypted drafts cannot be recovered.
          </p>
        </div>
      ) : (
        <div className="reflink-vault-content">
          <div className="reflink-vault-save-row">
            <span>Vault unlocked for this signed-in account.</span>
            <button type="button" onClick={handleSave} disabled={busy || hasAttachments}>
              {busy ? "Saving…" : "Save current draft securely"}
            </button>
          </div>
          {hasAttachments && (
            <p className="reflink-vault-warning">Remove selected investigation files before saving. Attachments are deliberately excluded from this offline draft feature.</p>
          )}
          {drafts.length === 0 ? (
            <p className="reflink-vault-empty">No encrypted drafts are saved for this account on this device.</p>
          ) : (
            <ul className="reflink-vault-list">
              {drafts.map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>Referral draft</strong>
                    <time dateTime={item.createdAt}>{formatSavedAt(item.createdAt)}</time>
                  </div>
                  <div className="reflink-vault-item-actions">
                    <button type="button" onClick={() => handleRestore(item.draft)} disabled={busy}>Restore</button>
                    <button type="button" className="reflink-vault-delete" onClick={() => handleDelete(item.id)} disabled={busy}>Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {message && <p className="reflink-vault-message" role="status">{message}</p>}
      {error && <p className="reflink-vault-error" role="alert">{error}</p>}
    </section>
  );
}
