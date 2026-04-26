import { locationKey, textContent } from "./utils.js";

export function createS3Service({ state, api }) {
  function getFilteredBuckets() {
    return state.s3.buckets;
  }

  function getSelectedBucket() {
    const buckets = getFilteredBuckets();
    if (!buckets.length) return null;
    state.selectedBucket = Math.max(0, Math.min(state.selectedBucket, buckets.length - 1));
    return buckets[state.selectedBucket];
  }

  function currentPrefixForBucket(bucketName) {
    return state.s3.prefixByBucket[bucketName] || "";
  }

  function setCurrentPrefix(bucketName, prefix) {
    state.s3.prefixByBucket[bucketName] = prefix;
  }

  function getListing(bucketName, prefix) {
    return state.s3.entriesByLocation[locationKey(bucketName, prefix)] || { folders: [], files: [] };
  }

  async function loadBuckets() {
    const doc = await api.getXml("");
    const buckets = Array.from(doc.querySelectorAll("Buckets > Bucket")).map((bucketNode) => ({
      name: textContent(bucketNode, "Name"),
      region: "ca-central-1",
      creationDate: textContent(bucketNode, "CreationDate"),
    }));

    state.s3.buckets = buckets;
    state.s3.entriesByLocation = {};
    state.s3.selectedObject = null;
    state.s3.allKeysByBucket = {};
    state.s3.searchResults = null;
    state.s3.searchLoading = false;
    state.s3.searchRequestId = 0;

    for (const bucket of buckets) {
      if (state.s3.prefixByBucket[bucket.name] === undefined) {
        state.s3.prefixByBucket[bucket.name] = "";
      }
    }
  }

  async function loadObjectsForBucketPrefix(bucketName, prefix) {
    if (!bucketName) return;

    const cacheKey = locationKey(bucketName, prefix);
    if (state.s3.entriesByLocation[cacheKey]) return;

    const query = new URLSearchParams({
      "list-type": "2",
      delimiter: "/",
      "max-keys": "200",
    });

    if (prefix) {
      query.set("prefix", prefix);
    }

    const doc = await api.getXml(`/${bucketName}?${query.toString()}`);

    const folders = Array.from(doc.querySelectorAll("ListBucketResult > CommonPrefixes > Prefix")).map((node) => {
      const fullPrefix = node.textContent || "";
      const relativeName = fullPrefix.replace(prefix, "").replace(/\/$/, "");
      return {
        type: "folder",
        name: relativeName || fullPrefix,
        prefix: fullPrefix,
      };
    });

    const files = Array.from(doc.querySelectorAll("ListBucketResult > Contents"))
      .map((objectNode) => {
        const key = textContent(objectNode, "Key");
        if (!key || key === prefix) return null;

        const relativeName = prefix && key.startsWith(prefix) ? key.slice(prefix.length) : key;
        if (relativeName.includes("/")) return null;

        return {
          type: "file",
          key,
          name: relativeName || key,
          size: textContent(objectNode, "Size"),
          lastModified: textContent(objectNode, "LastModified"),
          etag: textContent(objectNode, "ETag"),
        };
      })
      .filter(Boolean);

    state.s3.entriesByLocation[cacheKey] = { folders, files };
  }

  async function listAllKeysForPrefix(bucketName, prefix) {
    if (!prefix && Array.isArray(state.s3.allKeysByBucket[bucketName])) {
      return state.s3.allKeysByBucket[bucketName];
    }

    const keys = [];
    let continuationToken = "";

    while (true) {
      const query = new URLSearchParams({
        "list-type": "2",
        "max-keys": "1000",
        prefix,
      });
      if (continuationToken) {
        query.set("continuation-token", continuationToken);
      }

      const doc = await api.getXml(`/${bucketName}?${query.toString()}`);
      const pageKeys = Array.from(doc.querySelectorAll("ListBucketResult > Contents > Key"))
        .map((node) => node.textContent || "")
        .filter(Boolean);

      keys.push(...pageKeys);

      const isTruncated = (textContent(doc, "ListBucketResult > IsTruncated") || "").toLowerCase() === "true";
      if (!isTruncated) {
        break;
      }

      continuationToken = textContent(doc, "ListBucketResult > NextContinuationToken");
      if (!continuationToken) {
        break;
      }
    }

    if (!prefix) {
      state.s3.allKeysByBucket[bucketName] = keys;
    }

    return keys;
  }

  async function deleteFolderPrefix(bucketName, prefix) {
    const keys = await listAllKeysForPrefix(bucketName, prefix);
    for (const key of keys) {
      await api.deleteObject(bucketName, key);
    }
    return keys.length;
  }

  function clearBucketCache(bucketName) {
    const bucketPrefix = `${bucketName}|`;

    for (const key of Object.keys(state.s3.entriesByLocation)) {
      if (key.startsWith(bucketPrefix)) {
        delete state.s3.entriesByLocation[key];
      }
    }

    delete state.s3.allKeysByBucket[bucketName];
  }

  return {
    getFilteredBuckets,
    getSelectedBucket,
    currentPrefixForBucket,
    setCurrentPrefix,
    getListing,
    loadBuckets,
    loadObjectsForBucketPrefix,
    listAllKeysForPrefix,
    deleteFolderPrefix,
    clearBucketCache,
  };
}
