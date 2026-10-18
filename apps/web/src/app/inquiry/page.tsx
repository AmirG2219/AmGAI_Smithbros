import Script from "next/script";

// Internal demo of the website widget drawn inline (the real site normally opens it as a pop-up).
export default function InquiryDemo() {
  return (
    <main className="min-h-screen bg-walnut px-4 py-10">
      <div id="smithbros-estimate-form" />
      <Script src="/embed.js" strategy="afterInteractive" />
    </main>
  );
}
