const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function formatCurrency(amount) {
  return usdFormatter.format(Number(amount) || 0);
}
