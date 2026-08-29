const STUDIO_TRAIT_OPS = {
  favorite: true,
  not_favorite: true,
  rating: true,
  not_rated: true,
  custom_field: true,
};

export function isStudioTraitOp(op) {
  return Object.prototype.hasOwnProperty.call(STUDIO_TRAIT_OPS, op);
}
