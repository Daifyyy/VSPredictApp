/** Never infer a fixture identity from club names, season or league. */
export function fixtureDetailHref(id: number | null | undefined): string | null {
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? `/zapas/${id}` : null;
}
