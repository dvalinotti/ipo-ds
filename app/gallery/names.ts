/** Gallery states in cycle order; app/gallery/states.tsx builds one per name. */
export const GALLERY_STATES = ["main", "artists", "album", "scanning", "empty", "stress", "loading", "gels", "search"] as const;
export type GalleryStateName = (typeof GALLERY_STATES)[number];
