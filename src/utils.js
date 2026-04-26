export function joinUrl(base, path = "") {
  const cleanBase = base.replace(/\/$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${cleanBase}${path ? cleanPath : ""}`;
}

export function encodeS3KeyForPath(key) {
  return key
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function parseXml(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error("Failed to parse XML response");
  }
  return doc;
}

export function textContent(element, selector) {
  const node = element.querySelector(selector);
  return node ? node.textContent : "";
}

export function toIsoFromEpochMs(value) {
  const ms = Number(value);
  if (Number.isNaN(ms) || !ms) return "";
  return new Date(ms).toISOString();
}

export function parseMaybeJson(input) {
  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
}

export function locationKey(bucketName, prefix) {
  return `${bucketName}|${prefix}`;
}

export function parentPrefix(prefix) {
  if (!prefix) return "";
  const parts = prefix.split("/").filter(Boolean);
  if (parts.length <= 1) return "";
  return `${parts.slice(0, -1).join("/")}/`;
}

export function clampIndex(index, maxLength) {
  if (!maxLength) return 0;
  return Math.max(0, Math.min(index, maxLength - 1));
}
