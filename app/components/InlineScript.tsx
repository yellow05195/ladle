"use client";

/**
 * An inline script that runs while the HTML is parsed (before the first
 * paint), as the Next.js guide on preventing flash recommends: text/javascript
 * on the server, text/plain on the client, so React neither warns nor runs it twice.
 */
export function InlineScript({ html }: { html: string }) {
  return <script type={typeof window === "undefined" ? "text/javascript" : "text/plain"} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: html }} />;
}
