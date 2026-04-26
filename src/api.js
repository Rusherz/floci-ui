import { encodeS3KeyForPath, joinUrl, parseXml } from "./utils.js";

export function createApiClient(config) {
  function objectUrl(bucketName, key) {
    const encodedKey = encodeS3KeyForPath(key);
    return `${joinUrl(config.baseUrl)}/${bucketName}/${encodedKey}`;
  }

  async function getXml(path) {
    const response = await fetch(joinUrl(config.baseUrl, path), {
      method: "GET",
      headers: {
        Accept: "application/xml,text/xml,*/*",
      },
    });

    const body = await response.text();
    if (!response.ok) {
      throw new Error(`GET ${path || "/"} failed (${response.status}): ${body.slice(0, 180)}`);
    }

    return parseXml(body);
  }

  async function sqsAction(action, params = {}) {
    const body = new URLSearchParams({
      Action: action,
      Version: config.sqsVersion,
      ...params,
    });

    const response = await fetch(joinUrl(config.baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/xml,text/xml,*/*",
      },
      body: body.toString(),
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`SQS ${action} failed (${response.status}): ${text.slice(0, 180)}`);
    }

    return parseXml(text);
  }

  async function deleteObject(bucketName, key) {
    const response = await fetch(objectUrl(bucketName, key), {
      method: "DELETE",
    });

    const body = await response.text();
    if (!response.ok) {
      throw new Error(`Delete failed (${response.status}): ${body.slice(0, 180)}`);
    }
  }

  return {
    getXml,
    sqsAction,
    deleteObject,
    objectUrl,
  };
}
