import { useEffect, useState } from "react";

const translations = {
  en: {
    home: "Home", howItWorks: "How It Works", platform: "Platform", signIn: "Sign In",
    closedLoop: "Closed-Loop Digital Referral System",
    hero: "Every Referral Connected. Every Patient Followed.",
    access: "Access REFLINK", newReferral: "New Referral", patientInformation: "Patient Information",
    clinicalInformation: "Clinical Information", referralInformation: "Referral Information",
    createReferral: "Create Referral", back: "Back", language: "Language", online: "Online", offline: "Offline",
  },
  ha: {
    home: "Gida", howItWorks: "Yadda Yake Aiki", platform: "Tsari", signIn: "Shiga",
    closedLoop: "Tsarin Tura Mara Lafiya Mai Cikakken Bibiyar Sakamako",
    hero: "Kowace Tura Mara Lafiya Tana da Alaƙa. Ana Bibiyar Kowane Mara Lafiya.",
    access: "Shiga REFLINK", newReferral: "Sabuwar Tura Mara Lafiya", patientInformation: "Bayanan Mara Lafiya",
    clinicalInformation: "Bayanan Lafiya", referralInformation: "Bayanan Tura Mara Lafiya",
    createReferral: "Ƙirƙiri Tura", back: "Koma", language: "Harshe", online: "A Kan Intanet", offline: "Ba Intanet",
  },
  // Kanuri is intentionally a localization scaffold until the clinical terminology is validated by Kanuri-speaking clinicians.
  kr: {
    home: "Home", howItWorks: "How It Works", platform: "Platform", signIn: "Sign In",
    closedLoop: "Closed-Loop Digital Referral System",
    hero: "Every Referral Connected. Every Patient Followed.",
    access: "Access REFLINK", newReferral: "New Referral", patientInformation: "Patient Information",
    clinicalInformation: "Clinical Information", referralInformation: "Referral Information",
    createReferral: "Create Referral", back: "Back", language: "Kanuri", online: "Online", offline: "Offline",
  },
};

export function useLanguage() {
  const [lang, setLang] = useState(() => localStorage.getItem("reflink-language") || "en");
  useEffect(() => {
    localStorage.setItem("reflink-language", lang);
    document.documentElement.lang = lang === "kr" ? "kr" : lang;
    window.dispatchEvent(new CustomEvent("reflink-language-change", { detail: lang }));
  }, [lang]);
  useEffect(() => {
    const handler = (event) => { if (event.detail && event.detail !== lang) setLang(event.detail); };
    window.addEventListener("reflink-language-change", handler);
    return () => window.removeEventListener("reflink-language-change", handler);
  }, [lang]);
  const t = (key) => translations[lang]?.[key] || translations.en[key] || key;
  return { lang, setLang, t };
}

export function LanguageSwitcher() {
  const { lang, setLang, t } = useLanguage();
  return (
    <div className="reflink-language-switcher" aria-label={t("language")}>
      {[['en','EN'],['ha','HA'],['kr','KN']].map(([value,label]) => (
        <button key={value} type="button" className={lang === value ? "is-active" : ""} onClick={() => setLang(value)}>{label}</button>
      ))}
    </div>
  );
}
