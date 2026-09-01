const DIRECT_CART_PATTERN = /(in den warenkorb|zum warenkorb|add to cart)/i;
const GUIDED_ROLL_TYPES = new Set(['rollProduct', 'carpetProduct']);

export function hasCartPurchasePath(pageType, interactiveText) {
  const text = String(interactiveText ?? '');
  if (DIRECT_CART_PATTERN.test(text)) return true;
  return GUIDED_ROLL_TYPES.has(pageType)
    && /länge eingeben/i.test(text)
    && /warenkorb ansehen/i.test(text);
}
