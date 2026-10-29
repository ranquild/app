/** Inline base64 image URIs markdown may embed directly, in addition to regular http(s) images. */
export const DATA_IMAGE_URI_PATTERN =
  /^data:image\/(?:png|jpeg|jpg|gif|svg\+xml|webp);base64,/i;
