export function normalizeSearchTerm(value: string): string {
  return value.trim().toLowerCase();
}

export function filterBySearch<T>(items: T[], search: string, toSearchValue: (item: T) => string): T[] {
  const query = normalizeSearchTerm(search);
  if (!query) return items;
  return items.filter((item) => normalizeSearchTerm(toSearchValue(item)).includes(query));
}
