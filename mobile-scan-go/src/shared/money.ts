export const formatKes = (minor: number) => `KES ${(minor / 100).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
