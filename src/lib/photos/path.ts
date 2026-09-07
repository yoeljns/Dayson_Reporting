/** Storage object path for one photo: `<refTable>/<refId>/<documentId>.<ext>`. */
export function extForMime(mime: string) {
  return mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
}
export function photoPath(
  refTable: string,
  refId: string,
  documentId: string,
  mime: string
) {
  return `${refTable}/${refId}/${documentId}.${extForMime(mime)}`;
}
