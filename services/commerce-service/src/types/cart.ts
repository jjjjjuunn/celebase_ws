export interface CartItem {
  productId: string;
  quantity: number;
}

export interface InstacartCartResult {
  cartId: string;
  checkoutUrl: string;
}

export type CartResult =
  | { source: 'instacart' | 'amazon_fresh' | 'regional'; url: string }
  | { source: 'checklist'; items: CartItem[] };
