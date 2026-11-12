import { z } from 'zod';

// Common validation patterns
export const phoneSchema = z.string().regex(/^254\d{9}$/, 'Phone must be in format 2547XXXXXXXX');
export const minorAmountSchema = z.number().int().min(0, 'Amount must be non-negative');
export const barcodeSchema = z.string().min(1, 'Barcode is required').max(50);
export const storeIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid store ID format');
export const organizationIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid organization ID format');

// User validation schemas
export const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  phone: phoneSchema,
  email: z.string().email('Invalid email format').optional(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['CUSTOMER', 'PICKER', 'EXIT_STAFF', 'SUPERVISOR', 'STORE_MANAGER', 'ORG_ADMIN', 'SYSTEM_ADMIN']).optional(),
  storeId: storeIdSchema.optional(),
  organizationId: organizationIdSchema.optional(),
});

export const loginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1, 'Password is required'),
});

// Store validation schemas
export const createStoreSchema = z.object({
  name: z.string().min(2, 'Store name must be at least 2 characters').max(100),
  code: z.string().min(2, 'Store code must be at least 2 characters').max(20).toUpperCase(),
  location: z.string().min(2, 'Location is required').max(200),
  organizationId: organizationIdSchema.optional(),
  managerId: storeIdSchema.optional(),
  pickupSlots: z.array(z.object({
    slotId: z.string(),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:MM format'),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:MM format'),
    capacity: z.number().int().min(1, 'Capacity must be at least 1'),
    active: z.boolean().default(true),
  })).optional(),
  exitLanes: z.array(z.object({
    laneId: z.string(),
    name: z.string(),
    active: z.boolean().default(true),
  })).optional(),
  fraudConfig: z.object({
    largeBasketMinor: minorAmountSchema.default(1000000),
    mediumBasketMinor: minorAmountSchema.default(500000),
    fullCheckBasketMinor: minorAmountSchema.default(1500000),
    maxItemsWithoutFullCheck: z.number().int().min(0).default(25),
    manualEntryAmberThreshold: z.number().int().min(0).default(4),
    randomAuditPercentage: z.number().min(0).max(100).default(5),
    amberScoreThreshold: z.number().min(0).max(100).default(30),
    amberFullScoreThreshold: z.number().min(0).max(100).default(60),
    amberTimeoutSeconds: z.number().int().min(0).default(15),
  }).optional(),
});

export const updateStoreSchema = createStoreSchema.partial();

// Organization validation schemas
export const createOrganizationSchema = z.object({
  name: z.string().min(2, 'Organization name must be at least 2 characters').max(100),
  slug: z.string().min(2, 'Slug must be at least 2 characters').max(50).regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens'),
  contactEmail: z.string().email('Invalid email format').optional(),
  contactPhone: phoneSchema.optional(),
  planCode: z.string().regex(/^[A-Z][A-Z0-9_]{1,31}$/).default('FREE'),
  billingInterval: z.enum(['MONTHLY', 'ANNUAL']).default('MONTHLY'),
  admin: z.object({
    name: z.string().min(2, 'Admin name must be at least 2 characters'),
    phone: phoneSchema,
    email: z.string().email('Invalid email format').optional(),
  }).optional(),
});

export const updateOrganizationSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: phoneSchema.optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
});

// Product validation schemas
export const createProductSchema = z.object({
  name: z.string().min(2, 'Product name must be at least 2 characters').max(200),
  barcode: barcodeSchema,
  category: z.string().min(1, 'Category is required').max(100),
  priceMinor: minorAmountSchema,
  storeId: storeIdSchema,
  isWeighted: z.boolean().default(false),
  highTheft: z.boolean().default(false),
  active: z.boolean().default(true),
  description: z.string().max(500).optional(),
  imageUrl: z.string().url().optional(),
});

export const updateProductSchema = createProductSchema.partial().extend({
  priceMinor: minorAmountSchema.optional(),
});

// Order validation schemas
export const createOrderSchema = z.object({
  customerId: storeIdSchema,
  storeId: storeIdSchema,
  orderType: z.enum(['SCAN_AND_GO', 'CLICK_AND_COLLECT']),
  items: z.array(z.object({
    productId: storeIdSchema,
    barcode: barcodeSchema,
    productName: z.string(),
    quantity: z.number().int().min(1, 'Quantity must be at least 1'),
    priceMinor: minorAmountSchema,
    isWeighted: z.boolean().default(false),
    weightGrams: z.number().int().min(0).optional(),
  })).min(1, 'Order must have at least one item'),
  subtotalMinor: minorAmountSchema,
  totalMinor: minorAmountSchema,
  pickupSlotId: z.string().optional(),
});

// Payment validation schemas
export const stkPushSchema = z.object({
  orderId: storeIdSchema,
  phone: phoneSchema.optional(),
});

export const reconcileSchema = z.object({
  secret: z.string().optional(),
});

// M-Pesa callback validation (for basic structure)
export const mpesaCallbackSchema = z.object({
  Body: z.object({
    stkCallback: z.object({
      MerchantRequestID: z.string(),
      CheckoutRequestID: z.string(),
      ResultCode: z.number(),
      ResultDesc: z.string(),
      CallbackMetadata: z.object({
        Item: z.array(z.object({
          Name: z.string(),
          Value: z.any(),
        })).optional(),
      }).optional(),
    }),
  }),
});

// Picking task validation
export const createPickingTaskSchema = z.object({
  orderId: storeIdSchema,
  storeId: storeIdSchema,
  pickerId: storeIdSchema,
  items: z.array(z.object({
    productId: storeIdSchema,
    barcode: barcodeSchema,
    name: z.string(),
    requiredQuantity: z.number().int().min(1),
    scannedQuantity: z.number().int().min(0).default(0),
    isWeighted: z.boolean().default(false),
    expectedWeightGrams: z.number().int().min(0).optional(),
    isVerified: z.boolean().default(false),
    status: z.enum(['PENDING', 'PICKED', 'VERIFIED', 'MISSING']).default('PENDING'),
  })),
});

// Helper function to validate request body
export function validateBody<T>(schema: z.ZodSchema<T>, data: any): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
    throw new Error(`Validation failed: ${errors}`);
  }
  return result.data;
}

// Helper function to validate query parameters
export function validateQuery<T>(schema: z.ZodSchema<T>, data: any): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
    throw new Error(`Query validation failed: ${errors}`);
  }
  return result.data;
}
