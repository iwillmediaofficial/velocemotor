export interface Env {
  MEDIA: R2Bucket;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  TURNSTILE_SECRET?: string;
  RESEND_API_KEY?: string;
  PAGES_DEPLOY_HOOK?: string;
  SITE_URL: string;
  MAIL_FROM: string;
  REPLY_TO: string;
  ADMIN_EMAIL: string;
}

export type AppVars = { adminEmail?: string };
