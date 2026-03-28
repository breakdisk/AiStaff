"use client";

import Script from "next/script";

/**
 * Facebook Customer Chat Plugin (Messenger bubble on landing pages).
 *
 * Requires env vars:
 *   NEXT_PUBLIC_FACEBOOK_APP_ID   — FB OAuth App ID (already set)
 *   NEXT_PUBLIC_FACEBOOK_PAGE_ID  — your FB Page ID (e.g. "123456789012345")
 *
 * Domain must be whitelisted in:
 *   Facebook Page → Settings → Messaging → Add Messenger to your website
 */
export default function FacebookMessengerChat() {
  const appId  = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID;
  const pageId = process.env.NEXT_PUBLIC_FACEBOOK_PAGE_ID;

  if (!appId || !pageId) return null;

  return (
    <>
      {/* SDK root mount point */}
      <div id="fb-root" />

      {/* Customer Chat plugin markup — rendered before SDK loads */}
      <div
        className="fb-customerchat"
        // @ts-expect-error — FB plugin non-standard HTML attributes
        attribution="biz_inbox"
        page_id={pageId}
        theme_color="#fbbf24"
        logged_in_greeting="Hi! How can we help you with AiStaff?"
        logged_out_greeting="Hi! How can we help you with AiStaff?"
      />

      {/* Facebook JS SDK — deferred, non-blocking */}
      <Script
        id="facebook-jssdk"
        strategy="lazyOnload"
        src={`https://connect.facebook.net/en_US/sdk/xfbml.customerchat.js`}
        onLoad={() => {
          // @ts-expect-error — FB global injected by SDK
          window.FB?.init({
            appId,
            autoLogAppEvents: true,
            xfbml:            true,
            version:          "v21.0",
          });
        }}
      />
    </>
  );
}
