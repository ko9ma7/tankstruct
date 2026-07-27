const STORAGE_KEY = "tankstruct.project.v1";

export function saveProject(project) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
}

export function loadProject() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return [1, 2].includes(value?.schemaVersion) ? value : null;
  } catch {
    return null;
  }
}

export function clearProject() {
  localStorage.removeItem(STORAGE_KEY);
}
