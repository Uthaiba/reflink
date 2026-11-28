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
};

function readPreference() {
  try { return localStorage.getItem("reflink-language") === "ha" ? "ha" : "en"; }
  catch { return "en"; }
}

export function useLanguage() {
  const [lang, setLanguage] = useState(readPreference);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  function changeLanguage(value) {
    setLanguage(value);
    try { localStorage.setItem("reflink-language", value); } catch { /* Session-only preference. */ }
  }
  return {lang, changeLanguage, t: key => translations[lang][key]};
}

export function LanguageSwitcher({lang, changeLanguage, t}) {
  return <label>{t("language")} <select value={lang} onChange={event => changeLanguage(event.target.value)}>
    <option lang="en" value="en">English</option>
    <option lang="ha" value="ha">Hausa</option>
  </select></label>;
}
