const registries = new WeakMap();

function registryFor(targetWindow) {
  let registry = registries.get(targetWindow);
  if (registry) return registry;
  const entries = new Map();
  const dirty = () => [...entries.values()].some((check) => check());
  const allowLeave = () => !dirty() || targetWindow.confirm(
    "Leave unsaved clinical changes? They have not been saved to the referral."
  );
  const beforeUnload = (event) => {
    if (!dirty()) return;
    event.preventDefault();
    event.returnValue = "";
  };
  const click = (event) => {
    if (!event.target?.closest?.("[data-leave-clinical-workspace]")) return;
    if (allowLeave()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  registry = { entries, allowLeave, beforeUnload, click };
  registries.set(targetWindow, registry);
  return registry;
}

export function confirmClinicalNavigation(targetWindow) {
  return registries.get(targetWindow)?.allowLeave() ?? true;
}

export function registerClinicalDraft(targetWindow, checkDirty) {
  const registry = registryFor(targetWindow);
  const token = Symbol("clinical-draft");
  if (!registry.entries.size) {
    targetWindow.addEventListener("beforeunload", registry.beforeUnload);
    targetWindow.document.addEventListener("click", registry.click, true);
  }
  registry.entries.set(token, checkDirty);
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    registry.entries.delete(token);
    if (!registry.entries.size) {
      targetWindow.removeEventListener("beforeunload", registry.beforeUnload);
      targetWindow.document.removeEventListener("click", registry.click, true);
      registries.delete(targetWindow);
    }
  };
}
