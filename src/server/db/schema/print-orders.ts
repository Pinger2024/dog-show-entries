import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { printOrderStatusEnum, printServiceLevelEnum } from './enums';
import { shows } from './shows';
import { users } from './users';
import { organisations } from './organisations';

// ── Print specs stored as JSONB on each item ──
export interface PrintSpecs {
  [key: string]: string;
}

// ── Print Orders ──

export const printOrders = pgTable(
  'print_orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    showId: uuid('show_id')
      .notNull()
      .references(() => shows.id, { onDelete: 'cascade' }),
    orderedByUserId: uuid('ordered_by_user_id')
      .references(() => users.id, { onDelete: 'set null' }),
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    status: printOrderStatusEnum('status').notNull().default('draft'),

    // Pricing (all in pence)
    subtotalAmount: integer('subtotal_amount').notNull().default(0),
    markupAmount: integer('markup_amount').notNull().default(0),
    totalAmount: integer('total_amount').notNull().default(0),

    // Stripe
    stripePaymentIntentId: text('stripe_payment_intent_id'),
    stripePaymentStatus: text('stripe_payment_status'),

    // Tradeprint
    tradeprintOrderRef: text('tradeprint_order_ref'),
    tradeprintStatus: text('tradeprint_status'),

    // Delivery
    deliveryName: text('delivery_name'),
    deliveryAddress1: text('delivery_address1'),
    deliveryAddress2: text('delivery_address2'),
    deliveryTown: text('delivery_town'),
    deliveryPostcode: text('delivery_postcode'),
    deliveryPhone: text('delivery_phone'),

    // Service
    serviceLevel: printServiceLevelEnum('service_level').notNull().default('standard'),
    estimatedDeliveryDate: date('estimated_delivery_date', { mode: 'string' }),
    trackingNumber: text('tracking_number'),
    trackingUrl: text('tracking_url'),

    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('print_orders_show_id_idx').on(table.showId),
    index('print_orders_organisation_id_idx').on(table.organisationId),
    index('print_orders_status_idx').on(table.status),
    index('print_orders_stripe_pi_idx').on(table.stripePaymentIntentId),
  ]
);

export const printOrdersRelations = relations(printOrders, ({ one, many }) => ({
  show: one(shows, {
    fields: [printOrders.showId],
    references: [shows.id],
  }),
  orderedBy: one(users, {
    fields: [printOrders.orderedByUserId],
    references: [users.id],
  }),
  organisation: one(organisations, {
    fields: [printOrders.organisationId],
    references: [organisations.id],
  }),
  items: many(printOrderItems),
}));

// ── Print Order Items ──

export const printOrderItems = pgTable(
  'print_order_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    printOrderId: uuid('print_order_id')
      .notNull()
      .references(() => printOrders.id, { onDelete: 'cascade' }),

    // Document info
    documentType: text('document_type').notNull(), // catalogue, prize_cards, schedule, ring_board, ring_numbers
    documentFormat: text('document_format'), // standard, by-class, alphabetical (for catalogues)
    documentLabel: text('document_label').notNull(),

    // Tradeprint product
    tradeprintProductId: text('tradeprint_product_id'),
    quantity: integer('quantity').notNull(),

    // PDF storage
    pdfStorageKey: text('pdf_storage_key'),
    pdfPublicUrl: text('pdf_public_url'),
    pdfGeneratedAt: timestamp('pdf_generated_at', { withTimezone: true }),

    // Print specifications
    printSpecs: jsonb('print_specs').$type<PrintSpecs>(),

    // Pricing (all in pence)
    unitTradeCost: integer('unit_trade_cost').notNull().default(0),
    unitSellingPrice: integer('unit_selling_price').notNull().default(0),
    lineTotal: integer('line_total').notNull().default(0),

    tradeprintItemRef: text('tradeprint_item_ref'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('print_order_items_order_id_idx').on(table.printOrderId),
  ]
);

export const printOrderItemsRelations = relations(printOrderItems, ({ one }) => ({
  printOrder: one(printOrders, {
    fields: [printOrderItems.printOrderId],
    references: [printOrders.id],
  }),
}));
