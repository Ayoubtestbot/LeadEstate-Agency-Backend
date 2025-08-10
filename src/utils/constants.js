// User roles
const USER_ROLES = {
  MANAGER: 'manager',
  SUPER_AGENT: 'super_agent',
  AGENT: 'agent',
};

// Lead statuses
const LEAD_STATUS = {
  NEW: 'new',
  CONTACTED: 'contacted',
  QUALIFIED: 'qualified',
  PROPOSAL: 'proposal',
  NEGOTIATION: 'negotiation',
  CLOSED_WON: 'closed_won',
  CLOSED_LOST: 'closed_lost',
};

// Lead sources
const LEAD_SOURCES = {
  WEBSITE: 'website',
  REFERRAL: 'referral',
  SOCIAL_MEDIA: 'social_media',
  EMAIL_CAMPAIGN: 'email_campaign',
  PHONE_CALL: 'phone_call',
  WALK_IN: 'walk_in',
  OTHER: 'other',
};

// Property types
const PROPERTY_TYPES = {
  APARTMENT: 'apartment',
  HOUSE: 'house',
  CONDO: 'condo',
  TOWNHOUSE: 'townhouse',
  VILLA: 'villa',
  STUDIO: 'studio',
  PENTHOUSE: 'penthouse',
  COMMERCIAL: 'commercial',
  LAND: 'land',
  OTHER: 'other',
};

// Property statuses
const PROPERTY_STATUS = {
  AVAILABLE: 'available',
  SOLD: 'sold',
  RENTED: 'rented',
  PENDING: 'pending',
  OFF_MARKET: 'off_market',
};

// Transaction types
const TRANSACTION_TYPES = {
  SALE: 'sale',
  RENT: 'rent',
  LEASE: 'lease',
};

// Follow-up types
const FOLLOW_UP_TYPES = {
  CALL: 'call',
  EMAIL: 'email',
  WHATSAPP: 'whatsapp',
  MEETING: 'meeting',
  PROPERTY_VISIT: 'property_visit',
  DOCUMENT_REVIEW: 'document_review',
  OTHER: 'other',
};

// Follow-up priorities
const FOLLOW_UP_PRIORITIES = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent',
};

// Activity types
const ACTIVITY_TYPES = {
  LEAD_CREATED: 'lead_created',
  LEAD_UPDATED: 'lead_updated',
  LEAD_ASSIGNED: 'lead_assigned',
  LEAD_STATUS_CHANGED: 'lead_status_changed',
  PROPERTY_CREATED: 'property_created',
  PROPERTY_UPDATED: 'property_updated',
  FOLLOW_UP_CREATED: 'follow_up_created',
  FOLLOW_UP_COMPLETED: 'follow_up_completed',
  EMAIL_SENT: 'email_sent',
  WHATSAPP_SENT: 'whatsapp_sent',
  CALL_MADE: 'call_made',
  MEETING_SCHEDULED: 'meeting_scheduled',
  DOCUMENT_UPLOADED: 'document_uploaded',
  NOTE_ADDED: 'note_added',
  USER_LOGIN: 'user_login',
  USER_LOGOUT: 'user_logout',
};

// Integration types
const INTEGRATION_TYPES = {
  EMAIL: 'email',
  WHATSAPP: 'whatsapp',
  GOOGLE_SHEETS: 'google_sheets',
  ZAPIER: 'zapier',
  WEBHOOK: 'webhook',
};

// Notification types
const NOTIFICATION_TYPES = {
  LEAD_ASSIGNED: 'lead_assigned',
  FOLLOW_UP_DUE: 'follow_up_due',
  PROPERTY_INQUIRY: 'property_inquiry',
  SYSTEM_ALERT: 'system_alert',
  WELCOME: 'welcome',
  PASSWORD_RESET: 'password_reset',
};

// File types
const ALLOWED_FILE_TYPES = {
  IMAGES: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
  DOCUMENTS: ['pdf', 'doc', 'docx', 'txt'],
  SPREADSHEETS: ['xls', 'xlsx', 'csv'],
};

// File size limits (in bytes)
const FILE_SIZE_LIMITS = {
  IMAGE: 5 * 1024 * 1024, // 5MB
  DOCUMENT: 10 * 1024 * 1024, // 10MB
  AVATAR: 2 * 1024 * 1024, // 2MB
};

// API rate limits
const RATE_LIMITS = {
  GENERAL: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
  },
  AUTH: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 auth requests per windowMs
  },
  EMAIL: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 50, // limit each IP to 50 email requests per hour
  },
};

// Pagination defaults
const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
};

// Date formats
const DATE_FORMATS = {
  ISO: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
  DATE_ONLY: 'YYYY-MM-DD',
  TIME_ONLY: 'HH:mm:ss',
  DISPLAY: 'MMM DD, YYYY',
  DISPLAY_WITH_TIME: 'MMM DD, YYYY HH:mm',
};

// Supported languages
const SUPPORTED_LANGUAGES = {
  EN: 'en',
  FR: 'fr',
};

// Currency codes
const CURRENCIES = {
  USD: 'USD',
  EUR: 'EUR',
  GBP: 'GBP',
  CAD: 'CAD',
  AUD: 'AUD',
  MAD: 'MAD', // Moroccan Dirham
};

// Time zones
const TIMEZONES = {
  UTC: 'UTC',
  EST: 'America/New_York',
  PST: 'America/Los_Angeles',
  GMT: 'Europe/London',
  CET: 'Europe/Paris',
  CASABLANCA: 'Africa/Casablanca',
};

// HTTP status codes
const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

// Error codes
const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  NOT_FOUND_ERROR: 'NOT_FOUND_ERROR',
  DUPLICATE_ERROR: 'DUPLICATE_ERROR',
  RATE_LIMIT_ERROR: 'RATE_LIMIT_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
};

// Email templates
const EMAIL_TEMPLATES = {
  WELCOME: 'welcome',
  PASSWORD_RESET: 'password_reset',
  LEAD_ASSIGNMENT: 'lead_assignment',
  FOLLOW_UP_REMINDER: 'follow_up_reminder',
  PROPERTY_ALERT: 'property_alert',
  SYSTEM_NOTIFICATION: 'system_notification',
};

// WhatsApp message templates
const WHATSAPP_TEMPLATES = {
  PROPERTY_DETAILS: 'property_details',
  APPOINTMENT_CONFIRMATION: 'appointment_confirmation',
  FOLLOW_UP_MESSAGE: 'follow_up_message',
  WELCOME_MESSAGE: 'welcome_message',
};

module.exports = {
  USER_ROLES,
  LEAD_STATUS,
  LEAD_SOURCES,
  PROPERTY_TYPES,
  PROPERTY_STATUS,
  TRANSACTION_TYPES,
  FOLLOW_UP_TYPES,
  FOLLOW_UP_PRIORITIES,
  ACTIVITY_TYPES,
  INTEGRATION_TYPES,
  NOTIFICATION_TYPES,
  ALLOWED_FILE_TYPES,
  FILE_SIZE_LIMITS,
  RATE_LIMITS,
  PAGINATION,
  DATE_FORMATS,
  SUPPORTED_LANGUAGES,
  CURRENCIES,
  TIMEZONES,
  HTTP_STATUS,
  ERROR_CODES,
  EMAIL_TEMPLATES,
  WHATSAPP_TEMPLATES,
};
