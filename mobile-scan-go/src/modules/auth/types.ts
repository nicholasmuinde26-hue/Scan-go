export type Customer = { id: string; name: string; phone: string; email?: string; avatarUrl?: string; googleId?: string; role: 'CUSTOMER'; tripsCompleted: number; cleanTrips: number; confirmedDiscrepancies?: number; totalSpentMinor?: number };
export type AuthResult = { success: true; token: string; refreshToken: string; user: Customer };
