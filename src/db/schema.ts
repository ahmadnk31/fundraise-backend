import { pgTable, text, uuid, timestamp, integer, boolean, decimal, jsonb } from 'drizzle-orm/pg-core';
import { sql, relations } from 'drizzle-orm';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  email: text('email').notNull().unique(),
  password: text('password').notNull(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  avatar: text('avatar'),
  isVerified: boolean('is_verified').default(false).notNull(),
  verificationToken: text('verification_token'),
  resetPasswordToken: text('reset_password_token'),
  resetPasswordExpires: timestamp('reset_password_expires'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const campaigns = pgTable('campaigns', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  title: text('title').notNull(),
  slug: text('slug').notNull().unique(),
  summary: text('summary').notNull(),
  story: text('story').notNull(),
  category: text('category').notNull(),
  location: text('location'),
  goalAmount: decimal('goal_amount', { precision: 12, scale: 2 }).notNull(),
  currentAmount: decimal('current_amount', { precision: 12, scale: 2 }).default('0.00').notNull(),
  availableBalance: decimal('available_balance', { precision: 12, scale: 2 }).default('0.00').notNull(),
  paidOut: decimal('paid_out', { precision: 12, scale: 2 }).default('0.00').notNull(),
  currency: text('currency').default('USD').notNull(),
  deadline: timestamp('deadline'),
  budgetBreakdown: text('budget_breakdown'),
  coverImage: text('cover_image'),
  additionalMedia: jsonb('additional_media').$type<string[]>().default([]),
  stripeConnectAccountId: text('stripe_connect_account_id'),
  payoutSchedule: text('payout_schedule').default('manual'), // manual, weekly, monthly
  isActive: boolean('is_active').default(true).notNull(),
  isFeatured: boolean('is_featured').default(false).notNull(),
  isApproved: boolean('is_approved').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const donations = pgTable('donations', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),
  donorId: uuid('donor_id').references(() => users.id, { onDelete: 'set null' }),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  currency: text('currency').default('USD').notNull(),
  donorName: text('donor_name'),
  donorEmail: text('donor_email'),
  message: text('message'),
  isAnonymous: boolean('is_anonymous').default(false).notNull(),
  paymentMethod: text('payment_method').notNull(),
  paymentIntentId: text('payment_intent_id'),
  status: text('status').notNull().default('pending'), // pending, completed, failed, refunded
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const campaignUpdates = pgTable('campaign_updates', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  images: jsonb('images').$type<string[]>().default([]),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const comments = pgTable('comments', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  content: text('content').notNull(),
  parentId: uuid('parent_id'),
  isApproved: boolean('is_approved').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const likes = pgTable('likes', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const follows = pgTable('follows', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const payouts = pgTable('payouts', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  platformFee: decimal('platform_fee', { precision: 10, scale: 2 }).notNull(),
  processingFee: decimal('processing_fee', { precision: 10, scale: 2 }).notNull(),
  netAmount: decimal('net_amount', { precision: 12, scale: 2 }).notNull(),
  currency: text('currency').default('USD').notNull(),
  status: text('status').notNull().default('pending'), // pending, processing, completed, failed
  stripeTransferId: text('stripe_transfer_id'),
  bankAccount: jsonb('bank_account').$type<{
    accountNumber: string;
    routingNumber: string;
    bankName: string;
    accountType: 'checking' | 'savings';
  }>(),
  paypalEmail: text('paypal_email'),
  paymentMethod: text('payment_method').notNull(), // stripe, paypal, bank_transfer
  requestedAt: timestamp('requested_at').defaultNow().notNull(),
  processedAt: timestamp('processed_at'),
  completedAt: timestamp('completed_at'),
  failureReason: text('failure_reason'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const platformSettings = pgTable('platform_settings', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  key: text('key').notNull().unique(),
  value: text('value').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),
  donationId: uuid('donation_id').references(() => donations.id, { onDelete: 'cascade' }),
  payoutId: uuid('payout_id').references(() => payouts.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // donation, payout, refund, chargeback, platform_fee
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  platformFee: decimal('platform_fee', { precision: 10, scale: 2 }).default('0.00').notNull(),
  processingFee: decimal('processing_fee', { precision: 10, scale: 2 }).default('0.00').notNull(),
  netAmount: decimal('net_amount', { precision: 12, scale: 2 }).notNull(),
  currency: text('currency').default('USD').notNull(),
  status: text('status').notNull(),
  description: text('description'),
  metadata: jsonb('metadata').$type<Record<string, any>>().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Types for TypeScript
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Campaign = typeof campaigns.$inferSelect;
export type NewCampaign = typeof campaigns.$inferInsert;

export type Donation = typeof donations.$inferSelect;
export type NewDonation = typeof donations.$inferInsert;

export type CampaignUpdate = typeof campaignUpdates.$inferSelect;
export type NewCampaignUpdate = typeof campaignUpdates.$inferInsert;

export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;

export type Like = typeof likes.$inferSelect;
export type NewLike = typeof likes.$inferInsert;

export type Follow = typeof follows.$inferSelect;
export type NewFollow = typeof follows.$inferInsert;

export type Payout = typeof payouts.$inferSelect;
export type NewPayout = typeof payouts.$inferInsert;

export type PlatformSetting = typeof platformSettings.$inferSelect;
export type NewPlatformSetting = typeof platformSettings.$inferInsert;

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;

// Define relations
export const usersRelations = relations(users, ({ many }) => ({
  campaigns: many(campaigns),
  donations: many(donations),
  comments: many(comments),
  likes: many(likes),
  follows: many(follows),
  payouts: many(payouts),
}));

export const campaignsRelations = relations(campaigns, ({ one, many }) => ({
  user: one(users, {
    fields: [campaigns.userId],
    references: [users.id],
  }),
  donations: many(donations),
  updates: many(campaignUpdates),
  comments: many(comments),
  likes: many(likes),
  follows: many(follows),
  payouts: many(payouts),
  transactions: many(transactions),
}));

export const donationsRelations = relations(donations, ({ one }) => ({
  campaign: one(campaigns, {
    fields: [donations.campaignId],
    references: [campaigns.id],
  }),
  donor: one(users, {
    fields: [donations.donorId],
    references: [users.id],
  }),
}));

export const campaignUpdatesRelations = relations(campaignUpdates, ({ one }) => ({
  campaign: one(campaigns, {
    fields: [campaignUpdates.campaignId],
    references: [campaigns.id],
  }),
}));

export const commentsRelations = relations(comments, ({ one, many }) => ({
  campaign: one(campaigns, {
    fields: [comments.campaignId],
    references: [campaigns.id],
  }),
  user: one(users, {
    fields: [comments.userId],
    references: [users.id],
  }),
  parent: one(comments, {
    fields: [comments.parentId],
    references: [comments.id],
  }),
  replies: many(comments),
}));

export const likesRelations = relations(likes, ({ one }) => ({
  campaign: one(campaigns, {
    fields: [likes.campaignId],
    references: [campaigns.id],
  }),
  user: one(users, {
    fields: [likes.userId],
    references: [users.id],
  }),
}));

export const followsRelations = relations(follows, ({ one }) => ({
  campaign: one(campaigns, {
    fields: [follows.campaignId],
    references: [campaigns.id],
  }),
  user: one(users, {
    fields: [follows.userId],
    references: [users.id],
  }),
}));

export const payoutsRelations = relations(payouts, ({ one, many }) => ({
  campaign: one(campaigns, {
    fields: [payouts.campaignId],
    references: [campaigns.id],
  }),
  user: one(users, {
    fields: [payouts.userId],
    references: [users.id],
  }),
  transactions: many(transactions),
}));

export const reports = pgTable('reports', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),
  reporterId: uuid('reporter_id').references(() => users.id, { onDelete: 'set null' }),
  reason: text('reason').notNull(), // spam, inappropriate, fraud, other
  description: text('description').notNull(),
  status: text('status').default('pending').notNull(), // pending, reviewed, resolved, dismissed
  adminNotes: text('admin_notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const transactionsRelations = relations(transactions, ({ one }) => ({
  campaign: one(campaigns, {
    fields: [transactions.campaignId],
    references: [campaigns.id],
  }),
  donation: one(donations, {
    fields: [transactions.donationId],
    references: [donations.id],
  }),
  payout: one(payouts, {
    fields: [transactions.payoutId],
    references: [payouts.id],
  }),
}));

export const reportsRelations = relations(reports, ({ one }) => ({
  campaign: one(campaigns, {
    fields: [reports.campaignId],
    references: [campaigns.id],
  }),
  reporter: one(users, {
    fields: [reports.reporterId],
    references: [users.id],
  }),
}));
